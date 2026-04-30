import { useEffect, useState } from 'react';
import PushTab from './PushTab';
import HistoryTab from './HistoryTab';
import { bridgeApi } from '../lib/bridge';

type Tab = 'push' | 'pull' | 'history';

export default function App() {
  const [tab, setTab] = useState<Tab>('push');
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    // Smoke-test the bridge on mount so a misconfigured deploy is
    // surfaced before the user spends time searching for a contact.
    bridgeApi.ping().then(r => setHealthy(!!r.success && !!r.has_crelate_key));
  }, []);

  return (
    <div className="shell">
      <header>
        <h1>Crelate ⇄ MatchPoint Bridge</h1>
        <span className="ver">v0.1</span>
      </header>
      <nav className="tabs">
        <button className={tab === 'push' ? 'active' : ''} onClick={() => setTab('push')}>Push to Crelate</button>
        <button className={tab === 'pull' ? 'active' : ''} onClick={() => setTab('pull')}>Pull from Crelate</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
      </nav>
      <main>
        {healthy === false && (
          <div className="status status-err">
            Bridge unhealthy — verify <code>extension-bridge</code> is deployed and <code>CRELATE_API_KEY</code> is set in Supabase.
          </div>
        )}
        {tab === 'push' && <PushTab />}
        {tab === 'pull' && <div className="placeholder">Pull from Crelate — Day 2.<br />Use the Crelate page itself; the content script there will inject a "Push to MatchPoint" button.</div>}
        {tab === 'history' && <HistoryTab />}
      </main>
      <footer>Crelate-Bridge · server-side API key · path C (always-ask)</footer>
    </div>
  );
}
