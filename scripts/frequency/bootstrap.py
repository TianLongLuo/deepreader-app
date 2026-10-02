"""Install pinned pip in this application's venv, without system ensurepip/apt."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen

PIP_SHA256 = '6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717'
PIP_FILE = 'pip-25.2-py3-none-any.whl'
PIP_URL = ('https://files.pythonhosted.org/packages/b7/3f/'
           '945ef7ab14dc4f9d7f40288d2df998d1837ee0888ec3659c813487572faa/' + PIP_FILE)
MAX_BYTES = 8 * 1024 * 1024


def download_wheel():
    with urlopen(PIP_URL, timeout=60) as response:
        if not response.geturl().startswith('https://files.pythonhosted.org/'):
            raise ValueError('Unexpected pip wheel origin')
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Pip wheel exceeds size bound')
    return data


def scoped_path(root, relative):
    path = root / relative
    if not path.resolve().is_relative_to(root):
        raise ValueError('App runtime path leaves application directory')
    # Do not follow even in-app runtime symlinks when creating/installing packages.
    for parent in [path, *path.parents]:
        if parent == root:
            break
        if parent.is_symlink():
            raise ValueError('App runtime path is a symlink')
    return path


def ensure_pip(root, download=download_wheel, run=subprocess.run):
    root = Path(root).resolve(strict=True)
    venv = scoped_path(root, '.runtime/frequency')
    venv.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    run([sys.executable, '-m', 'venv', '--without-pip', str(venv)], check=True, timeout=60)
    python = str(venv / 'bin/python')
    probe = run([python, '-m', 'pip', '--version'], check=False,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    if probe.returncode == 0:
        return
    blob = download()
    if len(blob) > MAX_BYTES or hashlib.sha256(blob).hexdigest() != PIP_SHA256:
        raise ValueError('Pinned pip wheel SHA256 mismatch')
    cache = scoped_path(root, '.runtime/frequency-bootstrap')
    cache.mkdir(mode=0o700, exist_ok=True)
    wheel = scoped_path(root, '.runtime/frequency-bootstrap/' + PIP_FILE)
    wheel.write_bytes(blob)
    wheel.chmod(0o600)
    env = dict(os.environ, PYTHONPATH=str(wheel), PYTHONNOUSERSITE='1')
    run([python, '-m', 'pip', '--isolated', 'install', '--no-cache-dir', '--no-index', '--no-deps', str(wheel)],
        check=True, env=env, timeout=90)


if __name__ == '__main__':
    if sys.version_info < (3, 9):
        raise SystemExit('Python 3.9+ is required')
    ensure_pip(Path(__file__).resolve().parents[2])
