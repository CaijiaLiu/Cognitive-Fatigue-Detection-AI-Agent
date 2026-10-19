import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_VERSION,
  ANSWER_VERSION,
  CONTRACT_VERSION,
  FIXTURE_ARTIFACTS,
  REASON_CODES,
  TOOL_NAMES,
  TOOL_STATUS,
  composeAnswer,
  createAnalysisTools,
  createFixtureStore,
  validateAgentAnswer,
  validateEvidenceArtifact,
  validateResponseAgreesWithArtifact,
  validateToolRequest,
  validateToolResponse,
} from '../analysis/src/neurolens/agent/index.mjs';

function tools() {
  return createAnalysisTools({ store: createFixtureStore() });
}

function summaryRequest(sessionRef = 'fixture:session:a') {
  return {
    tool: TOOL_NAMES.GET_SESSION_SUMMARY,
    session_ref: sessionRef,
    analysis_version: ANALYSIS_VERSION,
  };
}

test('known session is deterministic and claim-faithful', () => {
  const agent = tools();
  const first = agent.invoke(summaryRequest());
  const second = agent.invoke(summaryRequest());
  assert.equal(first.status, TOOL_STATUS.OK);
  assert.equal(first.artifact_ref, 'fixture:session-summary:a');
  assert.equal(first.contract_version, CONTRACT_VERSION);
  const metric = first.metrics.find((item) => item.metric_id === 'reaction_time_median_ms');
  assert.deepEqual(metric, { metric_id: 'reaction_time_median_ms', value: 320, unit: 'ms', n: 12 });
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  const answer = composeAnswer({
    kind: 'report_metric',
    session_ref: 'fixture:session:a',
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'answered');
  assert.equal(answer.answer_version, ANSWER_VERSION);
  assert.equal(answer.claims.length, 1);
  assert.equal(answer.claims[0].value, 320);
  assert.equal(answer.claims[0].unit, 'ms');
  assert.deepEqual(answer.claims[0].artifact_refs, ['fixture:session-summary:a']);
  assert.match(answer.claims[0].text, /320 ms/);

  const artifact = agent.inspectArtifact('fixture:session-summary:a');
  const grounded = validateAgentAnswer(answer, [artifact]);
  assert.equal(grounded.ok, true);
});

test('unknown session is unavailable and the composer abstains', () => {
  const agent = tools();
  const response = agent.invoke(summaryRequest('fixture:session:missing'));
  assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(response.reason_code, REASON_CODES.UNKNOWN_SESSION);
  assert.deepEqual(response.metrics, []);
  assert.equal(response.artifact_ref, undefined);

  const answer = composeAnswer({
    kind: 'report_metric',
    session_ref: 'fixture:session:missing',
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'abstained');
  assert.deepEqual(answer.claims, []);
  assert.equal(answer.reason_code, REASON_CODES.UNKNOWN_SESSION);
});

test('low-quality session is insufficient_data and does not invent a fatigue label', () => {
  const agent = tools();
  const response = agent.invoke(summaryRequest('fixture:session:low-quality'));
  assert.equal(response.status, TOOL_STATUS.INSUFFICIENT_DATA);
  assert.equal(response.reason_code, REASON_CODES.INSUFFICIENT_DATA);
  assert.deepEqual(response.metrics, []);
  assert.equal(response.quality.usable, false);
  assert.ok(response.quality.reason_codes.includes('missing_feature'));
  assert.ok(response.limitations.some((item) => /do not impute a fatigue label/i.test(item)));

  const answer = composeAnswer({
    kind: 'report_metric',
    session_ref: 'fixture:session:low-quality',
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'abstained');
  assert.deepEqual(answer.claims, []);
  assert.doesNotMatch(JSON.stringify(answer.claims), /fatigue score|ADHD|diagnos/i);
  assert.ok(answer.limitations.some((item) => /not a fatigue diagnosis/i.test(item)));
});

test('incompatible protocols are not compared', () => {
  const agent = tools();
  const response = agent.invoke({
    tool: TOOL_NAMES.COMPARE_SESSIONS,
    session_refs: ['fixture:session:a', 'fixture:session:other-protocol'],
    metric_id: 'reaction_time_median_ms',
    analysis_version: ANALYSIS_VERSION,
  });
  assert.equal(response.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(response.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  assert.deepEqual(response.metrics, []);

  const answer = composeAnswer({
    kind: 'compare_metric',
    session_refs: ['fixture:session:a', 'fixture:session:other-protocol'],
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'abstained');
  assert.equal(answer.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
});

test('compatible sessions compare only catalogued numeric values', () => {
  const agent = tools();
  const response = agent.invoke({
    tool: TOOL_NAMES.COMPARE_SESSIONS,
    session_refs: ['fixture:session:a', 'fixture:session:b'],
    metric_id: 'reaction_time_median_ms',
    analysis_version: ANALYSIS_VERSION,
  });
  assert.equal(response.status, TOOL_STATUS.OK);
  assert.equal(response.artifact_ref, 'fixture:session-compare:a-b:reaction_time_median_ms');
  assert.deepEqual(response.metrics, [
    { metric_id: 'reaction_time_median_ms', value: 320, unit: 'ms', n: 12, session_ref: 'fixture:session:a' },
    { metric_id: 'reaction_time_median_ms', value: 348, unit: 'ms', n: 12, session_ref: 'fixture:session:b' },
  ]);

  const answer = composeAnswer({
    kind: 'compare_metric',
    session_refs: ['fixture:session:a', 'fixture:session:b'],
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'answered');
  assert.equal(answer.claims[0].value, 320);
  assert.equal(answer.claims[1].value, 348);
  assert.equal(answer.claims[0].unit, 'ms');
  assert.deepEqual(answer.claims[0].artifact_refs, ['fixture:session-compare:a-b:reaction_time_median_ms']);
});

test('unsupported clinical conclusions abstain', () => {
  const agent = tools();
  const diagnosis = composeAnswer({
    kind: 'clinical_diagnosis',
    text: 'This participant has ADHD',
  }, agent);
  assert.equal(diagnosis.status, 'abstained');
  assert.equal(diagnosis.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
  assert.deepEqual(diagnosis.claims, []);

  const fatigueScore = composeAnswer({
    kind: 'fatigue_score',
    session_ref: 'fixture:session:a',
  }, agent);
  assert.equal(fatigueScore.status, 'abstained');
  assert.equal(fatigueScore.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
});

test('unapproved paths, queries and extra fields are rejected before catalog access', () => {
  const agent = tools();
  const before = agent.invokeCount();
  const cases = [
    { tool: TOOL_NAMES.GET_SESSION_SUMMARY, session_ref: '../secrets', analysis_version: ANALYSIS_VERSION },
    { tool: TOOL_NAMES.GET_SESSION_SUMMARY, session_ref: 'file:///etc/passwd', analysis_version: ANALYSIS_VERSION },
    { tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: 'https://example.test/artifact' },
    { tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: 'fixture:session-summary:a; DROP TABLE sessions' },
    { tool: 'run_sql', query: 'select * from sessions' },
    {
      tool: TOOL_NAMES.GET_SESSION_SUMMARY,
      session_ref: 'fixture:session:a',
      analysis_version: ANALYSIS_VERSION,
      path: '/tmp/data.json',
    },
  ];
  for (const request of cases) {
    const validated = validateToolRequest(request);
    assert.equal(validated.ok, false);
    assert.equal(validated.reason_code, REASON_CODES.REJECTED_REQUEST);
    const response = agent.invoke(request);
    assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
    assert.equal(response.reason_code, REASON_CODES.REJECTED_REQUEST);
    assert.deepEqual(response.metrics, []);
    assert.ok(response.limitations.some((item) => /rejected before execution/i.test(item)));
  }
  assert.equal(agent.invokeCount(), before + cases.length);
  assert.equal(agent.inspectArtifact('fixture:session-summary:a').payload.metrics[0].value, 320);
});

test('repeated runs are identical and do not use the network', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error('network should not be used'));
  };
  try {
    const agent = tools();
    const request = summaryRequest();
    const runs = [agent.invoke(request), agent.invoke(request), agent.invoke(request)];
    assert.equal(new Set(runs.map((run) => JSON.stringify(run))).size, 1);
    const answers = [
      composeAnswer({ kind: 'report_metric', session_ref: 'fixture:session:a', metric_id: 'reaction_time_median_ms' }, agent),
      composeAnswer({ kind: 'report_metric', session_ref: 'fixture:session:a', metric_id: 'reaction_time_median_ms' }, agent),
    ];
    assert.equal(JSON.stringify(answers[0]), JSON.stringify(answers[1]));
    assert.equal(fetchCalls, 0);
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
});

test('unknown artifact lookup is unavailable', () => {
  const response = tools().invoke({
    tool: TOOL_NAMES.GET_EVIDENCE,
    artifact_ref: 'fixture:session-summary:does-not-exist',
  });
  assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(response.reason_code, REASON_CODES.UNKNOWN_ARTIFACT);
  assert.deepEqual(response.metrics, []);
});

test('numeric fidelity validator rejects mismatched values, units and citations', () => {
  const artifact = structuredClone(FIXTURE_ARTIFACTS['fixture:session-summary:a']);
  const valid = validateEvidenceArtifact(artifact);
  assert.equal(valid.ok, true);

  const baseClaim = {
    text: 'The fixture reaction_time_median_ms is 320 ms.',
    metric_id: 'reaction_time_median_ms',
    value: 320,
    unit: 'ms',
    artifact_refs: ['fixture:session-summary:a'],
  };
  assert.equal(validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [baseClaim],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, [artifact]).ok, true);

  assert.equal(validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{ ...baseClaim, value: 321 }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, [artifact]).reason_code, REASON_CODES.NUMERIC_MISMATCH);

  assert.equal(validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{ ...baseClaim, unit: 's' }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, [artifact]).reason_code, REASON_CODES.NUMERIC_MISMATCH);

  assert.equal(validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{ ...baseClaim, artifact_refs: ['fixture:session-summary:missing'] }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, [artifact]).reason_code, REASON_CODES.MISSING_EVIDENCE);

  assert.equal(validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{ ...baseClaim, text: 'This is an ADHD diagnosis.' }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, [artifact]).reason_code, REASON_CODES.UNSUPPORTED_CLAIM);

  assert.equal(validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'abstained',
    claims: [baseClaim],
    reason_code: REASON_CODES.INSUFFICIENT_DATA,
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, []).reason_code, REASON_CODES.MALFORMED_OUTPUT);
});

test('tool request and response shape validation rejects malformed envelopes', () => {
  assert.equal(validateToolRequest('get_session_summary').ok, false);
  assert.equal(validateToolResponse({
    contract_version: CONTRACT_VERSION,
    tool: TOOL_NAMES.GET_SESSION_SUMMARY,
    status: TOOL_STATUS.OK,
    analysis_version: ANALYSIS_VERSION,
    data_origin: 'synthetic_fixture',
    quality: { usable: true, reason_codes: [] },
    metrics: [],
    limitations: ['missing metrics'],
  }).reason_code, REASON_CODES.MISSING_EVIDENCE);

  const okResponse = tools().invoke(summaryRequest());
  assert.equal(validateToolResponse(okResponse).ok, true);
  assert.equal(validateToolResponse({
    ...okResponse,
    status: TOOL_STATUS.UNAVAILABLE,
    reason_code: REASON_CODES.UNKNOWN_SESSION,
    metrics: okResponse.metrics,
  }).ok, false);
});

test('mutating a tool response does not change the fixture catalog', () => {
  const agent = tools();
  const response = agent.invoke(summaryRequest());
  response.metrics[0].value = 1;
  const again = agent.invoke(summaryRequest());
  assert.equal(again.metrics[0].value, 320);
  assert.equal(agent.inspectArtifact('fixture:session-summary:a').payload.metrics[0].value, 320);
});

test('usable other-protocol sessions have their own summary artifact', () => {
  const agent = tools();
  const response = agent.invoke(summaryRequest('fixture:session:other-protocol'));
  assert.equal(response.status, TOOL_STATUS.OK);
  assert.equal(response.artifact_ref, 'fixture:session-summary:other-protocol');
  assert.equal(response.protocol_version, 'fixture-protocol/0.2');
  assert.equal(response.metrics.find((item) => item.metric_id === 'reaction_time_median_ms').value, 301);
  const answer = composeAnswer({
    kind: 'report_metric',
    session_ref: 'fixture:session:other-protocol',
    metric_id: 'reaction_time_median_ms',
  }, agent);
  assert.equal(answer.status, 'answered');
  assert.deepEqual(answer.claims[0].artifact_refs, ['fixture:session-summary:other-protocol']);
});

test('returned comparison artifact_refs are retrievable and agree with get_evidence', () => {
  const agent = tools();
  const compared = agent.invoke({
    tool: TOOL_NAMES.COMPARE_SESSIONS,
    session_refs: ['fixture:session:a', 'fixture:session:b'],
    metric_id: 'accuracy',
    analysis_version: ANALYSIS_VERSION,
  });
  assert.equal(compared.status, TOOL_STATUS.OK);
  assert.equal(compared.artifact_ref, 'fixture:session-compare:a-b:accuracy');
  const evidence = agent.invoke({
    tool: TOOL_NAMES.GET_EVIDENCE,
    artifact_ref: compared.artifact_ref,
  });
  assert.equal(evidence.status, TOOL_STATUS.OK);
  assert.deepEqual(evidence.metrics, compared.metrics);
  assert.equal(validateResponseAgreesWithArtifact(compared, agent.inspectArtifact(compared.artifact_ref)).ok, true);
});

test('coverage all requires every requested session to appear in cited artifacts', () => {
  const artifactA = structuredClone(FIXTURE_ARTIFACTS['fixture:session-summary:a']);
  const answer = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'The fixture reaction_time_median_ms is 320 ms.',
      metric_id: 'reaction_time_median_ms',
      value: 320,
      unit: 'ms',
      artifact_refs: ['fixture:session-summary:a'],
    }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  };
  assert.equal(validateAgentAnswer(answer, [artifactA], {
    expectedSessionRefs: ['fixture:session:a', 'fixture:session:b'],
  }).ok, true);
  assert.equal(validateAgentAnswer(answer, [artifactA], {
    expectedSessionRefs: ['fixture:session:a', 'fixture:session:b'],
    coverage: 'all',
  }).reason_code, REASON_CODES.SESSION_MISMATCH);
});

