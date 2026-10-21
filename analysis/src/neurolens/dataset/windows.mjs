/**
 * Acquisition-time window membership: start_ms <= acquired_elapsed_ms < end_ms.
 * Processing timestamps are stored as provenance only.
 */
import {
  DATASET_OBSERVATION_CONTRACT,
  DATASET_WINDOW_CONTRACT,
  OBSERVATION_UNITS,
  PROTOCOL_GO_NO_GO_V1,
  QUALITY_FLAGS,
  SCIENTIFIC_REVIEW,
  UNASSIGNED_REASON,
  WINDOW_KIND,
  WINDOW_ORIGIN,
  WINDOW_STATUS,
  scientificReviewForProtocol,
} from './contracts.mjs';
import { acquiredElapsedMs, finiteNumber } from './validate.mjs';

export { acquiredElapsedMs };

function taskIdFor(task, index, tasks) {
  if (typeof task.task_id === 'string' && task.task_id.length > 0) return task.task_id;
  const base = typeof task.kind === 'string' && task.kind.length > 0 ? task.kind : `task-${index}`;
  const sameKind = tasks.filter((other) => (other.kind ?? '') === (task.kind ?? '')).length;
  return sameKind > 1 ? `${base}-${index}` : base;
}

function windowKindFor(task) {
  return task.protocol_id === PROTOCOL_GO_NO_GO_V1 ? WINDOW_KIND.GO_NO_GO : WINDOW_KIND.UNSIGNED_SLOT;
}

function compareWindows(a, b) {
  if (a.session_id !== b.session_id) return a.session_id.localeCompare(b.session_id);
  if (a.start_ms !== b.start_ms) return a.start_ms - b.start_ms;
  return a.task_id.localeCompare(b.task_id);
}

function exclusiveEnd(window, durationMs) {
  if (window.end_ms == null) return durationMs;
  return window.end_ms;
}

export function observationInWindow(acquired, window, durationMs) {
  const end = exclusiveEnd(window, durationMs);
  if (!finiteNumber(end)) return acquired >= window.start_ms;
  return acquired >= window.start_ms && acquired < end;
}

function unassignedReason(acquired, windows, durationMs) {
  if (windows.length === 0) return UNASSIGNED_REASON.NO_WINDOW;
  const earliest = Math.min(...windows.map((window) => window.start_ms));
  if (acquired < earliest) return UNASSIGNED_REASON.PRE_TASK;
  const latestEnd = Math.max(...windows.map((window) => {
    const end = exclusiveEnd(window, durationMs);
    return finiteNumber(end) ? end : durationMs;
  }));
  if (acquired >= latestEnd) return UNASSIGNED_REASON.POST_TASK;
  return UNASSIGNED_REASON.POST_TASK;
}

function emptyMissingness() {
  const counts = { empty_window: 0, unassigned_observation: 0 };
  for (const flag of QUALITY_FLAGS) counts[flag] = 0;
  return counts;
}

export function deriveWindows(session) {
  const tasks = Array.isArray(session.mission?.tasks) ? session.mission.tasks : [];
  if (tasks.length > 0) {
    const windows = tasks.map((task, index) => {
      const start_ms = task.started_session_ms;
      const end_ms = task.ended_session_ms == null ? null : task.ended_session_ms;
      const task_id = taskIdFor(task, index, tasks);
      const protocol_id = task.protocol_id || session.config.protocol;
      const kind = windowKindFor({ protocol_id });
      return {
        contract_id: DATASET_WINDOW_CONTRACT,
        window_id: `window:${session.session_id}:${task_id}:${start_ms}`,
        session_id: session.session_id,
        task_id,
        protocol_id,
        kind,
        start_ms,
        end_ms,
        bound: '[start_ms, end_ms)',
        window_origin: WINDOW_ORIGIN.MISSION_SIDECAR,
        scientific_review: scientificReviewForProtocol(protocol_id),
        observation_count: 0,
        trial_count: 0,
        valid_count: 0,
        qa: {
          valid_count: 0,
          duration_ms: end_ms == null ? null : end_ms - start_ms,
          valid_per_ms: null,
        },
      };
    });
    windows.sort(compareWindows);
    return {
      windows,
      window_origin: WINDOW_ORIGIN.MISSION_SIDECAR,
    };
  }

  const start_ms = 0;
  const end_ms = session.duration_ms;
  return {
    windows: [{
      contract_id: DATASET_WINDOW_CONTRACT,
      window_id: `window:${session.session_id}:go-no-go:${start_ms}`,
      session_id: session.session_id,
      task_id: 'go-no-go',
      protocol_id: session.config.protocol,
      kind: WINDOW_KIND.GO_NO_GO,
      start_ms,
      end_ms,
      bound: '[start_ms, end_ms)',
      window_origin: WINDOW_ORIGIN.SESSION_FALLBACK,
      scientific_review: SCIENTIFIC_REVIEW.V1_EXISTING,
      observation_count: 0,
      trial_count: 0,
      valid_count: 0,
      qa: {
        valid_count: 0,
        duration_ms: end_ms,
        valid_per_ms: null,
      },
    }],
    window_origin: WINDOW_ORIGIN.SESSION_FALLBACK,
  };
}

