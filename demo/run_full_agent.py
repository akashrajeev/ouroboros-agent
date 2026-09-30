"""Bounded text-only actual browser-use Agent. Key entered locally, never saved."""
import argparse
import asyncio
import getpass
import json
import logging
import os
from pathlib import Path
import sys

for key in ('ANONYMIZED_TELEMETRY','BROWSER_USE_CLOUD_SYNC'):
    os.environ[key]='false'
os.environ['BROWSER_USE_LOGGING_LEVEL']='critical'
# Disable credential verification's extra model call; actual invocation remains gated.
os.environ['SKIP_LLM_API_KEY_VERIFICATION']='true'
for key in ('LMNR_PROJECT_API_KEY','BROWSER_USE_API_KEY','BROWSER_USE_DEBUG_LOG_FILE','BROWSER_USE_INFO_LOG_FILE'):
    os.environ.pop(key,None)
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'server'))
os.chdir(ROOT)
logging.disable(logging.CRITICAL)

async def run(args):
    from browser_use import ChatGoogle, ChatGroq
    from full_agent.privacy import PrivacyBridge, GatedModel
    from full_agent.runtime import make_agent
    if args.provider=='gemini':
        if not os.environ.get('GOOGLE_API_KEY'): os.environ['GOOGLE_API_KEY']=getpass.getpass('Gemini API key (hidden, not saved): ').strip()
        if not os.environ['GOOGLE_API_KEY']: raise ValueError('No local key')
        inner=ChatGoogle(model=args.model or 'gemini-2.5-flash',temperature=0,max_retries=1,max_output_tokens=1024)
    else:
        if not os.environ.get('GROQ_API_KEY'): os.environ['GROQ_API_KEY']=getpass.getpass('Groq API key (hidden, not saved): ').strip()
        if not os.environ['GROQ_API_KEY']: raise ValueError('No local key')
        inner=ChatGroq(model=args.model or 'openai/gpt-oss-120b',temperature=0,max_retries=0)
    task=args.task or input('Task (no secrets; personal values are masked locally): ').strip()
    bridge=await PrivacyBridge().start()
    browser=None
    try:
        task=(await bridge.call('messages',value=[dict(role='user',content=task)]))['value'][0]['content']
        model=GatedModel(inner,bridge,minimum_interval=60 if args.provider=='groq' else 0)
        agent,browser=make_agent(task,model,bridge,args.url,chrome=args.chrome,headless=args.headless)
        history=await agent.run(max_steps=args.max_steps)
        print(json.dumps({'success':history.is_successful(),'steps':history.number_of_steps(),'model_calls':len(model.evidence),'gates':model.evidence,'final':history.final_result()},indent=2))
        print('No submit tools were available. Inspect actual fields in the dedicated browser. This is not a universal-site guarantee.')
        if not args.headless: input('Press Enter after checking the fields to close this dedicated browser. ')
    except Exception as e:
        # Safe class only, never SDK error text, task, response excerpt or credentials.
        print(json.dumps({'status':'blocked','class':type(e).__name__,'provider':args.provider}))
        raise SystemExit(1)
    finally:
        if browser: await browser.kill()
        await bridge.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--provider',choices=['gemini','groq'],default='gemini')
    parser.add_argument('--model')
    parser.add_argument('--url',action='append',required=True,help='Exact allowed navigation URL; repeat for each permitted destination')
    parser.add_argument('--task')
    parser.add_argument('--chrome',help='Dedicated installed Chrome/Chromium executable')
    parser.add_argument('--headless',action='store_true')
    parser.add_argument('--max-steps',type=int,default=12)
    asyncio.run(run(parser.parse_args()))
