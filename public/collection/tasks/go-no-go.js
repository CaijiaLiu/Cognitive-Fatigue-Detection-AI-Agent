// V1 adapter: task timing/state is independent of camera and persistence.
export function createGoNoGoTask({getSession, getElapsed, shape, stimulus, document: doc = document}) {
  const document=doc;
  const $=id=>id==='shape'?shape:stimulus;
  let taskTimer, trialOnsetFrame, currentTrial=null, nextIndex=0;
function scheduleTrial(delay){taskTimer=setTimeout(showTrial,delay);}
function random(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
function showTrial(){
  if(!getSession())return;
  const elapsed=getElapsed();
  // Do not start a trial that cannot finish before the planned end.
  if(elapsed+1100>=getSession().config.planned_duration_ms)return;
  const type=random()<.75?'go':'no-go';
  trialOnsetFrame=requestAnimationFrame(()=>{
    if(!getSession())return;
    const onset=getElapsed();
    $('shape').className='shape '+type;$('shape').textContent='';
    currentTrial={index:nextIndex++,type,onset_ms:onset,deadline_ms:onset+1000,response_ms:null,reaction_ms:null,responded:false,correct:false,invalid_reason:null,source:'human'};
    taskTimer=setTimeout(()=>closeTrial(),1000);
  });
}
function respond(event){
  if(!getSession())return;
  if(event?.type==='keydown'&&(event.code!=='Space'||event.repeat))return;
  if(event?.type==='keydown'&&['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName)) {
    // Keyboard response works from the stimulus, but not while interacting with controls.
    if(document.activeElement!==$('stimulus'))return;
  }
  event?.preventDefault();
  const elapsed=getElapsed();
  if(!currentTrial){getSession().events.push({type:'inter_trial_response',elapsed_ms:elapsed});return;}
  if(currentTrial.responded)return;
  if(elapsed>currentTrial.deadline_ms){getSession().events.push({type:'late_response',elapsed_ms:elapsed,trial_index:currentTrial.index});return;}
  currentTrial.responded=true;currentTrial.response_ms=elapsed;currentTrial.reaction_ms=elapsed-currentTrial.onset_ms;
  currentTrial.input=event?.type==='keydown'?'keyboard':'pointer';
}
function closeTrial(invalidReason=null){
  if(!getSession()||!currentTrial)return;
  const t=currentTrial;
  if(!invalidReason&&getElapsed()-t.deadline_ms>150)invalidReason='timer_lag_over_150ms';
  t.invalid_reason=invalidReason;
  t.correct=!invalidReason&&(t.type==='go'?(t.responded&&t.reaction_ms>=100):!t.responded);
  getSession().trials.push(t);currentTrial=null;
  $('shape').className='shape neutral';$('shape').textContent='+';
  if(!invalidReason)scheduleTrial(600+random()*700);
}

  return { schedule: scheduleTrial, respond, close: closeTrial,
    reset(){currentTrial=null;nextIndex=0;},
    cancel(){clearTimeout(taskTimer);cancelAnimationFrame(trialOnsetFrame);},
    discard(){this.cancel();currentTrial=null;}
  };
}
