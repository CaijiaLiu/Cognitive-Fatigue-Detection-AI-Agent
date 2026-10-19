import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeSession } from '../lib/research-data.mjs';
import {
  REASON_CODES,
  SESSION_EVIDENCE_ANALYSIS_VERSION,
  TOOL_STATUS,
  composeAnswer,
  validateAgentAnswer,
} from '../analysis/src/neurolens/agent/index.mjs';
import { ANSWER_STATUS } from '../analysis/src/neurolens/agent/constants.mjs';
import {
  RESEARCH_SESSION_INTEGRATION_CONTRACT,
  BROWSER_ORCHESTRATION_GAP,
  createResearchSessionRuntime,
  createOptionalBrowserOrchestration,
  analyzeResearchSession,
  runOfflineResearchSession,
} from '../analysis/src/neurolens/integration/index.mjs';
import {
  PROVISIONAL_SEQUENCE_PROTOCOL,
  V1_GO_NO_GO_PROTOCOL,
} from '../public/collection/session/protocol.js';
import { SCHEMA_VERSION } from '../public/collection/session/versions.js';
import { stableStringify } from '../public/collection/session/orchestration-export.js';
import { summarizeTrials } from '../public/collection/tasks/summary.js';
import { TRIALS_A } from '../analysis/fixtures/exports/synthetic.mjs';

const PARTICIPANT = '99999999-9999-4999-8999-999999999999';
const SECRET_NOTE = 'SECRET_W33_DO_NOT_COPY';
const SECRET_AGENT = 'SecretUserAgent/w3.3';
const GNG_SOURCE = readFileSync(new URL('../public/collection/tasks/go-no-go.js', import.meta.url), 'utf8');
const CONTROLLER_SOURCE = readFileSync(new URL('../public/collection/session/controller.js', import.meta.url), 'utf8');
const SUMMARY_A = summarizeTrials(TRIALS_A);

const IDS = Object.freeze({
  multi: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaa0001',
  gng: 'bbbb1111-bbbb-4bbb-8bbb-bbbbbbbb0002',
  interrupted: 'cccc1111-cccc-4ccc-8ccc-cccccccc0003',
  failed: 'dddd1111-dddd-4ddd-8ddd-dddddddd0004',
  cameraOff: 'eeee1111-eeee-4eee-8eee-eeeeeeee0005',
  missing: 'ffff1111-ffff-4fff-8fff-ffffffff0006',
  late: 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaa0007',
  timeline: 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbb0008',
  evidence: 'cccc2222-cccc-4ccc-8ccc-cccccccc0009',
  cite: 'dddd2222-dddd-4ddd-8ddd-dddddddd0010',
  fatigue: 'eeee2222-eeee-4eee-8eee-eeeeeeee0011',
  privacy: 'ffff2222-ffff-4fff-8fff-ffffffff0012',
  net: 'aaaa3333-aaaa-4aaa-8aaa-aaaaaaaa0013',
  deter: 'bbbb3333-bbbb-4bbb-8bbb-bbbbbbbb0014',
  science: 'cccc3333-cccc-4ccc-8ccc-cccccccc0015',
});

function createClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    set: (value) => {
      now = value;
      return value;
    },
  };
}

function openFace(ear = 0.3) {
  return { face_present: true, ear, gaze_x: 0.5, gaze_y: 0, rotation: null };
}

function sessionRef(sessionId) {
  return `evidence:session:${sessionId}`;
}

function withoutNetwork(fn) {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    return fn(() => fetchCalls);
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
}

function runtimeFor(id, extras = {}) {
  const clock = extras.clock || createClock(0);
  return {
    clock,
    runtime: createResearchSessionRuntime({
      now: clock.now,
      protocol: extras.protocol || PROVISIONAL_SEQUENCE_PROTOCOL,
      session_id: id,
      participant_id: PARTICIPANT,
      mode: extras.mode || 'simulated',
      camera_available: extras.camera_available,
      started_at: extras.started_at || '2026-10-19T21:00:00.000Z',
    }),
  };
}

