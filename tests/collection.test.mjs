import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureAccumulator, simulatedFeatures, extractFeatures, summarizeTrials, toCSV, exportRows } from '../public/collection/core.js';
import { sourceLabel, sources } from '../public/collection/session/provenance.js';
import { createGoNoGoTask } from '../public/collection/tasks/go-no-go.js';

test('tracking dropout does not count as a blink or closed exposure', () => {
  const acc=new FeatureAccumulator(.3);
  const f=ear=>({face_present:true,ear,gaze_x:.5,gaze_y:0,rotation:null});
  acc.add(0,f(.3));acc.add(100,f(.1));
  acc.add(200,{face_present:false,ear:null});acc.add(300,f(.3));
  assert.equal(acc.blinks.length,0);
  assert.equal(acc.samples[2].eyes_closed,null);
  assert.equal(acc.summary(300).closed_time_ms,0);
  assert.equal(acc.summary(300).valid_tracking_ms,100);
});
test('blink exposure, provenance and exports retain V1 meanings', () => {
  const acc=new FeatureAccumulator(.3);
  for(let t=0;t<=6000;t+=100)acc.add(t,simulatedFeatures(t),'simulated');
  assert.equal(acc.summary(6000).blink_count,2);
  assert.equal(acc.summary(6000).closed_time_ms,400);
  const session={session_id:'synthetic',participant_id:'synthetic',sources:{vision:'simulated',behavior:'human'},samples:acc.samples};
  assert.equal(exportRows([session],'samples')[0].vision_source,'simulated');
  assert.ok(toCSV([{text:'=formula',value:null}]).includes("'=formula"));
  assert.equal(sources('behavior').vision,'unavailable');
  assert.equal(sourceLabel({mode:'behavior',sources:sources('behavior')}),'真实任务 / 无视觉');
});
test('invalid trials stay outside performance denominator', () => {
  const summary=summarizeTrials([
    {type:'go',correct:true,responded:true,reaction_ms:250},
    {type:'go',correct:false,responded:false},
    {type:'no-go',correct:false,responded:true,reaction_ms:300},
    {type:'go',correct:false,responded:false,invalid_reason:'interrupted'}
  ]);
  assert.equal(summary.valid_trial_count,3);assert.equal(summary.invalid_trial_count,1);
  assert.equal(summary.omissions,1);assert.equal(summary.false_alarms,1);
  assert.equal(summary.median_reaction_ms,250);assert.equal(summary.accuracy,1/3);
  assert.equal(extractFeatures({}).face_present,false);
});
test('task adapter records one response and cancels pending stimulus on interruption', () => {
  const timers=new Map();let id=0,elapsed=0;
  const original={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  globalThis.setTimeout=fn=>{timers.set(++id,fn);return id;};
  globalThis.clearTimeout=key=>timers.delete(key);
  globalThis.requestAnimationFrame=globalThis.setTimeout;
  globalThis.cancelAnimationFrame=globalThis.clearTimeout;
  try {
    const session={config:{planned_duration_ms:30000},trials:[],events:[]},shape={},stimulus={};
    const task=createGoNoGoTask({getSession:()=>session,getElapsed:()=>elapsed,shape,stimulus,document:{activeElement:stimulus}});
    const flush=()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);fn();};
    task.schedule(900);flush();flush();elapsed=300;
    task.respond({type:'pointerdown',preventDefault(){}});task.respond({type:'pointerdown',preventDefault(){}});
    elapsed=1000;flush();assert.equal(session.trials.length,1);
    assert.equal(session.trials[0].reaction_ms,300);
    task.cancel();assert.equal(timers.size,0);
    task.reset();task.schedule(900);flush();task.cancel();
    assert.equal(timers.size,0);assert.equal(session.trials.length,1);
  } finally {for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
