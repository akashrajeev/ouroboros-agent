"""One-time visible debug Chrome + popup Agent service. Keys only in local .env."""
import os
import sys
import socket
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT);sys.path.insert(0,str(ROOT/'server'))
from full_agent.providers import load_env
load_env(ROOT/'.env')
for key in ('ANONYMIZED_TELEMETRY','BROWSER_USE_CLOUD_SYNC'):os.environ[key]='false'
os.environ['BROWSER_USE_LOGGING_LEVEL']='critical'
for key in ('LMNR_PROJECT_API_KEY','BROWSER_USE_API_KEY','BROWSER_USE_DEBUG_LOG_FILE','BROWSER_USE_INFO_LOG_FILE'):os.environ.pop(key,None)

def main():
    if not (ROOT/'.env').is_file():raise SystemExit('Create local .env from .env.example and fill provider settings. No keys in chat.')
    from full_agent.providers import from_env,ProviderUnavailable
    try:from_env()
    except ProviderUnavailable as e:raise SystemExit(str(e))
    for key in ('LMNR_PROJECT_API_KEY','BROWSER_USE_API_KEY'):
        os.environ.pop(key,None)
    with socket.socket() as check:
        try:check.bind(('127.0.0.1',8000))
        except OSError:raise SystemExit('Port 8000 busy. Stop the identified old planner/proxy, not unrelated services.')
    chrome=os.environ.get('OURO_CHROME') or (r'C:\Program Files\Google\Chrome\Application\chrome.exe' if sys.platform=='win32' else '/usr/bin/google-chrome')
    if not Path(chrome).is_file():raise SystemExit('Set OURO_CHROME in .env to the installed Chrome executable')
    from urllib.parse import urlsplit
    p=urlsplit(os.environ.get('OURO_CDP_URL','http://127.0.0.1:9222'))
    if p.hostname not in ('127.0.0.1','localhost') or p.scheme!='http':raise SystemExit('CDP must be local HTTP')
    port=p.port or 9222
    # A pre-existing debug browser can be reused, never kill an unrelated Chrome.
    with socket.socket() as s: debug_running=s.connect_ex(('127.0.0.1',port))==0
    if not debug_running:
        subprocess.Popen([chrome,f'--remote-debugging-port={port}','--remote-debugging-address=127.0.0.1',f'--user-data-dir={ROOT/".ouro-chrome-profile"}','--no-first-run','--no-default-browser-check','about:blank'])
    print('In this dedicated visible Chrome, load extension/.output/chrome-mv3 via chrome://extensions > Load unpacked (once).')
    print('Browse to your page, type any supported task in Ouroboros popup, RUN. Existing personal Chrome is untouched.')
    print('Keep this terminal open. .env keys stay on device. CDP grants local browser access; do not expose the port or use a personal profile.')
    import uvicorn
    uvicorn.run('full_agent.server:app',host='127.0.0.1',port=8000,log_level='critical',access_log=False)
if __name__=='__main__':main()
