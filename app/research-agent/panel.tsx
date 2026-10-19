'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEMO_DISCLAIMER,
  DEMO_QUESTIONS,
  DEMO_SESSIONS,
  buildClientPayload,
  viewFromHttp,
} from '../../analysis/src/neurolens/runtime/demo-ui.mjs';

const UI_SESSIONS = DEMO_SESSIONS.filter((item) => item.session_ref !== 'fixture:session:other-protocol');

type SessionState = {
  authenticated: boolean;
  auth_required: boolean;
  provider?: Record<string, unknown>;
};

export default function ResearchAgentPanel() {
  const [sessionRef, setSessionRef] = useState<string>(UI_SESSIONS[0].session_ref);
  const [questionId, setQuestionId] = useState<string>(DEMO_QUESTIONS[0].id);
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [body, setBody] = useState<Record<string, unknown> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authBusy, setAuthBusy] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const view = useMemo(
    () => viewFromHttp({ loading, httpStatus, body, networkError }),
    [loading, httpStatus, body, networkError],
  );
  const signedIn = session?.authenticated === true || session?.auth_required === false;

  async function refreshSession() {
    const response = await fetch('/api/research-agent/session', { credentials: 'include' });
    const json = await response.json() as SessionState & { error?: string };
    if (response.status === 503) {
      setSession({ authenticated: false, auth_required: true });
      setAuthMessage('This demo is not configured for public use.');
      return;
    }
    setSession({
      authenticated: json.authenticated === true,
      auth_required: json.auth_required !== false,
      provider: json.provider,
    });
  }

  useEffect(() => {
    refreshSession().catch(() => {
      setAuthMessage('Unable to check demo authentication.');
    }).finally(() => setAuthBusy(false));
  }, []);

  async function onLogin(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const response = await fetch('/api/research-agent/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) {
        setAuthMessage(response.status === 429
          ? 'Too many sign-in attempts. Please wait and try again.'
          : 'Sign-in failed.');
        return;
      }
      setPassword('');
      setSession({ authenticated: true, auth_required: true, provider: (json as SessionState).provider });
    } catch {
      setAuthMessage('Sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function onLogout() {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await fetch('/api/research-agent/session', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      setSession({ authenticated: false, auth_required: true });
      setBody(null);
      setHttpStatus(null);
    } finally {
      setAuthBusy(false);
    }
  }

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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json() as Record<string, unknown>;
      setHttpStatus(response.status);
      setBody(json);
      if (response.status === 401) {
        setSession((current) => ({ authenticated: false, auth_required: true, provider: current?.provider }));
      }
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
      <p style={{ fontSize: 12, color: signedIn ? '#3d654c' : '#8a5b3d' }}>
        {authBusy ? 'Checking access…' : signedIn ? 'Signed in to the synthetic demo.' : 'Authentication required.'}
      </p>
      {signedIn && (
        <p style={{ fontSize: 11, color: '#7a8981' }}>
          <button type="button" onClick={onLogout} disabled={authBusy} style={{ border: 0, background: 'none', color: '#285a4e', cursor: 'pointer', padding: 0 }}>
            Sign out
          </button>
        </p>
      )}
      {!signedIn && (
        <form onSubmit={onLogin} style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#7b897b', margin: '8px 0' }} htmlFor="demo-password">
            Demo password
          </label>
          <input
            id="demo-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ width: '100%', padding: 11, border: '1px solid #dfe6d9', borderRadius: 6, background: '#fafbf8' }}
          />
          <button
            type="submit"
            disabled={authBusy || password.length === 0}
            style={{
              marginTop: 12,
              padding: '10px 14px',
              border: 0,
              borderRadius: 8,
              background: '#285a4e',
              color: 'white',
              cursor: authBusy ? 'wait' : 'pointer',
            }}
          >
            {authBusy ? 'Signing in…' : 'Sign in'}
          </button>
          {authMessage && <p style={{ fontSize: 12, color: '#a45645' }}>{authMessage}</p>}
        </form>
      )}
      {signedIn && (
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
            {UI_SESSIONS.map((item) => (
              <option key={item.session_ref} value={item.session_ref}>
                {item.label} — {item.note}
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
      )}
      <div aria-live="polite" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #edf0e9' }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>{view.title}</h3>
        <p style={{ fontSize: 12, color: view.kind === 'error' || view.kind === 'unauthenticated' ? '#a45645' : '#62756c' }}>{view.detail}</p>
        {view.kind === 'success' && Array.isArray(view.claims) && view.claims.map((claim: { text: string; metric_id: string; value: number; unit: string }) => (
          <div key={`${claim.metric_id}-${claim.value}`}>
            <p style={{ fontSize: 18, color: '#3d654c', margin: '12px 0 4px' }}>
              {claim.metric_id}: <strong>{claim.value}</strong> {claim.unit}
            </p>
            {claim.text && <p style={{ fontSize: 12, color: '#62756c', margin: 0 }}>{claim.text}</p>}
          </div>
        ))}
        {Array.isArray(view.artifact_refs) && view.artifact_refs.length > 0 && (
          <p style={{ fontSize: 12 }}>Evidence artifacts: {view.artifact_refs.join(', ')}</p>
        )}
        {view.reason_code && <p style={{ fontSize: 12 }}>Abstention / reason: {view.reason_code}</p>}
        {view.provider && typeof view.provider === 'object' && (
          <p style={{ fontSize: 11, color: '#7a8981' }}>
            Provider: {String(view.provider.provider_id ?? view.provider.kind ?? '')}
            {view.provider.model ? ` / ${String(view.provider.model)}` : ''}
            {view.provider.live ? ' (live flag)' : ' (mock / not a live-model result)'}
          </p>
        )}
        {Array.isArray(view.limitations) && view.limitations.length > 0 && (
          <ul style={{ fontSize: 11, color: '#728067', paddingLeft: 18 }}>
            {view.limitations.map((line: string) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
