/**
 * Synthetic V1 (+ optional W3.0 mission sidecar) fixtures for dataset tests.
 * Not real participant records and not empirical evidence.
 */
import {
  IDS,
  SECRET_EVENT,
  SECRET_NOTE,
  SECRET_PARTICIPANT_ID,
  SECRET_USER_AGENT,
  SECRET_WITHDRAWAL,
  cameraSessionA,
  simulatedVisionSession,
  taskOnlySession,
  missionPreviewSession,
  unknownSchemaSession,
} from '../exports/synthetic.mjs';

export {
  IDS,
  SECRET_EVENT,
  SECRET_NOTE,
  SECRET_PARTICIPANT_ID,
  SECRET_USER_AGENT,
  SECRET_WITHDRAWAL,
  cameraSessionA,
  simulatedVisionSession,
  taskOnlySession,
  missionPreviewSession,
  unknownSchemaSession,
};

export const DATASET_IDS = Object.freeze({
  mission: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  overlap: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
  dropout: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
  mixedSources: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
  late: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05',
  exclusive: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06',
  emptyWindow: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07',
  interrupted: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa08',
  noOcular: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa09',
  inverted: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
  unsigned: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  outOfRangeStart: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12',
  outOfRangeEnd: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
  completedOpen: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14',
});

export const PRIVACY_SECRETS = Object.freeze([
  SECRET_USER_AGENT,
  SECRET_NOTE,
  SECRET_EVENT,
  SECRET_WITHDRAWAL,
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cameraSample(partial = {}) {
  return {
    elapsed_ms: 120,
    source: 'camera',
    face_present: true,
    eye_aspect_ratio: 0.29,
    eyes_closed: false,
    gaze_x: 0.1,
    gaze_y: 0.2,
    head_rotation: null,
    quality: 'valid',
    ...partial,
  };
}

export function withMission(session, tasks, events = []) {
  const copy = clone(session);
  copy.mission = {
    contract_id: 'mission-event/0.1-provisional',
    scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
    local_only: true,
    upload_eligible: false,
    events,
    tasks,
  };
  return copy;
}

export function gngTask(start, end, extra = {}) {
  return {
    kind: 'go-no-go',
    protocol_id: 'go-no-go-v1',
    scientific_review: 'v1-existing',
    started_session_ms: start,
    ended_session_ms: end,
    reason: end == null ? 'interrupted' : 'completed',
    ...extra,
  };
}

export function missionSidecarSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.mission;
  session.samples = [
    cameraSample({ elapsed_ms: 1500, acquired_elapsed_ms: 1500 }),
    cameraSample({ elapsed_ms: 2000, acquired_elapsed_ms: 2000 }),
  ];
  return withMission(session, [gngTask(1000, 50000)]);
}

export function overlappingMissionSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.overlap;
  return withMission(session, [gngTask(0, 30000), gngTask(20000, 40000)]);
}

export function dropoutMissingEarSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.dropout;
  session.samples = [
    cameraSample({
      elapsed_ms: 200,
      acquired_elapsed_ms: 200,
      face_present: false,
      eye_aspect_ratio: null,
      eyes_closed: false,
      gaze_x: null,
      gaze_y: null,
      quality: 'tracking_gap',
      interpreted_as_open_eyes: false,
    }),
    cameraSample({
      elapsed_ms: 400,
      acquired_elapsed_ms: 400,
      face_present: true,
      eye_aspect_ratio: null,
      eyes_closed: false,
      gaze_x: null,
      gaze_y: null,
      quality: 'eyes_unavailable',
    }),
    cameraSample({
      elapsed_ms: 600,
      acquired_elapsed_ms: 600,
      quality: 'valid',
      eye_aspect_ratio: 0.28,
    }),
  ];
  return session;
}

export function mixedSourcesSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.mixedSources;
  session.samples = [
    cameraSample({ elapsed_ms: 100, source: 'camera' }),
    cameraSample({ elapsed_ms: 200, source: 'simulated' }),
  ];
  return session;
}

export function lateProcessedSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.late;
  session.samples = [
    cameraSample({
      elapsed_ms: 500,
      acquired_elapsed_ms: 500,
      processed_elapsed_ms: 90000,
    }),
  ];
  return session;
}

export function endExclusiveSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.exclusive;
  session.samples = [
    cameraSample({ elapsed_ms: 0, acquired_elapsed_ms: 0 }),
    cameraSample({ elapsed_ms: 999, acquired_elapsed_ms: 999 }),
    cameraSample({ elapsed_ms: 1000, acquired_elapsed_ms: 1000 }),
  ];
  return withMission(session, [gngTask(0, 1000)]);
}

export function emptyWindowSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.emptyWindow;
  session.samples = [
    cameraSample({ elapsed_ms: 120, acquired_elapsed_ms: 120 }),
  ];
  return withMission(session, [
    gngTask(0, 1000),
    {
      kind: 'slot-b',
      protocol_id: 'PENDING_SCIENTIFIC_REVIEW',
      scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
      started_session_ms: 40000,
      ended_session_ms: 50000,
      reason: 'completed',
    },
  ]);
}

export function interruptedSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.interrupted;
  session.status = 'interrupted';
  session.duration_ms = 30000;
  session.ended_at = '2026-10-18T15:00:30.000Z';
  session.samples = [
    cameraSample({ elapsed_ms: 800, acquired_elapsed_ms: 800 }),
  ];
  return withMission(session, [gngTask(0, null)]);
}

export function cameraWithoutOcularSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.noOcular;
  session.samples = [
    cameraSample({
      elapsed_ms: 180,
      acquired_elapsed_ms: 180,
      face_present: false,
      eye_aspect_ratio: null,
      eyes_closed: false,
      gaze_x: null,
      gaze_y: null,
      quality: 'no_face',
    }),
  ];
  return session;
}

export function invertedTimestampSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.inverted;
  session.started_at = '2026-10-18T16:00:00.000Z';
  session.ended_at = '2026-10-18T15:00:00.000Z';
  return session;
}

export function missingIdentitySession() {
  const session = cameraSessionA();
  delete session.session_id;
  return session;
}

export function conflictingDuplicateSession() {
  const session = cameraSessionA();
  session.participant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  return session;
}

export function orchestrationSidecarSession() {
  const session = cameraSessionA();
  session.orchestration = { contract_id: 'research-session/0.1-provisional' };
  return session;
}

export function dropoutLabeledOpenEyesSession() {
  const session = dropoutMissingEarSession();
  session.samples[0].interpreted_as_open_eyes = true;
  return session;
}

export function outOfRangeStartSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.outOfRangeStart;
  return withMission(session, [gngTask(70000, 80000)]);
}

export function outOfRangeEndSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.outOfRangeEnd;
  return withMission(session, [gngTask(0, 90000)]);
}

export function completedOpenTaskSession() {
  const session = cameraSessionA();
  session.session_id = DATASET_IDS.completedOpen;
  session.status = 'completed';
  return withMission(session, [gngTask(0, null)]);
}
