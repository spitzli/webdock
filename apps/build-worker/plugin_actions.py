"""Dispatch private trusted builds and import verified artifacts; never execute source."""
import base64
import hashlib
import io
import json
import re
import secrets
import stat
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import actions_import
import plugin_source
import worker

API_VERSION = '2026-03-10'
WAIT_SECONDS = 35 * 60


def validate_config(config):
    if not isinstance(config, dict) or not re.fullmatch(r'[A-Za-z0-9-]+/[A-Za-z0-9_.-]+', config.get('repository', '')):
        raise worker.Rejected('invalid_actions_repository')
    for field in ('appID', 'installationID', 'repositoryID'):
        if not re.fullmatch(r'[1-9][0-9]{0,18}', str(config.get(field, ''))):
            raise worker.Rejected('invalid_actions_identity')
    if not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*\.ya?ml', config.get('workflow', '')):
        raise worker.Rejected('invalid_actions_workflow')
    plugin_source._ref(config.get('ref', ''))
    worker.private_file(config['privateKeyFile'])


def source_zip(archive):
    out = io.BytesIO()
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for member in sorted(tar.getmembers(), key=lambda entry: entry.name):
            if not member.isfile():
                raise worker.Rejected('invalid_source_archive')
            plugin_source._path(member.name)
            info = zipfile.ZipInfo(member.name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | member.mode) << 16
            z.writestr(info, tar.extractfile(member).read())
    data = out.getvalue()
    if len(data) > plugin_source.MAX_ZIP or plugin_source.normalize_zip(data) != archive:
        raise worker.Rejected('source_handoff_limit')
    return data


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


class GitHub:
    def __init__(self, config):
        validate_config(config)
        now = int(time.time())
        signing = (_b64(b'{"alg":"RS256","typ":"JWT"}') + '.' + _b64(json.dumps({'iat':now-60,'exp':now+540,'iss':str(config['appID'])}, separators=(',', ':')).encode())).encode()
        signature = subprocess.run(['/usr/bin/openssl', 'dgst', '-sha256', '-sign', str(worker.private_file(config['privateKeyFile']))], input=signing, capture_output=True, timeout=10, check=True).stdout
        jwt = signing.decode() + '.' + _b64(signature)
        token = self._request('/app/installations/' + str(config['installationID']) + '/access_tokens', jwt,
                              {'repository_ids':[int(config['repositoryID'])], 'permissions':{'actions':'write','contents':'read'}})
        # Installation tokens are opaque; stateless tokens include JWT punctuation.
        if (not isinstance(token, dict) or not isinstance(token.get('token'), str)
                or not re.fullmatch(r'[\x21-\x7e]{1,4096}', token['token'])):
            raise worker.Rejected('actions_auth_unavailable')
        self.token = token['token']

    def _request(self, path, token, body=None, redirect=False, timeout=30):
        if not path.startswith('/') or path.startswith('//'):
            raise worker.Rejected('invalid_actions_path')
        request = urllib.request.Request('https://api.github.com' + path,
                    data=None if body is None else json.dumps(body).encode(),
                    headers={'Authorization':'Bearer '+token, 'Accept':'application/vnd.github+json', 'Content-Type':'application/json', 'X-GitHub-Api-Version':API_VERSION})
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): return None
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=timeout) as response:
                raw = response.read(1024*1024+1)
                if len(raw)>1024*1024: raise worker.Rejected('actions_response_limit')
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            error.close()
            if redirect and error.code == 302:
                location = error.headers.get('Location', '')
                actions_import.validate_download_url(location)
                return location
            raise worker.Rejected('actions_request_failed') from None
        except Exception:
            raise worker.Rejected('actions_request_failed') from None

    def request(self, path, body=None, **kwargs):
        return self._request(path, self.token, body, **kwargs)


