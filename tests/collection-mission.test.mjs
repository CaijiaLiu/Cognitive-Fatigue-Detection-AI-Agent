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

function landmarksForOpenEar() {
  const points = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const place = (ids, widthEar) => {
    points[ids[0]] = { x: 0, y: 0 };
    points[ids[3]] = { x: 1, y: 0 };
    points[ids[1]] = { x: 0.5, y: widthEar };
    points[ids[5]] = { x: 0.5, y: -widthEar };
    points[ids[2]] = { x: 0.5, y: widthEar };
    points[ids[4]] = { x: 0.5, y: -widthEar };
  };
  place([33, 160, 158, 133, 153, 144], 0.15);
  place([362, 385, 387, 263, 373, 380], 0.15);
  return points;
}

function calibrationResult(timestamp) {
  return {
    type: 'result',
    timestamp,
    frameWidth: 64,
    frameHeight: 64,
    result: { faceLandmarks: [landmarksForOpenEar()] }
  };
}

function createTrack() {
  const listeners = {};
  const track = {
    stopped: false,
    addEventListener(name, fn) { listeners[name] = fn; },
    stop() {
      this.stopped = true;
      listeners.ended?.();
    },
    fireEnded() { listeners.ended?.(); }
  };
  return track;
}

function createStream() {
  const tracks = [createTrack()];
  return {
    tracks,
    getTracks: () => tracks,
    getVideoTracks: () => tracks
  };
}

function createHarness(options = {}) {
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
  const pendingAcquire = [];
  const pendingPlay = [];
  const streams = [];
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
  elements.get('video').play = () => {
    if (options.deferredPlay) return new Promise((resolve) => pendingPlay.push(resolve));
    return Promise.resolve();
  };
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
    acquire: () => {
      if (options.deferredAcquire) return new Promise((resolve) => pendingAcquire.push(resolve));
      const stream = createStream();
      streams.push(stream);
      return Promise.resolve(stream);
    },
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
    streams,
    flushTo,
    resolveAcquire() {
      const stream = createStream();
      streams.push(stream);
      pendingAcquire.shift()?.(stream);
      return stream;
    },
    resolvePlay() {
      pendingPlay.shift()?.();
    },
    async readyCamera() {
      const pending = tracking.enable();
      if (options.deferredAcquire) this.resolveAcquire();
      if (options.deferredPlay) queueMicrotask(() => this.resolvePlay());
      await pending;
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

test('calibration deadline is exclusive and late enough frames cannot succeed', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  const started = harness.now;
  const deadline = started + 15000;
  const lifecycle = harness.tracking.lifecycle;
  for (let i = 0; i < 20; i += 1) {
    const progress = lifecycle.ingestCalibrationEar(0.3, deadline - 1 + i, deadline + 400);
    assert.equal(progress.enough, false);
    if (i === 0) {
      assert.equal(progress.expired, false);
      assert.equal(progress.enough, false);
    }
  }
  const atDeadline = lifecycle.ingestCalibrationEar(0.3, deadline, deadline + 10);
  assert.equal(atDeadline.expired, true);
  assert.equal(atDeadline.enough, false);
  assert.equal(atDeadline.reason, 'calibration_deadline');
  assert.equal(lifecycle.ready, false);
  assert.ok(lifecycle.calibrationFrames.length < 20);
  const late = lifecycle.ingestCalibrationEar(0.3, deadline + 500, deadline + 800);
  assert.equal(late.expired, true);
  assert.equal(late.enough, false);
  assert.equal(lifecycle.completeCalibration(0.3).ok, false);
  assert.equal(lifecycle.ready, false);
});

test('calibration succeeds only when the completing acquisition is before the deadline', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  const started = harness.now;
  const deadline = started + 15000;
  const lifecycle = harness.tracking.lifecycle;
  let last;
  for (let i = 0; i < 20; i += 1) {
    last = lifecycle.ingestCalibrationEar(0.3, started + 3000 + i, started + 3010 + i);
  }
  assert.equal(last.expired, false);
  assert.equal(last.enough, true);
  assert.ok(started + 3019 < deadline);
  assert.equal(lifecycle.completeCalibration(0.31).ok, true);
  assert.equal(lifecycle.ready, true);
});

test('controller expires calibration when twenty valid frames arrive only after the deadline', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  harness.setActive({ mode: 'camera', events: [] });
  const deadline = harness.now + 15000;
  harness.setNow(deadline);
  for (let i = 0; i < 20; i += 1) {
    harness.FakeWorker.last.emit(calibrationResult(deadline + i));
  }
  assert.equal(harness.tracking.ready, false);
  assert.match(harness.statuses.at(-1)?.text || '', /校准/);
  assert.equal(harness.finished[0]?.state, 'interrupted');
});

