# Experimental protocols

## Implemented: go-no-go-v1

Consent -> camera/EAR preparation (or simulation/task-only) -> pre fatigue rating -> Go/No-Go task -> post fatigue rating -> local save -> optional upload.

UI durations: 30 seconds, 3 minutes and 5 minutes. Go probability 0.75; response window 1000 ms; inter-trial interval 600–1300 ms. Responses under 100 ms are anticipations. Excess timer lag marks trials invalid. Leaving the foreground interrupts the session. Browser stimulus/input times are estimates.

The natural-open-eye preparation calibrates EAR, not screen gaze. There is no independent resting baseline, practice phase or thought-probe label.

## Proposed next protocol (not implemented)

Preparation: consent, structured confounders, hardware/quality check, EAR calibration and optional screen-gaze calibration.
Practice: familiarize user; mark practice events separately.
Baseline: pilot a short standardized observation phase; document stimuli and duration.
Task: sustained attention, with predeclared blocks and optional randomized probes.
Post: fatigue self-rating, optional task burden and save/upload choice.

Candidate baseline/task durations are experimental parameters, not validated fatigue induction. Pilot approximately 1–2 minutes baseline and 8–10 minutes task, then choose and version the protocol based on burden and signal quality.

## Thought probes

Ask: “Just before this prompt, where was your attention?” Responses: on task / thinking about something unrelated / unsure. These are self-reported labels, not objective diagnoses.

Predeclare a randomized schedule and candidate pre-prompt window (e.g. 20 seconds), minimum spacing and valid-coverage threshold. Store the realized schedule. Place probes between trials; suspend task timing during the prompt and tag probe/recovery periods. Never count probe answering as a task omission or include post-prompt observations in the label's feature window.

Exclude windows overlapping a prior probe/recovery interval or insufficient quality. Do not convert unsure/missing responses to off-task. Keep task-version and probe-protocol metadata.
