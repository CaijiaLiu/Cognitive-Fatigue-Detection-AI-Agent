# Week 2 completion (Linxi / Research Agent)

Closeout date: 2026-10-19.
Branch reviewed: `develop/neurolens-agent`.
This file is the Week 2 engineering closeout. It is not scientific validation, not a live-LLM result, and not a deployment.

```text
WEEK 2: ENGINEERING COMPLETE (OFFLINE)
LIVE LLM: NOT RUN
CLOUDFLARE PREVIEW: NOT DEPLOYED
REMOTE E2E: NOT RUN
CAIJIA SCIENTIFIC REVIEW: PENDING / BLOCKED
```

`main` was not modified (`c163f29a986c2295e53c7b36379010682d3617aa`). No new Week 2 features, cloud resources, OpenAI calls, or scientific-contract changes were added in this closeout.

## Status classification

| Label | Meaning at closeout |
|---|---|
| WEEK 2: ENGINEERING COMPLETE (OFFLINE) | W2.1–W2.9A are merged to `develop/neurolens-agent` with passing local tests/typecheck/build. |
| LIVE LLM: NOT RUN | No `OPENAI_API_KEY`, no `NEUROLENS_AGENT_ALLOW_LIVE`, no `--execute`. Dry-run only. |
| CLOUDFLARE PREVIEW: NOT DEPLOYED | Isolated D1 was not created. Sites was not published. `deploy_allowed=false`. |
| REMOTE E2E: NOT RUN | `verify:preview-http` ran `--offline` only. No remote `--base`. |
| CAIJIA SCIENTIFIC REVIEW: PENDING / BLOCKED | Metric identifiers, units, and clinical assumptions were not reviewed or changed. |

Engineering complete ≠ scientifically validated ≠ deployed.

## Completed engineering deliverables

Linxi Week 2 shipped the Research Agent from a mock runtime through an authenticated mock demo and offline Sites-preview preparation. Caijia's Week 2 measurement/QA research track is out of this closeout.

