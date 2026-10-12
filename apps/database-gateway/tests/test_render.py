import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

RENDER = Path(__file__).resolve().parents[1] / 'deploy/render.py'


class RendererTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(self.root / 'ca.key'), '-out', str(self.root / 'ca.crt'),
                        '-subj', '/CN=renderer-test', '-days', '1'], check=True, capture_output=True)
        (self.root / 'gateway-secret').write_text('synthetic-gateway-secret')
        self.rows = [self.row('website'), self.row('customer')]
        for row in self.rows:
            # Avoid generating leaf certificates; this test exercises manifest rendering.
            (self.root / ('db-' + row['slug'] + '.crt')).write_text('synthetic-leaf')
            (self.root / ('db-' + row['slug'] + '.key')).write_text('synthetic-key')

    def row(self, slug):
        return {'namespace': 'webdock-databases', 'slug': slug, 'engine': 'postgresql',
                'runtimeOrigin': 'https://db-' + slug + '.webdock-databases.svc.cluster.local',
                'proxySecret': 'synthetic-private-proxy', 'config': {},
                'connections': [{'id': slug, 'name': slug, 'params': {
                    'driver': 'postgres', 'host': 'old.invalid', 'port': 5432,
                    'username': 'synthetic-user', 'password': 'synthetic-private-password',
                    'database': 'website', 'ssl_mode': 'require'}}]}

    def render(self, rows):
        (self.root / 'inventory.json').write_text(json.dumps(rows))
        result = subprocess.run(['python3', str(RENDER), '--inventory', str(self.root / 'inventory.json'),
                                 '--private-dir', str(self.root), '--gateway-image', 'gateway',
                                 '--runtime-image', 'runtime', '--tls-image', 'tls',
                                 '--runtime-commit', 'pin', '--output', str(self.root / 'output.json')],
                                capture_output=True, text=True)
        self.assertNotIn('synthetic-private', result.stdout + result.stderr)
        return result

    def manifest(self):
        return json.loads((self.root / 'output.json').read_text())['items']

    def target(self):
        row = self.rows[0]
        row['databaseTLSCA'] = str(self.root / 'ca.crt')
        row['databaseTarget'] = {'namespace': 'wd-db-123', 'podLabels': {'cnpg.io/cluster': 'postgres'},
                                 'host': 'postgres-rw.wd-db-123.svc.cluster.local'}
        row['connections'][0]['params'].update(host=row['databaseTarget']['host'], ssl_mode='verify-full',
                                               ssl_ca='/database-trust/ca.crt')

    def test_legacy_and_only_selected_runtime_changes(self):
        self.assertEqual(self.render(self.rows).returncode, 0)
        baseline = self.manifest()
        self.assertFalse((self.root / 'output.json.database-ingress.json').exists())
        legacy = next(x for x in baseline if x['kind'] == 'NetworkPolicy' and x['metadata']['name'] == 'db-website')
        self.assertEqual(legacy['spec']['egress'][0]['ports'], [{'port': 5432}])
        self.target()
        before = copy.deepcopy(self.rows[0]['connections'])
        result = self.render(self.rows)
        self.assertEqual(result.returncode, 0, result.stderr)
        changed = self.manifest()
        for item in baseline:
            if item['metadata']['name'] != 'db-website':
                self.assertIn(item, changed)
        policy = next(x for x in changed if x['kind'] == 'NetworkPolicy' and x['metadata']['name'] == 'db-website')
        self.assertEqual(policy['spec']['egress'], [{'to': [{'namespaceSelector': {'matchLabels': {
            'kubernetes.io/metadata.name': 'wd-db-123'}}, 'podSelector': {'matchLabels': {'cnpg.io/cluster': 'postgres'}}}],
            'ports': [{'protocol': 'TCP', 'port': 5432}]}])
        secret = next(x for x in changed if x['kind'] == 'Secret' and x['metadata']['name'] == 'db-website')
        self.assertEqual(json.loads(secret['stringData']['connections.json']), before)
        deployment = next(x for x in changed if x['kind'] == 'Deployment' and x['metadata']['name'] == 'db-website')
        container = deployment['spec']['template']['spec']['containers'][0]
        self.assertIn({'name': 'database-trust', 'mountPath': '/database-trust', 'readOnly': True}, container['volumeMounts'])
        ingress = json.loads((self.root / 'output.json.database-ingress.json').read_text())['items'][0]
        self.assertEqual(ingress['metadata']['namespace'], 'wd-db-123')
        self.assertEqual(ingress['spec']['ingress'][0]['from'], [{'namespaceSelector': {'matchLabels': {
            'kubernetes.io/metadata.name': 'webdock-databases'}}, 'podSelector': {'matchLabels': {'app': 'db-website'}}}])

    def test_rejects_unbounded_or_inconsistent_target(self):
        self.target()
        for field, value in [('podLabels', {}), ('namespace', '*'), ('host', 'attacker.invalid')]:
            rows = copy.deepcopy(self.rows)
            rows[0]['databaseTarget'][field] = value
            self.assertNotEqual(self.render(rows).returncode, 0)
        self.rows[0]['connections'][0]['params']['ssl_mode'] = 'require'
        self.assertNotEqual(self.render(self.rows).returncode, 0)

    def test_rejects_ca_without_target_or_sqlite_target(self):
        self.target()
        rows = copy.deepcopy(self.rows)
        del rows[0]['databaseTarget']
        self.assertNotEqual(self.render(rows).returncode, 0)
        self.rows[0]['engine'] = 'sqlite'
        self.assertNotEqual(self.render(self.rows).returncode, 0)

    def test_external_target_has_single_host_egress_and_no_ingress(self):
        self.target()
        self.rows[0]['databaseTarget'] = {'host': 'db-123.pg.webdock.dev', 'port': 32000,
                                           'addressIPv4': '79.143.177.157'}
        self.rows[0]['connections'][0]['params'].update(host='db-123.pg.webdock.dev', port=32000)
        result = self.render(self.rows)
        self.assertEqual(result.returncode, 0, result.stderr)
        policy = next(x for x in self.manifest() if x['kind'] == 'NetworkPolicy' and x['metadata']['name'] == 'db-website')
        self.assertEqual(policy['spec']['egress'], [{'to': [{'ipBlock': {'cidr': '79.143.177.157/32'}}],
                                                   'ports': [{'protocol': 'TCP', 'port': 32000}]}])
        self.assertFalse((self.root / 'output.json.database-ingress.json').exists())
        for field, value in [('addressIPv4', '0.0.0.0/0'), ('addressIPv4', '127.0.0.1'),
                             ('host', 'bad;host'), ('port', 0), ('port', True)]:
            rows = copy.deepcopy(self.rows)
            rows[0]['databaseTarget'][field] = value
            self.assertNotEqual(self.render(rows).returncode, 0)

    def test_rejects_noncertificate_content_without_disclosure(self):
        self.target()
        ca = (self.root / 'ca.crt').read_text()
        for content in ['not a certificate', ca + '\nsynthetic-private-password',
                        ca + '\n-----BEGIN PRIVATE KEY-----\nsynthetic-private-key']:
            (self.root / 'ca.crt').write_text(content)
            self.assertNotEqual(self.render(self.rows).returncode, 0)


if __name__ == '__main__':
    unittest.main()
