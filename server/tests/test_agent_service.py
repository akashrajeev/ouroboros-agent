import pytest
pytest.importorskip('browser_use')
from fastapi.testclient import TestClient
from full_agent.server import app,origin_of

def test_websites_cannot_trigger_local_agent():
    client=TestClient(app)
    r=client.post('/agent/run',headers={'origin':'https://attacker.invalid','x-ouro-client':'extension'},json={'task':'x','marker':'a'*32,'url':'http://localhost:8089'})
    assert r.status_code==403
    assert client.get('/health').json()['mode']=='full-agent'

def test_non_web_urls_are_rejected():
    for url in ('file:///etc/passwd','javascript:alert(1)','https://u:p@example.com'):
        with pytest.raises(ValueError):origin_of(url)
