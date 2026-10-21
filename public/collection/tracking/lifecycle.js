export const CALIBRATION_DEADLINE_MS = 15000;
export const CALIBRATION_MIN_DURATION_MS = 3000;
export const CALIBRATION_MIN_VALID_FRAMES = 20;
export const MAX_TRACKING_GAP_MS = 250;

function finiteTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function createTrackingLifecycle({ now = () => performance.now() } = {}) {
  let generation = 0;
  let workerReady = false;
  let cameraReady = false;
  let calibrationStarted = 0;
  let calibrationDeadline = 0;
  let calibrationFrames = [];
  let lastAdmittedAcquisition = null;
  let baseline = null;
  let calibrationClosed = false;

  function bumpGeneration() {
    generation += 1;
    workerReady = false;
    cameraReady = false;
    calibrationStarted = 0;
    calibrationDeadline = 0;
    calibrationFrames = [];
    lastAdmittedAcquisition = null;
    baseline = null;
    calibrationClosed = false;
    return generation;
  }

  function markWorkerReady(at = now()) {
    workerReady = true;
    cameraReady = false;
    calibrationClosed = false;
    calibrationFrames = [];
    calibrationStarted = at;
    calibrationDeadline = at + CALIBRATION_DEADLINE_MS;
    return { generation, calibrationStarted, calibrationDeadline };
  }

  function ingestCalibrationEar(ear, acquisitionTs, processedTs = acquisitionTs) {
    if (cameraReady) return { ready: true, baseline, expired: false, enough: false };
    if (!finiteTimestamp(acquisitionTs) || !finiteTimestamp(processedTs)) {
      return { ready: false, enough: false, expired: false, rejected: true, reason: 'invalid_timestamp', frames: calibrationFrames.slice() };
    }
    if (acquisitionTs > processedTs) {
      return { ready: false, enough: false, expired: false, rejected: true, reason: 'future_acquisition', frames: calibrationFrames.slice() };
    }
    if (!workerReady || acquisitionTs < calibrationStarted) {
      return { ready: false, enough: false, expired: false, rejected: true, reason: 'stale_calibration', frames: calibrationFrames.slice() };
    }
    const elapsed = acquisitionTs - calibrationStarted;
    const processingActive = processedTs < calibrationDeadline;
    if (calibrationClosed || acquisitionTs >= calibrationDeadline || !processingActive) {
      calibrationClosed = true;
      return {
        ready: false,
        enough: false,
        expired: true,
        rejected: true,
        reason: 'calibration_deadline',
        frames: calibrationFrames.slice(),
        elapsed_ms: elapsed
      };
    }
    if (Number.isFinite(ear) && ear > 0.15 && ear < 0.6) calibrationFrames.push(ear);
    const enough = elapsed >= CALIBRATION_MIN_DURATION_MS && calibrationFrames.length >= CALIBRATION_MIN_VALID_FRAMES;
    return { ready: false, enough, expired: false, frames: calibrationFrames.slice(), elapsed_ms: elapsed };
  }

  function completeCalibration(earBaseline) {
    const committedAt = now();
    if (!workerReady) return { ok: false, reason: 'inactive', generation, baseline, committed_at: committedAt };
    if (cameraReady) return { ok: false, reason: 'already_ready', generation, baseline, committed_at: committedAt };
    if (calibrationClosed || !finiteTimestamp(committedAt) || committedAt >= calibrationDeadline) {
      calibrationClosed = true;
      return { ok: false, reason: 'calibration_deadline', generation, baseline, committed_at: committedAt };
    }
    cameraReady = true;
    baseline = earBaseline;
    return { ok: true, reason: 'calibrated', generation, baseline, committed_at: committedAt };
  }

  function calibrationExpired(at = now()) {
    const expired = workerReady && !cameraReady && finiteTimestamp(at) && at >= calibrationDeadline;
    if (expired) calibrationClosed = true;
    return expired;
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
    if (!finiteTimestamp(acquisitionTs) || !finiteTimestamp(processedTs)) {
      return { admit: false, reason: 'invalid_timestamp' };
    }
    if (acquisitionTs > processedTs) {
      return { admit: false, reason: 'future_acquisition' };
    }
    if (sessionStart == null) {
      return { admit: false, reason: 'no_session' };
    }
    if (!finiteTimestamp(sessionStart)) {
      return { admit: false, reason: 'invalid_timestamp' };
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
    if (lastAdmittedAcquisition != null && acquisitionTs <= lastAdmittedAcquisition) {
      return { admit: false, reason: 'out_of_order', ...timing };
    }
    if (sessionElapsed < 0) return { admit: false, reason: 'pre_session', ...timing };
    if (taskWindow?.started != null && finiteTimestamp(taskWindow.started) && acquisitionTs < taskWindow.started) {
      return { admit: false, reason: 'pre_task', ...timing };
    }
    if (taskWindow?.ended != null && finiteTimestamp(taskWindow.ended) && acquisitionTs >= taskWindow.ended) {
      return { admit: false, reason: 'post_task', ...timing };
    }
    return { admit: true, reason: 'admitted', ...timing };
  }

  function inspectAdmission(acquisitionTs) {
    if (!finiteTimestamp(acquisitionTs)) {
      return {
        ok: false,
        reason: 'invalid_timestamp',
        gap_ms: 0,
        dropout: false,
        previous_acquisition_ts: lastAdmittedAcquisition
      };
    }
    if (lastAdmittedAcquisition != null && acquisitionTs <= lastAdmittedAcquisition) {
      return {
        ok: false,
        reason: 'out_of_order',
        gap_ms: 0,
        dropout: false,
        previous_acquisition_ts: lastAdmittedAcquisition
      };
    }
    const previous = lastAdmittedAcquisition;
    const gap = previous == null ? 0 : acquisitionTs - previous;
    return {
      ok: true,
      gap_ms: gap,
      dropout: previous != null && gap > MAX_TRACKING_GAP_MS,
      previous_acquisition_ts: previous
    };
  }

  function noteAdmitted(acquisitionTs) {
    const inspected = inspectAdmission(acquisitionTs);
    if (!inspected.ok) {
      return {
        admitted: false,
        reason: inspected.reason,
        gap_ms: 0,
        dropout: false,
        previous_acquisition_ts: lastAdmittedAcquisition
      };
    }
    lastAdmittedAcquisition = acquisitionTs;
    return {
      admitted: true,
      gap_ms: inspected.gap_ms,
      dropout: inspected.dropout,
      previous_acquisition_ts: inspected.previous_acquisition_ts
    };
  }

  return {
    get generation() { return generation; },
    get workerReady() { return workerReady; },
    get ready() { return cameraReady; },
    get calibrationFrames() { return calibrationFrames.slice(); },
    get calibrationDeadline() { return calibrationDeadline; },
    get lastAdmittedAcquisition() { return lastAdmittedAcquisition; },
    get baseline() { return baseline; },
    bumpGeneration,
    markWorkerReady,
    ingestCalibrationEar,
    completeCalibration,
    calibrationExpired,
    classifyResult,
    inspectAdmission,
    noteAdmitted,
    cleanup: bumpGeneration
  };
}
