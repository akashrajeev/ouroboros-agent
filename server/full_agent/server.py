"""Loopback-only popup -> full browser-use Agent bridge. No provider secrets in UI."""
import os
for key in ('ANONYMIZED_TELEMETRY','BROWSER_USE_CLOUD_SYNC'):os.environ[key]='false'
os.environ['BROWSER_USE_LOGGING_LEVEL']='critical'
for key in ('LMNR_PROJECT_API_KEY','BROWSER_USE_API_KEY','BROWSER_USE_DEBUG_LOG_FILE','BROWSER_USE_INFO_LOG_FILE'):os.environ.pop(key,None)
import asyncio
import json
import logging
import re
import time
import uuid
from urllib.parse import urlsplit
from fastapi import FastAPI,HTTPException,Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel,Field
import httpx
from .privacy import ROOT,PrivacyBridge,GatedModel,PrivacyBlocked
from .providers import load_env,from_env,ProviderUnavailable
from .runtime import make_agent
load_env(ROOT/'.env')
for key in ('ANONYMIZED_TELEMETRY','BROWSER_USE_CLOUD_SYNC'):os.environ[key]='false'
for key in ('LMNR_PROJECT_API_KEY','BROWSER_USE_API_KEY','BROWSER_USE_DEBUG_LOG_FILE','BROWSER_USE_INFO_LOG_FILE'):os.environ.pop(key,None)
logging.disable(logging.CRITICAL)
app=FastAPI(title='Ouroboros local full Agent')
runs={}
active=None

@app.middleware('http')
async def local_only(request:Request,call_next):
    origin=request.headers.get('origin','')
    host=request.headers.get('host','').split(':')[0]
    if host not in ('127.0.0.1','localhost','testserver'):return JSONResponse({'error':'Loopback host required'},status_code=403)
    if request.url.path!='/health' and not (not origin and request.headers.get('x-ouro-client')=='extension') and not re.fullmatch(r'(?:chrome|moz)-extension://[A-Za-z0-9-]+',origin):
        return JSONResponse({'error':'Extension origin required'},status_code=403)
    if request.method=='OPTIONS':response=JSONResponse({})
    else:response=await call_next(request)
    if re.fullmatch(r'(?:chrome|moz)-extension://[A-Za-z0-9-]+',origin):
        response.headers['Access-Control-Allow-Origin']=origin
        response.headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS'
        response.headers['Access-Control-Allow-Headers']='content-type,x-ouro-client'
        response.headers['Vary']='Origin'
    return response

class RunRequest(BaseModel):
    task:str=Field(min_length=1,max_length=12000)
    marker:str=Field(pattern=r'^[a-f0-9]{32}$')
    url:str=Field(max_length=4096)

def origin_of(url):
    p=urlsplit(url)
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:raise ValueError('Only ordinary HTTP(S) pages supported')
    return f'{p.scheme}://{p.netloc}'

def cdp_url():
    value=os.environ.get('OURO_CDP_URL','http://127.0.0.1:9222')
    p=urlsplit(value)
    if p.scheme!='http' or p.hostname not in ('127.0.0.1','localhost') or p.path not in ('','/') or p.username:raise ValueError('CDP must be loopback HTTP')
    return value.rstrip('/')

@app.get('/health')
async def health():return {'status':'ok','mode':'full-agent','active_run':active}

@app.post('/agent/run')
async def start(req:RunRequest):
    global active
    if active and runs[active]['status']=='running':raise HTTPException(409,'A full Agent run is already active')
    try:origin_of(req.url);cdp_url()
    except ValueError:raise HTTPException(400,'Invalid page or loopback CDP setting')
    rid=uuid.uuid4().hex
    runs[rid]={'id':rid,'status':'running','steps':0,'actions':[],'providers':[],'gate':None,'bytes':0,'model_calls':0,'started':time.monotonic(),'reason':None}
    active=rid
    asyncio.create_task(execute(rid,req))
    return {'run_id':rid}

@app.get('/agent/status/{rid}')
async def status(rid:str):
    if rid not in runs:raise HTTPException(404,'Run not found')
    state={k:v for k,v in runs[rid].items() if k not in ('started','ended')}
    state['elapsed_ms']=round((runs[rid].get('ended',time.monotonic())-runs[rid]['started'])*1000)
    return state

async def execute(rid,req):
    state=runs[rid];bridge=None;browser=None
    def event(e):
        if 'gate' in e:
            state['gate']=e['gate']
            if e['gate']=='pass':state['bytes']+=e['bytes'];state['model_calls']+=1
            state['last_gate']=e
        if 'provider' in e:state['providers'].append(e);state['providers']=state['providers'][-20:]
        if 'action' in e:state['actions'].append(e['action'])
    try:
        # No URL-only matching. A per-run random local marker binds exact Chrome tab.
        async with httpx.AsyncClient(timeout=4,trust_env=False) as client:
            try:
                result=await client.get(cdp_url()+'/json/list');result.raise_for_status();targets=result.json()
            except Exception:raise ProviderUnavailable('Chrome debugging unavailable. Start the dedicated visible debug-profile launcher; ordinary Chrome cannot attach.')
        bridge=await PrivacyBridge().start()
        task=(await bridge.call('messages',value=[{'role':'user','content':req.task}]))['value'][0]['content']
        origins={origin_of(req.url)}
        for u in re.findall(r'https?://[^\s<>"\']+',req.task):origins.add(origin_of(u.rstrip('.,)')))
        for u in os.environ.get('OURO_ALLOWED_ORIGINS','').split(','):
            if u.strip():origins.add(origin_of(u.strip()))
        chain=from_env(event)
        gate=GatedModel(chain,bridge,minimum_interval=60 if any(n=='groq' for n,_ in chain.entries) else 0,event=event)
        agent,browser=make_agent(task,gate,bridge,sorted(origins),cdp_url=cdp_url(),allow_origins=True,event=event)
        await browser.start()
        matches=[]
        for target in targets:
            if target.get('type')!='page' or target.get('url')!=req.url:continue
            session=await browser.get_or_create_cdp_session(target_id=target['id'],focus=False)
            check=await session.cdp_client.send.Runtime.evaluate(params={'expression':'document.documentElement.getAttribute("data-ouro-attach")','returnByValue':True},session_id=session.session_id)
            if check.get('result',{}).get('value')==req.marker:matches.append(target['id'])
        if len(matches)!=1:raise PrivacyBlocked('Current-tab identity could not be verified; refresh the page and start from its popup')
        browser.pinned_target=matches[0]
        await browser.get_or_create_cdp_session(target_id=matches[0],focus=True)
        async def step(a):state['steps']=a.state.n_steps
        history=await agent.run(max_steps=min(30,max(1,int(os.environ.get('OURO_AGENT_MAX_STEPS','12')))),on_step_end=step)
        state['steps']=history.number_of_steps()
        state['status']='done' if history.is_successful() is True else 'error'
        if state['status']=='error':state['reason']='Agent incomplete; inspect provider/guard status and page. No success was verified.'
    except Exception as error:
        state['status']='blocked' if isinstance(error,PrivacyBlocked) else 'error'
        state['reason']=str(error) if isinstance(error,(PrivacyBlocked,ProviderUnavailable)) else f'{type(error).__name__}; check local configuration, provider structured JSON support, quota and page readiness'
    finally:
        state['ended']=time.monotonic()
        if browser:
            try:await browser.stop() # Disconnect, never kill user's visible Chrome.
            except Exception:pass
        if bridge:await bridge.close()
