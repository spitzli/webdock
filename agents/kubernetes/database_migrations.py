"""Operator-owned logical transfer job. Only the selected DB/schema is exported."""
import base64
import copy
import json
import re
from pathlib import Path
import databases as db


COUNTS_SQL=r"""SET timezone='UTC';
SET extra_float_digits=3;
SET DateStyle='ISO,YMD';
SET bytea_output='hex';
SELECT pg_catalog.format('SELECT pg_catalog.json_build_array(%L, count(*), pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.row_to_json(t)::text), %L ORDER BY pg_catalog.md5(pg_catalog.row_to_json(t)::text)), %L)))::text FROM %I.%I t', tablename, '', '', schemaname, tablename)
FROM pg_catalog.pg_tables WHERE schemaname='app' ORDER BY tablename COLLATE "C"
\gexec
"""
COPY_SCRIPT="""set -euo pipefail
export PGCONNECT_TIMEOUT=5
PGPASSWORD="$SOURCE_PASSWORD" psql "$SOURCE_DSN" -X -At -v ON_ERROR_STOP=1 -f /copy/counts.sql > /tmp/source-counts
PGPASSWORD="$SOURCE_PASSWORD" pg_dump "$SOURCE_DSN" --format=custom --compress=0 --schema=app --no-owner --no-privileges |
  PGPASSWORD="$TARGET_PASSWORD" pg_restore --dbname="$TARGET_DSN" --no-owner --no-privileges --clean --if-exists --exit-on-error
PGPASSWORD="$TARGET_PASSWORD" psql "$TARGET_DSN" -X -At -v ON_ERROR_STOP=1 -f /copy/counts.sql > /tmp/target-counts
cmp -s /tmp/source-counts /tmp/target-counts
printf '{"copySHA256":"%s"}\\n' "$(sha256sum /tmp/source-counts | cut -d ' ' -f1)"
"""


def validate_migration(p,*,check_lease=True):
    db.validate_packet(p,check_lease=check_lease)
    m=p.get('migration')
    if p['action']!='migrate' or not p['database'] or not isinstance(m,dict) or set(m)!={'id','source','transferPassword','jobUID','copySHA256'}:raise ValueError('Invalid migration packet')
    db.identifier(m['id']);s=m['source'];db.identifier(s['id'])
    if set(s)!={'id','namespace','cnpgUID','host','kind'} or s['id']==p['backend']['id'] or s['namespace']!='wd-db-'+s['id']:raise ValueError('Invalid source installation')
    if s['kind'] not in ['shared-pool','dedicated'] or not isinstance(s['cnpgUID'],str) or not 1<=len(s['cnpgUID'])<=128:raise ValueError('Unconfirmed source installation')
    if not re.fullmatch(r'db-'+s['id']+r'\.(?:[a-z0-9-]+\.)+[a-z]{2,63}',s['host']):raise ValueError('Invalid source hostname')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}',m['transferPassword']):raise ValueError('Invalid transfer credential')
    if m['jobUID'] is not None and (not isinstance(m['jobUID'],str) or not 1<=len(m['jobUID'])<=128):raise ValueError('Invalid migration job identity')
    if m['copySHA256'] is not None and not re.fullmatch(r'[a-f0-9]{64}',m['copySHA256']):raise ValueError('Invalid copy proof')
    return p


