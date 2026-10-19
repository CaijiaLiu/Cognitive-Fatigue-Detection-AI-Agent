# W1.6 — Offline export-to-agent integration

Status: **Implemented as an engineering integration over synthetic fixtures; not an LLM API runtime and not scientifically validated.** Owner: Linxi. Depends on PR #2 (`agent-tools/0.1`), PR #4 (offline V1 export adapter), and PR #5 (research-agent prompt and eval harness). Collection, consent, D1, and deployment are unchanged.

This document describes the integrated offline pipeline. It does not replace [agent tools](agent-tools.md), [export adapter](analysis-export-adapter.md), or [agent eval](agent-eval.md). Those remain the contract sources for their slices.

## What is and is not established

| Kind | Meaning here |
|---|---|
| Contract correctness | Versioned schemas, reason codes, metric identifiers, units, and citation rules still match `agent-tools/0.1`, `agent-answer/0.1`, `research-agent-prompt/0.1`, V1 export `1.0.0`, and `go-no-go-v1` → `go-no-go/1.0`. |
| Engineering integration | A valid synthetic V1 JSON export can travel export adapter → immutable evidence → read-only tools → prompt builder → response validator → `agent-eval-report/0.1`. |
| LLM behavioral evaluation | Manual ChatGPT scoring from W1.5 remains a human paste workflow. W1.6 does **not** call a model. Passing gold/trap tests is not model quality. |
| Scientific validation | Not established. Metric names, units, and comparison rules are still pending Caijia review. Synthetic fixtures cannot establish empirical performance, camera accuracy, or clinical validity. |

These four are not interchangeable. A green `npm run test:integration` result is contract + engineering evidence only.

## Integrated pipeline

```text
V1 JSON session export (schema 1.0.0, protocol go-no-go-v1)
        │
        ▼
  validateExport()                 fail-closed schema / protocol gate
        │
        ▼
  createExportStore()              immutable evidence-artifact/0.1
        │                          analysis-export/0.1
        ▼
  createAnalysisTools({ store })   read-only get_session_summary /
                                   compare_sessions / get_evidence
        │
        ▼
  buildPromptPackage({ tools })    research-agent-prompt/0.1
        │                          validated envelopes + artifacts
        ▼
  evaluateAnswer()                 agent-answer/0.1 validator
        │
        ▼
  agent-eval-report/0.1            pass / fail, no LLM required
```

No API key, no network, no production D1, and no camera stream are used. The adapter does not fabricate missing measurements. The evidence layer does not accept unsupported session bindings. The Research Agent must not produce diagnoses, clinical conclusions, or unsupported fatigue scores.

## Input / output contracts

| Stage | Contract | Notes |
|---|---|---|
| Export input | V1 schema `1.0.0`, protocol `go-no-go-v1` | Mission-preview, demo, CSV, unknown schema rejected |
| Analysis version | `analysis-export/0.1` | Incompatible with fixture `analysis-fixture/0.1` |
| Tools | `agent-tools/0.1` | Same three read-only tools as PR #2 |
| Evidence | `evidence-artifact/0.1` | `data_origin: session_export`, computation `deterministic_export_normalization` |
| Prompt | `research-agent-prompt/0.1` | Gold answers stay hidden from the pasteable prompt |
| Answer | `agent-answer/0.1` | Answered claims copy `metric_id`, `value`, `unit` from a cited artifact |
| Report | `agent-eval-report/0.1` | Programmatic score; LLM output remains untrusted |

Supported metrics (engineering copy only):

| `metric_id` | Unit | Source |
|---|---|---|
| `reaction_time_median_ms` | `ms` | `behavior_summary.median_reaction_ms` |
| `accuracy` | `proportion` | `behavior_summary.accuracy` |
| `valid_trial_count` | `count` | `behavior_summary.valid_trial_count` |

