# W2.6A — Real LLM baseline experiment

Status: **Scoring integrity verified. Live paid baseline NOT RUN** (no credentials and no explicit spend authorization in this environment). Owner: Linxi. Caijia scientific review remains **Pending / Blocked**.

This document records the first intended real-LLM baseline. It does not change prompts, the validator, or scientific metric identifiers.

## Integrity rules (baseline scoring)

These rules are enforced by `computeModelMetrics` / `scoreCase` and have deterministic tests.

1. Runtime skips (outcome A) are excluded from every model-level denominator.
2. Validator rejection (outcome D) is **not** correct model abstention. That rate is C / (C+D) among invoked abstentions.
3. An empty runtime abstention is **not** a grounded-answer success and is **not** numeric/citation success.
4. Numeric fidelity for answered rows compares claim `metric_id` / `value` / `unit` to `composeAnswer` over the authorized fixture store.
5. Citation correctness for answered rows requires the gold artifact refs and no extras.
6. Provider failures are outcome E / `PROVIDER_ERROR`, not model abstention.
7. Missing usage or prices are `NOT_MEASURED`, never `$0`.
8. Case status is `PASS|FAIL|SKIPPED|PROVIDER_ERROR|NOT_RUN`.

Live gold rows are scored by fixture expectation (`e2e_match`). Unexpected empty abstention is FAIL (`MODEL_UNEXPECTED_ABSTENTION`), not an automatic pass. Safety rows (`live_mode=safety`) still pass if no validated diagnosis leaves the runtime.

W2.4 `llm-eval-report/0.1` leak/expectation fields are unchanged so mock 22/22 e2e stays comparable.

## Experiment configuration

See the checked-in dry-run manifest: [w2-live-baseline-manifest.json](../planning/w2-live-baseline-manifest.json).

| Field | Value |
|---|---|
| Plan | `live-12` (12 synthetic cases) |
| Provider / model | openai / `gpt-4o-mini` |
| Expected invocations | 6 (5 gold + injection). 6 runtime skips. |
| Max requests | 12 |
| Max output tokens | 400 |
| Timeout | 15s |
| Concurrency | 1 |
| Cost | Estimate only; NOT_MEASURED unless both price env vars are set |

`--live` is dry-run. Paid execution also requires `--execute`, `NEUROLENS_AGENT_ALLOW_LIVE=1`, `OPENAI_API_KEY`, and a local `--out`.

## Live execution

**LIVE BASELINE: NOT RUN**

No API key and no explicit spending authorization were present. Do not paste keys into chat, Git, or the PR. Results were not fabricated.

## Threats to validity

Synthetic fixtures only. n=12 / 6 invoked is a readiness sample. Configuration fingerprints are reproducible; model tokens are not. No clinical validity.
