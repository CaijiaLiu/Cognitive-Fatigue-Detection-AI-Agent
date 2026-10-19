import { ANSWER_VERSION, REASON_CODES } from '../agent/constants.mjs';
import { isPlainObject, validateAgentAnswer } from '../agent/validate.mjs';
import { EVAL_LIMIT, REPORT_VERSION } from './constants.mjs';
import { getEvalCase, listEvalCases } from './cases.mjs';
import { buildPromptPackage } from './prompt.mjs';

function check(name, passed, detail) {
  return detail === undefined ? { name, passed } : { name, passed, detail };
}

export function parseModelResponse(raw) {
  if (isPlainObject(raw)) {
    return { ok: true, value: raw };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT, message: 'Response must be a JSON object or JSON text.' };
  }
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  try {
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      return { ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT, message: 'Parsed JSON must be an object.' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, reason_code: REASON_CODES.MALFORMED_OUTPUT, message: 'Model output is not valid JSON.' };
  }
}

function claimsMatchGold(actual, expected) {
  if (expected.status === 'abstained') {
    return actual.status === 'abstained' && actual.reason_code === expected.reason_code;
  }
  if (actual.status !== 'answered' || !Array.isArray(actual.claims) || actual.claims.length !== expected.claims.length) {
    return false;
  }
  return actual.claims.every((claim, index) => {
    const gold = expected.claims[index];
    return claim.metric_id === gold.metric_id
      && Object.is(claim.value, gold.value)
      && claim.unit === gold.unit;
  });
}

function goldAnswer(expected) {
  const answer = {
    answer_version: ANSWER_VERSION,
    status: expected.status,
    claims: structuredClone(expected.claims),
    limitations: [...expected.limitations],
  };
  if (expected.reason_code) answer.reason_code = expected.reason_code;
  return answer;
}

export function evaluateAnswer(pkg, rawResponse, options = {}) {
  const evaluated_at = options.now ?? new Date().toISOString();
  const artifacts = [...(pkg.artifacts ?? []), ...(pkg.extra_artifacts ?? [])];
  const parsed = parseModelResponse(rawResponse);
  const checks = [check('json_parse', parsed.ok, parsed.ok ? undefined : parsed.message)];

  const validator = parsed.ok
    ? validateAgentAnswer(parsed.value, artifacts, pkg.validation ?? {})
    : { ok: false, reason_code: parsed.reason_code, message: parsed.message };

  checks.push(check('answer_schema', Boolean(validator.ok), validator.ok ? undefined : validator.message));

  const actual = parsed.ok ? parsed.value : null;
  const expected = pkg.expected;
  const statusPass = Boolean(actual && actual.status === expected.status);
  checks.push(check('expected_status', statusPass, statusPass ? undefined : `expected ${expected.status}`));

  const reasonNeeded = expected.status === 'abstained';
  const reasonPass = !reasonNeeded || Boolean(actual && actual.reason_code === expected.reason_code);
  checks.push(check('expected_reason', reasonPass, reasonPass ? undefined : `expected ${expected.reason_code}`));

  const numericPass = Boolean(actual && claimsMatchGold(actual, expected));
  checks.push(check('numeric_fidelity', numericPass, numericPass ? undefined : 'Claim values do not match the gold fixture answer.'));

  const citationFail = actual?.status === 'answered' && validator.reason_code === REASON_CODES.SESSION_MISMATCH;
  checks.push(check('citation_binding', !citationFail, citationFail ? validator.message : undefined));

  return {
    report_version: REPORT_VERSION,
    case_id: pkg.case_id,
    category: pkg.category,
    prompt_version: pkg.prompt_version,
    evaluated_at,
    model_source: options.model_source ?? 'manual_chatgpt',
    result: checks.every((item) => item.passed) ? 'pass' : 'fail',
    checks,
    validator: {
      ok: Boolean(validator.ok),
      reason_code: validator.reason_code,
      message: validator.message,
    },
    parsed_answer: actual,
    limitations: [
      EVAL_LIMIT,
      'LLM output is untrusted until this report marks pass.',
      'Fixture numbers cannot establish empirical performance.',
    ],
  };
}

export function evaluateCase(caseId, rawResponse, options = {}) {
  const caseDef = getEvalCase(caseId);
  if (!caseDef) {
    throw new Error(`Unknown evaluation case: ${caseId}`);
  }
  return evaluateAnswer(buildPromptPackage(caseDef, options), rawResponse, options);
}

export function selfCheckCase(caseDef, options = {}) {
  const pkg = buildPromptPackage(caseDef, options);
  const gold = evaluateAnswer(pkg, goldAnswer(pkg.expected), { ...options, model_source: 'synthetic_gold' });
  const failures = (pkg.sample_failures ?? []).map((sample) => {
    const report = evaluateAnswer(pkg, sample.answer, { ...options, model_source: 'synthetic_failure' });
    const caught = report.result === 'fail' && (
      report.validator.reason_code === sample.expect_reason
      || report.checks.some((item) => !item.passed && ['numeric_fidelity', 'citation_binding', 'answer_schema'].includes(item.name))
    );
    return { id: sample.id, expect_reason: sample.expect_reason, report, caught };
  });
  return {
    case_id: caseDef.id,
    gold_passes: gold.result === 'pass',
    gold,
    failures,
    failures_caught: failures.every((item) => item.caught),
  };
}

export function selfCheckAll(options = {}) {
  return listEvalCases().map((item) => selfCheckCase(getEvalCase(item.id), options));
}