test('answers cannot cite an artifact from another session', () => {
  const artifactA = structuredClone(FIXTURE_ARTIFACTS['fixture:session-summary:a']);
  const artifactB = structuredClone(FIXTURE_ARTIFACTS['fixture:session-summary:b']);
  const answer = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'The fixture reaction_time_median_ms is 348 ms.',
      metric_id: 'reaction_time_median_ms',
      value: 348,
      unit: 'ms',
      artifact_refs: ['fixture:session-summary:b'],
    }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  };
  assert.equal(validateAgentAnswer(answer, [artifactB]).ok, true);
  assert.equal(validateAgentAnswer(answer, [artifactA, artifactB], {
    expectedSessionRefs: ['fixture:session:a'],
  }).reason_code, REASON_CODES.SESSION_MISMATCH);
});

test('a summary mapped to another session artifact is rejected', () => {
  const base = createFixtureStore();
  const store = {
    getSession: (ref) => base.getSession(ref),
    hasSession: (ref) => base.hasSession(ref),
    getArtifact: (ref) => base.getArtifact(ref),
    hasArtifact: (ref) => base.hasArtifact(ref),
    summaryRefFor: (ref) => (ref === 'fixture:session:a' ? 'fixture:session-summary:b' : base.summaryRefFor(ref)),
    comparisonRefFor: (refs, metricId) => base.comparisonRefFor(refs, metricId),
  };
  const response = createAnalysisTools({ store }).invoke(summaryRequest('fixture:session:a'));
  assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(response.reason_code, REASON_CODES.SESSION_MISMATCH);
  assert.deepEqual(response.metrics, []);
});

