from app.provider_chain import ProviderChain
from app.schemas import Action
from .test_vlm import REQ

class Provider:
    def __init__(self, result, error=None): self.result=result;self.last={'error':error} if error else {};self.calls=[]
    def plan(self,req): self.calls.append(req);return self.result

def test_primary_works_without_fallback():
    primary=Provider(Action(op='done'));fallback=Provider(Action(op='done'))
    assert ProviderChain(primary,fallback).plan(REQ).op=='done'
    assert len(primary.calls)==1 and len(fallback.calls)==0

def test_fallback_on_error_text_only():
    primary=Provider(Action(op='ask_user'),error='HTTPError');fallback=Provider(Action(op='done'))
    chain=ProviderChain(primary,fallback)
    assert chain.plan(REQ.model_copy(update={'image_jpeg_b64':'DO_NOT_SEND'})).op=='done'
    assert all(p.calls[0].image_jpeg_b64 is None for p in (primary,fallback))
    assert chain.last['provider']=='gemini-fallback'

def test_legitimate_human_gate_does_not_fallback():
    primary=Provider(Action(op='ask_user',reason='Solve CAPTCHA'));fallback=Provider(Action(op='done'))
    assert ProviderChain(primary,fallback).plan(REQ).reason=='Solve CAPTCHA'
    assert not fallback.calls

def test_missing_fallback_preserves_failure():
    assert ProviderChain(Provider(Action(op='ask_user'),error='TimeoutError')).plan(REQ).op=='ask_user'
