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
  attachLocalOrchestration,
  readSessionArtifact,
  serializeOrchestration,
  replayOrchestration,
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
  assert.equal(replayed.state, 'completed');
  assert.deepEqual(
    replayed.events().map((event) => [event.type, event.session_elapsed_ms, event.task_id, event.source]),
    orch.events().map((event) => [event.type, event.session_elapsed_ms, event.task_id, event.source])
  );
  assert.equal(stableStringify(serializeOrchestration(replayed).orchestration.events), stableStringify(first.orchestration.events));
  assert.equal(first.upload_eligible, false);
  assert.equal(first.schema_version, '1.0.0');
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
