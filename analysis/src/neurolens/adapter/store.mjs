import { createHash } from 'node:crypto';
import {
  ALLOWED_METRIC_IDS,
  DATA_ORIGIN,
  EXPORT_ANALYSIS_VERSION,
  EXPORT_LIMIT,
  PROTOCOL_COMPATIBILITY,
} from '../agent/constants.mjs';
import { cloneJson, deepFreeze } from '../agent/artifacts.mjs';
import { createAnalysisTools } from '../agent/tools.mjs';
import { isPlainObject } from '../agent/validate.mjs';
import { validateExport, validateV1Session } from './validate-export.mjs';
import { normalizeAcceptedSession, normalizeRejectedSession, summaryRefFor } from './normalize.mjs';
import { buildExportComparisonArtifact, buildSummaryArtifact } from './to-artifact.mjs';

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function comparable(left, right) {
  if (left.ingest_error || right.ingest_error) return false;
  if (!left.quality.usable || !right.quality.usable) return false;
  if (!PROTOCOL_COMPATIBILITY[left.protocol_version]?.includes(right.protocol_version)) return false;
  const leftSim = left.quality.reason_codes.includes('simulated_vision');
  const rightSim = right.quality.reason_codes.includes('simulated_vision');
  return leftSim === rightSim;
}

function ingestDocument(input, originals, rejections) {
  const source_export_sha256 = isPlainObject(input) || Array.isArray(input) ? sha256Json(input) : null;
  const frozenOriginal = input && typeof input === 'object' ? deepFreeze(cloneJson(input)) : input;
  if (source_export_sha256) {
    originals.set(source_export_sha256, frozenOriginal);
  }

  const validated = validateExport(input);
  if (validated.ok) {
    return validated.value.sessions.map((session) => normalizeAcceptedSession(session, { source_export_sha256 }));
  }

  if (isPlainObject(input) && Array.isArray(input.sessions)) {
    const sessions = input.sessions.flatMap((session) => {
      const checked = validateV1Session(session);
      if (checked.ok) {
        return [normalizeAcceptedSession(checked.value, { source_export_sha256 })];
      }
      const stub = normalizeRejectedSession(session, checked, { source_export_sha256 });
      rejections.push({
        session_id: stub.session_id,
        reason_code: checked.reason_code,
        message: checked.message,
        status: checked.status,
      });
      return stub.session_ref ? [stub] : [];
    });
    if (sessions.length > 0) return sessions;
  }

  const stub = normalizeRejectedSession(input, validated, { source_export_sha256 });
  rejections.push({
    session_id: stub.session_id,
    reason_code: validated.reason_code,
    message: validated.message,
    status: validated.status,
  });
  return stub.session_ref ? [stub] : [];
}

export function createExportStore(input) {
  const documents = Array.isArray(input) ? input : [input];
  const originals = new Map();
  const rejections = [];
  const sessions = Object.create(null);
  const artifacts = Object.create(null);
  const summaryRefs = Object.create(null);
  const comparisonRefs = Object.create(null);

  for (const document of documents) {
    for (const session of ingestDocument(document, originals, rejections)) {
      sessions[session.session_ref] = deepFreeze(session);
      if (!session.ingest_error && session.quality.usable) {
        const artifact = buildSummaryArtifact(session);
        artifacts[artifact.artifact_ref] = artifact;
        summaryRefs[session.session_ref] = artifact.artifact_ref;
      } else if (!session.ingest_error) {
        summaryRefs[session.session_ref] = summaryRefFor(session.session_id);
      }
    }
  }

  const usable = Object.values(sessions).filter((session) => !session.ingest_error && session.quality.usable);
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const pair = [usable[i], usable[j]];
      if (!comparable(pair[0], pair[1])) continue;
      for (const metricId of ALLOWED_METRIC_IDS) {
        if (!pair.every((session) => session.metrics.some((metric) => metric.metric_id === metricId))) continue;
        const artifact = buildExportComparisonArtifact(pair, metricId);
        artifacts[artifact.artifact_ref] = artifact;
        comparisonRefs[`${pair[0].session_ref}|${pair[1].session_ref}|${metricId}`] = artifact.artifact_ref;
        comparisonRefs[`${pair[1].session_ref}|${pair[0].session_ref}|${metricId}`] = artifact.artifact_ref;
      }
    }
  }

  return Object.freeze({
    analysis_version: EXPORT_ANALYSIS_VERSION,
    data_origin: DATA_ORIGIN.SESSION_EXPORT,
    access: 'offline_session_export',
    limit: EXPORT_LIMIT,
    rejections: deepFreeze(rejections),
    getSession(sessionRef) {
      return Object.hasOwn(sessions, sessionRef) ? cloneJson(sessions[sessionRef]) : null;
    },
    hasSession(sessionRef) {
      return Object.hasOwn(sessions, sessionRef);
    },
    getArtifact(artifactRef) {
      return Object.hasOwn(artifacts, artifactRef) ? cloneJson(artifacts[artifactRef]) : null;
    },
    hasArtifact(artifactRef) {
      return Object.hasOwn(artifacts, artifactRef);
    },
    summaryRefFor(sessionRef) {
      return summaryRefs[sessionRef] ?? null;
    },
    comparisonRefFor(sessionRefs, metricId) {
      return comparisonRefs[`${sessionRefs.join('|')}|${metricId}`] ?? null;
    },
    getOriginalExport(sha256) {
      return originals.has(sha256) ? originals.get(sha256) : null;
    },
    listSessionRefs() {
      return Object.keys(sessions);
    },
  });
}

export function createExportAnalysisTools(input) {
  return createAnalysisTools({ store: createExportStore(input) });
}
