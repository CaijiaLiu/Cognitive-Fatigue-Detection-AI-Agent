import { FeatureAccumulator, simulatedFeatures } from './core.js';
import { LocalTracker } from './tracking.js';
import { allSessions, putSession, deleteSession, participantId } from './storage.js';
import { MissionTask, DURATIONS, EMPTY_VISION, makeSession, recordRating, asCSV, summaryRows } from './mission.js';
import { LiveEyePreview, cameraReadout } from './live-camera.js';
import { updateAgentLink } from './agent-link.js';

const $=id=>document.getElementById(id);let screen='welcome',purpose='pilot',session=null,task=null,acc=null,
  taskKind='pvt',ratingStage='pre',selected=null,simTimer=null,saveTimer=null,toastTimer=null,discarding=false,lastSaveError=null,
  liveTimer=null,lastLiveStamp=null,lastLiveReadout=null;
const eyePreview=new LiveEyePreview();
const mode=()=>document.querySelector('input[name="mode"]:checked').value;
const format=v=>Number.isFinite(v)?Math.round(v).toString():'—';
const percent=v=>Number.isFinite(v)?Math.round(v*100)+'%':'—';
const time=ms=>{const s=Math.ceil(Math.max(0,ms)/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function renderLive(readout,waitingLabel='Waiting for tracking'){
  lastLiveReadout=readout;
  const labels={waiting:waitingLabel,open:'Open',closed:'Closed',no_face:'No face',unavailable:'Unavailable',paused:'Tracking paused'};
  $('live-eyes').textContent=labels[readout.state];$('live-eyes').dataset.state=readout.state;
  $('live-scope').textContent=(readout.source==='simulated'?'SIMULATED · ':'')+readout.scope.toUpperCase();
  $('live-blinks').textContent=format(readout.blink_count);
  $('live-rate').textContent=Number.isFinite(readout.blink_rate_per_min)?readout.blink_rate_per_min.toFixed(1):'—';
  $('live-closed').textContent=Number.isFinite(readout.closed_time_ms)?(readout.closed_time_ms/1000).toFixed(1)+' s':'—';
  $('live-coverage').textContent=percent(readout.tracking_coverage);
  const ear=Number.isFinite(readout.eye_aspect_ratio)?'EAR '+readout.eye_aspect_ratio.toFixed(2):'Eye estimate unavailable';
  $('live-detail').textContent=readout.state==='closed'?ear+' · Current closure '+(readout.current_closure_ms/1000).toFixed(1)+' s':
    readout.state==='no_face'?'Keep your face in view. Eye state is unknown.':readout.state==='paused'?'No recent frames. Live eye state is unknown.':
    readout.state==='waiting'?'Live estimates appear after calibration.':ear+(readout.blink_rate_per_min===null?' · Rate needs 5 s of valid tracking':' · Research proxy');
  if(readout.state!=='waiting')$('camera-overlay').textContent=(readout.source==='simulated'?'SIMULATED':'LIVE')+' / '+labels[readout.state];
}
function resetLive(label='Not ready'){
  clearInterval(liveTimer);liveTimer=null;lastLiveStamp=null;eyePreview.reset();
  renderLive(cameraReadout(null,null),label);
}
function beginLivePreview(){
  eyePreview.reset(tracker.baseline);lastLiveStamp=null;
  renderLive(eyePreview.read());clearInterval(liveTimer);
  liveTimer=setInterval(()=>{
    if(document.hidden||!tracker.ready||lastLiveStamp===null||performance.now()-lastLiveStamp<=750||lastLiveReadout?.state==='paused')return;
    renderLive({...lastLiveReadout,state:'paused',eye_aspect_ratio:null,current_closure_ms:null});
  },250);
}
function navigate(next){screen=next;$('history-open').disabled=next==='task';document.querySelectorAll('[data-screen]').forEach(e=>e.hidden=e.dataset.screen!==next);
  $('journey-header').hidden=next==='welcome'||next==='history';$('back').hidden=['task','results'].includes(next);
  $('purpose-badge').textContent=purpose==='demo'?'40-second demo / Not research data':'Full preview / Exploratory protocol';
  const group=next==='prepare'||next==='rating'&&ratingStage==='pre'?'prepare':next==='results'?'results':taskKind;
  document.querySelectorAll('[data-progress]').forEach(e=>e.classList.toggle('current',e.dataset.progress===group));
  cameraPlacement();window.scrollTo({top:0,behavior:'instant'});
  const heading=document.querySelector(`[data-screen="${next}"] h1`);heading?.focus({preventScroll:true});
}
function cameraPlacement(){const card=$('camera-card');card.className='camera-card panel';
  if(screen==='prepare'){card.classList.add('in-slot');$('camera-slot').append(card);}
  else if(screen==='task'&&mode()!=='behavior'){card.classList.add('floating','in-task');$('task-camera-slot').append(card);}
  else{document.body.append(card);if(['rating','rules','task'].includes(screen)&&mode()!=='behavior')card.classList.add('floating');}
}
function updatePreparation(){const consent=$('consent').checked,m=mode();
  $('enable-camera').disabled=!consent;$('enable-camera').hidden=m!=='camera';
  $('prepare-next').disabled=!consent||(m==='camera'&&!tracker.ready);
  $('camera-source').textContent=m==='simulated'?'Simulated vision':m==='behavior'?'No camera':tracker.ready?'Live camera':'Not ready';
  $('camera-overlay').textContent=m==='simulated'?'SIMULATED / No live frames':m==='behavior'?'No camera':tracker.ready?'LOCAL TRACKING / Calibrated':'Camera not ready';
  $('prep-hint').textContent=!consent?'Confirm your consent before enabling the camera.':m==='camera'?(tracker.ready?'Your camera is ready. You can continue.':'Enable the camera and complete open-eye calibration, or choose Task only.'):
    m==='simulated'?'Eye and head features are synthetic. Task responses and self-ratings are provided by you.':'No camera features will be collected. Only task performance and self-ratings are recorded.';
}
const tracker=new LocalTracker({video:$('video'),onStatus:(message,error=false)=>{
  $('camera-status').textContent=message;$('camera-status').style.color=error?'#b4775e':'';
  document.querySelector('.camera-preview').classList.toggle('has-video',!!tracker.stream);
  $('camera-placeholder').hidden=!!tracker.stream;$('stop-camera').hidden=!tracker.stream;
  if(!tracker.ready)resetLive(error?'Unavailable':tracker.stream?'Calibrating':'Not ready');
  updatePreparation();},onReady:()=>{beginLivePreview();updatePreparation();},
  onFeature:(stamp,f)=>{
    lastLiveStamp=stamp;
    if(task?.running&&session?.mode==='camera'&&acc){const sample=acc.add(stamp-task.started,f,'camera');renderLive(cameraReadout(acc,sample,{scope:'This mission'}));}
    else renderLive(eyePreview.observe(stamp,f));
  },
  onFailure:message=>{updatePreparation();if(task?.running)task.finish('interrupted','camera_error: '+message);}
});
function stopTracking(){tracker.stop();resetLive();$('video').srcObject=null;document.querySelector('.camera-preview').classList.remove('has-video');$('camera-placeholder').hidden=false;$('stop-camera').hidden=true;}
function launch(p){stopTracking();purpose=p;session=null;selected=null;task=null;taskKind='pvt';ratingStage='pre';
  $('consent').checked=false;document.querySelector('input[name="mode"][value="camera"]').checked=true;
  $('camera-status').textContent='Waiting for your consent.';updatePreparation();navigate('prepare');}
async function persist(s=session){if(!s)return;try{await putSession(structuredClone(s));lastSaveError=null;if(screen==='results')$('save-status').textContent='Saved in this browser. Reopen your results from Local sessions.';}
  catch(e){lastSaveError=e.message;if(screen==='results')$('save-status').textContent='Local save failed. Export your JSON first: '+e.message;else toast('Local storage is unavailable. Export your results when you finish.');}}
function showRating(stage){ratingStage=stage;const copy={pre:['CHECK-IN / 01','First, check in with yourself.','Before you begin, record how mentally fatigued you feel.'],
  between:['CHECK-IN / 02','Signal mission complete.','Before the next task, record how you feel right now.'],post:['CHECK-IN / 03','One last check-in.','Your tasks are finished. Record your current mental fatigue.']}[stage];
  $('rating-eyebrow').textContent=copy[0];$('rating-title').textContent=copy[1];$('rating-description').textContent=copy[2];
  $('fatigue').value='5';$('fatigue-output').textContent='5';$('rating-next').textContent=stage==='post'?'Save and view mission log →':'Save check-in and continue →';navigate('rating');}
function showRules(kind){taskKind=kind;const pvt=kind==='pvt';$('rules-code').textContent=pvt?'MISSION 01 / SIGNAL RECEIVER':'MISSION 02 / CARGO SORTER';
  $('rules-title').textContent=pvt?'Signal receiver.':'Cargo sorter.';
  $('rules-description').textContent=pvt?'A distant ship sends signals at unpredictable times. Wait for the light, then respond.':'The supply station needs your judgment: collect ordinary supplies and let hazards pass.';
  $('rules-art').replaceChildren();if(pvt){const circle=document.createElement('div');circle.className='rule-signal';circle.textContent='◎';$('rules-art').append(circle);}
  else{const wrap=document.createElement('div');wrap.className='cargo-examples';for(const [symbol,label]of[['●','Supplies / Respond'],['△','Hazard / Do not respond']]){const box=document.createElement('div');box.className='cargo-example';const icon=document.createElement('span');icon.textContent=symbol;box.append(icon,document.createTextNode(label));wrap.append(box);}$('rules-art').append(wrap);}
  const rules=pvt?['When the signal lights up, press Space or tap the central button as quickly as you can.','Do not respond before the light appears. You do not need to chase a moving target.','Breathe normally, blink naturally, and complete the full task.']:
    ['When a blue circle appears, press Space or tap the central button.','When an orange triangle appears, do not respond. Let it pass.','Balance speed with accuracy. Rules and difficulty stay the same throughout.'];
  $('rules-list').replaceChildren(...rules.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  $('rules-duration').textContent=purpose==='demo'?'20 SEC / DEMO ONLY':pvt?'3 MIN / PVT-INSPIRED':'4 MIN / GO–NO-GO';
  $('rules-caution').textContent='This is an exploratory web adaptation, not a validated standardized test. '+(purpose==='demo'?'The demo checks the experience and data pipeline, not research validity.':'Timing and performance can be affected by your device and input method.');
  navigate('rules');}
function stimulusState(s){const target=$('target');target.className='target '+(s.state==='stimulus'?(s.type==='signal'?'signal':s.type):s.state==='received'?'received':'waiting');
  target.textContent=s.state==='stimulus'?(s.type==='no-go'?'△':taskKind==='pvt'?'◎':'●'):s.state==='received'?'✓':'◎';
  $('stimulus-caption').textContent=s.state==='stimulus'?(taskKind==='pvt'?'Signal received':s.type==='no-go'?'Hazard / Do not respond':'Supplies / Respond now'):s.state==='received'?'Acknowledged':taskKind==='pvt'?'Waiting for a signal':'Waiting for the next item';}
function startTask(){if(task?.running)return;if(session.mode==='camera'&&!tracker.ready){toast('The camera is not ready. End this session and repeat setup.');return;}
  acc=new FeatureAccumulator(tracker.baseline||.3);const kind=taskKind;
  renderLive(cameraReadout(null,null,{scope:'This mission',source:session.mode==='simulated'?'simulated':'camera'}));
  $('task-code').textContent=kind==='pvt'?'MISSION 01 / SIGNAL RECEIVER':'MISSION 02 / CARGO SORTER';
  $('task-title').textContent=kind==='pvt'?'Signal receiver':'Cargo sorter';$('task-instruction').textContent=kind==='pvt'?'When the signal lights up, press Space / tap':'Circle: press Space / tap · Triangle: do not respond';
  $('task-source').textContent=session.mode==='camera'?'Live vision + Human responses':session.mode==='simulated'?'Simulated vision + Human responses':'Human responses / No camera';
  navigate('task');$('stimulus').focus({preventScroll:true});
  task=new MissionTask({kind,duration:DURATIONS[purpose][kind],onStimulus:stimulusState,onTick:(remaining,progress)=>{
    $('remaining').textContent=time(remaining);$('task-progress-fill').style.width=(progress*100)+'%';},onEnd:result=>finishTask(result)});
  task.start();if(session.mode==='simulated')simTimer=setInterval(()=>{if(task?.running){const elapsed=task.elapsed(),sample=acc.add(elapsed,simulatedFeatures(elapsed),'simulated');renderLive(cameraReadout(acc,sample,{scope:'This mission',source:'simulated'}));}},100);
  saveTimer=setInterval(()=>{if(session&&task?.running)persist({...session,draft_task:{kind,trials:task.trials,samples:acc.samples}});},5000);
}
async function finishTask(result){clearInterval(simTimer);clearInterval(saveTimer);if(!session)return;
  result.vision_summary=session.mode==='behavior'?{...EMPTY_VISION}:acc.summary(result.duration_ms);result.samples=acc.samples;result.blink_events=acc.blinks;
  session.tasks.push(result);session.events.push({type:'task_ended',task:result.kind,status:result.status,at:new Date().toISOString()});
  if(discarding){session=null;stopTracking();navigate('welcome');return;}
  await persist();if(result.status!=='completed'){session.status='interrupted';session.ended_at=new Date().toISOString();stopTracking();await persist();renderResults(session);return;}
  if(result.kind==='pvt'){if(tracker.ready)beginLivePreview();else renderLive(cameraReadout(null,null,{source:session.mode==='simulated'?'simulated':'camera'}));taskKind='attention';showRating('between');}else{stopTracking();showRating('post');}
}
function drawChart(s){const svg=$('reaction-chart');svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
  const make=(name,attributes)=>{const e=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attributes))e.setAttribute(k,String(v));svg.append(e);return e;};
  const rows=s.tasks.flatMap((t,taskIndex)=>t.trials.filter(v=>!v.invalid_reason&&v.correct&&Number.isFinite(v.reaction_ms)).map(v=>({...v,taskIndex})));
  if(!rows.length){const label=make('text',{x:320,y:105,'text-anchor':'middle',fill:'#88988c','font-size':14});label.textContent='No valid reaction times. Missing values are not replaced with zero.';return;}
  const max=Math.max(600,...rows.map(r=>r.reaction_ms));for(const fraction of[0,.5,1]){const y=170-fraction*140;make('line',{x1:40,y1:y,x2:625,y2:y,stroke:'#e6ece3'});const label=make('text',{x:32,y:y+4,'text-anchor':'end',fill:'#91a193','font-size':10});label.textContent=Math.round(max*fraction);}
  rows.forEach((r,i)=>{make('circle',{cx:45+(rows.length===1?280:i/(rows.length-1)*575),cy:170-r.reaction_ms/max*140,r:3,fill:r.taskIndex===0?'#759baf':'#ae9a75'});});
  for(const[text,x,color]of[['Signal',45,'#759baf'],['Sorting',150,'#ae9a75']]){make('circle',{cx:x,cy:197,r:3,fill:color});const label=make('text',{x:x+9,y:201,fill:'#71867b','font-size':10});label.textContent=text;}}
function renderResults(s){selected=s;const pvt=s.tasks.find(t=>t.kind==='pvt'),attention=s.tasks.find(t=>t.kind==='attention');
  $('result-pvt').textContent=format(pvt?.behavior_summary.median_reaction_ms);$('result-accuracy').textContent=percent(attention?.behavior_summary.accuracy);
  $('result-accuracy-detail').textContent=attention?attention.behavior_summary.valid_trial_count+' valid trials':'Second task not completed';
  $('result-ratings').textContent=['pre','between','post'].map(k=>s.ratings[k]??'—').join(' → ');
  $('result-status').textContent=(s.purpose==='demo'?'Demo':'Exploratory collection')+' / '+(s.status==='completed'?'Completed':s.status==='in_progress'?'Draft':'Interrupted');
  $('result-description').textContent=new Date(s.started_at).toLocaleString('en-US')+' · Pseudonymous session '+s.session_id.slice(0,8);
  const v=attention?.vision_summary||pvt?.vision_summary,b=attention?.behavior_summary;
  const quality=[['Vision source',s.sources.vision==='camera'?'Live camera':s.sources.vision==='simulated'?'Simulated data':'Not collected'],
    ['Signal false starts / Misses',pvt?(pvt.behavior_summary.false_starts+' / '+pvt.behavior_summary.omissions):'—'],
    ['Sorting false alarms / Misses',b?(b.false_alarms+' / '+b.omissions):'—'],['Valid vision coverage (last task)',percent(v?.tracking_coverage)],
    ['Blinks (last task)',Number.isFinite(v?.blink_count)?String(v.blink_count)+' / Research proxy':'—'],
    ['Data storage', 'This browser / No upload']];
  $('quality-list').replaceChildren(...quality.map(([label,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);return row;}));
  drawChart(s);$('save-status').textContent=s===session&&lastSaveError?'Local save failed. Export your JSON first: '+lastSaveError:'Saved in this browser. Export a copy for backup.';updateAgentLink(!!(s===session&&lastSaveError));navigate('results');}
function download(data,name,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportResult(kind){if(!selected)return;const prefix='focus-lab-'+selected.purpose+'-'+selected.session_id.slice(0,8);
  if(kind==='json')download(JSON.stringify(selected,null,2),prefix+'.json','application/json');
  else if(kind==='summary')download(asCSV(summaryRows(selected)),prefix+'-summary.csv','text/csv;charset=utf-8');
  else download(asCSV(selected.tasks.flatMap(t=>t.trials.map(r=>({session_id:selected.session_id,purpose:selected.purpose,vision_source:selected.sources.vision,task:t.kind,...r})))),prefix+'-trials.csv','text/csv;charset=utf-8');}
async function showHistory(){if(task?.running)return;stopTracking();navigate('history');try{const rows=(await allSessions()).sort((a,b)=>b.started_at.localeCompare(a.started_at));$('history-list').replaceChildren();
  if(!rows.length){const empty=document.createElement('p');empty.className='empty-history';empty.textContent='No mission logs yet. Begin a session to create one.';$('history-list').append(empty);}
  for(const s of rows){const item=document.createElement('article');item.className='history-item';const copy=document.createElement('div'),title=document.createElement('h2'),meta=document.createElement('p');
    title.textContent=new Date(s.started_at).toLocaleString('en-US');meta.textContent=(s.purpose==='demo'?'Demo / Excluded from research validation':'Exploratory collection')+' · '+s.sources.vision+' · '+s.status;
    copy.append(title,meta);const actions=document.createElement('div');actions.className='history-actions';const view=document.createElement('button');view.className='quiet';view.textContent='View report ↗';view.onclick=()=>{purpose=s.purpose;renderResults(s);};
    const del=document.createElement('button');del.className='quiet';del.textContent='Delete';del.onclick=async()=>{if(confirm('Delete this local session? Exported files will not be deleted.')){await deleteSession(s.session_id);showHistory();}};
    actions.append(view,del);item.append(copy,actions);$('history-list').append(item);}
  }catch(e){$('history-list').textContent='Cannot access local sessions: '+e.message;}}

$('begin-pilot').onclick=()=>launch('pilot');$('begin-demo').onclick=()=>launch('demo');
$('consent').onchange=()=>{if(!$('consent').checked)stopTracking();updatePreparation();};
document.querySelectorAll('input[name="mode"]').forEach(e=>e.onchange=()=>{stopTracking();$('camera-status').textContent=mode()==='simulated'?'Synthetic features will be generated during the tasks.':'Waiting for setup.';updatePreparation();});
$('enable-camera').onclick=()=>{if($('consent').checked&&mode()==='camera')tracker.start();};
$('stop-camera').onclick=()=>{stopTracking();updatePreparation();};
$('prepare-next').onclick=()=>{if(!$('consent').checked||mode()==='camera'&&!tracker.ready)return;try{const now=new Date().toISOString();
  session=makeSession({id:crypto.randomUUID(),participant:participantId(),mode:mode(),purpose,consentAt:now,startedAt:now});showRating('pre');
}catch(e){toast('Cannot create a local session: '+e.message);}};
$('fatigue').oninput=()=>$('fatigue-output').textContent=$('fatigue').value;
$('rating-next').onclick=async()=>{if(!session||$('rating-next').disabled)return;$('rating-next').disabled=true;try{const stage=ratingStage;recordRating(session,stage,Number($('fatigue').value),new Date().toISOString());await persist();
  if(stage==='pre')showRules('pvt');else if(stage==='between')showRules('attention');else{session.status='completed';session.ended_at=new Date().toISOString();await persist();renderResults(session);}}finally{$('rating-next').disabled=false;}};
$('start-task').onclick=startTask;$('stimulus').addEventListener('pointerdown',e=>{e.preventDefault();task?.respond('pointer');});
document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||!task?.running)return;
  if(['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName)&&document.activeElement!==$('stimulus'))return;
  e.preventDefault();task.respond('keyboard');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&task?.running)task.finish('interrupted','page_hidden');});
