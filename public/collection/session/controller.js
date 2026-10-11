import { SCHEMA_VERSION, CONSENT_VERSION } from './versions.js';
import { FeatureAccumulator } from '../features/accumulator.js';
import { nullVision } from '../features/unavailable.js';
import { summarizeTrials } from '../tasks/summary.js';
import { createGoNoGoTask } from '../tasks/go-no-go.js';
import { simulatedFeatures } from '../tracking/simulated.js';
import { createTrackingController } from '../tracking/controller.js';
import { makeDemo } from './demo.js';
import { sources, sourceLabel } from './provenance.js';
import { putSession, allSessions, deleteSession, clearSessions, participantId } from '../persistence/local.js';
import { uploadSession } from '../persistence/cloud.js';
import { toCSV, exportRows } from '../reporting/export.js';
import { format, percent } from '../reporting/format.js';
import { renderResult as renderDashboard } from '../reporting/dashboard.js';
import { download } from '../reporting/download.js';
const $=id=>document.getElementById(id);
let active=null,awaitingRating=null,selected=null,acc=null;
let tickTimer,autoSaveTimer,simulationTimer;
let sessionStart=0,participant=null,history=[],toastTimer,storageFailed=false,saving=false;
const status=(text,error=false)=>{ $('tracking-status').textContent=text;$('tracking-status').classList.toggle('error',error); };
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function updateSetup(){
  const busy=!!active||!!awaitingRating||saving;
  $('settings').disabled=busy;$('demo').disabled=busy;
  const mode=$('mode').value;
  $('camera').disabled=busy||!$('consent').checked||mode!=='camera'||!!tracking.worker;
  $('release').disabled=busy||!tracking.worker;
  $('start').disabled=busy||!$('consent').checked||(mode==='camera'&&!tracking.ready);
  $('mode-note').textContent=mode==='simulated'?'眼部与头部特征由模拟器生成；你完成的任务和疲劳自评仍是真实记录。':'behavior'===mode?'不访问摄像头；视觉特征保留为空，记录真实任务表现与自评。':'请先同意研究说明，再启用摄像头。模型与画面均在浏览器本地处理。';
  $('source-badge').textContent=mode==='simulated'?'模拟视觉特征':mode==='behavior'?'仅任务 / 无摄像头':tracking.ready?'真实采集 / 已校准':'真实采集 / 未就绪';
  $('source-badge').classList.toggle('simulated',mode==='simulated');
  if(!tracking.worker&&!busy){$('camera-overlay').textContent=mode==='simulated'?'模拟模式 · 不访问摄像头':mode==='behavior'?'仅任务模式':'摄像头未启用';}
}
function updateLive(elapsed,f){
  const v=acc.summary(elapsed);
  $('live-blinks').textContent=v.blink_count;$('live-coverage').textContent=percent(v.tracking_coverage);
  $('live-eyes').textContent=!f.face_present?'未检出':acc.previous.closed?'闭合':'睁开';
  if(active?.mode==='camera')status(f.face_present?'采集中：请保持面部在画面内。':'暂未检出面部：此段记录为缺失，不计为闭眼。');
}
function setStage(stage){
  for(let i=1;i<=3;i++)$('step'+i).classList.toggle('current',i===stage);
  $('stage-label').textContent=['','01 / 准备','02 / 测试中','03 / 自评与保存'][stage];
}
function snapshot(session){
  const duration=active===session?performance.now()-sessionStart:session.duration_ms;
  return {...session,duration_ms:duration,samples:acc.samples,blink_events:acc.blinks,vision_summary:session.mode==='behavior'?nullVision():acc.summary(duration),behavior_summary:summarizeTrials(session.trials)};
}
async function persist(session,quiet=false){
  try {await putSession(session);storageFailed=false;return true;}
  catch(error){storageFailed=true;if(!quiet)toast('本地保存失败。当前结果仍可导出，请先导出 JSON，避免关闭页面后丢失。',true);return false;}
}
async function start(){
  if($('start').disabled)return;
  try {participant ||= participantId();}catch {participant ||= crypto.randomUUID();toast('匿名 ID 无法跨刷新保存；本次仍使用临时匿名 ID。',true);}
  const mode=$('mode').value,planned=Number($('duration').value)*1000;
  sessionStart=performance.now();acc=new FeatureAccumulator(mode==='camera'?tracking.baseline:.3);task.reset();
  active={schema_version:SCHEMA_VERSION,session_id:crypto.randomUUID(),participant_id:participant,started_at:new Date().toISOString(),ended_at:null,duration_ms:0,status:'in_progress',mode,sources:sources(mode),consent:{version:CONSENT_VERSION,accepted_at:new Date().toISOString()},fatigue_pre:Number($('pre').value),fatigue_post:null,config:{protocol:'go-no-go-v1',planned_duration_ms:planned,response_window_ms:1000,inter_trial_ms:[600,1300],go_probability:.75,vision_sample_hz:mode==='behavior'?0:10,ear_baseline:acc.baseline,close_ratio:.65,open_ratio:.8,blink_range_ms:[80,800],max_gap_ms:250,timing:'performance.now / animation-frame estimated stimulus onset'},calibration:mode==='camera'?{source:'camera',ear_baseline:tracking.baseline,frame_count:tracking.calibrationFrames.length,frame_width:$('video').videoWidth,frame_height:$('video').videoHeight}:mode==='simulated'?{source:'simulated',ear_baseline:.3}:null,environment:{user_agent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},device_pixel_ratio:devicePixelRatio},trials:[],events:[],notes:['Research feature collection; no diagnostic or prediction score.','Browser stimulus onset and input timing are estimates, not laboratory timing.']};
  if(mode==='simulated')active.notes.push('Visual features are synthetic; behavior and fatigue ratings are human data.');
  $('task-panel').hidden=false;$('post-panel').hidden=true;$('task-source').textContent=sourceLabel(active);$('task-source').classList.toggle('simulated',mode==='simulated');
  setStage(2);updateSetup();$('live-blinks').textContent='0';$('live-coverage').textContent=mode==='behavior'?'—':'0%';$('shape').textContent='准备';$('shape').className='shape neutral';
  if(mode==='simulated')simulationTimer=setInterval(()=>{if(active){const t=performance.now()-sessionStart;const f=simulatedFeatures(t);acc.add(t,f,'simulated');updateLive(t,f);}},100);
  const thisSession=active;
  persist(snapshot(thisSession)).then(()=>refreshHistory());
  autoSaveTimer=setInterval(()=>{if(active)persist(snapshot(active),true);},5000);
  tickTimer=setInterval(tick,100);tick();task.schedule(900);$('stimulus').focus({preventScroll:true});$('task-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function tick(){
  if(!active)return;
  const t=performance.now()-sessionStart,remaining=Math.max(0,active.config.planned_duration_ms-t);
  $('remaining').textContent=`${String(Math.floor(remaining/60000)).padStart(2,'0')}:${String(Math.ceil(remaining/1000)%60).padStart(2,'0')}`;
  $('progress').style.width=`${Math.min(100,t/active.config.planned_duration_ms*100)}%`;
  if(remaining<=0)finish('completed','计划测试已完成。摄像头已关闭。');
}
function clearTaskTimers(){task.cancel();clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(simulationTimer);}
function finish(state,reason){
  if(!active)return;
  clearTaskTimers();task.close('session_ended_before_deadline');
  const duration=performance.now()-sessionStart;
  active.events.push({type:state,elapsed_ms:duration,reason});
  const result={...snapshot(active),duration_ms:duration,status:state,ended_at:new Date().toISOString()};
  active=null;awaitingRating=result;tracking.stop();$('upload-consent').checked=false;
  $('task-panel').hidden=true;$('post-panel').hidden=false;$('post').value=$('pre').value;$('post-value').textContent=`${$('post').value} / 10`;$('end-reason').textContent=reason;
  setStage(3);updateSetup();renderResult(result);persist(result).then(()=>refreshHistory());
  if(document.visibilityState==='visible')$('post-panel').scrollIntoView({behavior:'smooth',block:'center'});
}
async function save(){
  if(!awaitingRating||saving)return;
  saving=true;updateSetup();$('save').disabled=true;
  const accepted=$('upload-consent').checked;
  const result={...awaitingRating,fatigue_post:Number($('post').value),post_rating_at:new Date().toISOString(),...(accepted?{upload_consent:{accepted:true,version:'upload-v1',accepted_at:new Date().toISOString()}}:{})};
  const saved=await persist(result);
  awaitingRating=null;saving=false;$('save').disabled=false;$('post-panel').hidden=true;
  renderResult(result);await refreshHistory();setStage(1);updateSetup();
  toast(saved?'会话已保存在本地，可以导出。':'保存失败：请从仪表盘导出当前 JSON。',!saved);$('dashboard').scrollIntoView({behavior:'smooth'});
  if(accepted)await uploadSession(result);
}
async function discard(){
  const s=active||awaitingRating;if(!s)return;
  if(!confirm('撤回并丢弃本次会话？本次记录将从本地删除。'))return;
  clearTaskTimers();active=null;awaitingRating=null;task.discard();tracking.stop();$('task-panel').hidden=true;$('post-panel').hidden=true;
  try {await deleteSession(s.session_id);}catch {toast('删除失败。请关闭其他页面后重试。',true);return;}
  if(selected?.session_id===s.session_id){selected=null;$('result').hidden=true;$('empty-result').hidden=false;$('result-badge').textContent='等待数据';}
  setStage(1);updateSetup();await refreshHistory();toast('本次会话已删除；摄像头已关闭。');
}
function renderResult(session){selected=session;renderDashboard(session);}
function exportSelected(kind){if(!selected)return;const suffix=selected.session_id.slice(0,12);if(kind==='json')download(`focus-lab-${suffix}.json`,JSON.stringify(selected,null,2),'application/json');else download(`focus-lab-${suffix}-${kind}.csv`,toCSV(exportRows([selected],kind)),'text/csv;charset=utf-8');}
async function refreshHistory(){
  try {history=(await allSessions()).sort((a,b)=>b.started_at.localeCompare(a.started_at));}
  catch {toast('无法读取本地数据库。仍可完成会话并导出当前记录。',true);return;}
  const list=$('history-list');list.replaceChildren();
  if(!history.length){const p=document.createElement('p');p.className='small';p.textContent='暂无会话。记录仅保存在当前浏览器。';list.append(p);return;}
  for(const s of history){
    const row=document.createElement('div');row.className='history-item';
    const text=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');
    title.textContent=new Date(s.started_at).toLocaleString();meta.textContent=`${sourceLabel(s)} · ${format(s.duration_ms/1000)} 秒 · ${s.status==='completed'?'已完成':s.status==='in_progress'?'未完成草稿':'已中断'}${s.fatigue_post===null?' · 无后测自评':''}`;text.append(title,meta);
    const actions=document.createElement('div'),view=document.createElement('button'),del=document.createElement('button');
    view.className='text-button';view.textContent='查看';view.disabled=!!active;view.onclick=()=>{renderResult(s);$('dashboard').scrollIntoView({behavior:'smooth'});};
    del.className='text-button danger';del.textContent='删除';del.disabled=!!active||!!awaitingRating;
    del.onclick=async()=>{if(!confirm('删除这段本地会话？已导出的文件不受影响。'))return;try {await deleteSession(s.session_id);if(selected?.session_id===s.session_id){selected=null;$('result').hidden=true;$('empty-result').hidden=false;}await refreshHistory();toast('会话已删除。');}catch {toast('会话删除失败，请重试。',true);}};
    actions.append(view,del);row.append(text,actions);list.append(row);
  }
  $('delete-all').disabled=!!active||!!awaitingRating;
}
const tracking=createTrackingController({$,status,updateSetup,getActive:()=>active,getSessionStart:()=>sessionStart,finish,updateLive,getAccumulator:()=>acc,getAwaitingRating:()=>awaitingRating});
const task=createGoNoGoTask({getSession:()=>active,getElapsed:()=>performance.now()-sessionStart,shape:$('shape'),stimulus:$('stimulus')});
$('consent').addEventListener('change',()=>{if(!$('consent').checked){tracking.stop();status('等待知情同意。');}else status('可以启用摄像头，或选择模拟视觉 / 仅任务模式。');updateSetup();});
$('mode').addEventListener('change',()=>{tracking.stop();status($('mode').value==='simulated'?'模拟眼部特征将明确标记；任务表现仍由你实际完成。':$('mode').value==='behavior'?'仅记录任务表现与自评。':'请启用摄像头并完成校准。');updateSetup();});
for(const id of ['pre','post'])$(id).addEventListener('input',()=>$(id+'-value').textContent=`${$(id).value} / 10`);
$('camera').onclick=tracking.enable;$('release').onclick=()=>{tracking.stop();status('摄像头已关闭。');};$('start').onclick=start;$('save').onclick=save;$('stop').onclick=()=>finish('interrupted','你提前结束了测试，本次会话标记为中断。');$('withdraw').onclick=discard;$('discard').onclick=discard;
$('stimulus').addEventListener('pointerdown',task.respond);document.addEventListener('keydown',task.respond);
// Default button Space events can otherwise generate a second response. Handle Space centrally.
$('stimulus').addEventListener('click',e=>{if(e.detail===0)e.preventDefault();});
$('demo').onclick=()=>{renderResult(makeDemo());$('dashboard').scrollIntoView({behavior:'smooth'});toast('示例全部由模拟数据生成，未保存到会话历史。');};
$('export-json').onclick=()=>exportSelected('json');$('export-csv').onclick=()=>exportSelected('sessions');$('export-samples').onclick=()=>exportSelected('samples');$('export-trials').onclick=()=>exportSelected('trials');
$('export-all').onclick=async()=>{await refreshHistory();if(!history.length){toast('暂无本地记录。');return;}download('focus-lab-all-sessions.json',JSON.stringify({schema_version:SCHEMA_VERSION,exported_at:new Date().toISOString(),sessions:history},null,2),'application/json');};
$('delete-all').onclick=async()=>{
  if(active||awaitingRating){toast('请先结束、保存或丢弃当前会话。');return;}
  if(!confirm('删除全部 Focus Lab 会话并重置本设备匿名 ID？已导出的文件不受影响。'))return;
  try {await clearSessions();localStorage.removeItem('focus-lab-participant');participant=null;selected=null;tracking.stop();$('result').hidden=true;$('empty-result').hidden=false;$('result-badge').textContent='等待数据';await refreshHistory();toast('全部本地会话与匿名 ID 已删除，无法从应用恢复。');}catch {toast('删除未完成，请重试。',true);}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active)finish('interrupted','页面离开前台，计时失去可靠性，本次会话已中断。');else if(tracking.worker){tracking.stop();status('页面离开前台，摄像头已关闭。');}}});
window.addEventListener('pagehide',()=>{if(active)finish('interrupted','页面关闭或离开。');tracking.stop();});
updateSetup();refreshHistory();
