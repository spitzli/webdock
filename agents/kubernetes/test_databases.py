import copy
import subprocess
from types import SimpleNamespace
from datetime import datetime,timedelta,timezone
from unittest import TestCase
from databases import validate_packet,backend_manifests,role_names,sql_configuration,hba,execute_database
from unittest.mock import patch
import databases as db


def packet():
    return {'version':1,'operationID':'901','generation':1,'leaseToken':'a'*64,
      'leaseUntil':(datetime.now(timezone.utc)+timedelta(minutes=3)).isoformat(),'clusterID':'456','action':'create','phase':'apply','revision':1,
      'backend':{'id':'125','kind':'shared-pool','namespace':'wd-db-125','node':'postgres-pilot','poolID':'bd0ba8e4-e801-4c16-bf1b-060129437ccb','revision':1,'cnpgUID':None,'resources':{'cpuMillicores':1000,'memoryBytes':2147483648,'volumeBytes':32212254720},'host':'db-125.example.invalid','directPort':32000,'pooledPort':32001},
      'database':{'id':'300','kind':'shared','name':'db_300','revision':1,'credentialRevision':1,'connectionLimit':10,'credentials':{'migrationPassword':'a'*43,'applicationPassword':'b'*43}},
      'members':[{'id':'300','projectID':'400','databaseName':'db_300','enabled':True}]}


