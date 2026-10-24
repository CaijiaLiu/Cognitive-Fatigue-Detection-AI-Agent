'use client';
import { useState } from 'react';
import { readMissionEvidence, parseMissionJSON, answerLocalQuestion, MAX_IMPORT_BYTES } from '../../analysis/src/neurolens/local-session/mission-evidence.mjs';
import { loadLocalMissionRecords } from '../../analysis/src/neurolens/local-session/browser-store.mjs';

type Evidence = ReturnType<typeof readMissionEvidence>;
const button = { padding:'11px 16px', border:'1px solid #a7b6aa', borderRadius:8, background:'white', color:'#23443b', cursor:'pointer', fontWeight:600 };
const format = (n: number | null | undefined) => n == null ? 'Not available' : n.toLocaleString('en-US',{maximumFractionDigits:1});

export default function LocalSessionPanel() {
  const [sessions,setSessions] = useState<Evidence[]>([]);
  const [selected,setSelected] = useState('');
  const [message,setMessage] = useState('Local records are read only when you click Load. No session is sent to a server or LLM.');
  const [busy,setBusy] = useState(false);
  const [question,setQuestion] = useState('performance');
  const [answer,setAnswer] = useState<ReturnType<typeof answerLocalQuestion> | null>(null);
  const [origin,setOrigin] = useState('');
  const evidence = sessions.find(s => s.session_ref === selected);
  function show(records:Evidence[],source:string) {
    records.sort((a,b) => Date.parse(b.started_at)-Date.parse(a.started_at));
    setSessions(records);setSelected(records[0]?.session_ref??'');setAnswer(null);setOrigin(source);
  }
  async function load() {
    setBusy(true);setAnswer(null);show([],'');
    try {
      const raw = await loadLocalMissionRecords();
      const usable:Evidence[]=[];let skipped=0;
      for (const value of raw as unknown[]) {try {usable.push(readMissionEvidence(value));}catch {skipped++;}}
      show(usable,'Same-origin browser storage');
      setMessage(`${usable.length} readable saved session(s). ${skipped} draft, unsupported or invalid record(s) skipped. No data was changed.`);
    } catch(error) {setMessage(error instanceof Error?error.message:'Cannot read local sessions.');}
    finally {setBusy(false);}
  }
  async function openFile(file?:File) {
    if (!file)return;
    setAnswer(null);show([],'');setBusy(true);
    try {
      if(file.size>MAX_IMPORT_BYTES)throw Error('File exceeds 2 MB. Choose a single mission JSON export.');
      const value=parseMissionJSON(await file.text());
      show([value],'JSON opened locally (not saved or uploaded)');
      setMessage('Opened in this page only. Reload or Clear view to forget it. The original file and browser database are unchanged.');
    }catch(error){setMessage(error instanceof Error?error.message:'Invalid JSON.');}
    finally{setBusy(false);}
  }
  return <section id="local-results" aria-labelledby="local-title" style={{padding:'clamp(16px,4vw,28px)',border:'1px solid #b7c9bd',background:'#edf5ef',borderRadius:16,marginTop:24}}>
    <p style={{fontSize:12,letterSpacing:1,fontWeight:700}}>YOUR GAME RESULTS · LOCAL ONLY</p>
    <h2 id="local-title">Read the session you just played</h2>
    <p style={{lineHeight:1.7}}>Play the connected game, save the session, then return here and load it. The reader recalculates task results from recorded trials. This is a descriptive assistant, not an LLM or fatigue predictor.</p>
    <p><a href="/mission/index.html" style={{fontWeight:600}}>Play connected English game →</a></p>
    <p style={{fontSize:14,lineHeight:1.6}}>Use the same browser and address. Sessions at the old 4177 address remain there; export one as JSON and open it below if you choose. We do not migrate records automatically.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center'}}>
      <button style={button} onClick={load} disabled={busy}>{busy?'Reading…':'Load my local game sessions'}</button>
      <button style={button} onClick={()=>{show([],'');setMessage('View cleared. No saved record was deleted.');}} disabled={busy}>Clear view</button>
      <label style={{display:'block',fontSize:14}}>Or open an exported JSON locally (≤2 MB)
        <input aria-label="Open mission JSON locally" type="file" accept=".json,application/json" disabled={busy} style={{display:'block',maxWidth:'100%',marginTop:6}} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void openFile(file);}}/>
      </label>
    </div>
    <p role="status" style={{fontSize:14,lineHeight:1.6}}>{message}</p>
    {!!sessions.length && <label style={{display:'block',fontWeight:600}}>Saved session
      <select aria-label="Saved game session" value={selected} style={{display:'block',width:'100%',padding:12,marginTop:8,background:'white',borderRadius:8}} onChange={event=>{setSelected(event.target.value);setAnswer(null);}}>
        {sessions.map(s=><option key={s.session_ref} value={s.session_ref}>{new Date(s.started_at).toLocaleString('en-US')} · {s.status} · {s.purpose} · {s.mode}</option>)}
      </select>
    </label>}
    {evidence && <div style={{marginTop:20}}>
      <p><strong>{evidence.purpose==='demo'?'DEMO / exclude from efficacy research':'EXPLORATORY PILOT'} · {evidence.status.toUpperCase()} · {evidence.sources.vision==='simulated'?'SIMULATED VISION':evidence.sources.vision==='camera'?'CAMERA MODE (not accuracy-validated)':'TASK ONLY / NO VISION'}</strong></p>
      <p style={{fontSize:13}}>Read from: {origin}. Protocol: {evidence.protocol}.</p>
      {evidence.warnings.map(w=><p key={w} role="alert">Integrity notice: {w}</p>)}
      <label style={{display:'block',fontWeight:600}}>Question
        <select aria-label="Question about my game" value={question} onChange={event=>{setQuestion(event.target.value);setAnswer(null);}} style={{display:'block',width:'100%',padding:12,marginTop:8,borderRadius:8,background:'white'}}>
          <option value="performance">What were my task results?</option>
          <option value="ratings">What fatigue ratings did I give?</option>
          <option value="fatigue">Do these results mean I am fatigued?</option>
        </select>
      </label>
      <button style={{...button,marginTop:16,background:'#315e4c',color:'white'}} onClick={()=>setAnswer(answerLocalQuestion(evidence,question))}>Read my result</button>
      {answer && <div role="status" style={{marginTop:20,padding:18,background:'white',borderRadius:10}}>
        <h3>{answer.status==='abstained'?'Insufficient evidence':'Your recorded result'}</h3><p>{answer.answer}</p>
        {question==='performance' && answer.status==='answered' && evidence.tasks.map((t: {kind:string;status:string;summary:Record<string,number|null>})=><div key={t.kind} style={{borderTop:'1px solid #d3ddcf',paddingTop:12,marginTop:12}}>
          <h4>{t.kind==='pvt'?'Signal receiver / PVT-inspired':'Cargo sorter / Go-No-Go'} · {t.status}</h4>
          <p>Median reaction time: {format(t.summary.median_reaction_ms)} ms<br/>
            Valid trials: {t.summary.valid_trial_count}; invalid trials: {t.summary.invalid_trial_count}<br/>
            Omissions: {t.summary.omissions}</p>
          {t.kind==='attention' && <p>Accuracy: {'accuracy' in t.summary && t.summary.accuracy!=null?format(t.summary.accuracy*100)+'%':'Not available'}<br/>False alarms: {'false_alarms' in t.summary?t.summary.false_alarms:'Not available'}</p>}
        </div>)}
        {question==='ratings' && answer.status==='answered' && <p>Before: {format(evidence.ratings.pre)} / 10<br/>Between tasks: {format(evidence.ratings.between)} / 10<br/>After: {format(evidence.ratings.post)} / 10<br/>These are your self-ratings, not predicted fatigue.</p>}
        <p style={{fontSize:12,overflowWrap:'anywhere'}}>Source: {answer.source_refs.length?answer.source_refs.join(', '):'No supported fatigue inference'}</p>
      </div>}
      <details style={{marginTop:18}}><summary>Evidence and limitations (no raw camera samples or participant ID)</summary>
        <ul>{evidence.limitations.map(text=><li key={text}>{text}</li>)}</ul>
        <pre style={{fontSize:12,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(evidence,null,2)}</pre>
      </details>
    </div>}
  </section>;
}
