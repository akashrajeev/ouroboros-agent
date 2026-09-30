import asyncio,os,sys,json
os.environ['ANONYMIZED_TELEMETRY']='false';os.environ['BROWSER_USE_CLOUD_SYNC']='false';os.environ['BROWSER_USE_LOGGING_LEVEL']='critical';os.environ['SKIP_LLM_API_KEY_VERIFICATION']='true'
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0,str(ROOT/'server'))
from full_agent.privacy import PrivacyBridge,GatedModel
from full_agent.runtime import make_agent
from browser_use.llm.views import ChatInvokeCompletion
class Fake:
 model='offline-test';provider='offline';name='offline'
 def __init__(self):self.n=0;self.messages=[]
 async def ainvoke(self,messages,output_format=None,**kwargs):
  self.messages.append([m.model_dump(mode='json') for m in messages]);self.n+=1
  if self.n==1: action={'navigate':{'url':'http://localhost:8089/agent-proof.html'}}
  elif self.n in (2,3):
   text=str(self.messages[-1]);pass
   import re
   index=int(re.search(r'\[(\d+)\] textbox '+('Full name' if self.n==2 else 'Email'),text).group(1))
   action={'fill':{'index':index,'text':'<NAME_1>' if self.n==2 else '<EMAIL_1>'}}
  else:action={'done':{'text':'Filled name and email, not submitted','success':True}}
  return ChatInvokeCompletion(completion=output_format.model_validate({'evaluation_previous_goal':'Success','memory':'Continue','next_goal':'Complete request','action':[action]}),usage=None)
async def main():
 b=await PrivacyBridge().start();fake=Fake();g=GatedModel(fake,b)
 t=(await b.call('messages',value=[{'role':'user','content':'Go to http://localhost:8089/agent-proof.html and fill full name Ravi Kumar and email ravi@example.com. Do not submit.'}]))['value'][0]['content']
 agent,browser=make_agent(t,g,b,['http://localhost:8089/agent-proof.html'],chrome=os.environ.get('OURO_CHROME') or ('/usr/bin/google-chrome' if sys.platform!='win32' else r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True)
 try:
  h=await agent.run(max_steps=6)
  print('RESULT',h.is_successful(),h.final_result(),'CALLS',fake.n)
  state=await __import__('browser_use').BrowserSession.get_browser_state_summary(browser,include_screenshot=False,cached=False)
  print('ACTUAL',[(n.attributes.get('id'),getattr(n.snapshot_node,'input_value',None)) for n in state.dom_state.selector_map.values()])
  assert h.is_successful()
  assert any(getattr(n.snapshot_node,'input_value',None)=='Ravi Kumar' for n in state.dom_state.selector_map.values())
  assert any(getattr(n.snapshot_node,'input_value',None)=='ravi@example.com' for n in state.dom_state.selector_map.values())
  assert not any('Ravi Kumar' in json.dumps(m) or 'ravi@example.com' in json.dumps(m) for m in fake.messages)
  session=await browser.get_or_create_cdp_session()
  check=await session.cdp_client.send.Runtime.evaluate(params={'expression':'document.body.dataset.submitted || "no"','returnByValue':True},session_id=session.session_id)
  assert check['result']['value']=='no'
  assert all(item.state.screenshot_path is None for item in h.history)
  print('SUBMITTED',check['result']['value'])
  shot=await session.cdp_client.send.Page.captureScreenshot(params={'format':'png'},session_id=session.session_id)
  import base64
  from pathlib import Path
  (Path(__import__('tempfile').gettempdir())/'ouro-full-agent-proof.png').write_bytes(base64.b64decode(shot['data']))
  print('RAW_LEAK',any('Ravi Kumar' in json.dumps(m) for m in fake.messages),'GATES',g.evidence)
 finally:await browser.kill();await b.close()
asyncio.run(main())
