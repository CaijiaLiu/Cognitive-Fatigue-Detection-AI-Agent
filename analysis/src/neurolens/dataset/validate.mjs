/**
 * Fail-closed dataset validation. One blocking error fails the build.
 * Identical duplicate session_id values are kept once; conflicts reject.
 */
import { summarizeTrials } from '../../../../public/collection/tasks/summary.js';
import { readCompatibleSession } from '../../../../public/collection/session/mission-adapter.js';
import { fail, isPlainObject, ok } from '../agent/validate.mjs';
import { looksLikeCsv, validateExport, validateV1Session } from '../adapter/validate-export.mjs';
import { summariesAgree } from '../adapter/normalize.mjs';
import {
  BLOCKED_SIDECAR_KEYS,
  MISSION_EVENT_CONTRACT_ID,
  PROTOCOL_GO_NO_GO_V1,
  QUALITY_FLAGS,
  REASON_CODES,
  sha256Canonical,
  stableStringify,
} from './contracts.mjs';

const QUALITY_SET = new Set(QUALITY_FLAGS);

export { validateV1Session };

function rejected(reason_code, message, details) {
  return fail(reason_code, message, details);
}

export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function acquiredElapsedMs(sample) {
  if (!isPlainObject(sample)) return null;
  if (finiteNumber(sample.acquired_elapsed_ms)) return sample.acquired_elapsed_ms;
  if (finiteNumber(sample.elapsed_ms)) return sample.elapsed_ms;
  return null;
}

function identityFingerprint(session) {
  return stableStringify({
    session_id: session.session_id,
    participant_id: session.participant_id,
    mode: session.mode,
    protocol: session.config?.protocol,
    started_at: session.started_at,
  });
}

export function windowsOverlap(a, b) {
  const endA = a.end_ms == null ? Number.POSITIVE_INFINITY : a.end_ms;
  const endB = b.end_ms == null ? Number.POSITIVE_INFINITY : b.end_ms;
  return a.start_ms < endB && b.start_ms < endA;
}

function validateTimestamps(session) {
  if (!finiteNumber(session.duration_ms) || session.duration_ms < 0) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'duration_ms must be a finite non-negative number.', {
      session_id: session.session_id ?? null,
    });
  }
  const started = Date.parse(session.started_at);
  const ended = Date.parse(session.ended_at);
  if (started > ended) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'Session started_at is after ended_at.', {
      session_id: session.session_id,
    });
  }
  return null;
}

