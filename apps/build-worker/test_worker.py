import io
import json
import pathlib
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import worker


def archive(name='src/package.json', kind=tarfile.REGTYPE, data=b'{}'):
    buf=io.BytesIO()
    with tarfile.open(fileobj=buf,mode='w') as t:
        m=tarfile.TarInfo(name);m.type=kind;m.size=len(data) if kind==tarfile.REGTYPE else 0;m.linkname='/etc/passwd'
        t.addfile(m,io.BytesIO(data))
    return buf.getvalue()

class BoundaryTests(unittest.TestCase):
    def test_hostile_archives(self):
        for name,kind in [('../escape',tarfile.REGTYPE),('/escape',tarfile.REGTYPE),('a',tarfile.SYMTYPE),('a',tarfile.LNKTYPE),('a',tarfile.CHRTYPE)]:
            with self.subTest(name=name,kind=kind), tempfile.TemporaryDirectory() as d:
                with self.assertRaises(worker.Rejected):worker.unpack(archive(name,kind),pathlib.Path(d),10000)
    def test_archive_expansion_and_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(worker.Rejected):worker.unpack(archive(data=b'a'*100),pathlib.Path(d),10)
    def test_no_control_credentials_in_guest_request(self):
        job={'buildID':'1','customerID':'2','projectID':'3','generation':1,'sourceSHA':'a'*40,'rootDirectory':'.','recipe':'dockerfile','buildEnvironment':{'PUBLIC_VALUE':'hello'},'token':'SECRET','limits':{'cpu':2,'memoryMiB':1024,'diskBytes':10000000,'durationSeconds':300}}
        data=worker.guest_request(job)
        self.assertNotIn('SECRET',json.dumps(data)); self.assertNotIn('token',data)
        job['buildEnvironment']={'VERCEL_TOKEN':'SECRET'}
        with self.assertRaises(worker.Rejected):worker.guest_request(job)
    def test_missing_evidence_fails_closed(self):
        with self.assertRaises(worker.Rejected):worker.validate_config({})
    def test_geography_is_metadata_and_unknown_location_is_explicit(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);image=root/'base.raw';image.write_bytes(b'pinned-image')
            config={'country':'US','isolation':'qemu-kvm','locationEvidence':'Operator location record',
                    'isolationEvidence':'Verified real KVM isolation record','storageEvidence':'Verified storage record',
                    'controlURL':'https://auth.example/worker','imageSHA256':hashlib.sha256(image.read_bytes()).hexdigest(),
                    'image':str(image),'credentialFile':str(root/'credential'),'artifactRoot':str(root)}
            with patch('worker.private_file',side_effect=lambda path:pathlib.Path(path)), patch('worker.Path.exists',return_value=True):
                worker.validate_config(config)
                worker.validate_config({**config,'country':'ZZ','locationEvidence':'Local host geographic location unverified'})
                for country,evidence in [('us','Location record'),('USA','Location record'),('','Location record'),('ZZ','Location record'),('US','')]:
                    with self.subTest(country=country,evidence=evidence), self.assertRaises(worker.Rejected):
                        worker.validate_config({**config,'country':country,'locationEvidence':evidence})
    def test_qemu_no_host_shares_or_network(self):
        args=worker.qemu_command('/base.raw','/input.tar','/out.tar',{'cpu':2,'memoryMiB':1024,'diskBytes':10000000,'durationSeconds':300})
        self.assertIn('-nic',args);self.assertIn('none',args)
        self.assertNotIn('-virtfs',args);self.assertNotIn('-snapshot',args)
        self.assertIn('file=/base.raw,format=raw,if=none,id=root,readonly=off,snapshot=on',args)
        self.assertIn('file=/input.tar,format=raw,if=none,id=input,readonly=on',args)
    def test_vercel_regions_reject_us(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);(p/'functions/a.func').mkdir(parents=True)
            (p/'config.json').write_text('{"version":3}')
            (p/'functions/a.func/.vc-config.json').write_text('{"runtime":"nodejs24.x","regions":["iad1"]}')
            with self.assertRaises(worker.Rejected):worker.validate_vercel(p)
    def test_publisher_excludes_repo_hooks(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);out=p/'output';out.mkdir();(out/'config.json').write_text('{"version":3}')
            (p/'vercel.ts').write_text('steal()')
            with worker.vercel_workspace(out,{'projectId':'prj_123','orgId':'team_123'}) as work:
                self.assertFalse((work/'vercel.ts').exists())
                self.assertEqual(set(x.name for x in work.iterdir()),{'.vercel','vercel.json'})
    def test_bounded_command_output(self):
        with self.assertRaises(worker.Rejected):worker.run_bounded(['/usr/bin/python3','-c','print("a"*100000)'],timeout=10,max_bytes=100)

