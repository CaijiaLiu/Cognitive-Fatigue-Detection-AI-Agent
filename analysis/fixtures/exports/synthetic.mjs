/**
 * Synthetic V1-format session exports for adapter tests.
 * These are not real participant records and cannot establish empirical performance.
 */
import { summarizeTrials } from '../../../public/collection/tasks/summary.js';

export const SECRET_PARTICIPANT_ID = 'cccc1111-2222-4333-8444-555566667777';
export const SECRET_USER_AGENT = 'SecretUserAgent/9.9';
export const SECRET_NOTE = 'SECRET_NOTE_DO_NOT_COPY';
export const SECRET_EVENT = 'SECRET_EVENT_DO_NOT_COPY';
export const SECRET_WITHDRAWAL = 'SECRET_WITHDRAWAL_TOKEN';

export const IDS = Object.freeze({
  cameraA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  cameraB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  taskOnly: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  simulated: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  missingRt: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  integrity: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  preview: '11111111-1111-4111-8111-111111111111',
  demo: '22222222-2222-4222-8222-222222222222',
  unknownSchema: '33333333-3333-4333-8333-333333333333',
  missingSummary: '44444444-4444-4444-8444-444444444444',
  otherProtocol: '55555555-5555-4555-8555-555555555555',
});

function trial(index, type, { reaction_ms = null, responded = false, correct = false, invalid_reason = null } = {}) {
  return {
    index,
    type,
    onset_ms: 1000 + index * 1500,
    deadline_ms: 2000 + index * 1500,
    response_ms: responded && Number.isFinite(reaction_ms) ? 1000 + index * 1500 + reaction_ms : null,
    reaction_ms,
    responded,
    correct,
    invalid_reason,
    source: 'human',
  };
}

export const TRIALS_A = Object.freeze([
  trial(0, 'go', { reaction_ms: 300, responded: true, correct: true }),
  trial(1, 'go', { reaction_ms: 340, responded: true, correct: true }),
  trial(2, 'go', { reaction_ms: 360, responded: true, correct: true }),
  trial(3, 'go', { reaction_ms: 320, responded: true, correct: true }),
  trial(4, 'go', { responded: false, correct: false }),
  trial(5, 'no-go', { responded: false, correct: true }),
  trial(6, 'no-go', { responded: false, correct: true }),
  trial(7, 'no-go', { reaction_ms: 180, responded: true, correct: false }),
  trial(8, 'go', { reaction_ms: 40, responded: true, correct: false, invalid_reason: 'early_start' }),
]);

export const TRIALS_B = Object.freeze([
  trial(0, 'go', { reaction_ms: 360, responded: true, correct: true }),
  trial(1, 'go', { reaction_ms: 380, responded: true, correct: true }),
  trial(2, 'go', { reaction_ms: 400, responded: true, correct: true }),
  trial(3, 'go', { responded: false, correct: false }),
  trial(4, 'go', { responded: false, correct: false }),
  trial(5, 'go', { responded: false, correct: false }),
  trial(6, 'no-go', { responded: false, correct: true }),
  trial(7, 'no-go', { responded: false, correct: true }),
]);

export const TRIALS_EMPTY = Object.freeze([
  trial(0, 'go', { reaction_ms: 20, responded: true, correct: false, invalid_reason: 'early_start' }),
  trial(1, 'go', { invalid_reason: 'timeout_setup' }),
]);

const SUMMARY_A = summarizeTrials(TRIALS_A);
const SUMMARY_B = summarizeTrials(TRIALS_B);
const SUMMARY_EMPTY = summarizeTrials(TRIALS_EMPTY);

function privacy() {
  return {
    participant_id: SECRET_PARTICIPANT_ID,
    environment: { user_agent: SECRET_USER_AGENT, viewport: { width: 1280, height: 720 } },
    notes: [SECRET_NOTE],
    events: [{ type: 'note', text: SECRET_EVENT }],
    withdrawal_token: SECRET_WITHDRAWAL,
  };
}

function baseSession({
  session_id,
  mode,
  started_at,
  ended_at,
  duration_ms,
  trials,
  behavior_summary,
  vision_summary,
  samples,
  blink_events,
  calibration,
  extras = {},
}) {
  const vision = mode === 'camera' ? 'camera' : mode === 'simulated' ? 'simulated' : 'unavailable';
  return {
    schema_version: '1.0.0',
    session_id,
    started_at,
    ended_at,
    duration_ms,
    status: 'completed',
    mode,
    sources: { vision, behavior: 'human', ratings: 'self_report' },
    consent: { version: 'v1-2026-10-10', accepted_at: started_at },
    fatigue_pre: 3,
    fatigue_post: 5,
    config: {
      protocol: 'go-no-go-v1',
      planned_duration_ms: duration_ms,
      response_window_ms: 1000,
      go_probability: 0.75,
      vision_sample_hz: mode === 'behavior' ? 0 : 10,
      ear_baseline: mode === 'behavior' ? null : 0.3,
    },
    calibration,
    vision_summary,
    behavior_summary,
    samples,
    blink_events,
    trials,
    ...privacy(),
    ...extras,
  };
}

