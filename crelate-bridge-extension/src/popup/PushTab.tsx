import { useEffect, useState } from 'react';
import { bridgeApi } from '../lib/bridge';
import { ENTITY_FIELDS, type DedupeStatus, type EntityType, type FieldChoice, type FieldDiff } from '../lib/types';

type DedupeResult = {
  status: DedupeStatus;
  crelate_id?: string;
  crelate?: any;
  diff?: { conflicts: FieldDiff[]; mp_empty: string[]; crelate_empty: string[] } | null;
  mp: any;
};

export default function PushTab({ entity }: { entity: EntityType }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [dedupe, setDedupe] = useState<DedupeResult | null>(null);
  const [pushing, setPushing] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});

  // Reset everything when the user flips entity type.
  useEffect(() => {
    setQuery(''); setResults([]); setSelected(null); setDedupe(null); setOutcome(null); setChoices({});
  }, [entity]);

  // Debounced search against MatchPoint.
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = entity === 'contact'
        ? await bridgeApi.searchMpContacts(query.trim())
        : await bridgeApi.searchMpCompanies(query.trim());
      if (r.success) setResults(entity === 'contact' ? (r.contacts || []) : (r.companies || []));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, entity]);

  // Run dedupe check on selection.
  useEffect(() => {
    if (!selected) { setDedupe(null); setChoices({}); setOutcome(null); return; }
    const fn = entity === 'contact' ? bridgeApi.dedupeContact : bridgeApi.dedupeCompany;
    fn(selected.id).then(r => {
      if (r.success) {
        setDedupe({ status: r.status, crelate_id: r.crelate_id, crelate: r.crelate, diff: r.diff, mp: r.mp });
        const seed: Record<string, FieldChoice> = {};
        for (const c of r.diff?.conflicts || []) seed[c.field] = 'mp';
        setChoices(seed);
      }
    });
  }, [selected, entity]);

  const doPush = async () => {
    if (!selected) return;
    setPushing(true);
    setOutcome(null);
    const fn = entity === 'contact' ? bridgeApi.pushContact : bridgeApi.pushCompany;
    const r = await fn(selected.id, choices);
    setPushing(false);
    if (r.success) {
      setOutcome({ ok: true, msg: `${r.action === 'create' ? 'Created' : r.action === 'update' ? 'Updated' : 'Linked'} in Crelate (${r.crelate_id?.slice(0, 8)}…)` });
      const dedupeFn = entity === 'contact' ? bridgeApi.dedupeContact : bridgeApi.dedupeCompany;
      const after = await dedupeFn(selected.id);
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
          placeholder={entity === 'contact'
            ? 'Search MatchPoint contacts by name, email, or company…'
            : 'Search MatchPoint companies by name…'}
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
            {results.map(r => (
              <ResultRow key={r.id} entity={entity} row={r} onPick={() => setSelected(r)} />
            ))}
          </div>
        </>
      )}

      {selected && (
        <>
          <button className="btn btn-secondary" style={{ marginBottom: 10, flex: 'none', padding: '4px 10px' }} onClick={() => setSelected(null)}>← Back to search</button>

          <div className="detail">
            {entity === 'contact' ? (
              <h2>{[selected.first_name, selected.last_name].filter(Boolean).join(' ') || '(unnamed)'}</h2>
            ) : (
              <h2>{selected.company_name || '(unnamed)'}</h2>
            )}
            <div className="sub">
              {entity === 'contact'
                ? ([selected.title, selected.company_name].filter(Boolean).join(' · ') || '—')
                : ([selected.website, selected.location].filter(Boolean).join(' · ') || '—')}
              {dedupe?.status === 'linked' && <span className="badge badge-linked">linked to Crelate</span>}
              {dedupe?.status === 'conflict' && <span className="badge badge-conflict">conflict — needs resolution</span>}
              {dedupe?.status === 'match' && <span className="badge badge-conflict">match found in Crelate</span>}
              {dedupe?.status === 'none' && <span className="badge badge-new">new — will create</span>}
            </div>
            {ENTITY_FIELDS[entity].slice(0, 5).map(f => (
              <FieldRow key={f.key} label={f.label} value={selected[f.key]} />
            ))}
          </div>

          {dedupe?.diff && dedupe.diff.conflicts.length > 0 && (
            <div className="conflict">
              <h3>Conflicts ({dedupe.diff.conflicts.length}) — pick a winner per field</h3>
              {dedupe.diff.conflicts.map(c => {
                const choice = choices[c.field] || 'mp';
                return (
                  <div key={c.field} className="conflict-row">
                    <div className="field-name">{(ENTITY_FIELDS[entity].find(f => f.key === c.field)?.label) || c.field.replace(/_/g, ' ')}</div>
                    <div className="choices">
                      <button className={`choice ${choice === 'mp' ? 'selected' : ''}`} onClick={() => setChoice(c.field, 'mp')}>
                        <span className="from">MatchPoint</span>
                        <span className="val">{c.mp_value}</span>
                      </button>
                      <button className={`choice ${choice === 'crelate' ? 'selected' : ''}`} onClick={() => setChoice(c.field, 'crelate')}>
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
                  ? `Update ${entity} in Crelate` : `Create ${entity} in Crelate`}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function ResultRow({ entity, row, onPick }: { entity: EntityType; row: any; onPick: () => void }) {
  const linked = !!row.crelate_id || !!row.crelate_contact_id;
  if (entity === 'contact') {
    return (
      <button className="row" onClick={onPick}>
        <div className="name">
          {[row.first_name, row.last_name].filter(Boolean).join(' ') || '(unnamed)'}
          {linked && <span className="badge badge-linked">linked</span>}
        </div>
        <div className="meta">
          {[row.title, row.company_name].filter(Boolean).join(' · ') || '—'}
          {row.email && <> · {row.email}</>}
        </div>
      </button>
    );
  }
  return (
    <button className="row" onClick={onPick}>
      <div className="name">
        {row.company_name || '(unnamed)'}
        {linked && <span className="badge badge-linked">linked</span>}
      </div>
      <div className="meta">{[row.website, row.location].filter(Boolean).join(' · ') || '—'}</div>
    </button>
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
