# Data contracts and independent versions

## V1 contract (implemented)

SCHEMA_VERSION is 1.0.0; task protocol is go-no-go-v1. Sessions contain session_id, browser participant_id, wall-clock dates, duration/status, mode, sources, local consent, fatigue_pre/post, config, calibration, samples, blink_events, trials and summaries. Local records also contain environment/events/notes; the cloud DTO strips those fields.

Visual samples carry elapsed_ms, source, face_present, eye_aspect_ratio, eyes_closed, gaze_x/y, head_rotation and quality. The camera feature sampling target is approximately 10 Hz, not guaranteed sampling frequency.

The browser participant ID links a browser's sessions; it is pseudonymous and is not a verified unique person. Device changes can create new IDs.

## Proposed next schema (not implemented)

Before collecting new fields, specify:
- protocol_id/version, phase events, feature_algorithm_version and tracking model version;
- facial feature names and score values, head/gaze feature units;
- gaze calibration results, held-out validation errors, quality status and actual sample intervals;
- thought_probes: prompt onset, response onset, label (on_task/off_task/unsure), target pre-prompt window;
- structured confounders with explicit missing values;
- window features with start/end, coverage, valid observation count and exclusion reasons.

Use a new compatible minor schema for additive fields with documented defaults; use a major version for changed semantics, units or incompatible shape. Readers dispatch by schema version. Unsupported versions fail explicitly. Never reinterpret old gaze_x/y as screen gaze or old closed_fraction as validated PERCLOS.

## Evolution checklist

1. Define units, nullable fields, quality rules and source.
2. Update client writer, local/export readers and server allowlist together.
3. Decide old-session behavior and document migration; retain raw version metadata.
4. Test an old session, a new session, missing tracking and mixed/synthetic provenance.
5. Update status and protocol/feature documents before announcing availability.

## Offline export-adapter contract (implemented, not scientifically validated)

The analysis adapter accepts already-exported V1 JSON (`schema_version` `1.0.0`, protocol `go-no-go-v1`) and emits `evidence-artifact/0.1` records with `analysis_version` `analysis-export/0.1`, `data_origin` `session_export`, and `protocol_version` `go-no-go/1.0`. Raw collection protocol `go-no-go-v1` is preserved in provenance. Mission-preview, demo, CSV and unknown schemas are rejected. See [analysis-export-adapter.md](analysis-export-adapter.md).

## Analysis contract

An observation is not a label. Fatigue ratings and thought-probe responses are separate outcomes. Pre/post fatigue ratings must not be copied onto every window as verified fatigue state.

Simulated vision is excluded from empirical ocular training/validation. Adjacent windows and repeated sessions from one participant stay within the same evaluation group. Fit imputation, scaling and feature selection on training folds only. Preserve missingness; do not turn failed tracking into zero movement.

## Mission-preview contract and target integration

Reviewed source `663ed79` uses `mission-preview-1`, protocol `mission-exploratory-v1`, presentation `mission-en-v0.3-live-eyes`, separate IndexedDB identity and participant key. It contains tasks[], ratings {pre,between,post}, rating_events and presentation settings, with upload_consent=false. It is not a supported main cloud DTO.

The integrated contract must record task start/end offsets relative to the session clock, task-specific protocol/timing parameters, presentation/feedback settings and source/quality metadata. Preserve original schema identity on imported data. Explicitly distinguish product milestone, protocol, schema and presentation versions: preview v0.3 does not mean V3 modeling is implemented.

Do not silently convert the three preview ratings to V1 pre/post or upload old preview sessions. Old-reader compatibility and a deliberate consented upload path are gates in [mission integration](../planning/mission-integration.md).

## Mission event contract (provisional, local-only)

W3.0 adds `mission-event/0.1-provisional` on local V1 records as `session.mission`. Scientific review: **PENDING_SCIENTIFIC_REVIEW**. It records task start/end offsets and frame-admission events. It does not change `schema_version` `1.0.0`, cloud allowlists, or metric identifiers. Preview `mission-preview-1` remains incompatible and is not rewritten. See [mission-adapter.md](mission-adapter.md).

## Research-session orchestration contract (provisional, local-only)

W3.1 adds `research-protocol/0.1-provisional`, `research-session/0.1-provisional`, and `research-event/0.1-provisional`. The existing V1 Go/No-Go protocol stays `go-no-go-v1` / `v1-existing`. Generic multi-slot sequences use unsigned ids (`PENDING_SCIENTIFIC_REVIEW`) and remain local-only (`upload_eligible: false`). `schema_version` stays `1.0.0`. Cloud `sanitizeSession` is unchanged and still drops `mission` and `orchestration`. See [session-orchestration.md](session-orchestration.md) and [w4-session-artifact.md](w4-session-artifact.md).
