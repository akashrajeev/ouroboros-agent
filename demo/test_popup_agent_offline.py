"""DEV ONLY: deterministic provider for popup transport proof. Never a production fallback."""
import os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT);sys.path.insert(0,str(ROOT/'server'))
from full_agent import server
from browser_use.llm.views import ChatInvokeCompletion
import re,json
class Fake:
    model='offline-popup-proof';provider='offline'
    def __init__(self):self.n=0
    async def ainvoke(self,messages,output_format=None,**kwargs):
        text=json.dumps([m.model_dump(mode='json') for m in messages]);self.n+=1
        if 'Ravi Kumar' in text or 'ravi@example.com' in text:raise RuntimeError('Synthetic raw value leaked')
        if self.n in (1,2):
            label='Full name' if self.n==1 else 'Email'
            index=int(re.search(r'\[(\d+)\] textbox '+label,text).group(1))
            action={'fill':{'index':index,'text':'<NAME_1>' if self.n==1 else '<EMAIL_1>'}}
        else:action={'done':{'text':'Synthetic fields filled, no submit','success':True}}
        return ChatInvokeCompletion(completion=output_format.model_validate({'evaluation_previous_goal':'Success','memory':'Continue','next_goal':'Complete request','action':[action]}),usage=None)
from full_agent.providers import ProviderChain
server.from_env=lambda event:ProviderChain([('offline',Fake())],event)
if __name__=='__main__':
    import uvicorn
    uvicorn.run(server.app,host='127.0.0.1',port=8000,log_level='critical',access_log=False)
