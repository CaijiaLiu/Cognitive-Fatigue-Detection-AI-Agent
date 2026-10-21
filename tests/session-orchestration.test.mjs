import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSession } from '../lib/research-data.mjs';
import { exportRows } from '../public/collection/reporting/export.js';
import { readCompatibleSession } from '../public/collection/session/mission-adapter.js';
import { sources } from '../public/collection/session/provenance.js';
import { SCHEMA_VERSION } from '../public/collection/session/versions.js';
import {
  PROTOCOL_CONTRACT_ID,
  ORCHESTRATION_CONTRACT_ID,
  RESEARCH_EVENT_CONTRACT_ID,
  V1_GO_NO_GO_PROTOCOL,
  PROVISIONAL_SEQUENCE_PROTOCOL,
  defineProtocol,
  validateResearchEvent
} from '../public/collection/session/protocol.js';
import { createSessionOrchestrator } from '../public/collection/session/orchestrate.js';
import {
  W4_SESSION_ADAPTER_CONTRACT,
  SESSION_ARTIFACT_ID,
  ORCHESTRATION_REPLAY_CONTRACT,
  attachLocalOrchestration,
  readSessionArtifact,
  readOrchestrationSidecar,
  serializeOrchestration,
  replayOrchestration,
  acceptedTimeline,
  timelinesEqual,
  stableStringify
} from '../public/collection/session/orchestration-export.js';

function v1Session(overrides = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    session_id: '11111111-1111-4111-8111-111111111111',
    participant_id: '22222222-2222-4222-8222-222222222222',
    mode: 'behavior',
    status: 'completed',
    started_at: '2026-10-10T10:00:00.000Z',
    ended_at: '2026-10-10T10:00:30.000Z',
    duration_ms: 30000,
    fatigue_pre: 3,
    fatigue_post: 4,
    consent: { version: 'v1-2026-10-10', accepted_at: '2026-10-10T10:00:00.000Z' },
    sources: sources('behavior'),
    samples: [],
    trials: [],
    blink_events: [],
    vision_summary: { blink_count: null, sample_count: 0 },
    behavior_summary: { valid_trial_count: 0, accuracy: null, median_reaction_ms: null },
    ...overrides
  };
}

function createClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    set: (value) => { now = value; return value; }
  };
}

function openFace(ear = 0.3) {
  return { face_present: true, ear, gaze_x: 0.5, gaze_y: 0, rotation: null };
}

function acceptedState(orch) {
  return {
    state: orch.state,
    currentTaskId: orch.currentTaskId(),
    nextTaskIndex: orch.nextTaskIndex(),
    lastAcquisition: orch.lastAcquisition(),
    events: orch.events(),
    samples: orch.accumulator.samples.slice(),
    summary: orch.snapshot().vision_summary,
    mission: orch.mission.events(),
    tasks: orch.snapshot().tasks.map((task) => ({
      task_id: task.task_id,
      started_at: task.started_at,
      ended_at: task.ended_at,
      reason: task.reason
    })),
    resources: orch.snapshot().resources
  };
}

function runTwoSlotSession(mode = 'simulated', start = 0) {
  const clock = createClock(start);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: `orch-${mode}`,
    mode
  });
  assert.equal(orch.prepare(clock.set(start)).ok, true);
  assert.equal(orch.startSession({ startedAt: clock.set(start) }).ok, true);
  assert.equal(orch.startTask('slot-a', { startedAt: clock.set(start + 100) }).ok, true);
  assert.equal(orch.recordObservation({
    acquisitionTs: start + 200,
    processedTs: clock.set(start + 250),
    source: mode === 'camera' ? 'camera' : 'simulated',
    features: openFace()
  }).ok, true);
  assert.equal(orch.endTask('slot-a', { endedAt: clock.set(start + 400) }).ok, true);
  assert.equal(orch.startTask('slot-b', { startedAt: clock.set(start + 500) }).ok, true);
  assert.equal(orch.recordObservation({
    acquisitionTs: start + 600,
    processedTs: clock.set(start + 650),
    source: mode === 'camera' ? 'camera' : 'simulated',
    features: openFace()
  }).ok, true);
  assert.equal(orch.endTask('slot-b', { endedAt: clock.set(start + 800) }).ok, true);
  assert.equal(orch.completeSession({ endedAt: clock.set(start + 900) }).ok, true);
  return { orch, clock };
}