if __name__=='__main__':unittest.main()

class EgressTests(unittest.TestCase):
    def test_proxy_denies_private_and_nonallowlisted(self):
        import egress_proxy
        with self.assertRaises(worker.Rejected):egress_proxy.resolve('control.example',{'registry.npmjs.org'})
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(worker.Rejected):egress_proxy.resolve('registry.npmjs.org',{'registry.npmjs.org'})
    def test_proxy_guest_fwd_is_only_network_path(self):
        command=worker.qemu_command('/base','/in','/out',{'cpu':1,'memoryMiB':512},True)
        self.assertIn('user,id=net0,restrict=on,guestfwd=tcp:10.0.2.100:3128-tcp:127.0.0.1:3128',command)

class ArchiveRegressionTests(unittest.TestCase):
    def test_duplicate_and_pax_escape(self):
        for pax in (False,True):
            buf=io.BytesIO()
            with tarfile.open(fileobj=buf,mode='w',format=tarfile.PAX_FORMAT) as archive_file:
                member=tarfile.TarInfo('file');member.size=1
                if pax:member.pax_headers={'path':'../../escape'}
                archive_file.addfile(member,io.BytesIO(b'x'))
                if not pax:archive_file.addfile(member,io.BytesIO(b'x'))
            with tempfile.TemporaryDirectory() as d:
                with self.assertRaises(worker.Rejected):worker.unpack(buf.getvalue(),pathlib.Path(d))
    def test_source_descriptor_rejects_other_origin_and_sha(self):
        job={'sourceSHA':'a'*40,'repositoryID':'1'}
        with self.assertRaises(worker.Rejected):worker.download_source({'url':'https://evil.example/x','sha':'a'*40,'repositoryID':'1'},job)
        with self.assertRaises(worker.Rejected):worker.download_source({'url':'https://codeload.github.com/x','sha':'b'*40,'repositoryID':'1'},job)
    def test_job_limits_and_guest_isolation_whitelist(self):
        job={'buildID':'1','customerID':'2','projectID':'3','generation':1,'sourceSHA':'a'*40,'rootDirectory':'../../oops','recipe':'dockerfile','limits':{'cpu':2,'memoryMiB':1024,'diskBytes':10000000,'durationSeconds':300}}
        with self.assertRaises(worker.Rejected):worker.guest_request(job)
        job['rootDirectory']='.';job['limits']['cpu']=9
        with self.assertRaises(worker.Rejected):worker.guest_request(job)

class ArchivePermissionTests(unittest.TestCase):
    def test_preserves_container_runtime_permissions_without_special_bits(self):
        data=io.BytesIO()
        with tarfile.open(fileobj=data,mode='w',format=tarfile.USTAR_FORMAT) as archive_file:
            for name,mode in [('public',0o644),('executable',0o4755),('private',0o600)]:
                entry=tarfile.TarInfo(name);entry.size=1;entry.mode=mode
                archive_file.addfile(entry,io.BytesIO(b'x'))
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);worker.unpack(data.getvalue(),root)
            self.assertEqual((root/'public').stat().st_mode & 0o7777,0o644)
            self.assertEqual((root/'executable').stat().st_mode & 0o7777,0o755)
            self.assertEqual((root/'private').stat().st_mode & 0o7777,0o600)

class GuestResultTransportTests(unittest.TestCase):
    def test_retries_short_virtio_writes_without_truncating_artifact(self):
        import guest
        result=bytearray()
        class ShortChannel:
            def write(self,data):
                result.extend(data[:3]);return min(3,len(data))
        guest.write_result(ShortChannel(),b'complete-result-tar')
        self.assertEqual(result,b'complete-result-tar')
    def test_closed_result_channel_fails_without_spinning(self):
        import guest
        class ClosedChannel:
            def write(self,data):return 0
        with self.assertRaises(OSError):guest.write_result(ClosedChannel(),b'x')

