"""Transcript file parsing → speaker turns.

Supports the two formats meeting tools actually export:
  * WebVTT (Zoom, Google Meet): timing cues with `Speaker: text` or <v Speaker>
  * Plain text with `Speaker: text` lines (continuation lines merge into the
    previous turn)

Turns are the provenance unit for extraction: every extracted artifact must
reference the turn ids it came from.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


class TranscriptParseError(ValueError):
    pass


@dataclass
class Turn:
    idx: int
    speaker: str
    text: str
    start: str | None = None


_SPEAKER_LINE = re.compile(r"^([A-Za-z][\w .,'\-]{0,60}?):\s+(.+)$")
_VTT_TIMING = re.compile(r"^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+")
_VTT_VOICE = re.compile(r"^<v\s+([^>]+)>\s*(.*?)\s*(?:</v>)?\s*$")


def parse_transcript_file(filename: str, content: str) -> list[Turn]:
    content = content.lstrip("﻿")
    if filename.lower().endswith(".vtt") or content.lstrip().startswith("WEBVTT"):
        turns = _parse_vtt(content)
    else:
        turns = _parse_plain(content)
    if not turns:
        raise TranscriptParseError(
            "No speaker-labelled lines found. Expected a Zoom/Meet .vtt export or "
            'plain text with "Speaker Name: what they said" lines.'
        )
    return turns


def _append(turns: list[Turn], speaker: str, text: str, start: str | None) -> None:
    if turns and turns[-1].speaker == speaker:
        turns[-1].text = f"{turns[-1].text} {text}".strip()
    else:
        turns.append(Turn(len(turns), speaker, text.strip(), start))


def _parse_vtt(content: str) -> list[Turn]:
    turns: list[Turn] = []
    current_start: str | None = None
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line == "WEBVTT" or line.isdigit() or line.startswith(("NOTE", "STYLE")):
            continue
        m = _VTT_TIMING.match(line)
        if m:
            current_start = m.group(1)
            continue
        v = _VTT_VOICE.match(line)
        if v:
            _append(turns, v.group(1).strip(), v.group(2), current_start)
            continue
        s = _SPEAKER_LINE.match(line)
        if s:
            _append(turns, s.group(1).strip(), s.group(2), current_start)
        elif turns:
            turns[-1].text = f"{turns[-1].text} {line}".strip()
    return turns


def _parse_plain(content: str) -> list[Turn]:
    turns: list[Turn] = []
    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            continue
        s = _SPEAKER_LINE.match(line)
        if s:
            turns.append(Turn(len(turns), s.group(1).strip(), s.group(2).strip()))
        elif turns:
            turns[-1].text = f"{turns[-1].text} {line}".strip()
    return turns


def turns_to_document_text(turns: list[Turn]) -> str:
    """Canonical readable transcript stored as the Document content."""
    return "\n\n".join(f"{t.speaker}: {t.text}" for t in turns)


def turns_to_meta(turns: list[Turn]) -> list[dict]:
    """JSON-serializable turns for meeting.extraction['turns']."""
    return [{"idx": t.idx, "speaker": t.speaker, "text": t.text, "start": t.start}
            for t in turns]
