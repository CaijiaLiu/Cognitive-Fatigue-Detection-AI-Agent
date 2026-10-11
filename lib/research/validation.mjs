const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const isId=v=>typeof v==='string'&&uuid.test(v);
const numeric=v=>v===null?null:typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e9?v:null;
const keys=(v,names)=>Object.fromEntries(names.map(k=>[k,numeric(v?.[k])]));
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function sanitizeSession(s){
 if(!s||!isId(s.session_id)||!isId(s.participant_id)||!['camera','simulated','behavior'].includes(s.mode)||!['completed','interrupted'].includes(s.status))throw Error('会话格式不正确');
 if(!s.upload_consent?.accepted||s.upload_consent.version!=='upload-v1'||!date(s.upload_consent.accepted_at)||!date(s.consent?.accepted_at))throw Error('缺少单独上传同意');
 if(!date(s.started_at)||!date(s.ended_at)||Date.parse(s.ended_at)<Date.parse(s.started_at)||!Number.isFinite(s.duration_ms)||s.duration_ms<0||s.duration_ms>660000)throw Error('时间范围不正确');
 if(![s.fatigue_pre,s.fatigue_post].every(x=>Number.isInteger(x)&&x>=1&&x<=10))throw Error('缺少前后自评');
 if(!Array.isArray(s.samples)||s.samples.length>7500||!Array.isArray(s.trials)||s.trials.length>1200||!Array.isArray(s.blink_events)||s.blink_events.length>1200)throw Error('记录数量超限');
 const expected=s.mode==='camera'?'camera':s.mode==='simulated'?'simulated':'unavailable';
 if(s.sources?.vision!==expected||s.sources?.behavior!=='human'||s.sources?.ratings!=='self_report')throw Error('数据来源标记不一致');
 const samples=s.samples.map(r=>{
  if(r.source!==expected||!Number.isFinite(r.elapsed_ms)||r.elapsed_ms<0||r.elapsed_ms>s.duration_ms+1000)throw Error('视觉样本来源或时间不正确');
  return {...keys(r,['elapsed_ms','eye_aspect_ratio','gaze_x','gaze_y']),source:r.source,face_present:r.face_present===true,eyes_closed:typeof r.eyes_closed==='boolean'?r.eyes_closed:null,head_rotation:Array.isArray(r.head_rotation)&&r.head_rotation.length===9?r.head_rotation.map(numeric):null,quality:['no_face','eyes_unavailable','tracking_gap','closed_eyes','valid'].includes(r.quality)?r.quality:'unknown'};
 });
 const trials=s.trials.map(r=>{
  if(!['go','no-go'].includes(r.type)||r.source!=='human')throw Error('任务来源不正确');
  return {...keys(r,['index','onset_ms','deadline_ms','response_ms','reaction_ms']),type:r.type,responded:r.responded===true,correct:r.correct===true,source:'human',invalid_reason:typeof r.invalid_reason==='string'?r.invalid_reason.slice(0,80):null};
 });
 return {schema_version:'1.0.0',session_id:s.session_id,participant_id:s.participant_id,mode:s.mode,status:s.status,started_at:date(s.started_at),ended_at:date(s.ended_at),duration_ms:s.duration_ms,fatigue_pre:s.fatigue_pre,fatigue_post:s.fatigue_post,post_rating_at:date(s.post_rating_at),sources:{vision:expected,behavior:'human',ratings:'self_report'},consent:{version:String(s.consent.version).slice(0,50),accepted_at:date(s.consent.accepted_at)},upload_consent:{accepted:true,version:'upload-v1',accepted_at:date(s.upload_consent.accepted_at)},config:{protocol:'go-no-go-v1',...keys(s.config,['planned_duration_ms','response_window_ms','go_probability','vision_sample_hz','ear_baseline','close_ratio','open_ratio','max_gap_ms'])},vision_summary:keys(s.vision_summary,['blink_count','blink_rate_per_min','closed_time_ms','closed_fraction','valid_tracking_ms','tracking_coverage','head_motion_deg_per_sec','gaze_position_sd_eye_width','mean_blink_duration_ms','sample_count']),behavior_summary:keys(s.behavior_summary,['trial_count','valid_trial_count','invalid_trial_count','accuracy','go_accuracy','no_go_accuracy','median_reaction_ms','mean_reaction_ms','reaction_sd_ms','omissions','false_alarms','anticipations']),samples,trials,blink_events:s.blink_events.map(r=>keys(r,['start_ms','duration_ms'])),calibration:s.calibration?{source:s.mode==='camera'?'camera':'simulated',...keys(s.calibration,['ear_baseline','frame_count','frame_width','frame_height'])}:null};
}
