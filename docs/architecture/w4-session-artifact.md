# W4 session-artifact adapter contract (provisional)

Status: **Documented engineering contract for a future dataset builder. Not implemented as a W4 ingest pipeline.** Contract id: `w4-session-artifact/0.1-provisional`. Scientific review: **PENDING_SCIENTIFIC_REVIEW**.

W3.1 produces a local-only artifact so W4 can ingest versioned sessions without rewriting V1 or uploading provisional metadata. This is not a public-dataset adapter and does not create analysis windows.

## Accepted inputs

- V1 session JSON with `schema_version` `1.0.0`
- optional `session.orchestration` (`research-session/0.1-provisional`)
- optional `session.mission` (`mission-event/0.1-provisional`)
- deterministic serialized artifact from `serializeOrchestration`

`readSessionArtifact` and `readCompatibleSession` reject `mission-preview-1` / `mission-exploratory-v1` and do not coerce them into V1. The W4 reader also fails closed on malformed sidecars, unknown sidecar `contract_version`, and unsupported orchestration / mission / event contracts. A broken sidecar is not silently dropped onto a “clean” V1 read.

## Required reader behavior

1. Dispatch on `schema_version`. Keep `1.0.0` as the collection identity.
2. Treat orchestration/mission sidecars as local engineering metadata, not cloud DTO fields.
3. Preserve missingness (`tracking_gap`, `no_face`, `eyes_unavailable`) and do not interpret dropout as open eyes.
4. Keep acquisition time and processing time separate. Do not substitute processed time for task-boundary admission.
5. Keep camera, simulated, and task-only provenance unmixed unless a later scientific decision says otherwise.
6. Split future training/evaluation by `participant_id` / group. Do not leak session-level labels onto every window.
7. Replay fixtures with `replayOrchestration` only for timeline/state checks. Compare `acceptedTimeline()` fields. Replay is event-only (`measurement_fidelity: false`) and must not be used as proof of blink, EAR, or closure equivalence. A failed import stops replay (`replay.ok === false`).

## Explicit non-goals

- Do not change `sanitizeSession`.
- Do not upload provisional protocol, orchestration, or mission fields.
- Do not invent PVT outcomes, fatigue thresholds, or three-rating semantics.
- Do not treat generic `slot-a` / `slot-b` as signed biomedical tasks.
- Do not claim real-device or scientific validation from W3.1 tests.

## W4 prerequisites still owned elsewhere

- Caijia-signed protocol ids, event dictionary, and rating/probe semantics
- dataset validator and window builder
- public-dataset license/provenance manifest
- consented remote storage path if sidecars ever leave the browser
