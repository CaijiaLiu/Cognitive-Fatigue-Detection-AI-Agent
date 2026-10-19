/**
 * W1 evidence-grounded agent contract constants.
 * Synthetic fixture boundary only; not a scientific or clinical interface.
 */

export const CONTRACT_VERSION = 'agent-tools/0.1';
export const ANSWER_VERSION = 'agent-answer/0.1';
export const ARTIFACT_SCHEMA_VERSION = 'evidence-artifact/0.1';
export const ANALYSIS_VERSION = 'analysis-fixture/0.1';
export const PRODUCER_ID = 'neurolens.analysis.mock_tools';
export const PRODUCER_VERSION = '0.1.0';

export const TOOL_NAMES = Object.freeze({
  GET_SESSION_SUMMARY: 'get_session_summary',
  COMPARE_SESSIONS: 'compare_sessions',
  GET_EVIDENCE: 'get_evidence',
});

export const ALLOWED_TOOLS = Object.freeze(Object.values(TOOL_NAMES));

export const TOOL_STATUS = Object.freeze({
  OK: 'ok',
  UNAVAILABLE: 'unavailable',
  INCOMPATIBLE: 'incompatible',
  INSUFFICIENT_DATA: 'insufficient_data',
});

export const ANSWER_STATUS = Object.freeze({
  ANSWERED: 'answered',
  ABSTAINED: 'abstained',
});

export const DATA_ORIGIN = Object.freeze({
  SYNTHETIC_FIXTURE: 'synthetic_fixture',
});

export const PARTICIPANT_SCOPE = Object.freeze({
  SINGLE_PSEUDONYMOUS: 'single_pseudonymous_participant',
  TWO_PSEUDONYMOUS: 'two_pseudonymous_participants',
});

export const ARTIFACT_KIND = Object.freeze({
  SESSION_SUMMARY: 'session_summary',
  SESSION_COMPARISON: 'session_comparison',
  EVIDENCE_LOOKUP: 'evidence_lookup',
});

export const REASON_CODES = Object.freeze({
  REJECTED_REQUEST: 'rejected_request',
  UNKNOWN_SESSION: 'unknown_session',
  UNKNOWN_ARTIFACT: 'unknown_artifact',
  UNKNOWN_METRIC: 'unknown_metric',
  UNKNOWN_ANALYSIS_VERSION: 'unknown_analysis_version',
  INSUFFICIENT_DATA: 'insufficient_data',
  INCOMPATIBLE_PROTOCOL: 'incompatible_protocol',
  MISSING_EVIDENCE: 'missing_evidence',
  NUMERIC_MISMATCH: 'numeric_mismatch',
  UNSUPPORTED_CLAIM: 'unsupported_claim',
  MALFORMED_OUTPUT: 'malformed_output',
});

/**
 * Proposed metric identifiers mapped from existing collection summaries.
 * Pending Caijia review of names, units and scientific meaning.
 */
export const ALLOWED_METRICS = Object.freeze({
  reaction_time_median_ms: Object.freeze({
    unit: 'ms',
    collection_field: 'behavior_summary.median_reaction_ms',
  }),
  accuracy: Object.freeze({
    unit: 'proportion',
    collection_field: 'behavior_summary.accuracy',
  }),
  valid_trial_count: Object.freeze({
    unit: 'count',
    collection_field: 'behavior_summary.valid_trial_count',
  }),
});

export const ALLOWED_METRIC_IDS = Object.freeze(Object.keys(ALLOWED_METRICS));

export const PROTOCOL_VERSIONS = Object.freeze({
  FIXTURE_V01: 'fixture-protocol/0.1',
  FIXTURE_V02: 'fixture-protocol/0.2',
});

/** Exact-version match only unless listed here. */
export const PROTOCOL_COMPATIBILITY = Object.freeze({
  [PROTOCOL_VERSIONS.FIXTURE_V01]: Object.freeze([PROTOCOL_VERSIONS.FIXTURE_V01]),
  [PROTOCOL_VERSIONS.FIXTURE_V02]: Object.freeze([PROTOCOL_VERSIONS.FIXTURE_V02]),
});

export const UNSUPPORTED_CLAIM_TYPES = Object.freeze({
  CLINICAL_DIAGNOSIS: 'clinical_diagnosis',
  FATIGUE_SCORE: 'fatigue_score',
  ADHD_PROBABILITY: 'adhd_probability',
  MEDICAL_CONCLUSION: 'medical_conclusion',
});

export const REF_PATTERN = /^[a-z][a-z0-9-]*:(?:[a-z0-9._-]+(?::[a-z0-9._-]+)*)$/;
export const VERSION_PATTERN = /^[a-z][a-z0-9._-]*\/[0-9]+\.[0-9]+$/;
export const METRIC_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export const MAX_SESSION_REFS = 8;
export const MAX_CLAIMS = 16;
export const MAX_LIMITATIONS = 16;
export const MAX_REASON_CODES = 16;
export const MAX_STRING = 240;
export const MAX_REF = 120;
