// DOM-level orchestration smoke test with memory storage and a controlled clock.
// Does not validate browser camera hardware, IndexedDB implementation or MediaPipe accuracy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
const root=new URL('../public/collection/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
function element(){return {value:'',hidden:false,disabled:false,checked:false,textContent:'',style:{},children:[],handlers:{},classList:{toggle(){},add(){},remove(){}},addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(...xs){this.children=xs;},append(...xs){this.children.push(...xs);},setAttribute(){},scrollIntoView(){},focus(){},click(){},getTracks(){return [];}};}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],element()]));
const get=id=>{assert.ok(elements.has(id),`Missing HTML element: ${id}`);return elements.get(id);};
get('mode').value='simulated';get('duration').value='30';get('pre').value='3';get('post').value='4';
const doc={getElementById:get,createElement:element,createElementNS:element,createTextNode:element,addEventListener(){},hidden:false,visibilityState:'visible',activeElement:null};
const storage=new Map(),sessions=new Map();let time=0,id=0;const timers=new Map();
const later=(fn,delay=0,interval=0)=>{timers.set(++id,{fn,at:time+delay,interval});return id;};
const cancel=key=>timers.delete(key);
const localStorage={length:0,key(){return null;},getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const context=createContext({console,crypto,Blob,URL,localStorage,document:doc,window:{addEventListener(){}},navigator:{userAgent:'synthetic-test'},innerWidth:1280,innerHeight:720,devicePixelRatio:1,performance:{now:()=>time},setTimeout:later,clearTimeout:cancel,setInterval:(fn,d)=>later(fn,d,d),clearInterval:cancel,requestAnimationFrame:fn=>later(fn,16),cancelAnimationFrame:cancel,confirm:()=>true});
const modules=new Map();
async function load(url){
 if(modules.has(url.href))return modules.get(url.href);
 let m;
 if(url.pathname.endsWith('/persistence/local.js')){
  const api={participantId:()=> 'synthetic-participant',putSession:async s=>sessions.set(s.session_id,structuredClone(s)),allSessions:async()=>[...sessions.values()],deleteSession:async id=>sessions.delete(id),clearSessions:async()=>sessions.clear()};
  m=new SyntheticModule(Object.keys(api),function(){for(const [k,v] of Object.entries(api))this.setExport(k,v);},{context,identifier:url.href});
 }else m=new SourceTextModule(await readFile(fileURLToPath(url),'utf8'),{context,identifier:url.href,initializeImportMeta(meta){meta.url=url.href;}});
 modules.set(url.href,m);return m;
}
const entry=await load(new URL('app.js',root));await entry.link((specifier,ref)=>load(new URL(specifier,ref.identifier)));await entry.evaluate();
assert.equal(get('start').disabled,true);
get('demo').onclick();assert.match(get('result-badge').textContent,/模拟/);
get('consent').checked=true;get('consent').handlers.change();assert.equal(get('start').disabled,false);
await get('start').onclick();
while(time<30100){
 const pending=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;
 const [key,timer]=pending;if(timer.at>30100)break;time=timer.at;timers.delete(key);
 if(timer.interval)timers.set(key,{...timer,at:time+timer.interval});timer.fn();await Promise.resolve();
}
assert.equal(get('post-panel').hidden,false);await get('save').onclick();
const saved=[...sessions.values()][0];assert.equal(saved.status,'completed');assert.equal(saved.sources.vision,'simulated');assert.ok(saved.samples.length>200);assert.ok(saved.trials.length>5);assert.equal(saved.fatigue_post,3);
get('mode').value='behavior';get('mode').handlers.change();await get('start').onclick();get('stop').onclick();await get('save').onclick();
assert.match(get('result-badge').textContent,/无视觉/);
assert.equal([...sessions.values()][1].status,'interrupted');assert.equal([...sessions.values()][1].vision_summary.blink_count,null);
assert.equal(sessions.size,2);
console.log('PASS: collection module graph, consent gate, demo rendering, simulated completion/save and task-only interruption (controlled DOM/clock).');
