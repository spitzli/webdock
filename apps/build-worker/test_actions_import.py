import hashlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import worker
import actions_import


class ActionsImportTests(unittest.TestCase):
    def fixture(self, root):
        output=root/'payload/.vercel/output';output.mkdir(parents=True)
        (output/'config.json').write_text('{"version":3}')
        settings={'projectId':'prj_1','orgId':'team_1','settings':{'rootDirectory':None}}
        (root/'payload/.vercel/project.json').write_text(json.dumps(settings))
        (root/'payload/vercel.json').write_text('{"regions":["fra1"]}')
        tar=worker.pack(root/'payload')
        descriptor={'id':'1','name':'lunares-panel-'+'a'*40,'repositoryID':'42','repository':'owner/repo','ref':'refs/heads/main','runID':'50','runAttempt':1,'workflowPath':'.github/workflows/build.yml'}
        manifest={'schemaVersion':1,'component':'panel','repository':'owner/repo','commit':'a'*40,'ref':'refs/heads/main','workflow':descriptor['workflowPath'],'runId':'50','runAttempt':1,'artifact':{'file':'artifact.tar','sha256':hashlib.sha256(tar).hexdigest()},'builtAt':'2026-10-10T00:00:00Z','vercel':{'cliVersion':'63.1.2','nodeMajor':24,'target':'production','sourceDirectory':'web','project':settings}}
        job={'buildProvider':'github-actions','buildID':'1','customerID':'2','projectID':'3','generation':1,'repositoryID':'42','sourceSHA':'a'*40,'recipe':'vercel','rootDirectory':'web','vercelSettings':settings,'actionsArtifact':descriptor}
        return job,manifest,tar

    def zip(self, manifest, tar, extra=None):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('artifact.tar',tar);z.writestr('manifest.json',json.dumps(manifest))
            if extra:z.writestr(*extra)
        return buf.getvalue()

    def test_verified_import_discards_project_files_and_never_executes(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);job,m,tar=self.fixture(root);store=root/'store';store.mkdir(mode=0o700)
            data=self.zip(m,tar)
            job['actionsArtifact'].update(sizeBytes=len(data),digest='sha256:'+hashlib.sha256(data).hexdigest())
            with patch.object(actions_import,'download',return_value=data),patch.object(worker,'run_bounded',side_effect=AssertionError('no execution')):
                artifact,logs=actions_import.import_artifact({'artifactRoot':str(store)},job)
            unpacked=root/'verified';unpacked.mkdir();worker.unpack((store/artifact['storageKey']).read_bytes(),unpacked)
            self.assertEqual([p.name for p in unpacked.iterdir()],['config.json'])
            self.assertEqual(artifact['kind'],'vercel')

    def test_manifest_identity_and_transport_checksum_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);job,m,tar=self.fixture(root)
            for field,value in [('commit','b'*40),('runId','51'),('runAttempt',2),('repository','evil/repo'),('ref','refs/heads/evil'),('workflow','evil.yml'),('vercel',{})]:
                with self.subTest(field=field):
                    changed={**m,field:value}
                    with self.assertRaises(worker.Rejected):actions_import.verify_manifest(changed,job,tar)
            data=self.zip(m,tar);job['actionsArtifact'].update(sizeBytes=len(data),digest='sha256:'+'0'*64)
            with patch.object(actions_import,'download',return_value=data),self.assertRaises(worker.Rejected):actions_import.import_artifact({'artifactRoot':d},job)

    def test_zip_rejects_extra_duplicate_and_symlink(self):
        for name in ['../escape','artifact.tar','source.js']:
            with self.subTest(name=name),self.assertRaises(worker.Rejected):actions_import.unpack_zip(self.zip({},b'bad',(name,b'x')))
        link=zipfile.ZipInfo('artifact.tar');link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:z.writestr(link,'target');z.writestr('manifest.json','{}')
        with self.assertRaises(worker.Rejected):actions_import.unpack_zip(buf.getvalue())

    def test_download_origin_policy(self):
        for url in ['http://productionresultssa1.blob.core.windows.net/a','https://evil.blob.core.windows.net/a','https://results-receiver.actions.githubusercontent.com.evil/a','https://user@productionresultssa1.blob.core.windows.net/a']:
            with self.subTest(url=url),self.assertRaises(worker.Rejected):actions_import.validate_download_url(url)
        actions_import.validate_download_url('https://productionresultssa1.blob.core.windows.net/a?sig=x')

    def test_artifact_only_never_falls_back_to_vm(self):
        with patch.object(worker,'Control'),patch.object(worker,'execute_vm',side_effect=AssertionError('VM forbidden')),patch.object(worker,'run_once',return_value=False),patch('publisher.run_once',return_value=False):
            self.assertFalse(worker.run_turn({'isolation':'artifact-only'},False))

    def test_artifact_only_config_without_image_or_kvm(self):
        with tempfile.TemporaryDirectory() as d:
            config={'country':'ZZ','locationEvidence':'Location unverified','isolation':'artifact-only','isolationEvidence':'Customer execution occurs on GitHub Actions only','storageEvidence':'Private local store','credentialFile':'/credential','controlURL':'https://auth.example/worker','artifactRoot':d}
            with patch.object(worker,'private_file'),patch.object(worker.Path,'exists',side_effect=AssertionError('KVM probe forbidden')):
                worker.validate_config(config)

    def test_artifact_only_claim_rejects_build_job_without_executing(self):
        job={'buildID':'1','generation':1,'buildProvider':'isolated-worker'}
        class Control:
            def __init__(self):self.results=[]
            def request(self,path,body):
                if path=='/claim':return job
                if path=='/complete':self.results.append(body);return {}
                raise AssertionError('source fetch forbidden')
        control=Control()
        with patch.object(worker,'Control',return_value=control),patch.object(worker,'execute_vm',side_effect=AssertionError('VM forbidden')),patch.object(actions_import,'import_artifact',side_effect=AssertionError('import forbidden')):
            worker.run_once({'isolation':'artifact-only'})
        self.assertEqual(control.results[0]['status'],'failed')

    def test_actions_claim_only_imports_and_completes(self):
        job={'buildID':'1','generation':1,'buildProvider':'github-actions'}
        class Control:
            def __init__(self):self.results=[]
            def request(self,path,body):
                if path=='/claim':return job
                if path=='/complete':self.results.append(body);return {}
                raise AssertionError('source fetch forbidden')
        control=Control()
        with patch.object(worker,'Control',return_value=control),patch.object(worker,'execute_vm',side_effect=AssertionError('VM forbidden')),patch.object(actions_import,'import_artifact',return_value=({'kind':'vercel'},'imported')):
            worker.run_once({'isolation':'artifact-only'})
        self.assertEqual(control.results,[{'buildID':'1','generation':1,'status':'succeeded','artifact':{'kind':'vercel'},'logs':'imported'}])

class ZipPreflightTests(unittest.TestCase):
    def test_directory_count_checked_before_zip_parser(self):
        import struct
        data=b'PK\x05\x06'+struct.pack('<4H2IH',0,0,65000,65000,4000000,0,0)
        with patch.object(actions_import.zipfile,'ZipFile',side_effect=AssertionError('parser must not allocate')),self.assertRaises(worker.Rejected):
            actions_import.unpack_zip(data)
