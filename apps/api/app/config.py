"""Application configuration, driven entirely by environment variables."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "BrainChain"
    environment: str = "development"

    # SQLite by default so the MVP runs with zero external services.
    # Point at Postgres (+pgvector) via infrastructure/docker-compose.yml for
    # the full profile, e.g. postgresql+psycopg://brainchain:...@localhost:5432/brainchain
    database_url: str = f"sqlite:///{REPO_ROOT / 'brainchain.db'}"

    # Session tokens
    session_ttl_hours: int = 12
    secret_key: str = "dev-only-secret-change-me"

    # Anonymous feedback: minimum cohort before aggregates are shown.
    # Also configurable per-organization in the admin UI; this is the floor.
    min_feedback_cohort: int = 5

    # Model gateway. The mock provider is always available and never leaves
    # the process. To enable an OpenAI-compatible endpoint set these:
    llm_provider: str = "mock"  # mock | openai_compatible
    openai_base_url: str = ""
    openai_api_key: str = ""  # never committed; env only
    openai_model: str = ""

    # Deployment profile: government | commercial | private
    deployment_profile: str = "commercial"
    # Government profile forces this to False regardless of the env value.
    allow_external_model_calls: bool = False

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Do not log raw prompts/documents unless a policy explicitly allows it.
    log_raw_prompts: bool = False

    model_config = {"env_prefix": "BRAINCHAIN_", "env_file": ".env", "extra": "ignore"}

    @property
    def external_models_allowed(self) -> bool:
        if self.deployment_profile == "government":
            return False
        return self.allow_external_model_calls


@lru_cache
def get_settings() -> Settings:
    return Settings()