function runTerminalSession(kind, mode = 'simulated') {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: `orch-${kind}`,
    mode
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: clock.set(100) });
  orch.recordObservation({
    acquisitionTs: 150,
    processedTs: clock.set(180),
    source: mode === 'camera' ? 'camera' : 'simulated',
    features: openFace(0.11)
  });
  if (kind === 'interrupted') {
    assert.equal(orch.interrupt({ reason: 'user_stop', endedAt: clock.set(300) }).ok, true);
  } else if (kind === 'failed') {
    assert.equal(orch.fail({ reason: 'tracking_lost', endedAt: clock.set(300) }).ok, true);
  } else {
    orch.endTask('slot-a', { endedAt: clock.set(300) });
    orch.startTask('slot-b', { startedAt: clock.set(400) });
    orch.endTask('slot-b', { endedAt: clock.set(500) });
    assert.equal(orch.completeSession({ endedAt: clock.set(600) }).ok, true);
  }
  return orch;
}

test('protocol contract is generic, versioned, and does not redefine Caijia science', () => {
  assert.equal(PROTOCOL_CONTRACT_ID, 'research-protocol/0.1-provisional');
  assert.equal(ORCHESTRATION_CONTRACT_ID, 'research-session/0.1-provisional');
  assert.equal(RESEARCH_EVENT_CONTRACT_ID, 'research-event/0.1-provisional');
  assert.equal(V1_GO_NO_GO_PROTOCOL.protocol_id, 'go-no-go-v1');
  assert.equal(V1_GO_NO_GO_PROTOCOL.scientific_review, 'v1-existing');
  assert.equal(V1_GO_NO_GO_PROTOCOL.pause_supported, false);
  assert.equal(V1_GO_NO_GO_PROTOCOL.tasks[0].lifecycle.pause, false);
  assert.equal(PROVISIONAL_SEQUENCE_PROTOCOL.scientific_review, 'PENDING_SCIENTIFIC_REVIEW');
  assert.equal(PROVISIONAL_SEQUENCE_PROTOCOL.local_only, true);
  assert.equal(PROVISIONAL_SEQUENCE_PROTOCOL.upload_eligible, false);
  assert.deepEqual(PROVISIONAL_SEQUENCE_PROTOCOL.tasks.map((task) => task.task_id), ['slot-a', 'slot-b']);
  assert.ok(PROVISIONAL_SEQUENCE_PROTOCOL.tasks.every((task) => task.kind === 'generic-slot'));
  assert.ok(PROVISIONAL_SEQUENCE_PROTOCOL.tasks.every((task) => task.protocol_id === 'PENDING_SCIENTIFIC_REVIEW'));
  assert.ok(PROVISIONAL_SEQUENCE_PROTOCOL.tasks.every((task) => !/pvt|three-rating|fatigue/i.test(`${task.task_id} ${task.kind} ${task.protocol_id}`)));
  assert.ok(PROVISIONAL_SEQUENCE_PROTOCOL.does_not_redefine.some((item) => item.includes('pvt')));
  assert.throws(() => defineProtocol({ protocol_id: 'x', tasks: [{ task_id: 'a', kind: 'generic-slot', protocol_id: 'x' }, { task_id: 'a', kind: 'generic-slot', protocol_id: 'x' }] }));
});

test('1. valid multi-task synthetic session', () => {
  const { orch } = runTwoSlotSession('simulated', 1000);
  const snap = orch.snapshot();
  assert.equal(snap.state, 'completed');
  assert.equal(snap.contract_id, ORCHESTRATION_CONTRACT_ID);
  assert.equal(snap.upload_eligible, false);
  assert.equal(snap.tasks[0].started_session_ms, 100);
  assert.equal(snap.tasks[0].ended_session_ms, 400);
  assert.equal(snap.tasks[1].started_session_ms, 500);
  assert.equal(snap.tasks[1].ended_session_ms, 800);
  assert.equal(snap.events.filter((event) => event.type === 'task_started').length, 2);
  assert.equal(snap.events.filter((event) => event.type === 'task_ended').length, 2);
  assert.equal(snap.events.filter((event) => event.type === 'observation').length, 2);
  assert.equal(snap.rejected.length, 0);
  const elapsed = snap.events.map((event) => event.session_elapsed_ms).filter((value) => value != null);
  assert.deepEqual(elapsed, [...elapsed].sort((a, b) => a - b));
  snap.events.forEach((event) => assert.equal(validateResearchEvent(event, { taskIds: new Set(['slot-a', 'slot-b']) }).ok, true));
  assert.equal(orch.mission.events().some((event) => event.type === 'mission_task_started'), true);
});

test('2. invalid state transitions', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'invalid-transitions'
  });
  const fromCreated = orch.startSession({ startedAt: 0 });
  assert.equal(fromCreated.ok, false);
  assert.equal(fromCreated.reason, 'invalid_transition');
  assert.equal(orch.state, 'created');
  assert.equal(orch.prepare().ok, true);
  const startTaskBeforeSession = orch.startTask('slot-a');
  assert.equal(startTaskBeforeSession.ok, false);
  assert.equal(orch.startSession({ startedAt: clock.set(10) }).ok, true);
  const completeEarly = orch.completeSession({ endedAt: clock.set(20) });
  assert.equal(completeEarly.ok, false);
  assert.equal(completeEarly.reason, 'incomplete_sequence');
  assert.equal(orch.state, 'running');
  assert.equal(orch.startTask('slot-b', { startedAt: clock.set(30) }).ok, false);
  assert.equal(orch.rejectedEvents().length > 0, true);
  assert.equal(orch.events().some((event) => event.type === 'session_completed'), false);
});

