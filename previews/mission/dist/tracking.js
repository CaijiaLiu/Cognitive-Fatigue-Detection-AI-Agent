import { acquireCamera, cameraErrorMessage } from './camera.js';
import { extractFeatures, median } from './core.js';
export class LocalTracker {
  constructor({video,onStatus,onFeature,onReady,onFailure}){Object.assign(this,{video,onStatus,onFeature,onReady,onFailure});this.generation=0;this.ready=false;this.baseline=null;}
  stop(){this.generation++;clearInterval(this.timer);clearTimeout(this.loadTimer);this.worker?.terminate();this.worker=null;
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;this.ready=false;this.baseline=null;this.busy=false;}
  async start(){this.stop();const generation=this.generation;this.onStatus('Waiting for camera permission…');
    try{if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Open this page using HTTPS or localhost to enable the camera.');
      const stream=await acquireCamera();if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();if(generation!==this.generation)return;
      stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(generation===this.generation)this.fail('The camera was disconnected.');},{once:true}));
      this.worker=new Worker(new URL('./tracker.worker.js',import.meta.url));this.onStatus('Loading the local model…');
      this.loadTimer=setTimeout(()=>{if(generation===this.generation)this.fail('Model loading timed out. Retry or choose Task only.');},30000);
      this.worker.onerror=e=>{if(generation===this.generation)this.fail('Tracking is unavailable: '+e.message);};
      this.worker.onmessage=e=>{if(generation!==this.generation)return;const m=e.data;
        if(m.type==='ready'){clearTimeout(this.loadTimer);this.calibration=[];this.calibrationAt=performance.now();this.last=-1;
          this.onStatus('Keep your eyes naturally open and look at the screen for about 3 seconds…');this.timer=setInterval(()=>this.capture(generation),100);}
        if(m.type==='error')this.fail('Local tracking failed: '+m.message);
        if(m.type==='result'){this.busy=false;const f=extractFeatures(m.result,m.frameWidth,m.frameHeight);
          if(!this.ready){if(f.face_present&&f.ear>.15&&f.ear<.6)this.calibration.push(f.ear);
            if(m.timestamp-this.calibrationAt>=3000&&this.calibration.length>=20){this.baseline=median(this.calibration);this.ready=true;this.onReady();this.onStatus('Local tracking is ready.');}
            else if(m.timestamp-this.calibrationAt>15000){this.fail('Not enough eye-calibration data. Adjust your lighting and retry.');return;}}
          if(this.ready)this.onFeature(m.timestamp,f);}
      };this.worker.postMessage({type:'init'});
    }catch(e){if(generation===this.generation)this.fail(cameraErrorMessage(e));}
  }
  fail(message){this.stop();this.onStatus(message,true);this.onFailure(message);}
  async capture(generation){if(this.busy||!this.worker||this.video.readyState<2||document.hidden||this.last===this.video.currentTime)return;
    this.busy=true;this.last=this.video.currentTime;try{const timestamp=performance.now(),bitmap=await createImageBitmap(this.video);
      if(generation!==this.generation||!this.worker){bitmap.close();this.busy=false;return;}this.worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);
    }catch(e){this.busy=false;if(generation===this.generation)this.fail('Cannot read camera frames: '+e.message);}}
}
