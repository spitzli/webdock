import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import stat
import struct
import tarfile
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import warnings
import zipfile

source = __import__('plugin_source') if importlib.util.find_spec('plugin_source') else None


def zip_bytes(entries):
    output = io.BytesIO()
    with warnings.catch_warnings(), zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        warnings.simplefilter('ignore', UserWarning)
        for name, data, mode in entries:
            info = zipfile.ZipInfo(name, (2024, 2, 3, 4, 5, 6))
            # Preserve deliberately hostile NUL names; ZipInfo's constructor trims them.
            info.filename = name
            info.create_system = 3
            info.external_attr = mode << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    return output.getvalue()


MANIFEST = ('tabularium.json', b'{"name":"example"}', stat.S_IFREG | 0o600)


class PluginSourceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(source, 'The source intake library is not implemented')

    def test_zip_normalizes_wrapper_order_metadata_and_executable_mode(self):
        entries = [MANIFEST, ('src/run.sh', b'echo hello\n', stat.S_IFREG | 0o4751)]
        direct = source.normalize_zip(zip_bytes(entries))
        wrapped = source.normalize_zip(zip_bytes([
            ('release/' + name, data, mode) for name, data, mode in reversed(entries)
        ] + [('release/', b'', stat.S_IFDIR | 0o700)]))
        self.assertEqual(direct, wrapped)
        with tarfile.open(fileobj=io.BytesIO(direct), mode='r:') as archive:
            self.assertEqual(archive.getnames(), ['src/run.sh', 'tabularium.json'])
            self.assertEqual(archive.extractfile('src/run.sh').read(), b'echo hello\n')
            self.assertEqual(archive.getmember('src/run.sh').mode, 0o755)
            self.assertEqual(archive.getmember('tabularium.json').mode, 0o644)
            self.assertTrue(all(m.mtime == m.uid == m.gid == 0 for m in archive))

    def test_zip_rejects_unsafe_names_and_git_metadata(self):
        names = ['../escape', '/absolute', 'a\\b', 'a/../b', 'a//b', './x',
                 'C:/x', 'x\x00truncated', 'x\nname', '.git/config', 'X/.GiT/config',
                 'a/' * 100 + 'x', 'x' * 513]
        for name in names:
            with self.subTest(name=name), self.assertRaises(source.SourceError):
                source.normalize_zip(zip_bytes([MANIFEST, (name, b'x', stat.S_IFREG | 0o644)]))

    def test_zip_rejects_duplicate_case_and_file_directory_collisions(self):
        pairs = [('a', 'a'), ('A', 'a'), ('Src/a', 'src/b'), ('a', 'a/b'),
                 ('tabularium.json', 'TABULARIUM.JSON')]
        for first, second in pairs:
            with self.subTest(pair=(first, second)), self.assertRaises(source.SourceError):
                source.normalize_zip(zip_bytes([MANIFEST, (first, b'a', stat.S_IFREG | 0o644),
                                               (second, b'b', stat.S_IFREG | 0o644)]))

    def test_zip_rejects_links_devices_and_missing_or_ambiguous_manifest(self):
        for mode in [stat.S_IFLNK, stat.S_IFIFO, stat.S_IFCHR, stat.S_IFSOCK]:
            with self.subTest(mode=mode), self.assertRaises(source.SourceError):
                source.normalize_zip(zip_bytes([MANIFEST, ('link', b'target', mode | 0o777)]))
        for entries in [[], [('readme', b'x', 0)], [('a/b/tabularium.json', b'{}', 0)],
                        [('a/tabularium.json', b'{}', 0), ('other', b'x', 0)],
                        [('tabularium.json/', b'', stat.S_IFDIR)]]:
            with self.subTest(entries=entries), self.assertRaises(source.SourceError):
                source.normalize_zip(zip_bytes(entries))

    def test_zip_limits_expansion_file_count_compressed_bytes_and_bad_crc(self):
        fixture = zip_bytes([MANIFEST, ('large', b'x' * 1000, stat.S_IFREG | 0o644)])
        for setting, value in [('MAX_UNPACKED', 500), ('MAX_FILE', 500), ('MAX_FILES', 1), ('MAX_ZIP', 20)]:
            with self.subTest(setting=setting), patch.object(source, setting, value), self.assertRaises(source.SourceError):
                source.normalize_zip(fixture)
        corrupt = bytearray(zip_bytes([MANIFEST]))
        central = corrupt.index(b'PK\x01\x02')
        struct.pack_into('<I', corrupt, central + 16, 123)
        with self.assertRaises(source.SourceError):
            source.normalize_zip(bytes(corrupt))

    def test_zip_rejects_oversized_directory_before_zipfile_allocation(self):
        data = b'PK\x05\x06' + struct.pack('<4H2IH', 0, 0, 20000, 20000, 0, 0, 0)
        with patch.object(source.zipfile, 'ZipFile', side_effect=AssertionError('must preflight')), self.assertRaises(source.SourceError):
            source.normalize_zip(data)


class GitSourceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(source, 'The source intake library is not implemented')

    def dns(self, host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443)),
                (socket.AF_INET6, socket.SOCK_STREAM, 6, '', ('2606:4700:4700::1111', 443, 0, 0))]

    def test_url_ref_and_private_dns_are_rejected_before_git(self):
        urls = ['http://example.com/repo', 'ssh://example.com/a', 'https://user:secret@example.com/a',
                'https://example.com:444/a', 'https://example.com/a?x=1', 'https://example.com/a#x',
                'https://example.com/a\n', 'https://example.com/a%0a', 'https://127.0.0.1/a',
                'https://[::1]/a', 'https://example.com/a/../b', 'https://example.com/a\\b']
        with patch.object(source, '_run_git', side_effect=AssertionError('Git must not run')) as git:
            for url in urls:
                with self.subTest(url=url), self.assertRaises(source.SourceError):
                    source.fetch_git(url)
            for ref in ['--upload-pack=evil', 'main:other', '../main', 'a@{1}', 'a b', 'a.lock', 'a\n']:
                with self.subTest(ref=ref), self.assertRaises(source.SourceError):
                    source.fetch_git('https://example.com/repo', ref)
            for address in ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']:
                answers = self.dns('example.com') + [(socket.AF_INET6 if ':' in address else socket.AF_INET,
                                                     socket.SOCK_STREAM, 6, '', (address, 443))]
                with self.subTest(address=address), patch.object(source.socket, 'getaddrinfo', return_value=answers), self.assertRaises(source.SourceError):
                    source.fetch_git('https://example.com/repo')
            git.assert_not_called()

    def test_fetch_pins_dns_and_commit_without_persisting_credentials(self):
        seen = []
        credential = {'username': 'x-access-token', 'token': 'TOP-SECRET'}
        archive = zip_bytes([MANIFEST])
        def run(args, directory, env, deadline, capture_limit=65536):
            seen.append((args, env.copy(), directory))
            self.assertNotIn('TOP-SECRET', repr(args))
            self.assertNotIn('DATABASE_URL', env)
            self.assertNotIn('HTTPS_PROXY', env)
            self.assertNotIn('GIT_CONFIG_PARAMETERS', env)
            self.assertGreater(deadline, time.monotonic())
            if 'rev-parse' in args:
                return b'a' * 40 + b'\n'
            if 'archive' in args:
                self.assertIn('a' * 40, args)
                return archive
            return b''
        with patch.dict(os.environ, {'DATABASE_URL': 'private', 'HTTPS_PROXY': 'http://evil', 'GIT_CONFIG_PARAMETERS': 'evil'}), \
             patch.object(source.socket, 'getaddrinfo', side_effect=self.dns), patch.object(source, '_run_git', side_effect=run):
            result = source.fetch_git('https://example.com/team/repo.git', 'main', credential)
        self.assertEqual(result, {'archive': source.normalize_zip(archive), 'commit': 'a' * 40,
                                  'url': 'https://example.com/team/repo.git'})
        fetch_args, fetch_env, _ = next(call for call in seen if 'fetch' in call[0])
        config = {fetch_env['GIT_CONFIG_KEY_' + str(i)]: fetch_env['GIT_CONFIG_VALUE_' + str(i)]
                  for i in range(int(fetch_env['GIT_CONFIG_COUNT']))}
        self.assertEqual(config['http.curloptResolve'], 'example.com:443:93.184.216.34,[2606:4700:4700::1111]')
        self.assertEqual(config['http.followRedirects'], 'false')
        self.assertEqual(config['http.proxy'], '')
        self.assertEqual(config['http.https://example.com/.extraHeader'],
                         'Authorization: Basic ' + base64.b64encode(b'x-access-token:TOP-SECRET').decode())
        self.assertIn('--no-recurse-submodules', fetch_args)
        for args, env, directory in seen:
            self.assertFalse(Path(directory).exists(), 'temporary repo must be removed')
            if 'fetch' not in args:
                self.assertNotIn(config['http.https://example.com/.extraHeader'], env.values())

    def test_git_error_never_exposes_credentials_and_rejects_invalid_commit(self):
        with patch.object(source.socket, 'getaddrinfo', side_effect=self.dns):
            with patch.object(source, '_run_git', side_effect=RuntimeError('TOP-SECRET')), self.assertRaises(source.SourceError) as caught:
                source.fetch_git('https://example.com/repo', credential={'username': 'me', 'token': 'TOP-SECRET'})
            self.assertNotIn('TOP-SECRET', str(caught.exception))
            self.assertIsNone(caught.exception.__cause__)
            with patch.object(source, '_run_git', return_value=b'not-a-commit'), self.assertRaises(source.SourceError):
                source.fetch_git('https://example.com/repo')

    def test_dns_resolution_cannot_exceed_total_deadline(self):
        release = threading.Event()
        def stalled(*args, **kwargs):
            release.wait(1)
            return self.dns('example.com')
        start = time.monotonic()
        try:
            with patch.object(source, 'GIT_TIMEOUT', 0.05), \
                 patch.object(source.socket, 'getaddrinfo', side_effect=stalled), \
                 patch.object(source, '_run_git', side_effect=AssertionError('no Git after DNS timeout')) as git, \
                 self.assertRaises(source.SourceError):
                source.fetch_git('https://example.com/repo')
            git.assert_not_called()
            self.assertLess(time.monotonic() - start, 0.3)
        finally:
            release.set()

    def test_invalid_credentials_never_reach_git(self):
        for credential in [{'username': 'me:other', 'token': 'secret'}, {'username': 'me', 'token': 'x\ny'},
                           {'username': 'me', 'token': ''}, {'token': 'secret'}, 'secret']:
            with self.subTest(credential=credential), patch.object(source.socket, 'getaddrinfo', side_effect=self.dns), \
                 patch.object(source, '_run_git', side_effect=AssertionError('no Git')) as git, self.assertRaises(source.SourceError):
                source.fetch_git('https://example.com/repo', credential=credential)
            git.assert_not_called()

    def test_runner_bounds_time_output_and_aggregate_disk(self):
        # Exercise the real process supervisor with harmless local commands, never a repository script.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = {'PATH': '/usr/bin:/bin', 'HOME': directory, 'GIT_CONFIG_NOSYSTEM': '1'}
            with self.assertRaises(source.SourceError):
                source._run_git(['--version'], root, env, time.monotonic() - 1)
            with self.assertRaises(source.SourceError):
                source._run_git(['--version'], root, env, time.monotonic() + 5, capture_limit=1)
            (root / 'one').write_bytes(b'a' * 10)
            (root / 'two').write_bytes(b'b' * 10)
            with patch.object(source, 'MAX_DISK', 15), self.assertRaises(source.SourceError):
                source._run_git(['--version'], root, env, time.monotonic() + 5)

    def test_runner_terminates_real_process_group_at_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = {'PATH': '/usr/bin:/bin', 'HOME': directory, 'GIT_CONFIG_NOSYSTEM': '1'}
            start = time.monotonic()
            with patch.object(source.os, 'killpg', wraps=os.killpg) as kill, self.assertRaises(source.SourceError):
                source._run_git(['-c', 'alias.pause=!sleep 2', 'pause'], root, env, start + 0.1)
            self.assertLess(time.monotonic() - start, 1)
            self.assertTrue(any(call.args[1] == 9 for call in kill.call_args_list))


    def test_git_children_have_memory_and_cpu_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            script = "import resource,json;print(json.dumps([resource.getrlimit(resource.RLIMIT_AS),resource.getrlimit(resource.RLIMIT_CPU)]))"
            result = source._run_git(['-c', "alias.limits=!/usr/bin/python3 -c '" + script + "'", 'limits'],
                                     Path(directory), {'PATH': '/usr/bin:/bin', 'HOME': directory}, time.monotonic() + 5)
            self.assertEqual(json.loads(result), [[2 * 1024**3, 2 * 1024**3], [120, 120]])


if __name__ == '__main__':
    unittest.main()