class DatabaseTests(TestCase):
    def test_sql_exec_can_exceed_metadata_deadline_without_exposing_statement(self):
        statement="SELECT 'private-sql-canary';";calls=[]
        def run(command,**kwargs):
            calls.append((command,kwargs))
            if command[2]=='exec' and kwargs['timeout']<30:
                raise subprocess.TimeoutExpired(command,kwargs['timeout'])
            self.assertNotIn(statement,' '.join(command))
            self.assertTrue(kwargs['capture_output'])
            return SimpleNamespace(returncode=0,stdout='1\n',stderr='private-stderr-canary')
        with patch.object(db.subprocess,'run',side_effect=run):
            self.assertEqual(db.sql(packet(),statement),'1')
            db.kubectl('get','cluster','postgres')
        self.assertEqual([call[1]['timeout'] for call in calls],[60,25])
        self.assertEqual(calls[0][1]['input'],statement)

    def configure(self,expire_locally=True,deny_guard=None):
        p=packet();p['phase']='configure';p['backend']['cnpgUID']='original'
        start=datetime.now(timezone.utc);p['leaseUntil']=(start+timedelta(seconds=10)).isoformat()
        clock=SimpleNamespace(value=start,server_expiry=start+timedelta(seconds=10),guards=0)
        class Clock(datetime):
            @classmethod
            def now(cls,tz=None):return clock.value
        original_lease=p['leaseUntil'];self.events=[];self.statements=[]
        def checkpoint(**value):
            self.events.append('checkpoint' if value else 'guard')
            if value.get('phase')=='configuring':
                if expire_locally:clock.value=start+timedelta(seconds=20)
                clock.server_expiry=clock.value+timedelta(seconds=300)
            if not value:
                clock.guards+=1
                if clock.guards==deny_guard or clock.value>=clock.server_expiry:raise PermissionError('Server lease revoked or expired')
            return {'accepted':True}
        def sql(value,statement,database='postgres'):
            self.statements.append(statement)
            if not statement.startswith('SELECT '):self.assertEqual(self.events[-1],'guard','Every separate SQL mutation needs fresh authority')
            self.events.append('read' if statement.startswith('SELECT ') else 'sql')
            return ''
        def kubectl(*args,**kwargs):
            self.assertEqual(self.events[-1],'guard');self.events.append('kubectl')
        cluster={'kind':'Cluster','metadata':{'uid':'original','labels':{'webdock.dev/database-installation':'125'}},'status':{'readyInstances':1}}
        with patch.object(db,'datetime',Clock),patch.object(db,'configuration',return_value={}),patch.object(db,'get',return_value=cluster),patch.object(db,'sql',side_effect=sql),patch.object(db,'kubectl',side_effect=kubectl),patch.object(db,'endpoint_services',return_value=True):
            result=execute_database(p,checkpoint)
        self.assertEqual(p['leaseUntil'],original_lease)
        return result

    def test_accepted_server_renewal_outlives_captured_local_deadline(self):
        self.assertIsNone(self.configure())
        self.assertTrue(any(statement.startswith('CREATE DATABASE') for statement in self.statements))
        self.assertEqual(self.events[-1],'checkpoint')

    def test_each_separate_sql_mutation_has_a_fresh_server_guard(self):
        self.assertIsNone(self.configure(expire_locally=False))

    def test_server_rejection_prevents_first_sql_even_after_local_renewal(self):
        with self.assertRaises(PermissionError):self.configure(deny_guard=1)
        self.assertEqual(self.statements,[])

    def test_server_revocation_after_create_prevents_following_mark(self):
        with self.assertRaises(PermissionError):self.configure(expire_locally=False,deny_guard=3)
        self.assertTrue(any(statement.startswith('CREATE DATABASE') for statement in self.statements))
        self.assertFalse(any(statement.startswith('COMMENT ON DATABASE') for statement in self.statements))

    def test_expired_initial_packet_never_reaches_server_or_effects(self):
        p=packet();p['leaseUntil']='2000-01-01T00:00:00Z'
        with patch.object(db,'configuration') as config,patch.object(db,'get') as get,patch.object(db,'sql') as sql,patch.object(db,'kubectl') as kubectl,patch.object(db,'storage_request') as storage:
            with self.assertRaisesRegex(ValueError,'Expired database lease'):execute_database(p,lambda **value:self.fail('Expired packet reached server guard'))
        for effect in [config,get,sql,kubectl,storage]:effect.assert_not_called()

    def test_storage_helper_keeps_original_deadline_after_server_guard(self):
        import database_storage
        p=packet();start=datetime.now(timezone.utc);p['leaseUntil']=(start+timedelta(seconds=10)).isoformat();original=p['leaseUntil']
        clock=SimpleNamespace(value=start)
        class Clock(datetime):
            @classmethod
            def now(cls,tz=None):return clock.value
        def checkpoint(**value):clock.value=start+timedelta(seconds=20)
        with patch.object(db,'datetime',Clock),patch.object(database_storage,'datetime',Clock),patch.object(db,'configuration',return_value={}),patch.object(db,'get',return_value=None),patch('storage_client.request') as rpc:
            with self.assertRaisesRegex(ValueError,'Expired or invalid storage lease'):execute_database(p,checkpoint)
        rpc.assert_not_called();self.assertEqual(p['leaseUntil'],original)

    def test_observation_does_not_replay_creation(self):
        p=packet();p['phase']='observe';p['backend']['cnpgUID']='original'
        cluster={'kind':'Cluster','metadata':{'uid':'original','labels':{'webdock.dev/database-installation':'125'}}}
        with patch.object(db,'configuration',return_value={}),patch.object(db,'get',return_value=cluster),patch.object(db,'runtime_ready',return_value=False),patch.object(db,'sql') as sql,patch.object(db,'storage_request') as storage:
            self.assertIsNone(execute_database(p,lambda **value:None))
        sql.assert_not_called();storage.assert_not_called()

    def test_pure_builders_ignore_elapsed_time_but_still_validate_structure(self):
        p=packet();p['leaseUntil']='2000-01-01T00:00:00Z'
        config={'image':'ghcr.io/cloudnative-pg/postgresql@sha256:'+'a'*64,'poolerImage':'ghcr.io/cloudnative-pg/pgbouncer@sha256:'+'b'*64,'issuer':'fixture','apiCIDRs':['10.0.0.1/32'],'podCIDRs':['10.42.0.0/16']}
        self.assertTrue(backend_manifests(p,config));self.assertTrue(sql_configuration(p))
        p['backend']['namespace']='foreign'
        for build in [lambda:backend_manifests(p,config),lambda:sql_configuration(p)]:
            with self.assertRaises(ValueError):build()

    def test_packet_rejects_unfenced_or_cross_backend_targets(self):
        self.assertEqual(validate_packet(packet())['database']['id'],'300')
        for key,value in [('action','shell'),('revision',True),('generation',0),('leaseUntil','2000-01-01T00:00:00Z')]:
            with self.subTest(key=key),self.assertRaises(ValueError):validate_packet({**packet(),key:value})
        bad=packet();bad['backend']['namespace']='kube-system'
        with self.assertRaises(ValueError):validate_packet(bad)
        bad=packet();bad['database']['name']='db_301'
        with self.assertRaises(ValueError):validate_packet(bad)
        bad=packet();bad['database']['credentials']['applicationPassword']="'; DROP DATABASE postgres; --"
        with self.assertRaises(ValueError):validate_packet(bad)

    def test_customer_shared_restart_never_turns_into_pool_restart(self):
        with self.assertRaises(ValueError):validate_packet({**packet(),'action':'restart'})

    def test_backend_profile_is_pinned_retained_and_never_enables_backups(self):
        config={'image':'ghcr.io/cloudnative-pg/postgresql@sha256:'+'a'*64,'poolerImage':'ghcr.io/cloudnative-pg/pgbouncer@sha256:'+'b'*64,'issuer':'pilot-issuer','apiCIDRs':['10.0.0.2/32'],'podCIDRs':['10.42.0.0/16']}
        objects=backend_manifests(packet(),config)
        cluster=next(o for o in objects if o['kind']=='Cluster')
        self.assertEqual(cluster['spec']['instances'],1)
        self.assertEqual(cluster['spec']['postgresUID'],26)
        self.assertEqual(cluster['spec']['storage']['pvcTemplate']['volumeName'],'wd-db-125')
        self.assertNotIn('backup',cluster['spec'])
        self.assertFalse(cluster['spec']['enableSuperuserAccess'])
        self.assertEqual(cluster['spec']['postgresql']['pg_hba'][-1],'host all all all reject')
        self.assertNotIn('Secret',[o['kind'] for o in objects])
        pooler=next(o for o in objects if o['kind']=='Pooler')
        self.assertEqual(pooler['spec']['template']['spec']['initContainers'][0]['resources']['limits']['memory'],'268435456')
        # The copied controller occupies ~63 MiB before config files and logs.
        for container in pooler['spec']['template']['spec']['containers'] + pooler['spec']['template']['spec']['initContainers']:
            self.assertGreaterEqual(int(container['resources']['limits']['ephemeral-storage']),128 * 1024 * 1024)


    def test_sql_uses_non_login_owner_and_only_target_roles(self):
        self.assertEqual(role_names('300'),('wd_owner_300','wd_migrate_300','wd_app_300'))
        sql=sql_configuration(packet())
        self.assertIn('REVOKE ALL ON DATABASE "db_300" FROM PUBLIC',sql['database'])
        self.assertIn('NOLOGIN',sql['roles'])
        self.assertIn('NOBYPASSRLS',sql['roles'])
        self.assertIn('ALTER DEFAULT PRIVILEGES FOR ROLE "wd_migrate_300"',sql['schema'])
        self.assertNotIn('wd_app_301',str(sql))
        self.assertNotIn(' SUPERUSER',sql['roles'])
        self.assertNotIn(packet()['database']['credentials']['applicationPassword'],sql['enable'])
        self.assertIn('SCRAM-SHA-256$',sql['enable'])

