#!/usr/bin/env python3
"""Trusted helper for the dedicated private GitHub-hosted plugin build repository."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

import plugin_source
import worker

MAX_ARTIFACT = worker.MAX_OUTPUT


def request_json(url, headers, body=None):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    request = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
        raw = response.read(131073)
    if len(raw) > 131072: raise worker.Rejected('source_response_limit')
    return json.loads(raw)


def oidc(identity):
    url = urllib.parse.urlsplit(os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password:
        raise worker.Rejected('invalid_oidc_endpoint')
    query = urllib.parse.parse_qsl(url.query)
    query.append(('audience', identity))
    result = request_json(urllib.parse.urlunsplit(url._replace(query=urllib.parse.urlencode(query))),
                          {'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    token = result.get('value','')
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',token):
        raise worker.Rejected('invalid_oidc_token')
    print('::add-mask::' + token, flush=True)
    return token


def acquire(control_url, job_id, nonce):
    identity = 'webdock-plugin-build:' + job_id + ':' + nonce
    token, refreshed = oidc(identity), time.monotonic()
    deadline, bind_deadline = refreshed + 600, refreshed + 90
    result, metadata = bytearray(), None
    while time.monotonic() < deadline:
        if time.monotonic() - refreshed > 180:
            token, refreshed = oidc(identity), time.monotonic()
        try:
            part = request_json(control_url+'/actions-source', {'Authorization':'Bearer '+token,'Content-Type':'application/json'},
                                {'id':job_id,'nonce':nonce,'offset':len(result)})
        except urllib.error.HTTPError as error:
            error.close()
            if error.code == 503 and not result and time.monotonic() < bind_deadline:
                time.sleep(2)
                continue
            raise worker.Rejected('source_handoff_unavailable') from None
        current = {key:part[key] for key in ('sourceSHA256','projectID','customerID')}
        if part.get('commit') is not None: current['commit'] = part['commit']
        if (not re.fullmatch(r'[a-f0-9]{64}',current['sourceSHA256'])
                or any(not worker.ID.fullmatch(current[field]) for field in ('projectID','customerID'))
                or ('commit' in current and not worker.SHA.fullmatch(current['commit']))
                or metadata is not None and current != metadata):
            raise worker.Rejected('source_identity_mismatch')
        metadata = current
        data = base64.b64decode(part['data'], validate=True)
        if not data or len(data) > 65536 or len(result)+len(data)>plugin_source.MAX_ZIP or type(part['done']) is not bool:
            raise worker.Rejected('source_limit')
        result.extend(data)
        if part['done']:
            normalized = plugin_source.normalize_zip(bytes(result))
            if hashlib.sha256(normalized).hexdigest() != metadata['sourceSHA256']:
                raise worker.Rejected('source_checksum_mismatch')
            return normalized, metadata
    raise worker.Rejected('source_handoff_timeout')


def build_image(source, output, job_id):
    builder = 'webdock-plugin-' + job_id
    with tempfile.TemporaryDirectory(prefix='webdock-build-home-') as home:
        env = {'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':home,'DOCKER_CONFIG':home+'/.docker','LANG':'C.UTF-8'}
        Path(env['DOCKER_CONFIG']).mkdir(mode=0o700)
        worker.run_bounded(['/usr/bin/docker','buildx','create','--name',builder,'--driver','docker-container'], env=env, timeout=60)
        try:
            try:
                worker.run_bounded(['/usr/bin/docker','buildx','build','--builder',builder,'--platform','linux/amd64',
                                    '--provenance=false','--sbom=false','--file',str(source/'Dockerfile'),
                                    '--output','type=oci,compression=gzip,force-compression=true,dest='+str(output/'image.tar'),str(source)],
                                   env=env, timeout=1200, max_bytes=8*1024*1024, file_limit=MAX_ARTIFACT)
            except worker.BuildFailed as error:
                # Source-controlled logs belong only in this private workflow, never as runner commands.
                marker = secrets.token_hex(32)
                print('::stop-commands::' + marker, flush=True)
                try:
                    print(error.logs.encode('utf-8', 'replace')[:worker.MAX_LOG].decode('utf-8', 'ignore'), flush=True)
                finally:
                    print('::' + marker + '::', flush=True)
                raise
            if not (output/'image.tar').is_file() or (output/'image.tar').stat().st_size > MAX_ARTIFACT:
                raise worker.Rejected('plugin_artifact_limit')
        finally:
            worker.run_bounded(['/usr/bin/docker','buildx','rm','--force',builder],env=env,timeout=30)


def main():
    job_id, nonce = os.environ['SOURCE_ID'], os.environ['SOURCE_NONCE']
    control_url = os.environ['SOURCE_CONTROL_URL']
    url = urllib.parse.urlsplit(control_url)
    if (not worker.ID.fullmatch(job_id) or not re.fullmatch(r'[a-f0-9]{32}',nonce)
            or control_url != os.environ.get('EXPECTED_CONTROL_URL')
            or url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment
            or url.path != '/v1/plugin-installer'
            or os.environ.get('GITHUB_SHA') != os.environ.get('EXPECTED_WORKFLOW_SHA')
            or os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch' or os.environ.get('GITHUB_RUN_ATTEMPT') != '1'):
        raise worker.Rejected('invalid_build_identity')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    if event.get('repository',{}).get('private') is not True:
        raise worker.Rejected('private_build_repository_required')
    archive, metadata = acquire(control_url, job_id, nonce)
    destination = Path(os.environ['RUNNER_TEMP']) / 'plugin-artifact'
    destination.mkdir(mode=0o700)
    with tempfile.TemporaryDirectory(prefix='webdock-plugin-source-') as directory:
        root=Path(directory);source=root/'source';output=root/'output';source.mkdir();output.mkdir()
        worker.unpack(archive,source,worker.MAX_SOURCE)
        build_image(source,output,job_id)
        tar = worker.pack(output)
        if len(tar) > MAX_ARTIFACT: raise worker.Rejected('plugin_artifact_limit')
        (destination/'artifact.tar').write_bytes(tar)
        manifest = {'schemaVersion':1,'component':'plugin','repository':os.environ['GITHUB_REPOSITORY'],
                    'commit':os.environ['GITHUB_SHA'],'ref':os.environ['GITHUB_REF'],
                    'workflow':os.environ['GITHUB_WORKFLOW_REF'].split('@')[0].removeprefix(os.environ['GITHUB_REPOSITORY']+'/'),'runId':os.environ['GITHUB_RUN_ID'],'runAttempt':1,
                    'sourceSHA256':metadata['sourceSHA256'],
                    'artifact':{'file':'artifact.tar','sha256':hashlib.sha256(tar).hexdigest()}}
        (destination/'manifest.json').write_text(json.dumps(manifest,sort_keys=True)+'\n')


if __name__ == '__main__':
    try: main()
    except Exception:
        print('Trusted plugin build failed. Check the private workflow configuration and source limits.', flush=True)
        raise SystemExit(1) from None
