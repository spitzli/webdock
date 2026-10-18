"""Acquire plugin source as data. Never check out a tree or execute source code."""
import base64
import contextlib
import io
import ipaddress
import os
from pathlib import Path
import queue
import re
import resource
import selectors
import signal
import socket
import stat
import struct
import subprocess
import tarfile
import tempfile
import threading
import time
import unicodedata
import urllib.parse
import zipfile

MAX_ZIP = 32 * 1024 * 1024
MAX_UNPACKED = 128 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_FILES = 10000
MAX_DISK = 128 * 1024 * 1024
GIT_TIMEOUT = 120


class SourceError(ValueError):
    """Public, credential-free source intake failure."""


def _path(name):
    if (not isinstance(name, str) or not name or len(name.encode('utf-8')) > 500
            or '\\' in name or ':' in name or unicodedata.normalize('NFC', name) != name
            or any(unicodedata.category(c).startswith('C') for c in name)):
        raise SourceError('unsafe_source_path')
    parts = name.split('/')
    if len(parts) > 64 or any(p in ('', '.', '..') or p.casefold() == '.git'
                             or len(p.encode('utf-8')) > 255 for p in parts):
        raise SourceError('unsafe_source_path')
    return parts


def _zip_preflight(data):
    if not isinstance(data, bytes) or len(data) > MAX_ZIP:
        raise SourceError('source_compressed_limit')
    end = data.rfind(b'PK\x05\x06', max(0, len(data) - 65557))
    if end < 0 or len(data) - end < 22:
        raise SourceError('invalid_source_zip')
    disk, start, disk_count, count, size, offset, comment = struct.unpack_from('<4H2IH', data, end + 4)
    if (disk or start or not 0 < count <= MAX_FILES or disk_count != count
            or size > MAX_FILES * 1024 or offset + size != end
            or end + 22 + comment != len(data)
            or data[max(0, end - 20):end].startswith(b'PK\x06\x07')):
        raise SourceError('invalid_source_zip')
    # Count central records ourselves before ZipFile allocates entry objects.
    cursor = offset
    for _ in range(count):
        if cursor + 46 > end or data[cursor:cursor + 4] != b'PK\x01\x02':
            raise SourceError('invalid_source_zip')
        name, extra, note = struct.unpack_from('<3H', data, cursor + 28)
        if name > 2048 or extra > 4096 or note > 4096:
            raise SourceError('invalid_source_zip')
        cursor += 46 + name + extra + note
    if cursor != end:
        raise SourceError('invalid_source_zip')
    return count


def normalize_zip(data: bytes) -> bytes:
    """Return deterministic TAR files with a root manifest, stripping one wrapper."""
    try:
        count = _zip_preflight(data)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = archive.infolist()
            if len(members) != count:
                raise SourceError('invalid_source_zip')
            explicit = set()
            paths = {}
            files = []
            total = 0
            for member in members:
                directory = member.is_dir()
                name = member.filename[:-1] if directory else member.filename
                parts = _path(name)
                if member.orig_filename != member.filename:
                    raise SourceError('unsafe_source_path')
                mode = member.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if (member.flag_bits & ~(0x800 | 0x8 | 0x6)
                        or member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        or kind not in (0, stat.S_IFREG, stat.S_IFDIR)
                        or (kind == stat.S_IFDIR) != directory and kind != 0
                        or member.external_attr & 0x10 and not directory
                        or directory and member.file_size != 0):
                    raise SourceError('unsafe_source_entry')
                if name in explicit:
                    raise SourceError('duplicate_source_path')
                explicit.add(name)
                for i in range(1, len(parts) + 1):
                    path = '/'.join(parts[:i])
                    is_dir = i < len(parts) or directory
                    old = paths.get(path.casefold())
                    if old is not None and old != (path, is_dir):
                        raise SourceError('conflicting_source_path')
                    paths[path.casefold()] = (path, is_dir)
                if not directory:
                    total += member.file_size
                    if member.file_size > MAX_FILE or total > MAX_UNPACKED:
                        raise SourceError('source_expansion_limit')
                    files.append((name, member, mode))
            names = {name for name, _, _ in files}
            prefix = ''
            if 'tabularium.json' not in names:
                roots = {name.split('/')[0] for name in explicit}
                if len(roots) != 1:
                    raise SourceError('root_manifest_required')
                prefix = next(iter(roots)) + '/'
                if prefix + 'tabularium.json' not in names:
                    raise SourceError('root_manifest_required')
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as tar:
                for name, member, mode in sorted(files):
                    with archive.open(member) as stream:
                        content = stream.read(MAX_FILE + 1)
                    if len(content) != member.file_size or len(content) > MAX_FILE:
                        raise SourceError('source_expansion_limit')
                    info = tarfile.TarInfo(name[len(prefix):])
                    info.mode = 0o755 if mode & 0o111 else 0o644
                    info.size = len(content)
                    tar.addfile(info, io.BytesIO(content))
            return output.getvalue()
    except SourceError:
        raise
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, EOFError, struct.error):
        raise SourceError('invalid_source_zip') from None


