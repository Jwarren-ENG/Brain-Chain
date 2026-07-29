# Model-provider abstraction

The application is not hard-coded to any AI provider. `services/llm_gateway.py`
defines the seam.

## The interface

```python
class ModelProviderClient(Protocol):
    name: str
    model: str
    def generate(self, query: str, mode: str, chunks: list[RetrievedChunk]) -> GatewayAnswer: ...
```

`GatewayAnswer` carries the answer text, **provenance segments** (verified /
inference / user-provided / suggested action / missing / conflict, each with citation
ordinals), ordered citations, token counts, cost estimate, and latency.

## Shipped providers

- **`MockProvider` — "BrainChain Local"** (in-process, always available). Performs
  real deterministic synthesis over the permission-filtered chunks: sentence
  selection per source, mode shaping (direct, detailed, executive, action plan,
  research, compare, tasks, meeting prep), **conflict detection** via chunk
  `fact_key/fact_value` metadata (disagreeing sources are shown side by side), and
  coverage/missing-information notes. Because it never leaves the process it is
  permitted for every classification, which is why the government profile still has
  a fully working assistant.
- **`OpenAICompatibleProvider`** — adapter for any OpenAI-compatible chat-completions
  endpoint. Configured **only** via environment variables
  (`BRAINCHAIN_OPENAI_BASE_URL/_API_KEY/_MODEL`); no credentials in code or the
  database. Retrieved text is sanitized and wrapped as tagged untrusted data.

Different models for different classifications fall out of the policy table — e.g. a
private-cloud model policy at ceiling 2 plus the local provider at ceiling 3.

## Routing (`resolve_provider`)

Policies are evaluated by priority; the first match wins:

1. policy enabled and provider enabled;
2. `max_classification_level >= ` highest classification among retrieved chunks;
3. department/role scoping matches the caller (empty = all);
4. external providers additionally require: profile ≠ government, org toggle on,
   env configured.

Every skipped policy contributes a human-readable note recorded in the audit event —
you can always answer "why did this question use provider X?".

## Administrator controls

Per provider: enabled, external flag, data-retention allowance, tool-use allowance,
max context, monthly cost limit, region. Per policy: classification ceiling,
priority, department/role scope, logging policy, fallback provider. Editable at
**Model Policies** (security admin; changes audited).

## Adding a provider

Implement `ModelProviderClient`, add a `ModelProvider` row (`kind`, `is_external`),
branch in `resolve_provider`, and optionally map segment types if the provider can
label provenance natively. Nothing in the assistant, agents, or UI changes.
