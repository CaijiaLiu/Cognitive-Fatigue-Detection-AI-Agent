import {
  ALLOWED_METRICS,
  ALLOWED_TOOLS,
  ANALYSIS_VERSION,
  ARTIFACT_KIND,
  CONTRACT_VERSION,
  DATA_ORIGIN,
  PARTICIPANT_SCOPE,
  PROTOCOL_COMPATIBILITY,
  REASON_CODES,
  SYNTHETIC_LIMIT,
  TOOL_NAMES,
  TOOL_STATUS,
} from './constants.mjs';
import { comparisonArtifactRef, createEvidenceArtifact } from './artifacts.mjs';
import { createFixtureStore } from './fixtures.mjs';
import { validateResponseAgreesWithArtifact, validateToolRequest, validateToolResponse } from './validate.mjs';

function clone(value) {
  return structuredClone(value);
}

function emptyQuality(reasonCodes = []) {
  return { usable: false, reason_codes: [...reasonCodes] };
}

function baseEnvelope(tool, extras) {
  return {
    contract_version: CONTRACT_VERSION,
    tool,
    analysis_version: extras.analysis_version ?? ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SYNTHETIC_FIXTURE,
    quality: extras.quality ?? emptyQuality(),
    metrics: extras.metrics ?? [],
    limitations: extras.limitations ?? [SYNTHETIC_LIMIT],
    ...extras,
  };
}

function rejectEnvelope(tool, message) {
  const safeTool = ALLOWED_TOOLS.includes(tool) ? tool : 'rejected';
  return finalize(baseEnvelope(safeTool, {
    status: TOOL_STATUS.UNAVAILABLE,
    reason_code: REASON_CODES.REJECTED_REQUEST,
    quality: emptyQuality([REASON_CODES.REJECTED_REQUEST]),
    limitations: [SYNTHETIC_LIMIT, message, 'Request rejected before execution; no catalog lookup was performed.'],
  }));
}

function failEnvelope(tool, status, reason_code, limitations, extras = {}) {
  return finalize(baseEnvelope(tool, {
    status,
    reason_code,
    quality: extras.quality ?? emptyQuality([reason_code]),
    limitations: [SYNTHETIC_LIMIT, ...limitations],
    ...extras,
  }));
}

function finalize(envelope) {
  const checked = validateToolResponse(envelope);
  if (!checked.ok) {
    throw new Error(`Internal tool envelope failed validation: ${checked.message}`);
  }
  return clone(envelope);
}

function protocolsCompatible(left, right) {
  return Boolean(PROTOCOL_COMPATIBILITY[left]?.includes(right));
}

function okFromArtifact(tool, artifact) {
  const envelope = baseEnvelope(tool, {
    status: TOOL_STATUS.OK,
    artifact_ref: artifact.artifact_ref,
    protocol_version: artifact.protocol_version,
    participant_scope: artifact.participant_scope,
    quality: artifact.quality,
    metrics: artifact.payload.metrics,
    limitations: artifact.limitations,
  });
  const agreement = validateResponseAgreesWithArtifact(envelope, artifact);
  if (!agreement.ok) {
    return failEnvelope(tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.INCONSISTENT_EVIDENCE, [
      agreement.message,
    ]);
  }
  return finalize(envelope);
}

function sessionMetric(session, metricId) {
  return session.metrics.find((metric) => metric.metric_id === metricId) ?? null;
}

function artifactMatchesSessionMetrics(artifact, sessions) {
  return artifact.payload.metrics.every((metric) => {
    const session = metric.session_ref
      ? sessions.find((item) => item.session_ref === metric.session_ref)
      : sessions[0];
    const expected = session ? sessionMetric(session, metric.metric_id) : null;
    return expected && Object.is(expected.value, metric.value) && expected.unit === metric.unit && expected.n === metric.n;
  });
}

export function buildComparisonArtifact(sessions, metricId) {
  const metrics = sessions.map((session) => {
    const metric = session.metrics.find((item) => item.metric_id === metricId);
    return {
      metric_id: metric.metric_id,
      value: metric.value,
      unit: metric.unit,
      n: metric.n,
      session_ref: session.session_ref,
    };
  });
  return createEvidenceArtifact({
    artifact_ref: comparisonArtifactRef(sessions.map((session) => session.session_ref), metricId),
    artifact_kind: ARTIFACT_KIND.SESSION_COMPARISON,
    protocol_version: sessions[0].protocol_version,
    created_at: '2026-10-19T00:00:00.000Z',
    participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
    source_session_refs: sessions.map((session) => session.session_ref),
    quality: { usable: true, reason_codes: [] },
    metrics,
    limitations: [
      SYNTHETIC_LIMIT,
      'Numbers are copied from the fixture catalog; no model inference was performed.',
      'Comparison is descriptive only; no causal or diagnostic claim.',
    ],
    extra_payload: {
      metric_id: metricId,
      analysis_version: ANALYSIS_VERSION,
    },
  });
}