const NULL_VISION = {
  blink_count: null,
  blink_rate_per_min: null,
  closed_time_ms: null,
  closed_fraction: null,
  valid_tracking_ms: 0,
  tracking_coverage: null,
  head_motion_deg_per_sec: null,
  gaze_position_sd_eye_width: null,
  mean_blink_duration_ms: null,
  sample_count: 0,
};

const CAMERA_VISION = {
  blink_count: 4,
  blink_rate_per_min: 8,
  closed_time_ms: 320,
  closed_fraction: 0.05,
  valid_tracking_ms: 50000,
  tracking_coverage: 0.83,
  head_motion_deg_per_sec: 1.2,
  gaze_position_sd_eye_width: 0.04,
  mean_blink_duration_ms: 180,
  sample_count: 12,
};

const SIM_VISION = { ...CAMERA_VISION, blink_count: 9 };

export const EXPECTED_A = Object.freeze({
  reaction_time_median_ms: SUMMARY_A.median_reaction_ms,
  accuracy: SUMMARY_A.accuracy,
  valid_trial_count: SUMMARY_A.valid_trial_count,
  n_rt: 4,
  n_valid: SUMMARY_A.valid_trial_count,
});

export const EXPECTED_B = Object.freeze({
  reaction_time_median_ms: SUMMARY_B.median_reaction_ms,
  accuracy: SUMMARY_B.accuracy,
  valid_trial_count: SUMMARY_B.valid_trial_count,
  n_rt: 3,
  n_valid: SUMMARY_B.valid_trial_count,
});

export function cameraSessionA() {
  return baseSession({
    session_id: IDS.cameraA,
    mode: 'camera',
    started_at: '2026-10-18T15:00:00.000Z',
    ended_at: '2026-10-18T15:01:00.000Z',
    duration_ms: 60000,
    trials: TRIALS_A,
    behavior_summary: SUMMARY_A,
    vision_summary: CAMERA_VISION,
    samples: [{
      elapsed_ms: 120,
      source: 'camera',
      face_present: true,
      eye_aspect_ratio: 0.29,
      eyes_closed: false,
      gaze_x: 0.1,
      gaze_y: 0.2,
      head_rotation: null,
      quality: 'valid',
    }],
    blink_events: [{ start_ms: 800, duration_ms: 160 }],
    calibration: { source: 'camera', ear_baseline: 0.3, frame_count: 12, frame_width: 640, frame_height: 480 },
  });
}

export function cameraSessionB() {
  return baseSession({
    session_id: IDS.cameraB,
    mode: 'camera',
    started_at: '2026-10-18T16:00:00.000Z',
    ended_at: '2026-10-18T16:01:00.000Z',
    duration_ms: 60000,
    trials: TRIALS_B,
    behavior_summary: SUMMARY_B,
    vision_summary: CAMERA_VISION,
    samples: [{
      elapsed_ms: 140,
      source: 'camera',
      face_present: true,
      eye_aspect_ratio: 0.28,
      eyes_closed: false,
      gaze_x: 0.12,
      gaze_y: 0.18,
      head_rotation: null,
      quality: 'valid',
    }],
    blink_events: [],
    calibration: { source: 'camera', ear_baseline: 0.31, frame_count: 10, frame_width: 640, frame_height: 480 },
  });
}

export function taskOnlySession() {
  return baseSession({
    session_id: IDS.taskOnly,
    mode: 'behavior',
    started_at: '2026-10-18T17:00:00.000Z',
    ended_at: '2026-10-18T17:01:00.000Z',
    duration_ms: 60000,
    trials: TRIALS_A,
    behavior_summary: SUMMARY_A,
    vision_summary: NULL_VISION,
    samples: [],
    blink_events: [],
    calibration: null,
  });
}

