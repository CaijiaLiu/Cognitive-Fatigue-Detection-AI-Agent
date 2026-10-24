import Link from 'next/link';
import ResearchAgentPanel from './panel';
import PublicDataPanel from './public-data-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Focus Lab · Research Evidence' };

export default function ResearchAgentPage() {
  return (
    <main style={{ maxWidth: 880, margin: '40px auto', padding: 24, fontFamily: 'system-ui', color: '#23443b' }}>
      <p style={{ fontSize: 11, letterSpacing: 1.4, color: '#7a8981' }}>FOCUS LAB · RESEARCH EVIDENCE</p>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.6px' }}>Research Agent</h1>
      <p style={{ lineHeight: 1.7 }}>Inspect published source data and its limits. Public records and synthetic demo sessions are separate. Nothing here measures or diagnoses your fatigue.</p>
      <PublicDataPanel />
      <details style={{ marginTop: 32, padding: 20, border: '1px solid #d3ddcf', borderRadius: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Original synthetic Agent demo — mock data and mock answers</summary>
      <p>
        This authenticated panel asks the read-only Research Agent about <strong>synthetic fixture
        sessions</strong>. The server uses a mock provider, a server-side session allowlist, and
        validated <code>agent-answer/0.1</code> objects. It does not watch a camera, score fatigue,
        diagnose ADHD, or evaluate a real model.
      </p>
      <p style={{ fontSize: 13, color: '#5c7168', lineHeight: 1.7 }}>
        Answers cite fixture artifact refs only. If evidence is missing, protocols differ, or the
        question is medical, the agent abstains. Nothing on this page is a clinical result or a
        live-LLM quality claim.
      </p>
      <ResearchAgentPanel />
      </details>
      <p style={{ marginTop: 28, fontSize: 12, color: '#62756c' }}>
        <Link href="/collection/index.html">Back to collection</Link>
        {' · '}
        <Link href="/research">Researcher dashboard</Link>
      </p>
    </main>
  );
}
