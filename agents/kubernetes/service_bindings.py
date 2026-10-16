"""Managed application service access: fixed destinations and read-only CA files."""
import base64
import re
import ssl
import ipaddress


def validate(p):
    if 'serviceBindingsVersion' not in p and 'serviceBindings' not in p:
        return
    rows=p.get('serviceBindings')
    if p.get('serviceBindingsVersion')!=1 or not isinstance(rows,list) or len(rows)>16:
        raise ValueError('Invalid service bindings')
    seen=set()
    for row in rows:
        mail=row.get('kind')=='mail'
        expected={'id','revision','kind','egressCIDRs'} if mail else {'id','revision','backendID','caCertificate'}
        if set(row)!=expected:raise ValueError('Invalid service binding fields')
        for key in (('id',) if mail else ('id','backendID')):
            if not isinstance(row[key],str) or not re.fullmatch(r'[1-9][0-9]{0,18}',row[key]):raise ValueError('Invalid service identity')
        if row['id'] in seen or type(row['revision']) is not int or row['revision']<1:raise ValueError('Invalid service revision')
        seen.add(row['id'])
        if mail:
            cidrs=row['egressCIDRs']
            if not isinstance(cidrs,list) or not 1<=len(cidrs)<=8:raise ValueError('Invalid mail destinations')
            for value in cidrs:
                network=ipaddress.ip_network(value,strict=True)
                if network.prefixlen!=network.max_prefixlen or network.network_address.is_loopback or network.network_address.is_unspecified or network.network_address.is_multicast:raise ValueError('Invalid mail destination')
        else:
            if not isinstance(row['caCertificate'],str) or len(row['caCertificate'].encode())>16384:raise ValueError('Invalid service certificate')
            ssl.PEM_cert_to_DER_cert(row['caCertificate'])


def secret_name(p):
    return 'app-'+p['appID']+'-services-'+str(p['revision'])


def manifests(p):
    validate(p)
    rows=p.get('serviceBindings',[])
    postgres=[r for r in rows if 'backendID' in r]
    mail=[r for r in rows if r.get('kind')=='mail']
    labels={'security.webdock.dev/managed-by':'webdock','webdock.dev/project-id':p['projectID'],'webdock.dev/cluster-id':p['clusterID'],'webdock.dev/app-id':p['appID']}
    metadata={'namespace':p['namespace'],'labels':labels}
    secret={'apiVersion':'v1','kind':'Secret','metadata':{**metadata,'name':secret_name(p)},'type':'Opaque','immutable':True,'data':{'binding-'+r['id']+'.crt':base64.b64encode(r['caCertificate'].encode()).decode() for r in postgres}} if postgres else None
    policy={'apiVersion':'networking.k8s.io/v1','kind':'NetworkPolicy','metadata':{**metadata,'name':'app-'+p['appID']+'-services'},'spec':{'podSelector':{'matchLabels':{'webdock.dev/app-id':p['appID']}},'policyTypes':['Egress'],'egress':[{'to':[{'namespaceSelector':{'matchLabels':{'kubernetes.io/metadata.name':'wd-db-'+backend}},'podSelector':{'matchLabels':{'cnpg.io/cluster':'postgres'}}}],'ports':[{'protocol':'TCP','port':5432}]} for backend in sorted({r['backendID'] for r in postgres})]}}
    for row in mail:policy['spec']['egress'].append({'to':[{'ipBlock':{'cidr':cidr}} for cidr in row['egressCIDRs']],'ports':[{'protocol':'TCP','port':443}]})
    return secret,policy


def mount(p,pod):
    rows=[r for r in p.get('serviceBindings',[]) if 'backendID' in r]
    if not rows:return
    pod['volumes'].append({'name':'services','secret':{'secretName':secret_name(p),'items':[{'key':'binding-'+r['id']+'.crt','path':r['id']+'/ca.crt'} for r in rows]}})
    pod['containers'][0]['volumeMounts'].append({'name':'services','mountPath':'/var/run/webdock/services','readOnly':True})


def references(objects):
    result=set()
    for obj in objects:
        spec=obj.get('spec',{})
        spec=spec.get('template',{}).get('spec',spec)
        for volume in spec.get('volumes',[]):
            name=volume.get('secret',{}).get('secretName')
            if name:result.add(name)
    return result


def apply_and_verify(p,apply,get,check_owner):
    if p.get('serviceBindingsVersion')!=1:return
    secret,policy=manifests(p)
    for obj in ([secret] if secret else [])+[policy]:
        existing=get(obj['kind'],obj['metadata']['name'],p['namespace'])
        if existing:check_owner(existing,p,True)
        apply(obj,p)
        observed=get(obj['kind'],obj['metadata']['name'],p['namespace'])
        if not observed:raise ValueError('Service resource was not observed')
        check_owner(observed,p,True)
        field='data' if obj['kind']=='Secret' else 'spec'
        if observed.get(field)!=obj[field]:raise ValueError('Service resource differs from requested state')
