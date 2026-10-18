import base64
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import plugin_installer as installer
import plugin_source
import worker


def source_zip():
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        archive.writestr('tabularium.json', json.dumps({'name': 'example', 'version': '1.0.0', 'image': 'untrusted/image@sha256:' + '0' * 64}))
        archive.writestr('Dockerfile', 'FROM scratch\n')
    return output.getvalue()


class Control:
    def __init__(self, job, source=b''):
        self.job, self.source, self.calls = job, source, []

    def request(self, path, body=None, **kwargs):
        self.calls.append((path, body))
        if path == '/claim':
            return self.job
        if path == '/source':
            chunk = self.source[body['offset']:body['offset'] + 65536]
            return {'data': base64.b64encode(chunk).decode(), 'done': body['offset'] + len(chunk) == len(self.source)}
        if path == '/lease':
            return {'active': True}
        return {'ok': True}


JOB = {'id': '123', 'claimToken': '00000000-0000-4000-8000-000000000001', 'phase': 'build',
       'source': {'kind': 'zip', 'label': 'plugin.zip'}, 'projectID': '456', 'customerID': '789', 'mode': 'build'}


class InstallerTests(unittest.TestCase):
    def test_long_valid_source_paths_survive_guest_transport(self):
        output = io.BytesIO()
        name = 'a' * 240 + '/file.txt'
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('tabularium.json', '{}')
            archive.writestr('Dockerfile', 'FROM scratch\n')
            archive.writestr(name, 'retained')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'request' / 'source'
            source.mkdir(parents=True)
            worker.unpack(plugin_source.normalize_zip(output.getvalue()), source, worker.MAX_SOURCE)
            transported = worker.pack(root / 'request', format=__import__('tarfile').PAX_FORMAT)
            restored = root / 'restored'
            restored.mkdir()
            worker.unpack(transported, restored, worker.MAX_SOURCE)
            self.assertEqual((restored / 'source' / name).read_text(), 'retained')

    def test_upload_download_is_bounded_and_exact(self):
        data = source_zip()
        control = Control({**JOB, 'sourceSize': len(data)}, data)
        self.assertEqual(installer.acquire_source(control, control.job)['archive'], plugin_source.normalize_zip(data))
        with self.assertRaises(worker.Rejected):
            installer.acquire_source(control, {**control.job, 'sourceSize': len(data) + 1})

    def test_build_receives_no_source_or_control_credentials(self):
        job = {**JOB, 'source': {'kind': 'git', 'url': 'https://example.com/plugin.git', 'credential': {'username': 'git', 'token': 'private-secret'}}}
        captured = {}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = {'isolation': 'artifact-only', 'artifactRoot': str(root), 'registry': {'repository': 'registry.example/plugins', 'authFile': '/private/auth'}}
            def execute(config, control, request, source):
                captured.update(request)
                key = '789/123/1/' + 'a' * 64 + '.tar'
                artifact = root / key
                artifact.parent.mkdir(parents=True)
                artifact.write_bytes(b'test')
                return {'storageKey': key, 'digest': 'sha256:' + 'a' * 64, 'sizeBytes': 4}, 'not forwarded'
            with patch('plugin_installer.plugin_actions.build', side_effect=execute), patch('plugin_installer.worker.execute_vm', side_effect=AssertionError('KVM forbidden')), patch('plugin_installer.publisher.load_artifact'), patch('plugin_installer.publisher.publish_oci', return_value={'image': 'registry.example/plugins@sha256:' + 'b' * 64}):
                result = installer.build_source(config, Control(job), job, {'archive': plugin_source.normalize_zip(source_zip()), 'commit': 'c' * 40})
            self.assertNotIn('private-secret', json.dumps(captured))
            self.assertNotIn('credential', json.dumps(captured))
            self.assertEqual(set(captured), {'id', 'claimToken', 'projectID', 'customerID'})
            self.assertEqual(json.loads(result['manifestRaw'])['image'], 'registry.example/plugins@sha256:' + 'b' * 64)
            self.assertEqual(result['commit'], 'c' * 40)
            self.assertFalse(list(root.rglob('*.tar')))

    def test_runtime_resources_are_restricted_and_owned(self):
        config = {'runtime': {'namespace': 'plugins', 'apiNamespace': 'platform', 'apiPodLabels': {'app': 'webdock-api'},
                  'apiAddresses': ['203.0.113.10'], 'hostOrigin': 'https://api.example', 'clusterID': 'local', 'imagePullSecret': 'plugins-pull'}}
        job = {**JOB, 'phase': 'deploy', 'manifestRaw': json.dumps({'name': 'example', 'version': '1.0.0', 'image': 'registry.example/p@sha256:' + 'a' * 64, 'navigation': []}), 'configuration': {}}
        resources = installer.runtime_resources(config, job, 'private-runtime-token', 'PUBLIC KEY', 'CERT', 'KEY')
        deployment = next(item for item in resources if item['kind'] == 'Deployment')
        spec = deployment['spec']['template']['spec']
        self.assertFalse(spec['automountServiceAccountToken'])
        self.assertTrue(spec['securityContext']['runAsNonRoot'])
        container = spec['containers'][0]
        self.assertTrue(container['securityContext']['readOnlyRootFilesystem'])
        self.assertFalse(container['securityContext']['allowPrivilegeEscalation'])
        self.assertEqual(container['securityContext']['capabilities'], {'drop': ['ALL']})
        self.assertNotIn('hostPath', json.dumps(resources))
        self.assertNotIn('private-runtime-token', json.dumps(deployment))
        self.assertTrue(all(item['metadata']['labels']['webdock.dev/source-import'] == '123' for item in resources))
        self.assertEqual(next(item for item in resources if item['kind'] == 'NetworkPolicy')['spec']['policyTypes'], ['Ingress', 'Egress'])

    def test_ui_requires_operator_owned_tls_configuration(self):
        config = {'runtime': {'namespace': 'plugins'}}
        job = {**JOB, 'manifestRaw': json.dumps({'name': 'example', 'version': '1', 'image': 'r/p@sha256:' + 'a' * 64, 'navigation': [{'path': '/ui'}]})}
        with self.assertRaises(worker.Rejected):
            installer.runtime_resources(config, job, 'TOKEN', 'PUBLIC KEY', 'CERT', 'KEY')

    def test_api_hairpin_egress_uses_only_configured_ingress_pods(self):
        config = {'runtime': {'namespace': 'plugins', 'apiNamespace': 'platform', 'apiPodLabels': {'app': 'webdock-api'},
                  'apiAddresses': ['203.0.113.10'], 'hostOrigin': 'https://api.example', 'clusterID': 'local',
                  'ingressNamespace': 'kube-system', 'ingressPodLabels': {'app.kubernetes.io/name': 'traefik'}}}
        job = {**JOB, 'manifestRaw': json.dumps({'name': 'example', 'version': '1.0.0', 'image': 'registry.example/p@sha256:' + 'a' * 64, 'navigation': []})}
        resources = installer.runtime_resources(config, job, 'TOKEN', 'PUBLIC KEY', 'CERT', 'KEY')
        egress = next(item for item in resources if item['kind'] == 'NetworkPolicy')['spec']['egress']
        self.assertIn({'to': [{'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kube-system'}},
                              'podSelector': {'matchLabels': {'app.kubernetes.io/name': 'traefik'}}}],
                       'ports': [{'protocol': 'TCP', 'port': 443}, {'protocol': 'TCP', 'port': 8443}]}, egress)

    def test_example_configuration_is_valid_without_kvm_or_vm_image(self):
        config = json.loads(Path(__file__).with_name('plugin-installer.example.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            config['artifactRoot'] = directory
            config['runtime']['apiAddresses'] = ['203.0.113.10']
            config['github'].update(appID='1', installationID='2', repositoryID='42')
            with patch.object(worker, 'private_file', side_effect=Path) as trusted, patch.object(worker.Path, 'exists', side_effect=AssertionError('KVM probe forbidden')):
                installer.validate_config(config)
            self.assertEqual({call.args[0] for call in trusted.call_args_list}, {
                config['credentialFile'], config['registry']['authFile'], config['runtime']['kubeconfigFile'], config['github']['privateKeyFile']})
        self.assertEqual(config['isolation'], 'artifact-only')
        self.assertTrue(config['storageEvidence'])
        self.assertNotIn('image', config)
        with patch.object(worker, 'validate_config', side_effect=AssertionError('No KVM path')), self.assertRaisesRegex(worker.Rejected, 'artifact_only_required'):
            installer.validate_config({**config, 'isolation':'qemu-kvm'})

    def test_failure_never_reports_raw_exception_or_credentials(self):
        control = Control(JOB)
        with patch('plugin_installer.acquire_source', side_effect=RuntimeError('private-secret')):
            installer.run_once({}, control)
        complete = control.calls[-1]
        self.assertEqual(complete[0], '/complete')
        self.assertEqual(complete[1]['result'], {'phase': 'failed', 'code': 'BUILD_FAILED'})
        self.assertNotIn('private-secret', json.dumps(control.calls))


if __name__ == '__main__':
    unittest.main()