def _git_url(value):
    if (not isinstance(value, str) or len(value) > 2048 or not value.isascii()
            or re.search(r'[\x00-\x20\x7f\\%]', value)):
        raise SourceError('invalid_git_url')
    try:
        url = urllib.parse.urlsplit(value)
        if (url.scheme != 'https' or url.username is not None or url.password is not None
                or url.port not in (None, 443) or url.query or url.fragment
                or '?' in value or '#' in value or not url.hostname):
            raise SourceError('invalid_git_url')
        host = url.hostname
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if (len(host) > 253 or not re.fullmatch(r'[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?', host)
                    or any(not p or len(p) > 63 or p.startswith('-') or p.endswith('-') for p in host.split('.'))):
                raise SourceError('invalid_git_url')
        else:
            if not address.is_global or address.is_multicast or address.is_unspecified:
                raise SourceError('private_git_address')
        path = url.path.rstrip('/')
        if not path.startswith('/') or path == '/' or not re.fullmatch(r'/[A-Za-z0-9._~/-]+', path):
            raise SourceError('invalid_git_url')
        if any(p in ('', '.', '..') for p in path[1:].split('/')):
            raise SourceError('invalid_git_url')
        authority = '[' + host + ']' if ':' in host else host
        origin = 'https://' + authority
        return origin + path, host, origin
    except (ValueError, TypeError):
        raise SourceError('invalid_git_url') from None


def _ref(value):
    if (not isinstance(value, str) or not 0 < len(value) <= 255
            or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_./-]*', value)
            or '..' in value or value.endswith(('/', '.'))
            or any(not p or p.startswith('.') or p.endswith('.lock') for p in value.split('/'))):
        raise SourceError('invalid_git_ref')
    return value


def _resolve(host, deadline):
    try:
        # libc DNS has no portable timeout; a stalled resolver must not hold the job open.
        result = queue.Queue(maxsize=1)
        def resolve():
            try:
                result.put(socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP))
            except OSError:
                result.put(None)
        threading.Thread(target=resolve, daemon=True).start()
        try:
            answers = result.get(timeout=max(0, min(10, deadline - time.monotonic())))
        except queue.Empty:
            raise SourceError('git_dns_timeout') from None
        if not answers:
            raise SourceError('invalid_git_dns')
        addresses = []
        for family, _, _, _, address in answers:
            ip = ipaddress.ip_address(address[0])
            if family not in (socket.AF_INET, socket.AF_INET6) or not ip.is_global or ip.is_multicast or ip.is_unspecified:
                raise SourceError('private_git_address')
            value = '[' + str(ip) + ']' if ip.version == 6 else str(ip)
            if value not in addresses:
                addresses.append(value)
        if not addresses or len(addresses) > 32:
            raise SourceError('invalid_git_dns')
        return ('[' + host + ']' if ':' in host else host) + ':443:' + ','.join(addresses)
    except (OSError, ValueError):
        raise SourceError('invalid_git_dns') from None


