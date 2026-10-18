from unittest import TestCase
from test_databases import packet
from database_migrations import migration_job,validate_migration

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
