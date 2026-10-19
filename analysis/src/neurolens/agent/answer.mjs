import {
  ALLOWED_METRICS,
  ANALYSIS_VERSION,
  ANSWER_STATUS,
  ANSWER_VERSION,
  REASON_CODES,
  SYNTHETIC_LIMIT,
  TOOL_NAMES,
  TOOL_STATUS,
  UNSUPPORTED_CLAIM_TYPES,
} from './constants.mjs';
import { getMetricFromArtifact } from './artifacts.mjs';
import {
  containsUnsupportedClaimLanguage,
  isPlainObject,
  validateAgentAnswer,
  validateToolRequest,
} from './validate.mjs';

const UNSUPPORTED_INTENTS = new Set(Object.values(UNSUPPORTED_CLAIM_TYPES));

function clone(value) {
  return structuredClone(value);
}

function finalizeAnswer(answer, artifacts, options = {}) {
  const checked = validateAgentAnswer(answer, artifacts, options);
  if (!checked.ok) {
    throw new Error(`Internal agent answer failed validation: ${checked.message}`);
  }
  return clone(answer);
}

function abstain(reason_code, limitations) {
  return finalizeAnswer({
    answer_version: ANSWER_VERSION,
    status: ANSWER_STATUS.ABSTAINED,
    claims: [],
    reason_code,
    limitations: [SYNTHETIC_LIMIT, ...limitations],
  }, []);
}

function metricSentence(metricId, value, unit, subject = 'The fixture') {
  return `${subject} ${metricId} is ${value} ${unit}.`;
}

function citeArtifact(tools, response) {
  if (response.status !== TOOL_STATUS.OK || !response.artifact_ref) return null;
  return tools.inspectArtifact?.(response.artifact_ref) ?? null;
}

function unsupportedFromIntent(intent) {
  if (!isPlainObject(intent)) {
    return { reason_code: REASON_CODES.REJECTED_REQUEST, limitations: ['Intent must be a plain object.'] };
  }
  if (UNSUPPORTED_INTENTS.has(intent.kind) || UNSUPPORTED_INTENTS.has(intent.claim_type)) {
    return {
      reason_code: REASON_CODES.UNSUPPORTED_CLAIM,
      limitations: [
        'The requested conclusion is outside the W1 research-agent boundary.',
        'No ADHD diagnosis, fatigue score, or medical claim is generated.',
      ],
    };
  }
  if (containsUnsupportedClaimLanguage(intent.text) || containsUnsupportedClaimLanguage(intent.kind)) {
    return {
      reason_code: REASON_CODES.UNSUPPORTED_CLAIM,
      limitations: ['The request uses unsupported clinical or diagnostic language.'],
    };
  }
  return null;
}

