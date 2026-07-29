"""Segmented answers → Slack Block Kit. Provenance labels always visible."""
from __future__ import annotations

_LABELS = {
    "verified": "VERIFIED",
    "inference": "INFERENCE",
    "user_provided": "USER PROVIDED",
    "conflict": "CONFLICT — sources disagree",
    "missing": "MISSING",
    "suggested_action": "SUGGESTED ACTION",
}


def format_answer_blocks(payload: dict, web_url: str) -> list[dict]:
    message = payload.get("message", {})
    blocks: list[dict] = []
    for seg in message.get("segments", []):
        label = _LABELS.get(seg.get("type", ""), seg.get("type", "").upper())
        cites = "".join(f" [{n}]" for n in seg.get("citations", []))
        blocks.append({"type": "context",
                       "elements": [{"type": "mrkdwn", "text": f"*{label}*"}]})
        blocks.append({"type": "section",
                       "text": {"type": "mrkdwn", "text": f"{seg.get('text', '')}{cites}"}})
    citations = message.get("citations", [])
    if citations:
        blocks.append({"type": "divider"})
        for c in citations:
            # citation_dict is flat: ord, title, excerpt, classification{name,...}
            classification = (c.get("classification") or {}).get("name", "")
            excerpt = (c.get("excerpt") or "")[:200]
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn",
                              "text": f"*[{c.get('ord')}] {c.get('title', 'Source')}*"
                                      f"{f' · {classification}' if classification else ''}"
                                      f"\n> {excerpt}"}],
            })
    blocks.append({
        "type": "actions",
        "elements": [{"type": "button",
                      "text": {"type": "plain_text", "text": "Open BrainChain"},
                      "url": f"{web_url}/explorer"}],
    })
    return blocks