$('stop-task').onclick=()=>$('exit-dialog').showModal();$('exit-cancel').onclick=()=>$('exit-dialog').close();
$('exit-keep').onclick=()=>{$('exit-dialog').close();task?.finish('interrupted','participant_stopped');};
$('exit-discard').onclick=async()=>{$('exit-dialog').close();const id=session?.session_id;discarding=true;task?.finish('withdrawn','participant_withdrew');
  if(id)await deleteSession(id);discarding=false;session=null;stopTracking();navigate('welcome');toast('This session was discarded. Nothing was uploaded.');};
$('back').onclick=()=>{if(screen==='prepare'){stopTracking();navigate('welcome');}
  else if(!task?.running){if(session&&!confirm('Leave this session? Recorded information will remain as a local draft.'))return;stopTracking();navigate('welcome');}};
$('history-open').onclick=showHistory;$('history-back').onclick=()=>navigate('welcome');$('again').onclick=()=>launch('pilot');
document.querySelector('.brand').onclick=e=>{e.preventDefault();if(task?.running){$('exit-dialog').showModal();return;}stopTracking();navigate('welcome');};
$('export-json').onclick=()=>exportResult('json');$('export-csv').onclick=()=>exportResult('summary');$('export-trials').onclick=()=>exportResult('trials');
window.addEventListener('pagehide',()=>{task?.finish('interrupted','page_closed');stopTracking();});
resetLive();updatePreparation();navigate('welcome');
