/**
 * Deterministic adversarial fixtures for agent-answer/0.1 validation.
 * These test the existing validator and prompt builder. They are not LLM jailbreak tests.
 */
import { ANSWER_VERSION, REASON_CODES } from '../agent/constants.mjs';
import { ADVERSARIAL_CATEGORIES, INJECTION_PAYLOAD } from './constants.mjs';

const LIMIT = 'Synthetic fixture; not a fatigue diagnosis and not empirical evidence.';
const SUMMARY_A = 'fixture:session-summary:a';
const SUMMARY_B = 'fixture:session-summary:b';
const COMPARE_RT = 'fixture:session-compare:a-b:reaction_time_median_ms';
const UNKNOWN_REF = 'fixture:session-summary:does-not-exist';

export function answeredClaim(overrides = {}) {
  return {
    text: overrides.text ?? 'The fixture reaction_time_median_ms is 320 ms.',
    metric_id: overrides.metric_id ?? 'reaction_time_median_ms',
    value: Object.hasOwn(overrides, 'value') ? overrides.value : 320,
    unit: overrides.unit ?? 'ms',
    artifact_refs: overrides.artifact_refs ?? [SUMMARY_A],
  };
}

export function answered(overrides = {}) {
  const answer = {
    answer_version: overrides.answer_version ?? ANSWER_VERSION,
    status: overrides.status ?? 'answered',
    claims: Object.hasOwn(overrides, 'claims') ? overrides.claims : [answeredClaim(overrides.claim ?? {})],
    limitations: overrides.limitations ?? [LIMIT],
  };
  if (Object.hasOwn(overrides, 'reason_code')) answer.reason_code = overrides.reason_code;
  if (overrides.extra) Object.assign(answer, overrides.extra);
  return answer;
}

export function abstained(reason_code = REASON_CODES.INSUFFICIENT_DATA) {
  return {
    answer_version: ANSWER_VERSION,
    status: 'abstained',
    claims: [],
    reason_code,
    limitations: [LIMIT],
  };
}

function rejectCase(spec) {
  return Object.freeze({
    kind: 'reject_answer',
    eval_case: spec.eval_case ?? 'valid-metric-rt',
    extra_eval_case: spec.extra_eval_case,
    ...spec,
  });
}

function goldCase(spec) {
  return Object.freeze({
    kind: 'accept_gold',
    ...spec,
  });
}

export const UNKNOWN_ARTIFACT_CASE = Object.freeze({
  id: 'adversarial-unknown-artifact',
  category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
  title: 'Lookup an artifact that is not in the catalog',
  question: 'What metrics are stored in fixture:session-summary:does-not-exist?',
  intent: {
    kind: 'lookup_artifact',
    artifact_ref: UNKNOWN_REF,
  },
  validation: { expectedSessionRefs: [], coverage: 'any' },
});

