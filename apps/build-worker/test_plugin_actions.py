import hashlib
import io
import json
import tempfile
import subprocess
import urllib.error
import unittest
from pathlib import Path
from unittest.mock import patch
import zipfile

import actions_import
import plugin_source
import worker

try:
    import plugin_actions as actions
except ImportError:
    actions = None

SHA = 'a' * 40
INSTALLATION_TOKEN = 'ghs_1424574274_' + 'A' * 100 + '.' + 'B' * 150 + '.' + 'C' * 123
CONFIG = {'controlURL':'https://api.example/v1/plugin-installer', 'github':{'appID':'1','installationID':'2','privateKeyFile':'/private/key','repository':'spitzli/private-builds','repositoryID':'42','workflow':'plugin-build.yml','ref':'main'}}
JOB = {'id':'123','claimToken':'00000000-0000-4000-8000-000000000001','projectID':'456','customerID':'789'}


def source():
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        z.writestr('tabularium.json','{"name":"example"}')
        z.writestr('Dockerfile','FROM scratch\n')
    return plugin_source.normalize_zip(out.getvalue())


class Control:
    def __init__(self): self.calls=[]
    def request(self,path,body):
        self.calls.append((path,body))
        return {'active':True} if path=='/lease' else {'accepted':True}


class GitHub:
    def __init__(self,config): self.calls=[]; self.private=True; self.run_sha=SHA; self.cancelled=False
    def request(self,path,body=None,**kwargs):
        self.calls.append((path,body))
        if path=='/repos/spitzli/private-builds': return {'id':42,'full_name':'spitzli/private-builds','private':self.private}
        if path.endswith('/actions/workflows/plugin-build.yml'): return {'id':7,'path':'.github/workflows/plugin-build.yml','state':'active'}
        if '/commits/' in path: return {'sha':SHA}
        if path.endswith('/dispatches'): return {'workflow_run_id':99,'run_url':'https://api.github.com/repos/spitzli/private-builds/actions/runs/99','html_url':'https://github.com/spitzli/private-builds/actions/runs/99'}
        if path.endswith('/cancel'): self.cancelled=True; return None
        if path.endswith('/actions/runs/99'): return {'id':99,'run_attempt':1,'event':'workflow_dispatch','head_sha':self.run_sha,'head_branch':'main','workflow_id':7,'path':'.github/workflows/plugin-build.yml','repository':{'id':42,'full_name':'spitzli/private-builds','private':True},'status':'completed','conclusion':'success'}
        if path.endswith('/artifacts?per_page=100'): return {'total_count':1,'artifacts':[{'id':77,'name':'webdock-plugin-123','expired':False,'size_in_bytes':4,'digest':'sha256:'+'b'*64,'workflow_run':{'id':99,'repository_id':42,'head_sha':SHA}}]}
        if path.endswith('/artifacts/77/zip'): return 'https://productionresultssa1.blob.core.windows.net/artifact?signature=private'
        raise AssertionError(path)