| Slice | Deliverable | Status |
|---|---|---|
| W2.1 | Mock-provider runtime: `ask()`, tools → prompt → provider → `validateAgentAnswer`, fail-closed audit | Implemented on develop. PR #8 closed stacked; commits landed via later fast-forwards. |
| W2.2 | Same-origin HTTP `POST /api/research-agent` and `/research-agent` mock demo | Merged (PR #9). |
| W2.3 | Official OpenAI Chat Completions adapter; default remains mock | Merged with W2.4 (PR #10). Live path unused. |
| W2.4 | Independent review, `ALLOW_LIVE` gate, layer-separated eval metrics, cost estimate-only | Merged (PR #10). Confirmed P0/P1 in scope fixed. |
| W2.5 | Analysis layer, fingerprints, A–F taxonomy, `--live` dry-run / `--execute` spend gate | Merged (PR #11). |
| W2.6A | Evidence-based model metrics; 12-case dry-run manifest | Merged (PR #12). Live baseline NOT RUN. |
| W2.7 | Shared-secret HMAC cookie, D1 `upload_limits`, fail-closed public/preview | Merged (PR #13). Not a public deploy. |
| W2.8 | Isolated preview config, scoped demo SQL, offline HTTP verification | Merged (PR #14). Remote preview NOT DEPLOYED. |
| W2.9A | Sites runbook + `npm run deploy:preflight` (local PASS, `deploy_allowed=false`) | Merged (PR #15). Preview NOT published. |

Unchanged scientific contracts: `agent-tools/0.1`, `agent-answer/0.1`, `research-agent-prompt/0.1`, `evidence-artifact/0.1`, V1 schema `1.0.0`, go-no-go/`1.0`. Allowed metric identifiers remain `reaction_time_median_ms`, `accuracy`, `valid_trial_count`. Collection, camera, production D1, prompts, and the answer validator were not retuned.

## Exact merged PRs and Git SHAs

Fast-forward merges into `develop/neurolens-agent` only. Merge commit OIDs below are the GitHub `mergeCommit` values after each fast-forward.

| PR | Title | Head branch | Merge commit |
|---|---|---|---|
| [#9](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/9) | W2.2: Research Agent HTTP API and interactive demo | `cursor/w2-agent-api-4e29` | `1c3a995596438f5ad664382c5525d2b3328703ae` |
| [#10](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/10) | W2.3/W2.4: opt-in OpenAI provider, review, and live-LLM readiness | `feature/w2-real-llm-provider` | `24d55853702243b20cd511ab5d0d3a46474a993d` |
| [#11](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/11) | W2.5: real LLM evaluation workflow and failure analysis | `feature/w2-llm-evaluation` | `eaf44d91b942d9095d001ba4693799ccb807d8c8` |
| [#12](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/12) | W2.6A: real LLM baseline scoring integrity and dry-run | `feature/w2-live-llm-baseline` | `22be750a9d875d59152746c5375a8245f64aebd2` |
| [#13](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/13) | W2.7: authenticated mock demo, session isolation, and D1 rate limits | `feature/w2-authenticated-demo` | `f18e46e4bc8fe4585ba95c3e3359884affa2e3ad` |
| [#14](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/14) | W2.8: isolated Cloudflare preview config and offline verification | `feature/w2-cloudflare-preview` | `439f05b2b5a2d057c2aae6b1ea3c00f58321c3df` |
| [#15](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/15) | W2.9A: Sites preview deployment readiness (no publish) | `feature/w2-sites-deployment-readiness` | `6a0bab13eea4cd0f150485752698196fec810639` |

W2.1 implementation commits on develop (PR #8 was closed stacked against `cursor/w1-reliability-4e29`, not GitHub-merged):

| Commit | Role |
|---|---|
| `4973e57fe5a7b03989387f1e96caf5e848d34c44` | feat: mock-provider Research Agent runtime |
| `dce0a353241e97b74d71228771d7478602fd57fd` | docs: record W2.1 runtime commit |

Selected implementation SHAs still useful for audit:

| Slice | Implementation SHA |
|---|---|
| W2.2 feature | `a19ec8ec297dc9eeda75c97e82cf906a433c10dd` |
| W2.3 feature | `55fdb638dfeaf5598d736871e3a19d6554a04d3d` |
| W2.5 feature | `5bb05e688f02aa83ac2fc9dded1b640e3509b469` |
| W2.6A metric integrity + dry-run | `a7ccb9a11c6022e1a0251f56caedcfc08ffe8758` |
| W2.7 feature | `9d191552c802a71ebc51c3aaa57a4e1f8457723d` |
| W2.8 feature | `77cb63d2679834c53753a1830d7f0ac822757bb2` |
| W2.9A feature | `d73a2a2a1fdd830691e2e98d0d75445e65f51075` |

**Develop HEAD after PR #15, before this closeout:** `6a0bab13eea4cd0f150485752698196fec810639`.

**`main` (unchanged):** `c163f29a986c2295e53c7b36379010682d3617aa`.

## PR #15 review (W2.9A)

Reviewed against `develop/neurolens-agent` before fast-forward.

| Check | Result |
|---|---|
| Intended W2.9A deliverables | Present: Sites runbook, preview env template, isolated D1 plan (`neurolens-preview-d1`, not created), offline `deploy:preflight`, future OpenAI enablement note. |
| Unresolved P0/P1 | None in this slice. Docs/preflight only. |
| Scientific contracts | Unchanged. No prompt, validator, fixture-metric, collection, or camera edits. |
| Tests / build | 143 unit tests, preflight `ok=true` / `deploy_allowed=false`, `tsc --noEmit` 0, vinext build complete. |
| Deploy / OpenAI | Not invoked. |

Fast-forwarded 2026-10-19. Merge commit `6a0bab13eea4cd0f150485752698196fec810639`.

## Offline test results

Re-run 2026-10-19 on `6a0bab13eea4cd0f150485752698196fec810639` during this closeout. No live provider, no remote D1, no Sites publish.

| Command | Result |
|---|---|
| `npm test` | 143 passed, 0 failed |
| `npm run test:runtime` | 14 passed |
| `npm run test:agent-api` | 10 passed |
| `npm run test:llm` | 23 passed |
| `npm run test:demo-security` | 15 passed |
| `npm run test:preview` | 6 passed |
| `npm run test:integration` | 6 passed |
| `npm run test:reliability` | 7 passed |
| `npm run test:flow` | PASS (controlled DOM/clock; not a real camera) |
| `npm run verify:preview-http` | 15/15 PASS (offline) |
| `npm run deploy:preflight` | `ok=true`, `deploy_allowed=false`; remote D1 and Sites publication `NOT_VERIFIED` |
| `npx --no-install tsc --noEmit` | exited 0 |
| `npm run build` | vinext/Vite production build completed; routes include `/api/research-agent` and `/research-agent` |
| `npm run eval:llm` | mock 22/22 e2e; `Live evaluation: NOT_RUN`; git `6a0bab13eea4cd0f150485752698196fec810639` |
| `npm run eval:llm -- --plan live-12 --live` | dry-run only; expected 6 invocations; `estimated_upper_bound_usd NOT_MEASURED` |
| `tests/integration.mjs` | Not run (collection/cloud unchanged; never against production) |

Mock eval on that SHA (not live quality): outcomes A_skip 6, B_grounded 5, C_abstain 0, D_validator 11, E_provider 0, F_infra 0; case_status PASS 22. Synthetic fixture evaluation of runtime and validator only.

## Architecture decisions

Accepted in [decision-log.md](decision-log.md). Week 2 did not reverse earlier DEC-001–DEC-004.

| ID | Decision | Closeout implication |
|---|---|---|
| DEC-003 | Evidence-grounded research agent (long-term objective) | Runtime/tools/validator exist; scientific acceptance still blocked. |
| DEC-005 | Real LLM remains explicit opt-in (`ALLOW_LIVE`) | Default mock. Key alone is not spend permission. |
| DEC-006 | Eval layers stay separated (`PASS\|FAIL\|SKIPPED\|PROVIDER_ERROR\|NOT_RUN`) | Mock 22/22 is not live quality. |
| DEC-007 | `--live` is dry-run; `--execute` required to spend | Live baseline NOT RUN. |
| DEC-008 | Baseline model metrics exclude runtime/validator substitutes | D-class reject ≠ model abstention. |
| DEC-009 | Public demo uses shared-secret cookie + D1 rate limits | Sites ChatGPT headers are not the demo login. |
| DEC-010 | Isolated preview D1 required before any Cloudflare preview | Production `DB` must not be reused. D1 not created. |
| DEC-011 | Sites preview is prepared, not published, until Caijia local testing finishes | Sequence: Caijia local test → fix → Sites Preview → later OpenAI. |

## Deployment readiness status

| Surface | Status |
|---|---|
| Local mock runtime / HTTP demo | Engineering-ready offline. |
| Authenticated mock demo | Implemented; public/preview fail-closed without secrets, isolated store, and mock provider. |
| Isolated preview D1 `neurolens-preview-d1` | Planned only. Not created. |
| Cloudflare / Sites preview URL | None. |
| `npm run deploy:preflight` | Local PASS. `deploy_allowed=false`. |
| Sites UI publication | `NOT_VERIFIED`. Control-plane only; no in-repo `wrangler deploy`. |
| Production D1 / collection hosting | Untouched. |
| Paid OpenAI host | Out of scope. Requires a new decision after mock preview. |
| Merge to `main` | Not authorized. `main` remains `c163f29`. |

Readiness gate: [w2-preview-readiness.md](w2-preview-readiness.md). Runbook: [sites-preview-deployment.md](../operations/sites-preview-deployment.md).

## Known risks and deferred validation

| Item | Risk / deferral |
|---|---|
| Live LLM quality | Unknown. Dry-run and mock 22/22 do not measure gpt-4o-mini. |
| Cost | Estimate-only. Missing usage is `NOT_MEASURED`, not $0. Request cap ≠ monetary budget. |
| Shared-secret demo identity | Stolen cookie is valid until TTL/logout. Not OAuth. |
| In-memory limiter | Test/local only. Workers need D1. Remote D1 races are unproven. |
| Production `DB` reuse | Would mix `research_sessions` with demo limiter keys. Blocked by DEC-010. |
| Sites publication | Human control-plane. Agents must not invent `wrangler deploy`. |
| Camera / real-device QA | Not part of Linxi W2. `test:flow` is synthetic. |
| Collection cloud integration | `tests/integration.mjs` not run. |
| Scientific metric semantics | Caijia has not accepted identifiers, units, or comparison rules. |
| Historical drafts vs `main` | Open PRs #1 and #3 are leftover W1 drafts. Do not merge them to `main` as a Week 2 release. |

## Week 3 integration prerequisites

Do not start Week 3 in this closeout. Before Week 3 integration (seven-week Stage C and any follow-on agent hosting work):

1. Caijia performs local functional testing of the mock Research Agent. This closeout does not substitute for that test.
2. Fix only issues Caijia reports from that local test. Do not add Week 3 features in the same change.
3. Human creates an isolated preview D1 and binds it as `DB` on a non-production Site. Proposed name: `neurolens-preview-d1`.
4. Human sets preview secrets from [preview.env.example](../operations/preview.env.example) in Sites. Do not reuse production session secrets.
5. Human publishes Sites Preview. Then run `npm run verify:preview-http -- --base https://AUTHORIZED_HOST` and the browser checklist in [preview-verification.md](../operations/preview-verification.md).
6. Keep scientific review **Pending / Blocked** until Caijia accepts metric identifiers and comparison rules. Do not treat mock or live-LLM numbers as measurement science.
7. Keep live OpenAI as a later, separately authorized step (`ALLOW_LIVE` + `--execute` + key + local `--out` + cost cap).
8. Do not merge `develop/neurolens-agent` to `main` as a deploy or Week 2 release.

## Remaining open Linxi PRs (after PR #15)

Open drafts targeting `main`, not `develop/neurolens-agent`. Historical W1 documents; not Week 2 blockers and not authorized for `main`.

| PR | Title | Base | State |
|---|---|---|---|
| [#1](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/1) | W1 Linxi: evidence-grounded agent contract, test plan and Cursor handoff | `main` | OPEN draft |
| [#3](https://github.com/CaijiaLiu/Cognitive-Fatigue-Detection-AI-Agent/pull/3) | W1.3 Linxi: session-export adapter design for evidence-grounded agent tools | `main` | OPEN draft |

## Explicit closeout record

```text
WEEK 2: ENGINEERING COMPLETE (OFFLINE)
LIVE LLM: NOT RUN
CLOUDFLARE PREVIEW: NOT DEPLOYED
REMOTE E2E: NOT RUN
CAIJIA SCIENTIFIC REVIEW: PENDING / BLOCKED
```

Next human step: Caijia local testing. Next authorized engineering step after that: isolated D1 + Sites Preview, then a separate live-LLM decision. Week 3 is not started here.