def migration_job(p,config,source_ca,target_ca):
    validate_migration(p,check_lease=False);m=p['migration'];b=p['backend'];d=p['database'];name='migration-'+m['id'];ns=b['namespace'];role=db.role_names(d['id'])[1]
    labels={'webdock.dev/database-installation':b['id'],'webdock.dev/database-migration':m['id'],'webdock.dev/operation-id':p['operationID']}
    meta={'name':name,'namespace':ns,'labels':labels}
    source_host='postgres-rw.'+m['source']['namespace']+'.svc';target_host='postgres-rw.'+ns+'.svc'
    dsn=lambda host,ca:f'host={host} port=5432 dbname={d["name"]} user={role} sslmode=verify-full sslrootcert=/copy/{ca}'
    return [
      {'apiVersion':'v1','kind':'Secret','metadata':meta,'type':'Opaque','stringData':{'sourcePassword':m['transferPassword'],'targetPassword':d['credentials']['migrationPassword']}},
      {'apiVersion':'v1','kind':'ConfigMap','metadata':meta,'data':{'counts.sql':COUNTS_SQL,'source-ca.crt':source_ca,'target-ca.crt':target_ca}},
      {'apiVersion':'batch/v1','kind':'Job','metadata':meta,'spec':{'parallelism':1,'completions':1,'backoffLimit':0,'activeDeadlineSeconds':1800,'ttlSecondsAfterFinished':86400,
        'template':{'metadata':{'labels':labels},'spec':{'restartPolicy':'Never','automountServiceAccountToken':False,'nodeSelector':{'kubernetes.io/hostname':b['node']},
         'securityContext':{'runAsNonRoot':True,'runAsUser':26,'runAsGroup':26,'fsGroup':26,'seccompProfile':{'type':'RuntimeDefault'}},
         'containers':[{'name':'copy','image':config['image'],'command':['/bin/bash','-c'],'args':[COPY_SCRIPT],
          'securityContext':{'allowPrivilegeEscalation':False,'readOnlyRootFilesystem':True,'capabilities':{'drop':['ALL']}},
          'resources':{'requests':{'cpu':'100m','memory':'134217728','ephemeral-storage':'67108864'},'limits':{'cpu':'100m','memory':'134217728','ephemeral-storage':'67108864'}},
          'env':[{'name':'SOURCE_DSN','value':dsn(source_host,'source-ca.crt')},{'name':'TARGET_DSN','value':dsn(target_host,'target-ca.crt')},
                 {'name':'SOURCE_PASSWORD','valueFrom':{'secretKeyRef':{'name':name,'key':'sourcePassword'}}},{'name':'TARGET_PASSWORD','valueFrom':{'secretKeyRef':{'name':name,'key':'targetPassword'}}}],
          'volumeMounts':[{'name':'copy','mountPath':'/copy','readOnly':True},{'name':'temporary','mountPath':'/tmp'}]}],
         'volumes':[{'name':'copy','configMap':{'name':name,'defaultMode':292}},{'name':'temporary','emptyDir':{'sizeLimit':'67108864'}}]}}}},
    ]


def source_packet(p):
    source=copy.deepcopy(p);source.pop('migration',None);source['action']='create'
    source['backend'].update(p['migration']['source']);source['database']['kind']='shared' if source['backend']['kind']=='shared-pool' else 'dedicated'
    return source


