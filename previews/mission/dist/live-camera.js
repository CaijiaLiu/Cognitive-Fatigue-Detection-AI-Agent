import { FeatureAccumulator } from './core.js';

export const PRESENTATION_VERSION = 'mission-en-v0.3-live-eyes';

// Read the same calibrated, hysteretic eye state used by task collection.
// A long eye closure is not necessarily a blink; lost tracking is never OPEN.
export function cameraReadout(acc, sample, {source='camera', scope='Preview only', stale=false}={}) {
  const known=sample?.eyes_closed!==null && sample?.eyes_closed!==undefined;
  const measured=!!acc && (acc.validMs>0 || known);
  const state=stale?'paused':!sample?'waiting':!sample.face_present?'no_face':!known?'unavailable':sample.eyes_closed?'closed':'open';
  return {source,scope,state,
    blink_count:measured?acc.blinks.length:null,
    blink_rate_per_min:acc?.validMs>=5000?acc.blinks.length*60000/acc.validMs:null,
    closed_time_ms:measured?acc.closedMs:null,
    tracking_coverage:measured&&sample.elapsed_ms>0?Math.min(1,acc.validMs/sample.elapsed_ms):null,
    eye_aspect_ratio:!stale&&known?sample.eye_aspect_ratio:null,
    current_closure_ms:!stale&&sample?.eyes_closed&&acc.closedStart!==null?Math.max(0,sample.elapsed_ms-acc.closedStart):null};
}

// Preparation/intermission feedback is transient, never exported as task data.
export class LiveEyePreview {
  constructor(){this.reset();}
  reset(baseline=null){this.acc=Number.isFinite(baseline)&&baseline>0?new FeatureAccumulator(baseline):null;this.started=null;this.sample=null;}
  observe(timestamp,features){
    if(!this.acc)return cameraReadout(null,null);
    if(this.started===null)this.started=timestamp;
    this.sample=this.acc.add(timestamp-this.started,features,'camera');
    // Do not retain the preview time series. Keep only transient counters.
    this.acc.samples.length=0;
    return this.read();
  }
  read(stale=false){return cameraReadout(this.acc,this.sample,{scope:'Preview only',stale});}
}