test('3. duplicate start/end events', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'duplicates'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  assert.equal(orch.startTask('slot-a', { startedAt: clock.set(100) }).ok, true);
  const duplicateStart = orch.startTask('slot-a', { startedAt: clock.set(120) });
  assert.equal(duplicateStart.ok, false);
  assert.equal(duplicateStart.reason, 'duplicate_task_start');
  assert.equal(orch.endTask('slot-a', { endedAt: clock.set(200) }).ok, true);
  const duplicateEnd = orch.endTask('slot-a', { endedAt: clock.set(220) });
  assert.equal(duplicateEnd.ok, true);
  assert.equal(duplicateEnd.idempotent, true);
  assert.equal(orch.events().filter((event) => event.type === 'task_started').length, 1);
  assert.equal(orch.events().filter((event) => event.type === 'task_ended').length, 1);
});

test('4. task overlap rejection', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'overlap'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  assert.equal(orch.startTask('slot-a', { startedAt: clock.set(100) }).ok, true);
  const overlap = orch.startTask('slot-b', { startedAt: clock.set(150) });
  assert.equal(overlap.ok, false);
  assert.equal(overlap.reason, 'task_overlap');
  assert.equal(orch.currentTaskId(), 'slot-a');
  assert.equal(orch.events().filter((event) => event.type === 'task_started').length, 1);
  assert.equal(orch.snapshot().tasks[1].started_at, null);
});

test('5. late events after completion', () => {
  const { orch } = runTwoSlotSession('simulated', 0);
  const before = orch.snapshot();
  const lateObs = orch.recordObservation({ acquisitionTs: 1000, processedTs: 1010, features: openFace() });
  const lateStart = orch.startTask('slot-a', { startedAt: 1020 });
  const lateDropout = orch.recordDropout({ at: 1030 });
  assert.equal(lateObs.reason, 'session_closed');
  assert.equal(lateStart.reason, 'session_closed');
  assert.equal(lateDropout.reason, 'session_closed');
  const after = orch.snapshot();
  assert.equal(after.events.length, before.events.length);
  assert.equal(after.vision_summary.sample_count, before.vision_summary.sample_count);
  assert.equal(after.state, 'completed');
  assert.ok(after.rejected.length > before.rejected.length);
});

test('6. interruption during active task', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'interrupt',
    mode: 'camera'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: clock.set(100) });
  orch.recordObservation({ acquisitionTs: 150, processedTs: clock.set(160), source: 'camera', features: openFace() });
  const stopped = orch.interrupt({ reason: 'user_stop', endedAt: clock.set(300) });
  assert.equal(stopped.ok, true);
  assert.equal(orch.state, 'interrupted');
  assert.equal(orch.currentTaskId(), null);
  assert.equal(orch.snapshot().tasks[0].reason, 'user_stop');
  assert.equal(orch.snapshot().tasks[0].ended_session_ms, 300);
  assert.deepEqual(orch.snapshot().resources, { timers: 0, listeners: 0, tracking: false });
  assert.equal(orch.events().some((event) => event.type === 'task_ended'), true);
  assert.equal(orch.events().some((event) => event.type === 'session_interrupted'), true);
  assert.equal(orch.events().some((event) => event.type === 'resources_cleared'), true);
  assert.equal(orch.startTask('slot-b').ok, false);
  const again = orch.interrupt({ endedAt: clock.set(400) });
  assert.equal(again.idempotent, true);
});

test('7. camera dropout / missingness propagation', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'dropout',
    mode: 'camera'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: 50 });
  orch.recordObservation({ acquisitionTs: 80, processedTs: clock.set(90), source: 'camera', features: openFace() });
  const drop = orch.recordDropout({ at: clock.set(400), gap_ms: 310, source: 'camera' });
  assert.equal(drop.ok, true);
  assert.equal(drop.event.quality, 'tracking_gap');
  assert.equal(drop.event.missingness, 'dropout');
  const sample = orch.accumulator.samples.at(-1);
  assert.equal(sample.quality, 'tracking_gap');
  assert.equal(sample.eyes_closed, null);
  assert.equal(sample.face_present, false);
  const missionDrop = orch.mission.events().find((event) => event.type === 'mission_dropout');
  assert.equal(missionDrop.interpreted_as_open_eyes, false);
  assert.equal(orch.snapshot().vision_summary.sample_count, 2);
});

