/**
 * W3.3 offline research-session pipeline.
 * Composes production modules only:
 * createSessionOrchestrator → attachLocalOrchestration →
 * createSessionEvidenceTools → composeAnswer.
 * Not a live-camera or browser-controller integration.
 * Not scientifically validated.
 */
import { composeAnswer } from '../agent/answer.mjs';
import { SESSION_EVIDENCE_ANALYSIS_VERSION } from '../agent/constants.mjs';
import { adaptSessionEvidence, createSessionEvidenceTools } from '../adapter/session-evidence.mjs';
import { createTrackingLifecycle } from '../../../../public/collection/tracking/lifecycle.js';
import { summarizeTrials } from '../../../../public/collection/tasks/summary.js';
import { nullVision } from '../../../../public/collection/features/unavailable.js';
import { sources } from '../../../../public/collection/session/provenance.js';
import { SCHEMA_VERSION, CONSENT_VERSION } from '../../../../public/collection/session/versions.js';
import { V1_GO_NO_GO_PROTOCOL } from '../../../../public/collection/session/protocol.js';
import { createSessionOrchestrator } from '../../../../public/collection/session/orchestrate.js';
import { attachLocalOrchestration } from '../../../../public/collection/session/orchestration-export.js';
import {
  BROWSER_ORCHESTRATION_GAP,
  createOptionalBrowserOrchestration
} from '../../../../public/collection/session/browser-orchestration.js';

export const RESEARCH_SESSION_INTEGRATION_CONTRACT = Object.freeze({
  contract_id: 'research-session-integration/0.1-provisional',
  contract_version: '0.1.0',
  scientific_review: 'PENDING_SCIENTIFIC_REVIEW',
  local_only: true,
  upload_eligible: false,
  browser_live_orchestrator: false,
  browser_gap: BROWSER_ORCHESTRATION_GAP,
  path: Object.freeze([
    'session creation',
    'protocol initialization',
    'mission preparation',
    'session start',
    'task start',
    'observations / dropouts',
    'task end',
    'session completion | interruption | failure',
    'local export + attachLocalOrchestration',
    'W3.2 evidence adaptation',
    'existing Research Agent tools',
    'evidence-grounded composeAnswer'
  ]),
  connected: Object.freeze([
    'createSessionOrchestrator + createMissionAdapter + FeatureAccumulator',
    'attachLocalOrchestration / replayOrchestration',
    'adaptSessionEvidence / createSessionEvidenceTools',
    'composeAnswer over existing read-only tools'
  ]),
  offline_only: Object.freeze([
    'this pipeline',
    'session orchestrator',
    'session evidence adapter'
  ]),
  simulated: Object.freeze([
    'injected clocks',
    'mode=simulated observations',
    'synthetic V1 trial extras for Go/No-Go compatibility'
  ]),
  not_implemented: Object.freeze([
    'live wiring of createSessionOrchestrator into session/controller.js',
    'HTTP demo acceptance of analysis-session-evidence/0.1',
    'Caijia-signed PVT / ratings / probe protocol',
    'real-camera measurement validation'
  ]),
  blocked_by_scientific_review: Object.freeze([
    'metric meaning and ocular allowlist',
    'generic-slot science',
    'fatigue or diagnostic claims'
  ]),
  does_not: Object.freeze([
    'replace public/collection/session/controller.js',
    'change go-no-go-v1 trial semantics',
    'upload orchestration or mission sidecars',
    'expand sanitizeSession',
    'call OpenAI, D1, or Sites',
    'invent PVT outcomes or fatigue scores'
  ])
});

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveMode(mode, cameraAvailable) {
  if (mode === 'camera' && cameraAvailable === false) {
    return { mode: 'behavior', camera_fallback: 'unavailable' };
  }
  return { mode, camera_fallback: null };
}

