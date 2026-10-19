# W2.5 — Real LLM evaluation and failure analysis

Status: **Implemented as an analysis layer over the existing W2.3/W2.4 eval engine. Live paid runs remain explicit opt-in and were NOT RUN in this environment.** Owner: Linxi. Caijia scientific review remains **Pending / Blocked**.

This document is the W2.5 architecture proposal and the implementation record. It does not replace [agent-llm-provider.md](agent-llm-provider.md) or [agent-llm-review.md](agent-llm-review.md).

## Reusable components

| Component | Role |
|---|---|
| `eval/llm-eval.mjs` | 22 synthetic cases, 12-case live plan, `runLlmEvalSuite` |
| `eval/llm-report.mjs` | `llm-eval-report/0.1`, `CASE_STATUS`, estimate-only cost |
| `scripts/eval-llm.mjs` | CLI; mock default |
| `runtime/openai.mjs` + `runtime/config.mjs` | Opt-in Chat Completions adapter |
| `runtime/orchestrate.mjs` | Production runtime (there is no `runtime/agent.mjs`) |
| Fixtures, tools, `validateAgentAnswer` | Unchanged scientific/runtime contracts |

W2.5 does **not** add a second evaluator, validator, provider, or evidence store.

## Missing capabilities (W2.4 → W2.5)

- Experiment metadata and deterministic fingerprints
- Outcome classes A–F (runtime skip vs model vs validator vs provider vs infra)
- Structured failure taxonomy with stage and investigation area
- Separate model / runtime / operational metrics
- Markdown analysis report
- Dry-run then `--execute` live gate
- 12-case live plan as a first-class suite filter

## Execution flow

```text
eval:llm [--plan live-12] [--live] [--execute] --out PATH
        │
        ├─ default / no --live     mock suite, no network
        ├─ --live without --execute  dry-run summary only
        └─ --live --execute          requires PROVIDER=openai,
                                     ALLOW_LIVE=1, OPENAI_API_KEY,
                                     request/token/timeout caps, local --out
                │
                ▼
        runLlmEvalSuite()            existing runner
                │
                ▼
        enrichLlmEvalReport()        analysis layer (this slice)
                │
                ├─ JSON  llm-eval-report/0.1 + additive fields
                └─ MD    human-readable failure analysis
```

`--live` alone never spends money. An API key is not permission.

## Report schema extension

`report_version` stays `llm-eval-report/0.1`. Additive fields:

- `experiment` — id, timestamp, git SHA, provider/model/config, prompt/fixture/case fingerprints, validator/suite versions, invocation counts
- `outcome_class` per case — `A_RUNTIME_SKIP` … `F_EVAL_INFRA`
- `failure` per failed case — category, stage, expected/actual, artifact refs, investigation area
- `model_metrics` / `runtime_metrics` / `operational_metrics`
- `failures[]` rollup

No raw prompts, completions, or secrets.

## Trust and cost boundaries

- Mock remains default. CI and `npm test` never call OpenAI.
- Paid execution requires provider + `ALLOW_LIVE` + `--live` + `--execute` + local `--out`.
- Cost figures are estimates. A request cap is not a monetary budget. Missing usage is unknown, not $0.
- Experiment configuration (SHA, fingerprints, caps) is reproducible. Model tokens are not.

## Threats to validity

Synthetic fixtures only. n=12 is a readiness sample, not a benchmark. Mock 22/22 does not measure live quality. Validator rejection is not proof the model behaved well. No clinical validity.