def execute_migration(p,checkpoint,config):
    validate_migration(p);m=p['migration'];b=p['backend'];d=p['database'];source=source_packet(p);name='migration-'+m['id'];ns=b['namespace']
    source_cluster=db.get('cluster','postgres',source['backend']['namespace']);target_cluster=db.get('cluster','postgres',ns)
    if not source_cluster or not target_cluster:raise ValueError('Migration installation disappeared; no replacement is permitted')
    db.owned(source_cluster,source);db.owned(target_cluster,p)
    uid=target_cluster['metadata']['uid']
    def guard():checkpoint()
    if p['phase']=='apply':
        if not db.database_exists(source):raise ValueError('Source database disappeared')
        checkpoint(phase='applied',cnpgUID=uid);return None
    if p['phase']=='configure':
        if target_cluster.get('status',{}).get('readyInstances',0)!=1:return None
        if db.get('job',name,ns):raise ValueError('An existing migration job requires observation, not replay')
        checkpoint(phase='configuring',cnpgUID=uid)
        # Fence only this customer's sessions. The transfer password never reaches the customer.
        statements=db.sql_configuration(source);guard();db.sql(source,statements['disable'])
        migration=db.role_names(d['id'])[1]
        guard();db.sql(source,f'ALTER ROLE "{migration}" LOGIN PASSWORD \'{db.scram_secret(m["transferPassword"])}\';')
        size=int(db.sql(source,f"SELECT pg_catalog.pg_database_size('{d['name']}')"))
        if size>b['resources']['volumeBytes']*.7:raise ValueError('Source exceeds qualified target headroom')
        target_sql=db.sql_configuration(p);guard();db.sql(p,target_sql['roles'])
        if not db.database_exists(p):guard();db.sql(p,target_sql['create']);guard();db.sql(p,target_sql['mark'])
        guard();db.sql(p,target_sql['database']);guard();db.sql(p,target_sql['schema'],d['name'])
        # Only the private transfer credential can use this temporary, DB-local privilege.
        guard();db.sql(p,f'GRANT CREATE ON DATABASE "{d["name"]}" TO "{migration}";')
        app=db.role_names(d['id'])[2]
        guard();db.sql(p,'BEGIN;'+target_sql['enable']+f'ALTER ROLE "{app}" NOLOGIN; COMMIT;')
        guard();db.kubectl('patch','cluster','postgres','-n',ns,'--type=merge','-p',json.dumps({'spec':{'postgresql':{'pg_hba':db.hba(p)}}}))
        labels={'webdock.dev/database-installation':b['id'],'webdock.dev/database-migration':m['id']}
        ingress={'apiVersion':'networking.k8s.io/v1','kind':'NetworkPolicy','metadata':{'name':name,'namespace':source['backend']['namespace'],'labels':{**labels,'webdock.dev/database-installation':source['backend']['id']}},
          'spec':{'podSelector':{},'policyTypes':['Ingress'],'ingress':[{'from':[{'namespaceSelector':{'matchLabels':{'kubernetes.io/metadata.name':ns}}}],'ports':[{'protocol':'TCP','port':5432}]}]}}
        egress={'apiVersion':'networking.k8s.io/v1','kind':'NetworkPolicy','metadata':{'name':name,'namespace':ns,'labels':labels},
          'spec':{'podSelector':{'matchLabels':{'webdock.dev/database-migration':m['id']}},'policyTypes':['Egress'],'egress':[{'to':[{'namespaceSelector':{'matchLabels':{'kubernetes.io/metadata.name':source['backend']['namespace']}}}],'ports':[{'protocol':'TCP','port':5432}]}]}}
        db.apply(ingress,source,guard);db.apply(egress,p,guard)
        source_ca=db.get('secret','server-ca',source['backend']['namespace']);db.owned(source_ca,source)
        objects=migration_job(p,config,base64.b64decode(source_ca['data']['ca.crt']).decode(),Path(config['caFile']).read_text())
        for obj in objects:db.apply(obj,p,guard)
        job=db.get('job',name,ns)
        checkpoint(phase='observing',cnpgUID=uid,migrationJobUID=job['metadata']['uid']);return None
    if p['phase']!='observe':raise ValueError('Uncertain migration requires operator review')
    job=db.get('job',name,ns)
    if not job or job['metadata'].get('labels',{}).get('webdock.dev/operation-id')!=p['operationID']:raise ValueError('Migration job ownership changed')
    db.owned(job,p)
    if m['jobUID'] and job['metadata']['uid']!=m['jobUID']:raise ValueError('Migration job UID changed')
    if job.get('status',{}).get('failed',0):raise ValueError('Logical transfer failed; source remains fenced and retained')
    if job.get('status',{}).get('succeeded',0)!=1:return None
    if not m['copySHA256']:
        logs=db.kubectl('logs','job/'+name,'-n',ns,'-c','copy','--tail=1')
        proof=json.loads(logs)
        if set(proof)!={'copySHA256'} or not re.fullmatch(r'[a-f0-9]{64}',proof['copySHA256']):raise ValueError('Missing logical copy integrity proof')
        # Idempotent finalization after the unique Job succeeded; never rerun the import.
        if not (source['backend']['kind']=='dedicated' and source_cluster['metadata'].get('annotations',{}).get('cnpg.io/hibernation')=='on' and not db.volume_users(source['backend']['namespace'])):
            guard();db.sql(source,db.sql_configuration(source)['disable'])
        _,migration,app=db.role_names(d['id']);guard()
        db.sql(p,db.sql_configuration(p)['schema'],d['name'])
        guard();db.sql(p,f'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO "{app}"; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA app TO "{app}";',d['name'])
        guard();db.sql(p,f'REVOKE CREATE ON DATABASE "{d["name"]}" FROM "{migration}"; ALTER ROLE "{app}" LOGIN;')
        if source['backend']['kind']=='dedicated':
            guard();db.kubectl('annotate','cluster','postgres','-n',source['backend']['namespace'],'cnpg.io/hibernation=on','--overwrite')
        checkpoint(phase='observing',cnpgUID=uid,migrationJobUID=job['metadata']['uid'],copySHA256=proof['copySHA256']);return None
    if not db.runtime_ready(p,target_cluster,db.get('pod','postgres-1',ns),config) or not db.verify_database_logins(p):return None
    if not db.endpoints_ready(p) or not all(db.verify_endpoint_tls(b['host'],port,config['caFile']) for port in [b['directPort'],b['pooledPort']]):return None
    for kind,namespace,owner in [('Secret',ns,p),('ConfigMap',ns,p),('NetworkPolicy',ns,p),('NetworkPolicy',source['backend']['namespace'],source)]:
        obj=db.get(kind,name,namespace)
        if obj:db.delete_owned(obj,owner,guard)
    return {'installationID':b['id'],'databaseID':d['id'],'cnpgUID':uid,'revision':p['revision'],'state':'ready','endpointReady':True,'copySHA256':m['copySHA256']}