Session refs for exports are `export:session:<uuid>`. Fixture refs remain `fixture:session:…`. They do not share catalogs.

## How to run the integration tests

One command, no LLM API key, no network:

```sh
npm run test:integration
```

This runs `tests/analysis-integration.test.mjs` through the existing `node --test` runner. It uses committed synthetic fixtures under `analysis/fixtures/exports/` and the W1.5 fixture catalog. Exit code is nonzero if any integration test fails.

Full analysis + collection unit suite:

```sh
npm test
```

Manual ChatGPT scoring is unchanged and is **not** required for W1.6:

```sh
npm run eval:agent -- self-check
```

Do not commit generated reports, ChatGPT pastes, or participant exports. Local eval output may use gitignored `analysis/eval-runs/`.

## Expected results

Positive outcomes (test success means the pipeline accepted a grounded answer or a required abstention):

| Test | Input | Expected |
|---|---|---|
| A Valid export | `camera-behavior-a.json` | Schema/protocol accepted; immutable artifact; tools retrieve copied RT; prompt contains that evidence; gold `agent-answer/0.1` accepted |
| D Missing data | `missing-rt.json` | `insufficient_data`; empty metrics; no numeric claim |
| E Protocol incompatibility | camera A + `other-protocol.json` | `incompatible_protocol`; no comparison metrics |
| F Regression (gold) | W1.5 cases `valid-metric-rt`, `valid-comparison-rt`, `missing-evidence-low-quality`, `incompatible-protocols`, `unsupported-medical-claim` | Gold `composeAnswer` still passes |

Negative outcomes (test success means the violation was **rejected**):

| Test | Violation | Expected `reason_code` |
|---|---|---|
| B Numeric fidelity | Claim value `999` against the camera-A artifact | `numeric_mismatch` |
| C Session binding | Valid camera-B artifact cited for camera A | `session_mismatch` |
| D Fabricated missing metric | Answered RT when no artifact exists | validator fail (`missing_evidence` / `unknown_artifact`) |
| F `fabricated-value` | Planted 999 ms on fixture A | `numeric_mismatch` |
| F `incorrect-citation` | Fixture B artifact cited for session A | `session_mismatch` |

Rejection of a trap case is the successful test outcome.

## Known limitations

- Synthetic fixtures and copied `behavior_summary` values only. Not camera-validated, not a real participant export, and not an empirical benchmark.
- Metric identifiers, units, `n` definitions, and whether simulated-vision behavior may be compared with camera sessions remain blocked on Caijia review.
- `coverage: 'all'` is an engineering citation rule, not a confirmed scientific comparison requirement.
- Analysis versions `analysis-fixture/0.1` and `analysis-export/0.1` stay incompatible on purpose.
- No LLM provider is integrated. W1.5 ChatGPT results (5/5 positive, 2/2 traps) are a separate manual measurement and do not validate this pipeline scientifically.
- Collection, consent, production D1, mission preview, and deployment are unchanged.

## Scientific review dependencies

W1.6 must not be treated as Stage F completion or as fatigue-prediction evidence. Before any research claim that uses export-backed numbers:

1. Confirm `reaction_time_median_ms`, `accuracy`, and `valid_trial_count` names, units, and observation counts.
2. Confirm protocol-compatibility and simulated-versus-camera pooling rules.
3. Replace synthetic fixtures with authorized, de-identified real exports and report independent participant counts.
4. Keep labels from explicit self-reports or task definitions; do not infer ADHD, fatigue scores, or medical conclusions.

Insufficient data remains a valid reason to defer prediction claims.

## Files

| Path | Responsibility |
|---|---|
| `analysis/src/neurolens/eval/pipeline.mjs` | Offline export → tools → prompt → report wiring |
| `tests/analysis-integration.test.mjs` | Tests A–F |
| `analysis/src/neurolens/eval/prompt.mjs` | Uses the injected tools' `analysis_version` (fixture default unchanged) |