class PluginActionsTests(unittest.TestCase):
    def setUp(self): self.assertIsNotNone(actions,'private Actions builder missing')
    def test_deterministic_source_zip_roundtrip(self):
        archive=source()
        self.assertEqual(actions.source_zip(archive),actions.source_zip(archive))
        self.assertEqual(plugin_source.normalize_zip(actions.source_zip(archive)),archive)
    def test_dispatch_is_private_pinned_correlated_and_does_not_send_credentials(self):
        control=Control(); github=GitHub(CONFIG['github']); captured={}
        def imported(config,job): captured.update(job);return {'kind':'oci'},'verified'
        with patch.object(actions,'GitHub',return_value=github),patch.object(actions_import,'import_artifact',side_effect=imported):
            result=actions.build(CONFIG,control,JOB,{'archive':source(),'commit':'c'*40})
        self.assertEqual(result[0],{'kind':'oci'})
        prepare=next(body for path,body in control.calls if path=='/actions-prepare')
        self.assertEqual(prepare['workflowSHA'],SHA)
        self.assertEqual(prepare['sourceSHA256'],hashlib.sha256(source()).hexdigest())
        self.assertEqual(prepare['workflowRef'],'spitzli/private-builds/.github/workflows/plugin-build.yml@refs/heads/main')
        dispatch=next(body for path,body in github.calls if path.endswith('/dispatches'))
        self.assertTrue(dispatch['return_run_details'])
        self.assertEqual(dispatch['inputs']['id'],'123')
        self.assertNotIn('claimToken',json.dumps(dispatch))
        self.assertNotIn('credential',json.dumps(dispatch))
        self.assertEqual(next(body['runID'] for path,body in control.calls if path=='/actions-bind'),'99')
        self.assertEqual(captured['component'],'plugin')
        self.assertEqual(captured['expectedSourceSHA256'],prepare['sourceSHA256'])
        self.assertEqual(captured['sourceSHA'],SHA)
        self.assertEqual(captured['actionsArtifact']['runID'],'99')
    def test_public_repository_and_wrong_run_are_denied_before_import(self):
        for field,value in [('private',False),('run_sha','b'*40)]:
            github=GitHub(CONFIG['github']);setattr(github,field,value)
            with patch.object(actions,'GitHub',return_value=github),patch.object(actions_import,'import_artifact',side_effect=AssertionError('must not import')),self.assertRaises(worker.Rejected):
                actions.build(CONFIG,Control(),JOB,{'archive':source()})
    def test_lease_loss_cancels_dispatched_run(self):
        github=GitHub(CONFIG['github']);control=Control()
        original=control.request
        def request(path,body):
            if path=='/lease' and any(p=='/actions-bind' for p,_ in control.calls): return {'active':False}
            return original(path,body)
        control.request=request
        with patch.object(actions,'GitHub',return_value=github),self.assertRaises(worker.LeaseLost):
            actions.build(CONFIG,control,JOB,{'archive':source()})
        self.assertTrue(github.cancelled)
    def test_app_jwt_mints_only_repository_scoped_actions_and_contents_token(self):
        with tempfile.TemporaryDirectory() as directory:
            key=Path(directory)/'app.pem'
            key.write_bytes(subprocess.run(['/usr/bin/openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048'],capture_output=True,check=True).stdout)
            config={**CONFIG['github'],'privateKeyFile':str(key)}
            requests=[]
            def request(client,path,token,body=None,**kwargs):
                requests.append((path,token,body))
                return {'token':INSTALLATION_TOKEN}
            with patch.object(worker,'private_file',side_effect=Path),patch.object(actions.GitHub,'_request',autospec=True,side_effect=request):
                client=actions.GitHub(config)
            self.assertEqual(len(INSTALLATION_TOKEN),390)
            self.assertEqual(client.token,INSTALLATION_TOKEN)
            path,jwt,body=requests[0]
            self.assertEqual(path,'/app/installations/2/access_tokens')
            self.assertEqual(body,{'repository_ids':[42],'permissions':{'actions':'write','contents':'read'}})
            header,claims,signature=jwt.split('.')
            import base64
            decode=lambda part:base64.urlsafe_b64decode(part+'='*(-len(part)%4))
            self.assertEqual(json.loads(decode(header)),{'alg':'RS256','typ':'JWT'})
            self.assertEqual(json.loads(decode(claims))['iss'],'1')
            public=Path(directory)/'public.pem';public.write_bytes(subprocess.run(['/usr/bin/openssl','pkey','-in',str(key),'-pubout'],capture_output=True,check=True).stdout)
            sig=Path(directory)/'signature';sig.write_bytes(decode(signature))
            verified=subprocess.run(['/usr/bin/openssl','dgst','-sha256','-verify',str(public),'-signature',str(sig)],input=(header+'.'+claims).encode(),capture_output=True)
            self.assertEqual(verified.returncode,0)
    def test_installation_tokens_are_bounded_opaque_header_values(self):
        from types import SimpleNamespace
        valid=[INSTALLATION_TOKEN, 'ghs_42_'+'a'*510, 'opaque.future-token_+/='+'x'*100, 'x'*4096]
        invalid=['', 'x'*4097, 'token\r\nAuthorization: injected', 'token\n', 'token\tvalue', 'token\x00', 'token\x7f', 'token value', 'tökén', None, 123]
        with patch.object(worker,'private_file',side_effect=Path),patch.object(actions.subprocess,'run',return_value=SimpleNamespace(stdout=b'test-signature')):
            for token in valid:
                with self.subTest(length=len(token)),patch.object(actions.GitHub,'_request',return_value={'token':token}):
                    self.assertEqual(actions.GitHub(CONFIG['github']).token,token)
            for token in invalid:
                with self.subTest(kind=type(token).__name__),patch.object(actions.GitHub,'_request',return_value={'token':token}),self.assertRaises(worker.Rejected):
                    actions.GitHub(CONFIG['github'])

    def test_api_version_origin_and_redirect_policy_are_fixed(self):
        seen=[]
        class Opener:
            def open(self,request,timeout):
                seen.append(request)
                return io.BytesIO(b'{"ok":true}')
        client=object.__new__(actions.GitHub);client.token='ghs_test'
        with patch.object(actions.urllib.request,'build_opener',return_value=Opener()):
            self.assertEqual(client.request('/repos/spitzli/private-builds'),{'ok':True})
        request=seen[0]
        self.assertEqual(request.full_url,'https://api.github.com/repos/spitzli/private-builds')
        self.assertEqual(request.get_header('X-github-api-version'),'2026-03-10')
        self.assertEqual(request.get_header('Authorization'),'Bearer ghs_test')
        with self.assertRaises(worker.Rejected):client.request('//evil.test')
        class BadOpener:
            def open(self,request,timeout):raise urllib.error.HTTPError(request.full_url,302,'redirect',{'Location':'https://evil.test/?ghs_private'},None)
        with patch.object(actions.urllib.request,'build_opener',return_value=BadOpener()),self.assertRaises(worker.Rejected):client.request('/repos/spitzli/private-builds')
    def test_mismatched_artifact_is_rejected_before_download(self):
        github=GitHub(CONFIG['github']);original=github.request
        def request(path,body=None,**kwargs):
            value=original(path,body,**kwargs)
            if path.endswith('/artifacts?per_page=100'):value['artifacts'][0]['workflow_run']['head_sha']='b'*40
            return value
        github.request=request
        with patch.object(actions,'GitHub',return_value=github),patch.object(actions_import,'import_artifact',side_effect=AssertionError('must not import')),self.assertRaises(worker.Rejected):actions.build(CONFIG,Control(),JOB,{'archive':source()})
        self.assertFalse(any(path.endswith('/artifacts/77/zip') for path,_ in github.calls))

    def test_wait_is_bounded_and_cancels_without_run_matching_fallback(self):
        github=GitHub(CONFIG['github']);original=github.request;clock=[0]
        def request(path,body=None,**kwargs):
            value=original(path,body,**kwargs)
            if path.endswith('/actions/runs/99'):value['status']='queued';value['conclusion']=None
            return value
        github.request=request
        with patch.object(actions,'GitHub',return_value=github),patch.object(actions,'WAIT_SECONDS',1),patch.object(actions.time,'monotonic',side_effect=lambda:clock[0]),patch.object(actions.time,'sleep',side_effect=lambda amount:clock.__setitem__(0,clock[0]+amount)),self.assertRaisesRegex(worker.Rejected,'actions_build_timeout'):
            actions.build(CONFIG,Control(),JOB,{'archive':source()})
        self.assertTrue(github.cancelled)
        self.assertEqual(clock[0],1)
    def test_unconfirmed_dispatch_cannot_select_another_matching_run(self):
        github=GitHub(CONFIG['github']);original=github.request
        def request(path,body=None,**kwargs):return None if path.endswith('/dispatches') else original(path,body,**kwargs)
        github.request=request
        with patch.object(actions,'GitHub',return_value=github),self.assertRaisesRegex(worker.Rejected,'actions_dispatch_unconfirmed'):actions.build(CONFIG,Control(),JOB,{'archive':source()})
        self.assertFalse(any('/actions/runs' in path for path,_ in github.calls))

    def test_real_plugin_artifact_validation_never_executes_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);layout=root/'layout';(layout/'blobs/sha256').mkdir(parents=True)
            def blob(value,media):
                data=json.dumps(value).encode();digest=hashlib.sha256(data).hexdigest();(layout/'blobs/sha256'/digest).write_bytes(data)
                return {'mediaType':media,'digest':'sha256:'+digest,'size':len(data)}
            image_config=blob({'architecture':'amd64','os':'linux'},'application/vnd.oci.image.config.v1+json')
            image_manifest=blob({'schemaVersion':2,'config':image_config,'layers':[]},'application/vnd.oci.image.manifest.v1+json')
            (layout/'oci-layout').write_text('{"imageLayoutVersion":"1.0.0"}');(layout/'index.json').write_text(json.dumps({'schemaVersion':2,'manifests':[image_manifest]}))
            output=root/'output';output.mkdir();(output/'image.tar').write_bytes(worker.pack(layout));tar=worker.pack(output)
            manifest={'schemaVersion':1,'component':'plugin','sourceSHA256':'d'*64,'repository':'spitzli/private-builds','commit':SHA,'ref':'refs/heads/main','workflow':'.github/workflows/plugin-build.yml','runId':'99','runAttempt':1,'artifact':{'file':'artifact.tar','sha256':hashlib.sha256(tar).hexdigest()}}
            archive=io.BytesIO()
            with zipfile.ZipFile(archive,'w') as z:z.writestr('artifact.tar',tar);z.writestr('manifest.json',json.dumps(manifest))
            data=archive.getvalue();store=root/'store';store.mkdir(mode=0o700)
            job={'buildProvider':'github-actions','buildID':'123','customerID':'789','projectID':'456','generation':1,'recipe':'dockerfile','component':'plugin','expectedSourceSHA256':'d'*64,'sourceSHA':SHA,'repositoryID':'42','actionsArtifact':{'repository':'spitzli/private-builds','ref':'refs/heads/main','workflowPath':'.github/workflows/plugin-build.yml','runID':'99','runAttempt':1,'repositoryID':'42','digest':'sha256:'+hashlib.sha256(data).hexdigest(),'sizeBytes':len(data)}}
            with patch.object(actions_import,'download',return_value=data),patch.object(worker,'run_bounded',side_effect=AssertionError('payload execution forbidden')),patch.object(worker,'execute_vm',side_effect=AssertionError('KVM forbidden')):
                artifact,_=actions_import.import_artifact({'artifactRoot':str(store)},job)
            self.assertEqual(artifact['kind'],'oci')
            restored=root/'restored';restored.mkdir();worker.unpack((store/artifact['storageKey']).read_bytes(),restored)
            self.assertEqual({p.name for p in restored.iterdir()},{'image.tar'})
            self.assertEqual(worker.validate_oci(restored/'image.tar'),image_manifest['digest'])

    def test_plugin_manifest_requires_exact_source_hash_without_changing_hosting(self):
        tar=b'archive';job={'recipe':'dockerfile','component':'plugin','expectedSourceSHA256':'d'*64,'sourceSHA':SHA,'repositoryID':'42','actionsArtifact':{'repository':'spitzli/private-builds','ref':'refs/heads/main','workflowPath':'.github/workflows/plugin-build.yml','runID':'99','runAttempt':1,'repositoryID':'42'}}
        manifest={'schemaVersion':1,'component':'plugin','sourceSHA256':'d'*64,'repository':'spitzli/private-builds','commit':SHA,'ref':'refs/heads/main','workflow':'.github/workflows/plugin-build.yml','runId':'99','runAttempt':1,'artifact':{'file':'artifact.tar','sha256':hashlib.sha256(tar).hexdigest()}}
        actions_import.verify_manifest(manifest,job,tar)
        with self.assertRaises(worker.Rejected):actions_import.verify_manifest({**manifest,'sourceSHA256':'e'*64},job,tar)

if __name__=='__main__':unittest.main()