test('stale calibration results after stop cannot complete a newer generation', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  const staleWorker = harness.FakeWorker.last;
  const staleStarted = harness.now;
  harness.tracking.stop();
  await harness.readyCamera();
  staleWorker.emit(calibrationResult(staleStarted + 4000));
  assert.equal(harness.tracking.ready, false);
  assert.equal(harness.tracking.lifecycle.calibrationFrames.length, 0);
});

test('admitResult rejects invalid, future, and out-of-order frames without mutating metrics', () => {
  const harness = createHarness();
  harness.setActive({ mode: 'camera', events: [] });
  harness.setSessionStart(1000);
  harness.setTaskWindow({ started: 1000, ended: null });
  harness.setNow(1600);
  const first = harness.tracking.admitResult(1400, openFace(0.3), harness.tracking.lifecycle.generation);
  assert.ok(first);
  const before = {
    samples: harness.acc.samples.length,
    blinks: harness.acc.blinks.length,
    validMs: harness.acc.summary(600).valid_tracking_ms,
    last: harness.tracking.lifecycle.lastAdmittedAcquisition
  };
  for (const [acquisition, processed] of [[Number.NaN, 1600], [Infinity, 1600], [1400, Number.NaN]]) {
    harness.setNow(processed);
    assert.equal(harness.tracking.admitResult(acquisition, openFace(0.09), harness.tracking.lifecycle.generation), null);
  }
  harness.setNow(1500);
  assert.equal(harness.tracking.admitResult(1800, openFace(0.09), harness.tracking.lifecycle.generation), null);
  assert.equal(harness.rejected.at(-1).reason, 'future_acquisition');
  harness.setNow(2000);
  assert.equal(harness.tracking.admitResult(1300, openFace(0.09), harness.tracking.lifecycle.generation), null);
  assert.equal(harness.rejected.at(-1).reason, 'out_of_order');
  assert.equal(harness.acc.samples.length, before.samples);
  assert.equal(harness.acc.blinks.length, before.blinks);
  assert.equal(harness.acc.summary(600).valid_tracking_ms, before.validMs);
  assert.equal(harness.tracking.lifecycle.lastAdmittedAcquisition, before.last);
  const second = harness.tracking.admitResult(1500, openFace(0.3), harness.tracking.lifecycle.generation);
  assert.ok(second);
  assert.equal(harness.tracking.lifecycle.lastAdmittedAcquisition, 1500);
});

test('stale camera permission resolution after stop does not terminate a newer session', async () => {
  const harness = createHarness({ deferredAcquire: true });
  const first = harness.tracking.enable();
  harness.tracking.stop();
  const second = harness.tracking.enable();
  const stale = harness.resolveAcquire();
  await first;
  assert.equal(stale.tracks[0].stopped, true);
  assert.equal(harness.finished.length, 0);
  harness.resolveAcquire();
  await second;
  harness.FakeWorker.last.emit({ type: 'ready' });
  assert.equal(harness.tracking.lifecycle.workerReady, true);
  assert.equal(harness.tracking.worker, harness.FakeWorker.last);
  assert.equal(harness.FakeWorker.last.terminated, false);
});

test('stale video.play completion after stop does not attach to a newer session', async () => {
  const harness = createHarness({ deferredPlay: true });
  const first = harness.tracking.enable();
  harness.tracking.stop();
  const second = harness.tracking.enable();
  harness.resolvePlay();
  await first;
  assert.equal(harness.FakeWorker.last, undefined);
  harness.resolvePlay();
  await second;
  harness.FakeWorker.last.emit({ type: 'ready' });
  assert.equal(harness.tracking.lifecycle.workerReady, true);
  assert.equal(harness.finished.length, 0);
});

test('stale track-ended callbacks cannot tear down a newer camera session', async () => {
  const harness = createHarness();
  await harness.readyCamera();
  const staleStream = harness.streams[0];
  harness.tracking.stop();
  await harness.readyCamera();
  const liveWorker = harness.FakeWorker.last;
  staleStream.tracks[0].fireEnded();
  assert.equal(harness.finished.length, 0);
  assert.equal(harness.tracking.worker, liveWorker);
  assert.equal(liveWorker.terminated, false);
  assert.equal(harness.tracking.lifecycle.workerReady, true);
});
