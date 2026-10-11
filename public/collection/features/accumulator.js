import { mean, sd } from '../shared/statistics.js';
export class FeatureAccumulator {
  constructor(baseline=.3) { this.baseline=baseline; this.samples=[]; this.blinks=[]; this.previous=null; this.closedStart=null; this.validMs=0; this.closedMs=0; this.headTravel=0; this.headMs=0; this.gaze=[]; }
  add(time, f, source='camera') {
    const valid=f.face_present && Number.isFinite(f.ear);
    const dt=this.previous ? time-this.previous.time : 0;
    const continuous=dt>0&&dt<=250&&this.previous?.valid&&valid;
    const gap=this.previous&&(!continuous);
    if (gap) this.closedStart=null;
    const ratio=valid?f.ear/this.baseline:null;
    let closed=false;
    if (valid) {
      closed=this.closedStart!==null ? ratio<.8 : ratio<.65;
      if (closed&&this.closedStart===null) this.closedStart=time;
      if (!closed&&this.closedStart!==null) {
        const duration=time-this.closedStart;
        if (duration>=80&&duration<=800) this.blinks.push({start_ms:this.closedStart,duration_ms:duration});
        this.closedStart=null;
      }
      if (continuous) {
        this.validMs+=dt;
        if (this.previous.closed) this.closedMs+=dt;
        if (f.rotation&&this.previous.rotation) {
          const trace=f.rotation.reduce((sum,v,i)=>sum+v*this.previous.rotation[i],0);
          this.headTravel+=Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)))*180/Math.PI;
          this.headMs+=dt;
        }
      }
      if (!closed&&Number.isFinite(f.gaze_x)&&Number.isFinite(f.gaze_y)) this.gaze.push({time,x:f.gaze_x,y:f.gaze_y});
    }
    this.gaze=this.gaze.filter(g=>g.time>=time-5000);
    const sample={elapsed_ms:time,source,face_present:!!f.face_present,eye_aspect_ratio:valid?f.ear:null,eyes_closed:valid?closed:null,gaze_x:valid&&!closed?f.gaze_x:null,gaze_y:valid&&!closed?f.gaze_y:null,head_rotation:f.rotation||null,quality:!f.face_present?'no_face':!valid?'eyes_unavailable':gap?'tracking_gap':closed?'closed_eyes':'valid'};
    this.samples.push(sample);
    this.previous={time,valid,closed,rotation:f.rotation};
    return sample;
  }
  summary(durationMs) {
    const gazeSamples=this.samples.filter(s=>Number.isFinite(s.gaze_x)&&Number.isFinite(s.gaze_y));
    return {blink_count:this.blinks.length,blink_rate_per_min:this.validMs>=1000?this.blinks.length*60000/this.validMs:null,closed_time_ms:this.closedMs,closed_fraction:this.validMs?this.closedMs/this.validMs:null,valid_tracking_ms:this.validMs,tracking_coverage:durationMs?Math.min(1,this.validMs/durationMs):0,head_motion_deg_per_sec:this.headMs?this.headTravel/(this.headMs/1000):null,gaze_position_sd_eye_width:gazeSamples.length>1?Math.hypot(sd(gazeSamples.map(s=>s.gaze_x)),sd(gazeSamples.map(s=>s.gaze_y))):null,mean_blink_duration_ms:mean(this.blinks.map(b=>b.duration_ms)),sample_count:this.samples.length};
  }
}
