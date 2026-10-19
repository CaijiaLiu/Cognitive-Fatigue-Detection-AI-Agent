import Link from 'next/link';
import ResearchAgentPanel from './panel';

export const dynamic = 'force-dynamic';

export default function ResearchAgentPage() {
  return (
    <main style={{ maxWidth: 880, margin: '40px auto', padding: 24, fontFamily: 'system-ui', color: '#23443b' }}>
      <p style={{ fontSize: 11, letterSpacing: 1.4, color: '#7a8981' }}>FOCUS LAB · SYNTHETIC DEMO</p>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.6px' }}>Research Agent</h1>
      <p>
        This panel calls <code>POST /api/research-agent</code>, which invokes the W2.1 runtime over
        fixture sessions and a mock provider. It is not a medical tool and does not score fatigue.
      </p>
      <ResearchAgentPanel />
      <p style={{ marginTop: 28, fontSize: 12, color: '#62756c' }}>
        <Link href="/collection/index.html">Back to collection</Link>
        {' · '}
        <Link href="/research">Researcher dashboard</Link>
      </p>
    </main>
  );
}
