# W1.5 — API-independent LLM prompt and evaluation harness

Status: **Implemented as a manual evaluation workflow; not an LLM API runtime and not scientifically validated.** Owner: Linxi. Depends on the PR #2 agent-tool contract and `validateAgentAnswer`. The original W1.5 slice shipped independently of W1.4; [W1.6](analysis-integration.md) now wires the same harness to export-backed tools. Collection, consent, D1, and deployment are unchanged.

The harness lets a researcher export a versioned prompt, paste it into ChatGPT by hand, then programmatically score the JSON reply. Network calls, API keys, and trusted-by-default model output are out of scope.

Related: [agent tools](agent-tools.md), [DEC-003](../planning/decision-log.md), [PR #2](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/2).

## Architecture

```text
EVAL_CASES (synthetic fixtures)
        │
        ▼
  buildPromptPackage()
        │  system prompt + user question + tool manifest
        │  + validated tool envelopes/artifacts
        │  + answer schema + scientific limitations
        ▼
  export prompt.md          ---- manual paste ---->  ChatGPT
                                                    │
  response.json  <---------- save JSON reply -------┘
        │
        ▼
  parseModelResponse() → validateAgentAnswer() → evaluateAnswer()
        │
        ▼
  agent-eval-report/0.1
```

Tools are executed **offline** before the prompt is built. The model does not call tools and does not see gold answers. `composeAnswer` is used only as the hidden expected baseline.

## Files

| Path | Responsibility |
|---|---|
| `analysis/prompts/research-agent-prompt-0.1.md` | Versioned system prompt |
| `analysis/src/neurolens/eval/prompt.mjs` | Deterministic prompt builder |
| `analysis/src/neurolens/eval/cases.mjs` | Seven synthetic evaluation cases |
| `analysis/src/neurolens/eval/harness.mjs` | Parse, validate, score, report |
| `scripts/eval-agent.mjs` | `list` / `export` / `validate` / `self-check` CLI |
| `tests/agent-eval.test.mjs` | Builder + harness + CLI tests |

Additive only on the PR #2 validator: `validateAgentAnswer(..., { coverage: 'all' })` so comparison citations must cover every requested session. Default remains `'any'`.

## Test strategy

- Every required category is present.
- Prompt packages are byte-identical across repeats and include the five required sections.
- Gold `composeAnswer` outputs pass the harness.
- Planted fabricated-value and incorrect-citation replies fail.
- Comparison `coverage: 'all'` rejects a one-session citation.
- CLI export/validate works on a temp directory; URLs are rejected.
- `fetch` is not called.

## Dependency risks

- The fixture catalog path still works without export JSON. Export-backed prompts require W1.4/`analysis-export/0.1` tools; see [analysis-integration.md](analysis-integration.md).
- Caijia has not confirmed metric science; prompts state that limitation.
- A passing ChatGPT report is **not** model quality for fatigue research and **not** Stage F completion.
- `coverage: 'all'` is shared with the export adapter; default citation coverage remains `'any'`.

## Manual run of one case

```sh
npm run eval:agent -- list
npm run eval:agent -- export valid-metric-rt --out /tmp/nl-eval
```

1. Open `/tmp/nl-eval/prompt.md`.
2. Paste it into ChatGPT. Do not paste `case.meta.json`.
3. Save the model’s JSON as `/tmp/nl-eval/response.json`.
4. Score it:

```sh
npm run eval:agent -- validate valid-metric-rt --response /tmp/nl-eval/response.json --out /tmp/nl-eval/report.json
```

`report.result` is `pass` or `fail`. Treat `fail` (or any unvalidated chat text) as untrusted.

Offline gold/trap check without ChatGPT:

```sh
npm run eval:agent -- self-check
```

## Report format (`agent-eval-report/0.1`)

```json
{
  "report_version": "agent-eval-report/0.1",
  "case_id": "valid-metric-rt",
  "prompt_version": "research-agent-prompt/0.1",
  "evaluated_at": "2026-10-19T03:00:00.000Z",
  "model_source": "manual_chatgpt",
  "result": "pass",
  "checks": [
    { "name": "json_parse", "passed": true },
    { "name": "answer_schema", "passed": true },
    { "name": "expected_status", "passed": true },
    { "name": "expected_reason", "passed": true },
    { "name": "numeric_fidelity", "passed": true },
    { "name": "citation_binding", "passed": true }
  ],
  "validator": { "ok": true },
  "limitations": [
    "Manual or synthetic LLM evaluation over fixtures; not an API run and not scientific validation."
  ]
}
```

## What this does not establish

A green report means the pasted JSON matched the fixture contract. It does not mean ChatGPT is a scientific assistant, that the three metrics are correctly defined, or that any camera/session data were used.