def _environment(root, resolution, origin, credential=None):
    env = {
        'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(root / 'home'),
        'XDG_CONFIG_HOME': str(root / 'home'), 'TMPDIR': str(root),
        'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_SYSTEM': '/dev/null',
        'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0',
        'GIT_ASKPASS': '/bin/false', 'GIT_SSH': '/bin/false',
        'GIT_ALLOW_PROTOCOL': 'https', 'GIT_PROTOCOL_FROM_USER': '0',
        'GIT_LFS_SKIP_SMUDGE': '1',
    }
    config = [
        ('core.hooksPath', '/dev/null'), ('core.attributesFile', '/dev/null'),
        ('core.fsmonitor', 'false'), ('credential.helper', ''),
        ('credential.interactive', 'false'), ('init.templateDir', ''),
        ('protocol.allow', 'never'), ('protocol.https.allow', 'always'),
        ('http.followRedirects', 'false'), ('http.proxy', ''), ('http.sslVerify', 'true'),
        ('http.curloptResolve', resolution), ('http.extraHeader', ''),
        ('http.lowSpeedLimit', '1'), ('http.lowSpeedTime', '30'),
        ('fetch.recurseSubmodules', 'false'), ('fetch.fsckObjects', 'true'),
        ('transfer.fsckObjects', 'true'), ('gc.auto', '0'), ('maintenance.auto', 'false'),
    ]
    if credential is not None:
        if (not isinstance(credential, dict) or set(credential) != {'username', 'token'}
                or any(not isinstance(v, str) or not 0 < len(v) <= 4096
                       or any(ord(c) < 32 or ord(c) == 127 for c in v) for v in credential.values())
                or ':' in credential['username']):
            raise SourceError('invalid_git_credential')
        encoded = base64.b64encode((credential['username'] + ':' + credential['token']).encode()).decode()
        config.append(('http.' + origin + '/.extraHeader', 'Authorization: Basic ' + encoded))
    env['GIT_CONFIG_COUNT'] = str(len(config))
    for i, (key, value) in enumerate(config):
        env['GIT_CONFIG_KEY_' + str(i)] = key
        env['GIT_CONFIG_VALUE_' + str(i)] = value
    return env


def _disk_usage(root):
    total = 0
    count = 0
    for directory, folders, files in os.walk(root, followlinks=False):
        for name in folders + files:
            info = (Path(directory) / name).lstat()
            if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                raise SourceError('unsafe_git_workspace')
            total += max(info.st_size, info.st_blocks * 512)
            count += 1
            if total > MAX_DISK or count > 50000:
                raise SourceError('git_disk_limit')


def _run_git(args, directory, env, deadline, capture_limit=65536):
    """Bound the whole process group; never return Git diagnostics containing secrets."""
    if time.monotonic() >= deadline:
        raise SourceError('git_timeout')
    _disk_usage(directory)
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_DISK, MAX_DISK))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
        resource.setrlimit(resource.RLIMIT_CPU, (GIT_TIMEOUT, GIT_TIMEOUT))
    process = subprocess.Popen(['/usr/bin/git', '--no-pager', *args], cwd=directory,
                               env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True, preexec_fn=limits)
    output = bytearray()
    diagnostic_bytes = 0
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
            selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
            while selector.get_map() or process.poll() is None:
                if time.monotonic() >= deadline:
                    raise SourceError('git_timeout')
                _disk_usage(directory)
                for key, _ in selector.select(min(0.05, max(0, deadline - time.monotonic()))):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                    elif key.data == 'stdout':
                        output.extend(chunk)
                        if len(output) > capture_limit:
                            raise SourceError('git_output_limit')
                    else:
                        diagnostic_bytes += len(chunk)
                        if diagnostic_bytes > 65536:
                            raise SourceError('git_output_limit')
            _disk_usage(directory)
            if process.wait() != 0:
                raise SourceError('git_fetch_failed')
            return bytes(output)
    finally:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        process.stdout.close()
        process.stderr.close()


def fetch_git(url, ref='HEAD', credential=None):
    """Fetch HTTPS Git into an isolated bare repo; return normalized TAR and commit."""
    try:
        canonical, host, origin = _git_url(url)
        revision = _ref(ref)
        deadline = time.monotonic() + GIT_TIMEOUT
        resolution = _resolve(host, deadline)
        with tempfile.TemporaryDirectory(prefix='webdock-plugin-source-') as directory:
            root = Path(directory)
            (root / 'home').mkdir(mode=0o700)
            env = _environment(root, resolution, origin)
            fetch_env = _environment(root, resolution, origin, credential)
            repo = root / 'repo.git'
            _run_git(['init', '--bare', '--template=', str(repo)], root, env, deadline)
            _run_git(['--git-dir=' + str(repo), 'fetch', '--depth=1', '--no-tags',
                      '--no-recurse-submodules', '--no-auto-maintenance', '--', canonical, revision],
                     root, fetch_env, deadline)
            commit = _run_git(['--git-dir=' + str(repo), 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'],
                              root, env, deadline).decode('ascii').strip()
            if not re.fullmatch(r'[0-9a-f]{40}', commit):
                raise SourceError('invalid_git_commit')
            archive = _run_git(['--git-dir=' + str(repo), 'archive', '--format=zip', commit],
                               root, env, deadline, capture_limit=MAX_ZIP)
            return {'archive': normalize_zip(archive), 'commit': commit, 'url': canonical}
    except SourceError:
        raise
    except Exception:
        raise SourceError('git_source_failed') from None
