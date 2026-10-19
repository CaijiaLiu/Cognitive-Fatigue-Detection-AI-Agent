import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANALYSIS_VERSION,
  ANSWER_VERSION,
  DATA_ORIGIN,
  EXPORT_ANALYSIS_VERSION,
  REASON_CODES,
  TOOL_NAMES,
  TOOL_STATUS,
  composeAnswer,
  createAnalysisTools,
  createFixtureStore,
  validateAgentAnswer,
} from '../analysis/src/neurolens/agent/index.mjs';
import {
  createExportAnalysisTools,
  createExportStore,
  validateExport,
} from '../analysis/src/neurolens/adapter/index.mjs';
import {
  CSV_EXPORT,
  EXPECTED_A,
  EXPECTED_B,
  IDS,
  SECRET_EVENT,
  SECRET_NOTE,
  SECRET_PARTICIPANT_ID,
  SECRET_USER_AGENT,
  SECRET_WITHDRAWAL,
  cameraBundle,
  cameraSessionA,
  cameraSessionB,
  demoSession,
  integrityMismatchSession,
  missingRtSession,
  missingSummarySession,
  missionPreviewSession,
  otherProtocolSession,
  researcherBundle,
  simulatedVisionSession,
  taskOnlySession,
  unknownSchemaSession,
} from '../analysis/fixtures/exports/synthetic.mjs';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../analysis/fixtures/exports');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

function ref(sessionId) {
  return `export:session:${sessionId}`;
}

function summaryRequest(sessionId) {
  return {
    tool: TOOL_NAMES.GET_SESSION_SUMMARY,
    session_ref: ref(sessionId),
    analysis_version: EXPORT_ANALYSIS_VERSION,
  };
}

function compareRequest(left, right, metricId = 'reaction_time_median_ms') {
  return {
    tool: TOOL_NAMES.COMPARE_SESSIONS,
    session_refs: [ref(left), ref(right)],
    metric_id: metricId,
    analysis_version: EXPORT_ANALYSIS_VERSION,
  };
}

function hasForbiddenLeak(value) {
  const text = JSON.stringify(value);
  return [SECRET_PARTICIPANT_ID, SECRET_USER_AGENT, SECRET_NOTE, SECRET_EVENT, SECRET_WITHDRAWAL].some((secret) => text.includes(secret));
}

function exportTools(input = [cameraSessionA(), cameraSessionB(), taskOnlySession(), simulatedVisionSession(), missingRtSession()]) {
  return createExportAnalysisTools(input);
}

test('known V1 camera export copies allowlisted metrics through get_session_summary', () => {
  const fromDisk = loadFixture('camera-behavior-a.json');
  const agent = createExportAnalysisTools(fromDisk);
  const response = agent.invoke(summaryRequest(IDS.cameraA));
  assert.equal(response.status, TOOL_STATUS.OK);
  assert.equal(response.data_origin, DATA_ORIGIN.SESSION_EXPORT);
  assert.equal(response.analysis_version, EXPORT_ANALYSIS_VERSION);
  assert.equal(response.protocol_version, 'go-no-go/1.0');
  assert.deepEqual(response.metrics.find((item) => item.metric_id === 'reaction_time_median_ms'), {
    metric_id: 'reaction_time_median_ms',
    value: EXPECTED_A.reaction_time_median_ms,
    unit: 'ms',
    n: EXPECTED_A.n_rt,
  });
  assert.deepEqual(response.metrics.find((item) => item.metric_id === 'accuracy'), {
    metric_id: 'accuracy',
    value: EXPECTED_A.accuracy,
    unit: 'proportion',
    n: EXPECTED_A.n_valid,
  });
  assert.deepEqual(response.metrics.find((item) => item.metric_id === 'valid_trial_count'), {
    metric_id: 'valid_trial_count',
    value: EXPECTED_A.valid_trial_count,
    unit: 'count',
    n: EXPECTED_A.n_valid,
  });
  const artifact = agent.inspectArtifact(response.artifact_ref);
  assert.equal(artifact.provenance.computation, 'deterministic_export_normalization');
  assert.equal(artifact.payload.source_protocol, 'go-no-go-v1');
  assert.equal(artifact.payload.collection_schema_version, '1.0.0');
  assert.match(artifact.payload.source_export_sha256, /^[a-f0-9]{64}$/);
  assert.equal(artifact.provenance.source_protocol, 'go-no-go-v1');
});

