import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';
const req=(path,body,extra={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
const id=crypto.randomUUID(),withdrawal='a'.repeat(64);
const s={schema_version:'1.0.0',session_id:id,participant_id:crypto.randomUUID(),mode:'simulated',status:'completed',started_at:'2026-10-10T10:00:00Z',ended_at:'2026-10-10T10:00:30Z',duration_ms:30000,fatigue_pre:3,fatigue_post:4,consent:{version:'v1-2026-10-10',accepted_at:'2026-10-10T10:00:00Z'},upload_consent:{accepted:true,version:'upload-v1',accepted_at:'2026-10-10T10:00:31Z'},sources:{vision:'simulated',behavior:'human',ratings:'self_report'},samples:[],trials:[],blink_events:[],environment:{user_agent:'must-be-stripped'},video:'must-be-stripped'};
assert.equal((await fetch(origin+'/collection/index.html')).status,200);
// Public entrypoints and extracted modules must remain available after moves.
for (const path of ['app.js','core.js','camera.js','storage.js','cloud.js','tracker.worker.js',
 'session/controller.js','session/versions.js','session/provenance.js','session/demo.js',
 'tracking/controller.js','tracking/camera.js','tracking/mediapipe.worker.js','tracking/simulated.js',
 'features/extract.js','features/accumulator.js','features/unavailable.js',
 'tasks/go-no-go.js','tasks/summary.js','reporting/dashboard.js','reporting/export.js',
 'reporting/format.js','reporting/download.js','persistence/local.js','persistence/cloud.js','shared/statistics.js']) {
 const asset=await fetch(origin+'/collection/'+path);
 assert.equal(asset.status,200,path);
 assert.ok(!(asset.headers.get('content-type')||'').includes('text/html'),path+' must be a script, not an HTML fallback');
}

assert.equal((await fetch(origin+'/api/research/export')).status,403);
assert.equal((await req('/api/research/remove',{session_id:id})).status,403);
const foreign=await fetch(origin+'/api/upload-ticket',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json'},body:JSON.stringify({session_id:id})});assert.equal(foreign.status,403);
const ticketResponse=await req('/api/upload-ticket',{session_id:id});const ticket=await ticketResponse.json();assert.equal(ticketResponse.status,200,JSON.stringify(ticket));
const authorization={Authorization:'Bearer '+ticket.token};
const noConsent={...s,upload_consent:undefined};assert.equal((await req('/api/submissions',{session:noConsent,withdrawal_token:withdrawal},authorization)).status,400);
assert.equal((await req('/api/submissions',{session:{...s,session_id:crypto.randomUUID()},withdrawal_token:withdrawal},authorization)).status,401);
const upload=await req('/api/submissions',{session:s,withdrawal_token:withdrawal},authorization);const saved=await upload.json();assert.equal(upload.status,200,JSON.stringify(saved));assert.equal(saved.saved,true);
assert.equal((await req('/api/submissions',{session:s,withdrawal_token:withdrawal},authorization)).status,200);
const sign=await fetch(origin+'/signin-with-chatgpt?return_to=/research',{redirect:'manual'});const cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookie);
const exported=await fetch(origin+'/api/research/export',{headers:{Cookie:cookie}});const data=await exported.json();assert.equal(exported.status,200,JSON.stringify(data));
const record=data.sessions.find(x=>x.session_id===id);assert.ok(record);assert.equal(record.environment,undefined);assert.equal(record.video,undefined);assert.equal(record.sources.vision,'simulated');assert.equal(data.sessions.filter(x=>x.session_id===id).length,1);
const csv=await fetch(origin+'/api/research/export?format=csv',{headers:{Cookie:cookie}});assert.equal(csv.status,200);assert.ok((await csv.text()).includes(id));
const invalidDelete=await fetch(origin+'/api/submissions',{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({session_id:id,withdrawal_token:'b'.repeat(64)})});assert.equal(invalidDelete.status,404);
const del=await fetch(origin+'/api/submissions',{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({session_id:id,withdrawal_token:withdrawal})});assert.equal(del.status,200);
assert.equal((await req('/api/submissions',{session:s,withdrawal_token:withdrawal},authorization)).status,401);
console.log('PASS: public page, private read/delete denial, foreign-origin denial, consent gate, ticket binding, idempotent upload, owner export, sanitization, CSV, wrong withdrawal denial, withdrawal and replay prevention. Synthetic local fixture removed.');