test('8. acquisition vs processing timestamps', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'timestamps',
    mode: 'camera'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: 0 });
  const admitted = orch.recordObservation({
    acquisitionTs: 200,
    processedTs: clock.set(350),
    source: 'camera',
    features: openFace()
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.event.acquired_elapsed_ms, 200);
  assert.equal(admitted.event.processed_elapsed_ms, 350);
  assert.equal(admitted.event.session_elapsed_ms, 200);
  assert.equal(orch.accumulator.samples[0].acquired_elapsed_ms, 200);
  assert.equal(orch.accumulator.samples[0].processed_elapsed_ms, 350);
  assert.equal(orch.recordObservation({
    acquisitionTs: 400,
    processedTs: 300,
    features: openFace()
  }).reason, 'future_acquisition');
  assert.equal(orch.accumulator.samples.length, 1);
});

test('9. synthetic vs camera provenance', () => {
  const simulated = runTwoSlotSession('simulated', 0).orch;
  const camera = runTwoSlotSession('camera', 0).orch;
  assert.ok(simulated.events().every((event) => event.source === 'simulated'));
  assert.ok(camera.events().every((event) => event.source === 'camera'));
  assert.notEqual(simulated.mode, camera.mode);
  assert.equal(simulated.snapshot().vision_summary.sample_count, camera.snapshot().vision_summary.sample_count);
  assert.equal(simulated.accumulator.samples[0].source, 'simulated');
  assert.equal(camera.accumulator.samples[0].source, 'camera');
});

test('10. V1 backward compatibility', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: V1_GO_NO_GO_PROTOCOL,
    session_id: 'v1-orch',
    mode: 'behavior'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('go-no-go', { startedAt: 10 });
  orch.endTask('go-no-go', { endedAt: clock.set(30) });
  orch.completeSession({ endedAt: clock.set(40) });
  const session = v1Session();
  attachLocalOrchestration(session, orch);
  assert.equal(session.schema_version, '1.0.0');
  assert.equal(session.config, undefined);
  assert.equal(session.orchestration.protocol.protocol_id, 'go-no-go-v1');
  assert.equal(session.orchestration.protocol.scientific_review, 'v1-existing');
  const read = readCompatibleSession(session);
  assert.equal(read.kind, 'v1');
  assert.equal(read.compatible, true);
  assert.equal(read.coerced, false);
  const artifact = readSessionArtifact(session);
  assert.equal(artifact.compatible, true);
  assert.equal(artifact.schema_version, '1.0.0');
  const rows = exportRows([session], 'sessions');
  assert.equal(rows[0].schema_version, '1.0.0');
  assert.equal(V1_GO_NO_GO_PROTOCOL.schema_version, '1.0.0');
});

test('11. preview schema incompatibility', () => {
  const preview = {
    schema_version: 'mission-preview-1',
    protocol: 'mission-exploratory-v1',
    protocol_version: 'mission-exploratory-v1',
    config: { protocol: 'mission-exploratory-v1' },
    orchestration: { contract_id: ORCHESTRATION_CONTRACT_ID }
  };
  const read = readCompatibleSession(preview);
  assert.equal(read.compatible, false);
  assert.equal(read.coerced, false);
  assert.equal(read.kind, 'mission-preview');
  const artifact = readSessionArtifact(preview);
  assert.equal(artifact.compatible, false);
  assert.equal(artifact.coerced, false);
  assert.equal(artifact.orchestration, null);
});

test('12. no cloud upload of provisional mission metadata', () => {
  const { orch } = runTwoSlotSession('simulated', 0);
  const session = v1Session();
  delete session.upload_consent;
  attachLocalOrchestration(session, orch);
  assert.equal(session.schema_version, '1.0.0');
  assert.equal(session.orchestration.upload_eligible, false);
  assert.equal(session.mission.upload_eligible, false);
  assert.equal(session.mission.local_only, true);
  assert.equal(session.upload_consent, undefined);
  assert.throws(() => sanitizeSession(session));
  session.upload_consent = { accepted: true, version: 'upload-v1', accepted_at: '2026-10-10T10:00:31.000Z' };
  const uploaded = sanitizeSession(session);
  assert.equal(uploaded.schema_version, '1.0.0');
  assert.equal(uploaded.mission, undefined);
  assert.equal(uploaded.orchestration, undefined);
  assert.equal(uploaded.upload_consent.accepted, true);
  assert.equal(W4_SESSION_ADAPTER_CONTRACT.upload_eligible, false);
  assert.equal(SESSION_ARTIFACT_ID, 'research-session-artifact/0.1-provisional');
});