class VMTransportTests(unittest.TestCase):
    def test_fake_vm_uses_fresh_input_and_tenant_artifact_paths(self):
        paths=[]
        def fake_qemu(command,**kwargs):
            input_arg=next(arg for arg in command if 'id=input,readonly=on' in arg)
            self.assertIn('virtio-blk-pci,drive=input,serial=webdock-input',command)
            self.assertNotIn('-fw_cfg',command)
            self.assertIn('virtio-blk-pci,drive=root,bootindex=1',command)
            input_path=pathlib.Path(input_arg.split('file=',1)[1].split(',format=',1)[0]);paths.append(str(input_path))
            self.assertNotIn(b'host-control-secret',input_path.read_bytes())
            out_arg=command[command.index('-chardev')+1];out_path=pathlib.Path(out_arg.split('path=',1)[1])
            with tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);(root/'status.json').write_text('{"success":true}')
                (root/'build.log').write_text('ok');(root/'artifact').mkdir();(root/'artifact/config.json').write_text('{"version":3}')
                out_path.write_bytes(worker.pack(root))
            return b''
        with tempfile.TemporaryDirectory() as d,patch.object(worker,'run_bounded',fake_qemu):
            store=pathlib.Path(d)/'store';store.mkdir()
            image=pathlib.Path(d)/'base.raw';image.write_bytes(b'base')
            config={'artifactRoot':str(store),'image':str(image),'token':'host-control-secret'}
            job={'buildID':'1','customerID':'2','projectID':'3','generation':1,'sourceSHA':'a'*40,'rootDirectory':'src','recipe':'vercel','vercelSettings':{'projectId':'prj_1','orgId':'team_1','settings':{}},'limits':{'cpu':2,'memoryMiB':1024,'diskBytes':5*1024**3,'durationSeconds':300}}
            first,_=worker.execute_vm(config,job,archive())
            job['customerID']='4'
            second,_=worker.execute_vm(config,job,archive())
            self.assertNotEqual(paths[0],paths[1]);self.assertTrue(all(not pathlib.Path(p).exists() for p in paths))
            self.assertTrue(first['storageKey'].startswith('2/1/1/'));self.assertTrue(second['storageKey'].startswith('4/1/1/'))

class PrebuiltMetadataTests(unittest.TestCase):
    def test_function_file_maps_cannot_escape_publisher_workspace(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'config.json').write_text('{"version":3}')
            function=root/'functions/a.func';function.mkdir(parents=True)
            (function/'.vc-config.json').write_text(json.dumps({'runtime':'nodejs24.x','regions':['fra1'],'handler':'index.js','filePathMap':{'x':'../../auth.json'}}))
            with self.assertRaises(worker.Rejected):worker.validate_vercel(root)

class WorkerProtocolTests(unittest.TestCase):
    def test_failed_build_uses_control_plane_failure_code_format(self):
        calls=[]
        class FakeControl:
            def __init__(self,config):pass
            def request(self,path,body=None):
                calls.append((path,body))
                if path=='/claim':return {'buildID':'1','generation':1}
                if path=='/complete':return {'status':'failed'}
                raise AssertionError(path)
        with patch.object(worker,'Control',FakeControl):self.assertTrue(worker.run_once({}))
        self.assertEqual(calls[-1][0],'/complete')
        self.assertRegex(calls[-1][1]['failureCode'],r'^[A-Z0-9_]{1,80}$')

