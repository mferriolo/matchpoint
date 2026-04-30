import { useEffect, useState } from 'react';
import { bridgeApi } from '../lib/bridge';
import type { ContactDiff, DedupeStatus, FieldChoice, MpContact } from '../lib/types';

type DedupeResult = {
  status: DedupeStatus;
  crelate_id?: string;
  crelate?: any;
  diff?: ContactDiff | null;
  mp: MpContact;
};

export default function PushTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MpContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MpContact | null>(null);
  const [dedupe, setDedupe] = useState<DedupeResult | null>(null);
  const [pushing, setPushing] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});

  // Debounced search — typing slowly enough that we don't hammer the
  // bridge function. 300ms is the standard Crelate-friendly window.
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await bridgeApi.searchContacts(query.trim());
      if (r.success) setResults(r.contacts || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // When the user picks a contact, run dedupe-check immediately so the
  // detail panel shows the linked / conflict / new badge without a
  // separate click.
  useEffect(() => {
    if (!selected) { setDedupe(null); setChoices({}); setOutcome(null); return; }
    bridgeApi.dedupeContact(selected.id).then(r => {
      if (r.success) {
        setDedupe({
          status: r.status,
          crelate_id: r.crelate_id,
          crelate: r.crelate,
          diff: r.diff,
          mp: r.mp,
        });
        // Pre-seed conflict choices to "newest" (here: MP wins by default
        // since the user explicitly opened it from MP — they can flip).
        const seed: Record<string, FieldChoice> = {};
        for (const c of r.diff?.conflicts || []) seed[c.field] = 'mp';
        setChoices(seed);
      }
    });
  }, [selected]);

  const doPush = async () => {
    if (!selected) return;
    setPushing(true);
    setOutcome(null);
    const r = await bridgeApi.pushContact(selected.id, choices);
    setPushing(false);
    if (r.success) {
      setOutcome({ ok: true, msg: `${r.action === 'create' ? 'Created' : r.action === 'update' ? 'Updated' : 'Linked'} in Crelate (${r.crelate_id?.slice(0, 8)}…)` });
      // Re-run dedupe so the badge flips to 'linked' and conflicts clear.
      const after = await bridgeApi.dedupeContact(selected.id);
      if (after.success) setDedupe({ status: after.status, crelate_id: after.crelate_id, crelate: after.crelate, diff: after.diff, mp: after.mp });
    } else {
      setOutcome({ ok: false, msg: r.error || 'Push failed' });
    }
  };

  const setChoice = (field: string, choice: FieldChoice) => setChoices(prev => ({ ...prev, [field]: choice }));

  return (
    <>
      <div className="search">
        <input
          autoFocus
          placeholder="Search MatchPoint by name, email, or company…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {!selected && (
        <>
          {searching && <div className="placeholder"><span className="spin">↻</span> searching…</div>}
          {!searching && query.length < 2 && <div className="placeholder">Type 2+ characters to search.</div>}
          {!searching && query.length >= 2 && results.length === 0 && <div className="placeholder">No matches.</div>}
          <div className="list">
            {results.map(c => {
              const linked = !!c.crelate_contact_id;
              return (
                <button key={c.id} className="row" onClick={() => setSelected(c)}>
                  <div className="name">
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)'}
                    {linked && <span className="badge badge-linked">linked</span>}
                  </div>
                  <div className="meta">
                    {[c.title, c.company_name].filter(Boolean).join(' · ') || '—'}
                    {c.email && <> · {c.email}</>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {selected && (
        <>
          <button className="btn btn-secondary" style={{ marginBottom: 10, flex: 'none', padding: '4px 10px' }} onClick={() => setSelected(null)}>← Back to search</button>

          <div className="detail">
            <h2>{[selected.first_name, selected.last_name].filter(Boolean).join(' ') || '(unnamed)'}</h2>
            <div className="sub">
              {[selected.title, selected.company_name].filter(Boolean).join(' · ') || '—'}
              {dedupe?.status === 'linked' && <span className="badge badge-linked">linked to Crelate</span>}
              {dedupe?.status === 'conflict' && <span className="badge badge-conflict">conflict — needs resolution</span>}
              {dedupe?.status === 'match' && <span className="badge badge-conflict">match found in Crelate</span>}
              {dedupe?.status === 'none' && <span className="badge badge-new">new — will create</span>}
            </div>
            <FieldRow label="Email" value={selected.email} />
            <FieldRow label="Phone" value={selected.phone_work || selected.phone_cell || selected.phone_home} />
            <FieldRow label="LinkedIn" value={selected.linkedin_url} />
            <FieldRow label="Notes" value={selected.notes ? `${selected.notes.slice(0, 80)}${selected.notes.length > 80 ? '…' : ''}` : null} />
          </div>

          {dedupe?.diff && dedupe.diff.conflicts.length > 0 && (
            <div className="conflict">
              <h3>Conflicts ({dedupe.diff.conflicts.length}) — pick a winner per field</h3>
              {dedupe.diff.conflicts.map(c => {
                const choice = choices[c.field] || 'mp';
                return (
                  <div key={c.field} className="conflict-row">
                    <div className="field-name">{c.field.replace(/_/g, ' ')}</div>
                    <div className="choices">
                      <button
                        className={`choice ${choice === 'mp' ? 'selected' : ''}`}
                        onClick={() => setChoice(c.field, 'mp')}
                      >
                        <span className="from">MatchPoint</span>
                        <span className="val">{c.mp_value}</span>
                      </button>
                      <button
                        className={`choice ${choice === 'crelate' ? 'selected' : ''}`}
                        onClick={() => setChoice(c.field, 'crelate')}
                      >
                        <span className="from">Crelate</span>
                        <span className="val">{c.crelate_value}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {outcome && (
            <div className={`status ${outcome.ok ? 'status-ok' : 'status-err'}`} style={{ marginTop: 10 }}>
              {outcome.msg}
            </div>
          )}

          <div className="actions">
            <button className="btn btn-primary" onClick={doPush} disabled={pushing}>
              {pushing ? <><span className="spin">↻</span> pushing…</> :
                dedupe?.status === 'linked' || dedupe?.status === 'match' || dedupe?.status === 'conflict'
                  ? 'Update in Crelate' : 'Create in Crelate'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="field-row">
      <span className="label">{label}</span>
      <span className={`value ${value ? '' : 'empty'}`}>{value || '—'}</span>
    </div>
  );
}
