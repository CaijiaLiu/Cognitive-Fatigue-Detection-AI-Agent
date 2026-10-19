import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureAccumulator } from '../public/collection/features/accumulator.js';
import { createTrackingLifecycle } from '../public/collection/tracking/lifecycle.js';
import { createTrackingController } from '../public/collection/tracking/controller.js';
import {
  createMissionAdapter,
  readCompatibleSession,
  missionProvenance,
  MISSION_EVENT_CONTRACT
} from '../public/collection/session/mission-adapter.js';
import { sources, sourceLabel } from '../public/collection/session/provenance.js';
import { exportRows } from '../public/collection/reporting/export.js';
import { sanitizeSession } from '../lib/research-data.mjs';
import { SCHEMA_VERSION } from '../public/collection/session/versions.js';

function openFace(ear = 0.3) {
  return { face_present: true, ear, gaze_x: 0.5, gaze_y: 0, rotation: null };
}

function element() {
  return {
    value: 'camera',
    hidden: false,
    disabled: false,
    checked: true,
    textContent: '',
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {},
    play: async () => {},
    readyState: 2,
    currentTime: 0,
    srcObject: null,
    videoWidth: 640,
    videoHeight: 480
  };
}

function createHarness() {
  let now = 1000;
  const timers = new Map();
  let nextTimer = 1;
  const elements = new Map([
    ['consent', element()],
    ['mode', element()],
    ['camera', element()],
    ['video', element()],
    ['preview', element()],
    ['camera-placeholder', element()],
    ['camera-overlay', element()],
    ['live-eyes', element()]
  ]);
  elements.get('mode').value = 'camera';
  elements.get('video').readyState = 1;
  const rejected = [];
  const dropouts = [];
  const finished = [];
  const statuses = [];
  const acc = new FeatureAccumulator(0.3);
  let active = null;
  let sessionStart = 5000;
  let taskWindow = { started: 5000, ended: null };
  class FakeWorker {
    constructor() {
      this.terminated = false;
      this.messages = [];
      FakeWorker.last = this;
    }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage?.({ data }); }
  }
  const stream = { getTracks: () => [], getVideoTracks: () => [] };
  const tracking = createTrackingController({
    $: (id) => elements.get(id),
    status: (text, error) => statuses.push({ text, error }),
    updateSetup() {},
    getActive: () => active,
    getSessionStart: () => sessionStart,
    getTaskWindow: () => taskWindow,
    getAwaitingRating: () => null,
    getAccumulator: () => acc,
    updateLive() {},
    finish: (state, reason) => finished.push({ state, reason }),
    onRejectedFrame: (decision) => rejected.push(decision),
    onDropout: (info) => dropouts.push(info),
    now: () => now,
    acquire: async () => stream,
    cameraSupported: () => true,
    WorkerImpl: FakeWorker,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (id) => { timers.delete(id); },
    setFrameInterval: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, at: now + ms, interval: ms });
      return id;
    },
    clearFrameInterval: (id) => { timers.delete(id); }
  });
  function flushTo(target) {
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { now = target; return; }
      now = due[1].at;
      const [id, timer] = due;
      if (timer.interval) timers.set(id, { ...timer, at: now + timer.interval });
      else timers.delete(id);
      timer.fn();
    }
  }
  return {
    tracking,
    acc,
    rejected,
    dropouts,
    finished,
    statuses,
    timers,
    FakeWorker,
    setActive(next) { active = next; },
    setSessionStart(value) { sessionStart = value; },
    setTaskWindow(value) { taskWindow = value; },
    setNow(value) { now = value; },
    get now() { return now; },
    flushTo,
    async readyCamera() {
      await tracking.enable();
      FakeWorker.last.emit({ type: 'ready' });
    }
  };
}

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

test('1. pre-task frame arriving after task start is rejected by acquisition time', () => {
  const mission = createMissionAdapter({ now: () => 8000 });
  mission.beginSession({ mode: 'camera', startedAt: 1000 });
  mission.beginTask({ kind: 'go-no-go', protocol_id: 'go-no-go-v1', startedAt: 5000 });
  const lifecycle = createTrackingLifecycle({ now: () => 8000 });
  const generation = lifecycle.generation;
  const acc = new FeatureAccumulator(0.3);
  const decision = lifecycle.classifyResult({
    acquisitionTs: 4000,
    processedTs: 8000,
    resultGeneration: generation,
    sessionStart: 1000,
    taskWindow: mission.currentWindow()
  });
  assert.equal(decision.admit, false);
  assert.equal(decision.reason, 'pre_task');
  assert.equal(decision.processed_elapsed_ms, 7000);
  assert.ok(decision.task_elapsed_ms < 0);
  if (decision.admit) acc.add(decision.session_elapsed_ms, openFace());
  assert.equal(acc.samples.length, 0);
  mission.rejectFrame(decision);
  assert.equal(mission.events().at(-1).type, 'mission_frame_rejected');
});

