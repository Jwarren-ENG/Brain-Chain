"""Provider adapters: config, Anthropic answer provider, selection logic."""
from app.config import Settings


def test_new_settings_default_to_disabled():
    s = Settings(_env_file=None)
    assert s.anthropic_api_key == ""
    assert s.anthropic_model == "claude-sonnet-5"
    assert s.embeddings_provider == "local"
    assert s.voyage_api_key == ""
    assert s.voyage_model == "voyage-3.5"
    assert s.slack_service_token == ""
