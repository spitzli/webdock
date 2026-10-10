#!/usr/bin/env python3
"""Installed in the immutable VM image; never execute this on a hosting/control node."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import worker

VERCEL_VERSION='63.1.2'


def build(job,source,output):
    env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/tmp/build-home','CI':'1',**job['buildEnvironment']}
    if job.get('egressProxy'):
        env.update(HTTP_PROXY=job['egressProxy'],HTTPS_PROXY=job['egressProxy'],http_proxy=job['egressProxy'],https_proxy=job['egressProxy'])
    Path(env['HOME']).mkdir(mode=0o700,exist_ok=True)
    root=source/job['rootDirectory'];output.mkdir()
    if job['recipe']=='dockerfile':
        if not (root/'Dockerfile').is_file():raise worker.Rejected('missing_dockerfile')
        # BuildKit and all build processes exist only inside this VM.
        command=['/usr/local/bin/buildctl','build','--frontend','dockerfile.v0','--local','context='+str(root),'--local','dockerfile='+str(root),'--output','type=oci,dest='+str(output/'image.tar')]
        for key,value in {**job['buildEnvironment'],**({k:env[k] for k in ('HTTP_PROXY','HTTPS_PROXY')} if job.get('egressProxy') else {})}.items():command+=['--opt','build-arg:'+key+'='+value]
    else:
        version=worker.run_bounded(['/usr/local/bin/vercel','--version'],timeout=10).decode()
        if VERCEL_VERSION not in version:raise worker.Rejected('cli_version_mismatch')
        project=root/'.vercel';shutil.rmtree(project,ignore_errors=True);project.mkdir()
        settings=job['vercelSettings'];settings['settings']['installCommand']='npm ci'
        (project/'project.json').write_text(json.dumps(settings))
        if not (root/'package-lock.json').is_file():raise worker.Rejected('lockfile_required')
        worker.run_bounded(['/usr/bin/npm','ci','--ignore-scripts=false'],cwd=root,env=env,timeout=job['limits']['durationSeconds']-20,max_bytes=worker.MAX_LOG,file_limit=job['limits']['diskBytes'])
        # CLI receives target settings prepared by the trusted service, with no pull/token.
        command=['/usr/local/bin/vercel','build','--prod','--yes']
    logs=worker.run_bounded(command,cwd=root,env=env,timeout=job['limits']['durationSeconds']-10,max_bytes=worker.MAX_LOG,file_limit=job['limits']['diskBytes'])
    if job['recipe']=='vercel':
        worker.tree_size(root/'.vercel/output')
        shutil.copytree(root/'.vercel/output',output,dirs_exist_ok=True)
    return logs


def build_result(job,source,result):
    success=False
    try:
        logs=build(job,source,result/'artifact');success=True
    except worker.BuildFailed as error:
        logs=error.logs or 'Build execution failed.'
    except Exception:
        logs='Build execution failed.'
    (result/'status.json').write_text(json.dumps({'success':success}))
    (result/'build.log').write_text(worker.redact_logs(logs,job.get('buildEnvironment',{})))
    if not success:
        # Partial hostile output must not prevent delivery of bounded failure logs.
        artifact=result/'artifact'
        if artifact.is_symlink():artifact.unlink()
        elif artifact.exists():shutil.rmtree(artifact)


def write_result(channel,data):
    pending=memoryview(data)
    while pending:
        written=channel.write(pending)
        if not written:raise OSError('result_channel_closed')
        pending=pending[written:]


def main():
    # The read-only input disk avoids fw_cfg's bytewise port-I/O for bulk archives.
    with tempfile.TemporaryDirectory(prefix='build-') as directory:
        temp=Path(directory);source=temp/'input';source.mkdir();result=temp/'result';result.mkdir()
        try:
            with open('/dev/disk/by-id/virtio-webdock-input','rb') as disk:
                blob=disk.read(worker.MAX_OUTPUT+1)
            if len(blob)>worker.MAX_OUTPUT:raise worker.Rejected('source_limit')
            worker.unpack(blob,source,worker.MAX_SOURCE)
            job=json.loads((source/'job.json').read_text())
            build_result(job,source/'source',result)
        except Exception:
            (result/'status.json').write_text('{"success":false}')
            (result/'build.log').write_text('Build input could not be prepared.')
        with open('/dev/virtio-ports/webdock.result','wb',buffering=0) as channel:
            write_result(channel,worker.pack(result))
    subprocess.run(['/sbin/poweroff','-f'],check=False)

if __name__=='__main__':main()