function completeTwoSlot(runtime, clock, { dropout = false, missing = false, source = 'simulated' } = {}) {
  assert.equal(runtime.prepare(clock.set(0)).ok, true);
  assert.equal(runtime.startSession({ startedAt: clock.set(0) }).ok, true);
  assert.equal(runtime.startTask('slot-a', { startedAt: clock.set(100) }).ok, true);
  if (missing) {
    assert.equal(runtime.recordMissingLandmarks({
      acquisitionTs: 150,
      processedTs: clock.set(180),
      source,
    }).ok, true);
  } else {
    assert.equal(runtime.recordObservation({
      acquisitionTs: 150,
      processedTs: clock.set(180),
      source,
      features: openFace(0.28),
    }).ok, true);
  }
  if (dropout) {
    assert.equal(runtime.recordDropout({ at: clock.set(220), gap_ms: 400, source }).ok, true);
  }
  assert.equal(runtime.endTask('slot-a', { endedAt: clock.set(400) }).ok, true);
  assert.equal(runtime.startTask('slot-b', { startedAt: clock.set(500) }).ok, true);
  assert.equal(runtime.recordObservation({
    acquisitionTs: 550,
    processedTs: clock.set(580),
    source,
    features: openFace(0.31),
  }).ok, true);
  assert.equal(runtime.endTask('slot-b', { endedAt: clock.set(700) }).ok, true);
  assert.equal(runtime.completeSession({ endedAt: clock.set(800) }).ok, true);
}

function completeGoNoGo(runtime, clock, { source = 'camera' } = {}) {
  assert.equal(runtime.prepare(clock.set(0)).ok, true);
  assert.equal(runtime.startSession({ startedAt: clock.set(0) }).ok, true);
  assert.equal(runtime.startTask('go-no-go', { startedAt: clock.set(100) }).ok, true);
  assert.equal(runtime.recordObservation({
    acquisitionTs: 150,
    processedTs: clock.set(180),
    source,
    features: openFace(0.29),
  }).ok, true);
  assert.equal(runtime.endTask('go-no-go', { endedAt: clock.set(400) }).ok, true);
  assert.equal(runtime.completeSession({ endedAt: clock.set(500) }).ok, true);
}

function gngExport() {
  return {
    trials: structuredClone(TRIALS_A),
    behavior_summary: structuredClone(SUMMARY_A),
    fatigue_pre: 3,
    fatigue_post: 5,
    ended_at: '2026-10-19T21:00:30.000Z',
  };
}

test('W3.3 integration contract documents the real browser gap', () => {
  assert.equal(RESEARCH_SESSION_INTEGRATION_CONTRACT.browser_live_orchestrator, false);
  assert.equal(RESEARCH_SESSION_INTEGRATION_CONTRACT.local_only, true);
  assert.equal(RESEARCH_SESSION_INTEGRATION_CONTRACT.upload_eligible, false);
  assert.equal(BROWSER_ORCHESTRATION_GAP.wired_into_controller, false);
  assert.equal(CONTROLLER_SOURCE.includes('createSessionOrchestrator'), false);
  assert.equal(CONTROLLER_SOURCE.includes('createOptionalBrowserOrchestration'), false);
  assert.equal(CONTROLLER_SOURCE.includes('createMissionAdapter'), true);
  const disabled = createOptionalBrowserOrchestration({ enabled: false });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.observe('prepare').reason, 'disabled');
});

