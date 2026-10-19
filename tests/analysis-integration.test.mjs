import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANSWER_VERSION,
  DATA_ORIGIN,
  EXPORT_ANALYSIS_VERSION,
  REASON_CODES,
  TOOL_NAMES,
  TOOL_STATUS,
} from '../analysis/src/neurolens/agent/constants.mjs';
import { composeAnswer } from '../analysis/src/neurolens/agent/answer.mjs';
import {
  CASE_CATEGORIES,
  PIPELINE_ID,
  REQUIRED_PROMPT_SECTIONS,
  evaluateAnswer,
  exportCompareCase,
  exportMetricCase,
  exportSessionRef,
  exportSummaryRef,
  getEvalCase,
  groundedAnswer,
  runOfflinePipeline,
  selfCheckAll,
} from '../analysis/src/neurolens/eval/index.mjs';
import { EXPECTED_A, IDS } from '../analysis/fixtures/exports/synthetic.mjs';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../analysis/fixtures/exports');
const NOW = '2026-10-19T04:00:00.000Z';
const EXPORT_LIMIT = 'Session-export copy; not a fatigue diagnosis and not scientifically validated.';

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
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

function cameraACase(extras = {}) {
  return exportMetricCase(IDS.cameraA, extras);
}

test('Test A — valid V1 export travels through the offline pipeline', () => {
  withoutNetwork((fetchCalls) => {
    const exportInput = loadFixture('camera-behavior-a.json');
    const caseDef = cameraACase();
    const pipeline = runOfflinePipeline({
      exportInput,
      caseDef,
      now: NOW,
    });

    assert.equal(pipeline.pipeline_id, PIPELINE_ID);
    assert.equal(pipeline.validations.length, 1);
    assert.equal(pipeline.validations[0].ok, true);
    assert.equal(pipeline.validations[0].value.kind, 'session');
    assert.equal(pipeline.validations[0].value.sessions[0].config.protocol, 'go-no-go-v1');
    assert.equal(pipeline.tools.analysis_version, EXPORT_ANALYSIS_VERSION);

    const sessionRef = exportSessionRef(IDS.cameraA);
    const summary = pipeline.tools.invoke({
      tool: TOOL_NAMES.GET_SESSION_SUMMARY,
      session_ref: sessionRef,
      analysis_version: EXPORT_ANALYSIS_VERSION,
    });
    assert.equal(summary.status, TOOL_STATUS.OK);
    assert.equal(summary.data_origin, DATA_ORIGIN.SESSION_EXPORT);
    assert.equal(summary.artifact_ref, exportSummaryRef(IDS.cameraA));
    assert.deepEqual(summary.metrics.find((item) => item.metric_id === 'reaction_time_median_ms'), {
      metric_id: 'reaction_time_median_ms',
      value: EXPECTED_A.reaction_time_median_ms,
      unit: 'ms',
      n: EXPECTED_A.n_rt,
    });

    const artifact = pipeline.tools.inspectArtifact(summary.artifact_ref);
    assert.ok(artifact);
    assert.equal(artifact.provenance.immutable, true);
    assert.equal(artifact.provenance.computation, 'deterministic_export_normalization');
    assert.equal(artifact.payload.collection_schema_version, '1.0.0');
    assert.equal(artifact.payload.source_protocol, 'go-no-go-v1');

    const evidence = pipeline.tools.invoke({
      tool: TOOL_NAMES.GET_EVIDENCE,
      artifact_ref: summary.artifact_ref,
    });
    assert.equal(evidence.status, TOOL_STATUS.OK);
    assert.deepEqual(evidence.metrics, summary.metrics);

    const pkg = pipeline.package;
    for (const key of REQUIRED_PROMPT_SECTIONS) {
      assert.ok(pkg.sections[key], `missing prompt section ${key}`);
    }
    assert.match(pkg.user_prompt, /median reaction time/i);
    assert.match(pkg.user_prompt, new RegExp(String(EXPECTED_A.reaction_time_median_ms)));
    assert.match(pkg.user_prompt, new RegExp(exportSummaryRef(IDS.cameraA)));
    assert.match(pkg.user_prompt, /analysis-export\/0\.1/);
    assert.match(pkg.user_prompt, /No ADHD diagnosis, fatigue score, or medical conclusion is permitted/);

    assert.equal(pipeline.report.result, 'pass');
    assert.equal(pipeline.report.validator.ok, true);
    assert.equal(pipeline.report.parsed_answer.status, 'answered');
    assert.equal(pipeline.report.parsed_answer.claims[0].value, EXPECTED_A.reaction_time_median_ms);
    assert.equal(pipeline.report.parsed_answer.claims[0].unit, 'ms');
    assert.deepEqual(pipeline.report.parsed_answer.claims[0].artifact_refs, [summary.artifact_ref]);
    assert.equal(fetchCalls(), 0);
  });
});

