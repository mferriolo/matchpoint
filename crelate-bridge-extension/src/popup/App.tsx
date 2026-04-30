import { useEffect, useState } from 'react';
import PushTab from './PushTab';
import PullTab from './PullTab';
import HistoryTab from './HistoryTab';
import EntityPicker from './EntityPicker';
import { bridgeApi } from '../lib/bridge';
import type { EntityType } from '../lib/types';

type Tab = 'push' | 'pull' | 'history';

export default function App() {
  const [tab, setTab] = useState<Tab>('push');
  const [entity, setEntity] = useState<EntityType>('contact');
  const [healthy, setHealthy] = useState<boolean | null>(null);

  // Smoke-test the bridge on mount so a misconfigured deploy is surfaced
  // before the user spends time searching for a contact.
  useEffect(() => {
    bridgeApi.ping().then(r => setHealthy(!!r.success && !!r.has_crelate_key));
  }, []);

  // If the Crelate content script wrote a pending pull request, jump
  // straight to the Pull tab and the right entity. The PullTab itself
  // consumes the storage key on its mount.
  useEffect(() => {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(['pending_pull_id', 'pending_pull_entity'], (items) => {
      if (items.pending_pull_id) {
        setTab('pull');
        if (items.pending_pull_entity) setEntity(items.pending_pull_entity as EntityType);
      }
    });
  }, []);

  return (
    <div className="shell">
      <header>
        <h1>Crelate ⇄ MatchPoint Bridge</h1>
        <span className="ver">v0.2</span>
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
        {tab !== 'history' && <EntityPicker value={entity} onChange={setEntity} />}
        {tab === 'push' && <PushTab entity={entity} />}
        {tab === 'pull' && <PullTab entity={entity} />}
        {tab === 'history' && <HistoryTab />}
      </main>
      <footer>Crelate-Bridge · server-side API key · path C (always-ask)</footer>
    </div>
  );
}
