from jarvis_cu_worker.app import make_client
from jarvis_cu_worker.config import Settings


def env(monkeypatch, tmp_path, **values):
    monkeypatch.setenv("JARVIS_ENV_FILE", str(tmp_path / "missing.env"))
    for key in ("REQUESTY_API_KEY", "REQUESTY_BASE_URL", "ANTHROPIC_API_KEY", "CU_MODEL"):
        monkeypatch.delenv(key, raising=False)
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_requesty_is_preferred_when_its_key_is_set(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path, REQUESTY_API_KEY="rq-test", ANTHROPIC_API_KEY="sk-test")
    s = Settings.from_env()
    assert s.api_key == "rq-test"
    assert s.base_url == "https://router.requesty.ai"
    assert s.model == "anthropic/claude-haiku-5-5"
    client = make_client(s)
    assert str(client.base_url).rstrip("/") == "https://router.requesty.ai"
    assert client.api_key == "rq-test"


def test_cu_model_override(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path, REQUESTY_API_KEY="rq-test", CU_MODEL="claude-opus-5-5")
    assert Settings.from_env().model == "anthropic/claude-opus-5-5"


def test_direct_anthropic_without_requesty(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path, ANTHROPIC_API_KEY="sk-test")
    s = Settings.from_env()
    assert s.base_url is None
    assert s.model == "claude-haiku-5-5"
    assert make_client(s).api_key == "sk-test"


def test_no_key_means_no_client(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    assert make_client(Settings.from_env()) is None