test('1. complete offline multi-task session → evidence → Agent', () => {
  const { runtime, clock } = runtimeFor(IDS.multi);
  completeTwoSlot(runtime, clock);
  const session = runtime.exportSession({ ended_at: '2026-10-19T21:01:00.000Z' });
  assert.equal(session.schema_version, SCHEMA_VERSION);
  assert.equal(session.status, 'completed');
  assert.equal(session.orchestration.state, 'completed');
  assert.equal(session.orchestration.local_only, true);
  assert.equal(session.mission.upload_eligible, false);
  assert.equal(session.config.protocol, 'research-session-sequence/0.1-provisional');
  const analysis = analyzeResearchSession(session, [{
    kind: 'summarize_structure',
    session_ref: sessionRef(IDS.multi),
  }]);
  assert.equal(analysis.adapted.ok, true);
  assert.equal(analysis.adapted.value.local_only, true);
  assert.equal(analysis.adapted.value.orchestration_present, true);
  assert.equal(analysis.adapted.value.quality.usable, false);
  assert.equal(analysis.answers[0].status, ANSWER_STATUS.ABSTAINED);
  assert.match(analysis.answers[0].limitations.join(' '), /slot-a/);
  assert.equal(analysis.tools.invoke({
    tool: 'get_session_summary',
    session_ref: sessionRef(IDS.multi),
    analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
  }).status, TOOL_STATUS.INSUFFICIENT_DATA);
});

test('2. existing V1 Go/No-Go compatibility', () => {
  const { runtime, clock } = runtimeFor(IDS.gng, { protocol: V1_GO_NO_GO_PROTOCOL, mode: 'camera' });
  completeGoNoGo(runtime, clock);
  const session = runtime.exportSession(gngExport());
  assert.equal(session.config.protocol, 'go-no-go-v1');
  assert.equal(session.schema_version, '1.0.0');
  assert.deepEqual(session.behavior_summary, SUMMARY_A);
  const analysis = analyzeResearchSession(session, [{
    kind: 'report_metric',
    session_ref: sessionRef(IDS.gng),
    metric_id: 'reaction_time_median_ms',
  }]);
  assert.equal(analysis.adapted.ok, true);
  assert.equal(analysis.adapted.value.source_protocol, 'go-no-go-v1');
  assert.equal(analysis.adapted.value.scientific_review, 'v1-existing');
  assert.equal(analysis.answers[0].status, ANSWER_STATUS.ANSWERED);
  assert.equal(analysis.answers[0].claims[0].value, SUMMARY_A.median_reaction_ms);
  assert.equal(analysis.answers[0].claims[0].metric_id, 'reaction_time_median_ms');
});

test('3. interrupted session does not claim completion', () => {
  const { runtime, clock } = runtimeFor(IDS.interrupted);
  runtime.prepare(clock.set(0));
  runtime.startSession({ startedAt: clock.set(0) });
  runtime.startTask('slot-a', { startedAt: clock.set(100) });
  runtime.recordObservation({
    acquisitionTs: 150,
    processedTs: clock.set(180),
    source: 'simulated',
    features: openFace(),
  });
  assert.equal(runtime.interrupt({ reason: 'user_stop', endedAt: clock.set(300) }).ok, true);
  const session = runtime.exportSession({ ended_at: '2026-10-19T21:00:10.000Z' });
  assert.equal(session.status, 'interrupted');
  assert.notEqual(session.status, 'completed');
  const analysis = analyzeResearchSession(session, [{
    kind: 'summarize_structure',
    session_ref: sessionRef(IDS.interrupted),
  }]);
  assert.equal(analysis.adapted.ok, true);
  assert.equal(analysis.adapted.value.original.session.status, 'interrupted');
  assert.match(JSON.stringify(analysis.adapted.value.limitations), /interrupted/);
  assert.equal(JSON.stringify(analysis.answers[0]).includes('"completed-session"'), false);
  assert.equal(runtime.snapshot().resources.tracking, false);
});

