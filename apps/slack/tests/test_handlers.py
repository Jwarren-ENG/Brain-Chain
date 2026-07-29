"""Handler logic: mapping, channel prefix, and failure paths — no network."""
from brainchain_slack.api_client import BrainUnavailable, UserNotMapped
from brainchain_slack.config import SlackConfig
from brainchain_slack.handlers import handle_question

CFG = SlackConfig(bot_token="b", app_token="a", api_url="http://api",
                  service_token="s", web_url="http://web")


class FakeBrain:
    def __init__(self, result=None, exc=None):
        self.result = result or {"user_name": "Avery",
                                 "message": {"segments": [{"type": "verified",
                                                           "text": "answer", "citations": []}],
                                             "citations": []}}
        self.exc = exc
        self.calls = []

    def ask(self, email, query):
        self.calls.append((email, query))
        if self.exc:
            raise self.exc
        return self.result


def _say():
    sent = []

    def say(**kwargs):
        sent.append(kwargs)

    return say, sent


def test_happy_path_posts_blocks_as_the_user():
    say, sent = _say()
    brain = FakeBrain()
    handle_question("why 7075?", lambda: "avery@x.com", say, brain, CFG)
    assert brain.calls == [("avery@x.com", "why 7075?")]
    assert sent and "blocks" in sent[0]
    assert "answer" in str(sent[0]["blocks"])


def test_channel_answers_are_prefixed_with_visibility_note():
    say, sent = _say()
    handle_question("why 7075?", lambda: "avery@x.com", say, FakeBrain(), CFG,
                    in_channel=True)
    assert "based on what *you* have access to" in str(sent[0]).lower() \
        or "based on what <@" in str(sent[0])


def test_unmapped_user_gets_clear_message_and_no_api_leak():
    say, sent = _say()
    handle_question("q", lambda: "ghost@x.com", say,
                    FakeBrain(exc=UserNotMapped("ghost@x.com")), CFG)
    assert "account" in str(sent[0]).lower()


def test_missing_email_short_circuits():
    say, sent = _say()
    brain = FakeBrain()
    handle_question("q", lambda: None, say, brain, CFG)
    assert brain.calls == []
    assert "email" in str(sent[0]).lower()


def test_brain_down_is_honest():
    say, sent = _say()
    handle_question("q", lambda: "a@x.com", say,
                    FakeBrain(exc=BrainUnavailable("boom")), CFG)
    assert "unavailable" in str(sent[0]).lower() or "reach" in str(sent[0]).lower()


def test_empty_question_prompts_for_one():
    say, sent = _say()
    brain = FakeBrain()
    handle_question("   ", lambda: "a@x.com", say, brain, CFG)
    assert brain.calls == []
