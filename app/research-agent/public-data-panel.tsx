'use client';

import { useMemo, useState } from 'react';
import catalog from '../../analysis/datasets/cognitive-lab/web-catalog.json';
import { buildAgentContext } from '../../analysis/src/neurolens/public-data/evidence.mjs';

type Question = 'overview' | 'board' | 'fatigue';
type Selection = { kind: Question; file: string };
type Counts = { correct: Record<string, number>; incorrect: Record<string, number> };
const control = { display: 'block', width: '100%', padding: 12, border: '1px solid #9aaa9f', borderRadius: 8, background: '#fff', color: '#23443b', marginTop: 8 };

export default function PublicDataPanel() {
  const [kind, setKind] = useState<Question>('overview');
  const [file, setFile] = useState(catalog.records[0].source_file);
  const [submitted, setSubmitted] = useState<Selection | null>(null);
  const context = useMemo(() => submitted ? buildAgentContext(catalog,
    submitted.kind === 'board' ? { tool: 'get_board', file: submitted.file }
      : { tool: submitted.kind === 'overview' ? 'overview' : 'predict_fatigue' }) : null, [submitted]);
  const record = submitted?.kind === 'board' ? catalog.records.find(x => x.source_file === submitted.file) : null;
  const counts = record?.data as Counts | undefined;
  const rows = counts ? [...new Set([...Object.keys(counts.correct), ...Object.keys(counts.incorrect)])]
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1])) : [];

  return (
    <section aria-labelledby="public-evidence-title" style={{ padding: 'clamp(16px, 4vw, 28px)', background: '#f3f6ef', border: '1px solid #d3ddcf', borderRadius: 16, marginTop: 24 }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>REAL PUBLIC DATA · SOURCE LOOKUP</p>
      <h2 id="public-evidence-title" style={{ margin: '12px 0' }}>Explore published research results</h2>
      <p style={{ lineHeight: 1.7 }}>This reads actual published numeric records from <em>Cognitive Fatigue</em> (Figshare, v3).
        It is a deterministic evidence lookup, not a live LLM, trained model, or fatigue assessment.</p>
      <p style={{ lineHeight: 1.7, fontSize: 14 }}>Varandas, Silveira &amp; Gamboa · 2025 ·{' '}
        <a href="https://doi.org/10.6084/m9.figshare.28188143.v3" target="_blank" rel="noreferrer">Original dataset ↗</a>{' · '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 ↗</a>
        <br />Subset: 20 board-result files. The study excluded one participant; this subset does not identify that exclusion.</p>
      <form onSubmit={event => { event.preventDefault(); setSubmitted({ kind, file }); }}>
        <label htmlFor="public-question" style={{ display: 'block', fontWeight: 600 }}>What would you like to inspect?</label>
        <select id="public-question" value={kind} style={control} onChange={event => { setKind(event.target.value as Question); setSubmitted(null); }}>
          <option value="overview">What data are available?</option>
          <option value="board">Show the values in a source record</option>
          <option value="fatigue">Can these records tell whether someone is fatigued?</option>
        </select>
        {kind === 'board' && <label htmlFor="public-record" style={{ display: 'block', marginTop: 18, fontWeight: 600 }}>Source record
          <select id="public-record" value={file} style={{ ...control, fontSize: 13 }} onChange={event => { setFile(event.target.value); setSubmitted(null); }}>
            {catalog.records.map(item => <option key={item.record_ref} value={item.source_file}>{item.source_alias} · {item.source_file}</option>)}
          </select>
        </label>}
        <button type="submit" style={{ padding: '12px 20px', marginTop: 20, background: '#315e4c', border: 0, borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Read source evidence</button>
      </form>

      <div role="status" aria-live="polite" style={{ marginTop: 24 }}>
        {!submitted && <p>Select a question, then read the source evidence. No camera or API key is needed.</p>}
        {submitted?.kind === 'overview' && context?.evidence.status === 'answered' && <div>
          <h3>Available: {catalog.records.length} source files, {new Set(catalog.records.map(item => item.source_alias)).size} source aliases</h3>
          <p>These are published numeric board results, not our game sessions. The number of eligible analysis participants is unknown here.</p>
          <p>No webcam features, PVT reaction times, or independent fatigue labels are included.</p>
        </div>}
        {submitted?.kind === 'fatigue' && context?.evidence.status === 'abstained' && <div style={{ padding: 16, background: '#fff7e5', borderRadius: 8 }}>
          <h3>Insufficient evidence — no fatigue conclusion</h3>
          <p>The selected files do not contain independent fatigue labels. Board numbers cannot be treated as “rested” or “fatigued”. This lookup therefore abstains.</p>
        </div>}
        {record && counts && context?.evidence.status === 'answered' && <div>
          <h3>Source record: {record.source_alias}</h3>
          <p>Values below are copied from the published file. “Not recorded” means the field is absent; it is not replaced with zero.</p>
          <div style={{ overflowX: 'auto', background: 'white', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <caption style={{ textAlign: 'left', padding: 12, overflowWrap: 'anywhere' }}>{record.source_file}</caption>
              <thead><tr>{['Source row', 'Reported correct', 'Reported incorrect'].map(text => <th key={text} style={{ padding: 12, borderBottom: '1px solid #d3ddcf' }}>{text}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={row}>
                <th scope="row" style={{ padding: 12, fontWeight: 400 }}>{row}</th>
                <td style={{ padding: 12 }}>{Object.hasOwn(counts.correct, row) ? counts.correct[row] : 'Not recorded'}</td>
                <td style={{ padding: 12 }}>{Object.hasOwn(counts.incorrect, row) ? counts.incorrect[row] : 'Not recorded'}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, overflowWrap: 'anywhere' }}>Citation: {record.record_ref}<br />Source SHA256: {record.sha256}<br />
            <a href={record.source_url} target="_blank" rel="noreferrer">Download original numeric source file ↗</a></p>
        </div>}
      </div>
      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Data limitations and provenance</summary>
        <ul style={{ paddingLeft: 22, lineHeight: 1.7 }}>{(context?.evidence.limitations ?? buildAgentContext(catalog, { tool: 'overview' }).evidence.limitations).map((text: string) => <li key={text}>{text}</li>)}</ul>
        <p>Source JSON values are unchanged; Git copies add one trailing newline. No personal media, local sessions or demographics are included.</p>
      </details>
      {context && <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer' }}>Evidence package for AI agents (JSON)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, background: 'white', padding: 16 }}>{JSON.stringify(context, null, 2)}</pre>
      </details>}
    </section>
  );
}
