# ADR-0002: Demo-slice scope — real loop over showpiece or script

Date: 2026-07-28 · Status: accepted

## Context
Near-term goal is a convincing live demo for design partners. Options: (A) make
the core loop real but narrow; (B) live meeting bot showpiece; (C) polished
scripted demo.

## Decision
Option A. Real Claude answers/extraction + Voyage embeddings + transcript import
+ review queue + Slack Socket Mode bot. No live meeting bot, no voice, no SSO,
no Postgres in this slice (see spec §8).

## Consequences
Every demo hour also advances the pilot. The live bot is the next slice; a
scripted demo would shatter under off-script questions and was rejected.
