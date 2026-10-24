import { median, mean, sd, summarizeTrials } from './core.js';
import { PRESENTATION_VERSION } from './live-camera.js';

export const PROTOCOL_VERSION='mission-exploratory-v1';
export const DURATIONS={pilot:{pvt:180000,attention:240000},demo:{pvt:20000,attention:20000}};
export const EMPTY_VISION={blink_count:null,blink_rate_per_min:null,closed_time_ms:null,closed_fraction:null,tracking_coverage:null,sample_count:0};

export function makeSession({id,participant,mode,purpose,consentAt,startedAt}) {
  return {schema_version:'mission-preview-1',protocol_version:PROTOCOL_VERSION,session_id:id,
    participant_id:participant,started_at:startedAt,ended_at:null,status:'in_progress',mode,purpose,
    presentation:{version:PRESENTATION_VERSION,live_camera_preview:mode==='camera',live_eye_feedback:mode!=='behavior',feedback_scope:'per_task',raw_frame_storage:false},
    sources:{vision:mode==='camera'?'camera':mode==='simulated'?'simulated':'unavailable',behavior:'human',ratings:'self_report'},
    consent:{version:'mission-local-2026-10-12',accepted_at:consentAt,local_only:true},upload_consent:false,
    ratings:{pre:null,between:null,post:null},rating_events:[],tasks:[],events:[],
    notes:['Exploratory web protocols, not validated PVT-B/SART or a diagnosis.','No video recording, no uploads.','Demo-purpose sessions must be excluded from research efficacy evaluation.','Live visual feedback is part of the presentation; compare presentation versions separately.']};
}
export function recordRating(session,stage,value,timestamp){
  if(!['pre','between','post'].includes(stage)||!Number.isInteger(value)||value<1||value>10)throw new Error('Invalid rating');
  session.ratings[stage]=value;session.rating_events.push({stage,value,scale:'mental-fatigue-1-to-10',recorded_at:timestamp});
}
export function summarizePVT(trials){
  const valid=trials.filter(t=>!t.invalid_reason),responses=valid.filter(t=>t.type==='signal'&&t.responded&&t.reaction_ms>=100);
  const times=responses.map(t=>t.reaction_ms).sort((a,b)=>a-b);
  return {trial_count:trials.length,valid_trial_count:valid.length,invalid_trial_count:trials.length-valid.length,
    median_reaction_ms:median(times),mean_reaction_ms:mean(times),reaction_sd_ms:sd(times),
    mean_response_speed_per_sec:mean(times.map(t=>1000/t)),slowest_10pct_mean_ms:mean(times.slice(-Math.max(1,Math.ceil(times.length*.1)))),
    false_starts:valid.filter(t=>t.type==='false-start'||(t.responded&&t.reaction_ms<100)).length,
    omissions:valid.filter(t=>t.type==='signal'&&!t.responded).length,
    responses_ge_500ms:times.filter(t=>t>=500).length};
}
export function taskSummary(kind,trials){return kind==='pvt'?summarizePVT(trials):summarizeTrials(trials);}
export function asCSV(rows){
  if(!rows.length)return ''; const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return '\uFEFF'+[keys.map(quote).join(','),...rows.map(r=>keys.map(k=>quote(typeof r[k]==='object'&&r[k]!==null?JSON.stringify(r[k]):r[k])).join(','))].join('\r\n');
}
export function summaryRows(s){return s.tasks.map(t=>({session_id:s.session_id,participant_id:s.participant_id,purpose:s.purpose,
  status:s.status,protocol_version:s.protocol_version,presentation_version:s.presentation?.version??null,live_eye_feedback:s.presentation?.live_eye_feedback??null,mode:s.mode,vision_source:s.sources.vision,behavior_source:s.sources.behavior,
  started_at:s.started_at,ended_at:s.ended_at,fatigue_pre:s.ratings.pre,fatigue_between:s.ratings.between,fatigue_post:s.ratings.post,
  task:t.kind,task_duration_ms:t.duration_ms,task_status:t.status,...t.behavior_summary,...t.vision_summary}));}

