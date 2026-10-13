import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureAccumulator } from '../dist/core.js';
import { LiveEyePreview, cameraReadout, PRESENTATION_VERSION } from '../dist/live-camera.js';
import { makeSession, summaryRows } from '../dist/mission.js';

const frame=(ear=.3,face=true)=>({face_present:face,ear:face?ear:null,gaze_x:null,gaze_y:null,rotation:null});
test('uncalibrated feedback has no invented eye state or zero counts',()=>{
  const preview=new LiveEyePreview();const r=preview.observe(100,frame());
  assert.equal(r.state,'waiting');assert.equal(r.blink_count,null);assert.equal(r.closed_time_ms,null);
});
test('preview shows open/closed, then counts a complete blink without retaining samples',()=>{
  const p=new LiveEyePreview();p.reset(.3);assert.equal(p.observe(1000,frame()).state,'open');
  assert.equal(p.observe(1100,frame(.09)).state,'closed');
  assert.equal(p.observe(1200,frame(.09)).current_closure_ms,100);
  const r=p.observe(1300,frame());assert.equal(r.state,'open');assert.equal(r.blink_count,1);
  assert.equal(r.closed_time_ms,200);assert.equal(r.scope,'Preview only');assert.equal(p.acc.samples.length,0);
});
test('hysteresis does not flicker or count a blink before reopening',()=>{
  const a=new FeatureAccumulator(.3);a.add(0,frame());
  let r=cameraReadout(a,a.add(100,frame(.18)));assert.equal(r.state,'closed');assert.equal(r.blink_count,0);
  r=cameraReadout(a,a.add(200,frame(.21)));assert.equal(r.state,'closed');
  r=cameraReadout(a,a.add(300,frame(.25)));assert.equal(r.state,'open');assert.equal(r.blink_count,1);
});
test('no face, unavailable eyes and stale frames are never reported as open',()=>{
  const a=new FeatureAccumulator(.3);a.add(0,frame());
  assert.equal(cameraReadout(a,a.add(100,frame(null))).state,'unavailable');
  assert.equal(cameraReadout(a,a.add(200,frame(.3,false))).state,'no_face');
  const sample=a.add(300,frame());const stale=cameraReadout(a,sample,{stale:true});
  assert.equal(stale.state,'paused');assert.equal(stale.eye_aspect_ratio,null);
});
test('prolonged closure and tracking gaps do not create false blinks',()=>{
  const a=new FeatureAccumulator(.3);a.add(0,frame());
  for(let t=100;t<=1100;t+=100)a.add(t,frame(.09));
  const r=cameraReadout(a,a.add(1200,frame()));assert.equal(r.blink_count,0);assert.equal(r.closed_time_ms,1100);
  const b=new FeatureAccumulator(.3);b.add(0,frame());b.add(100,frame(.09));
  assert.equal(cameraReadout(b,b.add(900,frame())).blink_count,0);
});
test('task counts start fresh and simulated vision stays labeled',()=>{
  const p=new LiveEyePreview();p.reset(.3);p.observe(0,frame());p.observe(100,frame(.09));p.observe(200,frame());
  const a=new FeatureAccumulator(.3);const r=cameraReadout(a,a.add(0,frame()),{source:'simulated',scope:'This mission'});
  assert.equal(r.blink_count,0);assert.equal(r.source,'simulated');assert.equal(r.scope,'This mission');assert.equal(r.blink_rate_per_min,null);
  for(let t=100;t<=5000;t+=100)a.add(t,frame());assert.equal(cameraReadout(a,a.samples.at(-1)).blink_rate_per_min,0);
});
test('live-feedback presentation is recorded in JSON and CSV without changing task protocol',()=>{
  const s=makeSession({id:'synthetic',participant:'synthetic',mode:'camera',purpose:'demo'});
  assert.equal(s.presentation.version,PRESENTATION_VERSION);assert.equal(s.presentation.raw_frame_storage,false);
  assert.equal(s.protocol_version,'mission-exploratory-v1');assert.equal(s.upload_consent,false);
  s.tasks=[{kind:'pvt',duration_ms:100,status:'completed',behavior_summary:{},vision_summary:{}}];
  const row=summaryRows(s)[0];assert.equal(row.presentation_version,PRESENTATION_VERSION);assert.equal(row.live_eye_feedback,true);
});
