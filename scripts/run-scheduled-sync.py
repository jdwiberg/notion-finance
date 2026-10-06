import os
import signal
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

PROJECT = Path('/Users/jacobwiberg/Projects/notion-finance-app')
NODE = '/opt/homebrew/bin/node'
LOG = Path(__file__).with_name('last-run.log')
os.umask(0o077)
children = []

def stop(signum, frame):
    raise SystemExit(128 + signum)

for sig in (signal.SIGTERM, signal.SIGINT):
    signal.signal(sig, stop)

with LOG.open('w') as log:
    def note(message):
        log.write(time.strftime('%Y-%m-%d %H:%M:%S ') + message + '\n')
        log.flush()
    try:
        note('Starting scheduled Notion sync')
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', 3000)) == 0:
                raise RuntimeError('Port 3000 is already in use; stop the app before the scheduled run.')
        env = dict(os.environ, PATH='/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', PLAID_DATA_URL='http://127.0.0.1:3000/api/plaid/data')
        server = subprocess.Popen([NODE, 'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], cwd=PROJECT, env=env, stdout=log, stderr=log, start_new_session=True)
        children.append(server)
        deadline = time.monotonic() + 120
        while True:
            if server.poll() is not None:
                raise RuntimeError('App exited before becoming ready')
            try:
                with urllib.request.urlopen('http://127.0.0.1:3000/', timeout=3) as response:
                    if response.status == 200:
                        break
            except Exception:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('App did not start within two minutes')
            time.sleep(1)
        sync = subprocess.Popen([NODE, '--env-file=.env.local', 'scripts/sync-notion.mjs'], cwd=PROJECT, env=env, stdout=log, stderr=log, start_new_session=True)
        children.append(sync)
        result = sync.wait(timeout=1200)
        if result:
            raise RuntimeError('Sync failed with exit code ' + str(result))
        note('Sync completed successfully')
    except Exception as error:
        note(str(error))
        raise SystemExit(1)
    finally:
        for child in reversed(children):
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        time.sleep(2)
        for child in reversed(children):
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
        note('Temporary processes stopped')
