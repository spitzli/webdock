import json
import smtplib
import ssl
from urllib.parse import urlsplit
import os
import subprocess
import time
import unittest
import uuid
from mail_client import MailClient
from urllib.request import Request


@unittest.skipUnless(os.environ.get('WEBDOCK_MAIL_DOCKER_TEST') == '1', 'Explicit local Docker integration test')
class MailClientIntegrationTests(unittest.TestCase):
    def test_restricted_bootstrap_high_ports_and_permanent_credentials(self):
        endpoint = os.environ.get('DOCKER_HOST')
        if not endpoint or not endpoint.startswith('unix:///'):
            self.fail('An explicit local Docker socket is required')
        name = 'webdock-mail-restricted-test-' + uuid.uuid4().hex[:12]
        image = 'webdock.local/mail-stalwart:0.16.25-restricted'
        env = dict(os.environ); env.pop('DOCKER_CONTEXT', None)
        def docker(*args):
            result = subprocess.run(['docker', '--host', endpoint, *args], env=env, capture_output=True, text=True, timeout=40)
            if result.returncode:
                raise AssertionError('Local Docker test operation failed: ' + args[0])
            return result.stdout
        def start(recovery):
            docker('run', '-d', '--name', name, '--network', name, '--user', '65532:65532', '--cap-drop', 'ALL',
                   '--security-opt', 'no-new-privileges', '--read-only', '--memory', '1g', '--cpus', '1',
                   '--tmpfs', '/tmp', '--mount', 'type=volume,src=' + name + ',dst=/data',
                   '--env', 'STALWART_PUBLIC_URL=https://mail.example.com',
                   *(['--env', 'STALWART_RECOVERY_MODE=1', '--env', 'STALWART_RECOVERY_ADMIN=admin:local-fixture-only'] if recovery else []), image)
            address = json.loads(docker('inspect', name))[0]['NetworkSettings']['Networks'][name]['IPAddress']
            return 'http://' + address + ':8080'
        def eventually(call):
            deadline = time.monotonic() + 25
            while True:
                try: return call()
                except Exception:
                    if time.monotonic() >= deadline: raise
                    time.sleep(.3)
        try:
            docker('network', 'create', '--internal', name)
            docker('volume', 'create', name)
            docker('run', '--rm', '--network', 'none', '--user', '0', '--mount', 'type=volume,src=' + name + ',dst=/data',
                   '--entrypoint', 'chown', image, '65532:65532', '/data')
            client = MailClient(start(True), 'admin', 'local-fixture-only')
            eventually(lambda: client.call('x:Bootstrap/get', {'ids': ['singleton']}))
            with client.opener.open(Request(client.url + '/healthz/live'), timeout=5) as response:
                self.assertEqual(response.status, 200)
            credentials = client.bootstrap('mail.example.com')
            docker('restart', name)
            eventually(lambda: client.call('x:NetworkListener/get', {'ids': None}))
            client.configure_listeners()
            docker('rm', '-f', name)
            permanent = MailClient(start(False), **credentials)
            eventually(permanent.verify)
            with permanent.opener.open(Request(permanent.url + '/healthz/live'), timeout=5) as response:
                self.assertEqual(response.status, 200)
            rows = permanent.call('x:NetworkListener/get', {'ids': None})['list']
            self.assertEqual({int(bind.rsplit(':', 1)[1]) for row in rows for bind in row['bind']}, {8080, 2525, 2465, 1993})
            with smtplib.SMTP_SSL(urlsplit(permanent.url).hostname, 2465, timeout=5, context=ssl._create_unverified_context()) as smtp:
                self.assertEqual(smtp.ehlo()[0], 250)
            self.assertFalse(any(v.startswith('STALWART_RECOVERY') for v in json.loads(docker('inspect', name))[0]['Config']['Env']))
            with self.assertRaises(ValueError):
                MailClient(permanent.url, 'admin', 'local-fixture-only').verify()
        finally:
            for args in [('rm', '-f', name), ('volume', 'rm', name), ('network', 'rm', name)]:
                subprocess.run(['docker', '--host', endpoint, *args], env=env, capture_output=True, timeout=30)


if __name__ == '__main__':
    unittest.main()