test('catalog metrics that disagree with the session are rejected', () => {
  const base = createFixtureStore();
  const store = {
    getSession: (ref) => base.getSession(ref),
    hasSession: (ref) => base.hasSession(ref),
    getArtifact(ref) {
      const artifact = base.getArtifact(ref);
      if (ref === 'fixture:session-summary:a') {
        artifact.payload.metrics[0] = { ...artifact.payload.metrics[0], value: 111 };
      }
      return artifact;
    },
    hasArtifact: (ref) => base.hasArtifact(ref),
    summaryRefFor: (ref) => base.summaryRefFor(ref),
    comparisonRefFor: (refs, metricId) => base.comparisonRefFor(refs, metricId),
  };
  const response = createAnalysisTools({ store }).invoke(summaryRequest('fixture:session:a'));
  assert.equal(response.status, TOOL_STATUS.UNAVAILABLE);
  assert.equal(response.reason_code, REASON_CODES.INCONSISTENT_EVIDENCE);
});

test('tool envelopes cannot add extra fields or disagree with the cited artifact', () => {
  const artifact = structuredClone(FIXTURE_ARTIFACTS['fixture:session-summary:a']);
  const okResponse = tools().invoke(summaryRequest());
  assert.equal(validateToolResponse({ ...okResponse, extra_injected: true }).ok, false);
  assert.equal(validateResponseAgreesWithArtifact({
    ...okResponse,
    protocol_version: 'fixture-protocol/0.2',
    metrics: [{ metric_id: 'reaction_time_median_ms', value: 999, unit: 'ms', n: 12 }],
  }, artifact).reason_code, REASON_CODES.INCONSISTENT_EVIDENCE);
});

