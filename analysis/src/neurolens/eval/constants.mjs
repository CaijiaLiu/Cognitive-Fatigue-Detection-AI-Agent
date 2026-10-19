export const PROMPT_VERSION = 'research-agent-prompt/0.1';
export const PACKAGE_VERSION = 'agent-eval-package/0.1';
export const REPORT_VERSION = 'agent-eval-report/0.1';
export const EVAL_LIMIT = 'Manual or synthetic LLM evaluation over fixtures; not an API run and not scientific validation.';

export const CASE_CATEGORIES = Object.freeze({
  VALID_METRIC: 'valid_metric',
  VALID_COMPARISON: 'valid_comparison',
  MISSING_EVIDENCE: 'missing_evidence',
  INCOMPATIBLE_PROTOCOL: 'incompatible_protocol',
  UNSUPPORTED_CLAIM: 'unsupported_medical_claim',
  FABRICATED_VALUE: 'fabricated_value',
  INCORRECT_CITATION: 'incorrect_citation',
});

export const REQUIRED_PROMPT_SECTIONS = Object.freeze([
  'question',
  'tool_manifest',
  'validated_evidence',
  'answer_schema',
  'scientific_limitations',
]);
