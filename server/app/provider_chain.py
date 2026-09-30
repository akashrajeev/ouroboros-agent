"""Cloudflare-compatible primary, optional Gemini fallback, sanitized input only."""
import os
from .schemas import Action, StepRequest
from .vlm import VlmPlanner

class ProviderChain:
    def __init__(self, primary, fallback=None):
        self.primary=primary
        self.fallback=fallback
        self.name='cloudflare-primary' + ('+gemini-fallback' if fallback else '')
        self.last={}

    @classmethod
    def from_env(cls):
        url=os.environ.get('OURO_WORKER_BASE_URL','')
        if not url: raise ValueError('OURO_WORKER_BASE_URL missing; configure the verified endpoint before running')
        model=os.environ.get('OURO_WORKER_MODEL','')
        if not model: raise ValueError('OURO_WORKER_MODEL missing')
        primary=VlmPlanner(url,model,os.environ.get('OURO_WORKER_API_KEY',''),timeout_s=30,max_elements=200)
        from .general import SYSTEM
        primary.system_prompt = SYSTEM
        fallback=None
        if os.environ.get('GOOGLE_API_KEY'):
            from .general import GeneralPlanner
            fallback=GeneralPlanner()
        return cls(primary,fallback)

    def plan(self, req: StepRequest) -> Action:
        # Text-only across BOTH providers; the general demo never sends images remotely.
        safe=req.model_copy(update={'image_jpeg_b64':None})
        result=self.primary.plan(safe)
        self.last={**getattr(self.primary,'last',{}),'provider':'cloudflare-primary'}
        # Fallback ONLY after transport/provider failure or invalid response, not a
        # legitimate ask_user that might signal a CAPTCHA, consent or missing data.
        failed = bool(self.last.get('error')) or result.reason=='planner returned no valid action'
        if failed and self.fallback is not None:
            result=self.fallback.plan(safe)
            self.last={**getattr(self.fallback,'last',{}),'provider':'gemini-fallback'}
        return result
