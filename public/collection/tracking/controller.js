import { acquireCamera, cameraErrorMessage } from './camera.js';
import { extractFeatures } from '../features/extract.js';
import { median } from '../shared/statistics.js';
export function createTrackingController({$,status,updateSetup,getActive,getSessionStart,finish,updateLive,getAccumulator,getAwaitingRating}) {
let worker=null,stream=null,cameraReady=false,workerReady=false,frameBusy=false,cameraGeneration=0,frameTimer,lastVideoTime=-1;
let baseline=null,calibrationFrames=[],calibrationStarted=0,calibrationDeadline=0;
function stopCamera(){
  cameraGeneration++;clearInterval(frameTimer);worker?.terminate();worker=null;workerReady=false;cameraReady=false;frameBusy=false;baseline=null;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  $('video').srcObject=null;$('preview').classList.remove('running');$('camera-placeholder').hidden=false;lastVideoTime=-1;
  updateSetup();
}
function cameraFailure(message){
  if(getActive()) {getActive().events.push({type:'camera_error',elapsed_ms:performance.now()-getSessionStart(),message});finish('interrupted','摄像头或追踪异常，会话已中断。');}
  stopCamera();status(message,true);updateSetup();
}
async function enableCamera(){
  if(!$('consent').checked||getActive()||getAwaitingRating()) return;
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){status('此环境不支持摄像头。请使用 localhost 或 HTTPS，或选择仅任务模式。',true);return;}
  stopCamera();const generation=cameraGeneration;$('camera').disabled=true;
  try {
    status('等待摄像头权限…');
    const acquired=await acquireCamera();
    if(generation!==cameraGeneration||!$('consent').checked||$('mode').value!=='camera'){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;
    stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>cameraFailure('摄像头连接已断开。可以重新启用，或切换到仅任务模式。'),{once:true}));
    $('video').srcObject=stream;await $('video').play();
    if(generation!==cameraGeneration)return;
    $('preview').classList.add('running');$('camera-placeholder').hidden=true;
    status('正在加载本地面部追踪模型…');$('camera-overlay').textContent='模型加载中';
    worker=new Worker(new URL('../tracker.worker.js', import.meta.url));
    const modelTimeout=setTimeout(()=>{if(generation===cameraGeneration&&!workerReady)cameraFailure('模型加载超时。请确认 vendor 资产完整并重新启用。');},30000);
    worker.onerror=event=>{clearTimeout(modelTimeout);if(generation===cameraGeneration)cameraFailure(`追踪模块不可用：${event.message}`);};
    worker.onmessage=event=>{
      if(generation!==cameraGeneration)return;
      const m=event.data;
      if(m.type==='ready') {
        clearTimeout(modelTimeout);workerReady=true;calibrationFrames=[];calibrationStarted=performance.now();calibrationDeadline=calibrationStarted+15000;
        status('校准中：请自然睁眼，看向屏幕约 3 秒。');$('camera-overlay').textContent='自然睁眼 · 校准中';
        frameTimer=setInterval(()=>captureFrame(generation),100);updateSetup();
      } else if(m.type==='error'){clearTimeout(modelTimeout);cameraFailure(`追踪模块错误：${m.message}`);}
      else if(m.type==='result') {
        frameBusy=false;
        const f=extractFeatures(m.result,m.frameWidth,m.frameHeight);
        if(!cameraReady) {
          if(f.face_present&&f.ear>.15&&f.ear<.6)calibrationFrames.push(f.ear);
          const elapsed=m.timestamp-calibrationStarted;
          if(elapsed>=3000&&calibrationFrames.length>=20){
            baseline=median(calibrationFrames);cameraReady=true;
            status(`已校准，EAR 基线 ${baseline.toFixed(3)}。请保持脸部在画面内。`);$('camera-overlay').textContent='本地追踪 · 已校准';updateSetup();
          } else if(m.timestamp>calibrationDeadline){cameraFailure('校准未获得足够有效眼部帧。调整光线、正对镜头后重试；也可使用仅任务模式。');}
        }
        if(getActive()&&getActive().mode==='camera') {
          const elapsed=m.timestamp-getSessionStart();
          if(elapsed>=0){getAccumulator().add(elapsed,f,'camera');updateLive(elapsed,f);}
        } else if(cameraReady) {
          $('live-eyes').textContent=!f.face_present?'未检出':f.ear<baseline*.65?'闭合':'睁开';
        }
      }
    };
    worker.postMessage({type:'init'});
  } catch(error){
    if(generation!==cameraGeneration)return;
    cameraFailure(cameraErrorMessage(error));
  }
}
async function captureFrame(generation){
  if(!workerReady||frameBusy||$('video').readyState<2||document.hidden||lastVideoTime===$('video').currentTime)return;
  frameBusy=true;lastVideoTime=$('video').currentTime;
  try {
    const timestamp=performance.now();
    const bitmap=await createImageBitmap($('video'));
    if(generation!==cameraGeneration||!worker){bitmap.close();frameBusy=false;return;}
    worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);
  } catch(error){frameBusy=false;if(generation===cameraGeneration)cameraFailure(`摄像头帧读取失败：${error.message}`);}
}

return {enable:enableCamera,stop:stopCamera,
 get worker(){return worker;},get ready(){return cameraReady;},get baseline(){return baseline;},get calibrationFrames(){return calibrationFrames;}
};
}
