"""Windows-friendly launcher; API key input is hidden and never written to disk."""
from __future__ import annotations
import getpass
import os
from pathlib import Path
import subprocess
import socket
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent

def main():
    if sys.version_info < (3, 11):
        raise SystemExit('Use Python 3.11 or newer for this setup.')
    for port in (8000, 8001, 8089):
        with socket.socket() as probe:
            try: probe.bind(('127.0.0.1', port))
            except OSError: raise SystemExit(f'Port {port} is busy. Stop the old service first; nothing started.')
    os.environ['ANONYMIZED_TELEMETRY'] = 'false'
    os.environ['BROWSER_USE_CLOUD_SYNC'] = 'false'
    provider = os.environ.get('PLANNER', 'chain')
    if provider not in ('chain', 'general'): raise SystemExit('PLANNER must be chain or general.')
    os.environ['PLANNER'] = provider
    if provider == 'chain':
        if not os.environ.get('OURO_WORKER_BASE_URL') or not os.environ.get('OURO_WORKER_MODEL'):
            raise SystemExit('Set OURO_WORKER_BASE_URL and OURO_WORKER_MODEL after confirming the Worker API shape.')
        if not os.environ.get('OURO_WORKER_API_KEY'):
            os.environ['OURO_WORKER_API_KEY'] = getpass.getpass('Worker auth token (hidden, empty if no auth): ').strip()
    if not os.environ.get('GOOGLE_API_KEY'):
        os.environ['GOOGLE_API_KEY'] = getpass.getpass('Gemini API key (hidden, not saved; optional for Worker fallback): ').strip()
    if provider == 'general' and not os.environ['GOOGLE_API_KEY']:
        raise SystemExit('No key provided. Nothing started.')
    children = []
    try:
        children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001', '--app-dir', 'server'], cwd=ROOT))
        ready = False
        for _ in range(40):
            if children[0].poll() is not None:
                raise SystemExit('Planner startup failed. Read the error above; check dependencies/key and port 8001.')
            try:
                with urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=1) as response:
                    import json
                    data=json.load(response)
                    ready = data.get('planner','').startswith(('general:', 'cloudflare-primary'))
                if ready: break
            except Exception:
                time.sleep(.25)
        if not ready: raise SystemExit('Planner did not become ready. Stop any old servers using ports 8000/8001.')
        children.append(subprocess.Popen([sys.executable, 'demo/trust_proxy.py', '8000', 'http://127.0.0.1:8001'], cwd=ROOT))
        children.append(subprocess.Popen([sys.executable, '-m', 'http.server', '8089', '--bind', '127.0.0.1', '--directory', 'demo'], cwd=ROOT))
        print('Ready. Open http://localhost:8089/kyc.html with the extension loaded.')
        print('Enter the instruction in the popup. Keep this terminal open. Ctrl+C stops all three services.')
        print('For search/video tests, manually open the public target site first. No arbitrary URL navigation yet.')
        while all(child.poll() is None for child in children): time.sleep(1)
        print('A service stopped. Check its error above. Stopping the other services.')
    except KeyboardInterrupt:
        print('Stopping demo.')
    finally:
        for child in children:
            if child.poll() is None: child.terminate()
        for child in children:
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill()

if __name__ == '__main__': main()
