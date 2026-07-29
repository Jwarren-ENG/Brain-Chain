"""Env-driven configuration for the Slack surface. Secrets via env only."""
import os
from dataclasses import dataclass


@dataclass
class SlackConfig:
    bot_token: str
    app_token: str
    api_url: str
    service_token: str
    web_url: str

    @classmethod
    def from_env(cls) -> "SlackConfig":
        return cls(
            bot_token=os.environ["SLACK_BOT_TOKEN"],
            app_token=os.environ["SLACK_APP_TOKEN"],
            api_url=os.environ.get("BRAINCHAIN_API_URL", "http://localhost:8000"),
            service_token=os.environ["BRAINCHAIN_SERVICE_TOKEN"],
            web_url=os.environ.get("BRAINCHAIN_WEB_URL", "http://localhost:3000"),
        )