class PlatformDatabaseTests(TestCase):
    def test_platform_service_pools_fit_the_existing_connection_budget(self):
        p=packet();p['backend']['kind']='dedicated';p['database']['kind']='dedicated'
        config={'image':'postgres@sha256:'+'a'*64,'poolerImage':'pgbouncer@sha256:'+'b'*64,'issuer':'issuer','apiCIDRs':['10.0.0.2/32'],'podCIDRs':['10.42.0.0/16'],'platformDatabases':{'300':['webdock_auth_runtime']}}
        pooler=next(o for o in backend_manifests(p,config) if o['kind']=='Pooler')
        parameters=pooler['spec']['pgbouncer']['parameters']
        # Auth, business, worker, registry and browser can each serve concurrent reads.
        self.assertGreaterEqual(int(parameters['default_pool_size']),2)
        self.assertLessEqual(5*int(parameters['default_pool_size']),int(parameters['max_db_connections']))
        self.assertEqual(parameters['max_db_connections'],'10')
    def test_explicit_platform_logins_are_bound_to_one_dedicated_database(self):
        p=packet();p['backend']['kind']='dedicated';p['database']['kind']='dedicated'
        config={'platformDatabases':{'300':['webdock_auth_runtime','webdock_browser_website']}}
        rows=hba(p,config)
        self.assertIn('webdock_auth_runtime',rows[0]);self.assertIn('webdock_browser_website',rows[0]);self.assertTrue(rows[0].startswith('hostssl db_300 '))
        p['members'][0]['enabled']=False;self.assertEqual(hba(p,config),['host all all all reject'])
        other={'platformDatabases':{'301':['webdock_auth_runtime']}};p['members'][0]['enabled']=True;self.assertNotIn('webdock_auth_runtime',str(hba(p,other)))
    def test_platform_database_cannot_hibernate_its_own_control_plane(self):
        p=packet();p['backend']['kind']='dedicated';p['database']['kind']='dedicated';p['action']='pause'
        with patch('databases.configuration',return_value={'platformDatabases':{'300':['webdock_auth_runtime']}}),patch('databases.get') as get:
            with self.assertRaisesRegex(ValueError,'offline maintenance'):execute_database(p,lambda **kw:None)
            get.assert_not_called()
    def test_platform_member_is_protected_when_packet_omits_logical_database(self):
        for action in ['pause','restart','resize','delete','purge','rotateCredentials','migrate']:
            p=packet();p['backend']['kind']='dedicated';p['database']=None;p['action']=action
            with self.subTest(action=action),patch('databases.configuration',return_value={'platformDatabases':{'300':['webdock_auth_runtime']}}),patch('databases.get') as get,patch('databases.purge_installation') as purge:
                with self.assertRaisesRegex(ValueError,'offline maintenance'):execute_database(p,lambda **kw:None)
                get.assert_not_called();purge.assert_not_called()

