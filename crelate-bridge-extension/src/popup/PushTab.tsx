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

type BulkRowResult = { id: string; name: string; ok: boolean; action?: string; msg?: string };
type BulkProgress = { done: number; total: number; results: BulkRowResult[]; running: boolean };

export default function PushTab({ entity }: { entity: EntityType }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [dedupe, setDedupe] = useState<DedupeResult | null>(null);
  const [pushing, setPushing] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});
  // Bulk-mode state. selectedIds is the multi-select set; bulk progress
  // is the running outcome of a "Push N" operation. Defaulting to MP-wins
  // for any conflicts encountered during bulk (the user can flip individual
  // contacts to single-record mode later if they want the picker).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkProgress | null>(null);

  // Reset when entity flips.
  useEffect(() => {
    setQuery(''); setResults([]); setSelected(null); setDedupe(null);
    setOutcome(null); setChoices({}); setSelectedIds(new Set()); setBulk(null);
  }, [entity]);

  // Debounced search.
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

  // Run dedupe-check whenever a single-detail row is selected.
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

  // ── Single-record push (with field-level conflict resolution) ─────
  const doPush = async () => {
    if (!selected) return;
    setPushing(true); setOutcome(null);
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

  // ── Bulk push: loop the single-record action over every selected id.
  // No field_choices passed → defaults to MP-wins for any conflict (the
  // bridge's contract: omitted fields use MP values). Throttling is
  // built into the edge function (400ms between Crelate calls).
  const doBulkPush = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const fn = entity === 'contact' ? bridgeApi.pushContact : bridgeApi.pushCompany;
    setBulk({ done: 0, total: ids.length, results: [], running: true });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const row = results.find(r => r.id === id);
      const name = row
        ? (entity === 'contact'
            ? ([row.first_name, row.last_name].filter(Boolean).join(' ') || '(unnamed)')
            : (row.company_name || '(unnamed)'))
        : id.slice(0, 8);
      const r = await fn(id);
      const result: BulkRowResult = {
        id, name, ok: !!r.success, action: r.action,
        msg: r.error || r.message || '',
      };
      setBulk(prev => prev ? { ...prev, done: i + 1, results: [...prev.results, result] } : null);
    }
    setBulk(prev => prev ? { ...prev, running: false } : null);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === results.length) return new Set();
      return new Set(results.map(r => r.id));
    });
  };

  const setChoice = (field: string, choice: FieldChoice) => setChoices(prev => ({ ...prev, [field]: choice }));

  // ── Bulk progress / summary view ─────────────────────────────────
  if (bulk) {
    const okCount   = bulk.results.filter(r => r.ok && r.action !== 'skip').length;
    const skipCount = bulk.results.filter(r => r.ok && r.action === 'skip').length;
    const errCount  = bulk.results.filter(r => !r.ok).length;
    const pct = bulk.total > 0 ? Math.round((bulk.done / bulk.total) * 100) : 0;
    return (
      <>
        <div className="bulk-progress">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{bulk.running ? 'Pushing…' : 'Pushed'} {bulk.done}/{bulk.total}</strong>
            {!bulk.running && (
              <button className="btn btn-secondary" style={{ flex: 'none', padding: '4px 10px' }} onClick={() => { setBulk(null); }}>
                Done
              </button>
            )}
          </div>
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="results-summary">
            <span className="ok">{okCount} pushed</span>
            <span className="skip">{skipCount} skipped (already linked)</span>
            <span className="err">{errCount} errors</span>
          </div>
        </div>
        <div className="list">
          {bulk.results.map((r, idx) => (
            <div key={`${r.id}-${idx}`} className="row" style={{ cursor: 'default' }}>
              <div className="body" style={{ cursor: 'default' }}>
                <div className="name" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.name}</span>
                  {r.ok
                    ? <span className={`badge ${r.action === 'skip' ? 'badge-conflict' : 'badge-linked'}`}>{r.action}</span>
                    : <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>error</span>}
                </div>
                {r.msg && !r.ok && <div className="meta" style={{ color: '#991b1b' }}>{r.msg}</div>}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

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

      {!selected && selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span>{selectedIds.size} selected (defaults: MP wins on conflict)</span>
          <div className="controls">
            <button className="ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
            <button onClick={doBulkPush}>Push {selectedIds.size}</button>
          </div>
        </div>
      )}

      {!selected && (
        <>
          {searching && <div className="placeholder"><span className="spin">↻</span> searching…</div>}
          {!searching && query.length < 2 && <div className="placeholder">Type 2+ characters. Use checkboxes to push multiple.</div>}
          {!searching && query.length >= 2 && results.length === 0 && <div className="placeholder">No matches.</div>}
          {!searching && results.length > 0 && (
            <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
              <button
                onClick={toggleSelectAll}
                style={{ background: 'none', border: 'none', color: '#911406', cursor: 'pointer', padding: 0, fontSize: 11, fontFamily: 'inherit' }}
              >
                {selectedIds.size === results.length ? 'Clear all' : `Select all ${results.length}`}
              </button>
              <span>Click row name for single-record (with conflict picker)</span>
            </div>
          )}
          <div className="list">
            {results.map(r => (
              <ResultRow
                key={r.id}
                entity={entity}
                row={r}
                checked={selectedIds.has(r.id)}
                onToggle={() => toggleSelect(r.id)}
                onPick={() => setSelected(r)}
              />
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

function ResultRow({
  entity, row, checked, onToggle, onPick,
}: {
  entity: EntityType; row: any; checked: boolean; onToggle: () => void; onPick: () => void;
}) {
  const linked = !!row.crelate_id || !!row.crelate_contact_id;
  return (
    <div className={`row ${checked ? 'selected' : ''}`}>
      <input
        type="checkbox"
        className="check"
        checked={checked}
        onChange={onToggle}
        aria-label="Select for bulk push"
      />
      <button className="body" onClick={onPick}>
        {entity === 'contact' ? (
          <>
            <div className="name">
              {[row.first_name, row.last_name].filter(Boolean).join(' ') || '(unnamed)'}
              {linked && <span className="badge badge-linked">linked</span>}
            </div>
            <div className="meta">
              {[row.title, row.company_name].filter(Boolean).join(' · ') || '—'}
              {row.email && <> · {row.email}</>}
            </div>
          </>
        ) : (
          <>
            <div className="name">
              {row.company_name || '(unnamed)'}
              {linked && <span className="badge badge-linked">linked</span>}
            </div>
            <div className="meta">{[row.website, row.location].filter(Boolean).join(' · ') || '—'}</div>
          </>
        )}
      </button>
    </div>
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
