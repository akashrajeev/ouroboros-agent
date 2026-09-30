from __future__ import annotations
import asyncio
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

class PrivacyBlocked(RuntimeError): pass

class PrivacyBridge:
    async def start(self):
        self.process = await asyncio.create_subprocess_exec('node', str(ROOT/'server/full_agent/privacy_bridge.mjs'), cwd=ROOT, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        self.lock = asyncio.Lock()
        return self

    async def call(self, op, **data):
        async with self.lock:
            self.process.stdin.write((json.dumps({'op':op, **data})+'\n').encode())
            await self.process.stdin.drain()
            line = await asyncio.wait_for(self.process.stdout.readline(), 120)
            if not line: raise PrivacyBlocked('On-device privacy process unavailable')
            result = json.loads(line)
            if not result.get('ok'): raise PrivacyBlocked(result.get('error','privacy_guard_blocked'))
            return result

    async def close(self):
        if getattr(self,'process',None):
            self.process.terminate()
            await self.process.wait()

class GatedModel:
    """All provider calls pass here. Messages are rebuilt after exact-payload gate."""
    _verified_api_keys = True
    def __init__(self, inner, bridge, minimum_interval=0):
        self.inner, self.bridge = inner, bridge
        self.model = inner.model
        self.minimum_interval = minimum_interval
        self.last_call = 0
        self.evidence = []
    @property
    def provider(self): return self.inner.provider
    @property
    def name(self): return self.model
    @property
    def model_name(self): return self.model

    async def ainvoke(self, messages, output_format=None, **kwargs):
        from browser_use.llm.messages import SystemMessage, UserMessage, AssistantMessage
        raw = [m.model_dump(mode='json',exclude_none=True) for m in messages]
        safe = await self.bridge.call('messages', value=raw)
        classes={'system':SystemMessage,'user':UserMessage,'assistant':AssistantMessage}
        rebuilt=[classes[m['role']].model_validate(m) for m in safe['value']]
        # No message/key/error text in evidence. Hash/byte count only.
        self.evidence.append(safe['gate'])
        elapsed=asyncio.get_running_loop().time()-self.last_call
        await asyncio.sleep(max(0,self.minimum_interval-elapsed))
        self.last_call=asyncio.get_running_loop().time()
        return await self.inner.ainvoke(rebuilt,output_format=output_format,**kwargs)