class AuxiliaryDatabaseTests(TestCase):
    def config(self):
        return {'image':'postgres@sha256:'+'a'*64,'poolerImage':'pgbouncer@sha256:'+'b'*64,'issuer':'issuer','apiCIDRs':['10.0.0.2/32'],'podCIDRs':['10.42.0.0/16'],'platformAuxiliaryDatabases':{'300':[{'name':'webdock_plugin_registry','roles':['webdock_plugin_registry'],'projectID':'401'}]}}
    def dedicated(self):
        p=packet();p['backend']['kind']='dedicated';p['database']['kind']='dedicated';return p
    def test_auxiliary_database_preserves_main_rule_and_binds_its_project(self):
        p=self.dedicated();config=self.config();rules=hba(p,config)
        self.assertEqual(rules,[hba(p)[0],'hostssl webdock_plugin_registry webdock_plugin_registry all scram-sha-256','host all all all reject'])
        network=next(o for o in backend_manifests(p,config) if o['kind']=='NetworkPolicy' and o['metadata']['name']=='database-infrastructure')
        projects=[x['namespaceSelector']['matchLabels']['webdock.dev/project-id'] for x in network['spec']['ingress'][0]['from']]
        self.assertEqual(projects,['400','401'])
        p['members'][0]['enabled']=False
        self.assertNotIn('webdock_plugin_registry',' '.join(hba(p,config)))
    def test_auxiliary_databases_are_operator_pinned_not_packet_controlled(self):
        with self.assertRaises(ValueError):hba(packet(),self.config())
        for field,value in [('name','postgres'),('name','webdock_bad all trust'),('roles',['all']),('projectID','evil')]:
            config=self.config();config['platformAuxiliaryDatabases']['300'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):hba(self.dedicated(),config)
        config=self.config();config['platformAuxiliaryDatabases']['300'][0]['command']='shell'
        with self.assertRaises(ValueError):hba(self.dedicated(),config)
    def test_auxiliary_data_blocks_unreviewed_parent_maintenance(self):
        for action in ['pause','restart','resize','delete','purge','rotateCredentials']:
            p=self.dedicated();p['action']=action
            with self.subTest(action=action),patch('databases.configuration',return_value=self.config()),patch('databases.get') as get:
                with self.assertRaisesRegex(ValueError,'offline maintenance'):execute_database(p,lambda **kwargs:None)
                get.assert_not_called()
