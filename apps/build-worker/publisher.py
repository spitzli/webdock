#!/usr/bin/env python3
"""Trusted artifact-only publisher. Invoke only after fenced release authorization."""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import time
import datetime
import worker

VERCEL_VERSION='63.1.2'


def load_artifact(store,release,directory):
    for key in ('customerID','buildID','releaseID'):
        if not worker.ID.fullmatch(release[key]):raise worker.Rejected('invalid_release')
    digest=release['artifact']['digest'];key=release['artifact']['storageKey']
    if not worker.DIGEST.fullmatch(digest):raise worker.Rejected('invalid_artifact')
    pattern=re.escape(release['customerID']+'/'+release['buildID'])+r'/[1-9][0-9]*/'+digest[7:]+r'\.tar'
    if not re.fullmatch(pattern,key):raise worker.Rejected('artifact_owner_mismatch')
    path=Path(store)/key
    for ancestor in (path,*path.parents):
        if ancestor.is_symlink():raise worker.Rejected('unsafe_artifact')
    if path.stat().st_size>worker.MAX_OUTPUT:raise worker.Rejected('artifact_limit')
    data=path.read_bytes()
    if 'sha256:'+hashlib.sha256(data).hexdigest()!=digest or len(data)!=release['artifact']['sizeBytes']:raise worker.Rejected('artifact_checksum')
    worker.unpack(data,directory)


def publish_vercel(output,settings,token,release_id,runner=worker.run_bounded):
    """Any error after starting a write is ambiguous: the caller MUST reconcile."""
    if not worker.ID.fullmatch(release_id):raise worker.Rejected('invalid_release')
    if not re.fullmatch(r'prj_[A-Za-z0-9]+',settings['projectId']) or not re.fullmatch(r'(team|user)_[A-Za-z0-9]+',settings['orgId']):raise worker.Rejected('invalid_target')
    if VERCEL_VERSION not in runner(['/usr/local/bin/vercel','--version'],timeout=10).decode():raise worker.Rejected('cli_version_mismatch')
    with worker.vercel_workspace(output,settings) as workspace, tempfile.TemporaryDirectory(prefix='wd-vercel-auth-') as auth:
        authfile=Path(auth)/'auth.json';authfile.write_text(json.dumps({'token':token}));authfile.chmod(0o600)
        command=['/usr/local/bin/vercel','deploy','--prebuilt','--prod','--yes','--no-wait','--global-config',auth,'--meta','webdockReleaseID='+release_id]
        try:
            result=runner(command,cwd=workspace,env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':auth,'CI':'1','VERCEL_TELEMETRY_DISABLED':'1'},timeout=180,max_bytes=worker.MAX_LOG).decode()
            urls=re.findall(r'https://[a-zA-Z0-9-]+\.vercel\.app',result)
            if not urls:raise worker.PublicationUncertain('needs_reconciliation')
            return {'providerURL':urls[-1],'status':'deploying','releaseID':release_id}
        except Exception as error:raise worker.PublicationUncertain('needs_reconciliation') from error


def publish_oci(output,repository,authfile,release_id,runner=worker.run_bounded):
    if not re.fullmatch(r'[a-z0-9.-]+(?::[0-9]+)?/[a-z0-9/_-]+',repository) or '..' in repository or not worker.ID.fullmatch(release_id):raise worker.Rejected('invalid_registry')
    source=output/'image.tar';expected=worker.validate_oci(source)
    # Authfile is operator-created, repository-scoped write-only publishing credential.
    worker.private_file(authfile)
    with tempfile.TemporaryDirectory(prefix='wd-oci-') as directory:
        digestfile=Path(directory)/'digest'
        try:
            runner(['/usr/bin/skopeo','copy','--preserve-digests','--authfile',str(authfile),'--digestfile',str(digestfile),'oci-archive:'+str(source),'docker://'+repository+':release-'+release_id],timeout=180,max_bytes=worker.MAX_LOG)
            actual=digestfile.read_text().strip()
            if actual!=expected:raise worker.PublicationUncertain('digest_mismatch')
            return {'image':repository+'@'+actual,'digest':actual,'status':'published'}
        except Exception as error:raise worker.PublicationUncertain('needs_reconciliation') from error


def run_once(config,control):
    release=control.request('/release-claim',{})
    if not release:return False
    result={'releaseID':release['releaseID'],'generation':release['generation']}
    try:
        publication=control.request('/release-prepare',{'releaseID':release['releaseID'],'generation':release['generation']})
        with tempfile.TemporaryDirectory(prefix='wd-artifact-') as directory:
            output=Path(directory);load_artifact(config['artifactRoot'],release,output)
            if publication['kind']=='vercel':
                published=publish_vercel(output,publication['settings'],publication['token'],release['releaseID'])
                identity=control.request('/publication-record',{'releaseID':release['releaseID'],'generation':release['generation'],'providerURL':published['providerURL']})
                result.update(status='deploying',providerDeploymentID=identity['providerDeploymentID'])
            elif publication['kind']=='oci':
                # Repository and authfile come from local operator policy, never a job-selected path.
                registry=config['registryProjects'][release['projectID']]
                if registry['repository']!=publication['repository']:raise worker.Rejected('registry_owner_mismatch')
                published=publish_oci(output,registry['repository'],registry['authFile'],release['releaseID'])
                operation=control.request('/container-publish',{'releaseID':release['releaseID'],'generation':release['generation'],'image':published['image']})
                result.update(status='deploying',operationID=operation['operationID'])
            else:raise worker.Rejected('invalid_publication')
        control.request('/release-complete',result)
        deadline=datetime.datetime.fromisoformat(release['leaseUntil'].replace('Z','+00:00'))-datetime.timedelta(seconds=30)
        while datetime.datetime.now(datetime.timezone.utc)<deadline:
            observed=control.request('/observe',{key:result[key] for key in ('releaseID','generation','providerDeploymentID') if key in result})
            result.update(observed)
            if observed['status']!='deploying':break
            time.sleep(5)
        if result['status']=='deploying':result['status']='needs-reconciliation'
    except Exception:
        # This deliberately includes failures before writes: conservative recovery prevents duplicate deploys.
        result.update(status='needs-reconciliation')
    control.request('/release-complete',result)
    return True
