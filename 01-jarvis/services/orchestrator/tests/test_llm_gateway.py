from jarvis_orchestrator.config import Settings


def env(monkeypatch, tmp_path, **values):
    monkeypatch.setenv("JARVIS_ENV_FILE", str(tmp_path / "missing.env"))
    for key in ("REQUESTY_API_KEY", "REQUESTY_BASE_URL", "ANTHROPIC_API_KEY", "ORCHESTRATOR_MODEL"):
        monkeypatch.delenv(key, raising=False)
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_requesty_is_preferred_when_its_key_is_set(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path, REQUESTY_API_KEY="rq-test", ANTHROPIC_API_KEY="sk-test")
    s = Settings.from_env()
    assert s.gateway == "requesty"
    assert s.api_key == "rq-test"
    assert s.base_url == "https://router.requesty.ai"
    assert s.model == "anthropic/claude-haiku-5-5"
    assert s.sdk_env() == {
        "ANTHROPIC_BASE_URL": "https://router.requesty.ai",
        "ANTHROPIC_AUTH_TOKEN": "rq-test",
        "ANTHROPIC_API_KEY": "",
    }


def test_requesty_base_url_and_prefixed_model_are_respected(monkeypatch, tmp_path):
    env(
        monkeypatch,
        tmp_path,
        REQUESTY_API_KEY="rq-test",
        REQUESTY_BASE_URL="https://router.eu.requesty.ai/",
        ORCHESTRATOR_MODEL="anthropic/claude-sonnet-5-5",
    )
    s = Settings.from_env()
    assert s.base_url == "https://router.eu.requesty.ai"
    assert s.model == "anthropic/claude-sonnet-5-5"


def test_direct_anthropic_without_requesty(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path, ANTHROPIC_API_KEY="sk-test")
    s = Settings.from_env()
    assert s.gateway == "anthropic"
    assert s.base_url is None
    assert s.model == "claude-haiku-5-5"
    assert s.sdk_env() == {"ANTHROPIC_API_KEY": "sk-test"}


def test_no_key_means_unconfigured(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    s = Settings.from_env()
    assert s.api_key == ""
