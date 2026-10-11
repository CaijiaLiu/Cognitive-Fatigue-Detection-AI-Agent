import { SCHEMA_VERSION,CONSENT_VERSION,median,FeatureAccumulator,extractFeatures,summarizeTrials,simulatedFeatures,makeDemo,toCSV,exportRows } from './core.js';
import { putSession,allSessions,deleteSession,clearSessions,participantId } from './storage.js';
import { acquireCamera,cameraErrorMessage } from './camera.js';
import { uploadSession } from './cloud.js';
const $=id=>document.getElementById(id);
const format=(n,digits=0)=>Number.isFinite(n)?n.toFixed(digits):'—';
const percent=n=>Number.isFinite(n)?`${Math.round(n*100)}%`:'—';
let worker=null,stream=null,cameraReady=false,workerReady=false,frameBusy=false,cameraGeneration=0,frameTimer,lastVideoTime=-1;
let baseline=null,calibrationFrames=[],calibrationStarted=0,calibrationDeadline=0;
let active=null,awaitingRating=null,selected=null,acc=null,currentTrial=null;
let taskTimer,tickTimer,autoSaveTimer,simulationTimer,trialOnsetFrame;
let sessionStart=0,nextIndex=0,participant=null,history=[],toastTimer,storageFailed=false,saving=false;
const status=(text,error=false)=>{ $('tracking-status').textContent=text;$('tracking-status').classList.toggle('error',error); };
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function sources(mode){return {vision:mode==='camera'?'camera':mode==='simulated'?'simulated':'unavailable',behavior:'human',ratings:'self_report'};}
const sourceLabel=s=>s.mode==='demo'?'全部模拟数据':s.sources.vision==='simulated'?'模拟视觉 + 真实任务 / 自评':s.sources.vision==='none'?'真实任务 / 无视觉':'真实摄像头 + 真实任务 / 自评';
function updateSetup(){
  const busy=!!active||!!awaitingRating||saving;
  $('settings').disabled=busy;$('demo').disabled=busy;
  const mode=$('mode').value;
  $('camera').disabled=busy||!$('consent').checked||mode!=='camera'||!!worker;
  $('release').disabled=busy||!worker;
  $('start').disabled=busy||!$('consent').checked||(mode==='camera'&&!cameraReady);
  $('mode-note').textContent=mode==='simulated'?'眼部与头部特征由模拟器生成；你完成的任务和疲劳自评仍是真实记录。':'behavior'===mode?'不访问摄像头；视觉特征保留为空，记录真实任务表现与自评。':'请先同意研究说明，再启用摄像头。模型与画面均在浏览器本地处理。';
  $('source-badge').textContent=mode==='simulated'?'模拟视觉特征':mode==='behavior'?'仅任务 / 无摄像头':cameraReady?'真实采集 / 已校准':'真实采集 / 未就绪';
  $('source-badge').classList.toggle('simulated',mode==='simulated');
  if(!worker&&!busy){$('camera-overlay').textContent=mode==='simulated'?'模拟模式 · 不访问摄像头':mode==='behavior'?'仅任务模式':'摄像头未启用';}
}
function stopCamera(){
  cameraGeneration++;clearInterval(frameTimer);worker?.terminate();worker=null;workerReady=false;cameraReady=false;frameBusy=false;baseline=null;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  $('video').srcObject=null;$('preview').classList.remove('running');$('camera-placeholder').hidden=false;lastVideoTime=-1;
  updateSetup();
}
function cameraFailure(message){
  if(active) {active.events.push({type:'camera_error',elapsed_ms:performance.now()-sessionStart,message});finish('interrupted','摄像头或追踪异常，会话已中断。');}
  stopCamera();status(message,true);updateSetup();
}
async function enableCamera(){
  if(!$('consent').checked||active||awaitingRating) return;
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
    worker=new Worker('tracker.worker.js');
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
        if(active&&active.mode==='camera') {
          const elapsed=m.timestamp-sessionStart;
          if(elapsed>=0){acc.add(elapsed,f,'camera');updateLive(elapsed,f);}
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
function nullVision(){return {blink_count:null,blink_rate_per_min:null,closed_time_ms:null,closed_fraction:null,valid_tracking_ms:0,tracking_coverage:null,head_motion_deg_per_sec:null,gaze_position_sd_eye_width:null,mean_blink_duration_ms:null,sample_count:0};}
async function persist(session,quiet=false){
  try {await putSession(session);storageFailed=false;return true;}
  catch(error){storageFailed=true;if(!quiet)toast('本地保存失败。当前结果仍可导出，请先导出 JSON，避免关闭页面后丢失。',true);return false;}
}
async function start(){
  if($('start').disabled)return;
  try {participant ||= participantId();}catch {participant ||= crypto.randomUUID();toast('匿名 ID 无法跨刷新保存；本次仍使用临时匿名 ID。',true);}
  const mode=$('mode').value,planned=Number($('duration').value)*1000;
  sessionStart=performance.now();acc=new FeatureAccumulator(mode==='camera'?baseline:.3);nextIndex=0;currentTrial=null;
  active={schema_version:SCHEMA_VERSION,session_id:crypto.randomUUID(),participant_id:participant,started_at:new Date().toISOString(),ended_at:null,duration_ms:0,status:'in_progress',mode,sources:sources(mode),consent:{version:CONSENT_VERSION,accepted_at:new Date().toISOString()},fatigue_pre:Number($('pre').value),fatigue_post:null,config:{protocol:'go-no-go-v1',planned_duration_ms:planned,response_window_ms:1000,inter_trial_ms:[600,1300],go_probability:.75,vision_sample_hz:mode==='behavior'?0:10,ear_baseline:acc.baseline,close_ratio:.65,open_ratio:.8,blink_range_ms:[80,800],max_gap_ms:250,timing:'performance.now / animation-frame estimated stimulus onset'},calibration:mode==='camera'?{source:'camera',ear_baseline:baseline,frame_count:calibrationFrames.length,frame_width:$('video').videoWidth,frame_height:$('video').videoHeight}:mode==='simulated'?{source:'simulated',ear_baseline:.3}:null,environment:{user_agent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},device_pixel_ratio:devicePixelRatio},trials:[],events:[],notes:['Research feature collection; no diagnostic or prediction score.','Browser stimulus onset and input timing are estimates, not laboratory timing.']};
  if(mode==='simulated')active.notes.push('Visual features are synthetic; behavior and fatigue ratings are human data.');
  $('task-panel').hidden=false;$('post-panel').hidden=true;$('task-source').textContent=sourceLabel(active);$('task-source').classList.toggle('simulated',mode==='simulated');
  setStage(2);updateSetup();$('live-blinks').textContent='0';$('live-coverage').textContent=mode==='behavior'?'—':'0%';$('shape').textContent='准备';$('shape').className='shape neutral';
  if(mode==='simulated')simulationTimer=setInterval(()=>{if(active){const t=performance.now()-sessionStart;const f=simulatedFeatures(t);acc.add(t,f,'simulated');updateLive(t,f);}},100);
  const thisSession=active;
  persist(snapshot(thisSession)).then(()=>refreshHistory());
  autoSaveTimer=setInterval(()=>{if(active)persist(snapshot(active),true);},5000);
  tickTimer=setInterval(tick,100);tick();scheduleTrial(900);$('stimulus').focus({preventScroll:true});$('task-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function tick(){
  if(!active)return;
  const t=performance.now()-sessionStart,remaining=Math.max(0,active.config.planned_duration_ms-t);
  $('remaining').textContent=`${String(Math.floor(remaining/60000)).padStart(2,'0')}:${String(Math.ceil(remaining/1000)%60).padStart(2,'0')}`;
  $('progress').style.width=`${Math.min(100,t/active.config.planned_duration_ms*100)}%`;
  if(remaining<=0)finish('completed','计划测试已完成。摄像头已关闭。');
}
function scheduleTrial(delay){taskTimer=setTimeout(showTrial,delay);}
function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
function showTrial(){
  if(!active)return;
  const elapsed=performance.now()-sessionStart;
  // Do not start a trial that cannot finish before the planned end.
  if(elapsed+1100>=active.config.planned_duration_ms)return;
  const type=random()<.75?'go':'no-go';
  trialOnsetFrame=requestAnimationFrame(()=>{
    if(!active)return;
    const onset=performance.now()-sessionStart;
    $('shape').className='shape '+type;$('shape').textContent='';
    currentTrial={index:nextIndex++,type,onset_ms:onset,deadline_ms:onset+1000,response_ms:null,reaction_ms:null,responded:false,correct:false,invalid_reason:null,source:'human'};
    taskTimer=setTimeout(()=>closeTrial(),1000);
  });
}
function respond(event){
  if(!active)return;
  if(event?.type==='keydown'&&(event.code!=='Space'||event.repeat))return;
  if(event?.type==='keydown'&&['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName)) {
    // Keyboard response works from the stimulus, but not while interacting with controls.
    if(document.activeElement!==$('stimulus'))return;
  }
  event?.preventDefault();
  const elapsed=performance.now()-sessionStart;
  if(!currentTrial){active.events.push({type:'inter_trial_response',elapsed_ms:elapsed});return;}
  if(currentTrial.responded)return;
  if(elapsed>currentTrial.deadline_ms){active.events.push({type:'late_response',elapsed_ms:elapsed,trial_index:currentTrial.index});return;}
  currentTrial.responded=true;currentTrial.response_ms=elapsed;currentTrial.reaction_ms=elapsed-currentTrial.onset_ms;
  currentTrial.input=event?.type==='keydown'?'keyboard':'pointer';
}
function closeTrial(invalidReason=null){
  if(!active||!currentTrial)return;
  const t=currentTrial;
  if(!invalidReason&&performance.now()-sessionStart-t.deadline_ms>150)invalidReason='timer_lag_over_150ms';
  t.invalid_reason=invalidReason;
  t.correct=!invalidReason&&(t.type==='go'?(t.responded&&t.reaction_ms>=100):!t.responded);
  active.trials.push(t);currentTrial=null;
  $('shape').className='shape neutral';$('shape').textContent='+';
  if(!invalidReason)scheduleTrial(600+random()*700);
}
function clearTaskTimers(){clearTimeout(taskTimer);clearInterval(tickTimer);clearInterval(autoSaveTimer);clearInterval(simulationTimer);cancelAnimationFrame(trialOnsetFrame);}
function finish(state,reason){
  if(!active)return;
  clearTaskTimers();closeTrial('session_ended_before_deadline');
  const duration=performance.now()-sessionStart;
  active.events.push({type:state,elapsed_ms:duration,reason});
  const result={...snapshot(active),duration_ms:duration,status:state,ended_at:new Date().toISOString()};
  active=null;awaitingRating=result;stopCamera();$('upload-consent').checked=false;
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
  clearTaskTimers();active=null;awaitingRating=null;currentTrial=null;stopCamera();$('task-panel').hidden=true;$('post-panel').hidden=true;
  try {await deleteSession(s.session_id);}catch {toast('删除失败。请关闭其他页面后重试。',true);return;}
  if(selected?.session_id===s.session_id){selected=null;$('result').hidden=true;$('empty-result').hidden=false;$('result-badge').textContent='等待数据';}
  setStage(1);updateSetup();await refreshHistory();toast('本次会话已删除；摄像头已关闭。');
}
function chart(id,points,color,maxY,label){
  const svg=$(id),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
  const el=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));if(text)node.textContent=text;svg.append(node);return node;};
  const finite=points.filter(p=>Number.isFinite(p.y));
  if(!finite.length){el('text',{x:300,y:85,'text-anchor':'middle',fill:'#95a38b','font-size':13},'无有效数据');return;}
  const width=535,height=125,x0=47,y0=14;
  const maxX=Math.max(1,...points.map(p=>p.x));
  maxY=maxY||Math.max(1,...finite.map(p=>p.y))*1.15;
  for(let i=0;i<=3;i++){const y=y0+height*i/3;el('line',{x1:x0,y1:y,x2:x0+width,y2:y,stroke:'#ebefe5','stroke-width':1});el('text',{x:x0-8,y:y+3,'text-anchor':'end',fill:'#96a38d','font-size':9},format(maxY*(1-i/3),maxY<1?2:0));}
  let path='',pen=false;
  for(const p of points){if(!Number.isFinite(p.y)){pen=false;continue;}const x=x0+p.x/maxX*width,y=y0+height-Math.min(1,p.y/maxY)*height;path+=`${pen?'L':'M'}${x.toFixed(1)},${y.toFixed(1)} `;pen=true;}
  el('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-linejoin':'round'});
  if(finite.length<60)for(const p of finite)el('circle',{cx:x0+p.x/maxX*width,cy:y0+height-Math.min(1,p.y/maxY)*height,r:2.7,fill:color});
  el('text',{x:x0,y:165,fill:'#96a38d','font-size':9},'0');el('text',{x:x0+width,y:165,'text-anchor':'end',fill:'#96a38d','font-size':9},`${format(maxX/1000,0)} s`);el('text',{x:x0+width/2,y:178,'text-anchor':'middle',fill:'#96a38d','font-size':9},label);
}
function renderResult(s){
  selected=s;$('empty-result').hidden=true;$('result').hidden=false;$('result-badge').textContent=sourceLabel(s);$('result-badge').classList.toggle('simulated',['demo','simulated'].includes(s.mode));
  $('result-meta').textContent=`${new Date(s.started_at).toLocaleString()} · ${format(s.duration_ms/1000)} 秒 · ${s.status==='completed'?'已完成':s.status==='in_progress'?'未完成草稿':'已中断'} · ID ${s.session_id.slice(0,12)}${s.fatigue_post===null?' · 缺少测试后自评':''}${s.mode==='demo'?' · 示例未保存到历史':''}`;
  const v=s.vision_summary||nullVision(),b=s.behavior_summary;
  $('metric-rt').textContent=format(b.median_reaction_ms);$('metric-accuracy').textContent=percent(b.accuracy);$('metric-trials').textContent=`${b.valid_trial_count} 个有效试次 / ${b.invalid_trial_count} 个中断试次`;
  $('metric-blink').textContent=format(v.blink_rate_per_min,1);
  $('metric-rating').textContent=s.fatigue_post===null?'—':`${s.fatigue_post-s.fatigue_pre>0?'+':''}${s.fatigue_post-s.fatigue_pre}`;
  $('rating-detail').textContent=`${s.fatigue_pre} → ${s.fatigue_post??'未填写'} / 10`;
  chart('reaction-chart',s.trials.filter(t=>t.type==='go').map(t=>({x:t.onset_ms,y:!t.invalid_reason&&t.correct?t.reaction_ms:null})),'#729989',null,'会话时间 / 秒');
  chart('eye-chart',s.samples.map(t=>({x:t.elapsed_ms,y:t.eye_aspect_ratio})),'#a4ac77',.5,'会话时间 / 秒');
  const metrics=[['有效追踪覆盖率',percent(v.tracking_coverage)],['总闭眼时长',v.closed_time_ms===null?'—':`${format(v.closed_time_ms/1000,2)} s`],['闭眼时间占比',percent(v.closed_fraction)],['平均眨眼时长',`${format(v.mean_blink_duration_ms)} ms`],['头部角速度',`${format(v.head_motion_deg_per_sec,2)} °/s`],['虹膜位置标准差',format(v.gaze_position_sd_eye_width,4)],['遗漏 / 误按',`${b.omissions} / ${b.false_alarms}`],['抢按 <100 ms / 空窗响应',`${b.anticipations} / ${s.events.filter(e=>e.type==='inter_trial_response').length}`]];
  $('quality-grid').replaceChildren(...metrics.map(([label,value])=>{const div=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;div.append(small,strong);return div;}));
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
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
$('consent').addEventListener('change',()=>{if(!$('consent').checked){stopCamera();status('等待知情同意。');}else status('可以启用摄像头，或选择模拟视觉 / 仅任务模式。');updateSetup();});
$('mode').addEventListener('change',()=>{stopCamera();status($('mode').value==='simulated'?'模拟眼部特征将明确标记；任务表现仍由你实际完成。':$('mode').value==='behavior'?'仅记录任务表现与自评。':'请启用摄像头并完成校准。');updateSetup();});
for(const id of ['pre','post'])$(id).addEventListener('input',()=>$(id+'-value').textContent=`${$(id).value} / 10`);
$('camera').onclick=enableCamera;$('release').onclick=()=>{stopCamera();status('摄像头已关闭。');};$('start').onclick=start;$('save').onclick=save;$('stop').onclick=()=>finish('interrupted','你提前结束了测试，本次会话标记为中断。');$('withdraw').onclick=discard;$('discard').onclick=discard;
$('stimulus').addEventListener('pointerdown',respond);document.addEventListener('keydown',respond);
// Default button Space events can otherwise generate a second response. Handle Space centrally.
$('stimulus').addEventListener('click',e=>{if(e.detail===0)e.preventDefault();});
$('demo').onclick=()=>{renderResult(makeDemo());$('dashboard').scrollIntoView({behavior:'smooth'});toast('示例全部由模拟数据生成，未保存到会话历史。');};
$('export-json').onclick=()=>exportSelected('json');$('export-csv').onclick=()=>exportSelected('sessions');$('export-samples').onclick=()=>exportSelected('samples');$('export-trials').onclick=()=>exportSelected('trials');
$('export-all').onclick=async()=>{await refreshHistory();if(!history.length){toast('暂无本地记录。');return;}download('focus-lab-all-sessions.json',JSON.stringify({schema_version:SCHEMA_VERSION,exported_at:new Date().toISOString(),sessions:history},null,2),'application/json');};
$('delete-all').onclick=async()=>{
  if(active||awaitingRating){toast('请先结束、保存或丢弃当前会话。');return;}
  if(!confirm('删除全部 Focus Lab 会话并重置本设备匿名 ID？已导出的文件不受影响。'))return;
  try {await clearSessions();localStorage.removeItem('focus-lab-participant');participant=null;selected=null;stopCamera();$('result').hidden=true;$('empty-result').hidden=false;$('result-badge').textContent='等待数据';await refreshHistory();toast('全部本地会话与匿名 ID 已删除，无法从应用恢复。');}catch {toast('删除未完成，请重试。',true);}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active)finish('interrupted','页面离开前台，计时失去可靠性，本次会话已中断。');else if(worker){stopCamera();status('页面离开前台，摄像头已关闭。');}}});
window.addEventListener('pagehide',()=>{if(active)finish('interrupted','页面关闭或离开。');stopCamera();});
updateSetup();refreshHistory();
