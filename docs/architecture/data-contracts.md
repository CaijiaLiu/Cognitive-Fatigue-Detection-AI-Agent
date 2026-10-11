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

## Analysis contract

An observation is not a label. Fatigue ratings and thought-probe responses are separate outcomes. Pre/post fatigue ratings must not be copied onto every window as verified fatigue state.

Simulated vision is excluded from empirical ocular training/validation. Adjacent windows and repeated sessions from one participant stay within the same evaluation group. Fit imputation, scaling and feature selection on training folds only. Preserve missingness; do not turn failed tracking into zero movement.
