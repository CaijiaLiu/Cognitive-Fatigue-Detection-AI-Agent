export const SCHEMA_VERSION = '1.0.0';
export const CONSENT_VERSION = 'v1-2026-10-10';
export const median = values => { const a = values.filter(Number.isFinite).sort((x,y)=>x-y); if (!a.length) return null; const m = Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2; };
export const mean = values => { const a = values.filter(Number.isFinite); return a.length ? a.reduce((s,x)=>s+x,0)/a.length : null; };
export const sd = values => { const a = values.filter(Number.isFinite); const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)) : null; };
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function ear(p, ids) {
  const q = ids.map(i=>p[i]); if (q.some(x=>!x)) return null;
  const width = distance(q[0],q[3]);
  return width > .001 ? (distance(q[1],q[5])+distance(q[2],q[4]))/(2*width) : null;
}
function iris(p, corners, lids, center) {
  if (![...corners,...lids,center].every(i=>p[i])) return null;
  const a=p[corners[0]], b=p[corners[1]], c=p[center];
  const dx=b.x-a.x, dy=b.y-a.y, w2=dx*dx+dy*dy;
  if (w2 < .000001) return null;
  const mid={x:(p[lids[0]].x+p[lids[1]].x)/2,y:(p[lids[0]].y+p[lids[1]].y)/2};
  return {x:((c.x-a.x)*dx+(c.y-a.y)*dy)/w2, y:((c.x-mid.x)*-dy+(c.y-mid.y)*dx)/w2};
}
export function extractFeatures(result,frameWidth=1,frameHeight=1) {
  const landmarks=result.faceLandmarks?.[0];
  if (!landmarks) return { face_present: false, ear:null, gaze_x:null, gaze_y:null, rotation:null };
  // Coordinates are normalized independently by width/height: undo that aspect ratio
  // before measuring distances, using width as the common unit.
  const p=landmarks.map(point=>({...point,y:point.y*frameHeight/frameWidth}));
  const left=ear(p,[33,160,158,133,153,144]);
  const right=ear(p,[362,385,387,263,373,380]);
  const l=iris(p,[33,133],[159,145],468), r=iris(p,[362,263],[386,374],473);
  const data=result.facialTransformationMatrixes?.[0]?.data;
  // Rotation columns from the column-major facial transform. Normalize to remove scale.
  let rotation=null;
  if (data?.length===16) {
    rotation=[];
    for (const c of [0,4,8]) { const length=Math.hypot(data[c],data[c+1],data[c+2]); if (!length) {rotation=null;break;} rotation.push(data[c]/length,data[c+1]/length,data[c+2]/length); }
  }
  return {face_present:true,ear:left!==null&&right!==null?(left+right)/2:null,gaze_x:l&&r?(l.x+r.x)/2:null,gaze_y:l&&r?(l.y+r.y)/2:null,rotation};
}
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
export function summarizeTrials(trials) {
  const valid=trials.filter(t=>!t.invalid_reason);
  const correct=valid.filter(t=>t.correct);
  const go=valid.filter(t=>t.type==='go');
  const noGo=valid.filter(t=>t.type==='no-go');
  const times=go.filter(t=>t.correct).map(t=>t.reaction_ms);
  return {trial_count:trials.length,valid_trial_count:valid.length,invalid_trial_count:trials.length-valid.length,accuracy:valid.length?correct.length/valid.length:null,go_accuracy:go.length?go.filter(t=>t.correct).length/go.length:null,no_go_accuracy:noGo.length?noGo.filter(t=>t.correct).length/noGo.length:null,median_reaction_ms:median(times),mean_reaction_ms:mean(times),reaction_sd_ms:sd(times),omissions:go.filter(t=>!t.responded).length,false_alarms:noGo.filter(t=>t.responded).length,anticipations:valid.filter(t=>t.responded&&t.reaction_ms<100).length};
}
export function simulatedFeatures(time) {
  const closed=time%3600>=2200&&time%3600<2400;
  const angle=.035*Math.sin(time/900);
  return {face_present:true,ear:closed?.09:.3+.012*Math.sin(time/800),gaze_x:.5+.028*Math.sin(time/1300),gaze_y:.01*Math.cos(time/1500),rotation:[Math.cos(angle),Math.sin(angle),0,-Math.sin(angle),Math.cos(angle),0,0,0,1]};
}
export function makeDemo() {
  const acc=new FeatureAccumulator(.3);
  for(let t=0;t<=60000;t+=100) acc.add(t,simulatedFeatures(t),'simulated');
  const trials=Array.from({length:25},(_,i)=>({index:i,type:i%5===4?'no-go':'go',onset_ms:i*2400,deadline_ms:i*2400+1000,response_ms:i%5===4?null:i*2400+300+i*4,reaction_ms:i%5===4?null:300+i*4,responded:i%5!==4,correct:true,invalid_reason:null,source:'simulated'}));
  const ended=Date.now();
  return {schema_version:SCHEMA_VERSION,session_id:'demo-'+crypto.randomUUID(),participant_id:'demo-anonymous',started_at:new Date(ended-60000).toISOString(),ended_at:new Date(ended).toISOString(),duration_ms:60000,status:'completed',mode:'demo',sources:{vision:'simulated',behavior:'simulated',ratings:'simulated'},consent:null,fatigue_pre:3,fatigue_post:6,config:{protocol:'go-no-go-v1',planned_duration_ms:60000,vision_sample_hz:10,ear_baseline:.3,close_ratio:.65,open_ratio:.8,blink_range_ms:[80,800],max_gap_ms:250},vision_summary:acc.summary(60000),behavior_summary:summarizeTrials(trials),samples:acc.samples,blink_events:acc.blinks,trials,events:[],calibration:{source:'simulated',ear_baseline:.3},notes:['All data in this example is synthetic.']};
}
export const csvCell = value => { if (value===null||value===undefined) return ''; const s=typeof value==='object'?JSON.stringify(value):String(value); const safe=/^[=+@\t\r]/.test(s)||(/^-.+/.test(s)&&!Number.isFinite(Number(s)))?"'"+s:s; return '"'+safe.replaceAll('"','""')+'"'; };
export function toCSV(rows) { if(!rows.length) return ''; const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))]; return '\uFEFF'+keys.map(csvCell).join(',')+'\r\n'+rows.map(r=>keys.map(k=>csvCell(r[k])).join(',')).join('\r\n'); }
export function exportRows(sessions,kind='sessions') {
  if(kind==='sessions') return sessions.map(s=>({schema_version:s.schema_version,session_id:s.session_id,participant_id:s.participant_id,started_at:s.started_at,ended_at:s.ended_at,status:s.status,mode:s.mode,vision_source:s.sources.vision,behavior_source:s.sources.behavior,ratings_source:s.sources.ratings,consent_version:s.consent?.version??null,duration_ms:s.duration_ms,fatigue_pre:s.fatigue_pre,fatigue_post:s.fatigue_post,...s.vision_summary,...s.behavior_summary}));
  return sessions.flatMap(s=>(s[kind]||[]).map(row=>({session_id:s.session_id,participant_id:s.participant_id,vision_source:s.sources.vision,behavior_source:s.sources.behavior,...row})));
}
