"""Bolt listeners. All logic lives in handle_question so tests need no Slack."""
from __future__ import annotations

import logging
import re

from .api_client import BrainChainClient, BrainUnavailable, UserNotMapped
from .blocks import format_answer_blocks
from .config import SlackConfig

logger = logging.getLogger("brainchain.slack")

_MENTION = re.compile(r"<@[A-Z0-9]+>")

VISIBILITY_NOTE = ("_Answer based on what *you* have access to — other channel "
                   "members may not be authorized to see the cited material._")


def handle_question(question: str, email_lookup, say, client: BrainChainClient,
                    cfg: SlackConfig, *, in_channel: bool = False) -> None:
    question = _MENTION.sub("", question or "").strip()
    if not question:
        say(text="Ask me a question about company memory, e.g. "
                 "Why did we switch the bracket material?")
        return
    email = email_lookup()
    if not email:
        say(text="I couldn't read your Slack profile email, so I can't check your "
                 "BrainChain access. Ask an admin to make your profile email visible.")
        return
    try:
        payload = client.ask(email, question)
    except UserNotMapped:
        say(text="You don't have a BrainChain account linked to this email yet. "
                 "Ask your admin to add you.")
        return
    except BrainUnavailable:
        logger.warning("brain unavailable")  # metadata only, never the question
        say(text="I can't reach the company brain right now. Your question wasn't "
                 "answered — please try again in a minute.")
        return
    blocks = format_answer_blocks(payload, cfg.web_url)
    if in_channel:
        blocks.insert(0, {"type": "context",
                          "elements": [{"type": "mrkdwn", "text": VISIBILITY_NOTE}]})
    say(blocks=blocks, text=payload.get("message", {}).get("content", "Answer"))


def register_handlers(app, client: BrainChainClient, cfg: SlackConfig) -> None:
    def _email_lookup_factory(slack_client, user_id):
        def lookup() -> str | None:
            try:
                info = slack_client.users_info(user=user_id)
                return info["user"]["profile"].get("email")
            except Exception:
                return None

        return lookup

    @app.event("message")
    def on_message(event, say, client_ctx=None):
        if event.get("bot_id") or event.get("subtype"):
            return
        if event.get("channel_type") != "im":
            return  # channel traffic is handled by app_mention only
        handle_question(event.get("text", ""),
                        _email_lookup_factory(app.client, event["user"]),
                        say, client, cfg)

    @app.event("app_mention")
    def on_mention(event, say):
        handle_question(event.get("text", ""),
                        _email_lookup_factory(app.client, event["user"]),
                        say, client, cfg, in_channel=True)