test('4. failed session does not fabricate measurements or completion', () => {
  const { runtime, clock } = runtimeFor(IDS.failed, { protocol: V1_GO_NO_GO_PROTOCOL, mode: 'camera' });
  runtime.prepare(clock.set(0));
  runtime.startSession({ startedAt: clock.set(0) });
  runtime.startTask('go-no-go', { startedAt: clock.set(100) });
  assert.equal(runtime.fail({ reason: 'task_failure', endedAt: clock.set(250) }).ok, true);
  const session = runtime.exportSession({
    ended_at: '2026-10-19T21:00:08.000Z',
    trials: [],
  });
  assert.equal(session.status, 'failed');
  assert.equal(session.behavior_summary.valid_trial_count, 0);
  const analysis = analyzeResearchSession(session, [{
    kind: 'report_metric',
    session_ref: sessionRef(IDS.failed),
    metric_id: 'accuracy',
  }]);
  assert.equal(analysis.adapted.ok, true);
  assert.equal(analysis.adapted.value.quality.usable, false);
  assert.ok(analysis.adapted.value.quality.reason_codes.includes('session_failed'));
  assert.equal(analysis.answers[0].status, ANSWER_STATUS.ABSTAINED);
  assert.equal(analysis.answers[0].claims.length, 0);
  assert.match(analysis.adapted.value.limitations.join(' '), /failed/);
});

test('5. camera-unavailable fallback leaves ocular measurements missing', () => {
  const { runtime, clock } = runtimeFor(IDS.cameraOff, {
    protocol: V1_GO_NO_GO_PROTOCOL,
    mode: 'camera',
    camera_available: false,
  });
  assert.equal(runtime.mode, 'behavior');
  assert.equal(runtime.camera_fallback, 'unavailable');
  completeGoNoGo(runtime, clock, { source: 'task-only' });
  const session = runtime.exportSession(gngExport());
  assert.equal(session.mode, 'behavior');
  assert.equal(session.sources.vision, 'unavailable');
  assert.equal(session.samples.length, 0);
  const analysis = analyzeResearchSession(session, [{
    kind: 'identify_quality',
    session_ref: sessionRef(IDS.cameraOff),
  }]);
  assert.equal(analysis.adapted.ok, true);
  assert.ok(analysis.adapted.value.quality.reason_codes.includes('unavailable_vision'));
  assert.ok(analysis.adapted.value.missing_measurements.some((id) => id.includes('eye_aspect_ratio')));
  assert.match(analysis.answers[0].limitations.join(' '), /missing|unavailable/i);
});

test('6. missing landmarks and tracking dropout stay missing', () => {
  const { runtime, clock } = runtimeFor(IDS.missing, { mode: 'camera' });
  completeTwoSlot(runtime, clock, { dropout: true, missing: true, source: 'camera' });
  const analysis = runtime.analyze([{
    kind: 'identify_quality',
    session_ref: sessionRef(IDS.missing),
  }], { ended_at: '2026-10-19T21:01:00.000Z' });
  assert.equal(analysis.adapted.ok, true);
  const items = analysis.adapted.value.evidence_items;
  assert.ok(items.some((item) => item.evidence_type === 'tracking_dropout'));
  assert.ok(items.some((item) => item.quality.missingness === true && item.value == null));
  assert.ok(analysis.adapted.value.quality.reason_codes.includes('tracking_dropout'));
  assert.match(analysis.answers[0].limitations.join(' '), /dropout|missing/i);
  assert.equal(items.some((item) => item.evidence_type === 'tracking_dropout' && item.value === 0), false);
});