export function composeAnswer(intent, tools) {
  const blocked = unsupportedFromIntent(intent);
  if (blocked) {
    return abstain(blocked.reason_code, blocked.limitations);
  }

  if (intent.kind === 'report_metric') {
    const request = {
      tool: TOOL_NAMES.GET_SESSION_SUMMARY,
      session_ref: intent.session_ref,
      analysis_version: intent.analysis_version ?? tools.analysis_version ?? ANALYSIS_VERSION,
    };
    const requestCheck = validateToolRequest(request);
    if (!requestCheck.ok) {
      return abstain(REASON_CODES.REJECTED_REQUEST, [requestCheck.message]);
    }
    const response = tools.invoke(request);
    if (response.status !== TOOL_STATUS.OK) {
      return abstain(response.reason_code, response.limitations.slice(1));
    }
    const artifact = citeArtifact(tools, response);
    const metric = artifact ? getMetricFromArtifact(artifact, intent.metric_id) : null;
    if (!metric) {
      return abstain(REASON_CODES.MISSING_EVIDENCE, [
        `Metric ${intent.metric_id} is not present in the returned artifact.`,
      ]);
    }
    return finalizeAnswer({
      answer_version: ANSWER_VERSION,
      status: ANSWER_STATUS.ANSWERED,
      claims: [{
        text: metricSentence(metric.metric_id, metric.value, metric.unit),
        metric_id: metric.metric_id,
        value: metric.value,
        unit: metric.unit,
        artifact_refs: [artifact.artifact_ref],
      }],
      limitations: artifact.limitations,
    }, [artifact], { expectedSessionRefs: [intent.session_ref] });
  }

  if (intent.kind === 'compare_metric') {
    const request = {
      tool: TOOL_NAMES.COMPARE_SESSIONS,
      session_refs: intent.session_refs,
      metric_id: intent.metric_id,
      analysis_version: intent.analysis_version ?? tools.analysis_version ?? ANALYSIS_VERSION,
    };
    const requestCheck = validateToolRequest(request);
    if (!requestCheck.ok) {
      return abstain(REASON_CODES.REJECTED_REQUEST, [requestCheck.message]);
    }
    const response = tools.invoke(request);
    if (response.status !== TOOL_STATUS.OK) {
      return abstain(response.reason_code, response.limitations.slice(1));
    }
    const artifact = citeArtifact(tools, response);
    if (!artifact) {
      return abstain(REASON_CODES.MISSING_EVIDENCE, ['Comparison succeeded but no citeable artifact was returned.']);
    }
    const claims = [];
    for (const [index, sessionRef] of intent.session_refs.entries()) {
      const metric = getMetricFromArtifact(artifact, intent.metric_id, sessionRef);
      if (!metric) {
        return abstain(REASON_CODES.MISSING_EVIDENCE, [
          `Comparison artifact is missing ${intent.metric_id} for ${sessionRef}.`,
        ]);
      }
      claims.push({
        text: metricSentence(metric.metric_id, metric.value, metric.unit, `Fixture session ${index + 1}`),
        metric_id: metric.metric_id,
        value: metric.value,
        unit: metric.unit,
        artifact_refs: [artifact.artifact_ref],
      });
    }
    return finalizeAnswer({
      answer_version: ANSWER_VERSION,
      status: ANSWER_STATUS.ANSWERED,
      claims,
      limitations: artifact.limitations,
    }, [artifact], { expectedSessionRefs: [...intent.session_refs], coverage: 'all' });
  }

  if (intent.kind === 'lookup_artifact') {
    const request = { tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: intent.artifact_ref };
    const requestCheck = validateToolRequest(request);
    if (!requestCheck.ok) {
      return abstain(REASON_CODES.REJECTED_REQUEST, [requestCheck.message]);
    }
    const response = tools.invoke(request);
    if (response.status !== TOOL_STATUS.OK) {
      return abstain(response.reason_code, response.limitations.slice(1));
    }
    const artifact = citeArtifact(tools, response);
    const metricId = intent.metric_id ?? artifact?.payload.metrics[0]?.metric_id;
    const metric = artifact && metricId ? getMetricFromArtifact(artifact, metricId) : null;
    if (!metric) {
      return abstain(REASON_CODES.MISSING_EVIDENCE, ['The requested artifact has no matching metric.']);
    }
    return finalizeAnswer({
      answer_version: ANSWER_VERSION,
      status: ANSWER_STATUS.ANSWERED,
      claims: [{
        text: metricSentence(metric.metric_id, metric.value, metric.unit),
        metric_id: metric.metric_id,
        value: metric.value,
        unit: metric.unit,
        artifact_refs: [artifact.artifact_ref],
      }],
      limitations: artifact.limitations,
    }, [artifact], { expectedSessionRefs: [...artifact.source_session_refs] });
  }

  return abstain(REASON_CODES.UNSUPPORTED_CLAIM, [
    'Intent kind is not part of the W1 allowlist.',
    `Supported kinds: report_metric, compare_metric, lookup_artifact. Allowed metrics: ${Object.keys(ALLOWED_METRICS).join(', ')}.`,
  ]);
}
