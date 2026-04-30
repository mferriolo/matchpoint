import { useEffect, useState } from 'react';
import { bridgeApi } from '../lib/bridge';

export default function HistoryTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bridgeApi.history({ limit: 100 }).then(r => {
      if (r.success) setEntries(r.entries || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="placeholder"><span className="spin">↻</span> loading…</div>;
  if (entries.length === 0) return <div className="placeholder">No sync activity yet.</div>;

  return (
    <div className="list">
      {entries.map(e => (
        <div key={e.id} className="row" style={{ cursor: 'default' }}>
          <div className="name" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{e.entity_type} · {e.action}</span>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(e.created_at).toLocaleString()}</span>
          </div>
          <div className="meta">
            {e.direction} · mp:{e.mp_id?.slice(0, 8) || '—'} · cr:{e.crelate_id?.slice(0, 8) || '—'}
            {e.error_message && <span style={{ color: '#dc2626' }}> · {e.error_message}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
