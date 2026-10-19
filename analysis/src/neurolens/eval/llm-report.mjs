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

export function computeLlmEvalMetrics(rows) {
  const attempted = rows.filter((row) => row.actual);
  const grounded = attempted.filter((row) => row.group === 'A_valid_grounded' || row.id === 'llm-correct-citation');
  const abstentionCases = attempted.filter((row) => row.expected.abstention_correct);
  const numericCases = attempted.filter((row) => row.scores.numeric_fidelity !== null);
  const citationCases = attempted.filter((row) => row.expected.citation_correct !== null);
  const providerInvoked = attempted.filter((row) => row.actual.provider_invoked);
  return {
    valid_grounded_answer_rate: rate(
      grounded.filter((row) => row.actual.answer_status === 'answered' && row.scores.e2e_match).length,
      grounded.length,
      'Answered+validated among planned grounded cases. Skipped/not-run cases are omitted.',
    ),
    correct_abstention_rate: rate(
      abstentionCases.filter((row) => row.scores.abstention_correct).length,
      abstentionCases.length,
      'Empty-claim abstentions among cases that expect abstention.',
    ),
    numeric_fidelity_rate: rate(
      numericCases.filter((row) => row.scores.numeric_fidelity).length,
      numericCases.length,
      'Cases that did not return an unvalidated fabricated number.',
    ),
    citation_accuracy_rate: rate(
      citationCases.filter((row) => row.scores.citation_correct).length,
      citationCases.length,
      'Correct citations on grounded answers, or rejected wrong/missing citations.',
    ),
    end_to_end_validated_success_rate: rate(
      attempted.filter((row) => row.scores.e2e_match).length,
      attempted.length,
      'Attempted cases whose status, failure class, and provider-invoked flag match the fixture expectation.',
    ),
    provider_error_rate: rate(
      attempted.filter((row) => row.error_category === 'provider_error').length,
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
      attempted: cases.length,
      skipped: Math.max(0, planned - cases.length),
      provider_invocations: providerInvocations,
      provider_errors: providerErrors,
    },
    metrics: computeLlmEvalMetrics(cases),
    estimated_cost_usd,
    cases,
    limitations: Object.freeze([
      LLM_EVAL_LIMIT,
      'Validator rejection is not evidence that the model itself behaved correctly.',
      'Mock scripted rows measure runtime/validator fail-closed behavior, not live LLM quality.',
    ]),
  });
}