function validateSamples(session) {
  if (session.samples === undefined) return null;
  if (!Array.isArray(session.samples)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'samples must be an array when present.', {
      session_id: session.session_id,
    });
  }
  const expected = session.sources?.vision;
  const seen = new Set();
  for (let index = 0; index < session.samples.length; index += 1) {
    const sample = session.samples[index];
    if (!isPlainObject(sample)) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Sample ${index} is not an object.`, {
        session_id: session.session_id,
        index,
      });
    }
    if (sample.source !== expected) {
      return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'A visual sample source disagrees with sources.vision.', {
        session_id: session.session_id,
        index,
      });
    }
    seen.add(sample.source);
    const acquired = acquiredElapsedMs(sample);
    if (acquired == null || acquired < 0) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Sample ${index} has an invalid acquisition timestamp.`, {
        session_id: session.session_id,
        index,
      });
    }
    if (sample.processed_elapsed_ms != null) {
      if (!finiteNumber(sample.processed_elapsed_ms) || sample.processed_elapsed_ms < 0) {
        return rejected(REASON_CODES.MALFORMED_OUTPUT, `Sample ${index} has an invalid processing timestamp.`, {
          session_id: session.session_id,
          index,
        });
      }
      if (acquired > sample.processed_elapsed_ms) {
        return rejected(REASON_CODES.MALFORMED_OUTPUT, `Sample ${index} acquisition is after processing.`, {
          session_id: session.session_id,
          index,
          reason_code: 'future_acquisition',
        });
      }
    }
    if (sample.quality != null && !QUALITY_SET.has(sample.quality)) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Sample ${index} uses an unknown quality flag.`, {
        session_id: session.session_id,
        index,
        quality: sample.quality,
      });
    }
    if (sample.interpreted_as_open_eyes === true) {
      return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Dropout or gap labeled as open eyes.', {
        session_id: session.session_id,
        index,
      });
    }
  }
  if (seen.size > 1) {
    return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Mixed vision sources inside one session.', {
      session_id: session.session_id,
    });
  }
  return null;
}

function validateTrials(session) {
  if (session.trials === undefined) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'trials are required for go-no-go-v1.', {
      session_id: session.session_id,
    });
  }
  if (!Array.isArray(session.trials)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'trials must be an array.', {
      session_id: session.session_id,
    });
  }
  for (let index = 0; index < session.trials.length; index += 1) {
    const trial = session.trials[index];
    if (!isPlainObject(trial)) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Trial ${index} is not an object.`, {
        session_id: session.session_id,
        index,
      });
    }
    if (!finiteNumber(trial.onset_ms) || trial.onset_ms < 0) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Trial ${index} has an invalid onset_ms.`, {
        session_id: session.session_id,
        index,
      });
    }
  }
  return null;
}

function validateBehaviorSummary(session) {
  if (session.config?.protocol !== PROTOCOL_GO_NO_GO_V1) return null;
  const recomputed = summarizeTrials(session.trials);
  if (!summariesAgree(session.behavior_summary, recomputed)) {
    return rejected(
      REASON_CODES.INCONSISTENT_EVIDENCE,
      'Stored behavior_summary does not match summarizeTrials on the same trials.',
      { session_id: session.session_id },
    );
  }
  return null;
}

function validateBlockedSidecars(session) {
  for (const key of BLOCKED_SIDECAR_KEYS) {
    if (session[key] != null) {
      return rejected(
        REASON_CODES.UNSUPPORTED_SCHEMA,
        `Unmerged Week 3 sidecar '${key}' is not readable on this branch.`,
        { session_id: session.session_id, key },
      );
    }
  }
  return null;
}

function validateMissionEvents(session) {
  const events = session.mission?.events;
  if (events == null) return null;
  if (!Array.isArray(events)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'session.mission.events must be an array when present.', {
      session_id: session.session_id,
    });
  }
  for (const event of events) {
    if (event?.interpreted_as_open_eyes === true) {
      return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Mission dropout labeled as open eyes.', {
        session_id: session.session_id,
      });
    }
  }
  return null;
}

export function validateMissionTasks(session) {
  if (session.mission == null) return ok(null);
  if (!isPlainObject(session.mission)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'session.mission must be an object when present.', {
      session_id: session.session_id,
    });
  }
  if (
    session.mission.contract_id != null
    && session.mission.contract_id !== MISSION_EVENT_CONTRACT_ID
  ) {
    return rejected(REASON_CODES.UNSUPPORTED_SCHEMA, 'Unknown mission sidecar contract.', {
      session_id: session.session_id,
      contract_id: session.mission.contract_id,
    });
  }
  const eventError = validateMissionEvents(session);
  if (eventError) return eventError;
  const tasks = session.mission.tasks;
  if (tasks == null) return ok([]);
  if (!Array.isArray(tasks)) {
    return rejected(REASON_CODES.MALFORMED_OUTPUT, 'session.mission.tasks must be an array when present.', {
      session_id: session.session_id,
    });
  }
  const windows = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (!isPlainObject(task)) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Mission task ${index} is not an object.`, {
        session_id: session.session_id,
        index,
      });
    }
    if (!finiteNumber(task.started_session_ms) || task.started_session_ms < 0) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Mission task ${index} has an invalid started_session_ms.`, {
        session_id: session.session_id,
        index,
      });
    }
    const duration = session.duration_ms;
    if (!finiteNumber(duration) || task.started_session_ms >= duration) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Mission task ${index} start is outside the session duration.`, {
        session_id: session.session_id,
        index,
        started_session_ms: task.started_session_ms,
        duration_ms: duration,
      });
    }
    const end = task.ended_session_ms;
    if (end == null) {
      if (session.status !== 'interrupted') {
        return rejected(
          REASON_CODES.MALFORMED_OUTPUT,
          `Mission task ${index} is open-ended; completed sessions cannot have open task windows.`,
          { session_id: session.session_id, index, status: session.status },
        );
      }
    } else if (!finiteNumber(end) || end < task.started_session_ms || end > duration) {
      return rejected(REASON_CODES.MALFORMED_OUTPUT, `Mission task ${index} has an inverted or out-of-range ended_session_ms.`, {
        session_id: session.session_id,
        index,
        ended_session_ms: end,
        duration_ms: duration,
      });
    }
    windows.push({
      start_ms: task.started_session_ms,
      end_ms: end == null ? null : end,
      task_id: task.kind ?? `task-${index}`,
    });
  }
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      if (windowsOverlap(windows[i], windows[j])) {
        return rejected(REASON_CODES.INCONSISTENT_EVIDENCE, 'Mission task windows overlap.', {
          session_id: session.session_id,
        });
      }
    }
  }
  return ok(windows);
}

