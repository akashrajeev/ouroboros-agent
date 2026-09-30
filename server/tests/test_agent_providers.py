import pytest
pytest.importorskip('browser_use')
import asyncio
from types import SimpleNamespace
from full_agent.providers import ProviderChain,CloudflareJSONClient,ProviderUnavailable,from_env
from full_agent.privacy import PrivacyBlocked
from pydantic import BaseModel
class Output(BaseModel):action:str

def test_cloudflare_schema_dialect_without_changing_messages():
    calls=[]
    class Fake:
        async def create(self,**kwargs):calls.append(kwargs);return 'result'
    original=[{'role':'user','content':'<NAME_1>'}]
    client=CloudflareJSONClient(SimpleNamespace(chat=SimpleNamespace(completions=Fake())))
    assert asyncio.run(client.create(messages=original,response_format={'type':'json_schema','json_schema':{'name':'x','strict':True,'schema':{'type':'object'}}},max_completion_tokens=1024,frequency_penalty=0.3))=='result'
    assert calls[0]['response_format']=={'type':'json_schema','json_schema':{'type':'object'}}
    assert calls[0]['messages'] is original and calls[0]['max_tokens']==1024
    assert 'frequency_penalty' not in calls[0]

def test_fallback_validates_output_and_never_bypasses_privacy():
    class Fake:
        def __init__(self,error=None):self.error=error;self.calls=0
        async def ainvoke(self,*a,**k):
            self.calls+=1
            if self.error:raise self.error
            return SimpleNamespace(completion={'action':'done'})
    bad=Fake(ValueError('invalid JSON'));good=Fake();events=[]
    result=asyncio.run(ProviderChain([('cloudflare',bad),('gemini',good)],events.append).ainvoke([],output_format=Output))
    assert result.completion.action=='done' and bad.calls==good.calls==1
    blocked=Fake(PrivacyBlocked('blocked'));good.calls=0
    with pytest.raises(PrivacyBlocked):asyncio.run(ProviderChain([('cloudflare',blocked),('gemini',good)]).ainvoke([]))
    assert good.calls==0

def test_no_keys_fails_loudly(monkeypatch):
    for key in ('GOOGLE_API_KEY','GROQ_API_KEY','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','CLOUDFLARE_MODEL'):monkeypatch.delenv(key,raising=False)
    with pytest.raises(ProviderUnavailable):from_env()

def test_real_chatopenai_cloudflare_transport_contract(monkeypatch):
    import httpx
    from browser_use.llm.messages import UserMessage
    monkeypatch.setenv('OURO_PROVIDER_ORDER','cloudflare')
    monkeypatch.setenv('CLOUDFLARE_ACCOUNT_ID','offlineaccount')
    monkeypatch.setenv('CLOUDFLARE_API_TOKEN','offline-not-a-real-key')
    monkeypatch.setenv('CLOUDFLARE_MODEL','@cf/meta/llama-3.3-70b-instruct-fp8-fast')
    chain=from_env();model=chain.entries[0][1];bodies=[]
    def handle(request):
        import json
        bodies.append(json.loads(request.content))
        return httpx.Response(200,json={'id':'offline','object':'chat.completion','created':0,'model':model.model,'choices':[{'index':0,'message':{'role':'assistant','content':'{"action":"done"}'},'finish_reason':'stop'}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            model.http_client=client
            result=await model.ainvoke([UserMessage(content='<NAME_1>')],output_format=Output)
            assert result.completion.action=='done'
    asyncio.run(run())
    assert bodies[0]['response_format']['json_schema']['type']=='object'
    assert 'strict' not in bodies[0]['response_format']['json_schema']
    assert bodies[0]['messages'][0]['content']=='<NAME_1>'
    assert bodies[0]['max_tokens']==1024
