"""BrainChain Slack surface — Socket Mode (no public ingress needed).

Run:  cd apps/slack && ../../.venv/bin/python app.py
Env:  SLACK_BOT_TOKEN, SLACK_APP_TOKEN, BRAINCHAIN_SERVICE_TOKEN,
      BRAINCHAIN_API_URL, BRAINCHAIN_WEB_URL
"""
import logging

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

from brainchain_slack.api_client import BrainChainClient
from brainchain_slack.config import SlackConfig
from brainchain_slack.handlers import register_handlers

logging.basicConfig(level=logging.INFO)


def main() -> None:
    cfg = SlackConfig.from_env()
    app = App(token=cfg.bot_token)
    client = BrainChainClient(cfg.api_url, cfg.service_token)
    register_handlers(app, client, cfg)
    SocketModeHandler(app, cfg.app_token).start()


if __name__ == "__main__":
    main()
