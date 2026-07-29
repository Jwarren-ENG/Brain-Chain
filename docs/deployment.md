# Deployment recommendations

## Profiles

| | Government | Commercial | Private |
|---|---|---|---|
| Where | air-gapped / self-hosted / gov-cloud | managed enterprise cloud | customer VPC |
| Database | customer Postgres + pgvector, volume encryption | managed Postgres | customer Postgres, CMK |
| Model calls | **external hard-disabled**; local/self-hosted models only | policy-gated, off by default | private endpoints / customer-hosted models |
| Object storage | customer MinIO/S3-compatible | managed S3 | customer bucket, CMK |
| Keys | customer-controlled | provider-managed | customer-managed (CMK) |

The profile is an organization setting (audited); government forces
`external_models_enabled=false` at the platform level.

## Local development

Zero-dependency: SQLite + in-process worker + local model provider (see README).
Full stack: `docker compose -f infrastructure/docker-compose.yml up --build` —
Postgres (pgvector), Redis, MinIO, API (auto-seeds), web.

## Production checklist

1. Postgres + pgvector; run `alembic upgrade head`; disable the dev `create_all`.
2. TLS everywhere (terminate at ingress/reverse proxy); set exact
   `BRAINCHAIN_CORS_ORIGINS`.
3. Strong `BRAINCHAIN_SECRET_KEY` from a secret manager; rotate session TTL to
   policy.
4. Replace local auth with OIDC/SAML at the `get_current_user` seam; sync IdP groups
   into ACL principals.
5. Move sync + agent execution onto Redis-backed workers (`workers/runner.py` is the
   seam); schedule briefs.
6. Ship audit events to append-only/WORM storage; alert on `approval.rejected`,
   connector `failing`, permission-error spikes.
7. Backups: nightly Postgres snapshots + object-storage versioning; test restore.
   Embeddings are derived data — they rebuild from documents.
8. Rate-limit `/auth/login` and `/ask` at the ingress.
9. Keep `BRAINCHAIN_LOG_RAW_PROMPTS=false` unless legal/policy explicitly requires
   otherwise.