test('2. late frame arriving after task end is rejected', () => {
  const harness = createHarness();
  harness.setActive({ mode: 'camera', events: [] });
  harness.setSessionStart(1000);
  harness.setTaskWindow({ started: 1000, ended: 4000, kind: 'go-no-go' });
  harness.setNow(4500);
  const sample = harness.tracking.admitResult(4200, openFace(), harness.tracking.lifecycle.generation);
  assert.equal(sample, null);
  assert.equal(harness.acc.samples.length, 0);
  assert.equal(harness.rejected[0].reason, 'post_task');
});

test('3. calibration timeout fires with zero inference callbacks', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  harness.setActive({ mode: 'camera', events: [] });
  assert.equal(harness.tracking.lifecycle.workerReady, true);
  assert.equal(harness.tracking.ready, false);
  assert.equal(harness.FakeWorker.last.messages.some((message) => message.type === 'result'), false);
  harness.flushTo(harness.now + 15000);
  assert.match(harness.statuses.at(-1)?.text || '', /校准/);
  assert.equal(harness.finished[0]?.state, 'interrupted');
  assert.equal(harness.tracking.worker, null);
  assert.equal(harness.FakeWorker.last.terminated, true);
  assert.equal(harness.tracking.ready, false);
});

test('4. stop/restart drops stale generation callbacks', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  const staleGeneration = harness.tracking.lifecycle.generation;
  const staleWorker = harness.FakeWorker.last;
  harness.tracking.stop();
  harness.setActive({ mode: 'camera', events: [] });
  staleWorker.emit({
    type: 'result',
    timestamp: 6000,
    frameWidth: 64,
    frameHeight: 64,
    result: { faceLandmarks: [[{ x: 0, y: 0 }]] }
  });
  const sample = harness.tracking.admitResult(6000, openFace(), staleGeneration);
  assert.equal(sample, null);
  assert.equal(harness.rejected[0].reason, 'stale_generation');
  assert.equal(harness.acc.samples.length, 0);
  assert.ok(staleWorker.terminated);
});

test('5. camera dropout and missing frames are not open eyes', () => {
  const acc = new FeatureAccumulator(0.3);
  acc.add(0, openFace(0.3));
  acc.add(100, openFace(0.1));
  const missing = acc.noteDropout(400, 'camera');
  acc.add(500, openFace(0.3));
  assert.equal(missing.quality, 'tracking_gap');
  assert.equal(missing.eyes_closed, null);
  assert.equal(acc.blinks.length, 0);
  assert.equal(acc.summary(500).closed_time_ms, 0);
  const lifecycle = createTrackingLifecycle({ now: () => 0 });
  lifecycle.noteAdmitted(1000);
  const gap = lifecycle.noteAdmitted(1400);
  assert.equal(gap.dropout, true);
  assert.ok(gap.gap_ms > 250);
});

test('6. task transitions isolate adjacent measurements', () => {
  const mission = createMissionAdapter({ now: () => 0 });
  const lifecycle = createTrackingLifecycle({ now: () => 0 });
  const acc = new FeatureAccumulator(0.3);
  mission.beginSession({ mode: 'camera', startedAt: 0 });
  mission.beginTask({ kind: 'signal-task', protocol_id: 'PENDING_SCIENTIFIC_REVIEW', startedAt: 0 });
  const first = lifecycle.classifyResult({
    acquisitionTs: 800,
    processedTs: 810,
    resultGeneration: lifecycle.generation,
    sessionStart: 0,
    taskWindow: mission.currentWindow()
  });
  assert.equal(first.admit, true);
  acc.add(first.session_elapsed_ms, openFace(), 'camera', first);
  mission.endTask({ reason: 'completed', endedAt: 1000 });
  mission.beginTask({ kind: 'go-no-go', protocol_id: 'go-no-go-v1', startedAt: 1500 });
  const leftover = lifecycle.classifyResult({
    acquisitionTs: 900,
    processedTs: 1600,
    resultGeneration: lifecycle.generation,
    sessionStart: 0,
    taskWindow: mission.currentWindow()
  });
  assert.equal(leftover.admit, false);
  assert.equal(leftover.reason, 'pre_task');
  if (leftover.admit) acc.add(leftover.session_elapsed_ms, openFace(0.09));
  assert.equal(acc.samples.length, 1);
  assert.equal(acc.samples[0].elapsed_ms, 800);
  assert.equal(mission.taskRecords().length, 2);
  assert.equal(mission.taskRecords()[0].ended, 1000);
});

