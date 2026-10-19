import {
  ANALYSIS_VERSION,
  ARTIFACT_SCHEMA_VERSION,
  CONTRACT_VERSION,
  DATA_ORIGIN,
  PRODUCER_ID,
  PRODUCER_VERSION,
} from './constants.mjs';
import { validateEvidenceArtifact } from './validate.mjs';

export function cloneJson(value) {
  return structuredClone(value);
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

export function sessionAlias(sessionRef) {
  return String(sessionRef).replace(/^fixture:session:/, '');
}

export function comparisonArtifactRef(sessionRefs, metricId) {
  return `fixture:session-compare:${sessionRefs.map(sessionAlias).join('-')}:${metricId}`;
}

export function createEvidenceArtifact({
  artifact_ref,
  artifact_kind,
  protocol_version,
  created_at,
  participant_scope,
  source_session_refs,
  quality,
  metrics,
  limitations,
  extra_payload = {},
}) {
  const artifact = {
    artifact_schema_version: ARTIFACT_SCHEMA_VERSION,
    artifact_ref,
    artifact_kind,
    contract_version: CONTRACT_VERSION,
    analysis_version: ANALYSIS_VERSION,
    protocol_version,
    created_at,
    data_origin: DATA_ORIGIN.SYNTHETIC_FIXTURE,
    participant_scope,
    source_session_refs: [...source_session_refs],
    provenance: {
      producer: PRODUCER_ID,
      producer_version: PRODUCER_VERSION,
      computation: 'deterministic_fixture_lookup',
      immutable: true,
      inputs: [...source_session_refs],
    },
    quality: {
      usable: quality.usable,
      reason_codes: [...quality.reason_codes],
    },
    payload: {
      metrics: cloneJson(metrics),
      ...cloneJson(extra_payload),
    },
    limitations: [...limitations],
  };
  const checked = validateEvidenceArtifact(artifact);
  if (!checked.ok) {
    throw new Error(`Invalid evidence artifact ${artifact_ref}: ${checked.message}`);
  }
  return deepFreeze(cloneJson(artifact));
}

export function getMetricFromArtifact(artifact, metricId, sessionRef = undefined) {
  if (!artifact?.payload?.metrics) return null;
  return artifact.payload.metrics.find((metric) => {
    if (metric.metric_id !== metricId) return false;
    if (sessionRef === undefined) return true;
    return metric.session_ref === sessionRef;
  }) ?? null;
}