function getSessionSummary(store, request) {
  if (request.analysis_version !== ANALYSIS_VERSION) {
    return failEnvelope(request.tool, TOOL_STATUS.INCOMPATIBLE, REASON_CODES.UNKNOWN_ANALYSIS_VERSION, [
      `Unsupported analysis_version ${request.analysis_version}.`,
    ]);
  }
  const session = store.getSession(request.session_ref);
  if (!session) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.UNKNOWN_SESSION, [
      'No fixture session exists for the requested session_ref.',
    ]);
  }
  if (!session.quality.usable || session.metrics.length === 0) {
    return failEnvelope(request.tool, TOOL_STATUS.INSUFFICIENT_DATA, REASON_CODES.INSUFFICIENT_DATA, [
      'Session quality is insufficient or required features are missing.',
      'Do not impute a fatigue label or substitute a clinical conclusion.',
    ], {
      protocol_version: session.protocol_version,
      participant_scope: session.participant_scope,
      quality: session.quality,
    });
  }
  const artifactRef = store.summaryRefFor(session.session_ref);
  const artifact = artifactRef ? store.getArtifact(artifactRef) : null;
  if (!artifact) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.UNKNOWN_ARTIFACT, [
      'Session exists but no immutable summary artifact is catalogued.',
    ]);
  }
  if (!artifact.source_session_refs.includes(request.session_ref)) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.SESSION_MISMATCH, [
      'The catalogued summary artifact does not belong to the requested session.',
    ]);
  }
  if (artifact.protocol_version !== session.protocol_version || !artifactMatchesSessionMetrics(artifact, [session])) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.INCONSISTENT_EVIDENCE, [
      'The catalogued summary artifact does not match the session metrics or protocol.',
    ]);
  }
  return okFromArtifact(request.tool, artifact);
}

function compareSessions(store, request) {
  if (request.analysis_version !== ANALYSIS_VERSION) {
    return failEnvelope(request.tool, TOOL_STATUS.INCOMPATIBLE, REASON_CODES.UNKNOWN_ANALYSIS_VERSION, [
      `Unsupported analysis_version ${request.analysis_version}.`,
    ]);
  }
  const sessions = request.session_refs.map((ref) => store.getSession(ref));
  if (sessions.some((session) => session === null)) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.UNKNOWN_SESSION, [
      'One or more session_refs are not in the fixture catalog.',
    ]);
  }
  const protocols = sessions.map((session) => session.protocol_version);
  if (protocols.some((protocol) => !protocolsCompatible(protocols[0], protocol))) {
    return failEnvelope(request.tool, TOOL_STATUS.INCOMPATIBLE, REASON_CODES.INCOMPATIBLE_PROTOCOL, [
      'Requested sessions use incompatible protocol versions and were not compared.',
    ], {
      protocol_version: protocols[0],
      participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
    });
  }
  if (sessions.some((session) => !session.quality.usable)) {
    return failEnvelope(request.tool, TOOL_STATUS.INSUFFICIENT_DATA, REASON_CODES.INSUFFICIENT_DATA, [
      'At least one session is missing usable evidence; no comparison metrics were produced.',
    ], {
      protocol_version: protocols[0],
      participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
      quality: emptyQuality(['missing_feature']),
    });
  }
  if (sessions.some((session) => !session.metrics.some((metric) => metric.metric_id === request.metric_id))) {
    return failEnvelope(request.tool, TOOL_STATUS.INSUFFICIENT_DATA, REASON_CODES.UNKNOWN_METRIC, [
      `Metric ${request.metric_id} is missing from at least one session.`,
    ], {
      protocol_version: protocols[0],
      participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
    });
  }
  const catalogRef = store.comparisonRefFor(request.session_refs, request.metric_id);
  const artifact = catalogRef ? store.getArtifact(catalogRef) : null;
  if (!artifact) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.UNKNOWN_ARTIFACT, [
      'Compatible sessions were found but no immutable comparison artifact is catalogued.',
    ]);
  }
  if (!request.session_refs.every((sessionRef) => artifact.source_session_refs.includes(sessionRef))) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.SESSION_MISMATCH, [
      'The catalogued comparison artifact does not belong to the requested sessions.',
    ]);
  }
  if (artifact.protocol_version !== protocols[0] || !artifactMatchesSessionMetrics(artifact, sessions)) {
    return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.INCONSISTENT_EVIDENCE, [
      'The catalogued comparison artifact does not match the session metrics or protocol.',
    ]);
  }
  return okFromArtifact(request.tool, artifact);
}

function getEvidence(store, request) {
  const artifact = store.getArtifact(request.artifact_ref);
  if (artifact) {
    return okFromArtifact(request.tool, artifact);
  }
  return failEnvelope(request.tool, TOOL_STATUS.UNAVAILABLE, REASON_CODES.UNKNOWN_ARTIFACT, [
    'No immutable evidence artifact exists for the requested artifact_ref.',
  ]);
}

export function createAnalysisTools({ store } = {}) {
  const catalog = store ?? createFixtureStore();
  let invokeCount = 0;

  function invoke(request) {
    invokeCount += 1;
    const validated = validateToolRequest(request);
    if (!validated.ok) {
      return rejectEnvelope(request && typeof request === 'object' ? request.tool : undefined, validated.message);
    }
    if (validated.value.tool === TOOL_NAMES.GET_SESSION_SUMMARY) {
      return getSessionSummary(catalog, validated.value);
    }
    if (validated.value.tool === TOOL_NAMES.COMPARE_SESSIONS) {
      return compareSessions(catalog, validated.value);
    }
    return getEvidence(catalog, validated.value);
  }

  return Object.freeze({
    contract_version: CONTRACT_VERSION,
    analysis_version: ANALYSIS_VERSION,
    invoke,
    listTools() {
      return ALLOWED_TOOLS.map((name) => ({
        name,
        read_only: true,
        access: 'synthetic_fixture_catalog',
      }));
    },
    allowedMetrics() {
      return clone(ALLOWED_METRICS);
    },
    inspectArtifact(artifactRef) {
      return catalog.getArtifact(artifactRef);
    },
    invokeCount() {
      return invokeCount;
    },
  });
}
