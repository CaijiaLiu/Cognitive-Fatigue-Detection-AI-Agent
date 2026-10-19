'use client';

import { useMemo, useState } from 'react';
import {
  DEMO_DISCLAIMER,
  DEMO_QUESTIONS,
  DEMO_SESSIONS,
  buildClientPayload,
  viewFromHttp,
} from '../../analysis/src/neurolens/runtime/demo-ui.mjs';

const UI_SESSIONS = DEMO_SESSIONS.filter((item) => item.session_ref !== 'fixture:session:other-protocol');

export default function ResearchAgentPanel() {
  const [sessionRef, setSessionRef] = useState<string>(UI_SESSIONS[0].session_ref);
  const [questionId, setQuestionId] = useState<string>(DEMO_QUESTIONS[0].id);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [body, setBody] = useState<Record<string, unknown> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const view = useMemo(
    () => viewFromHttp({ loading, httpStatus, body, networkError }),
    [loading, httpStatus, body, networkError],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNetworkError(null);
    setBody(null);
    setHttpStatus(null);
    try {
      const payload = buildClientPayload({
        session_ref: sessionRef,
        question_id: questionId,
        request_id: `ui:${Date.now()}`,
      });
      const response = await fetch('/api/research-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json() as Record<string, unknown>;
      setHttpStatus(response.status);
      setBody(json);
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'Network request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ background: '#fff', border: '1px solid #e1e7dc', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Ask a fixture question</h2>
        <span style={{ fontSize: 10, padding: '5px 8px', background: '#edf2e9', color: '#678260', borderRadius: 5 }}>
          {DEMO_DISCLAIMER.label}
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#728067', lineHeight: 1.7 }}>{DEMO_DISCLAIMER.text}</p>
      <form onSubmit={onSubmit}>
        <label style={{ display: 'block', fontSize: 11, color: '#7b897b', margin: '16px 0 8px' }} htmlFor="agent-session">
          Authorized synthetic session
        </label>
        <select
          id="agent-session"
          value={sessionRef}
          onChange={(event) => setSessionRef(event.target.value)}
          style={{ width: '100%', padding: 11, border: '1px solid #dfe6d9', borderRadius: 6, background: '#fafbf8' }}
        >
          {UI_SESSIONS.map((session) => (
            <option key={session.session_ref} value={session.session_ref}>
              {session.label} — {session.note}
            </option>
          ))}
        </select>
        <label style={{ display: 'block', fontSize: 11, color: '#7b897b', margin: '16px 0 8px' }} htmlFor="agent-question">
          Supported research question
        </label>
        <select
          id="agent-question"
          value={questionId}
          onChange={(event) => setQuestionId(event.target.value)}
          style={{ width: '100%', padding: 11, border: '1px solid #dfe6d9', borderRadius: 6, background: '#fafbf8' }}
        >
          {DEMO_QUESTIONS.map((question) => (
            <option key={question.id} value={question.id}>
              {question.label} ({question.metric_id})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 18,
            padding: '12px 16px',
            border: 0,
            borderRadius: 8,
            background: '#285a4e',
            color: 'white',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Submitting…' : 'Ask Research Agent'}
        </button>
      </form>
      <div aria-live="polite" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #edf0e9' }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>{view.title}</h3>
        <p style={{ fontSize: 12, color: view.kind === 'error' ? '#a45645' : '#62756c' }}>{view.detail}</p>
        {view.kind === 'success' && Array.isArray(view.claims) && view.claims.map((claim: { text: string; metric_id: string; value: number; unit: string }) => (
          <div key={`${claim.metric_id}-${claim.value}`}>
            <p style={{ fontSize: 18, color: '#3d654c', margin: '12px 0 4px' }}>
              {claim.metric_id}: <strong>{claim.value}</strong> {claim.unit}
            </p>
            {claim.text && <p style={{ fontSize: 12, color: '#62756c', margin: 0 }}>{claim.text}</p>}
          </div>
        ))}
        {Array.isArray(view.artifact_refs) && view.artifact_refs.length > 0 && (
          <p style={{ fontSize: 12 }}>Evidence: {view.artifact_refs.join(', ')}</p>
        )}
        {view.reason_code && <p style={{ fontSize: 12 }}>Reason: {view.reason_code}</p>}
        {Array.isArray(view.limitations) && view.limitations.length > 0 && (
          <ul style={{ fontSize: 11, color: '#728067', paddingLeft: 18 }}>
            {view.limitations.map((line: string) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