export function validateDatasetSession(session) {
  const compatible = readCompatibleSession(session);
  if (compatible.kind === 'mission-preview') {
    return rejected(REASON_CODES.INCOMPATIBLE_PROTOCOL, 'Mission-preview records are unsupported.', {
      session_id: session?.session_id ?? null,
    });
  }
  const base = validateV1Session(session);
  if (!base.ok) return base;
  const blocked = validateBlockedSidecars(session);
  if (blocked) return blocked;
  const timeError = validateTimestamps(session);
  if (timeError) return timeError;
  const sampleError = validateSamples(session);
  if (sampleError) return sampleError;
  const trialError = validateTrials(session);
  if (trialError) return trialError;
  const summaryError = validateBehaviorSummary(session);
  if (summaryError) return summaryError;
  const mission = validateMissionTasks(session);
  if (!mission.ok) return mission;
  return ok(session);
}

function normalizeDocuments(inputs) {
  return inputs.map((item, index) => {
    if (isPlainObject(item) && Object.hasOwn(item, 'value') && Object.hasOwn(item, 'label')) {
      return { label: String(item.label), value: item.value };
    }
    return { label: `input-${index}`, value: item };
  });
}

function dedupeSessions(accepted) {
  const kept = [];
  const byId = new Map();
  let identical_duplicates_dropped = 0;
  for (const entry of accepted) {
    const session = entry.session;
    const previous = byId.get(session.session_id);
    if (!previous) {
      byId.set(session.session_id, entry);
      kept.push(entry);
      continue;
    }
    if (stableStringify(previous.session) === stableStringify(session)) {
      identical_duplicates_dropped += 1;
      continue;
    }
    const identityConflict = identityFingerprint(previous.session) !== identityFingerprint(session);
    return rejected(
      identityConflict ? REASON_CODES.SESSION_MISMATCH : REASON_CODES.INCONSISTENT_EVIDENCE,
      identityConflict
        ? 'Duplicate session_id with conflicting participant, mode, protocol, or started_at.'
        : 'Duplicate session_id with conflicting session body.',
      { session_id: session.session_id },
    );
  }
  return ok({ sessions: kept, identical_duplicates_dropped });
}

export function collectValidatedSessions(inputs) {
  const documents = normalizeDocuments(inputs);
  const created_from = documents
    .map((doc) => ({
      label: doc.label,
      sha256: sha256Canonical(doc.value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.sha256.localeCompare(b.sha256));

  const accepted = [];
  for (const doc of documents) {
    if (looksLikeCsv(doc.value)) {
      return rejected(REASON_CODES.REJECTED_REQUEST, 'CSV exports are rejected; provide V1 session JSON.', {
        label: doc.label,
      });
    }
    const exported = validateExport(doc.value);
    if (!exported.ok) {
      return { ...exported, details: { ...(exported.details ?? {}), label: doc.label } };
    }
    for (const session of exported.value.sessions) {
      const checked = validateDatasetSession(session);
      if (!checked.ok) {
        return { ...checked, details: { ...(checked.details ?? {}), label: doc.label } };
      }
      accepted.push({ session: checked.value, label: doc.label });
    }
  }

  const deduped = dedupeSessions(accepted);
  if (!deduped.ok) return deduped;
  return ok({
    documents: created_from,
    sessions: deduped.value.sessions.map((entry) => entry.session),
    identical_duplicates_dropped: deduped.value.identical_duplicates_dropped,
  });
}