test('Test B — altered numeric value is rejected as numeric_mismatch', () => {
  const pipeline = runOfflinePipeline({
    exportInput: loadFixture('camera-behavior-a.json'),
    caseDef: cameraACase({ id: 'export-fabricated-value', category: CASE_CATEGORIES.FABRICATED_VALUE }),
    now: NOW,
  });
  const drifted = groundedAnswer(pipeline.package, {
    claims: [{
      text: `The export reaction_time_median_ms is 999 ms.`,
      metric_id: 'reaction_time_median_ms',
      value: 999,
      unit: 'ms',
      artifact_refs: [exportSummaryRef(IDS.cameraA)],
    }],
  });
  const report = evaluateAnswer(pipeline.package, drifted, { now: NOW, model_source: 'synthetic_failure' });
  assert.equal(report.result, 'fail');
  assert.equal(report.validator.ok, false);
  assert.equal(report.validator.reason_code, REASON_CODES.NUMERIC_MISMATCH);
  assert.equal(report.checks.find((item) => item.name === 'answer_schema').passed, false);
});

test('Test C — citation of another session artifact is rejected as session_mismatch', () => {
  const pipeline = runOfflinePipeline({
    exportInput: loadFixture('camera-bundle.json'),
    caseDef: cameraACase({
      id: 'export-incorrect-citation',
      category: CASE_CATEGORIES.INCORRECT_CITATION,
      extra_evidence_refs: [exportSummaryRef(IDS.cameraB)],
    }),
    now: NOW,
  });
  const other = pipeline.tools.inspectArtifact(exportSummaryRef(IDS.cameraB));
  assert.ok(other);
  const stolen = groundedAnswer(pipeline.package, {
    claims: [{
      text: `The export reaction_time_median_ms is ${other.payload.metrics.find((item) => item.metric_id === 'reaction_time_median_ms').value} ms.`,
      metric_id: 'reaction_time_median_ms',
      value: other.payload.metrics.find((item) => item.metric_id === 'reaction_time_median_ms').value,
      unit: 'ms',
      artifact_refs: [exportSummaryRef(IDS.cameraB)],
    }],
  });
  const report = evaluateAnswer(pipeline.package, stolen, { now: NOW, model_source: 'synthetic_failure' });
  assert.equal(report.result, 'fail');
  assert.equal(report.validator.ok, false);
  assert.equal(report.validator.reason_code, REASON_CODES.SESSION_MISMATCH);
  assert.equal(report.checks.find((item) => item.name === 'citation_binding').passed, false);
});