function projectObservation(session, sample, index, windows) {
  const acquired = acquiredElapsedMs(sample);
  const match = windows.find((window) => observationInWindow(acquired, window, session.duration_ms)) ?? null;
  const processed = finiteNumber(sample.processed_elapsed_ms) ? sample.processed_elapsed_ms : null;
  return {
    contract_id: DATASET_OBSERVATION_CONTRACT,
    observation_id: `obs:${session.session_id}:${index}`,
    session_id: session.session_id,
    index,
    acquired_elapsed_ms: acquired,
    processed_elapsed_ms: processed,
    window_id: match ? match.window_id : null,
    unassigned_reason: match ? null : unassignedReason(acquired, windows, session.duration_ms),
    source: sample.source,
    quality: sample.quality ?? null,
    eye_aspect_ratio: sample.eye_aspect_ratio ?? null,
    gaze_x: sample.gaze_x ?? null,
    gaze_y: sample.gaze_y ?? null,
    face_present: sample.face_present ?? null,
    eyes_closed: sample.eyes_closed ?? null,
    units: OBSERVATION_UNITS,
  };
}

function projectTrial(session, trial, index, windows) {
  const gngWindows = windows.filter((window) => window.kind === WINDOW_KIND.GO_NO_GO);
  const match = gngWindows.find((window) => observationInWindow(trial.onset_ms, window, session.duration_ms)) ?? null;
  return {
    trial_id: `trial:${session.session_id}:${index}`,
    session_id: session.session_id,
    index: trial.index ?? index,
    type: trial.type,
    onset_ms: trial.onset_ms,
    deadline_ms: trial.deadline_ms ?? null,
    reaction_ms: trial.reaction_ms ?? null,
    responded: trial.responded ?? null,
    correct: trial.correct ?? null,
    invalid_reason: trial.invalid_reason ?? null,
    source: trial.source ?? session.sources?.behavior ?? null,
    window_id: match ? match.window_id : null,
  };
}

function isCameraValidOcularObservation(observation) {
  return observation.source === 'camera'
    && observation.quality === 'valid'
    && finiteNumber(observation.eye_aspect_ratio);
}

function finalizeWindow(window, session) {
  const duration = window.qa.duration_ms;
  window.qa.valid_count = window.valid_count;
  window.qa.valid_per_ms = finiteNumber(duration) && duration > 0
    ? window.valid_count / duration
    : null;
  if (window.observation_count === 0) {
    window.status = WINDOW_STATUS.EMPTY;
  } else if (session.status === 'interrupted' || window.end_ms == null) {
    window.status = WINDOW_STATUS.INTERRUPTED;
  } else {
    window.status = WINDOW_STATUS.COMPLETED;
  }
  return window;
}

export function assignMembership(session) {
  const derived = deriveWindows(session);
  const windows = derived.windows;
  const samples = Array.isArray(session.samples) ? session.samples : [];
  const observations = samples.map((sample, index) => projectObservation(session, sample, index, windows));
  const trials = (Array.isArray(session.trials) ? session.trials : [])
    .map((trial, index) => projectTrial(session, trial, index, windows));

  const byWindow = new Map(windows.map((window) => [window.window_id, window]));
  const missingness = emptyMissingness();

  for (const observation of observations) {
    if (observation.quality && Object.hasOwn(missingness, observation.quality)) {
      missingness[observation.quality] += 1;
    }
    if (!observation.window_id) {
      missingness.unassigned_observation += 1;
      continue;
    }
    const window = byWindow.get(observation.window_id);
    window.observation_count += 1;
    if (observation.quality === 'valid') window.valid_count += 1;
  }
  for (const trial of trials) {
    if (!trial.window_id) continue;
    const window = byWindow.get(trial.window_id);
    if (window) window.trial_count += 1;
  }
  for (const window of windows) {
    finalizeWindow(window, session);
    if (window.status === WINDOW_STATUS.EMPTY) missingness.empty_window += 1;
  }

  observations.sort((a, b) => {
    if (a.session_id !== b.session_id) return a.session_id.localeCompare(b.session_id);
    if (a.acquired_elapsed_ms !== b.acquired_elapsed_ms) return a.acquired_elapsed_ms - b.acquired_elapsed_ms;
    return a.index - b.index;
  });
  trials.sort((a, b) => {
    if (a.session_id !== b.session_id) return a.session_id.localeCompare(b.session_id);
    if (a.onset_ms !== b.onset_ms) return a.onset_ms - b.onset_ms;
    return a.index - b.index;
  });

  const camera_source_present = session.mode === 'camera' && session.sources?.vision === 'camera';
  const ocular_observations_present = camera_source_present
    && observations.some(isCameraValidOcularObservation);

  return {
    window_origin: derived.window_origin,
    windows,
    observations,
    trials,
    missingness,
    camera_source_present,
    ocular_observations_present,
    unassigned_observations: observations.filter((observation) => observation.window_id == null),
  };
}
