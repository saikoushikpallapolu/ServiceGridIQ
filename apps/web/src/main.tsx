import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { healthSchema, type Health } from '@servicegrid/contracts';
import './styles.css';

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    setLoading(true); setError('');
    fetch('/health/ready', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const result = healthSchema.parse(await response.json());
        if (response.status !== 200 && response.status !== 503) throw new Error('Unexpected service response');
        if (active) setHealth(result);
      })
      .catch(() => { if (!active) return; if (!controller.signal.aborted) setError('Could not reach the service. Check the API and try again.'); else setError('The connection timed out. Try again.'); setHealth(null); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  return <div className="shell">
    <aside><a className="brand" href="/" aria-label="ServiceGrid IQ home"><span className="brand-icon">S</span><span>ServiceGrid <b>IQ</b></span></a><span className="workspace-label">PROJECT WORKSPACE</span><div className="nav-active"><span aria-hidden="true">◈</span> Overview</div><p className="aside-note">Prepare the visit.<br />Make every dispatch count.</p><div className="phase-tag">Phase 01 · Foundation</div></aside>
    <main><header><span>Workspace / Overview</span><span className="environment">Development foundation</span></header>
      <section className="intro"><p className="eyebrow">SERVICE OPERATIONS, PREPARED</p><h1>A better visit starts<br />before the dispatch.</h1><p className="lede">Your ServiceGrid IQ workspace is taking shape. This first release connects the application to its operational foundation.</p></section>
      <section className="status-panel" aria-labelledby="connection-title"><div className="panel-heading"><div><p className="eyebrow">LIVE CONNECTION</p><h2 id="connection-title">System readiness</h2></div><button onClick={() => setAttempt((n) => n + 1)} disabled={loading}>{loading ? 'Checking…' : 'Check again'}</button></div>
        <div aria-live="polite" aria-busy={loading}>{loading ? <p className="feedback">Checking the API and database…</p> : error ? <p className="feedback failure" role="alert">{error}</p> : <><div className="status-row"><span>Application API</span><strong className="healthy">● Connected</strong></div><div className="status-row"><span>PostgreSQL database</span><strong className={health?.checks.database === 'up' ? 'healthy' : 'failure'}>● {health?.checks.database === 'up' ? 'Connected' : 'Unavailable'}</strong></div><p className="last-check">Checked {health ? new Date(health.timestamp).toLocaleTimeString() : '—'} · API v{health?.version}</p></>}</div>
      </section>
      <section className="next-section"><div><p className="eyebrow">WHAT COMES NEXT</p><h2>From foundation to fieldwork.</h2></div><div className="roadmap"><article><span>02</span><h3>Company access</h3><p>Secure sign-in and separate company workspaces.</p><small>Planned</small></article><article><span>03</span><h3>Service intake</h3><p>Customers, equipment and a clear record of each job.</p><small>Planned</small></article><article><span>04–05</span><h3>Prepared dispatch</h3><p>Eligibility, readiness checks and approved assignments.</p><small>Planned</small></article></div></section>
      <footer>ServiceGrid IQ <span>Foundation only. No live customer data or dispatch functionality.</span></footer>
    </main></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
