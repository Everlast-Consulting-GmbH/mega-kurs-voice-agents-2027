import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from .contracts import PORTS

REQUESTY_BASE_URL = "https://router.requesty.ai"


def resolve_llm(model: str) -> tuple[str, str, str | None, str]:
    """Pick the LLM route: Requesty if REQUESTY_API_KEY is set, else Anthropic directly.

    Returns (gateway, api_key, base_url, model). Requesty expects provider-prefixed model ids.
    """
    requesty_key = os.getenv("REQUESTY_API_KEY", "")
    if requesty_key:
        base_url = os.getenv("REQUESTY_BASE_URL", REQUESTY_BASE_URL).rstrip("/")
        return "requesty", requesty_key, base_url, model if "/" in model else f"anthropic/{model}"
    return "anthropic", os.getenv("ANTHROPIC_API_KEY", ""), None, model


def today() -> str:
    return datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()


@dataclass(frozen=True)
class Settings:
    mock_world_url: str = f"http://localhost:{PORTS['mockWorld']}"
    cu_worker_url: str = f"http://localhost:{PORTS['cuWorker']}"
    # Optional telephony service for place_call; not part of this repo (place_call fails without it).
    voice_agent_url: str = f"http://localhost:{PORTS['voiceAgent']}"
    model: str = "claude-haiku-5-5"
    api_key: str = ""
    gateway: str = "anthropic"
    base_url: str | None = None
    http_timeout: float = 5.0
    task_timeout: float = 120.0
    cu_timeout: float = 90.0
    approval_timeout: float = 120.0
    briefing_interval: float = 1.2
    planning_timeout: float = 20.0
    run_action_interval: float = 2.1
    demo_user_name: str = "Leo"
    max_turns: int = 12
    max_budget_usd: float = 2.0
    subscriber_capacity: int = 512

    @classmethod
    def from_env(cls):
        env_path = os.environ.get("JARVIS_ENV_FILE")
        if env_path:
            load_dotenv(env_path)
        else:
            load_dotenv(Path(__file__).resolve().parents[3] / ".env")
        gateway, api_key, base_url, model = resolve_llm(os.getenv("ORCHESTRATOR_MODEL", cls.model))
        return cls(
            mock_world_url=os.getenv("MOCK_WORLD_URL", cls.mock_world_url).rstrip("/"),
            cu_worker_url=os.getenv("CU_WORKER_URL", cls.cu_worker_url).rstrip("/"),
            voice_agent_url=os.getenv("VOICE_AGENT_URL", cls.voice_agent_url).rstrip("/"),
            demo_user_name=os.getenv("DEMO_USER_NAME", "Leo").strip() or "Leo",
            planning_timeout=float(os.getenv("PLANNING_TIMEOUT", cls.planning_timeout)),
            model=model,
            api_key=api_key,
            gateway=gateway,
            base_url=base_url,
        )

    def sdk_env(self) -> dict[str, str]:
        """Environment for the Claude Agent SDK subprocess."""
        if self.base_url:
            # Requesty authenticates via bearer token; blank the API key so a stray one is not sent.
            return {"ANTHROPIC_BASE_URL": self.base_url, "ANTHROPIC_AUTH_TOKEN": self.api_key, "ANTHROPIC_API_KEY": ""}
        return {"ANTHROPIC_API_KEY": self.api_key}
