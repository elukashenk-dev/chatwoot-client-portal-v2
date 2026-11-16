#!/usr/bin/env python3
"""Durable, bounded cancellation evidence. Called only under the deployment lock."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import shutil

SHA = re.compile(r'[0-9a-f]{40}')
HASH = re.compile(r'[0-9a-f]{64}')
APPROVAL = re.compile(r'[A-Za-z0-9._:/-]{1,128}')
MAX_ENTRIES = 10000
MAX_BYTES = 512 * 1024 * 1024


def require(value):
    if not value:
        raise ValueError('Cancellation evidence is invalid or conflicts with live state')


def inspect(path, directory=False, private=False):
    value = path.lstat()
    require(value.st_uid == os.getuid())
    require(stat.S_ISDIR(value.st_mode) if directory else stat.S_ISREG(value.st_mode))
    require(not value.st_mode & (0o077 if private else 0o022))
    if not directory:
        require(value.st_nlink == 1)
    return value


def read(path, limit=2 * 1024 * 1024):
    before = inspect(path)
    require(before.st_size <= limit)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        body = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    def identity(value):
        return (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
                value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
    require(len(body) <= limit and identity(before) == identity(after) == identity(path.lstat()))
    return body


def checksum(body):
    return hashlib.sha256(body).hexdigest()


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_once(path, body):
    if path.exists() or path.is_symlink():
        require(read(path) == body)
    else:
        # A partial temporary write is not authority. Rebuild only this private
        # scratch file from the already verified, immutable intent.
        temp = path.with_name(path.name + '.tmp')
        if temp.exists() or temp.is_symlink():
            inspect(temp, private=True)
            temp.unlink()
            sync(temp.parent)
        with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as output:
            output.write(body)
            output.flush()
            os.fsync(output.fileno())
        require(not path.exists() and not path.is_symlink())
        os.rename(temp, path)
    sync(path)
    sync(path.parent)


def digest_file(path):
    before = inspect(path)
    digest = hashlib.sha256()
    count = 0
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        while block := stream.read(1024 * 1024):
            count += len(block)
            require(count <= MAX_BYTES)
            digest.update(block)
        after = os.fstat(stream.fileno())
    require(count == before.st_size and before.st_ino == after.st_ino
            and before.st_mtime_ns == after.st_mtime_ns and before.st_ctime_ns == after.st_ctime_ns
            and path.lstat().st_ino == before.st_ino)
    return digest.hexdigest()


def inventory(root):
    inspect(root, directory=True, private=True)
    result, total = [], 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in sorted(dirs + files):
            path = Path(directory) / name
            info = path.lstat()
            is_dir = stat.S_ISDIR(info.st_mode)
            inspect(path, directory=is_dir)
            relative = path.relative_to(root).as_posix()
            require(len(relative.encode()) <= 4096)
            item = [relative, 'dir' if is_dir else 'file', stat.S_IMODE(info.st_mode)]
            if not is_dir:
                total += info.st_size
                require(total <= MAX_BYTES)
                item.extend([info.st_size, digest_file(path)])
            result.append(item)
            require(len(result) <= MAX_ENTRIES)
    return sorted(result)


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def load(entry):
    inspect(entry, directory=True, private=True)
    inspect(entry / 'intent.json', private=True)
    raw = read(entry / 'intent.json')
    value = json.loads(raw)
    require(encode(value) == raw)
    require(set(value) == {'version', 'candidate', 'current', 'manifest_sha256', 'approval_ref', 'recorded_at_epoch', 'inventory'})
    require(type(value['version']) is int and value['version'] == 1 and SHA.fullmatch(value['candidate']) and SHA.fullmatch(value['current']))
    require(value['candidate'] != value['current'])
    require(HASH.fullmatch(value['manifest_sha256']) and entry.name == value['manifest_sha256'])
    require(APPROVAL.fullmatch(value['approval_ref']))
    require(type(value['recorded_at_epoch']) is int and value['recorded_at_epoch'] > 0)
    require(type(value['inventory']) is list and 1 <= len(value['inventory']) <= MAX_ENTRIES)
    require(set(p.name for p in entry.iterdir()) <= {'intent.json', 'release', 'completed', 'completed.tmp', 'untag-0', 'untag-1', 'untag-0.tmp', 'untag-1.tmp'})
    if (entry / 'completed.tmp').exists() or (entry / 'completed.tmp').is_symlink():
        inspect(entry / 'completed.tmp', private=True)
        require(not (entry / 'completed').exists())
    for index in (0, 1):
        marker = entry / f'untag-{index}'
        temporary = entry / f'untag-{index}.tmp'
        if marker.exists() or marker.is_symlink():
            inspect(marker, private=True)
            require(read(marker) == (checksum(raw) + f':{index}\n').encode())
        if temporary.exists() or temporary.is_symlink():
            inspect(temporary, private=True)
            require(not marker.exists())
    require(not (entry / 'untag-1').exists() or (entry / 'untag-0').is_file())
    return value


def sync_tree(root):
    # inventory() bounds and validates this walk before any filesystem barrier.
    inventory(root)
    directories = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        directories.append(Path(directory))
        for name in files:
            sync(Path(directory) / name)
    for directory in reversed(directories):
        sync(directory)


def verify_release(entry, value, release):
    require(inventory(release) == value['inventory'])
    require(checksum(read(release / 'manifest.txt')) == value['manifest_sha256'])
    fields = dict(line.split('=', 1) for line in read(release / 'manifest.txt').decode().splitlines())
    require(fields['candidate_commit'] == value['candidate'] and fields['observed_current_commit'] == value['current'])


def check_history(history, allowed_pending=''):
    if not history.exists() and not history.is_symlink():
        return
    inspect(history, directory=True, private=True)
    entries = list(history.iterdir())
    require(len(entries) <= 20)
    for entry in entries:
        require(HASH.fullmatch(entry.name))
        value = load(entry)
        if (entry / 'completed').exists() or (entry / 'completed').is_symlink():
            inspect(entry / 'completed', private=True)
            require(read(entry / 'completed') == (checksum(read(entry / 'intent.json')) + '\n').encode())
            verify_release(entry, value, entry / 'release')
            require(all((entry / f'untag-{index}').is_file() for index in (0, 1)))
            # A visible completion whose fsync previously failed is not enough.
            for path in (entry / 'completed', entry, history, history.parent):
                sync(path)
        else:
            require(entry.name == allowed_pending)


def pointer(path):
    inspect(path, private=True)
    raw = read(path, 128).decode()
    require(re.fullmatch(r'[0-9a-f]{40}\n', raw))
    return raw.strip()


def main():
    action, app_arg, *args = sys.argv[1:]
    app = Path(app_arg)
    state = app / '.release-state'
    history = state / 'cancellations'
    inspect(app, directory=True)
    inspect(state, directory=True, private=True)
    require(set(p.name for p in state.iterdir()) <= {'deploy.lock', 'current', 'previous', 'adoption',
            'prepared', 'transaction', 'decisions', 'history', 'recovery', 'cancellations'})
    if action == 'check':
        check_history(history)
        return
    candidate, manifest_sha, approval, epoch = args
    require(SHA.fullmatch(candidate) and HASH.fullmatch(manifest_sha) and APPROVAL.fullmatch(approval))
    entry = history / manifest_sha
    source = app / '.releases' / candidate
    target = entry / 'release'
    inspect(app / '.releases', directory=True, private=True)
    check_history(history, manifest_sha)
    prepared = state / 'prepared'
    if action == 'begin' and not entry.exists():
        require(pointer(prepared) == candidate)
        require(checksum(read(source / 'manifest.txt')) == manifest_sha)
        fields = dict(line.split('=', 1) for line in read(source / 'manifest.txt').decode().splitlines())
        value = {'version': 1, 'candidate': candidate, 'current': fields['observed_current_commit'],
                 'manifest_sha256': manifest_sha, 'approval_ref': approval, 'recorded_at_epoch': int(epoch),
                 'inventory': inventory(source)}
        # All evidence stays in place if publishing the intention is interrupted.
        # Unpublished temporary intent files never authorize a source move.
        history.mkdir(mode=0o700, exist_ok=True)
        inspect(history, directory=True, private=True)
        require(len(list(history.iterdir())) < 20)
        staging = Path(tempfile.mkdtemp(prefix='portal-cancellation-'))
        try:
            require(staging.stat().st_dev == history.stat().st_dev)
            write_once(staging / 'intent.json', encode(value))
            sync(staging)
            require(not entry.exists() and not entry.is_symlink())
            os.rename(staging, entry)
            sync(history)
            sync(state)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    value = load(entry)
    require(value['candidate'] == candidate and value['manifest_sha256'] == manifest_sha and value['approval_ref'] == approval)
    # Repeat the publication barrier on resume: visible intent is not proof
    # that a previous fsync completed successfully.
    for path in (entry / 'intent.json', entry, history, state):
        sync(path)
    if (entry / 'completed').exists():
        # An old approval can never retire a later preparation of the same SHA.
        require(not prepared.exists() or pointer(prepared) != candidate)
        verify_release(entry, value, target)
        print('completed')
        return
    if prepared.exists() or prepared.is_symlink():
        require(pointer(prepared) == candidate)
    else:
        require(target.exists() and not source.exists())
    require(not (source.exists() and target.exists()))
    release = target if target.exists() else source
    verify_release(entry, value, release)
    if action == 'move':
        if source.exists():
            require(source.stat().st_dev == entry.stat().st_dev)
            require(not target.exists() and not target.is_symlink())
            sync_tree(source)
            verify_release(entry, value, source)
            os.rename(source, target)
        sync_tree(target)
        sync(entry)
        sync(app / '.releases')
        sync(history)
        sync(state)
        verify_release(entry, value, target)
    elif action in {'untag-0', 'untag-1'}:
        require(not source.exists() and target.exists())
        write_once(entry / action, (checksum(read(entry / 'intent.json')) + f':{action[-1]}\n').encode())
    elif action == 'finish':
        require(not source.exists() and target.exists())
        require(all((entry / f'untag-{index}').is_file() for index in (0, 1)))
        if prepared.exists():
            require(pointer(prepared) == candidate)
            prepared.unlink()
        sync(state)
        if (os.environ.get('STAGED_TEST_MODE') == '1'
                and os.environ.get('STAGED_TEST_CANCEL_FAIL_AT') == 'after-pointer'
                and app == Path(os.environ.get('STAGED_TEST_ROOT', '/nonexistent')) / 'app'
                and str(app).startswith('/tmp/')):
            raise ValueError('Injected cancellation interruption after pointer retirement')
        write_once(entry / 'completed', (checksum(read(entry / 'intent.json')) + '\n').encode())
    elif action not in {'begin', 'verify'}:
        raise ValueError('Unknown cancellation action')
    print('pending' if action != 'finish' else 'completed')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Cancellation stopped: {error}', file=sys.stderr)
        sys.exit(1)
