#!/usr/bin/env python3
"""Local, read-only SSH observation bridge. No remote files or cluster resources are changed."""
import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request
from urllib.parse import urlparse


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def agent_request(origin, state, route, payload):
    request = urllib.request.Request(origin.rstrip('/') + '/api/hosting/agent/'+route, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + state['credential'], 'x-webdock-cluster': state['clusterID']} if route!='enroll' else {})}, method='POST')
    # Never forward the agent credential to a redirect destination.
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError('Agent request rejected')
        data=response.read(65537)
        if len(data)>65536:raise ValueError('Agent response too large')
        return json.loads(data)


def send_heartbeat(origin, state, snapshot):
    return agent_request(origin,state,'heartbeat',snapshot)


def run(args):
    config_path = Path(args.credentials)
    if config_path.stat().st_mode & 0o077:
        raise ValueError('Credentials file must be private (0600)')
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*@[A-Za-z0-9.:-]+', args.ssh):
        raise ValueError('Invalid SSH destination')
    storage_client=Path(__file__).with_name('storage_client.py').read_text()
    dependency="import sys,types\nm=types.ModuleType('storage_client')\nexec(compile("+repr(storage_client)+",'<storage-client>','exec'),m.__dict__)\nsys.modules['storage_client']=m\n"
    registry_module=Path(__file__).with_name('registry.py').read_text()
    dependency+="r=types.ModuleType('registry')\nexec(compile("+repr(registry_module)+",'<registry>','exec'),r.__dict__)\nsys.modules['registry']=r\n"
    observer = dependency+Path(__file__).with_name('observer.py').read_text()
    executor = Path(__file__).with_name('executor.py').read_text() if args.manage else None
    with config_path.open('r+') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        state = json.load(handle)
        endpoint = urlparse(state['endpoint'])
        if endpoint.username or endpoint.password or endpoint.query or endpoint.fragment or endpoint.path not in ('', '/'):
            raise ValueError('Expected a plain control origin')
        if endpoint.scheme != 'https' and not (args.allow_loopback and endpoint.scheme == 'http' and endpoint.hostname in ('localhost', '127.0.0.1')):
            raise ValueError('HTTPS is required outside explicit loopback development')
        if args.interval < 15:
            raise ValueError('Minimum observation interval is 15 seconds')
        while True:
            result = subprocess.run(['ssh', '-i', args.identity, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', args.ssh, 'python3', '-'], input=observer, capture_output=True, text=True, timeout=25, check=True)
            if len(result.stdout) > 65536:
                raise ValueError('Observation is too large')
            snapshot = json.loads(result.stdout)
            state['sequence'] = state.get('sequence', 0) + 1
            snapshot.update(sequence=state['sequence'], generation=state['generation'])
            # Persist sequence before sending: ambiguous network responses can never replay an old number.
            handle.seek(0)
            json.dump(state, handle)
            handle.truncate()
            handle.flush()
            os.fsync(handle.fileno())
            send_heartbeat(state['endpoint'], state, snapshot)
            print(json.dumps({'clusterID': state['clusterID'], 'version': snapshot['version'], 'nodes': len(snapshot['nodes']), 'observedAt': snapshot['observedAt'], 'mode': 'managed SSH bridge' if args.manage else 'read-only SSH observation'}), flush=True)
            if args.manage:
                operation=agent_request(state['endpoint'],state,'claim',{})
                if operation:
                    packet=operation.get('desired')
                    if packet:
                        encoded=base64.b64encode(json.dumps(packet).encode()).decode()
                        # Execute the fixed module in a namespace that does not run its stdin entrypoint.
                        code=dependency+"import base64,json\nnamespace={'__name__':'webdock_executor'}\nexec(compile("+repr(executor)+",'<webdock-executor>','exec'),namespace)\nnamespace['main'](json.loads(base64.b64decode('"+encoded+"')))\n"
                        try:
                            executed=subprocess.run(['ssh','-i',args.identity,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',args.ssh,'python3','-'],input=code,capture_output=True,text=True,timeout=140,check=True)
                            if len(executed.stdout)>65536:raise ValueError('Executor response too large')
                            outcome=json.loads(executed.stdout)
                        except Exception:
                            outcome={'outcome':'failed','error':'execution_failed'}
                    else:
                        outcome={'outcome':'failed','error':'execution_failed'}
                    # Refresh observed node state before freeing allocations and admitting the next operation.
                    fresh=subprocess.run(['ssh','-i',args.identity,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',args.ssh,'python3','-'],input=observer,capture_output=True,text=True,timeout=25,check=True)
                    snapshot=json.loads(fresh.stdout)
                    state['sequence']+=1
                    snapshot.update(sequence=state['sequence'],generation=state['generation'])
                    handle.seek(0);json.dump(state,handle);handle.truncate();handle.flush();os.fsync(handle.fileno())
                    send_heartbeat(state['endpoint'],state,snapshot)
                    agent_request(state['endpoint'],state,'complete',{'id':operation['id'],'generation':operation['generation'],**outcome})
                    print(json.dumps({'operationID':operation['id'],'outcome':outcome['outcome']}),flush=True)
            if args.once:
                break
            time.sleep(args.interval)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--ssh', required=True)
    parser.add_argument('--identity', required=True)
    parser.add_argument('--allow-loopback', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--manage', action='store_true', help='Execute authorized Webdock operations, including confirmed app deletion')
    parser.add_argument('--interval', type=int, default=30)
    args = parser.parse_args()
    try:
        run(args)
    except Exception:
        # Provider commands and credential-bearing HTTP requests are intentionally not logged.
        parser.exit(1, 'Observation bridge stopped. Check private configuration and connectivity.\n')


if __name__ == '__main__':
    main()
