"""Import data produced on GitHub Actions; never execute artifact contents."""
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import stat
import tempfile
import urllib.parse
import urllib.request
import zipfile
import struct
import worker

MAX_ZIP=worker.MAX_OUTPUT+1024*1024


def validate_download_url(value):
    url=urllib.parse.urlsplit(value)
    # GitHub's documented Actions artifact endpoints. A signed URL is data, never an auth target.
    if url.scheme!='https' or url.port not in (None,443) or url.username or url.password or url.fragment or not re.fullmatch(r'(?:productionresultssa[0-9a-z]*\.blob\.core\.windows\.net|[a-z0-9-]+\.actions\.githubusercontent\.com)',url.hostname or ''):
        raise worker.Rejected('artifact_origin_denied')


def download(descriptor):
    validate_download_url(descriptor['downloadURL'])
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    with urllib.request.build_opener(NoRedirect).open(descriptor['downloadURL'],timeout=60) as response:
        data=response.read(MAX_ZIP+1)
    if len(data)>MAX_ZIP:raise worker.Rejected('artifact_limit')
    return data


def unpack_zip(data):
    try:
        # Bound central-directory parsing before ZipFile allocates one object per entry.
        end=data.rfind(b'PK\x05\x06',max(0,len(data)-65557))
        if end<0 or len(data)-end<22:raise worker.Rejected('unsafe_zip')
        disk,start,count_disk,count,size,offset,comment=struct.unpack_from('<4H2IH',data,end+4)
        if disk or start or count_disk!=2 or count!=2 or size>8192 or offset+size>end or end+22+comment!=len(data) or data[max(0,end-20):end].startswith(b'PK\x06\x07'):
            raise worker.Rejected('unsafe_zip')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members=archive.infolist()
            if len(members)!=2 or {m.filename for m in members}!={'artifact.tar','manifest.json'}:raise worker.Rejected('unsafe_zip')
            for member in members:
                mode=member.external_attr>>16
                if member.flag_bits & 1 or member.is_dir() or stat.S_IFMT(mode) not in (0,stat.S_IFREG) or member.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED):raise worker.Rejected('unsafe_zip')
                if member.file_size>(65536 if member.filename=='manifest.json' else worker.MAX_OUTPUT):raise worker.Rejected('artifact_limit')
            return json.loads(archive.read('manifest.json')),archive.read('artifact.tar')
    except (zipfile.BadZipFile,ValueError,UnicodeError,RuntimeError) as error:raise worker.Rejected('unsafe_zip') from error


def verify_manifest(manifest,job,tar):
    a=job['actionsArtifact'];component='panel' if job['recipe']=='vercel' else 'bot'
    expected={'schemaVersion':1,'component':component,'repository':a['repository'],'commit':job['sourceSHA'],'ref':a['ref'],'workflow':a['workflowPath']}
    if not isinstance(manifest,dict) or any(manifest.get(k)!=v for k,v in expected.items()) or str(manifest.get('runAttempt'))!='1' or str(manifest.get('runId'))!=str(a['runID']) or a['runAttempt']!=1 or str(a['repositoryID'])!=str(job['repositoryID']):raise worker.Rejected('artifact_identity_mismatch')
    if manifest.get('artifact')!={'file':'artifact.tar','sha256':hashlib.sha256(tar).hexdigest()}:raise worker.Rejected('artifact_checksum')
    if job['recipe']=='vercel':
        settings=normalized_settings(job)
        expected={'cliVersion':'63.1.2','nodeMajor':24,'target':'production','sourceDirectory':job['rootDirectory'],'project':settings}
        if manifest.get('vercel')!=expected:raise worker.Rejected('artifact_target_mismatch')


def normalized_settings(job):
    settings=job['vercelSettings']
    return {**settings,'settings':{**settings['settings'],'rootDirectory':None}}


def import_artifact(config,job):
    for key in ('customerID','buildID','projectID'):
        if not worker.ID.fullmatch(job[key]):raise worker.Rejected('invalid_job')
    if job.get('buildProvider')!='github-actions' or job['recipe'] not in ('dockerfile','vercel') or not worker.SHA.fullmatch(job['sourceSHA']) or type(job['generation']) is not int or job['generation']<1:raise worker.Rejected('invalid_job')
    descriptor=job['actionsArtifact']
    if not worker.DIGEST.fullmatch(descriptor['digest']) or type(descriptor['sizeBytes']) is not int or not 0<descriptor['sizeBytes']<=MAX_ZIP:raise worker.Rejected('invalid_artifact')
    data=download(descriptor)
    if len(data)!=descriptor['sizeBytes'] or 'sha256:'+hashlib.sha256(data).hexdigest()!=descriptor['digest']:raise worker.Rejected('artifact_checksum')
    manifest,tar=unpack_zip(data);verify_manifest(manifest,job,tar)
    with tempfile.TemporaryDirectory(prefix='wd-actions-') as directory:
        root=Path(directory);worker.unpack(tar,root)
        if job['recipe']=='vercel':
            if {p.name for p in root.iterdir()}!={'.vercel','vercel.json'} or {p.name for p in (root/'.vercel').iterdir()}!={'output','project.json'}:raise worker.Rejected('invalid_vercel_output')
            project=json.loads((root/'.vercel/project.json').read_text());settings=normalized_settings(job)
            if project!=settings:raise worker.Rejected('artifact_target_mismatch')
            if json.loads((root/'vercel.json').read_text())!={'regions':['fra1']}:raise worker.Rejected('artifact_target_mismatch')
            output=root/'.vercel/output';worker.validate_vercel(output)
        else:
            if {p.name for p in root.iterdir()}!={'image.tar'}:raise worker.Rejected('invalid_oci')
            worker.validate_oci(root/'image.tar');output=root
        artifact=worker.pack(output)
    digest=hashlib.sha256(artifact).hexdigest();key=f"{job['customerID']}/{job['buildID']}/{job['generation']}/{digest}.tar"
    store=Path(config['artifactRoot']);maximum=config.get('maxStoreBytes',20*1024**3)
    if type(maximum) is not int or not worker.MAX_OUTPUT<=maximum<=200*1024**3:raise worker.Rejected('invalid_storage_limit')
    if shutil.disk_usage(store).free<len(artifact) or sum(p.stat().st_size for p in store.rglob('*') if p.is_file())+len(artifact)>maximum:raise worker.Rejected('artifact_store_full')
    destination=store/key;destination.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with destination.open('xb') as file:file.write(artifact)
    return {'kind':'vercel' if job['recipe']=='vercel' else 'oci','digest':'sha256:'+digest,'storageKey':key,'sizeBytes':len(artifact)},'Verified GitHub Actions artifact imported; no customer code executed on Webdock.'
