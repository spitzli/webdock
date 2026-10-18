import unittest
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.error import HTTPError
from connect import send_heartbeat
from observer import quantity, observation

class ObserverTests(unittest.TestCase):
    def test_exact_resources(self):
        self.assertEqual(quantity('6', True), 6000)
        self.assertEqual(quantity('128Mi'), 134217728)
        self.assertEqual(quantity('500m', True), 500)
        for value in ['-1', 'garbage', '1e9', '9007199254740992']:
            with self.assertRaises(ValueError):
                quantity(value)

    def test_only_allowlisted_metadata_and_no_unverified_capacity(self):
        node = {'metadata': {'name': 'node', 'labels': {'node-role.kubernetes.io/control-plane': 'true'}, 'annotations': {'secret': 'never-return'}}, 'status': {'nodeInfo': {'architecture': 'amd64', 'kubeletVersion': 'v1.36.5+k3s1'}, 'allocatable': {'cpu': '6', 'memory': '12Gi'}, 'conditions': [{'type': 'Ready', 'status': 'True'}]}}
        result = observation({'items': [node]})
        self.assertNotIn('never-return', str(result))
        self.assertEqual(result['nodes'][0]['cpuMillicores'], 6000)
        self.assertTrue(all(v == 0 for v in result['capacity'].values()))
        node['status']['conditions'][0]['status'] = 'False'
        with self.assertRaises(ValueError):
            observation({'items': [node]})


    def test_redirect_never_forwards_credentials(self):
        visited = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                visited.append(self.path)
                self.send_response(307)
                self.send_header('Location', '/capture')
                self.end_headers()
            def log_message(self, *args):
                pass
        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with self.assertRaises(HTTPError) as caught:
                send_heartbeat('http://127.0.0.1:'+str(server.server_port), {'credential':'fixture-secret', 'clusterID':'123'}, {})
            caught.exception.close()
            self.assertEqual(visited, ['/api/hosting/agent/heartbeat'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

if __name__ == '__main__':
    unittest.main()
