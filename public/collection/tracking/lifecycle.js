export const CALIBRATION_DEADLINE_MS = 15000;
export const CALIBRATION_MIN_DURATION_MS = 3000;
export const CALIBRATION_MIN_VALID_FRAMES = 20;
export const MAX_TRACKING_GAP_MS = 250;

export function createTrackingLifecycle({ now = () => performance.now() } = {}) {
  let generation = 0;
  let workerReady = false;
  let cameraReady = false;
  let calibrationStarted = 0;
  let calibrationDeadline = 0;
  let calibrationFrames = [];
  let lastAdmittedAcquisition = null;
  let baseline = null;

  function bumpGeneration() {
    generation += 1;
    workerReady = false;
    cameraReady = false;
    calibrationStarted = 0;
    calibrationDeadline = 0;
    calibrationFrames = [];
    lastAdmittedAcquisition = null;
    baseline = null;
    return generation;
  }

  function markWorkerReady(at = now()) {
    workerReady = true;
    cameraReady = false;
    calibrationFrames = [];
    calibrationStarted = at;
    calibrationDeadline = at + CALIBRATION_DEADLINE_MS;
    return { generation, calibrationStarted, calibrationDeadline };
  }

  function ingestCalibrationEar(ear, acquisitionTs) {
    if (cameraReady) return { ready: true, baseline, expired: false };
    if (Number.isFinite(ear) && ear > 0.15 && ear < 0.6) calibrationFrames.push(ear);
    const elapsed = acquisitionTs - calibrationStarted;
    const expired = workerReady && !cameraReady && acquisitionTs >= calibrationDeadline;
    const enough = elapsed >= CALIBRATION_MIN_DURATION_MS && calibrationFrames.length >= CALIBRATION_MIN_VALID_FRAMES;
    return { ready: false, enough, expired, frames: calibrationFrames, elapsed_ms: elapsed };
  }

  function completeCalibration(earBaseline) {
    cameraReady = true;
    baseline = earBaseline;
    return { generation, baseline };
  }

  function calibrationExpired(at = now()) {
    return workerReady && !cameraReady && at >= calibrationDeadline;
  }

  function classifyResult({
    acquisitionTs,
    processedTs,
    resultGeneration,
    sessionStart = null,
    taskWindow = null
  }) {
    if (resultGeneration !== generation) {
      return { admit: false, reason: 'stale_generation' };
    }
    if (sessionStart == null) {
      return { admit: false, reason: 'no_session' };
    }
    const sessionElapsed = acquisitionTs - sessionStart;
    const processedElapsed = processedTs - sessionStart;
    const timing = {
      session_elapsed_ms: sessionElapsed,
      acquired_elapsed_ms: sessionElapsed,
      processed_elapsed_ms: processedElapsed,
      processing_lag_ms: processedTs - acquisitionTs,
      task_elapsed_ms: taskWindow?.started == null ? null : acquisitionTs - taskWindow.started
    };
    if (sessionElapsed < 0) return { admit: false, reason: 'pre_session', ...timing };
    if (taskWindow?.started != null && acquisitionTs < taskWindow.started) {
      return { admit: false, reason: 'pre_task', ...timing };
    }
    if (taskWindow?.ended != null && acquisitionTs >= taskWindow.ended) {
      return { admit: false, reason: 'post_task', ...timing };
    }
    return { admit: true, reason: 'admitted', ...timing };
  }

  function noteAdmitted(acquisitionTs) {
    const previous = lastAdmittedAcquisition;
    const gap = previous == null ? 0 : acquisitionTs - previous;
    lastAdmittedAcquisition = acquisitionTs;
    return { gap_ms: gap, dropout: previous != null && gap > MAX_TRACKING_GAP_MS, previous_acquisition_ts: previous };
  }

  return {
    get generation() { return generation; },
    get workerReady() { return workerReady; },
    get ready() { return cameraReady; },
    get calibrationFrames() { return calibrationFrames.slice(); },
    get calibrationDeadline() { return calibrationDeadline; },
    get baseline() { return baseline; },
    bumpGeneration,
    markWorkerReady,
    ingestCalibrationEar,
    completeCalibration,
    calibrationExpired,
    classifyResult,
    noteAdmitted,
    cleanup: bumpGeneration
  };
}