export function createResearchSessionRuntime({
  now = () => 0,
  protocol = V1_GO_NO_GO_PROTOCOL,
  session_id,
  participant_id,
  mode = 'simulated',
  camera_available = mode !== 'behavior',
  started_at = '2026-10-19T20:00:00.000Z'
} = {}) {
  const resolved = resolveMode(mode, camera_available);
  const tracking = createTrackingLifecycle({ now });
  const orchestrator = createSessionOrchestrator({
    now,
    protocol,
    session_id,
    mode: resolved.mode
  });
  let sessionStart = null;
  let liveGeneration = tracking.generation;
  const rejected = [];

  function noteRejected(record) {
    rejected.push(record);
    return record;
  }

  function admitObservation(input = {}) {
    const processedTs = input.processedTs ?? now();
    const classified = tracking.classifyResult({
      acquisitionTs: input.acquisitionTs,
      processedTs,
      resultGeneration: input.generation ?? liveGeneration,
      sessionStart,
      taskWindow: orchestrator.mission.currentWindow()
    });
    if (!classified.admit) {
      return noteRejected({
        ok: false,
        reason: classified.reason,
        rejected_by: 'tracking_lifecycle',
        type: 'observation'
      });
    }
    const noted = tracking.noteAdmitted(input.acquisitionTs);
    if (noted.dropout) {
      orchestrator.recordDropout({
        at: input.acquisitionTs,
        gap_ms: noted.gap_ms,
        source: input.source
      });
    }
    return orchestrator.recordObservation({ ...input, processedTs });
  }

  return {
    contract: RESEARCH_SESSION_INTEGRATION_CONTRACT,
    session_id,
    participant_id,
    started_at,
    requested_mode: mode,
    mode: resolved.mode,
    camera_fallback: resolved.camera_fallback,
    protocol,
    orchestrator,
    tracking,
    prepare(at) {
      return orchestrator.prepare(at);
    },
    startSession({ startedAt = now() } = {}) {
      const result = orchestrator.startSession({ startedAt });
      if (result.ok) sessionStart = startedAt;
      return result;
    },
    startTask(taskId, options) {
      return orchestrator.startTask(taskId, options);
    },
    endTask(taskId, options) {
      return orchestrator.endTask(taskId, options);
    },
    completeSession(options) {
      return orchestrator.completeSession(options);
    },
    interrupt(options) {
      return orchestrator.interrupt(options);
    },
    fail(options) {
      return orchestrator.fail(options);
    },
    recordObservation(input) {
      return admitObservation(input);
    },
    recordDropout(input) {
      return orchestrator.recordDropout(input);
    },
    recordMissingLandmarks(input = {}) {
      return admitObservation({
        ...input,
        quality: input.quality || 'eyes_unavailable',
        features: input.features || {
          face_present: true,
          ear: null,
          gaze_x: null,
          gaze_y: null,
          rotation: null
        }
      });
    },
    bumpTrackingGeneration() {
      liveGeneration = tracking.bumpGeneration();
      return liveGeneration;
    },
    rejectedEvents() {
      return rejected.concat(orchestrator.rejectedEvents());
    },
    snapshot() {
      return orchestrator.snapshot();
    },
    exportSession(extras = {}) {
      return exportLocalSession(this, extras);
    },
    analyze(intents = [], extras = {}) {
      return analyzeResearchSession(exportLocalSession(this, extras), intents);
    }
  };
}

export function exportLocalSession(runtime, extras = {}) {
  const orch = runtime.orchestrator;
  const snap = orch.snapshot();
  const startedAt = extras.started_at || runtime.started_at;
  const lastElapsed = (snap.events || []).reduce((max, event) => (
    finite(event.session_elapsed_ms) ? Math.max(max, event.session_elapsed_ms) : max
  ), 0);
  const trials = Array.isArray(extras.trials) ? extras.trials : [];
  const samples = Array.isArray(extras.samples) ? extras.samples : [];
  const session = {
    schema_version: SCHEMA_VERSION,
    session_id: orch.session_id,
    participant_id: extras.participant_id || runtime.participant_id,
    mode: orch.mode,
    status: snap.state,
    started_at: startedAt,
    ended_at: extras.ended_at || startedAt,
    duration_ms: finite(extras.duration_ms) ? extras.duration_ms : lastElapsed,
    sources: extras.sources || sources(orch.mode),
    consent: extras.consent || { version: CONSENT_VERSION, accepted_at: startedAt },
    fatigue_pre: extras.fatigue_pre ?? null,
    fatigue_post: extras.fatigue_post ?? null,
    config: {
      protocol: orch.protocol.protocol_id,
      ...(extras.config || {})
    },
    samples,
    trials,
    blink_events: extras.blink_events || [],
    vision_summary: extras.vision_summary || (orch.mode === 'behavior' ? nullVision() : {
      blink_count: null,
      sample_count: samples.length
    }),
    behavior_summary: extras.behavior_summary || summarizeTrials(trials),
    notes: extras.notes || [
      'Offline W3.3 research-session integration. Not a diagnostic or fatigue score.',
      'Browser live orchestrator is not wired into session/controller.js.'
    ]
  };
  if (runtime.camera_fallback) {
    session.notes = [...session.notes, 'Camera was unavailable; ocular measurements stay missing.'];
  }
  attachLocalOrchestration(session, orch);
  return session;
}

export function analyzeResearchSession(session, intents = []) {
  const adapted = adaptSessionEvidence(session);
  const tools = createSessionEvidenceTools(session);
  const answers = intents.map((intent) => composeAnswer({
    analysis_version: intent.analysis_version || SESSION_EVIDENCE_ANALYSIS_VERSION,
    ...intent
  }, tools));
  return {
    contract: RESEARCH_SESSION_INTEGRATION_CONTRACT,
    local_only: true,
    upload_eligible: false,
    browser_live_orchestrator: false,
    session_ref: adapted.ok ? adapted.value.session_id : null,
    adapted,
    tools,
    answers
  };
}

export function runOfflineResearchSession(script = {}) {
  const runtime = createResearchSessionRuntime(script.runtime || {});
  const steps = [];
  for (const step of script.steps || []) {
    const op = step.op;
    const args = step.args || [];
    if (typeof runtime[op] !== 'function') {
      steps.push({ op, result: { ok: false, reason: 'unknown_op' } });
      continue;
    }
    steps.push({ op, result: runtime[op](...args) });
  }
  const session = runtime.exportSession(script.export || {});
  const analysis = analyzeResearchSession(session, script.intents || []);
  return { runtime, session, analysis, steps };
}

export {
  BROWSER_ORCHESTRATION_GAP,
  createOptionalBrowserOrchestration
};