export const ADVERSARIAL_CASES = Object.freeze([
  rejectCase({
    id: 'numeric-fabricated-value',
    category: ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
    title: 'Fabricated numeric value is rejected',
    answer: answered({ claim: { value: 999, text: 'The fixture reaction_time_median_ms is 999 ms.' } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.NUMERIC_MISMATCH },
  }),
  rejectCase({
    id: 'numeric-incorrect-unit',
    category: ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
    title: 'Correct value with the wrong unit is rejected',
    answer: answered({ claim: { unit: 'seconds', text: 'The fixture reaction_time_median_ms is 320 seconds.' } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.NUMERIC_MISMATCH },
  }),
  rejectCase({
    id: 'numeric-unsupported-metric',
    category: ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
    title: 'Unsupported metric_id is rejected',
    answer: answered({
      claim: {
        text: 'The fixture blink_count is 4 count.',
        metric_id: 'blink_count',
        value: 4,
        unit: 'count',
      },
    }),
    expect: { validator_ok: false, reason_code: REASON_CODES.UNKNOWN_METRIC },
  }),
  rejectCase({
    id: 'numeric-string-value',
    category: ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
    title: 'Numeric string instead of a number is rejected',
    answer: answered({ claim: { value: '320', text: 'The fixture reaction_time_median_ms is 320 ms.' } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.NUMERIC_MISMATCH },
  }),
  rejectCase({
    id: 'numeric-missing-value-field',
    category: ADVERSARIAL_CATEGORIES.NUMERIC_INTEGRITY,
    title: 'Claim missing the value field is rejected',
    answer: answered({
      claims: [{
        text: 'The fixture reaction_time_median_ms is 320 ms.',
        metric_id: 'reaction_time_median_ms',
        unit: 'ms',
        artifact_refs: [SUMMARY_A],
      }],
    }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT },
  }),
  rejectCase({
    id: 'provenance-cross-session',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_PROVENANCE,
    title: 'Citation of another session artifact is rejected',
    extra_eval_case: 'incorrect-citation',
    answer: answered({
      claim: {
        text: 'The fixture reaction_time_median_ms is 348 ms.',
        value: 348,
        artifact_refs: [SUMMARY_B],
      },
    }),
    expect: { validator_ok: false, reason_code: REASON_CODES.SESSION_MISMATCH },
  }),
  rejectCase({
    id: 'provenance-unknown-artifact',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_PROVENANCE,
    title: 'Unknown artifact_ref is rejected',
    answer: answered({ claim: { artifact_refs: [UNKNOWN_REF] } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
  }),
  rejectCase({
    id: 'provenance-wrong-metric-on-valid-artifact',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_PROVENANCE,
    title: 'Valid comparison artifact cannot support a different metric',
    eval_case: 'valid-comparison-rt',
    answer: answered({
      claims: [{
        text: 'The fixture accuracy is 0.75 proportion.',
        metric_id: 'accuracy',
        value: 0.75,
        unit: 'proportion',
        artifact_refs: [COMPARE_RT],
      }],
    }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
  }),
  rejectCase({
    id: 'provenance-missing-citations',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_PROVENANCE,
    title: 'Empty artifact_refs are rejected',
    answer: answered({ claim: { artifact_refs: [] } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
  }),
  rejectCase({
    id: 'provenance-conflicting-session-refs',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_PROVENANCE,
    title: 'Citing A and B for a single-session question is rejected',
    extra_eval_case: 'incorrect-citation',
    answer: answered({ claim: { artifact_refs: [SUMMARY_A, SUMMARY_B] } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.SESSION_MISMATCH },
  }),
  goldCase({
    id: 'quality-unusable-session',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'Unusable low-quality session gold abstains',
    eval_case: 'missing-evidence-low-quality',
    expect: {
      validator_ok: true,
      status: 'abstained',
      reason_code: REASON_CODES.INSUFFICIENT_DATA,
    },
  }),
  rejectCase({
    id: 'quality-unusable-session-numeric-claim',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'A numeric claim against unusable evidence is rejected',
    eval_case: 'missing-evidence-low-quality',
    answer: answered(),
    expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
  }),
  goldCase({
    id: 'quality-incompatible-protocols',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'Incompatible protocol comparison gold abstains',
    eval_case: 'incompatible-protocols',
    expect: {
      validator_ok: true,
      status: 'abstained',
      reason_code: REASON_CODES.INCOMPATIBLE_PROTOCOL,
    },
  }),
  rejectCase({
    id: 'quality-incompatible-protocols-numeric-claim',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'A comparison claim is not authorized when protocols are incompatible',
    eval_case: 'incompatible-protocols',
    extra_eval_case: 'valid-metric-rt',
    answer: answered(),
    expect: { validator_ok: false, reason_code: REASON_CODES.SESSION_MISMATCH },
  }),
  goldCase({
    id: 'quality-missing-artifact',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'Unknown artifact lookup gold abstains',
    eval_case: UNKNOWN_ARTIFACT_CASE,
    expect: {
      validator_ok: true,
      status: 'abstained',
      reason_code: REASON_CODES.UNKNOWN_ARTIFACT,
    },
  }),
  goldCase({
    id: 'quality-unsupported-comparison-request',
    category: ADVERSARIAL_CATEGORIES.EVIDENCE_QUALITY,
    title: 'Unsupported medical comparison request gold abstains',
    eval_case: 'unsupported-medical-claim',
    expect: {
      validator_ok: true,
      status: 'abstained',
      reason_code: REASON_CODES.UNSUPPORTED_CLAIM,
    },
  }),
  Object.freeze({
    id: 'injection-untrusted-evidence-boundary',
    kind: 'prompt_boundary',
    category: ADVERSARIAL_CATEGORIES.PROMPT_INJECTION,
    title: 'Injected evidence stays in the untrusted evidence section',
    eval_case: 'valid-metric-rt',
    injection: INJECTION_PAYLOAD,
    diagnosis_answer: answered({
      claim: {
        text: 'This participant has ADHD and a fatigue score of 9.',
        metric_id: 'reaction_time_median_ms',
        value: 320,
      },
    }),
    expect: {
      validator_ok: false,
      reason_code: REASON_CODES.UNSUPPORTED_CLAIM,
    },
  }),
  rejectCase({
    id: 'schema-malformed-json',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Malformed JSON is rejected',
    answer: '{status:answered',
    expect: { validator_ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT },
  }),
  rejectCase({
    id: 'schema-extra-fields',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Extra unsupported answer fields are rejected',
    answer: answered({ extra: { diagnosis: true } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT },
  }),
  rejectCase({
    id: 'schema-answered-with-reason-code',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Answered status cannot carry reason_code',
    answer: answered({ reason_code: REASON_CODES.INSUFFICIENT_DATA }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT },
  }),
  rejectCase({
    id: 'schema-abstained-with-claims',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Abstained answers cannot include claims',
    answer: {
      answer_version: ANSWER_VERSION,
      status: 'abstained',
      reason_code: REASON_CODES.INSUFFICIENT_DATA,
      claims: [answeredClaim()],
      limitations: [LIMIT],
    },
    expect: { validator_ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT },
  }),
  rejectCase({
    id: 'schema-invalid-artifact-ref-type',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Non-opaque artifact_refs are rejected',
    answer: answered({ claim: { artifact_refs: ['https://example.test/artifact'] } }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
  }),
  rejectCase({
    id: 'schema-empty-claims',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Answered output with empty claims is rejected',
    answer: answered({ claims: [] }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MISSING_EVIDENCE },
  }),
  rejectCase({
    id: 'schema-malformed-claim-object',
    category: ADVERSARIAL_CATEGORIES.SCHEMA_PARSING,
    title: 'Non-object claims are rejected',
    answer: answered({ claims: ['320 ms'] }),
    expect: { validator_ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT },
  }),
]);

export function listAdversarialCases() {
  return ADVERSARIAL_CASES.map((item) => ({
    id: item.id,
    category: item.category,
    kind: item.kind,
    title: item.title,
  }));
}

export function getAdversarialCase(caseId) {
  return ADVERSARIAL_CASES.find((item) => item.id === caseId) ?? null;
}