test('7. simulation versus camera provenance stays explicit', () => {
  const camera = createMissionAdapter({ now: () => 0 });
  const simulated = createMissionAdapter({ now: () => 0 });
  camera.beginSession({ mode: 'camera', startedAt: 0 });
  simulated.beginSession({ mode: 'simulated', startedAt: 0 });
  assert.deepEqual(missionProvenance('camera'), sources('camera'));
  assert.deepEqual(missionProvenance('simulated'), sources('simulated'));
  assert.deepEqual(missionProvenance('behavior'), sources('behavior'));
  assert.match(sourceLabel({ mode: 'simulated', sources: sources('simulated') }), /模拟/);
  const acc = new FeatureAccumulator(0.3);
  acc.add(0, openFace(), 'simulated');
  acc.add(100, openFace(), 'camera');
  assert.equal(acc.samples[0].source, 'simulated');
  assert.equal(acc.samples[1].source, 'camera');
  assert.notEqual(camera.mode, simulated.mode);
});

test('8. existing V1 records remain readable and are not coerced from preview', () => {
  const v1 = v1Session();
  const preview = {
    schema_version: 'mission-preview-1',
    protocol_version: 'mission-exploratory-v1',
    config: { protocol: 'mission-exploratory-v1' },
    tasks: [],
    ratings: { pre: 3, between: 4, post: 5 }
  };
  const v1Read = readCompatibleSession(v1);
  assert.equal(v1Read.kind, 'v1');
  assert.equal(v1Read.compatible, true);
  assert.equal(v1Read.coerced, false);
  assert.equal(v1.schema_version, '1.0.0');
  const previewRead = readCompatibleSession(preview);
  assert.equal(previewRead.kind, 'mission-preview');
  assert.equal(previewRead.compatible, false);
  assert.equal(previewRead.coerced, false);
  const rows = exportRows([v1], 'sessions');
  assert.equal(rows[0].schema_version, '1.0.0');
  assert.equal(rows[0].vision_source, 'unavailable');
});

test('9. interruption cleanup releases timers, listeners, and tracking', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  assert.ok(harness.timers.size > 0);
  harness.tracking.stop();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.tracking.worker, null);
  assert.equal(harness.FakeWorker.last.terminated, true);
  const mission = createMissionAdapter({ now: () => 10 });
  mission.beginSession({ mode: 'camera', startedAt: 0 });
  mission.markResources({ timers: 3, listeners: 2, tracking: true });
  const cleared = mission.cleanup();
  assert.deepEqual(cleared, { timers: 0, listeners: 0, tracking: false });
  assert.equal(mission.events().at(-1).type, 'mission_resources_cleared');
});

test('10. mission metadata does not change collection or upload consent', () => {
  const session = v1Session();
  delete session.upload_consent;
  const mission = createMissionAdapter({ now: () => 30 });
  mission.beginSession({ mode: 'behavior', startedAt: 0 });
  mission.beginTask({ kind: 'go-no-go', protocol_id: 'go-no-go-v1', startedAt: 0 });
  mission.endSession({ endedAt: 30 });
  mission.attachLocalMetadata(session);
  assert.equal(session.schema_version, '1.0.0');
  assert.equal(session.mission.scientific_review, 'PENDING_SCIENTIFIC_REVIEW');
  assert.equal(session.mission.upload_eligible, false);
  assert.equal(session.mission.local_only, true);
  assert.equal(session.upload_consent, undefined);
  assert.throws(() => sanitizeSession(session));
  session.upload_consent = { accepted: true, version: 'upload-v1', accepted_at: '2026-10-10T10:00:31.000Z' };
  const uploaded = sanitizeSession(session);
  assert.equal(uploaded.mission, undefined);
  assert.equal(uploaded.schema_version, '1.0.0');
  assert.equal(uploaded.upload_consent.accepted, true);
  assert.equal(MISSION_EVENT_CONTRACT.scientific_review, 'PENDING_SCIENTIFIC_REVIEW');
});

test('controller admitResult stores acquisition and processing timestamps', () => {
  const harness = createHarness();
  harness.setActive({ mode: 'camera', events: [] });
  harness.setSessionStart(1000);
  harness.setTaskWindow({ started: 1000, ended: null });
  harness.setNow(1305);
  const sample = harness.tracking.admitResult(1200, openFace(), harness.tracking.lifecycle.generation);
  assert.equal(sample.elapsed_ms, 200);
  assert.equal(sample.acquired_elapsed_ms, 200);
  assert.equal(sample.processed_elapsed_ms, 305);
});
