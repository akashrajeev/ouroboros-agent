import json

from app.schemas import StepRequest
from app.vlm import VlmPlanner, parse_action, render_screen

REQ = StepRequest(
    session_id="s", task="Fill PAN <PAN_1>", url_origin="https://a.test",
    screen_map=[{"id": "e1", "role": "textbox", "label": "PAN", "bbox": (0, 0, 0.1, 0.1)},
                {"id": "e2", "role": "button", "label": "Submit", "bbox": (0, 0.2, 0.1, 0.1)}],
    legend={"<PAN_1>": "PAN"},
)


def fake(reply, sink=None):
    def t(url, body, headers, timeout):
        if sink is not None:
            sink.append((url, body, headers))
        if isinstance(reply, Exception):
            raise reply
        return {"choices": [{"message": {"content": reply}}], "usage": {"prompt_tokens": 321, "completion_tokens": 20}}
    return t


def test_prompt_has_placeholders_and_ids_only():
    txt = render_screen(REQ, 150)
    assert "<PAN_1>=PAN" in txt and "e1 textbox" in txt and "e2 button" in txt


def test_plans_from_model_json_and_sends_image_when_present():
    sink = []
    p = VlmPlanner("http://gpu.test/v1", "m", "k", transport=fake('Sure: {"op":"type","element_id":"e1","text":"<PAN_1>","reason":"PAN field"}', sink))
    a = p.plan(REQ.model_copy(update={"image_jpeg_b64": "AAAA"}))
    assert (a.op, a.element_id, a.text) == ("type", "e1", "<PAN_1>")
    url, body, headers = sink[0]
    assert url == "http://gpu.test/v1/chat/completions" and headers["authorization"] == "Bearer k"
    assert body["messages"][1]["content"][0]["type"] == "image_url"
    assert p.last["prompt_tokens"] == 321


def test_fails_safe_on_garbage_or_network_error():
    assert VlmPlanner("http://x/v1", "m", transport=fake("I think you should click it")).plan(REQ).op == "ask_user"
    assert VlmPlanner("http://x/v1", "m", transport=fake('{"op":"hack"}')).plan(REQ).op == "ask_user"
    assert VlmPlanner("http://x/v1", "m", transport=fake(TimeoutError())).plan(REQ).op == "ask_user"


def test_parse_action_ignores_extra_keys():
    assert parse_action(json.dumps({"op": "done", "reason": "ok", "confidence": 0.9})).op == "done"


def test_loop_guard_reasks_on_textbox_click():
    from app.schemas import StepRequest
    from app.vlm import VlmPlanner
    replies = iter(['{"op":"click","element_id":"e2"}', '{"op":"type","element_id":"e2","text":"<NAME_1>"}'])
    calls = []

    def transport(url, body, headers, timeout):
        calls.append(body)
        return {"choices": [{"message": {"content": next(replies)}}]}

    p = VlmPlanner("http://x/v1", "m", transport=transport)
    req = StepRequest(session_id="s", task="t <NAME_1>", url_origin="https://a.example", legend={"<NAME_1>": "NAME"},
                      screen_map=[{"id": "e2", "role": "textbox", "label": "Full name", "bbox": (0, 0, 10, 10)}], history=[])
    a = p.plan(req)
    assert a.op == "type" and a.text == "<NAME_1>" and len(calls) == 2


def seq(*replies):
    it = iter(replies)
    return lambda url, body, headers, timeout: {"choices": [{"message": {"content": next(it)}}], "usage": {}}


def test_guard_reasks_on_invented_placeholder():
    p = VlmPlanner("http://gpu.test/v1", "m", transport=seq('{"op":"type","element_id":"e1","text":"<AADHAAR_1>"}', '{"op":"done","reason":"met"}'))
    a = p.plan(REQ)
    assert a.op == "done" and p.last.get("guard")


def test_guard_reasks_on_typing_into_non_input():
    req = StepRequest(**{**REQ.model_dump(), "screen_map": [e.model_dump() for e in REQ.screen_map] + [{"id": "e3", "role": "text", "label": "Your document:", "bbox": (0, 0.3, 0.1, 0.1)}]})
    p = VlmPlanner("http://gpu.test/v1", "m", transport=seq('{"op":"type","element_id":"e3","text":"<PAN_1>"}', '{"op":"type","element_id":"e1","text":"<PAN_1>"}'))
    a = p.plan(req)
    assert (a.op, a.element_id) == ("type", "e1")