test('task-only export copies behavior and does not zero-fill ocular fields', () => {
  const agent = createExportAnalysisTools(loadFixture('task-only.json'));
  const response = agent.invoke(summaryRequest(IDS.taskOnly));
  assert.equal(response.status, TOOL_STATUS.OK);
  assert.equal(response.metrics.find((item) => item.metric_id === 'accuracy').value, EXPECTED_A.accuracy);
  const artifact = agent.inspectArtifact(response.artifact_ref);
  assert.ok(artifact.quality.reason_codes.includes('unavailable_vision'));
  const text = JSON.stringify(artifact);
  assert.equal(text.includes('"blink_count"'), false);
  assert.equal(text.includes('"closed_fraction"'), false);
  assert.equal(text.includes('"gaze_position_sd_eye_width"'), false);
  assert.ok(artifact.limitations.some((item) => /ocular candidate fields were not copied/i.test(item)));
});

test('simulated vision is labeled and not compared with a camera session', () => {
  const agent = exportTools();
  const summary = agent.invoke(summaryRequest(IDS.simulated));
  assert.equal(summary.status, TOOL_STATUS.OK);
  assert.ok(summary.quality.reason_codes.includes('simulated_vision'));
  assert.ok(summary.limitations.some((item) => /not camera evidence/i.test(item)));
  const compared = agent.invoke(compareRequest(IDS.cameraA, IDS.simulated));
  assert.equal(compared.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(compared.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  assert.deepEqual(compared.metrics, []);
  const answer = composeAnswer({
    kind: 'compare_metric',
    session_refs: [ref(IDS.cameraA), ref(IDS.simulated)],
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'abstained');
});

test('missing reaction times yield insufficient_data without imputed labels', () => {
  const agent = createExportAnalysisTools(loadFixture('missing-rt.json'));
  const response = agent.invoke(summaryRequest(IDS.missingRt));
  assert.equal(response.status, TOOL_STATUS.INSUFFICIENT_DATA);
  assert.equal(response.reason_code, REASON_CODES.INSUFFICIENT_DATA);
  assert.deepEqual(response.metrics, []);
  assert.equal(response.artifact_ref, undefined);
  const answer = composeAnswer({
    kind: 'report_metric',
    session_ref: ref(IDS.missingRt),
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'abstained');
  assert.doesNotMatch(JSON.stringify(answer.claims), /fatigue score|ADHD|diagnos/i);
});

test('mission-preview JSON is incompatible and is not coerced to V1', () => {
  const preview = loadFixture('mission-preview.json');
  const checked = validateExport(preview);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  const agent = createExportAnalysisTools(preview);
  const response = agent.invoke(summaryRequest(IDS.preview));
  assert.equal(response.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(response.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  assert.deepEqual(response.metrics, []);
  assert.equal(agent.inspectArtifact(`export:session-summary:${IDS.preview}`), null);
  assert.equal(JSON.stringify(response).includes('between'), false);
  assert.equal(JSON.stringify(preview.ratings.between), '4');
});

test('demo sessions are rejected before artifact construction', () => {
  const agent = createExportAnalysisTools(loadFixture('demo.json'));
  const response = agent.invoke(summaryRequest(IDS.demo));
  assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(response.reason_code, REASON_CODES.REJECTED_REQUEST);
  assert.equal(agent.inspectArtifact(`export:session-summary:${IDS.demo}`), null);
});

test('unknown schema and missing behavior_summary fail closed', () => {
  const unknown = createExportAnalysisTools(loadFixture('unknown-schema.json')).invoke(summaryRequest(IDS.unknownSchema));
  assert.equal(unknown.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(unknown.reason_code, REASON_CODES.UNSUPPORTED_SCHEMA);
  const missing = createExportAnalysisTools(loadFixture('missing-behavior-summary.json')).invoke(summaryRequest(IDS.missingSummary));
  assert.equal(missing.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(missing.reason_code, REASON_CODES.MALFORMED_OUTPUT);
  assert.equal(validateExport(unknownSchemaSession()).ok, false);
  assert.equal(validateExport(missingSummarySession()).ok, false);
});

test('integrity mismatch between stored summary and trials is inconsistent_evidence', () => {
  const agent = createExportAnalysisTools(loadFixture('integrity-mismatch.json'));
  const response = agent.invoke(summaryRequest(IDS.integrity));
  assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(response.reason_code, REASON_CODES.INCONSISTENT_EVIDENCE);
  assert.deepEqual(response.metrics, []);
  assert.equal(agent.inspectArtifact(`export:session-summary:${IDS.integrity}`), null);
});

test('two go-no-go/1.0 exports compare per session and get_evidence retrieves the artifact', () => {
  const agent = createExportAnalysisTools(loadFixture('camera-bundle.json'));
  const compared = agent.invoke(compareRequest(IDS.cameraA, IDS.cameraB, 'accuracy'));
  assert.equal(compared.status, TOOL_STATUS.OK);
  assert.equal(compared.metrics[0].value, EXPECTED_A.accuracy);
  assert.equal(compared.metrics[1].value, EXPECTED_B.accuracy);
  assert.equal(compared.metrics[0].session_ref, ref(IDS.cameraA));
  assert.equal(compared.metrics[1].session_ref, ref(IDS.cameraB));
  const evidence = agent.invoke({ tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: compared.artifact_ref });
  assert.equal(evidence.status, TOOL_STATUS.OK);
  assert.deepEqual(evidence.metrics, compared.metrics);
  const artifact = agent.inspectArtifact(compared.artifact_ref);
  const answer = composeAnswer({
    kind: 'compare_metric',
    session_refs: [ref(IDS.cameraA), ref(IDS.cameraB)],
    metric_id: 'accuracy',
  }, agent);
  assert.equal(answer.status, 'answered');
  assert.equal(validateAgentAnswer(answer, [artifact], {
    expectedSessionRefs: [ref(IDS.cameraA), ref(IDS.cameraB)],
    coverage: 'all',
  }).ok, true);
});

test('V1 exports are incompatible with preview and other protocols', () => {
  const agent = createExportAnalysisTools([
    cameraSessionA(),
    missionPreviewSession(),
    otherProtocolSession(),
  ]);
  const vsPreview = agent.invoke(compareRequest(IDS.cameraA, IDS.preview));
  assert.equal(vsPreview.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(vsPreview.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  const vsOther = agent.invoke(compareRequest(IDS.cameraA, IDS.otherProtocol));
  assert.equal(vsOther.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(vsOther.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  const fixtureTools = createAnalysisTools({ store: createFixtureStore() });
  const vsFixture = fixtureTools.invoke({
    tool: TOOL_NAMES.COMPARE_SESSIONS,
    session_refs: ['fixture:session:a', ref(IDS.cameraA)],
    metric_id: 'reaction_time_median_ms',
    analysis_version: ANALYSIS_VERSION,
  });
  assert.equal(vsFixture.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(vsFixture.reason_code, REASON_CODES.UNKNOWN_SESSION);
});

test('coverage:all rejects a citation that omits a requested session', () => {
  const agent = createExportAnalysisTools(cameraBundle());
  const summary = agent.invoke(summaryRequest(IDS.cameraA));
  const artifact = agent.inspectArtifact(summary.artifact_ref);
  const answer = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: `The recorded accuracy is ${EXPECTED_A.accuracy} proportion.`,
      metric_id: 'accuracy',
      value: EXPECTED_A.accuracy,
      unit: 'proportion',
      artifact_refs: [summary.artifact_ref],
    }],
    limitations: ['Session-export copy; not a fatigue diagnosis and not scientifically validated.'],
  };
  assert.equal(validateAgentAnswer(answer, [artifact], {
    expectedSessionRefs: [ref(IDS.cameraA)],
    coverage: 'any',
  }).ok, true);
  assert.equal(validateAgentAnswer(answer, [artifact], {
    expectedSessionRefs: [ref(IDS.cameraA), ref(IDS.cameraB)],
    coverage: 'all',
  }).reason_code, REASON_CODES.SESSION_MISMATCH);
});

test('artifacts drop identifiers, user agents, notes, events and withdrawal tokens', () => {
  const store = createExportStore(loadFixture('camera-behavior-a.json'));
  const agent = createAnalysisTools({ store });
  const response = agent.invoke(summaryRequest(IDS.cameraA));
  const artifact = agent.inspectArtifact(response.artifact_ref);
  const session = store.getSession(ref(IDS.cameraA));
  assert.equal(hasForbiddenLeak(artifact), false);
  assert.equal(hasForbiddenLeak(response), false);
  assert.equal(hasForbiddenLeak(session.redacted), false);
  assert.equal(hasForbiddenLeak(session.metrics), false);
  const original = store.getOriginalExport(artifact.payload.source_export_sha256);
  assert.equal(original.participant_id, SECRET_PARTICIPANT_ID);
  assert.equal(original.environment.user_agent, SECRET_USER_AGENT);
});

test('repeated adapter runs are byte-identical and do not call fetch', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    const parsed = loadFixture('researcher-bundle.json');
    const first = createExportAnalysisTools(parsed).invoke(summaryRequest(IDS.cameraA));
    const second = createExportAnalysisTools(parsed).invoke(summaryRequest(IDS.cameraA));
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    const mutated = structuredClone(parsed);
    mutated.sessions[0].behavior_summary.accuracy = 0;
    const afterMutation = createExportAnalysisTools(parsed).invoke(summaryRequest(IDS.cameraA));
    assert.equal(afterMutation.metrics.find((item) => item.metric_id === 'accuracy').value, EXPECTED_A.accuracy);
    assert.equal(fetchCalls, 0);
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
});

test('fixture tools still reject export analysis versions and unused CSV', () => {
  const fixtures = createAnalysisTools({ store: createFixtureStore() });
  const mixed = fixtures.invoke({
    tool: TOOL_NAMES.GET_SESSION_SUMMARY,
    session_ref: 'fixture:session:a',
    analysis_version: EXPORT_ANALYSIS_VERSION,
  });
  assert.equal(mixed.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(mixed.reason_code, REASON_CODES.UNKNOWN_ANALYSIS_VERSION);
  assert.equal(validateExport(CSV_EXPORT).ok, false);
  assert.equal(validateExport(CSV_EXPORT).reason_code, REASON_CODES.REJECTED_REQUEST);
  const exportAgent = createExportAnalysisTools(cameraSessionA());
  const wrongVersion = exportAgent.invoke({
    tool: TOOL_NAMES.GET_SESSION_SUMMARY,
    session_ref: ref(IDS.cameraA),
    analysis_version: ANALYSIS_VERSION,
  });
  assert.equal(wrongVersion.status, TOOL_STATUS.INCOMPATIBLE);
});

test('unsafe refs and extra fields are rejected before export catalog access', () => {
  const agent = exportTools();
  const before = agent.invokeCount();
  const cases = [
    { tool: TOOL_NAMES.GET_SESSION_SUMMARY, session_ref: '../secrets', analysis_version: EXPORT_ANALYSIS_VERSION },
    { tool: TOOL_NAMES.GET_SESSION_SUMMARY, session_ref: 'file:///tmp/export.json', analysis_version: EXPORT_ANALYSIS_VERSION },
    { tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: 'https://example.test/artifact' },
    {
      tool: TOOL_NAMES.GET_SESSION_SUMMARY,
      session_ref: ref(IDS.cameraA),
      analysis_version: EXPORT_ANALYSIS_VERSION,
      path: '/tmp/data.json',
    },
  ];
  for (const request of cases) {
    const response = agent.invoke(request);
    assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
    assert.equal(response.reason_code, REASON_CODES.REJECTED_REQUEST);
    assert.deepEqual(response.metrics, []);
  }
  assert.equal(agent.invokeCount(), before + cases.length);
});

test('end-to-end export artifact tool retrieval stays numerically faithful', () => {
  const agent = createExportAnalysisTools([loadFixture('camera-behavior-a.json'), loadFixture('camera-behavior-b.json')]);
  const summary = agent.invoke(summaryRequest(IDS.cameraA));
  const compared = agent.invoke(compareRequest(IDS.cameraA, IDS.cameraB, 'valid_trial_count'));
  const evidence = agent.invoke({ tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: compared.artifact_ref });
  assert.equal(summary.status, TOOL_STATUS.OK);
  assert.equal(compared.status, TOOL_STATUS.OK);
  assert.equal(evidence.status, TOOL_STATUS.OK);
  const report = composeAnswer({
    kind: 'report_metric',
    session_ref: ref(IDS.cameraA),
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(report.status, 'answered');
  assert.equal(report.claims[0].value, EXPECTED_A.reaction_time_median_ms);
  assert.equal(report.claims[0].unit, 'ms');
  assert.deepEqual(report.claims[0].artifact_refs, [summary.artifact_ref]);
});