test('Test D — missing required metrics do not produce unsupported numeric claims', () => {
  const caseDef = exportMetricCase(IDS.missingRt, {
    id: 'export-missing-rt',
    category: CASE_CATEGORIES.MISSING_EVIDENCE,
    title: 'Abstain when the export has no usable reaction times',
    question: 'What is the median reaction time for the missing-RT export?',
  });
  const pipeline = runOfflinePipeline({
    exportInput: loadFixture('missing-rt.json'),
    caseDef,
    now: NOW,
  });

  assert.equal(pipeline.validations[0].ok, true);
  const summary = pipeline.tools.invoke({
    tool: TOOL_NAMES.GET_SESSION_SUMMARY,
    session_ref: exportSessionRef(IDS.missingRt),
    analysis_version: EXPORT_ANALYSIS_VERSION,
  });
  assert.equal(summary.status, TOOL_STATUS.INSUFFICIENT_DATA);
  assert.deepEqual(summary.metrics, []);
  assert.equal(summary.artifact_ref, undefined);
  assert.equal(pipeline.tools.inspectArtifact(exportSummaryRef(IDS.missingRt)), null);

  assert.equal(pipeline.report.result, 'pass');
  assert.equal(pipeline.report.parsed_answer.status, 'abstained');
  assert.equal(pipeline.report.parsed_answer.reason_code, REASON_CODES.INSUFFICIENT_DATA);
  assert.deepEqual(pipeline.report.parsed_answer.claims, []);
  assert.equal(pipeline.report.parsed_answer.status, 'abstained');
  assert.match(JSON.stringify(pipeline.report.parsed_answer.limitations), /not a fatigue diagnosis/i);

  const fabricated = {
    answer_version: ANSWER_VERSION,
    status: 'answered',
    claims: [{
      text: 'The export reaction_time_median_ms is 320 ms.',
      metric_id: 'reaction_time_median_ms',
      value: 320,
      unit: 'ms',
      artifact_refs: [exportSummaryRef(IDS.missingRt)],
    }],
    limitations: [EXPORT_LIMIT],
  };
  const rejected = evaluateAnswer(pipeline.package, fabricated, { now: NOW, model_source: 'synthetic_failure' });
  assert.equal(rejected.result, 'fail');
  assert.equal(rejected.validator.ok, false);
  assert.ok([
    REASON_CODES.MISSING_EVIDENCE,
    REASON_CODES.UNKNOWN_ARTIFACT,
    REASON_CODES.NUMERIC_MISMATCH,
  ].includes(rejected.validator.reason_code));
});

test('Test E — incompatible session protocols are not compared', () => {
  const caseDef = exportCompareCase(IDS.cameraA, IDS.otherProtocol, {
    id: 'export-incompatible-protocols',
    category: CASE_CATEGORIES.INCOMPATIBLE_PROTOCOL,
    title: 'Abstain when a V1 export is compared with an unsupported protocol',
    question: 'Compare median reaction time between the camera export and the other-protocol export.',
  });
  const pipeline = runOfflinePipeline({
    exportInput: [loadFixture('camera-behavior-a.json'), loadFixture('other-protocol.json')],
    caseDef,
    now: NOW,
  });

  const compared = pipeline.tools.invoke({
    tool: TOOL_NAMES.COMPARE_SESSIONS,
    session_refs: [exportSessionRef(IDS.cameraA), exportSessionRef(IDS.otherProtocol)],
    metric_id: 'reaction_time_median_ms',
    analysis_version: EXPORT_ANALYSIS_VERSION,
  });
  assert.equal(compared.status, TOOL_STATUS.INCOMPATIBLE);
  assert.equal(compared.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  assert.deepEqual(compared.metrics, []);

  const gold = composeAnswer(caseDef.intent, pipeline.tools);
  assert.equal(gold.status, 'abstained');
  assert.equal(gold.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
  assert.deepEqual(gold.claims, []);
  assert.equal(pipeline.report.result, 'pass');
  assert.equal(pipeline.report.parsed_answer.status, 'abstained');
  assert.equal(pipeline.report.parsed_answer.reason_code, REASON_CODES.INCOMPATIBLE_PROTOCOL);
});

test('Test F — existing evaluation cases continue to pass or fail as designed', () => {
  withoutNetwork((fetchCalls) => {
    const rows = selfCheckAll({ now: NOW });
    const expected = [
      'valid-metric-rt',
      'valid-comparison-rt',
      'missing-evidence-low-quality',
      'incompatible-protocols',
      'unsupported-medical-claim',
      'fabricated-value',
      'incorrect-citation',
    ];
    assert.deepEqual(rows.map((row) => row.case_id), expected);
    for (const row of rows) {
      assert.equal(row.gold_passes, true, row.case_id);
      assert.equal(row.failures_caught, true, row.case_id);
    }

    const fabricated = getEvalCase('fabricated-value');
    const incorrect = getEvalCase('incorrect-citation');
    assert.equal(fabricated.sample_failures[0].expect_reason, REASON_CODES.NUMERIC_MISMATCH);
    assert.equal(incorrect.sample_failures[0].expect_reason, REASON_CODES.SESSION_MISMATCH);
    assert.equal(fetchCalls(), 0);
  });
});