// All clocks and frame scheduling are injectable: unit tests do not need a camera/browser.
export class MissionTask {
  constructor({kind,duration,onStimulus,onTick,onEnd,random=Math.random,clock=()=>performance.now(),
    timeout=(f,ms)=>setTimeout(f,ms),clear=id=>clearTimeout(id),frame=f=>requestAnimationFrame(f),cancelFrame=id=>cancelAnimationFrame(id)}){
    Object.assign(this,{kind,duration,onStimulus,onTick,onEnd,random,clock,timeout,clear,frame,cancelFrame});
    this.running=false;this.trials=[];this.events=[];this.current=null;this.timers=new Set();this.frameId=null;this.phase='idle';
  }
  later(fn,ms){let id;id=this.timeout(()=>{this.timers.delete(id);if(this.running)fn();},ms);this.timers.add(id);return id;}
  elapsed(){return Math.max(0,this.clock()-this.started);}
  start(){if(this.running)throw new Error('Already running');this.started=this.clock();this.running=true;this.phase='waiting';
    this.onStimulus({state:'waiting'});this.later(()=>this.finish('completed'),this.duration);this.tick();this.schedule();}
  tick(){this.onTick(Math.max(0,this.duration-this.elapsed()),this.elapsed()/this.duration);this.later(()=>this.tick(),100);}
  schedule(){if(this.elapsed()+1200>=this.duration)return;
    const delay=this.kind==='pvt'?1000+this.random()*3000:600+this.random()*700;
    this.phase='waiting';this.onStimulus({state:'waiting'});this.later(()=>this.show(),delay);}
  show(){if(this.elapsed()+1000>=this.duration)return;
    this.frameId=this.frame(()=>{this.frameId=null;if(!this.running)return;
      const type=this.kind==='pvt'?'signal':this.random()<.75?'go':'no-go';
      const onset=this.elapsed();this.phase='stimulus';this.current={index:this.trials.length,type,onset_ms:onset,
        deadline_ms:onset+(this.kind==='pvt'?10000:1000),response_ms:null,reaction_ms:null,responded:false,correct:false,
        invalid_reason:null,source:'human',input:null};
      this.onStimulus({state:'stimulus',type});this.responseTimer=this.later(()=>this.close(),this.kind==='pvt'?10000:1000);
    });}
  respond(input='keyboard'){
    if(!this.running)return;
    if(this.kind==='pvt'&&this.phase==='waiting'){
      this.trials.push({index:this.trials.length,type:'false-start',onset_ms:this.elapsed(),deadline_ms:null,response_ms:this.elapsed(),
        reaction_ms:null,responded:true,correct:false,invalid_reason:null,source:'human',input});
      this.events.push({type:'false-start',elapsed_ms:this.elapsed()});return;
    }
    const t=this.current;if(!t||t.responded||this.elapsed()>t.deadline_ms)return;
    t.responded=true;t.response_ms=this.elapsed();t.reaction_ms=t.response_ms-t.onset_ms;t.input=input;
    if(this.kind==='pvt')this.close();
  }
  close(invalid=null){const t=this.current;if(!t)return;
    this.clear(this.responseTimer);this.timers.delete(this.responseTimer);
    if(!invalid&&this.elapsed()-t.deadline_ms>150)invalid='timer_lag_over_150ms';
    t.invalid_reason=invalid;t.correct=!invalid&&(t.type==='no-go'?!t.responded:t.responded&&t.reaction_ms>=100);
    this.trials.push(t);this.current=null;this.phase='feedback';
    this.onStimulus({state:this.kind==='pvt'?'received':'waiting'});
    if(!invalid)this.later(()=>this.schedule(),this.kind==='pvt'?800:0);
  }
  finish(status='interrupted',reason=null){if(!this.running)return;this.running=false;
    this.close('session_ended_before_deadline');for(const id of this.timers)this.clear(id);this.timers.clear();
    if(this.frameId!==null)this.cancelFrame(this.frameId);this.frameId=null;this.phase='ended';
    this.onEnd({kind:this.kind,status,reason,duration_ms:this.elapsed(),planned_duration_ms:this.duration,
      protocol:this.kind==='pvt'?'pvt-web-exploratory-v1':'go-no-go-v1-game-skin',trials:this.trials,events:this.events,
      behavior_summary:taskSummary(this.kind,this.trials),timing:'performance.now; animation-frame onset estimate, not hardware-validated'});
  }
}