test('13. deterministic replay and serialization', () => {
  const { orch } = runTwoSlotSession('simulated', 1000);
  const first = serializeOrchestration(orch);
  const second = serializeOrchestration(orch);
  assert.equal(stableStringify(first), stableStringify(second));
  const replayed = replayOrchestration(first);
  assert.equal(replayed.replay.ok, true);
  assert.equal(replayed.state, 'completed');
  assert.deepEqual(acceptedTimeline(replayed.events()), acceptedTimeline(orch.events()));
  assert.equal(stableStringify(serializeOrchestration(replayed).orchestration.events), stableStringify(first.orchestration.events));
  assert.equal(first.upload_eligible, false);
  assert.equal(first.schema_version, '1.0.0');
  assert.equal(replayed.replay.kind, 'event_only');
  assert.equal(replayed.replay.measurement_fidelity, false);
});

test('14. resource cleanup and repeated session starts', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'repeat',
    mode: 'camera'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: clock.set(20) });
  assert.deepEqual(orch.snapshot().resources, { timers: 1, listeners: 1, tracking: true });
  orch.interrupt({ endedAt: clock.set(40) });
  assert.deepEqual(orch.snapshot().resources, { timers: 0, listeners: 0, tracking: false });
  assert.equal(orch.reset().state, 'created');
  assert.equal(orch.events().length, 0);
  assert.equal(orch.accumulator.samples.length, 0);
  assert.equal(orch.prepare().ok, true);
  assert.equal(orch.startSession({ startedAt: clock.set(100) }).ok, true);
  assert.equal(orch.startTask('slot-a', { startedAt: clock.set(120) }).ok, true);
  assert.equal(orch.endTask('slot-a', { endedAt: clock.set(200) }).ok, true);
  assert.equal(orch.startTask('slot-b', { startedAt: clock.set(220) }).ok, true);
  assert.equal(orch.endTask('slot-b', { endedAt: clock.set(300) }).ok, true);
  assert.equal(orch.completeSession({ endedAt: clock.set(320) }).ok, true);
  assert.equal(orch.state, 'completed');
  assert.deepEqual(orch.snapshot().resources, { timers: 0, listeners: 0, tracking: false });
});

test('rejected operations do not partially mutate accepted state', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'atomic',
    mode: 'camera'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: clock.set(100) });
  orch.recordObservation({
    acquisitionTs: 200,
    processedTs: clock.set(220),
    source: 'camera',
    features: openFace(0.12)
  });
  const afterValid = acceptedState(orch);

  const lateDropoutFirst = orch.recordDropout({ at: clock.set(500), source: 'camera' });
  assert.equal(lateDropoutFirst.ok, true);
  const afterDropout = acceptedState(orch);

  const staleObservation = orch.recordObservation({
    acquisitionTs: 400,
    processedTs: 450,
    source: 'camera',
    features: openFace(0.04)
  });
  assert.equal(staleObservation.ok, false);
  assert.equal(staleObservation.reason, 'out_of_order');
  const afterStaleObs = acceptedState(orch);
  assert.equal(afterStaleObs.state, afterDropout.state);
  assert.equal(afterStaleObs.currentTaskId, 'slot-a');
  assert.equal(afterStaleObs.nextTaskIndex, 0);
  assert.equal(afterStaleObs.lastAcquisition, 200);
  assert.equal(afterStaleObs.events.length, afterDropout.events.length);
  assert.equal(afterStaleObs.samples.length, afterDropout.samples.length);
  assert.deepEqual(afterStaleObs.summary, afterDropout.summary);
  assert.equal(afterStaleObs.mission.length, afterDropout.mission.length);
  assert.equal(afterStaleObs.tasks[0].ended_at, null);

  const staleEnd = orch.endTask('slot-a', { endedAt: 50 });
  assert.equal(staleEnd.ok, false);
  assert.equal(staleEnd.reason, 'out_of_order');
  assert.equal(orch.currentTaskId(), 'slot-a');
  assert.equal(orch.nextTaskIndex(), 0);
  assert.equal(orch.snapshot().tasks[0].ended_at, null);
  assert.equal(orch.events().filter((event) => event.type === 'task_ended').length, 0);

  orch.endTask('slot-a', { endedAt: clock.set(600) });
  const staleNextStart = orch.startTask('slot-b', { startedAt: 80 });
  assert.equal(staleNextStart.ok, false);
  assert.equal(staleNextStart.reason, 'out_of_order');
  assert.equal(orch.currentTaskId(), null);
  assert.equal(orch.nextTaskIndex(), 1);
  assert.equal(orch.snapshot().tasks[1].started_at, null);
  assert.equal(orch.mission.events().filter((event) => event.type === 'mission_task_started').length, 1);

  orch.startTask('slot-b', { startedAt: clock.set(700) });
  orch.endTask('slot-b', { endedAt: clock.set(800) });
  const staleComplete = orch.completeSession({ endedAt: 10 });
  assert.equal(staleComplete.ok, false);
  assert.equal(staleComplete.reason, 'out_of_order');
  assert.equal(orch.state, 'running');
  assert.deepEqual(orch.snapshot().resources, { timers: 1, listeners: 1, tracking: true });
  assert.equal(orch.events().some((event) => event.type === 'session_completed'), false);

  assert.equal(afterValid.lastAcquisition, 200);
  assert.equal(orch.accumulator.samples.some((sample) => sample.eye_aspect_ratio === 0.04), false);
});

