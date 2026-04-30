import { useEffect, useState } from 'react';
import { bridgeApi, getVisibleMpIds } from '../lib/bridge';
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
  // "From page" state: when populated, results came from scraping the
  // active MP tab rather than a search. The badge tells the user the
  // source and a count of how many of those rows are unlinked.
  const [fromPage, setFromPage] = useState<{ count: number; unlinked: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  // Reset when entity flips.
  useEffect(() => {
    setQuery(''); setResults([]); setSelected(null); setDedupe(null);
    setOutcome(null); setChoices({}); setSelectedIds(new Set()); setBulk(null);
    setFromPage(null); setReadError(null);
  }, [entity]);

  // ── Read visible IDs from the active MatchPoint tab ──────────────
  // The content script scrapes data-mp-{entity}-id off rendered <tr>
  // rows, we fetch the full records via the bridge, mark each as
  // linked / new based on crelate_links, and seed the multi-select set
  // with the unlinked rows so the user can immediately Push New.
  const readFromPage = async () => {
    setReading(true);
    setReadError(null);
    try {
      const visible = await getVisibleMpIds(entity);
      if (!visible) {
        setReadError('Could not access the active tab. Reload the extension after the latest build.');
        return;
      }
      if (visible.ids.length === 0) {
        const shortUrl = visible.url.length > 60 ? visible.url.slice(0, 60) + '…' : visible.url;
        if (!visible.matched) {
          // Active tab isn't a /marketing page at all.
          setReadError(`Active tab (${shortUrl}) isn't a /marketing page. Click on the MatchPoint tab in your browser, then come back and click this button again.`);
        } else {
          // We're on /marketing but didn't find data-mp-${entity}-id rows.
          // Two likely causes: wrong sub-tab, or the latest MP deploy
          // (with the data-attrs) hasn't reached this browser yet.
          setReadError(`No ${entity}s found on this page. Switch to the ${entity === 'contact' ? 'Contacts' : 'Companies'} sub-tab in MatchPoint and reload it. (URL: ${shortUrl})`);
        }
        return;
      }
      const r = await bridgeApi.getMpRecordsByIds(entity, visible.ids);
      if (!r.success) {
        setReadError(r.error || 'Failed to load records');
        return;
      }
      const recs: any[] = r.records || [];
      // Tag each row with its linked status for the result row to render.
      const enriched = recs.map(rec => ({
        ...rec,
        // PushTab's existing ResultRow checks crelate_id / crelate_contact_id;
        // mirror linked_crelate_id into the field that matches the entity.
        ...(entity === 'contact'
          ? { crelate_contact_id: rec.linked_crelate_id }
          : { crelate_id: rec.linked_crelate_id }),
      }));
      setResults(enriched);
      setQuery('');
      // Pre-select only the unlinked rows — the most useful default.
      const unlinked = enriched.filter(r => !r.linked_crelate_id);
      setSelectedIds(new Set(unlinked.map(r => r.id)));
      setFromPage({ count: enriched.length, unlinked: unlinked.length });
    } catch (e) {
      setReadError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

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
    const okCount       = bulk.results.filter(r => r.ok && r.action !== 'skip' && r.action !== 'conflict').length;
    const skipCount     = bulk.results.filter(r => r.ok && r.action === 'skip').length;
    const conflictCount = bulk.results.filter(r => r.ok && r.action === 'conflict').length;
    const errCount      = bulk.results.filter(r => !r.ok).length;
    const pct = bulk.total > 0 ? Math.round((bulk.done / bulk.total) * 100) : 0;
    // "Resolve" jumps back to the search list and opens the single-record
    // detail panel for that contact. The dedupe-check there will see the
    // freshly-linked crelate_contact_id and surface the diff.
    const resolveOne = (mp_id: string) => {
      const row = results.find(r => r.id === mp_id);
      if (row) setSelected(row);
      setBulk(null);
    };
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
            <span className="skip">{skipCount} skipped</span>
            {conflictCount > 0 && <span className="conflict-count">{conflictCount} need merge</span>}
            <span className="err">{errCount} errors</span>
          </div>
          {conflictCount > 0 && (
            <p style={{ marginTop: 8, fontSize: 11, color: '#92400e' }}>
              Crelate flagged {conflictCount} as duplicates with field-level differences. Click <strong>Resolve</strong> on each to pick which side wins per field.
            </p>
          )}
        </div>
        <div className="list">
          {bulk.results.map((r, idx) => (
            <div key={`${r.id}-${idx}`} className="row" style={{ cursor: 'default' }}>
              <div className="body" style={{ cursor: 'default' }}>
                <div className="name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span>{r.name}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {r.ok && r.action === 'conflict' && (
                      <button
                        className="btn btn-primary"
                        style={{ flex: 'none', padding: '3px 10px', fontSize: 11 }}
                        onClick={() => resolveOne(r.id)}
                      >
                        Resolve
                      </button>
                    )}
                    {r.ok && r.action === 'conflict' && <span className="badge badge-conflict">needs merge</span>}
                    {r.ok && r.action === 'skip'     && <span className="badge badge-conflict">{r.action}</span>}
                    {r.ok && r.action !== 'skip' && r.action !== 'conflict' && <span className="badge badge-linked">{r.action}</span>}
                    {!r.ok && <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>error</span>}
                  </span>
                </div>
                {r.msg && (r.action === 'conflict' || !r.ok) && (
                  <div className="meta" style={{ color: r.ok ? '#92400e' : '#991b1b' }}>{r.msg}</div>
                )}
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
          placeholder={entity === 'contact'
            ? 'Search MatchPoint contacts by name, email, or company…'
            : 'Search MatchPoint companies by name…'}
          value={query}
          onChange={e => { setQuery(e.target.value); if (fromPage) setFromPage(null); }}
        />
      </div>

      {/* "Read visible from MatchPoint page" — scrapes the open
          /marketing tab so the user can push the currently-filtered set
          rather than re-typing a search. The bar shows how many were
          read and how many are new vs already linked. */}
      <div className="from-page-bar">
        <button
          className="btn btn-secondary"
          style={{ flex: 'none', padding: '5px 10px', fontSize: 11 }}
          onClick={readFromPage}
          disabled={reading}
        >
          {reading ? <><span className="spin">↻</span> reading…</> : `📄 Read ${entity === 'contact' ? 'Contacts' : 'Companies'} from MatchPoint page`}
        </button>
        {fromPage && (
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {fromPage.count} on page · <strong style={{ color: '#1e3a8a' }}>{fromPage.unlinked} new</strong>
            {fromPage.unlinked < fromPage.count && <> · {fromPage.count - fromPage.unlinked} already linked</>}
          </span>
        )}
      </div>
      {readError && <div className="status status-err" style={{ marginBottom: 8 }}>{readError}</div>}

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
          {!searching && !fromPage && query.length < 2 && <div className="placeholder">Type 2+ characters or click "Read from MatchPoint page" to use the visible filtered list.</div>}
          {!searching && !fromPage && query.length >= 2 && results.length === 0 && <div className="placeholder">No matches.</div>}
          {!searching && fromPage && results.length === 0 && <div className="placeholder">No {entity}s on the page.</div>}
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
