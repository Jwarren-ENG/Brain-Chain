"""Block Kit rendering of segmented answers."""
from brainchain_slack.blocks import format_answer_blocks

PAYLOAD = {
    "user_name": "Avery Chen",
    "message": {
        "content": "ignored — blocks render segments",
        "segments": [
            {"type": "inference", "text": "The bracket changed to 7075.", "citations": [1]},
            {"type": "verified", "text": "Load analysis showed insufficient margin.", "citations": [1]},
            {"type": "missing", "text": "No test report is linked yet.", "citations": []},
        ],
        # Flat shape matching apps/api serializers.citation_dict
        "citations": [
            {"ord": 1, "document_id": "d1", "title": "Structural report",
             "classification": {"name": "Internal", "level": 1},
             "excerpt": "Margin was insufficient with 6061."},
        ],
    },
}


def test_blocks_render_segments_with_provenance_labels():
    blocks = format_answer_blocks(PAYLOAD, "http://web")
    text = str(blocks)
    assert "7075" in text
    assert "VERIFIED" in text and "INFERENCE" in text and "MISSING" in text


def test_blocks_render_numbered_citations_and_link():
    blocks = format_answer_blocks(PAYLOAD, "http://web")
    text = str(blocks)
    assert "[1]" in text and "Structural report" in text
    assert "http://web/explorer" in text


def test_blocks_handle_empty_citations():
    payload = {"user_name": "A", "message": {"segments": [
        {"type": "missing", "text": "No authorized evidence.", "citations": []}],
        "citations": []}}
    blocks = format_answer_blocks(payload, "http://web")
    assert "No authorized evidence" in str(blocks)