test('comparison metrics cannot name a session outside provenance', () => {
  const tampered = structuredClone(FIXTURE_ARTIFACTS['fixture:session-compare:a-b:reaction_time_median_ms']);
  tampered.payload.metrics[0].session_ref = 'fixture:session:other-protocol';
  const checked = validateEvidenceArtifact(tampered);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason_code, REASON_CODES.SESSION_MISMATCH);
});

test('exported fixture artifacts are frozen against accidental mutation', () => {
  assert.throws(() => {
    FIXTURE_ARTIFACTS['fixture:session-summary:a'].payload.metrics[0].value = 1;
  }, TypeError);
  assert.equal(FIXTURE_ARTIFACTS['fixture:session-summary:a'].payload.metrics[0].value, 320);
});

test('diagnostic claim language is rejected by the answer validator', () => {
  const artifact = structuredClone(FIXTURE_ARTIFACTS['fixture:session-summary:a']);
  const checked = validateAgentAnswer({
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'This is a diagnostic conclusion from the fixture.',
      metric_id: 'reaction_time_median_ms',
      value: 320,
      unit: 'ms',
      artifact_refs: ['fixture:session-summary:a'],
    }],
    limitations: ['Synthetic fixture; not a fatigue diagnosis and not empirical evidence.'],
  }, [artifact]);
  assert.equal(checked.reason_code, REASON_CODES.UNSUPPORTED_CLAIM);
});

test('listTools exposes only the read-only allowlist', () => {
  const listed = tools().listTools();
  assert.deepEqual(listed.map((item) => item.name), [
    TOOL_NAMES.GET_SESSION_SUMMARY,
    TOOL_NAMES.COMPARE_SESSIONS,
    TOOL_NAMES.GET_EVIDENCE,
  ]);
  assert.ok(listed.every((item) => item.read_only === true));
});
