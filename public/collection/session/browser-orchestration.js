/**
 * Optional browser lifecycle observer for W3.3.
 * Default disabled. Not imported by session/controller.js.
 * Does not own FeatureAccumulator, Go/No-Go trials, or tracking camera resources.
 */
import { V1_GO_NO_GO_PROTOCOL } from './protocol.js';
import { createSessionOrchestrator } from './orchestrate.js';
import { attachLocalOrchestration } from './orchestration-export.js';

export const BROWSER_ORCHESTRATION_GAP = Object.freeze({
  contract_id: 'browser-orchestration-observer/0.1-provisional',
  wired_into_controller: false,
  live_camera_validation: false,
  scientific_task_behavior_changed: false,
  reason: [
    'public/collection/session/controller.js already owns FeatureAccumulator, createGoNoGoTask, and createMissionAdapter.',
    'createSessionOrchestrator also owns an accumulator and mission adapter.',
    'Wiring the orchestrator as the live owner would double-fire mission events or take over V1 Go/No-Go science.',
    'W3.3 therefore keeps this observer optional and off by default. The complete path is the offline research-session pipeline.'
  ]
});

export function createOptionalBrowserOrchestration({
  enabled = false,
  now = () => 0,
  protocol = V1_GO_NO_GO_PROTOCOL,
  session_id = '00000000-0000-4000-8000-000000000000',
  mode = 'simulated'
} = {}) {
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      gap: BROWSER_ORCHESTRATION_GAP,
      observe() {
        return { ok: false, reason: 'disabled', wired_into_controller: false };
      },
      attach(session) {
        return session;
      },
      snapshot() {
        return null;
      }
    });
  }

  const orchestrator = createSessionOrchestrator({ now, protocol, session_id, mode });

  function observe(type, payload = {}) {
    switch (type) {
      case 'prepare':
        return orchestrator.prepare(payload.at);
      case 'session_start':
        return orchestrator.startSession({ startedAt: payload.startedAt });
      case 'task_start':
        return orchestrator.startTask(payload.task_id, { startedAt: payload.startedAt });
      case 'observation':
        return orchestrator.recordObservation(payload);
      case 'dropout':
        return orchestrator.recordDropout(payload);
      case 'task_end':
        return orchestrator.endTask(payload.task_id, { reason: payload.reason, endedAt: payload.endedAt });
      case 'complete':
        return orchestrator.completeSession({ endedAt: payload.endedAt });
      case 'interrupt':
        return orchestrator.interrupt({ reason: payload.reason, endedAt: payload.endedAt });
      case 'fail':
        return orchestrator.fail({ reason: payload.reason, endedAt: payload.endedAt });
      default:
        return { ok: false, reason: 'unknown_observe_type', type };
    }
  }

  return {
    enabled: true,
    gap: BROWSER_ORCHESTRATION_GAP,
    orchestrator,
    observe,
    attach(session) {
      return attachLocalOrchestration(session, orchestrator);
    },
    snapshot() {
      return orchestrator.snapshot();
    }
  };
}
