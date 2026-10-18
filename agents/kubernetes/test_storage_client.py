import io
import stat
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import storage_client


class StorageClientResponseTests(unittest.TestCase):
    def request(self,response):
        client=MagicMock();client.__enter__.return_value=client
        client.makefile.return_value=io.BytesIO(response)
        info=SimpleNamespace(st_mode=stat.S_IFSOCK|0o600,st_uid=0)
        with patch.object(storage_client.os,'stat',return_value=info),patch.object(storage_client.socket,'socket',return_value=client):
            return storage_client.request('database.capability',[],socket_path='/run/webdock-postgres-storage/test.sock')

    def test_zero_byte_eof_is_a_connection_error(self):
        with self.assertRaises(ConnectionError):self.request(b'')

    def test_nonempty_malformed_response_remains_a_protocol_error(self):
        for response in [b'not-json\n',b'\n',b'{"ok":',b'{"ok":false,"value":null}\n']:
            with self.subTest(response=response),self.assertRaises(ValueError):self.request(response)

    def test_valid_response_is_unchanged(self):
        self.assertEqual(self.request(b'{"ok":true,"value":{"ready":true}}\n'),{'ready':True})
