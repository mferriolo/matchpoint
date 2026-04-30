import { useEffect, useState } from 'react';
import { bridgeApi, mapWithConcurrency } from '../lib/bridge';
import { ENTITY_FIELDS, type DedupeStatus, type EntityType, type FieldChoice, type FieldDiff } from '../lib/types';

type PreviewResult = {
  status: DedupeStatus;
  crelate_id: string;
  crelate: any;
  mp: any | null;
  diff?: { conflicts: FieldDiff[]; mp_empty: string[]; crelate_empty: string[] };
};

type BulkRowResult = { crelate_id: string; name: string; ok: boolean; action?: string; msg?: string };
type BulkProgress = { done: number; total: number; results: BulkRowResult[]; running: boolean };

export default function PullTab({ entity }: { entity: EntityType }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCrId, setSelectedCrId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pulling, setPulling] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});
  // Bulk-mode state. Same shape as PushTab; defaults flipped to
  // "Crelate wins" since that's the user's intent when they're pulling.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkProgress | null>(null);

  useEffect(() => {
    setQuery(''); setResults([]); setSelectedCrId(null); setPreview(null);
    setOutcome(null); setChoices({}); setSelectedIds(new Set()); setBulk(null);
  }, [entity]);

  // On mount, check for a content-script handoff.
  useEffect(() => {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(['pending_pull_id', 'pending_pull_entity'], (items) => {
      if (items.pending_pull_id && items.pending_pull_entity === entity) {
        setSelectedCrId(items.pending_pull_id);
        chrome.storage.local.remove(['pending_pull_id', 'pending_pull_entity']);
      }
    });
  }, [entity]);

  // Tiny dispatch helpers per entity so we don't repeat the cascade.
  const searchFnFor  = (e: EntityType) => e === 'contact' ? bridgeApi.searchCrelateContacts
                                        : e === 'company' ? bridgeApi.searchCrelateCompanies
                                        : bridgeApi.searchCrelateJobs;
  const previewFnFor = (e: EntityType) => e === 'contact' ? bridgeApi.pullContactPreview
                                        : e === 'company' ? bridgeApi.pullCompanyPreview
                                        : bridgeApi.pullJobPreview;
  const pullFnFor    = (e: EntityType) => e === 'contact' ? bridgeApi.pullContact
                                        : e === 'company' ? bridgeApi.pullCompany
                                        : bridgeApi.pullJob;

  // Debounced Crelate search.
  useEffect(() => {
    if (selectedCrId) return;
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchFnFor(entity)(query.trim());
      if (r.success) {
        const items = entity === 'contact' ? r.contacts
                    : entity === 'company' ? r.companies
                    : r.jobs;
        setResults(items || []);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, entity, selectedCrId]);

  // Preview when single-record drilling in.
  useEffect(() => {
    if (!selectedCrId) { setPreview(null); setChoices({}); setOutcome(null); return; }
    previewFnFor(entity)(selectedCrId).then(r => {
      if (r.success) {
        setPreview({ status: r.status, crelate_id: r.crelate_id, crelate: r.crelate, mp: r.mp, diff: r.diff });
        const seed: Record<string, FieldChoice> = {};
        for (const c of r.diff?.conflicts || []) seed[c.field] = 'crelate';
        setChoices(seed);
      } else {
        setOutcome({ ok: false, msg: r.error || 'Preview failed' });
      }
    });
  }, [selectedCrId, entity]);

  const doPull = async () => {
    if (!selectedCrId) return;
    setPulling(true); setOutcome(null);
    const r = await pullFnFor(entity)(selectedCrId, choices);
    setPulling(false);
    if (r.success) {
      setOutcome({ ok: true, msg: `${r.action === 'create' ? 'Created in MatchPoint' : 'Updated MatchPoint'} (${r.mp_id?.slice(0, 8)}…)` });
      const after = await previewFnFor(entity)(selectedCrId);
      if (after.success) setPreview({ status: after.status, crelate_id: after.crelate_id, crelate: after.crelate, mp: after.mp, diff: after.diff });
    } else {
      setOutcome({ ok: false, msg: r.error || 'Pull failed' });
    }
  };

  const doBulkPull = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const fn = pullFnFor(entity);
    const nameOf = (row: any): string => entity === 'contact'
      ? ([row.first_name, row.last_name].filter(Boolean).join(' ') || '(unnamed)')
      : entity === 'company'
        ? (row.company_name || '(unnamed)')
        : (row.job_title ? `${row.job_title}${row.company_name ? ' · ' + row.company_name : ''}` : '(untitled)');
    setBulk({ done: 0, total: ids.length, results: [], running: true });

    await mapWithConcurrency(ids, 4, async (cid) => {
      const row = results.find(r => r.crelate_id === cid);
      const name = row ? nameOf(row) : cid.slice(0, 8);
      const r = await fn(cid);
      const result: BulkRowResult = {
        crelate_id: cid, name, ok: !!r.success, action: r.action,
        msg: r.error || r.message || '',
      };
      return result;
    }, (_item, result, _i, doneSoFar) => {
      setBulk(prev => prev ? { ...prev, done: doneSoFar, results: [...prev.results, result] } : null);
    });

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
      return new Set(results.map(r => r.crelate_id));
    });
  };

  const setChoice = (field: string, choice: FieldChoice) => setChoices(prev => ({ ...prev, [field]: choice }));

  if (bulk) {
    const okCount = bulk.results.filter(r => r.ok && r.action !== 'skip').length;
    const skipCount = bulk.results.filter(r => r.ok && r.action === 'skip').length;
    const errCount = bulk.results.filter(r => !r.ok).length;
    const pct = bulk.total > 0 ? Math.round((bulk.done / bulk.total) * 100) : 0;
    return (
      <>
        <div className="bulk-progress">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{bulk.running ? 'Pulling…' : 'Pulled'} {bulk.done}/{bulk.total}</strong>
            {!bulk.running && (
              <button className="btn btn-secondary" style={{ flex: 'none', padding: '4px 10px' }} onClick={() => setBulk(null)}>
                Done
              </button>
            )}
          </div>
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="results-summary">
            <span className="ok">{okCount} pulled</span>
            <span className="skip">{skipCount} skipped</span>
            <span className="err">{errCount} errors</span>
          </div>
        </div>
        <div className="list">
          {bulk.results.map((r, idx) => (
            <div key={`${r.crelate_id}-${idx}`} className="row" style={{ cursor: 'default' }}>
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
      {!selectedCrId && (
        <>
          <div className="search">
            <input
              autoFocus
              placeholder={entity === 'contact'
                ? 'Search Crelate contacts by name or email…'
                : entity === 'company'
                  ? 'Search Crelate companies by name…'
                  : 'Search Crelate jobs by title or company…'}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {selectedIds.size > 0 && (
            <div className="bulk-bar">
              <span>{selectedIds.size} selected (defaults: Crelate wins)</span>
              <div className="controls">
                <button className="ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
                <button onClick={doBulkPull}>Pull {selectedIds.size}</button>
              </div>
            </div>
          )}

          {searching && <div className="placeholder"><span className="spin">↻</span> searching Crelate…</div>}
          {!searching && query.length < 2 && <div className="placeholder">Type 2+ characters. Use checkboxes to pull multiple.</div>}
          {!searching && query.length >= 2 && results.length === 0 && <div className="placeholder">No matches in Crelate.</div>}

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
              <CrelateResultRow
                key={r.crelate_id}
                entity={entity}
                row={r}
                checked={selectedIds.has(r.crelate_id)}
                onToggle={() => toggleSelect(r.crelate_id)}
                onPick={() => setSelectedCrId(r.crelate_id)}
              />
            ))}
          </div>
        </>
      )}

      {selectedCrId && preview && (
        <>
          <button className="btn btn-secondary" style={{ marginBottom: 10, flex: 'none', padding: '4px 10px' }} onClick={() => setSelectedCrId(null)}>← Back to search</button>

          <div className="detail">
            {entity === 'contact' ? (
              <h2>{[preview.crelate.first_name, preview.crelate.last_name].filter(Boolean).join(' ') || '(unnamed)'}</h2>
            ) : entity === 'company' ? (
              <h2>{preview.crelate.company_name || '(unnamed)'}</h2>
            ) : (
              <h2>{preview.crelate.job_title || '(untitled)'}</h2>
            )}
            <div className="sub">
              From Crelate ({selectedCrId.slice(0, 8)}…)
              {preview.status === 'linked' && <span className="badge badge-linked">linked to MP</span>}
              {preview.status === 'conflict' && <span className="badge badge-conflict">conflict — needs resolution</span>}
              {preview.status === 'match' && <span className="badge badge-conflict">match found in MP</span>}
              {preview.status === 'none' && <span className="badge badge-new">new — will create in MP</span>}
            </div>
            {ENTITY_FIELDS[entity].slice(0, 5).map(f => (
              <FieldRow key={f.key} label={f.label} value={preview.crelate[f.key]} />
            ))}
          </div>

          {preview.diff && preview.diff.conflicts.length > 0 && (
            <div className="conflict">
              <h3>Conflicts ({preview.diff.conflicts.length}) — pick a winner per field</h3>
              {preview.diff.conflicts.map(c => {
                const choice = choices[c.field] || 'crelate';
                return (
                  <div key={c.field} className="conflict-row">
                    <div className="field-name">{(ENTITY_FIELDS[entity].find(f => f.key === c.field)?.label) || c.field.replace(/_/g, ' ')}</div>
                    <div className="choices">
                      <button className={`choice ${choice === 'mp' ? 'selected' : ''}`} onClick={() => setChoice(c.field, 'mp')}>
                        <span className="from">MatchPoint (keep)</span>
                        <span className="val">{c.mp_value}</span>
                      </button>
                      <button className={`choice ${choice === 'crelate' ? 'selected' : ''}`} onClick={() => setChoice(c.field, 'crelate')}>
                        <span className="from">Crelate (overwrite)</span>
                        <span className="val">{c.crelate_value}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {outcome && (
            <div className={`status ${outcome.ok ? 'status-ok' : 'status-err'}`} style={{ marginTop: 10 }}>{outcome.msg}</div>
          )}

          <div className="actions">
            <button className="btn btn-primary" onClick={doPull} disabled={pulling}>
              {pulling ? <><span className="spin">↻</span> pulling…</> :
                preview.mp ? `Update ${entity} in MatchPoint` : `Create ${entity} in MatchPoint`}
            </button>
          </div>
        </>
      )}

      {selectedCrId && !preview && <div className="placeholder"><span className="spin">↻</span> loading from Crelate…</div>}
    </>
  );
}

function CrelateResultRow({
  entity, row, checked, onToggle, onPick,
}: {
  entity: EntityType; row: any; checked: boolean; onToggle: () => void; onPick: () => void;
}) {
  return (
    <div className={`row ${checked ? 'selected' : ''}`}>
      <input type="checkbox" className="check" checked={checked} onChange={onToggle} aria-label="Select for bulk pull" />
      <button className="body" onClick={onPick}>
        {entity === 'contact' && (
          <>
            <div className="name">{[row.first_name, row.last_name].filter(Boolean).join(' ') || '(unnamed)'}</div>
            <div className="meta">
              {[row.title, row.company_name].filter(Boolean).join(' · ') || '—'}
              {row.email && <> · {row.email}</>}
            </div>
          </>
        )}
        {entity === 'company' && (
          <>
            <div className="name">{row.company_name || '(unnamed)'}</div>
            <div className="meta">{row.website || '—'}</div>
          </>
        )}
        {entity === 'job' && (
          <>
            <div className="name">{row.job_title || '(untitled)'}</div>
            <div className="meta">{row.company_name || '—'}</div>
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
