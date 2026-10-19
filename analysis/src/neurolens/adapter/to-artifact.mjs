import {
  ARTIFACT_KIND,
  COMPUTATION,
  DATA_ORIGIN,
  EXPORT_ANALYSIS_VERSION,
  EXPORT_PRODUCER_ID,
  PARTICIPANT_SCOPE,
} from '../agent/constants.mjs';
import { comparisonArtifactRef, createEvidenceArtifact } from '../agent/artifacts.mjs';
import { summaryRefFor } from './normalize.mjs';

function extraPayload(session, extras = {}) {
  return {
    analysis_version: EXPORT_ANALYSIS_VERSION,
    collection_schema_version: session.collection_schema_version,
    source_protocol: session.source_protocol,
    source_export_sha256: session.source_export_sha256,
    ...extras,
  };
}

export function buildSummaryArtifact(session) {
  return createEvidenceArtifact({
    artifact_ref: summaryRefFor(session.session_id),
    artifact_kind: ARTIFACT_KIND.SESSION_SUMMARY,
    protocol_version: session.protocol_version,
    created_at: session.created_at,
    participant_scope: session.participant_scope,
    source_session_refs: [session.session_ref],
    quality: session.quality,
    metrics: session.metrics,
    limitations: session.limitations,
    analysis_version: EXPORT_ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SESSION_EXPORT,
    computation: COMPUTATION.EXPORT_NORMALIZATION,
    producer: EXPORT_PRODUCER_ID,
    provenance_extra: {
      source_protocol: session.source_protocol,
    },
    extra_payload: extraPayload(session),
  });
}

export function buildExportComparisonArtifact(sessions, metricId) {
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
  const reasonCodes = [...new Set(sessions.flatMap((session) => session.quality.reason_codes))];
  return createEvidenceArtifact({
    artifact_ref: comparisonArtifactRef(sessions.map((session) => session.session_ref), metricId, 'export'),
    artifact_kind: ARTIFACT_KIND.SESSION_COMPARISON,
    protocol_version: sessions[0].protocol_version,
    created_at: sessions.map((session) => session.created_at).sort()[0],
    participant_scope: PARTICIPANT_SCOPE.TWO_PSEUDONYMOUS,
    source_session_refs: sessions.map((session) => session.session_ref),
    quality: { usable: true, reason_codes: reasonCodes },
    metrics,
    limitations: [
      ...sessions[0].limitations,
      'Comparison is descriptive only; no causal or diagnostic claim.',
    ],
    analysis_version: EXPORT_ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SESSION_EXPORT,
    computation: COMPUTATION.EXPORT_NORMALIZATION,
    producer: EXPORT_PRODUCER_ID,
    provenance_extra: {
      source_protocol: sessions[0].source_protocol,
    },
    extra_payload: extraPayload(sessions[0], { metric_id: metricId }),
  });
}