class FailedBuildLogsTests(unittest.TestCase):
    def test_command_failure_keeps_bounded_diagnostics(self):
        with self.assertRaises(worker.BuildFailed) as failure:
            worker.run_bounded(['/usr/bin/python3','-c','import sys; print("compile error: missing export"); sys.exit(2)'],timeout=5,max_bytes=100)
        self.assertIn('missing export',failure.exception.logs)
        with self.assertRaises(worker.BuildFailed) as oversized:
            worker.run_bounded(['/usr/bin/python3','-c','print("x"*10000)'],timeout=5,max_bytes=100)
        self.assertLessEqual(len(oversized.exception.logs.encode()),100)
    def test_guest_failure_preserves_and_redacts_logs(self):
        import guest
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);result=root/'result';result.mkdir()
            with patch.object(guest,'build',side_effect=worker.BuildFailed('execution_failed',b'compile error app-token-long app-token')):
                guest.build_result({'buildEnvironment':{'SMALL':'app-token','LARGE':'app-token-long'}},root,result)
            self.assertEqual(json.loads((result/'status.json').read_text()),{'success':False})
            logs=(result/'build.log').read_text();self.assertIn('compile error',logs);self.assertNotIn('app-token',logs);self.assertNotIn('-long',logs)
    def test_failed_vm_logs_survive_worker_completion(self):
        import datetime
        calls=[]
        job={'buildID':'1','customerID':'2','projectID':'3','repositoryID':'4','generation':1,'sourceSHA':'a'*40,'rootDirectory':'src','recipe':'dockerfile','buildEnvironment':{'VALUE':'private-value'},'limits':{'cpu':2,'memoryMiB':1024,'diskBytes':10000000,'durationSeconds':300},'leaseUntil':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=10)).isoformat()}
        class FakeControl:
            def __init__(self,config):pass
            def request(self,path,body=None):
                calls.append((path,body))
                if path=='/claim':return job
                return {}
        def fake_qemu(command,**kwargs):
            output=pathlib.Path(command[command.index('-chardev')+1].split('path=',1)[1])
            with tempfile.TemporaryDirectory() as d:
                result=pathlib.Path(d);(result/'status.json').write_text('{"success":false}');(result/'build.log').write_text('compile error private-value')
                output.write_bytes(worker.pack(result))
            return b''
        with patch.object(worker,'Control',FakeControl),patch.object(worker,'download_source',return_value=archive()),patch.object(worker,'run_bounded',fake_qemu):
            with tempfile.TemporaryDirectory() as fixture:
                base=pathlib.Path(fixture)/'base.raw';base.write_bytes(b'raw-image-fixture')
                store=pathlib.Path(fixture)/'store';store.mkdir()
                job['limits']['diskBytes']=5*1024**3
                self.assertTrue(worker.run_once({'image':str(base),'artifactRoot':str(store)}))
        completion=calls[-1][1]
        self.assertEqual(completion['status'],'failed');self.assertEqual(completion['failureCode'],'BUILD_FAILED')
        self.assertIn('compile error',completion['logs']);self.assertNotIn('private-value',completion['logs'])
    def test_success_and_partial_secret_suffix_redaction(self):
        logs=worker.redact_logs('ok app-token-long partial app-t',{'A':'app-token','B':'app-token-long'})
        self.assertIn('ok',logs);self.assertNotIn('app-t',logs);self.assertNotIn('-long',logs)

class CancellationTests(unittest.TestCase):
    def test_lease_cancellation_kills_only_its_subprocess_group(self):
        import subprocess,time,os
        survivor=subprocess.Popen(['/usr/bin/python3','-c','import time; time.sleep(30)'],start_new_session=True)
        calls=[]
        def cancelled():calls.append(True);raise worker.LeaseLost('cancelled')
        started=time.monotonic()
        try:
            with self.assertRaises(worker.LeaseLost):
                worker.run_bounded(['/usr/bin/python3','-c','import subprocess,time; subprocess.Popen(["/usr/bin/python3","-c","import time; time.sleep(30)"]); print("running",flush=True); time.sleep(30)'],timeout=20,lease_check=cancelled,poll_interval=0.05)
            self.assertLess(time.monotonic()-started,2)
            self.assertIsNone(survivor.poll());self.assertTrue(calls)
        finally:
            survivor.kill();survivor.wait()
    def test_lease_callback_network_error_fails_closed(self):
        with self.assertRaises(worker.LeaseLost):
            worker.run_bounded(['/usr/bin/python3','-c','import time; time.sleep(30)'],timeout=20,lease_check=lambda:(_ for _ in ()).throw(TimeoutError()),poll_interval=0.01)