def build(config, control, job, source):
    settings = config['github']
    github = GitHub(settings)
    repository = settings['repository']
    base = '/repos/' + repository
    repo = github.request(base)
    if repo.get('private') is not True or str(repo.get('id')) != str(settings['repositoryID']) or repo.get('full_name') != repository:
        raise worker.Rejected('private_actions_repository_required')
    workflow_path = '.github/workflows/' + settings['workflow']
    workflow = github.request(base + '/actions/workflows/' + settings['workflow'])
    if workflow.get('state') != 'active' or workflow.get('path') != workflow_path or type(workflow.get('id')) is not int:
        raise worker.Rejected('trusted_actions_workflow_required')
    workflow_sha = github.request(base + '/commits/' + urllib.parse.quote(settings['ref'], safe='')).get('sha', '')
    if not worker.SHA.fullmatch(workflow_sha): raise worker.Rejected('invalid_workflow_commit')
    digest = hashlib.sha256(source['archive']).hexdigest()
    data = source_zip(source['archive'])
    nonce = secrets.token_hex(16)
    identity = {'id':job['id'], 'claimToken':job['claimToken']}
    def fence():
        if control.request('/lease', identity) != {'active':True}: raise worker.LeaseLost('lease_lost')
    fence()
    prepared = {**identity, 'size':len(data), 'sourceSHA256':digest, 'repositoryID':str(settings['repositoryID']), 'repository':repository,
                'workflowRef':repository+'/'+workflow_path+'@refs/heads/'+settings['ref'], 'workflowSHA':workflow_sha, 'nonce':nonce}
    if source.get('commit'): prepared['commit'] = source['commit']
    control.request('/actions-prepare', prepared)
    for offset in range(0, len(data), 65536):
        fence()
        control.request('/actions-chunk', {**identity, 'offset':offset, 'data':base64.b64encode(data[offset:offset+65536]).decode()})
    run_id = None
    try:
        fence()
        dispatched = github.request(base+'/actions/workflows/'+settings['workflow']+'/dispatches',
                     {'ref':settings['ref'], 'return_run_details':True, 'inputs':{'id':job['id'], 'nonce':nonce, 'control_url':config['controlURL'], 'expected_sha':workflow_sha}})
        if not isinstance(dispatched, dict) or type(dispatched.get('workflow_run_id')) is not int or dispatched['workflow_run_id'] <= 0:
            raise worker.Rejected('actions_dispatch_unconfirmed')
        run_id = str(dispatched['workflow_run_id'])
        run_path = base+'/actions/runs/'+run_id
        if dispatched.get('run_url') != 'https://api.github.com'+run_path or dispatched.get('html_url') != 'https://github.com/'+repository+'/actions/runs/'+run_id:
            raise worker.Rejected('actions_dispatch_mismatch')
        control.request('/actions-bind', {**identity, 'runID':run_id})
        deadline = time.monotonic() + WAIT_SECONDS
        while time.monotonic() < deadline:
            fence()
            run = github.request(run_path, timeout=min(30, max(0.1,deadline-time.monotonic())))
            if (str(run.get('id')) != run_id or run.get('run_attempt') != 1 or run.get('event') != 'workflow_dispatch'
                    or run.get('head_sha') != workflow_sha or run.get('head_branch') != settings['ref']
                    or run.get('workflow_id') != workflow['id'] or run.get('path') not in (workflow_path, workflow_path+'@'+settings['ref'])
                    or str(run.get('repository',{}).get('id')) != str(settings['repositoryID'])
                    or run.get('repository',{}).get('full_name') != repository or run.get('repository',{}).get('private') is not True):
                raise worker.Rejected('actions_run_identity_mismatch')
            if run.get('status') == 'completed':
                if run.get('conclusion') != 'success': raise worker.Rejected('actions_build_failed')
                break
            time.sleep(min(10, max(0,deadline-time.monotonic())))
        else: raise worker.Rejected('actions_build_timeout')
        fence()
        artifacts = github.request(run_path+'/artifacts?per_page=100')
        items = artifacts.get('artifacts', [])
        if artifacts.get('total_count') != 1 or len(items) != 1: raise worker.Rejected('actions_artifact_ambiguous')
        artifact = items[0]
        linked = artifact.get('workflow_run', {})
        if (artifact.get('name') != 'webdock-plugin-'+job['id'] or artifact.get('expired') is not False
                or str(linked.get('id')) != run_id or str(linked.get('repository_id')) != str(settings['repositoryID'])
                or linked.get('head_sha') != workflow_sha or type(artifact.get('id')) is not int):
            raise worker.Rejected('actions_artifact_identity_mismatch')
        url = github.request(base+'/actions/artifacts/'+str(artifact['id'])+'/zip', redirect=True)
        actions_import.validate_download_url(url)
        imported_job = {'buildProvider':'github-actions','buildID':job['id'],'customerID':job['customerID'],'projectID':job['projectID'],
                        'generation':1,'recipe':'dockerfile','sourceSHA':workflow_sha,'repositoryID':str(settings['repositoryID']),
                        'component':'plugin','expectedSourceSHA256':digest,
                        'actionsArtifact':{'repository':repository,'repositoryID':str(settings['repositoryID']),'runID':run_id,'runAttempt':1,
                         'ref':'refs/heads/'+settings['ref'],'workflowPath':workflow_path,'downloadURL':url,'digest':artifact.get('digest'), 'sizeBytes':artifact.get('size_in_bytes')}}
        fence()
        return actions_import.import_artifact(config, imported_job)
    except BaseException:
        if run_id:
            try: github.request(base+'/actions/runs/'+run_id+'/cancel', {})
            except Exception: pass
        raise
