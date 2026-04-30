import { useEffect, useState } from 'react';
import { bridgeApi } from '../lib/bridge';
import { ENTITY_FIELDS, type DedupeStatus, type EntityType, type FieldChoice, type FieldDiff } from '../lib/types';

type PreviewResult = {
  status: DedupeStatus;
  crelate_id: string;
  crelate: any;
  mp: any | null;
  diff?: { conflicts: FieldDiff[]; mp_empty: string[]; crelate_empty: string[] };
};

export default function PullTab({ entity }: { entity: EntityType }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCrId, setSelectedCrId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pulling, setPulling] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; msg: string } | null>(null);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});

  // Reset on entity change.
  useEffect(() => {
    setQuery(''); setResults([]); setSelectedCrId(null); setPreview(null); setOutcome(null); setChoices({});
  }, [entity]);

  // On mount, check if a content script left us a crelate_id to load.
  // The crelate.com page button writes to chrome.storage.local; we
  // consume + clear so it doesn't keep re-firing.
  useEffect(() => {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(['pending_pull_id', 'pending_pull_entity'], (items) => {
      if (items.pending_pull_id && items.pending_pull_entity === entity) {
        setSelectedCrId(items.pending_pull_id);
        chrome.storage.local.remove(['pending_pull_id', 'pending_pull_entity']);
      }
    });
  }, [entity]);

  // Debounced search against Crelate.
  useEffect(() => {
    if (selectedCrId) return; // already showing a record
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = entity === 'contact'
        ? await bridgeApi.searchCrelateContacts(query.trim())
        : await bridgeApi.searchCrelateCompanies(query.trim());
      if (r.success) setResults(entity === 'contact' ? (r.contacts || []) : (r.companies || []));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, entity, selectedCrId]);

  // When the user picks a Crelate row, fetch preview + dedupe vs MP.
  useEffect(() => {
    if (!selectedCrId) { setPreview(null); setChoices({}); setOutcome(null); return; }
    const fn = entity === 'contact' ? bridgeApi.pullContactPreview : bridgeApi.pullCompanyPreview;
    fn(selectedCrId).then(r => {
      if (r.success) {
        setPreview({ status: r.status, crelate_id: r.crelate_id, crelate: r.crelate, mp: r.mp, diff: r.diff });
        const seed: Record<string, FieldChoice> = {};
        // Pull defaults to "crelate wins" since the user explicitly opened
        // it from the Crelate side.
        for (const c of r.diff?.conflicts || []) seed[c.field] = 'crelate';
        setChoices(seed);
      } else {
        setOutcome({ ok: false, msg: r.error || 'Preview failed' });
      }
    });
  }, [selectedCrId, entity]);

  const doPull = async () => {
    if (!selectedCrId) return;
    setPulling(true);
    setOutcome(null);
    const fn = entity === 'contact' ? bridgeApi.pullContact : bridgeApi.pullCompany;
    const r = await fn(selectedCrId, choices);
    setPulling(false);
    if (r.success) {
      setOutcome({ ok: true, msg: `${r.action === 'create' ? 'Created in MatchPoint' : 'Updated MatchPoint'} (${r.mp_id?.slice(0, 8)}…)` });
      const previewFn = entity === 'contact' ? bridgeApi.pullContactPreview : bridgeApi.pullCompanyPreview;
      const after = await previewFn(selectedCrId);
      if (after.success) setPreview({ status: after.status, crelate_id: after.crelate_id, crelate: after.crelate, mp: after.mp, diff: after.diff });
    } else {
      setOutcome({ ok: false, msg: r.error || 'Pull failed' });
    }
  };

  const setChoice = (field: string, choice: FieldChoice) => setChoices(prev => ({ ...prev, [field]: choice }));

  return (
    <>
      {!selectedCrId && (
        <>
          <div className="search">
            <input
              autoFocus
              placeholder={entity === 'contact'
                ? 'Search Crelate contacts by name or email…'
                : 'Search Crelate companies by name…'}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {searching && <div className="placeholder"><span className="spin">↻</span> searching Crelate…</div>}
          {!searching && query.length < 2 && <div className="placeholder">Type 2+ characters. Or click "Pull to MatchPoint" on any Crelate page.</div>}
          {!searching && query.length >= 2 && results.length === 0 && <div className="placeholder">No matches in Crelate.</div>}
          <div className="list">
            {results.map(r => (
              <CrelateResultRow key={r.crelate_id} entity={entity} row={r} onPick={() => setSelectedCrId(r.crelate_id)} />
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
            ) : (
              <h2>{preview.crelate.company_name || '(unnamed)'}</h2>
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

function CrelateResultRow({ entity, row, onPick }: { entity: EntityType; row: any; onPick: () => void }) {
  if (entity === 'contact') {
    return (
      <button className="row" onClick={onPick}>
        <div className="name">{[row.first_name, row.last_name].filter(Boolean).join(' ') || '(unnamed)'}</div>
        <div className="meta">
          {[row.title, row.company_name].filter(Boolean).join(' · ') || '—'}
          {row.email && <> · {row.email}</>}
        </div>
      </button>
    );
  }
  return (
    <button className="row" onClick={onPick}>
      <div className="name">{row.company_name || '(unnamed)'}</div>
      <div className="meta">{row.website || '—'}</div>
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
