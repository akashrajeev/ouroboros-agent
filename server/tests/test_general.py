import pytest
pytest.importorskip("browser_use")
from types import SimpleNamespace
from app.general import GeneralPlanner
from app.schemas import Action
from test_vlm import REQ

class FakeModel:
    model = 'deterministic-test-double'
    def __init__(self, action=None, fail=False): self.action=action;self.fail=fail;self.messages=[]
    async def ainvoke(self, messages, output_format):
        self.messages=messages
        if self.fail: raise RuntimeError('secret key detail must not surface')
        return SimpleNamespace(completion=self.action)

def test_sanitized_prompt_and_no_image():
    fake=FakeModel(Action(op='type',element_id='e1',text='<PAN_1>'))
    assert GeneralPlanner(fake).plan(REQ.model_copy(update={'image_jpeg_b64':'RAW_IMAGE_MARKER'})).op=='type'
    text=str(fake.messages)
    assert '<PAN_1>' in text and 'RAW_IMAGE_MARKER' not in text

def test_unknown_element_and_visual_fail_closed():
    assert GeneralPlanner(FakeModel(Action(op='click',element_id='e999'))).plan(REQ).op=='ask_user'
    assert GeneralPlanner(FakeModel(Action(op='need_visual'))).plan(REQ).op=='ask_user'

def test_provider_failure_does_not_leak_error():
    result=GeneralPlanner(FakeModel(fail=True)).plan(REQ)
    assert result.op=='ask_user' and 'secret key detail' not in result.reason

def test_repeated_action_stops():
    req=REQ.model_copy(update={'history':[Action(op='type',element_id='e1',text='<PAN_1>')]})
    assert GeneralPlanner(FakeModel(Action(op='type',element_id='e1',text='<PAN_1>'))).plan(req).op=='ask_user'
