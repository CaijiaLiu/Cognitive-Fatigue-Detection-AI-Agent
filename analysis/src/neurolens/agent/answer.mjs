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

function catalogLimit(tools) {
  return typeof tools?.limit === 'string' && tools.limit ? tools.limit : SYNTHETIC_LIMIT;
}

function abstain(reason_code, limitations, tools = null) {
  return finalizeAnswer({
    answer_version: ANSWER_VERSION,
    status: ANSWER_STATUS.ABSTAINED,
    claims: [],
    reason_code,
    limitations: [catalogLimit(tools), ...limitations],
  }, []);
}

function evidenceItemsFrom(tools, sessionRef, artifact = null) {
  if (typeof tools.listEvidence === 'function' && sessionRef) {
    return tools.listEvidence(sessionRef) || [];
  }
  return Array.isArray(artifact?.payload?.evidence_items) ? artifact.payload.evidence_items : [];
}

function taskSequenceFrom(tools, sessionRef, artifact = null) {
  if (typeof tools.getTaskSequence === 'function' && sessionRef) {
    return tools.getTaskSequence(sessionRef) || [];
  }
  return Array.isArray(artifact?.payload?.task_sequence) ? artifact.payload.task_sequence : [];
}

function shortId(value) {
  if (typeof value !== 'string' || !value) return 'none';
  return value.length <= 80 ? value : `${value.slice(0, 77)}...`;
}

function describeStructure(items, sequence) {
  const tasks = sequence.map((task) => task.task_id || task.kind).filter(Boolean);
  const ids = items.map((item) => item.evidence_id).filter(Boolean);
  const pending = items.some((item) => item.scientific_review === 'PENDING_SCIENTIFIC_REVIEW')
    || sequence.some((task) => task.scientific_review === 'PENDING_SCIENTIFIC_REVIEW');
  const lines = [];
  if (tasks.length > 0) {
    lines.push(`Task sequence: ${tasks.slice(0, 6).join(', ')}.`);
  }
  if (ids.length > 0) {
    lines.push(`Cited evidence IDs: ${ids.length} items, first ${shortId(ids[0])}.`);
  }
  if (pending) {
    lines.push('This protocol is pending scientific review and is not clinically or scientifically validated.');
  }
  return lines;
}

function describeQuality(items) {
  const missing = items.filter((item) => item.quality?.missingness === true || item.quality?.status === 'missing' || item.quality?.status === 'unavailable');
  const dropout = items.filter((item) => item.evidence_type === 'tracking_dropout' || item.quality?.status === 'dropout');
  const simulated = items.filter((item) => item.source === 'simulated');
  const lines = [];
  if (missing.length > 0) {
    lines.push(`Unavailable or missing measurements stay missing (not zero): ${missing.length} item(s).`);
  }
  if (dropout.length > 0) {
    lines.push('Tracking dropout is not an open-eye observation.');
  }
  if (simulated.length > 0) {
    lines.push('Some observations are simulated and are not camera evidence.');
  }
  if (lines.length === 0) {
    lines.push('No additional missingness flags were attached to this request.');
  }
  return lines;
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
      return abstain(REASON_CODES.REJECTED_REQUEST, [requestCheck.message], tools);
    }
    const response = tools.invoke(request);
    if (response.status !== TOOL_STATUS.OK) {
      return abstain(response.reason_code, response.limitations.slice(1), tools);
    }
    const artifact = citeArtifact(tools, response);
    const metricId = intent.metric_id ?? artifact?.payload.metrics[0]?.metric_id;
    const metric = artifact && metricId ? getMetricFromArtifact(artifact, metricId) : null;
    if (!metric) {
      return abstain(REASON_CODES.MISSING_EVIDENCE, ['The requested artifact has no matching metric.'], tools);
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

  if (intent.kind === 'summarize_structure' || intent.kind === 'identify_quality' || intent.kind === 'retrieve_evidence' || intent.kind === 'compare_windows') {
    const sessionRef = intent.session_ref;
    const analysisVersion = intent.analysis_version ?? tools.analysis_version ?? ANALYSIS_VERSION;
    let artifact = null;
    let response = null;
    if (intent.artifact_ref) {
      response = tools.invoke({ tool: TOOL_NAMES.GET_EVIDENCE, artifact_ref: intent.artifact_ref });
      artifact = citeArtifact(tools, response) ?? tools.inspectArtifact?.(intent.artifact_ref) ?? null;
    } else if (typeof sessionRef === 'string') {
      response = tools.invoke({
        tool: TOOL_NAMES.GET_SESSION_SUMMARY,
        session_ref: sessionRef,
        analysis_version: analysisVersion,
      });
      artifact = citeArtifact(tools, response) ?? (typeof tools.inspectArtifact === 'function' && typeof tools.getTaskSequence === 'function'
        ? tools.inspectArtifact(`evidence:session-summary:${sessionRef.replace(/^.*:/, '')}`)
        : null);
      if (!artifact && typeof tools.summaryArtifact === 'function') {
        artifact = tools.summaryArtifact(sessionRef);
      }
    }
    const items = evidenceItemsFrom(tools, sessionRef, artifact);
    const sequence = taskSequenceFrom(tools, sessionRef, artifact);
    const structureLines = describeStructure(items, sequence);
    const qualityLines = describeQuality(items);
    if (intent.kind === 'compare_windows' && typeof tools.compareWindows === 'function' && sessionRef) {
      const compared = tools.compareWindows(sessionRef);
      const windowLines = (compared?.windows ?? []).map((window) => (
        `Window ${window.task_id}: ${window.evidence_ids.length} evidence item(s).`
      ));
      return abstain(REASON_CODES.INSUFFICIENT_DATA, [
        'Task-window comparison is descriptive only. No fatigue delta or diagnostic contrast is computed.',
        compared?.note,
        ...windowLines,
        ...structureLines,
      ].filter(Boolean), tools);
    }
    if (response?.status === TOOL_STATUS.OK && artifact) {
      const metricId = intent.metric_id ?? artifact.payload.metrics[0]?.metric_id;
      const metric = metricId ? getMetricFromArtifact(artifact, metricId) : null;
      if (metric) {
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
          limitations: [
            ...artifact.limitations,
            ...structureLines,
            ...(intent.kind === 'identify_quality' ? qualityLines : []),
          ].slice(0, 16),
        }, [artifact], { expectedSessionRefs: sessionRef ? [sessionRef] : [...artifact.source_session_refs] });
      }
    }
    const reason = response?.reason_code && response.reason_code !== REASON_CODES.INSUFFICIENT_DATA
      ? response.reason_code
      : REASON_CODES.INSUFFICIENT_DATA;
    return abstain(reason, [
      'Supported measurement evidence is unavailable for the requested conclusion.',
      'Generic task slots are not interpreted as PVT, validated Go/No-Go, or fatigue measurements.',
      ...structureLines,
      ...qualityLines,
    ], tools);
  }

  return abstain(REASON_CODES.UNSUPPORTED_CLAIM, [
    'Intent kind is not part of the W1 allowlist.',
    `Supported kinds: report_metric, compare_metric, lookup_artifact, summarize_structure, retrieve_evidence, identify_quality, compare_windows. Allowed metrics: ${Object.keys(ALLOWED_METRICS).join(', ')}.`,
  ], tools);
}
