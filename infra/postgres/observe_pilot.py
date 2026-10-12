"""Bounded read-only observation of the explicitly disposable local CNPG pilot."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--installation', action='append', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--hours', type=float, default=24)
    args = parser.parse_args()
    if not 0 < args.hours <= 24 or any(not re.fullmatch(r'[1-9][0-9]{0,18}', x) for x in args.installation):
        parser.error('Use synthetic installation IDs and at most 24 hours.')
    container = 'webdock-managed-pg-pilot-c2d4df72'
    inspected = json.loads(subprocess.check_output(['docker', 'inspect', container], timeout=10))[0]
    if inspected['Config']['Hostname'] != 'postgres-pilot' or inspected['Config']['Labels'].get('webdock.test') != 'managed-postgresql':
        raise SystemExit('Disposable pilot container required')
    def kube(*command):
        return json.loads(subprocess.check_output(['docker', 'exec', container, 'kubectl', *command, '-o', 'json'], timeout=20, stderr=subprocess.DEVNULL))
    identities = {}
    for identity in args.installation:
        cluster = kube('get', 'cluster', 'postgres', '-n', 'wd-db-' + identity)
        if cluster['metadata']['labels'].get('webdock.dev/database-installation') != identity:
            raise SystemExit('Installation ownership mismatch')
        identities[identity] = cluster['metadata']['uid']
    start = time.monotonic()
    duration = args.hours * 3600
    failures = 0
    samples = 0
    with Path(args.output).open('x') as output:
        def record(value):
            output.write(json.dumps({'at': datetime.now(timezone.utc).isoformat(), **value}) + '\n')
            output.flush()
        record({'event': 'started', 'environment': 'disposable-local', 'hours': args.hours, 'installations': identities})
        while True:
            sample = []
            for identity, uid in identities.items():
                try:
                    cluster = kube('get', 'cluster', 'postgres', '-n', 'wd-db-' + identity)
                    pods = kube('get', 'pods', '-n', 'wd-db-' + identity)['items']
                    ready = cluster['metadata']['uid'] == uid and cluster.get('status', {}).get('readyInstances') == 1
                    restarts = sum(c.get('restartCount', 0) for p in pods for c in p.get('status', {}).get('containerStatuses', []))
                    sample.append({'installationID': identity, 'ready': ready, 'restarts': restarts})
                    failures += int(not ready)
                except (subprocess.SubprocessError, KeyError, ValueError):
                    sample.append({'installationID': identity, 'ready': False, 'error': 'observation-unavailable'})
                    failures += 1
            samples += 1
            record({'event': 'sample', 'installations': sample})
            remaining = duration - (time.monotonic() - start)
            if remaining <= 0:
                record({'event': 'completed', 'samples': samples, 'failedObservations': failures, 'elapsedSeconds': time.monotonic() - start})
                return
            time.sleep(min(300, remaining))


if __name__ == '__main__':
    main()
