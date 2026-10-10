import json
from pathlib import Path
import tempfile
import unittest
import publisher
import worker

class PublisherTests(unittest.TestCase):
    def test_fake_vercel_has_only_artifacts_and_no_credential_argv(self):
        calls=[]
        def run(command,**kwargs):
            calls.append(command)
            if '--version' in command:return b'63.1.2'
            self.assertNotIn('private-secret',str(command))
            self.assertEqual(set(p.name for p in kwargs['cwd'].iterdir()),{'.vercel','vercel.json'})
            self.assertNotIn('VERCEL_TOKEN',kwargs['env'])
            auth=Path(command[command.index('--global-config')+1])/'auth.json'
            self.assertEqual(json.loads(auth.read_text())['token'],'private-secret')
            return b'https://test.vercel.app'
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'config.json').write_text('{"version":3}')
            result=publisher.publish_vercel(root,{'projectId':'prj_1','orgId':'team_1'},'private-secret','123',run)
            self.assertEqual(result['status'],'deploying');self.assertIn('--prebuilt',calls[-1])
    def test_ambiguous_write_must_reconcile(self):
        def run(command,**kwargs):
            if '--version' in command:return b'63.1.2'
            raise TimeoutError()
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'config.json').write_text('{"version":3}')
            with self.assertRaises(worker.PublicationUncertain):publisher.publish_vercel(root,{'projectId':'prj_1','orgId':'team_1'},'secret','123',run)
    def test_cross_tenant_artifact_rejected_before_read(self):
        with tempfile.TemporaryDirectory() as d:
            release={'customerID':'1','buildID':'2','releaseID':'3','artifact':{'digest':'sha256:'+'a'*64,'storageKey':'99/2/1/'+'a'*64+'.tar'}}
            with self.assertRaises(worker.Rejected):publisher.load_artifact(d,release,Path(d))

if __name__=='__main__':unittest.main()

class OCIValidationTests(unittest.TestCase):
    def test_fake_registry_preserves_verified_manifest_digest(self):
        import hashlib
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);layout=root/'layout';layout.mkdir();(layout/'blobs/sha256').mkdir(parents=True)
            def blob(value,media):
                data=json.dumps(value).encode();digest=hashlib.sha256(data).hexdigest();(layout/'blobs/sha256'/digest).write_bytes(data)
                return {'mediaType':media,'digest':'sha256:'+digest,'size':len(data)}
            config=blob({'architecture':'amd64','os':'linux'},'application/vnd.oci.image.config.v1+json')
            manifest=blob({'schemaVersion':2,'config':config,'layers':[]},'application/vnd.oci.image.manifest.v1+json')
            (layout/'oci-layout').write_text('{"imageLayoutVersion":"1.0.0"}');(layout/'index.json').write_text(json.dumps({'schemaVersion':2,'manifests':[manifest]}))
            (root/'image.tar').write_bytes(worker.pack(layout))
            def fake(command,**kwargs):
                self.assertIn('--preserve-digests',command)
                self.assertEqual(command[-1],'docker://registry.example/customers/1/projects/2:release-3')
                Path(command[command.index('--digestfile')+1]).write_text(manifest['digest'])
                return b''
            with patch.object(worker,'private_file'):
                result=publisher.publish_oci(root,'registry.example/customers/1/projects/2','/private/auth.json','3',fake)
            self.assertEqual(result['image'],'registry.example/customers/1/projects/2@'+manifest['digest'])
            blobpath=layout/'blobs/sha256'/config['digest'][7:];blobpath.write_text('tampered');(root/'image.tar').write_bytes(worker.pack(layout))
            with self.assertRaises(worker.Rejected):worker.validate_oci(root/'image.tar')