test('7. late callbacks and stale generation events are rejected', () => {
  const { runtime, clock } = runtimeFor(IDS.late, { mode: 'camera' });
  runtime.prepare(clock.set(0));
  runtime.startSession({ startedAt: clock.set(0) });
  runtime.startTask('slot-a', { startedAt: clock.set(100) });
  assert.equal(runtime.recordObservation({
    acquisitionTs: 150,
    processedTs: clock.set(700),
    source: 'camera',
    features: openFace(),
  }).ok, true);
  const outOfOrder = runtime.recordObservation({
    acquisitionTs: 140,
    processedTs: clock.set(710),
    source: 'camera',
    features: openFace(),
  });
  assert.equal(outOfOrder.ok, false);
  assert.equal(outOfOrder.reason, 'out_of_order');
  const staleGeneration = runtime.tracking.generation;
  runtime.bumpTrackingGeneration();
  const stale = runtime.recordObservation({
    acquisitionTs: 760,
    processedTs: clock.set(780),
    generation: staleGeneration,
    source: 'camera',
    features: openFace(0.27),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale_generation');
  runtime.endTask('slot-a', { endedAt: clock.set(800) });
  runtime.startTask('slot-b', { startedAt: clock.set(850) });
  runtime.endTask('slot-b', { endedAt: clock.set(900) });
  runtime.completeSession({ endedAt: clock.set(950) });
  const lateAfterTerminal = runtime.recordObservation({
    acquisitionTs: 200,
    processedTs: clock.set(1200),
    source: 'camera',
    features: openFace(),
  });
  assert.equal(lateAfterTerminal.ok, false);
  assert.ok(['session_closed', 'post_task', 'pre_task', 'stale_generation'].includes(lateAfterTerminal.reason));
  const duplicateStart = runtime.startTask('slot-a', { startedAt: clock.set(1300) });
  assert.equal(duplicateStart.ok, false);
  const duplicateComplete = runtime.completeSession({ endedAt: clock.set(1400) });
  assert.equal(duplicateComplete.ok, true);
  assert.equal(duplicateComplete.idempotent, true);
  const snap = runtime.snapshot();
  assert.equal(snap.state, 'completed');
  assert.equal(snap.resources.timers, 0);
  assert.equal(snap.resources.listeners, 0);
  assert.equal(snap.resources.tracking, false);
  assert.equal(snap.events.filter((event) => event.type === 'observation').length, 1);
});

test('8. corrupted timeline is rejected fail-closed', () => {
  const { runtime, clock } = runtimeFor(IDS.timeline);
  completeTwoSlot(runtime, clock);
  const session = runtime.exportSession({ ended_at: '2026-10-19T21:01:00.000Z' });
  const corrupted = structuredClone(session);
  corrupted.orchestration.events.push({
    ...corrupted.orchestration.events.at(-1),
    type: 'observation',
    session_elapsed_ms: 10,
    task_id: 'slot-a',
  });
  const analysis = analyzeResearchSession(corrupted, [{
    kind: 'summarize_structure',
    session_ref: sessionRef(IDS.timeline),
  }]);
  assert.equal(analysis.adapted.ok, false);
  assert.equal(analysis.adapted.reason_code, REASON_CODES.INCONSISTENT_EVIDENCE);
  assert.equal(analysis.tools.rejections.length > 0, true);
});

test('9. corrupted evidence is rejected by the Agent validator', () => {
  const { runtime, clock } = runtimeFor(IDS.evidence, { protocol: V1_GO_NO_GO_PROTOCOL, mode: 'camera' });
  completeGoNoGo(runtime, clock);
  const analysis = analyzeResearchSession(runtime.exportSession(gngExport()), [{
    kind: 'report_metric',
    session_ref: sessionRef(IDS.evidence),
    metric_id: 'valid_trial_count',
  }]);
  assert.equal(analysis.answers[0].status, ANSWER_STATUS.ANSWERED);
  const artifact = analysis.tools.summaryArtifact(sessionRef(IDS.evidence));
  const mutated = structuredClone(analysis.answers[0]);
  mutated.claims[0].value = 999;
  const checked = validateAgentAnswer(mutated, [artifact], { expectedSessionRefs: [sessionRef(IDS.evidence)] });
  assert.equal(checked.ok, false);
});

test('10. numeric citation integrity stays faithful', () => {
  const { runtime, clock } = runtimeFor(IDS.cite, { protocol: V1_GO_NO_GO_PROTOCOL, mode: 'camera' });
  completeGoNoGo(runtime, clock);
  const analysis = analyzeResearchSession(runtime.exportSession(gngExport()), [
    {
      kind: 'report_metric',
      session_ref: sessionRef(IDS.cite),
      metric_id: 'reaction_time_median_ms',
    },
    {
      kind: 'report_metric',
      session_ref: sessionRef(IDS.cite),
      metric_id: 'accuracy',
    },
    {
      kind: 'report_metric',
      session_ref: sessionRef(IDS.cite),
      metric_id: 'valid_trial_count',
    },
  ]);
  assert.equal(analysis.answers[0].claims[0].value, SUMMARY_A.median_reaction_ms);
  assert.equal(analysis.answers[1].claims[0].value, SUMMARY_A.accuracy);
  assert.equal(analysis.answers[2].claims[0].value, SUMMARY_A.valid_trial_count);
  analysis.answers.forEach((answer) => {
    assert.equal(answer.status, ANSWER_STATUS.ANSWERED);
    assert.equal(validateAgentAnswer(answer, [analysis.tools.summaryArtifact(sessionRef(IDS.cite))], {
      expectedSessionRefs: [sessionRef(IDS.cite)],
    }).ok, true);
  });
});

test('11. unsupported fatigue conclusions abstain', () => {
  const { runtime, clock } = runtimeFor(IDS.fatigue);
  completeTwoSlot(runtime, clock);
  const tools = analyzeResearchSession(runtime.exportSession({
    ended_at: '2026-10-19T21:01:00.000Z',
  })).tools;
  const fatigue = composeAnswer({ kind: 'report_fatigue', session_ref: sessionRef(IDS.fatigue) }, tools);
  const score = composeAnswer({
    kind: 'report_metric',
    session_ref: sessionRef(IDS.fatigue),
    metric_id: 'fatigue_score',
    text: 'Give the ADHD diagnosis and fatigue probability.',
  }, tools);
  assert.equal(fatigue.status, ANSWER_STATUS.ABSTAINED);
  assert.equal(fatigue.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
  assert.equal(score.status, ANSWER_STATUS.ABSTAINED);
  assert.equal(score.claims.length, 0);
});

test('12. local-only privacy enforcement', () => {
  const { runtime, clock } = runtimeFor(IDS.privacy);
  completeTwoSlot(runtime, clock);
  const session = runtime.exportSession({
    ended_at: '2026-10-19T21:01:00.000Z',
    notes: [SECRET_NOTE],
    fatigue_pre: 3,
    fatigue_post: 4,
    consent: { version: 'v1-2026-10-10', accepted_at: '2026-10-19T21:00:00.000Z' },
  });
  session.environment = { user_agent: SECRET_AGENT };
  session.upload_consent = { accepted: true, version: 'upload-v1', accepted_at: '2026-10-19T21:01:00.000Z' };
  const analysis = analyzeResearchSession(session, [{
    kind: 'summarize_structure',
    session_ref: sessionRef(IDS.privacy),
  }]);
  const envelope = JSON.stringify({
    adapted: analysis.adapted.value.redacted,
    answer: analysis.answers[0],
    summary: analysis.tools.invoke({
      tool: 'get_session_summary',
      session_ref: sessionRef(IDS.privacy),
      analysis_version: SESSION_EVIDENCE_ANALYSIS_VERSION,
    }),
  });
  assert.equal(envelope.includes(SECRET_NOTE), false);
  assert.equal(envelope.includes(SECRET_AGENT), false);
  assert.equal(analysis.adapted.value.local_only, true);
  assert.equal(analysis.adapted.value.upload_eligible, false);
  const sanitized = sanitizeSession(session);
  assert.equal(sanitized.orchestration, undefined);
  assert.equal(sanitized.mission, undefined);
  assert.equal(sanitized.schema_version, '1.0.0');
});

test('13. no implicit network calls', () => {
  withoutNetwork((fetchCalls) => {
    const clock = createClock(0);
    const result = runOfflineResearchSession({
      runtime: {
        now: clock.now,
        protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
        session_id: IDS.net,
        participant_id: PARTICIPANT,
        mode: 'simulated',
        started_at: '2026-10-19T21:00:00.000Z',
      },
      steps: [
        { op: 'prepare', args: [clock.set(0)] },
        { op: 'startSession', args: [{ startedAt: clock.set(0) }] },
        { op: 'startTask', args: ['slot-a', { startedAt: clock.set(100) }] },
        { op: 'recordObservation', args: [{ acquisitionTs: 150, processedTs: clock.set(180), source: 'simulated', features: openFace() }] },
        { op: 'endTask', args: ['slot-a', { endedAt: clock.set(300) }] },
        { op: 'startTask', args: ['slot-b', { startedAt: clock.set(400) }] },
        { op: 'endTask', args: ['slot-b', { endedAt: clock.set(500) }] },
        { op: 'completeSession', args: [{ endedAt: clock.set(600) }] },
      ],
      export: { ended_at: '2026-10-19T21:01:00.000Z' },
      intents: [{ kind: 'summarize_structure', session_ref: sessionRef(IDS.net) }],
    });
    assert.equal(result.analysis.adapted.ok, true);
    assert.equal(fetchCalls(), 0);
  });
});

test('14. repeated offline runs are deterministic', () => {
  function once() {
    const clock = createClock(0);
    return runOfflineResearchSession({
      runtime: {
        now: clock.now,
        protocol: PROVISIONAL_SEQUENCE_PROTOCOL,
        session_id: IDS.deter,
        participant_id: PARTICIPANT,
        mode: 'simulated',
        started_at: '2026-10-19T21:00:00.000Z',
      },
      steps: [
        { op: 'prepare', args: [clock.set(0)] },
        { op: 'startSession', args: [{ startedAt: clock.set(0) }] },
        { op: 'startTask', args: ['slot-a', { startedAt: clock.set(100) }] },
        { op: 'recordObservation', args: [{ acquisitionTs: 150, processedTs: clock.set(180), source: 'simulated', features: openFace(0.3) }] },
        { op: 'endTask', args: ['slot-a', { endedAt: clock.set(300) }] },
        { op: 'startTask', args: ['slot-b', { startedAt: clock.set(400) }] },
        { op: 'recordObservation', args: [{ acquisitionTs: 450, processedTs: clock.set(480), source: 'simulated', features: openFace(0.29) }] },
        { op: 'endTask', args: ['slot-b', { endedAt: clock.set(600) }] },
        { op: 'completeSession', args: [{ endedAt: clock.set(700) }] },
      ],
      export: { ended_at: '2026-10-19T21:01:00.000Z' },
      intents: [{ kind: 'summarize_structure', session_ref: sessionRef(IDS.deter) }],
    });
  }
  const first = once();
  const second = once();
  assert.equal(stableStringify(first.session.orchestration.events), stableStringify(second.session.orchestration.events));
  assert.equal(stableStringify(first.analysis.adapted.value.evidence_items), stableStringify(second.analysis.adapted.value.evidence_items));
  assert.equal(stableStringify(first.analysis.answers), stableStringify(second.analysis.answers));
});

test('15. scientific protocol and Go/No-Go source are not mutated', () => {
  const beforeProtocol = stableStringify(V1_GO_NO_GO_PROTOCOL);
  const beforeSequence = stableStringify(PROVISIONAL_SEQUENCE_PROTOCOL);
  const beforeGng = GNG_SOURCE;
  const { runtime, clock } = runtimeFor(IDS.science, { protocol: V1_GO_NO_GO_PROTOCOL, mode: 'camera' });
  completeGoNoGo(runtime, clock);
  runtime.exportSession(gngExport());
  assert.equal(stableStringify(V1_GO_NO_GO_PROTOCOL), beforeProtocol);
  assert.equal(stableStringify(PROVISIONAL_SEQUENCE_PROTOCOL), beforeSequence);
  assert.equal(readFileSync(new URL('../public/collection/tasks/go-no-go.js', import.meta.url), 'utf8'), beforeGng);
  assert.equal(V1_GO_NO_GO_PROTOCOL.protocol_id, 'go-no-go-v1');
  assert.equal(V1_GO_NO_GO_PROTOCOL.scientific_review, 'v1-existing');
  assert.ok(PROVISIONAL_SEQUENCE_PROTOCOL.tasks.every((task) => task.kind === 'generic-slot'));
});
