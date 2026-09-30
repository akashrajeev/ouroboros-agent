import pytest
pytest.importorskip('browser_use')
import asyncio
from types import SimpleNamespace
from full_agent.privacy import GatedModel,PrivacyBridge,PrivacyBlocked
from full_agent.runtime import BoundedTools
from browser_use.llm.messages import UserMessage,ContentPartImageParam,ImageURL

def test_only_allowlisted_tools():
    tools=BoundedTools(None,['http://localhost:8089/agent-proof.html'])
    assert set(tools.registry.registry.actions)=={'navigate','fill','select','click','scroll','wait','done'}
    tools.set_coordinate_clicking(True)
    assert not tools._coordinate_clicking_enabled

def test_real_bridge_exact_egress_and_images():
    from pathlib import Path
    from full_agent.privacy import ROOT
    if not (ROOT/'models/bert-small-pii/onnx/model_quantized.onnx').is_file():
        pytest.skip('Local BERT assets required for real bridge integration test')
    class Capture:
        model='offline';provider='offline'
        async def ainvoke(self,messages,output_format=None,**kwargs):
            self.messages=messages
            return SimpleNamespace(completion='ok')
    async def run():
        bridge=await PrivacyBridge().start()
        try:
            inner=Capture();gate=GatedModel(inner,bridge)
            await gate.ainvoke([UserMessage(content='Full name Ravi Kumar, email ravi@example.com. Do not submit.')])
            wire=str([m.model_dump() for m in inner.messages])
            assert 'Ravi Kumar' not in wire and 'ravi@example.com' not in wire
            assert '<NAME_1>' in wire and '<EMAIL_1>' in wire
            assert gate.evidence[-1]['pass']
            with pytest.raises(PrivacyBlocked):
                await gate.ainvoke([UserMessage(content=[ContentPartImageParam(image_url=ImageURL(url='data:image/png;base64,raw'))])])
            assert len(gate.evidence)==1
            with pytest.raises(PrivacyBlocked):
                await bridge.call('messages',value=[dict(role='user',content='CANARYBLOCKXYZ')],canaries=['CANARYBLOCKXYZ'])
        finally: await bridge.close()
    asyncio.run(run())
