export const RUNTIME_VERSION = 'agent-runtime/0.1';
export const AUDIT_VERSION = 'agent-runtime-audit/0.1';
export const DEFAULT_TIMEOUT_MS = 2000;
export const DEFAULT_PROVIDER_ID = 'mock';
export const DEFAULT_MODEL = 'mock-scripted/0.1';
export const RUNTIME_LIMIT = 'Runtime-validated output; not a fatigue diagnosis and not scientifically validated.';

export const FAILURE_CLASS = Object.freeze({
  NONE: 'none',
  REQUEST: 'request',
  EVIDENCE: 'evidence',
  PROVIDER: 'provider',
  VALIDATION: 'validation',
});

export const EVIDENCE_REASON_CODES = Object.freeze([
  'insufficient_data',
  'missing_evidence',
  'incompatible_protocol',
  'unknown_session',
  'unknown_artifact',
  'unknown_metric',
  'unknown_analysis_version',
  'inconsistent_evidence',
  'unsupported_schema',
  'unsupported_claim',
  'rejected_request',
]);
