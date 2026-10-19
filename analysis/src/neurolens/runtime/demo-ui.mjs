/**
 * Demo catalog and view-model for the Research Agent panel.
 * DOM-free so Node tests can cover loading / success / abstention / error.
 */
export const DEMO_DISCLAIMER = Object.freeze({
  synthetic: true,
  label: 'Synthetic research demonstration',
  text: 'These results use fixture sessions and a mock provider. They are not camera evidence, not a fatigue score, and not a medical diagnosis.',
});

export const DEMO_SESSIONS = Object.freeze([
  Object.freeze({
    session_ref: 'fixture:session:a',
    label: 'Fixture session A',
    note: 'Usable synthetic Go/No-Go summary',
  }),
  Object.freeze({
    session_ref: 'fixture:session:b',
    label: 'Fixture session B',
    note: 'Second usable synthetic session',
  }),
  Object.freeze({
    session_ref: 'fixture:session:low-quality',
    label: 'Low-quality fixture',
    note: 'Missing features; runtime should abstain',
  }),
  Object.freeze({
    session_ref: 'fixture:session:other-protocol',
    label: 'Other-protocol fixture',
    note: 'Incompatible protocol; comparison-only allowlist member',
  }),
]);

export const DEMO_QUESTIONS = Object.freeze([
  Object.freeze({
    id: 'rt-median',
    label: 'Median reaction time',
    metric_id: 'reaction_time_median_ms',
    question: (sessionRef) => `What is the median reaction time for ${sessionRef}?`,
  }),
  Object.freeze({
    id: 'accuracy',
    label: 'Task accuracy',
    metric_id: 'accuracy',
    question: (sessionRef) => `What is the accuracy for ${sessionRef}?`,
  }),
  Object.freeze({
    id: 'valid-trials',
    label: 'Valid trial count',
    metric_id: 'valid_trial_count',
    question: (sessionRef) => `How many valid trials are recorded for ${sessionRef}?`,
  }),
]);

export function buildClientPayload({ session_ref, question_id, request_id }) {
  const question = DEMO_QUESTIONS.find((item) => item.id === question_id);
  if (!question) {
    throw new Error('Unknown demo question.');
  }
  return {
    request_id,
    question: question.question(session_ref),
    intent: {
      kind: 'report_metric',
      session_ref,
      metric_id: question.metric_id,
    },
    session_scope: [session_ref],
  };
}

/**
 * @param {{
 *   loading?: boolean,
 *   httpStatus?: number | null,
 *   body?: Record<string, any> | null,
 *   networkError?: string | null,
 * }} [input]
 */
export function viewFromHttp({ loading = false, httpStatus = null, body = null, networkError = null } = {}) {
  if (loading) {
    return { kind: 'loading', title: 'Asking the Research Agent…', detail: 'Waiting for a validated runtime answer.' };
  }
  if (networkError) {
    return { kind: 'error', title: 'Request failed', detail: String(networkError) };
  }
  if (!body) {
    return { kind: 'idle', title: 'Select a synthetic session and question.', detail: DEMO_DISCLAIMER.text };
  }
  if (httpStatus === 401) {
    return {
      kind: 'unauthenticated',
      title: 'Sign in required',
      detail: 'This synthetic demo is limited to authorized visitors. Sign in with the demo password to continue.',
    };
  }
  if (httpStatus === 429) {
    return {
      kind: 'error',
      title: 'Too many requests',
      detail: 'Please wait a moment before asking another question. The demo rate limit is server-enforced.',
    };
  }
  if (httpStatus === 403) {
    return { kind: 'error', title: 'Unauthorized session', detail: body.error ?? 'The server rejected this session scope.' };
  }
  if (httpStatus && httpStatus >= 400 && httpStatus !== 503) {
    return { kind: 'error', title: 'Invalid request', detail: body.error ?? 'The API rejected this request.' };
  }
  const answer = body.answer;
  if (httpStatus === 503 || body.audit?.failure_class === 'provider') {
    return {
      kind: 'error',
      title: 'Provider unavailable',
      detail: 'The research agent could not complete this request. No unvalidated model output is shown.',
      reason_code: answer?.reason_code ?? body.reason_code,
      provider: body.provider ?? null,
      limitations: answer?.limitations ?? [DEMO_DISCLAIMER.text],
    };
  }
  if (answer?.status === 'abstained') {
    return {
      kind: 'abstained',
      title: 'The agent abstained',
      detail: answer.reason_code,
      reason_code: answer.reason_code,
      claims: [],
      artifact_refs: body.audit?.artifact_refs ?? [],
      limitations: answer.limitations ?? [],
      provider: body.provider ?? null,
    };
  }
  if (answer?.status === 'answered') {
    return {
      kind: 'success',
      title: 'Validated answer',
      detail: DEMO_DISCLAIMER.label,
      claims: answer.claims ?? [],
      artifact_refs: body.audit?.artifact_refs ?? [],
      limitations: answer.limitations ?? [],
      provider: body.provider ?? null,
    };
  }
  return { kind: 'error', title: 'Unexpected response', detail: 'The API did not return a validated agent-answer/0.1 object.' };
}
