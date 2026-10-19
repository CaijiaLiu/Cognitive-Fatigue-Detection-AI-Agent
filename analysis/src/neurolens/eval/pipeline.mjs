/**
 * Offline W1.6 pipeline: V1 export → adapter → tools → prompt → validator → report.
 * No LLM API, no network, no production D1. Synthetic fixtures only.
 */
import { createAnalysisTools } from '../agent/tools.mjs';
import { composeAnswer } from '../agent/answer.mjs';
import {
  ANSWER_VERSION,
  EXPORT_ANALYSIS_VERSION,
  EXPORT_LIMIT,
} from '../agent/constants.mjs';
import { createExportStore, validateExport } from '../adapter/index.mjs';
import { CASE_CATEGORIES } from './constants.mjs';
import { evaluateAnswer } from './harness.mjs';
import { buildPromptPackage } from './prompt.mjs';

export const PIPELINE_ID = 'offline-export-eval/0.1';

export function exportSessionRef(sessionId) {
  return `export:session:${sessionId}`;
}

export function exportSummaryRef(sessionId) {
  return `export:session-summary:${sessionId}`;
}

export function validateExportDocuments(input) {
  const documents = Array.isArray(input) ? input : [input];
  return documents.map((document) => validateExport(document));
}

export function createExportPipelineTools(input) {
  const store = createExportStore(input);
  return {
    store,
    tools: createAnalysisTools({ store }),
    validations: validateExportDocuments(input),
  };
}

function exportCase(spec) {
  return Object.freeze({
    ...spec,
    intent: spec.intent
      ? Object.freeze({
        ...spec.intent,
        analysis_version: spec.intent.analysis_version ?? EXPORT_ANALYSIS_VERSION,
      })
      : spec.intent,
    extra_limitations: Object.freeze([
      EXPORT_LIMIT,
      'Session-export numbers are an engineering copy pending scientific review.',
      ...(spec.extra_limitations ?? []),
    ]),
  });
}

export function exportMetricCase(sessionId, extras = {}) {
  return exportCase({
    id: extras.id ?? 'export-valid-metric-rt',
    category: extras.category ?? CASE_CATEGORIES.VALID_METRIC,
    title: extras.title ?? 'Copy median reaction time from a validated V1 export',
    question: extras.question ?? 'What is the median reaction time for the exported camera session?',
    intent: {
      kind: 'report_metric',
      session_ref: exportSessionRef(sessionId),
      metric_id: extras.metric_id ?? 'reaction_time_median_ms',
    },
    validation: {
      expectedSessionRefs: [exportSessionRef(sessionId)],
      coverage: 'any',
    },
    extra_evidence_refs: extras.extra_evidence_refs,
    sample_failures: extras.sample_failures,
  });
}

export function exportCompareCase(leftId, rightId, extras = {}) {
  return exportCase({
    id: extras.id ?? 'export-valid-comparison-rt',
    category: extras.category ?? CASE_CATEGORIES.VALID_COMPARISON,
    title: extras.title ?? 'Compare median reaction time across two V1 exports',
    question: extras.question ?? 'Compare the median reaction time of the two exported camera sessions. Report each session value; do not invent a delta.',
    intent: {
      kind: 'compare_metric',
      session_refs: [exportSessionRef(leftId), exportSessionRef(rightId)],
      metric_id: extras.metric_id ?? 'reaction_time_median_ms',
    },
    validation: {
      expectedSessionRefs: [exportSessionRef(leftId), exportSessionRef(rightId)],
      coverage: 'all',
    },
  });
}

export function groundedAnswer(pkg, overrides = {}) {
  const claimOverrides = overrides.claims;
  const answer = {
    answer_version: ANSWER_VERSION,
    status: pkg.expected.status,
    claims: claimOverrides
      ? structuredClone(claimOverrides)
      : structuredClone(pkg.expected.claims),
    limitations: [...(overrides.limitations ?? pkg.expected.limitations)],
  };
  if (pkg.expected.reason_code) answer.reason_code = pkg.expected.reason_code;
  if (overrides.reason_code) answer.reason_code = overrides.reason_code;
  if (overrides.status) answer.status = overrides.status;
  return answer;
}

/**
 * Run the complete offline pipeline for one case definition.
 * `response` is optional: omitted responses are scored against composeAnswer gold.
 */
export function runOfflinePipeline({
  exportInput,
  caseDef,
  response,
  now,
  model_source = 'synthetic_pipeline',
} = {}) {
  if (!caseDef || typeof caseDef !== 'object' || !caseDef.id) {
    throw new Error('Pipeline case definition is required.');
  }
  const { store, tools, validations } = createExportPipelineTools(exportInput);
  const pkg = buildPromptPackage(caseDef, { tools });
  const raw = response === undefined
    ? composeAnswer(caseDef.intent, tools)
    : response;
  const report = evaluateAnswer(pkg, raw, {
    now,
    model_source: response === undefined ? 'synthetic_gold' : model_source,
  });
  return {
    pipeline_id: PIPELINE_ID,
    store,
    tools,
    validations,
    package: pkg,
    report,
  };
}
