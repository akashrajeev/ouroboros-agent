"""Providers see only messages that have passed GatedModel, including fallbacks."""
import os
import re
import json
from pathlib import Path
from .privacy import PrivacyBlocked

class ProviderUnavailable(RuntimeError): pass

def load_env(path):
    # Narrow .env format, no interpolation/exec. Local file only.
    if not Path(path).is_file(): return
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        line=line.strip()
        if not line or line.startswith('#'): continue
        if '=' not in line: raise ValueError('Invalid local env format')
        key,value=line.split('=',1)
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*',key.strip()): raise ValueError('Invalid env key')
        os.environ[key.strip()]=value.strip().strip('"').strip("'")

class ProviderChain:
    _verified_api_keys=True
    model='ouroboros-provider-chain';provider='ouroboros';name=model
    def __init__(self,entries,event=lambda e:None): self.entries=entries;self.event=event
    async def ainvoke(self,messages,output_format=None,**kwargs):
        from .privacy import PrivacyBlocked
        for name,model in self.entries:
            self.event({'provider':name,'stage':'calling'})
            try:
                result=await model.ainvoke(messages,output_format=output_format,**kwargs)
                if output_format is not None:
                    result.completion=output_format.model_validate(result.completion)
                self.event({'provider':name,'stage':'returned'})
                return result
            except PrivacyBlocked: raise  # Never bypass a privacy block by changing vendor.
            except Exception as error:
                status=getattr(error,'status_code',None)
                self.event({'provider':name,'stage':'failed','error_class':type(error).__name__,'status_code':status if isinstance(status,int) else None})
        raise ProviderUnavailable('All configured providers failed or structured output was invalid; inspect provider status, keys, quota and model JSON support')

class CloudflareJSONClient:
    """Adapt browser-use ChatOpenAI's strict schema envelope to documented CF JSON Mode.

    Preserve message bytes; remove unsupported optional penalties/reasoning. No
    prompt JSON-only fallback. Response still validated by ChatOpenAI/Pydantic.
    """
    def __init__(self,client):
        from types import SimpleNamespace
        self.client=client
        self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
    async def create(self,**kwargs):
        rf=kwargs.get('response_format',{})
        if rf.get('type')!='json_schema': raise ProviderUnavailable('Cloudflare requires structured JSON schema')
        kwargs['response_format']={'type':'json_schema','json_schema':rf['json_schema']['schema']}
        for key in ('frequency_penalty','reasoning_effort','max_completion_tokens','service_tier'):
            value=kwargs.pop(key,None)
            if key=='max_completion_tokens' and value is not None: kwargs['max_tokens']=value
        return await self.client.chat.completions.create(**kwargs)

def from_env(event=lambda e:None):
    from browser_use import ChatGoogle,ChatGroq,ChatOpenAI
    class CloudflareModel(ChatOpenAI):
        def get_client(self): return CloudflareJSONClient(super().get_client())
    entries=[]
    order=os.environ.get('OURO_PROVIDER_ORDER','cloudflare,gemini,groq').split(',')
    for name in order:
        name=name.strip().lower();model=None
        if name=='cloudflare':
            account=os.environ.get('CLOUDFLARE_ACCOUNT_ID','');key=os.environ.get('CLOUDFLARE_API_TOKEN','');mid=os.environ.get('CLOUDFLARE_MODEL','')
            if account and key and mid:
                if not re.fullmatch(r'[A-Za-z0-9]+',account): raise ValueError('Cloudflare account ID format invalid')
                model=CloudflareModel(model=mid,api_key=key,base_url=f'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1',max_retries=0,temperature=0,frequency_penalty=None,max_completion_tokens=1024)
        elif name=='gemini':
            if os.environ.get('GOOGLE_API_KEY'): model=ChatGoogle(model=os.environ.get('GEMINI_MODEL','gemini-2.5-flash'),api_key=os.environ['GOOGLE_API_KEY'],max_retries=1,temperature=0,max_output_tokens=1024)
        elif name=='groq':
            if os.environ.get('GROQ_API_KEY'): model=ChatGroq(model=os.environ.get('GROQ_MODEL','openai/gpt-oss-120b'),api_key=os.environ['GROQ_API_KEY'],max_retries=0,temperature=0)
        elif name in ('openai','openrouter'):
            key=os.environ.get(name.upper()+'_API_KEY');mid=os.environ.get(name.upper()+'_MODEL')
            if key and mid:model=ChatOpenAI(model=mid,api_key=key,base_url='https://openrouter.ai/api/v1' if name=='openrouter' else None,max_retries=0,temperature=0,frequency_penalty=None)
        else: raise ValueError('Unknown provider in OURO_PROVIDER_ORDER')
        if model:entries.append((name,model))
        else:event({'provider':name,'stage':'not_configured'})
    if not entries:raise ProviderUnavailable('No providers configured in local .env')
    return ProviderChain(entries,event)
