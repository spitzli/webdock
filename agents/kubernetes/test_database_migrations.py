from unittest import TestCase
from unittest.mock import patch
from test_databases import packet
from database_migrations import migration_job,validate_migration,execute_migration
import databases as db

class MigrationTests(TestCase):
    def migration(self):
        p=packet();p['action']='migrate';p['backend']['kind']='dedicated';p['database']['kind']='dedicated'
        p['migration']={'id':'800','source':{'id':'126','namespace':'wd-db-126','cnpgUID':'source-uid','host':'db-126.example.invalid','kind':'shared-pool'},'transferPassword':'c'*43,'jobUID':None,'copySHA256':None}
        return p
    def test_source_is_distinct_and_bound_to_its_generated_namespace(self):
        p=self.migration();validate_migration(p)
        p['migration']['source']['id']=p['backend']['id']
        with self.assertRaises(ValueError):validate_migration(p)
    def test_copy_is_bounded_and_imports_as_the_customer_migration_role(self):
        p=self.migration();objects=migration_job(p,{'image':'ghcr.io/cloudnative-pg/postgresql:18.6@sha256:'+'a'*64},'CA source','CA target')
        job=next(o for o in objects if o['kind']=='Job');spec=job['spec']['template']['spec'];container=spec['containers'][0]
        self.assertEqual(job['spec']['backoffLimit'],0)
        self.assertEqual(job['spec']['parallelism'],1)
        self.assertFalse(spec['automountServiceAccountToken'])
        self.assertEqual(spec['securityContext']['runAsUser'],26)
        self.assertIn('--no-owner',container['args'][0]);self.assertIn('--no-privileges',container['args'][0])
        self.assertIn('--schema=app',container['args'][0]);self.assertNotIn(' -U postgres',container['args'][0])
        self.assertNotIn('c'*43,str(job))

    def test_pure_job_builder_accepts_stale_deadline_but_execution_entry_does_not(self):
        p=self.migration();p['leaseUntil']='2000-01-01T00:00:00Z'
        self.assertTrue(migration_job(p,{'image':'ghcr.io/cloudnative-pg/postgresql@sha256:'+'a'*64},'source CA','target CA'))
        with patch.object(db,'get') as get,self.assertRaisesRegex(ValueError,'Expired database lease'):execute_migration(p,lambda **value:None,{})
        get.assert_not_called()
        p['migration']['source']['id']=p['backend']['id']
        with self.assertRaises(ValueError):migration_job(p,{'image':'fixture'},'source CA','target CA')

    def test_revocation_after_target_create_prevents_separate_mark_statement(self):
        p=self.migration();p['phase']='configure';events=[];statements=[];guards=0
        def checkpoint(**value):
            nonlocal guards
            events.append('checkpoint' if value else 'guard')
            if not value:
                guards+=1
                if guards==5:raise PermissionError('Server rejected next mutation')
        def get(kind,name,namespace=None):
            if kind=='cluster':
                source=namespace==p['migration']['source']['namespace']
                return {'kind':'Cluster','metadata':{'uid':'source-uid' if source else 'target-uid','labels':{'webdock.dev/database-installation':'126' if source else '125'}},'status':{'readyInstances':1}}
            return None
        def sql(value,statement,database='postgres'):
            if not statement.startswith('SELECT '):self.assertEqual(events[-1],'guard')
            events.append('sql');statements.append(statement)
            return '0' if statement.startswith('SELECT ') else ''
        with patch.object(db,'get',side_effect=get),patch.object(db,'sql',side_effect=sql),patch.object(db,'database_exists',return_value=False):
            with self.assertRaises(PermissionError):execute_migration(p,checkpoint,{})
        self.assertTrue(any(statement.startswith('CREATE DATABASE') for statement in statements))
        self.assertFalse(any(statement.startswith('COMMENT ON DATABASE') for statement in statements))
