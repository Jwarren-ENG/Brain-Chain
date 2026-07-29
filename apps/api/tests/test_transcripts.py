"""Transcript parsing: Zoom/Meet VTT and speaker-labelled plain text."""
import pytest

from app.services.transcripts import (
    TranscriptParseError,
    Turn,
    parse_transcript_file,
    turns_to_document_text,
    turns_to_meta,
)

VTT = """WEBVTT

1
00:00:01.000 --> 00:00:04.000
Maria Santos: We decided to switch the bracket to 7075 aluminum.

2
00:00:04.500 --> 00:00:09.000
David Kim: The load analysis showed insufficient margin with 6061.
And the supplier already stocks 7075.

3
00:00:09.500 --> 00:00:12.000
<v Maria Santos>Priya will update the structural report by Friday.</v>
"""

PLAIN = """Maria Santos: We decided to switch the bracket to 7075 aluminum.
David Kim: The load analysis showed insufficient margin with 6061.
this continues David's previous line
Priya Patel: Should we requalify the supplier?
"""


def test_parse_vtt_turns_speakers_and_timestamps():
    turns = parse_transcript_file("review.vtt", VTT)
    assert [t.speaker for t in turns] == ["Maria Santos", "David Kim", "Maria Santos"]
    assert turns[0].idx == 0 and turns[0].start == "00:00:01.000"
    assert "supplier already stocks 7075" in turns[1].text  # continuation line merged


def test_parse_plain_merges_continuation_lines():
    turns = parse_transcript_file("notes.txt", PLAIN)
    assert len(turns) == 3
    assert "continues David's previous line" in turns[1].text
    assert turns[2].speaker == "Priya Patel"


def test_vtt_detected_by_header_even_with_txt_extension():
    turns = parse_transcript_file("export.txt", VTT)
    assert turns[0].start == "00:00:01.000"


def test_no_speaker_labels_raises_clear_error():
    with pytest.raises(TranscriptParseError) as exc:
        parse_transcript_file("notes.txt", "just some prose\nwithout any labels\n")
    assert "speaker" in str(exc.value).lower()


def test_empty_file_raises():
    with pytest.raises(TranscriptParseError):
        parse_transcript_file("empty.vtt", "WEBVTT\n\n")


def test_document_text_and_meta_round_trip():
    turns = [Turn(0, "A", "hello", "00:00:01.000"), Turn(1, "B", "world", None)]
    assert turns_to_document_text(turns) == "A: hello\n\nB: world"
    meta = turns_to_meta(turns)
    assert meta[0] == {"idx": 0, "speaker": "A", "text": "hello", "start": "00:00:01.000"}
