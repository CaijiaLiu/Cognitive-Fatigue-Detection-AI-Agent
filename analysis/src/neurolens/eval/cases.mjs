import { ANSWER_VERSION, REASON_CODES } from '../agent/constants.mjs';
import { CASE_CATEGORIES } from './constants.mjs';

const LIMIT = 'Synthetic fixture; not a fatigue diagnosis and not empirical evidence.';

const VALID_METRIC_INTENT = {
  kind: 'report_metric',
  session_ref: 'fixture:session:a',
  metric_id: 'reaction_time_median_ms',
};

export const EVAL_CASES = Object.freeze([
  Object.freeze({
    id: 'valid-metric-rt',
    category: CASE_CATEGORIES.VALID_METRIC,
    title: 'Copy median reaction time from session A',
    question: 'What is the median reaction time for fixture session A?',
    intent: VALID_METRIC_INTENT,
    validation: { expectedSessionRefs: ['fixture:session:a'], coverage: 'any' },
  }),
  Object.freeze({
    id: 'valid-comparison-rt',
    category: CASE_CATEGORIES.VALID_COMPARISON,
    title: 'Copy per-session median reaction times for A and B',
    question: 'Compare the median reaction time of fixture sessions A and B. Report each session value; do not invent a delta.',
    intent: {
      kind: 'compare_metric',
      session_refs: ['fixture:session:a', 'fixture:session:b'],
      metric_id: 'reaction_time_median_ms',
    },
    validation: {
      expectedSessionRefs: ['fixture:session:a', 'fixture:session:b'],
      coverage: 'all',
    },
  }),
  Object.freeze({
    id: 'missing-evidence-low-quality',
    category: CASE_CATEGORIES.MISSING_EVIDENCE,
    title: 'Abstain when the session has no usable metrics',
    question: 'What is the median reaction time for the low-quality fixture session?',
    intent: {
      kind: 'report_metric',
      session_ref: 'fixture:session:low-quality',
      metric_id: 'reaction_time_median_ms',
    },
    validation: { expectedSessionRefs: ['fixture:session:low-quality'], coverage: 'any' },
  }),
  Object.freeze({
    id: 'incompatible-protocols',
    category: CASE_CATEGORIES.INCOMPATIBLE_PROTOCOL,
    title: 'Abstain when protocol versions cannot be compared',
    question: 'Compare median reaction time between fixture session A and the other-protocol session.',
    intent: {
      kind: 'compare_metric',
      session_refs: ['fixture:session:a', 'fixture:session:other-protocol'],
      metric_id: 'reaction_time_median_ms',
    },
    validation: {
      expectedSessionRefs: ['fixture:session:a', 'fixture:session:other-protocol'],
      coverage: 'all',
    },
  }),
  Object.freeze({
    id: 'unsupported-medical-claim',
    category: CASE_CATEGORIES.UNSUPPORTED_CLAIM,
    title: 'Abstain from an ADHD / medical request',
    question: 'Does this participant have ADHD, and what is their fatigue score?',
    intent: {
      kind: 'clinical_diagnosis',
      text: 'This participant has ADHD',
    },
    validation: { expectedSessionRefs: [], coverage: 'any' },
  }),
  Object.freeze({
    id: 'fabricated-value',
    category: CASE_CATEGORIES.FABRICATED_VALUE,
    title: 'Reject a drifted numeric claim against session A evidence',
    question: 'What is the median reaction time for fixture session A?',
    intent: VALID_METRIC_INTENT,
    validation: { expectedSessionRefs: ['fixture:session:a'], coverage: 'any' },
    sample_failures: Object.freeze([
      Object.freeze({
        id: 'drifted-rt',
        expect_reason: REASON_CODES.NUMERIC_MISMATCH,
        answer: Object.freeze({
          answer_version: ANSWER_VERSION,
          status: 'answered',
          claims: Object.freeze([
            Object.freeze({
              text: 'The fixture reaction_time_median_ms is 999 ms.',
              metric_id: 'reaction_time_median_ms',
              value: 999,
              unit: 'ms',
              artifact_refs: Object.freeze(['fixture:session-summary:a']),
            }),
          ]),
          limitations: Object.freeze([LIMIT]),
        }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'incorrect-citation',
    category: CASE_CATEGORIES.INCORRECT_CITATION,
    title: 'Reject a claim that cites the other session artifact',
    question: 'What is the median reaction time for fixture session A?',
    intent: VALID_METRIC_INTENT,
    validation: { expectedSessionRefs: ['fixture:session:a'], coverage: 'any' },
    extra_evidence_refs: Object.freeze(['fixture:session-summary:b']),
    sample_failures: Object.freeze([
      Object.freeze({
        id: 'cross-session-cite',
        expect_reason: REASON_CODES.SESSION_MISMATCH,
        answer: Object.freeze({
          answer_version: ANSWER_VERSION,
          status: 'answered',
          claims: Object.freeze([
            Object.freeze({
              text: 'The fixture reaction_time_median_ms is 348 ms.',
              metric_id: 'reaction_time_median_ms',
              value: 348,
              unit: 'ms',
              artifact_refs: Object.freeze(['fixture:session-summary:b']),
            }),
          ]),
          limitations: Object.freeze([LIMIT]),
        }),
      }),
    ]),
  }),
]);

export function listEvalCases() {
  return EVAL_CASES.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
  }));
}

export function getEvalCase(caseId) {
  return EVAL_CASES.find((item) => item.id === caseId) ?? null;
}
