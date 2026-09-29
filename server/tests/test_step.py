from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

FORM = [
    {"id": "e1", "role": "textbox", "label": "Full name", "field_type": "text", "bbox": [0.1, 0.1, 0.3, 0.04]},
    {"id": "e2", "role": "textbox", "label": "Mobile number", "field_type": "tel", "bbox": [0.1, 0.2, 0.3, 0.04]},
    {"id": "e3", "role": "textbox", "label": "PAN", "field_type": "text", "bbox": [0.1, 0.3, 0.3, 0.04]},
    {"id": "e4", "role": "button", "label": "Submit", "bbox": [0.1, 0.4, 0.1, 0.04]},
]
LEGEND = {"<NAME_1>": "NAME", "<PHONE_1>": "PHONE", "<PAN_1>": "PAN"}
TASK = "Fill the KYC form for <NAME_1>, mobile <PHONE_1>, PAN <PAN_1>, then submit."


def req(history=None, **kw):
    body = {"session_id": "s1", "task": TASK, "screen_map": FORM, "legend": LEGEND, "history": history or []}
    body.update(kw)
    return body


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_stub_fills_fields_in_order_then_submits_then_done():
    history = []
    ops = []
    for _ in range(6):
        r = client.post("/step", json=req(history))
        assert r.status_code == 200, r.text
        a = r.json()["action"]
        ops.append((a["op"], a.get("element_id"), a.get("text")))
        if a["op"] == "done":
            break
        history.append({"op": a["op"], "element_id": a.get("element_id"), "text": a.get("text")})
    assert ops == [
        ("type", "e1", "<NAME_1>"),
        ("type", "e2", "<PHONE_1>"),
        ("type", "e3", "<PAN_1>"),
        ("click", "e4", None),
        ("done", None, None),
    ]


def test_type_matching_never_crosses_types():
    legend = {"<PHONE_1>": "PHONE"}
    r = client.post("/step", json=req(legend=legend, task="Use <PHONE_1>"))
    a = r.json()["action"]
    assert a == {"op": "type", "element_id": "e2", "text": "<PHONE_1>", "reason": a["reason"]}


def test_rejects_raw_pii_without_echoing_it():
    r = client.post("/step", json=req(task="Fill with 9876543210 and ABCPE1234F"))
    assert r.status_code == 422
    assert "9876543210" not in r.text and "ABCPE1234F" not in r.text
    assert set(r.json()["detail"]["types"]) == {"PHONE", "PAN"}


def test_rejects_raw_card_in_screen_map():
    form = [dict(FORM[0], value="4111 1111 1111 1111")]
    r = client.post("/step", json=req(screen_map=form))
    assert r.status_code == 422


def test_metrics_present():
    m = client.post("/step", json=req()).json()["metrics"]
    assert m["planner"] == "stub-v1" and m["input_chars"] > 0 and m["server_ms"] >= 0


def test_schema_rejects_bad_element_id():
    bad = [dict(FORM[0], id="x1")]
    assert client.post("/step", json=req(screen_map=bad)).status_code == 422



MANIFEST = {
    "scheme": "ouroboros-redact/1",
    "placeholder_format": "<TYPE_N>",
    "legend": LEGEND,
    "masked_elements": [
        {"element_id": "e2", "tokens": ["<PHONE_1>"]},
        {"element_id": "e3", "tokens": ["<PAN_1>"]},
    ],
    "masked_element_count": 2,
    "opaque_regions": 0,
}


def test_v2_manifest_accepted_and_scheme_echoed():
    r = client.post("/step", json=req(payload_version=2, redaction=MANIFEST))
    assert r.status_code == 200, r.text
    m = r.json()["metrics"]
    assert m["redaction_scheme"] == "ouroboros-redact/1"
    assert m["masked_elements"] == 2


def test_v2_manifest_alone_supplies_the_legend():
    body = req(payload_version=2, redaction=MANIFEST)
    del body["legend"]
    r = client.post("/step", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["action"]["op"] in {"type", "click", "done"}


def test_conflicting_legends_are_rejected():
    bad = dict(MANIFEST, legend={"<PHONE_1>": "NAME"})
    r = client.post("/step", json=req(payload_version=2, redaction=bad))
    assert r.status_code == 422


def test_manifest_requires_v2():
    r = client.post("/step", json=req(redaction=MANIFEST))  # payload_version defaults to 1
    assert r.status_code == 422


def test_fill_only_instruction_never_clicks_submit():
    history = [
        {"op": "type", "element_id": "e1", "text": "<NAME_1>"},
        {"op": "type", "element_id": "e2", "text": "<PHONE_1>"},
        {"op": "type", "element_id": "e3", "text": "<PAN_1>"},
    ]
    task = "Fill the KYC form from my saved profile. Do not submit."
    r = client.post("/step", json=req(history, task=task))
    assert r.status_code == 200, r.text
    assert r.json()["action"]["op"] == "done"