export function simulatedVisionSession() {
  return baseSession({
    session_id: IDS.simulated,
    mode: 'simulated',
    started_at: '2026-10-18T18:00:00.000Z',
    ended_at: '2026-10-18T18:01:00.000Z',
    duration_ms: 60000,
    trials: TRIALS_A,
    behavior_summary: SUMMARY_A,
    vision_summary: SIM_VISION,
    samples: [{
      elapsed_ms: 100,
      source: 'simulated',
      face_present: true,
      eye_aspect_ratio: 0.3,
      eyes_closed: false,
      gaze_x: 0,
      gaze_y: 0,
      head_rotation: null,
      quality: 'valid',
    }],
    blink_events: [{ start_ms: 400, duration_ms: 150 }],
    calibration: { source: 'simulated', ear_baseline: 0.3 },
  });
}

export function missingRtSession() {
  return baseSession({
    session_id: IDS.missingRt,
    mode: 'behavior',
    started_at: '2026-10-18T19:00:00.000Z',
    ended_at: '2026-10-18T19:00:20.000Z',
    duration_ms: 20000,
    trials: TRIALS_EMPTY,
    behavior_summary: SUMMARY_EMPTY,
    vision_summary: NULL_VISION,
    samples: [],
    blink_events: [],
    calibration: null,
  });
}

export function integrityMismatchSession() {
  const session = cameraSessionA();
  session.session_id = IDS.integrity;
  session.behavior_summary = { ...SUMMARY_A, median_reaction_ms: 999 };
  return session;
}

export function missionPreviewSession() {
  return {
    schema_version: 'mission-preview-1',
    session_id: IDS.preview,
    participant_id: SECRET_PARTICIPANT_ID,
    protocol: 'mission-exploratory-v1',
    config: { protocol: 'mission-exploratory-v1' },
    ratings: { pre: 2, between: 4, post: 7 },
    rating_events: [{ at: '2026-10-18T20:00:00.000Z', value: 4 }],
    tasks: [{ protocol: 'pvt-web-exploratory-v1' }, { protocol: 'go-no-go-v1-game-skin' }],
    behavior_summary: { mean_response_speed_per_sec: 2.1, slowest_10pct_mean_ms: 480 },
  };
}

export function demoSession() {
  return {
    schema_version: '1.0.0',
    session_id: IDS.demo,
    participant_id: 'demo-anonymous-not-uuid',
    started_at: '2026-10-18T21:00:00.000Z',
    ended_at: '2026-10-18T21:01:00.000Z',
    duration_ms: 60000,
    status: 'completed',
    mode: 'demo',
    sources: { vision: 'simulated', behavior: 'simulated', ratings: 'simulated' },
    consent: null,
    fatigue_pre: 3,
    fatigue_post: 6,
    config: { protocol: 'go-no-go-v1' },
    behavior_summary: SUMMARY_A,
    vision_summary: SIM_VISION,
    samples: [],
    trials: TRIALS_A,
    notes: ['All data in this example is synthetic.'],
  };
}

export function unknownSchemaSession() {
  return {
    ...cameraSessionA(),
    session_id: IDS.unknownSchema,
    schema_version: '9.9.9',
  };
}

export function missingSummarySession() {
  const session = cameraSessionA();
  session.session_id = IDS.missingSummary;
  delete session.behavior_summary;
  return session;
}

export function otherProtocolSession() {
  const session = cameraSessionA();
  session.session_id = IDS.otherProtocol;
  session.config = { ...session.config, protocol: 'fixture-protocol/0.2' };
  return session;
}

export function cameraBundle() {
  return {
    schema_version: '1.0.0',
    exported_at: '2026-10-18T22:00:00.000Z',
    sessions: [cameraSessionA(), cameraSessionB()],
  };
}

export function researcherBundle() {
  return {
    schema_version: '1.0.0',
    exported_at: '2026-10-18T22:05:00.000Z',
    next_cursor: null,
    sessions: [cameraSessionA()],
  };
}

export const CSV_EXPORT = 'schema_version,session_id,participant_id,accuracy\n1.0.0,aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,cccc1111-2222-4333-8444-555566667777,0.75\n';

export function exportDocuments() {
  return {
    'camera-behavior-a.json': cameraSessionA(),
    'camera-behavior-b.json': cameraSessionB(),
    'task-only.json': taskOnlySession(),
    'simulated-vision.json': simulatedVisionSession(),
    'missing-rt.json': missingRtSession(),
    'integrity-mismatch.json': integrityMismatchSession(),
    'mission-preview.json': missionPreviewSession(),
    'demo.json': demoSession(),
    'unknown-schema.json': unknownSchemaSession(),
    'missing-behavior-summary.json': missingSummarySession(),
    'other-protocol.json': otherProtocolSession(),
    'camera-bundle.json': cameraBundle(),
    'researcher-bundle.json': researcherBundle(),
  };
}
