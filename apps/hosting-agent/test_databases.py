import copy
from datetime import datetime,timedelta,timezone
from unittest import TestCase
from databases import validate_packet,backend_manifests,role_names,sql_configuration


def packet():
    return {'version':1,'operationID':'901','generation':1,'leaseToken':'a'*64,
      'leaseUntil':(datetime.now(timezone.utc)+timedelta(minutes=3)).isoformat(),'clusterID':'456','action':'create','phase':'apply','revision':1,
      'backend':{'id':'125','kind':'shared-pool','namespace':'wd-db-125','node':'postgres-pilot','poolID':'bd0ba8e4-e801-4c16-bf1b-060129437ccb','revision':1,'cnpgUID':None,'resources':{'cpuMillicores':1000,'memoryBytes':2147483648,'volumeBytes':32212254720},'host':'db-125.example.invalid','directPort':32000,'pooledPort':32001},
      'database':{'id':'300','kind':'shared','name':'db_300','revision':1,'credentialRevision':1,'connectionLimit':10,'credentials':{'migrationPassword':'a'*43,'applicationPassword':'b'*43}},
      'members':[{'id':'300','projectID':'400','databaseName':'db_300','enabled':True}]}


class DatabaseTests(TestCase):
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
