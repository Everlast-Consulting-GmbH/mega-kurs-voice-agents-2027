import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

REQUESTY_BASE_URL = "https://router.requesty.ai"


@dataclass
class Settings:
    frame_dir: Path = field(default_factory=lambda: Path(os.getenv("CU_FRAME_DIR", "/tmp/jarvis-cu/frames")))
    timeout_seconds: float = 90
    max_turns: int = 24
    max_steps: int = 160
    model: str = "claude-haiku-5-5"
    public_url: str = "http://localhost:8800"
    vnc_url: str = "http://localhost:6080/vnc.html?autoconnect=1&resize=scale"
    orchestrator_url: str = "http://host.docker.internal:8787"
    praxis_url: str = "http://host.docker.internal:8700/praxis"
    cdp_url: str = "http://127.0.0.1:9222"
    api_key: str | None = field(default=None, repr=False)
    base_url: str | None = None

    @classmethod
    def from_env(cls):
        load_dotenv(os.getenv("JARVIS_ENV_FILE", str(Path(__file__).resolve().parents[3] / ".env")))
        # Requesty (if REQUESTY_API_KEY is set) is preferred; it expects provider-prefixed model ids.
        model = os.getenv("CU_MODEL", cls.model)
        api_key, base_url = os.getenv("ANTHROPIC_API_KEY"), None
        if os.getenv("REQUESTY_API_KEY"):
            api_key = os.getenv("REQUESTY_API_KEY")
            base_url = os.getenv("REQUESTY_BASE_URL", REQUESTY_BASE_URL).rstrip("/")
            model = model if "/" in model else f"anthropic/{model}"
        return cls(
            model=model,
            base_url=base_url,
            public_url=os.getenv("CU_PUBLIC_URL", "http://localhost:8800"),
            vnc_url=os.getenv("CU_VNC_URL", cls.vnc_url),
            orchestrator_url=os.getenv("ORCHESTRATOR_URL", cls.orchestrator_url),
            praxis_url=os.getenv("PRAXIS_URL", cls.praxis_url),
            cdp_url=os.getenv("CU_CDP_URL", cls.cdp_url),
            api_key=api_key,
        )
