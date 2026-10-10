"""Bounded Stalwart management calls over a node-private instance endpoint."""
import base64
import ipaddress
import json
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class MailClient:
    def __init__(self, url, username, password):
        parsed = urlsplit(url)
        address = ipaddress.ip_address(parsed.hostname)
        if parsed.scheme != 'http' or not address.is_private or parsed.port != 8080 or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError('Expected private Mail endpoint')
        self.url = url
        self.authorization = 'Basic ' + base64.b64encode((username + ':' + password).encode()).decode()
        self.opener = build_opener(NoRedirect(), ProxyHandler({}))

    def request(self, path, body=None):
        request = Request(self.url + path, data=None if body is None else json.dumps(body).encode(),
                          headers={'Authorization': self.authorization, 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=5) as response:
                chunks, size, deadline = [], 0, time.monotonic() + 10
                while True:
                    chunk = response.read1(min(65536, 1048577 - size))
                    size += len(chunk)
                    if size > 1048576 or time.monotonic() > deadline:
                        raise ValueError()
                    if not chunk:
                        break
                    chunks.append(chunk)
                return json.loads(b''.join(chunks))
        except HTTPError as error:
            error.close()
            raise ValueError('Mail management request failed; reconcile before retrying') from None
        except Exception:
            # Unknown writes are never retried and upstream responses never enter logs.
            raise ValueError('Mail management request failed; reconcile before retrying') from None

    def call(self, method, arguments):
        result = self.request('/jmap', {'using': ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'],
                                       'methodCalls': [[method, arguments, 'webdock']]})
        responses = result.get('methodResponses', [])
        if len(responses) != 1 or len(responses[0]) != 3 or responses[0][0] != method or responses[0][2] != 'webdock':
            raise ValueError('Invalid Mail management response')
        value = responses[0][1]
        if not isinstance(value, dict) or any(value.get(key) for key in ('notCreated', 'notUpdated', 'notDestroyed')):
            raise ValueError('Mail management change rejected')
        return value

    def bootstrap(self, hostname):
        result = self.call('x:Bootstrap/set', {'update': {'singleton': {
            'serverHostname': hostname, 'defaultDomain': hostname,
            'requestTlsCertificate': False, 'generateDkimKeys': False,
            'dataStore': {'@type': 'RocksDb', 'path': '/data/store'},
            'tracer': {'@type': 'Stdout', 'level': 'warn'},
        }}})
        admin = result.get('updated', {}).get('singleton', {})
        if not admin.get('username') or not admin.get('secret'):
            raise ValueError('Mail bootstrap outcome unknown')
        return {'username': admin['username'], 'password': admin['secret']}

    def configure_listeners(self):
        rows = self.call('x:NetworkListener/get', {'ids': None})['list']
        ports = {'http': 8080, 'smtp': 2525, 'submissions': 2465, 'imaps': 1993}
        update, destroy, found = {}, [], set()
        for row in rows:
            name = row['name']
            if name in ports:
                if name in found:
                    raise ValueError('Duplicate Mail listener')
                found.add(name)
                update[row['id']] = {'bind': {'[::]:' + str(ports[name]): True}}
            else:
                destroy.append(row['id'])
        create = {name: {'name': name, 'bind': {'[::]:' + str(port): True},
                         'protocol': 'http' if name == 'http' else 'imap' if name == 'imaps' else 'smtp',
                         'useTls': name != 'http', 'tlsImplicit': name in ('imaps', 'submissions')}
                  for name, port in ports.items() if name not in found}
        self.call('x:NetworkListener/set', {'update': update, 'destroy': destroy, 'create': create})

    def verify(self):
        self.call('x:Domain/get', {'ids': None})
        account = self.request('/api/account')
        if account.get('edition') != 'community':
            raise ValueError('Expected Stalwart Community Edition')