test('event-only replay does not fabricate measurement fidelity', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'replay-features',
    mode: 'simulated'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: 0 });
  assert.equal(orch.recordObservation({
    acquisitionTs: 0,
    processedTs: clock.set(20),
    source: 'simulated',
    features: openFace(0.05)
  }).ok, true);
  assert.equal(orch.recordObservation({
    acquisitionTs: 200,
    processedTs: clock.set(220),
    source: 'simulated',
    features: openFace(0.05)
  }).ok, true);
  orch.endTask('slot-a', { endedAt: clock.set(300) });
  orch.startTask('slot-b', { startedAt: clock.set(400) });
  orch.endTask('slot-b', { endedAt: clock.set(500) });
  orch.completeSession({ endedAt: clock.set(600) });

  const original = orch.snapshot().vision_summary;
  assert.equal(original.sample_count, 2);
  assert.equal(original.closed_time_ms > 0, true);

  const replayed = replayOrchestration(serializeOrchestration(orch));
  assert.equal(replayed.replay.ok, true);
  assert.equal(replayed.replay.kind, ORCHESTRATION_REPLAY_CONTRACT.kind);
  assert.equal(replayed.replay.measurement_fidelity, false);
  assert.equal(replayed.state, 'completed');
  assert.deepEqual(acceptedTimeline(replayed.events()), acceptedTimeline(orch.events()));
  assert.equal(replayed.accumulator.samples.length, 0);
  assert.equal(replayed.snapshot().vision_summary.sample_count, 0);
  assert.equal(replayed.snapshot().vision_summary.closed_time_ms, 0);
  assert.notEqual(replayed.snapshot().vision_summary.closed_time_ms, original.closed_time_ms);
  assert.equal(replayed.events().some((event) => event.eye_aspect_ratio === 0.05), false);
  assert.equal(JSON.stringify(replayed.events()).includes('"ear"'), false);
});

test('W4 artifact reader rejects malformed sidecars and unsupported contracts', () => {
  const valid = v1Session();
  assert.equal(readSessionArtifact(valid).compatible, true);
  assert.equal(readSessionArtifact(valid).orchestration, null);

  const malformed = v1Session({ orchestration: 'not-an-object' });
  const malformedRead = readSessionArtifact(malformed);
  assert.equal(malformedRead.compatible, false);
  assert.equal(malformedRead.coerced, false);
  assert.equal(malformedRead.kind, 'malformed-orchestration');
  assert.equal(malformed.schema_version, '1.0.0');

  const badVersion = v1Session({
    orchestration: { contract_id: ORCHESTRATION_CONTRACT_ID, contract_version: '9.9.9', events: [] }
  });
  assert.equal(readSessionArtifact(badVersion).kind, 'invalid-orchestration-version');
  assert.equal(readSessionArtifact(badVersion).compatible, false);

  const badContract = v1Session({
    orchestration: { contract_id: 'research-session/9.0', events: [] }
  });
  assert.equal(readSessionArtifact(badContract).kind, 'unsupported-orchestration');

  const badEvents = v1Session({
    orchestration: { contract_id: ORCHESTRATION_CONTRACT_ID, contract_version: '0.1.0', events: { type: 'observation' } }
  });
  assert.equal(readSessionArtifact(badEvents).kind, 'malformed-orchestration');

  const badEventContract = v1Session({
    orchestration: {
      contract_id: ORCHESTRATION_CONTRACT_ID,
      contract_version: '0.1.0',
      events: [{ contract_id: 'unknown-event/1', type: 'observation' }]
    }
  });
  assert.equal(readSessionArtifact(badEventContract).kind, 'unsupported-event-contract');
  assert.equal(readSessionArtifact(badEventContract).compatible, false);
  assert.equal(readSessionArtifact(badEventContract).coerced, false);

  const badMission = v1Session({ mission: ['not-an-object'] });
  assert.equal(readSessionArtifact(badMission).kind, 'malformed-mission');

  const unsupportedMission = v1Session({ mission: { contract_id: 'mission-event/9.0' } });
  assert.equal(readSessionArtifact(unsupportedMission).kind, 'unsupported-mission');

  const sidecar = readOrchestrationSidecar({ contract_id: ORCHESTRATION_CONTRACT_ID, contract_version: '0.1.0', events: [] });
  assert.equal(sidecar.ok, true);
  assert.equal(W4_SESSION_ADAPTER_CONTRACT.replay.measurement_fidelity, false);
});

