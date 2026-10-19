import { acquireCamera, cameraErrorMessage } from './camera.js';
import { extractFeatures } from '../features/extract.js';
import { median } from '../shared/statistics.js';
import { CALIBRATION_DEADLINE_MS, createTrackingLifecycle } from './lifecycle.js';

function defaultCameraSupported() {
  return typeof isSecureContext !== 'undefined' && isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export function createTrackingController({
  $,
  status,
  updateSetup,
  getActive,
  getSessionStart,
  finish,
  updateLive,
  getAccumulator,
  getAwaitingRating,
  getTaskWindow = () => null,
  onRejectedFrame = () => {},
  onDropout = () => {},
  now = () => performance.now(),
  acquire = acquireCamera,
  cameraSupported = defaultCameraSupported,
  WorkerImpl = globalThis.Worker,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setFrameInterval = setInterval,
  clearFrameInterval = clearInterval
}) {
  const lifecycle = createTrackingLifecycle({ now });
  let worker = null, stream = null, frameBusy = false, frameTimer, lastVideoTime = -1;
  let modelTimeout = 0, calibrationWatchdog = 0;

  function clearLifecycleTimers() {
    clearTimer(modelTimeout); modelTimeout = 0;
    clearTimer(calibrationWatchdog); calibrationWatchdog = 0;
    clearFrameInterval(frameTimer); frameTimer = 0;
  }

  function stopCamera() {
    const generation = lifecycle.cleanup();
    clearLifecycleTimers();
    worker?.terminate(); worker = null; frameBusy = false;
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
    $('video').srcObject = null; $('preview').classList.remove('running'); $('camera-placeholder').hidden = false; lastVideoTime = -1;
    updateSetup();
    return generation;
  }

  function cameraFailure(message, failureGeneration = lifecycle.generation) {
    if (failureGeneration !== lifecycle.generation) return;
    if (getActive()) {
      getActive().events.push({ type: 'camera_error', elapsed_ms: now() - getSessionStart(), message });
      finish('interrupted', '摄像头或追踪异常，会话已中断。');
    }
    stopCamera();
    status(message, true);
    updateSetup();
  }

  function startCalibrationWatchdog(generation) {
    clearTimer(calibrationWatchdog);
    calibrationWatchdog = setTimer(() => {
      if (generation !== lifecycle.generation) return;
      if (lifecycle.calibrationExpired(now())) {
        cameraFailure('校准未获得足够有效眼部帧。调整光线、正对镜头后重试；也可使用仅任务模式。');
      }
    }, CALIBRATION_DEADLINE_MS);
  }

  function admitResult(acquisitionTs, features, resultGeneration) {
    const processedTs = now();
    const decision = lifecycle.classifyResult({
      acquisitionTs,
      processedTs,
      resultGeneration,
      sessionStart: getActive() ? getSessionStart() : null,
      taskWindow: getTaskWindow()
    });
    if (!decision.admit) {
      if (decision.reason !== 'no_session') onRejectedFrame(decision);
      return null;
    }
    const gap = lifecycle.noteAdmitted(acquisitionTs);
    if (gap.dropout) {
      onDropout({
        session_elapsed_ms: decision.session_elapsed_ms,
        gap_ms: gap.gap_ms,
        source: 'camera'
      });
    }
    const sample = getAccumulator().add(decision.session_elapsed_ms, features, 'camera', {
      acquired_elapsed_ms: decision.acquired_elapsed_ms,
      processed_elapsed_ms: decision.processed_elapsed_ms
    });
    updateLive(decision.session_elapsed_ms, features);
    return sample;
  }

  async function enableCamera() {
    if (!$('consent').checked || getActive() || getAwaitingRating()) return;
    if (!cameraSupported()) {
      status('此环境不支持摄像头。请使用 localhost 或 HTTPS，或选择仅任务模式。', true);
      return;
    }
    stopCamera();
    const generation = lifecycle.generation;
    $('camera').disabled = true;
    try {
      status('等待摄像头权限…');
      const acquired = await acquire();
      if (generation !== lifecycle.generation || !$('consent').checked || $('mode').value !== 'camera') {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        if (generation !== lifecycle.generation) return;
        cameraFailure('摄像头连接已断开。可以重新启用，或切换到仅任务模式。', generation);
      }, { once: true }));
      $('video').srcObject = stream;
      await $('video').play();
      if (generation !== lifecycle.generation) return;
      $('preview').classList.add('running');
      $('camera-placeholder').hidden = true;
      status('正在加载本地面部追踪模型…');
      $('camera-overlay').textContent = '模型加载中';
      worker = new WorkerImpl(new URL('../tracker.worker.js', import.meta.url));
      modelTimeout = setTimer(() => {
        if (generation === lifecycle.generation && !lifecycle.workerReady) {
          cameraFailure('模型加载超时。请确认 vendor 资产完整并重新启用。');
        }
      }, 30000);
      worker.onerror = (event) => {
        clearTimer(modelTimeout);
        if (generation === lifecycle.generation) cameraFailure(`追踪模块不可用：${event.message}`);
      };
      worker.onmessage = (event) => {
        if (generation !== lifecycle.generation) return;
        const message = event.data;
        if (message.type === 'ready') {
          clearTimer(modelTimeout);
          lifecycle.markWorkerReady(now());
          startCalibrationWatchdog(generation);
          status('校准中：请自然睁眼，看向屏幕约 3 秒。');
          $('camera-overlay').textContent = '自然睁眼 · 校准中';
          frameTimer = setFrameInterval(() => captureFrame(generation), 100);
          updateSetup();
        } else if (message.type === 'error') {
          clearTimer(modelTimeout);
          cameraFailure(`追踪模块错误：${message.message}`);
        } else if (message.type === 'result') {
          frameBusy = false;
          const features = extractFeatures(message.result, message.frameWidth, message.frameHeight);
          if (!lifecycle.ready) {
            const progress = lifecycle.ingestCalibrationEar(features.ear, message.timestamp, now());
            if (progress.expired) {
              cameraFailure('校准未获得足够有效眼部帧。调整光线、正对镜头后重试；也可使用仅任务模式。', generation);
              return;
            }
            if (progress.enough) {
              const completed = lifecycle.completeCalibration(median(progress.frames));
              if (completed.ok === true) {
                clearTimer(calibrationWatchdog);
                status(`已校准，EAR 基线 ${lifecycle.baseline.toFixed(3)}。请保持脸部在画面内。`);
                $('camera-overlay').textContent = '本地追踪 · 已校准';
                updateSetup();
              } else if (completed.reason === 'calibration_deadline') {
                cameraFailure('校准未获得足够有效眼部帧。调整光线、正对镜头后重试；也可使用仅任务模式。', generation);
                return;
              }
            }
          }
          if (getActive() && getActive().mode === 'camera') {
            admitResult(message.timestamp, features, generation);
          } else if (lifecycle.ready) {
            $('live-eyes').textContent = !features.face_present ? '未检出' : features.ear < lifecycle.baseline * 0.65 ? '闭合' : '睁开';
          }
        }
      };
      worker.postMessage({ type: 'init' });
    } catch (error) {
      if (generation !== lifecycle.generation) return;
      cameraFailure(cameraErrorMessage(error));
    }
  }

  async function captureFrame(generation) {
    if (!lifecycle.workerReady || frameBusy || $('video').readyState < 2 || globalThis.document?.hidden || lastVideoTime === $('video').currentTime) return;
    frameBusy = true;
    lastVideoTime = $('video').currentTime;
    try {
      const timestamp = now();
      const bitmap = await createImageBitmap($('video'));
      if (generation !== lifecycle.generation || !worker) {
        bitmap.close();
        if (generation === lifecycle.generation) frameBusy = false;
        return;
      }
      worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]);
    } catch (error) {
      if (generation === lifecycle.generation) {
        frameBusy = false;
        cameraFailure(`摄像头帧读取失败：${error.message}`, generation);
      }
    }
  }

  return {
    enable: enableCamera,
    stop: stopCamera,
    admitResult,
    get lifecycle() { return lifecycle; },
    get worker() { return worker; },
    get ready() { return lifecycle.ready; },
    get baseline() { return lifecycle.baseline; },
    get calibrationFrames() { return lifecycle.calibrationFrames; }
  };
}
