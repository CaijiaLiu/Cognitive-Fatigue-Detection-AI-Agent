# W2.2 — Research Agent HTTP API and interactive demo

Status: **Implemented as a synthetic, mock-provider HTTP demo over the W2.1 runtime; not a public LLM service and not scientifically validated.** Owner: Linxi. Depends on W2.1 (`cursor/w2-runtime-4e29`, PR #8). Collection, consent, D1, deployment, metric identifiers, and Caijia's pending scientific review are unchanged.

This slice exposes the existing read-only runtime through the current vinext/Next server. It does not add a second server, a second runtime, or a new client state library.

## Boundary map

```text
UI  /research-agent
        │  same-origin fetch, catalog + typed form only
        ▼
API  POST /api/research-agent
        │  origin, size, schema, server allowlist
        ▼
Runtime  createResearchAgentRuntime().ask()
        │  chooses tool names/args; never trusts client evidence
        ▼
Evidence store  createFixtureStore()
        │  synthetic session/artifact catalog only
        ▼
Validator  validateAgentAnswer()
        │
        ▼
UI  validated agent-answer/0.1 + public audit
```

| Layer | May do | Must not do |
|---|---|---|
| UI | Choose an allowlisted fixture session and metric; display validated answers, artifact refs, limitations | Supply evidence, tool results, paths, or raw provider text |
| HTTP API | Reject bad/unauthorized requests; invoke the W2.1 runtime; return validated answers and public audit | Trust client evidence; accept filesystem paths; return prompts or raw model bodies |
| Runtime | Authorize scope, collect evidence, call the mock provider, validate | Invent numbers, expand session scope, or skip the validator |
| Evidence store | Return synthetic fixture artifacts for opaque refs | Read client-provided artifacts or arbitrary files |

The server-side allowlist is authoritative. Hiding a session from the UI does not grant access, and adding a session in the browser cannot bypass `validateAgentHttpBody`.

## Interactive demo

Local preview (same as the collection app):

```sh
npm run dev
```

Then open `http://127.0.0.1:5173/research-agent`.

1. Select an authorized synthetic session.
2. Select a supported research question (median reaction time, accuracy, or valid trial count).
3. Submit. The page POSTs to `/api/research-agent`.
4. The panel shows loading, a validated answer, an abstention, or an error.

The page is labeled **Synthetic research demonstration**. It is not a fatigue score, ADHD assessment, or medical diagnosis.

`GET /api/research-agent` returns the catalog used by the form. The UI also embeds the same catalog from `demo-ui.mjs` so the form can render before the first request.

## Supported synthetic sessions

| `session_ref` | UI | Notes |
|---|---|---|
| `fixture:session:a` | Yes | Usable Go/No-Go summary |
| `fixture:session:b` | Yes | Second usable session |
| `fixture:session:low-quality` | Yes | Missing features; runtime abstains |
| `fixture:session:other-protocol` | Server only | Allowlisted for comparison tests; omitted from the picker |

Unauthorized examples that the API must reject: `fixture:session:hidden`, `export:session:…`, paths, and URLs.

## API contract (`research-agent-http/0.1`)

### `GET /api/research-agent`

Returns the synthetic catalog: sessions, questions, allowed metrics, and allowlisted refs. No runtime invocation.

### `POST /api/research-agent`

Same-origin JSON only. Maximum body: 8192 bytes.

Request fields are the W2.1 runtime fields only:

```json
{
  "request_id": "ui:optional",
  "question": "What is the median reaction time for fixture:session:a?",
  "intent": {
    "kind": "report_metric",
    "session_ref": "fixture:session:a",
    "metric_id": "reaction_time_median_ms"
  },
  "session_scope": ["fixture:session:a"]
}
```

`intent.kind` is required. `intent.type` and other invented field names are rejected. Extra fields, `evidence`, `tool_results`, `artifacts`, `path`, `url`, and `sql` are rejected.

| HTTP | When |
|---|---|
| 200 | Validated answer or contract abstention (`answer.status` is `answered` or `abstained`) |
| 400 | Invalid schema, unknown kind, unknown metric, unsafe fields, non-opaque refs |
| 403 | Missing/mismatched `Origin`, or a session ref outside the server allowlist |
| 413 | Body larger than 8192 bytes |
| 503 | Mock provider timeout or unavailable |

Success body:

```json
{
  "ok": true,
  "api_version": "research-agent-http/0.1",
  "demo": { "synthetic": true, "label": "Synthetic research demonstration" },
  "answer": { "answer_version": "agent-answer/0.1", "status": "answered", "claims": [] },
  "audit": { "request_id": "…", "artifact_refs": [], "failure_class": "none" }
}
```

Public audit includes request id, provider/model identity, session scope, tool-call statuses, artifact refs, validation result, failure class, duration, and limitations.

Not returned: system/user prompts, raw provider text, camera frames, participant identifiers, or secret keys.

## Security assumptions

- This endpoint is a local/preview demo, not an unrestricted public research API.
- Browsers send `Origin` on same-site `fetch`; the handler rejects missing or cross-origin requests.
- Session authorization is enforced again inside the runtime (`intent` ⊆ `session_scope`).
- Tool arguments are chosen by the runtime, not the client.
- The default provider is `createMockProvider` seeded with `composeAnswer`. The gold object still passes `validateAgentAnswer` before it is returned.
- No API key is read. Tests replace `fetch` only inside existing runtime suites; this handler does not call the network.

## Error handling

Request errors are JSON `{ ok: false, error, reason_code? }` with the statuses above. Runtime abstentions stay HTTP 200 with `answer.status = "abstained"` so missing evidence is not confused with a bad request. Provider failures are HTTP 503 and never include numeric claims from the fixture.

## Mock provider limitations

- Scripted, timeout, and unavailable modes only. No hosted LLM.
- Successful demo answers are deterministic fixture lookups, not model reasoning.
- Timeout is an immediate `ProviderError`; the mock does not sleep.
- A later isolated HTTP provider may implement the same `complete({ system, user, timeout_ms })` interface, read credentials from the environment (never Git), and must still go through `validateAgentAnswer`.

## Local testing

```sh
npm run test:agent-api
npm run test:runtime
npm test
```

Handler tests construct `Request` objects and call `handleResearchAgentPost` in-process. They do not start wrangler or touch production D1.

## Known limitations

- Vinext/Workers must be able to import the analysis modules (`nodejs_compat` is already enabled). The system prompt is bundled so the Worker does not read the markdown file from disk.
- The UI speaks English to match the agent contract; the collection app remains Chinese.
- Compare-metric and artifact-lookup intents are accepted by the API when they match the W2.1 schema and allowlist, but the demo form only submits `report_metric`.
- Caijia's metric/unit/`n`/simulated-versus-camera review remains blocked.
