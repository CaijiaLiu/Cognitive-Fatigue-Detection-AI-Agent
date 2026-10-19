/**
 * Machine-readable LLM evaluation report.
 * Does not store prompts or raw model responses.
 */
export const LLM_EVAL_REPORT_VERSION = 'llm-eval-report/0.1';
export const LLM_EVAL_LIMIT = 'Synthetic fixture evaluation of the research-agent runtime and validator. Not scientific validity, not clinical validation, and not proof of LLM robustness.';

function rate(numerator, denominator, note) {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : Number((numerator / denominator).toFixed(4)),
    note,
  };
}

export function estimateCostUsd(usage, budget) {
  if (!budget?.pricing_configured || !usage) return null;
  const input = (usage.input_tokens ?? 0) / 1000 * budget.price_input_per_1k;
  const output = (usage.output_tokens ?? 0) / 1000 * budget.price_output_per_1k;
  return Number((input + output).toFixed(6));
}

export const CASE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIPPED: 'SKIPPED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NOT_RUN: 'NOT_RUN',
});

export function computeLlmEvalMetrics(rows) {
  const scored = rows.filter((row) => row.case_status === CASE_STATUS.PASS || row.case_status === CASE_STATUS.FAIL || row.case_status === CASE_STATUS.PROVIDER_ERROR);
  const grounded = scored.filter((row) => row.group === 'A_valid_grounded');
  const runtimeSkip = scored.filter((row) => row.expected.layer === 'runtime_fail_closed');
  const validatorAbstain = scored.filter((row) => row.expected.layer === 'validator_reject' && row.expected.abstention_correct);
  const numericCases = scored.filter((row) => row.scores.numeric_applicable);
  const citationCases = scored.filter((row) => row.scores.citation_applicable);
  const providerInvoked = scored.filter((row) => row.actual?.provider_invoked);
  return {
    valid_grounded_answer_rate: rate(
      grounded.filter((row) => row.actual?.answer_status === 'answered' && row.scores.e2e_match).length,
      grounded.length,
      'Answered+validated Group A cases only. SKIPPED/NOT_RUN omitted. llm-correct-citation is a citation row, not a second grounded success.',
    ),
    correct_runtime_skip_rate: rate(
      runtimeSkip.filter((row) => row.scores.abstention_correct && !row.actual?.provider_invoked).length,
      runtimeSkip.length,
      'Runtime/evidence fail-closed abstentions. Not a measure of model abstention quality.',
    ),
    correct_validator_abstention_rate: rate(
      validatorAbstain.filter((row) => row.scores.abstention_correct).length,
      validatorAbstain.length,
      'Empty-claim abstentions among cases that expect the validator to reject untrusted model output.',
    ),
    numeric_fidelity_rate: rate(
      numericCases.filter((row) => row.scores.numeric_fidelity).length,
      numericCases.length,
      'Applicable only when a numeric claim could have leaked (provider invoked or answered). n/a rows are omitted, not counted as successes.',
    ),
    citation_accuracy_rate: rate(
      citationCases.filter((row) => row.scores.citation_correct).length,
      citationCases.length,
      'Applicable citation cases only. Correct cite on grounded answers, or rejected wrong/missing cites.',
    ),
    end_to_end_validated_success_rate: rate(
      scored.filter((row) => row.case_status === CASE_STATUS.PASS).length,
      scored.length,
      'PASS among attempted (PASS/FAIL/PROVIDER_ERROR) rows. SKIPPED and NOT_RUN are excluded from the denominator.',
    ),
    provider_error_rate: rate(
      scored.filter((row) => row.case_status === CASE_STATUS.PROVIDER_ERROR).length,
      providerInvoked.length,
      'Provider failures among cases that invoked the provider. Zero invocations → n/a.',
    ),
  };
}

export function buildLlmEvalReport({
  run_id,
  status,
  live,
  reason,
  cases,
  planned,
  now,
  provider_id,
  model,
  budget,
  providerInvocations = 0,
  providerErrors = 0,
  estimated_cost_usd = null,
}) {
  const live_evaluation = live && (status === 'not_run' || cases.length === 0) ? 'NOT_RUN' : (live ? 'RUN' : 'NOT_RUN');
  const hasStatus = cases.some((row) => row.case_status);
  const attempted = hasStatus
    ? cases.filter((row) => (
      row.case_status === CASE_STATUS.PASS
      || row.case_status === CASE_STATUS.FAIL
      || row.case_status === CASE_STATUS.PROVIDER_ERROR
    )).length
    : cases.length;
  const skipped = hasStatus
    ? cases.filter((row) => (
      row.case_status === CASE_STATUS.SKIPPED
      || row.case_status === CASE_STATUS.NOT_RUN
    )).length
    : Math.max(0, planned - cases.length);
  const status_counts = {
    PASS: cases.filter((row) => row.case_status === CASE_STATUS.PASS).length,
    FAIL: cases.filter((row) => row.case_status === CASE_STATUS.FAIL).length,
    SKIPPED: cases.filter((row) => row.case_status === CASE_STATUS.SKIPPED).length,
    PROVIDER_ERROR: cases.filter((row) => row.case_status === CASE_STATUS.PROVIDER_ERROR).length,
    NOT_RUN: cases.filter((row) => row.case_status === CASE_STATUS.NOT_RUN).length,
  };
  return Object.freeze({
    report_version: LLM_EVAL_REPORT_VERSION,
    run_id,
    status,
    live,
    live_evaluation: live ? live_evaluation : 'NOT_RUN',
    reason: reason ?? null,
    provider_id,
    model,
    evaluated_at: now,
    limits: {
      max_cases: budget?.max_cases ?? null,
      max_requests: budget?.max_requests ?? null,
      max_cost_usd: budget?.max_cost_usd ?? null,
      pricing_configured: Boolean(budget?.pricing_configured),
    },
    counts: {
      planned,
      attempted,
      skipped,
      provider_invocations: providerInvocations,
      provider_errors: providerErrors,
      status: status_counts,
    },
    metrics: computeLlmEvalMetrics(cases),
    estimated_cost_usd,
    cases,
    limitations: Object.freeze([
      LLM_EVAL_LIMIT,
      'Validator rejection is not evidence that the model itself behaved correctly.',
      'Mock scripted rows measure runtime/validator fail-closed behavior, not live LLM quality.',
      'NEUROLENS_AGENT_MAX_COST_USD is an estimate-only stop. It is not a guaranteed spending ceiling. A request cap is not a monetary budget. Missing usage is treated as unknown cost, not zero.',
    ]),
  });
}
