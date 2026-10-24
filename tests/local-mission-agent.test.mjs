import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeSession, recordRating, taskSummary } from '../previews/mission/dist/mission.js';
import { readMissionEvidence, parseMissionJSON, answerLocalQuestion, MAX_IMPORT_BYTES } from '../analysis/src/neurolens/local-session/mission-evidence.mjs';
import { loadLocalMissionRecords } from '../analysis/src/neurolens/local-session/browser-store.mjs';

// Synthetic unit fixture only. No real sessions, browser access or camera.
function fixture(mode='behavior',purpose='pilot') {
  const at='2026-10-23T00:00:00.000Z';
  const s=makeSession({id:'11111111-1111-4111-8111-111111111111',participant:'SYNTHETIC-PRIVATE-ID',mode,purpose,consentAt:at,startedAt:at});
  s.status='completed';s.ended_at='2026-10-23T00:01:00.000Z';
  for(const [stage,value]of[['pre',2],['between',4],['post',6]]) recordRating(s,stage,value,at);
  const trial=(type,onset,rt,correct,invalid_reason=null)=>({index:0,type,onset_ms:onset,deadline_ms:onset+(type==='signal'?10000:1000),response_ms:rt===null?null:onset+rt,reaction_ms:rt,responded:rt!==null,correct,invalid_reason,source:'human',input:rt===null?null:'keyboard'});
  s.tasks=[{kind:'pvt',protocol:'pvt-web-exploratory-v1',status:'completed',duration_ms:20000,trials:[trial('signal',1000,300,true)]},
    {kind:'attention',protocol:'go-no-go-v1-game-skin',status:'completed',duration_ms:20000,trials:[trial('go',1000,200,true),{...trial('no-go',3000,null,true),index:1},{...trial('go',5000,null,false,'session_ended_before_deadline'),index:2}]}];
  for(const task of s.tasks)task.behavior_summary=taskSummary(task.kind,task.trials);
  return s;
}
test('producer session -> validated evidence -> exact task/rating answers',()=>{
  const e=readMissionEvidence(fixture());
  assert.equal(e.tasks[0].summary.median_reaction_ms,300);
  assert.equal(e.tasks[1].summary.accuracy,1);
  assert.equal(e.tasks[1].summary.valid_trial_count,2);
  assert.equal(e.tasks[1].summary.invalid_trial_count,1);
  assert.equal(answerLocalQuestion(e,'performance').status,'answered');
  assert.deepEqual(answerLocalQuestion(e,'ratings').ratings,{pre:2,between:4,post:6});
  assert.equal(answerLocalQuestion(e,'fatigue').status,'abstained');
});
test('schema and source labels are preserved, never V1-coerced',()=>{
  for(const mode of ['camera','behavior','simulated']){
    const e=readMissionEvidence(fixture(mode,'demo'));
    assert.equal(e.source_schema,'mission-preview-1');assert.equal(e.purpose,'demo');
    assert.equal(e.sources.vision,mode==='camera'?'camera':mode==='simulated'?'simulated':'unavailable');
  }
  const s=fixture();s.schema_version='1.0.0';assert.throws(()=>readMissionEvidence(s),/Unsupported/);
  const mixed=fixture();mixed.sources.vision='simulated';assert.throws(()=>readMissionEvidence(mixed),/source/);
});
test('saved summary tampering never controls the displayed numbers',()=>{
  const s=fixture();s.tasks[0].behavior_summary.median_reaction_ms=999;
  const e=readMissionEvidence(s);assert.equal(e.tasks[0].summary.median_reaction_ms,300);assert.equal(e.warnings.length,1);
});
test('unknown/missing response data and zero-trial tasks stay missing, not zero RT',()=>{
  const s=fixture();s.status='interrupted';s.ratings.post=null;s.tasks[0].trials=[];s.tasks[1].trials=[];
  const e=readMissionEvidence(s);assert.equal(e.tasks[0].summary.median_reaction_ms,null);
  assert.equal(e.tasks[1].summary.accuracy,null);assert.equal(e.ratings.post,null);
});
test('drafts, invalid timestamps/ratings/task order and incomplete completed records fail',()=>{
  const cases=[s=>s.status='in_progress',s=>s.ended_at='bad',s=>s.ratings.pre=11,s=>s.tasks.reverse(),s=>s.tasks.pop(),s=>s.upload_consent=true,s=>s.consent=null];
  for(const change of cases){const s=fixture();change(s);assert.throws(()=>readMissionEvidence(s));}
});
test('malformed trials, fabricated correctness and synthetic behavior fail',()=>{
  for(const change of [r=>r.correct=false,r=>r.source='simulated',r=>r.response_ms=NaN,r=>r.reaction_ms=-2,r=>r.index=99,r=>r.deadline_ms=2,r=>r.response_ms=999999]){
    const s=fixture();change(s.tasks[0].trials[0]);assert.throws(()=>readMissionEvidence(s));
  }
});
test('PVT false starts and interrupted trials retain the original summary semantics',()=>{
  const s=fixture();s.tasks[0].trials.push({index:1,type:'false-start',onset_ms:1500,deadline_ms:null,response_ms:1501,reaction_ms:null,responded:true,correct:false,invalid_reason:null,source:'human'});
  const e=readMissionEvidence(s);assert.equal(e.tasks[0].summary.false_starts,1);assert.equal(e.tasks[0].summary.median_reaction_ms,300);
});
test('evidence is an allowlist: participant ID, notes, samples and tokens never escape',()=>{
  const s=fixture();s.notes=['SECRET-NOTE'];s.token='SECRET-TOKEN';s.tasks[0].samples=[{raw:'SECRET-FACE'}];
  const e=readMissionEvidence(s),text=JSON.stringify(e);
  for(const secret of ['SYNTHETIC-PRIVATE-ID','SECRET-NOTE','SECRET-TOKEN','SECRET-FACE'])assert.ok(!text.includes(secret));
  e.ratings.pre=8;assert.equal(s.ratings.pre,2);
});
test('JSON import enforces size/schema and performs no persistence',()=>{
  assert.equal(parseMissionJSON(JSON.stringify(fixture())).tasks.length,2);
  assert.throws(()=>parseMissionJSON('bad'));
  assert.throws(()=>parseMissionJSON(' '.repeat(MAX_IMPORT_BYTES+1)),/2 MB/);
  assert.throws(()=>parseMissionJSON(JSON.stringify([fixture()])),/Unsupported/);
});
function memoryFactory(records,{missing=false,blocked=false}={}) {
  const state={writes:0,closed:0,mode:null};
  return {state,open(){const req={};queueMicrotask(()=>{
    if(blocked){req.onblocked();return;}
    if(missing){req.transaction={abort(){state.aborted=true;}};req.onupgradeneeded();return;}
    req.result={objectStoreNames:{contains:()=>true},close(){state.closed++;},transaction(name,mode){state.mode=mode;const tx={objectStore(){return{getAll(){const read={result:records};queueMicrotask(()=>tx.oncomplete());return read;}}}};return tx;}};
    req.onsuccess();
  });return req;}};
}
test('browser storage uses readonly, closes DB and never mutates records',async()=>{
  const f=memoryFactory([fixture()]);const got=await loadLocalMissionRecords(f);
  assert.equal(got.length,1);assert.equal(f.state.mode,'readonly');assert.equal(f.state.closed,1);
});
test('missing DB aborts creation; unavailable or blocked stores report actionable errors',async()=>{
  const missing=memoryFactory([],{missing:true});await assert.rejects(loadLocalMissionRecords(missing),/No local/);assert.equal(missing.state.aborted,true);
  await assert.rejects(loadLocalMissionRecords(memoryFactory([],{blocked:true})),/blocked/);
  await assert.rejects(loadLocalMissionRecords(null),/unavailable/);
});
test('same-origin game link, explicit loading and no network imports in the bridge',async()=>{
  const app=await readFile(new URL('../previews/mission/dist/app.js',import.meta.url),'utf8');
  const link=await readFile(new URL('../previews/mission/dist/agent-link.js',import.meta.url),'utf8');
  const panel=await readFile(new URL('../app/research-agent/local-session-panel.tsx',import.meta.url),'utf8');
  assert.match(app,/updateAgentLink/);assert.match(link,/\/research-agent#local-results/);
  assert.match(panel,/Load my local game sessions/);
  assert.doesNotMatch(panel,/\bfetch\s*\(|useEffect|OPENAI_API_KEY/);
});