test('late-processed observations keep acquisition timestamps on event-only replay', () => {
  const clock = createClock(0);
  const orch = createSessionOrchestrator({
    now: clock.now,
    protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
    session_id: 'late-processed',
    mode: 'camera'
  });
  orch.prepare();
  orch.startSession({ startedAt: 0 });
  orch.startTask('slot-a', { startedAt: 0 });
  const first = orch.recordObservation({
    acquisitionTs: 100,
    processedTs: clock.set(400),
    source: 'camera',
    quality: 'valid',
    features: openFace(0.28)
  });
  const second = orch.recordObservation({
    acquisitionTs: 250,
    processedTs: clock.set(450),
    source: 'camera',
    quality: 'closed_eyes',
    features: openFace(0.05)
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.event.acquired_elapsed_ms < first.event.processed_elapsed_ms, true);
  assert.equal(first.event.session_elapsed_ms, 100);
  assert.equal(second.event.session_elapsed_ms, 250);
  assert.equal(second.event.acquired_elapsed_ms, 250);
  assert.equal(second.event.processed_elapsed_ms, 450);
  assert.equal(second.event.quality, 'closed_eyes');
  orch.endTask('slot-a', { endedAt: clock.set(500) });
  orch.startTask('slot-b', { startedAt: clock.set(600) });
  orch.recordDropout({ at: clock.set(650), source: 'camera' });
  orch.endTask('slot-b', { endedAt: clock.set(700) });
  orch.completeSession({ endedAt: clock.set(800) });

  const replayed = replayOrchestration(serializeOrchestration(orch));
  assert.equal(replayed.replay.ok, true);
  assert.equal(replayed.replay.measurement_fidelity, false);
  assert.deepEqual(acceptedTimeline(replayed.events()), acceptedTimeline(orch.events()));
  const replayedSecond = replayed.events().find((event) => event.type === 'observation' && event.acquired_elapsed_ms === 250);
  assert.equal(replayedSecond.session_elapsed_ms, 250);
  assert.equal(replayedSecond.acquired_elapsed_ms, 250);
  assert.equal(replayedSecond.processed_elapsed_ms, 450);
  assert.equal(replayedSecond.quality, 'closed_eyes');
  assert.equal(replayedSecond.source, 'camera');
  assert.equal(replayedSecond.session_id, 'late-processed');
  assert.notEqual(replayed.snapshot().vision_summary.sample_count, orch.snapshot().vision_summary.sample_count);
});

test('corrupted timelines fail replay instead of skipping imports', () => {
  const { orch } = runTwoSlotSession('simulated', 0);
  const artifact = serializeOrchestration(orch);
  const observation = artifact.orchestration.events.find((event) => event.type === 'observation');

  const wrongSession = structuredClone(artifact);
  wrongSession.orchestration.events.find((event) => event.type === 'observation').session_id = 'other-session';
  const sessionMismatch = replayOrchestration(wrongSession);
  assert.equal(sessionMismatch.replay.ok, false);
  assert.equal(sessionMismatch.replay.reason, 'session_mismatch');
  assert.equal(sessionMismatch.state, 'running');
  assert.equal(sessionMismatch.events().some((event) => event.type === 'session_completed'), false);

  const wrongContract = structuredClone(artifact);
  wrongContract.orchestration.events.find((event) => event.type === 'observation').contract_id = 'research-event/9.0';
  assert.equal(replayOrchestration(wrongContract).replay.reason, 'invalid_event_contract');

  const wrongVersion = structuredClone(artifact);
  wrongVersion.orchestration.events.find((event) => event.type === 'observation').contract_version = '9.0.0';
  assert.equal(replayOrchestration(wrongVersion).replay.reason, 'invalid_event_version');

  const wrongTask = structuredClone(artifact);
  wrongTask.orchestration.events.find((event) => event.type === 'observation').task_id = 'slot-b';
  const membership = replayOrchestration(wrongTask);
  assert.equal(membership.replay.reason, 'task_membership');
  assert.equal(membership.currentTaskId(), 'slot-a');

  const afterEnd = structuredClone(artifact);
  const endedIndex = afterEnd.orchestration.events.findIndex((event) => event.type === 'task_ended');
  afterEnd.orchestration.events.splice(endedIndex + 1, 0, {
    ...observation,
    session_elapsed_ms: 410,
    acquired_elapsed_ms: 410,
    processed_elapsed_ms: 420,
    task_id: 'slot-a'
  });
  assert.equal(replayOrchestration(afterEnd).replay.reason, 'no_active_task');

  const unknownType = structuredClone(artifact);
  unknownType.orchestration.events.splice(2, 0, { ...observation, type: 'fabricated_metric' });
  assert.equal(replayOrchestration(unknownType).replay.reason, 'unsupported_replay_event');

  const importRejected = orch.importTimelineEvent(orch.events().find((event) => event.type === 'observation'));
  assert.equal(importRejected.ok, false);
  assert.equal(importRejected.reason, 'session_closed');
  assert.equal(orch.events().at(-1).type, 'resources_cleared');
});

test('completed, interrupted, and failed sessions round-trip with exact accepted timelines', () => {
  for (const kind of ['completed', 'interrupted', 'failed']) {
    const orch = runTerminalSession(kind, 'camera');
    const replayed = replayOrchestration(serializeOrchestration(orch));
    assert.equal(replayed.replay.ok, true, kind);
    assert.equal(replayed.replay.measurement_fidelity, false, kind);
    assert.equal(replayed.state, kind === 'completed' ? 'completed' : kind, kind);
    assert.equal(timelinesEqual(replayed.events(), orch.events()), true, kind);
    assert.equal(replayed.events().filter((event) => event.type === 'resources_cleared').length, 1, kind);
    assert.equal(replayed.accumulator.samples.length, 0, kind);
  }
});

test('resources_cleared is preserved once and rejected when misplaced or duplicated', () => {
  const orch = runTerminalSession('completed');
  const artifact = serializeOrchestration(orch);
  assert.equal(artifact.orchestration.events.filter((event) => event.type === 'resources_cleared').length, 1);

  const replayed = replayOrchestration(artifact);
  assert.equal(replayed.replay.ok, true);
  assert.equal(replayed.events().filter((event) => event.type === 'resources_cleared').length, 1);
  assert.deepEqual(replayed.snapshot().resources, { timers: 0, listeners: 0, tracking: false });

  const beforeTerminal = structuredClone(artifact);
  const readyIndex = beforeTerminal.orchestration.events.findIndex((event) => event.type === 'session_ready');
  const cleanup = beforeTerminal.orchestration.events.find((event) => event.type === 'resources_cleared');
  beforeTerminal.orchestration.events.splice(readyIndex + 1, 0, { ...cleanup, session_elapsed_ms: 0 });
  assert.equal(replayOrchestration(beforeTerminal).replay.reason, 'unexpected_resources_cleared');

  const duplicated = structuredClone(artifact);
  duplicated.orchestration.events.push({
    ...cleanup,
    session_elapsed_ms: 600
  });
  const duplicateReplay = replayOrchestration(duplicated);
  assert.equal(duplicateReplay.replay.ok, false);
  assert.equal(duplicateReplay.replay.reason, 'duplicate_cleanup');
});

test('corrupted lifecycle metadata that old replay would accept now fails closed', () => {
  const orch = runTerminalSession('completed');
  const artifact = serializeOrchestration(orch);

  const skippedReady = structuredClone(artifact);
  skippedReady.orchestration.events = skippedReady.orchestration.events.filter((event) => event.type !== 'session_ready');
  assert.equal(replayOrchestration(skippedReady).replay.reason, 'invalid_transition');

  const duplicateStart = structuredClone(artifact);
  const started = duplicateStart.orchestration.events.find((event) => event.type === 'session_started');
  const startedIndex = duplicateStart.orchestration.events.findIndex((event) => event.type === 'session_started');
  duplicateStart.orchestration.events.splice(startedIndex + 1, 0, { ...started });
  assert.equal(replayOrchestration(duplicateStart).replay.reason, 'duplicate_lifecycle');

  const wrongTaskOrder = structuredClone(artifact);
  wrongTaskOrder.orchestration.events.find((event) => event.type === 'task_started').task_id = 'slot-b';
  assert.equal(replayOrchestration(wrongTaskOrder).replay.reason, 'task_out_of_order');

  const badVersion = structuredClone(artifact);
  badVersion.orchestration.events.find((event) => event.type === 'session_completed').contract_version = '8.0.0';
  assert.equal(replayOrchestration(badVersion).replay.reason, 'invalid_event_version');

  const badSession = structuredClone(artifact);
  badSession.orchestration.events.find((event) => event.type === 'task_ended').session_id = 'other-session';
  assert.equal(replayOrchestration(badSession).replay.reason, 'session_mismatch');

  const mutatedElapsed = structuredClone(artifact);
  mutatedElapsed.orchestration.events.find((event) => event.type === 'task_started').session_elapsed_ms = -5;
  const mutatedReplay = replayOrchestration(mutatedElapsed);
  assert.equal(mutatedReplay.replay.ok, false);
  assert.ok(['out_of_order', 'invalid_timestamp', 'timeline_mismatch'].includes(mutatedReplay.replay.reason));
});
