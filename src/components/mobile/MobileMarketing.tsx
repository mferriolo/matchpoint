import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Users, Briefcase, Search, Star, Ban, RefreshCw, Phone, Mail, Linkedin, MapPin, ExternalLink, ChevronRight, X, Check, MessageSquare, Calendar as CalendarIcon, RotateCcw, CheckCircle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import MobileShell from './MobileShell';

type OutreachStatus = 'Cold' | 'Replied' | 'Booked' | 'Dead' | null;

type SubTab = 'jobs' | 'companies' | 'contacts';

const SUBTABS: { key: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'jobs',      label: 'Jobs',      icon: Briefcase },
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'contacts',  label: 'Contacts',  icon: Users },
];

/**
 * Mobile-optimized Marketing dashboard. Renders the same three core lists
 * as the desktop version — jobs, companies, contacts — as full-width
 * cards with on-tap detail panels. Power-user flows (multi-select merge,
 * column filters, CSV export, find-contacts run controls) intentionally
 * live on desktop only; we surface a hint when those would have been
 * accessible.
 *
 * Data is fetched directly here (same Promise.allSettled triple as the
 * desktop page) so we don't have to refactor the 3k-line desktop file
 * to take a `mobile` prop.
 */
const MobileMarketing: React.FC = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<SubTab>('jobs');
  const [jobs, setJobs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<{ kind: SubTab; row: any } | null>(null);
  // Mobile bulk-select for contacts. Long-press a card to enter select
  // mode; tap toggles after that. A sticky bottom bar shows quick actions.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSnoozed, setShowSnoozed] = useState(false);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Patch a single contact in-place. Used by per-card quick actions; the
  // bulk variant below batches across many ids.
  const patchContact = async (id: string, patch: Record<string, any>, successMsg?: string) => {
    try {
      const { error } = await supabase
        .from('marketing_contacts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setContacts(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
      if (successMsg) toast({ title: successMsg });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  const bulkPatch = async (ids: string[], patch: Record<string, any>, successMsg: string) => {
    if (ids.length === 0) return;
    try {
      // Single .in() with up to a few hundred ids is fine on mobile; the
      // desktop path chunks at 500 for the same URL-length safety. We
      // don't expect mobile selections that big.
      const { error } = await supabase
        .from('marketing_contacts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      setContacts(prev => prev.map(c => (ids.includes(c.id) ? { ...c, ...patch } : c)));
      toast({ title: successMsg });
      exitSelectMode();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  const markContactedBulk = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    // Stamp timestamp on all; default null statuses to Cold without
    // overwriting Booked/Replied/Dead.
    try {
      const { error } = await supabase
        .from('marketing_contacts')
        .update({ last_outreach_at: now, updated_at: now })
        .in('id', ids);
      if (error) throw error;
      const needsDefault = contacts.filter(c => ids.includes(c.id) && !c.outreach_status).map(c => c.id);
      if (needsDefault.length > 0) {
        const { error: e2 } = await supabase
          .from('marketing_contacts')
          .update({ outreach_status: 'Cold', updated_at: now })
          .in('id', needsDefault);
        if (e2) throw e2;
      }
      setContacts(prev => prev.map(c => ids.includes(c.id) ? { ...c, last_outreach_at: now, outreach_status: c.outreach_status || 'Cold' } : c));
      toast({ title: `Marked ${ids.length} contacted` });
      exitSelectMode();
    } catch (err: any) {
      toast({ title: 'Mark contacted failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  const setStatusBulk = (status: OutreachStatus) => {
    const ids = Array.from(selectedIds);
    if (status === null) {
      bulkPatch(ids, { outreach_status: null, last_outreach_at: null }, `Cleared status on ${ids.length}`);
    } else {
      bulkPatch(ids, { outreach_status: status, last_outreach_at: new Date().toISOString() }, `Set ${ids.length} to ${status}`);
    }
  };

  const snoozeBulk = (days: number | null) => {
    const ids = Array.from(selectedIds);
    if (days === null) {
      bulkPatch(ids, { snoozed_until: null }, `Unsnoozed ${ids.length}`);
    } else {
      const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      bulkPatch(ids, { snoozed_until: until }, `Snoozed ${ids.length} for ${days}d`);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        supabase.from('marketing_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('marketing_companies').select('*').order('open_roles_count', { ascending: false }),
        supabase.from('marketing_contacts').select('*').order('created_at', { ascending: false }),
      ]);
      if (results[0].status === 'fulfilled' && !results[0].value.error) setJobs(results[0].value.data || []);
      if (results[1].status === 'fulfilled' && !results[1].value.error) setCompanies(results[1].value.data || []);
      if (results[2].status === 'fulfilled' && !results[2].value.error) setContacts(results[2].value.data || []);
    } catch (err: any) {
      toast({ title: 'Load failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset search when switching tabs so a "Acme" search on Companies
  // doesn't carry over and hide everything on Jobs.
  useEffect(() => { setSearch(''); }, [tab]);

  const isOpen = (j: any) => j.is_active !== false && !j.archived && !j.is_blocked;

  const filteredJobs = useMemo(() => {
    const s = search.toLowerCase();
    return jobs
      .filter(j => isOpen(j))
      .filter(j => !s || `${j.job_title || ''} ${j.company_name || ''} ${j.city || ''} ${j.state || ''}`.toLowerCase().includes(s));
  }, [jobs, search]);

  const filteredCompanies = useMemo(() => {
    const s = search.toLowerCase();
    return companies
      .filter(c => !c.is_blocked)
      .filter(c => !s || `${c.company_name || ''} ${c.company_type || ''} ${c.city || ''} ${c.state || ''}`.toLowerCase().includes(s));
  }, [companies, search]);

  const filteredContacts = useMemo(() => {
    const s = search.toLowerCase();
    return contacts.filter(c => {
      if (s && !`${c.first_name || ''} ${c.last_name || ''} ${c.company_name || ''} ${c.title || ''} ${c.email || ''}`.toLowerCase().includes(s)) return false;
      if (!showSnoozed && c.snoozed_until) {
        const t = new Date(c.snoozed_until).getTime();
        if (Number.isFinite(t) && t > Date.now()) return false;
      }
      return true;
    });
  }, [contacts, search, showSnoozed]);

  const snoozedCount = useMemo(() => contacts.filter(c => {
    if (!c.snoozed_until) return false;
    const t = new Date(c.snoozed_until).getTime();
    return Number.isFinite(t) && t > Date.now();
  }).length, [contacts]);

  const counts = { jobs: filteredJobs.length, companies: filteredCompanies.length, contacts: filteredContacts.length };

  return (
    <MobileShell
      title="Marketing"
      topRight={
        <button onClick={loadData} className="p-2 rounded hover:bg-white/10 active:bg-white/20" aria-label="Refresh">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      {/* Sub-tabs */}
      <div className="grid grid-cols-3 bg-white border-b border-gray-200 sticky top-0 z-10">
        {SUBTABS.map(st => {
          const Icon = st.icon;
          const isActive = tab === st.key;
          return (
            <button
              key={st.key}
              onClick={() => setTab(st.key)}
              className={`flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors ${
                isActive ? 'border-[#911406] text-[#911406]' : 'border-transparent text-gray-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              {st.label} ({counts[st.key]})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="p-3 bg-white border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="pl-9 h-10 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="px-3 py-3 space-y-2">
        {loading && <div className="text-center py-10 text-sm text-gray-500">Loading…</div>}
        {!loading && tab === 'jobs' && filteredJobs.map(j => (
          <JobCard key={j.id} job={j} onTap={() => setDetail({ kind: 'jobs', row: j })} />
        ))}
        {!loading && tab === 'companies' && filteredCompanies.map(c => (
          <CompanyCard key={c.id} co={c} onTap={() => setDetail({ kind: 'companies', row: c })} />
        ))}
        {!loading && tab === 'contacts' && filteredContacts.map(c => (
          <ContactCard
            key={c.id}
            ct={c}
            selectMode={selectMode}
            isSelected={selectedIds.has(c.id)}
            onTap={() => {
              if (selectMode) toggleSelect(c.id);
              else setDetail({ kind: 'contacts', row: c });
            }}
            onLongPress={() => {
              if (!selectMode) setSelectMode(true);
              toggleSelect(c.id);
            }}
            onMarkContacted={() => {
              const now = new Date().toISOString();
              patchContact(c.id, { last_outreach_at: now, outreach_status: c.outreach_status || 'Cold' }, 'Marked contacted');
            }}
            onSetStatus={(s) => {
              if (s === null) patchContact(c.id, { outreach_status: null, last_outreach_at: null }, 'Cleared');
              else patchContact(c.id, { outreach_status: s, last_outreach_at: new Date().toISOString() }, `Set to ${s}`);
            }}
            onSnooze={(days) => {
              if (days === null) patchContact(c.id, { snoozed_until: null }, 'Unsnoozed');
              else {
                const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
                patchContact(c.id, { snoozed_until: until }, `Snoozed ${days}d`);
              }
            }}
          />
        ))}
        {!loading && tab === 'contacts' && snoozedCount > 0 && (
          <button
            onClick={() => setShowSnoozed(v => !v)}
            className="w-full py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            {showSnoozed ? `Hide ${snoozedCount} snoozed` : `Show ${snoozedCount} snoozed`}
          </button>
        )}
        {!loading && (
          (tab === 'jobs' && filteredJobs.length === 0) ||
          (tab === 'companies' && filteredCompanies.length === 0) ||
          (tab === 'contacts' && filteredContacts.length === 0)
        ) && (
          <div className="text-center py-10 text-sm text-gray-500">
            {search ? 'No matches.' : 'Nothing to show yet.'}
          </div>
        )}
      </div>

      {/* Bulk action bar — appears when contacts are selected on mobile.
          Sticky at the bottom above the safe-area inset so it's reachable
          one-handed. */}
      {selectMode && tab === 'contacts' && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-between px-4 py-2 bg-[#911406] text-white">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <button onClick={exitSelectMode} className="p-1 -mr-1 rounded hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-2">
            <button
              onClick={markContactedBulk}
              disabled={selectedIds.size === 0}
              className="flex flex-col items-center justify-center gap-0.5 py-3 rounded-md bg-blue-600 text-white text-xs font-medium disabled:opacity-40 active:bg-blue-700"
            >
              <Phone className="w-5 h-5" />
              Contacted
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center justify-center gap-0.5 py-3 rounded-md bg-purple-600 text-white text-xs font-medium disabled:opacity-40 active:bg-purple-700"
                >
                  <CheckCircle className="w-5 h-5" />
                  Status
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-44 p-0">
                {(['Cold', 'Replied', 'Booked', 'Dead'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setStatusBulk(opt)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50"
                  >
                    {opt}
                  </button>
                ))}
                <button
                  onClick={() => setStatusBulk(null)}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t"
                >
                  Clear status
                </button>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center justify-center gap-0.5 py-3 rounded-md bg-amber-600 text-white text-xs font-medium disabled:opacity-40 active:bg-amber-700"
                >
                  <Clock className="w-5 h-5" />
                  Snooze
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-44 p-0">
                {[
                  { label: '1 day',   days: 1 },
                  { label: '3 days',  days: 3 },
                  { label: '1 week',  days: 7 },
                  { label: '2 weeks', days: 14 },
                  { label: '1 month', days: 30 },
                ].map(opt => (
                  <button
                    key={opt.days}
                    onClick={() => snoozeBulk(opt.days)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => snoozeBulk(null)}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t"
                >
                  Unsnooze
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {detail && <DetailSheet detail={detail} onClose={() => setDetail(null)} />}
    </MobileShell>
  );
};

const JobCard: React.FC<{ job: any; onTap: () => void }> = ({ job, onTap }) => (
  <button
    onClick={onTap}
    className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 active:bg-gray-50 shadow-sm"
  >
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {job.high_priority && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />}
          <h3 className="font-semibold text-sm text-gray-900 truncate">{job.job_title || '(untitled)'}</h3>
        </div>
        <p className="text-xs text-gray-600 truncate mt-0.5">{job.company_name || '—'}</p>
        {(job.city || job.state) && (
          <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {[job.city, job.state].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
    </div>
  </button>
);

const CompanyCard: React.FC<{ co: any; onTap: () => void }> = ({ co, onTap }) => (
  <button
    onClick={onTap}
    className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 active:bg-gray-50 shadow-sm"
  >
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {co.is_high_priority && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />}
          <h3 className="font-semibold text-sm text-gray-900 truncate">{co.company_name || '(unnamed)'}</h3>
          {co.is_blocked && <Ban className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        </div>
        {co.company_type && <p className="text-xs text-gray-600 truncate mt-0.5">{co.company_type}</p>}
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span><Briefcase className="w-3 h-3 inline mr-0.5" />{co.open_roles_count ?? 0}</span>
          <span><Users className="w-3 h-3 inline mr-0.5" />{co.contact_count ?? 0}</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
    </div>
  </button>
);

const STATUS_META: Record<NonNullable<OutreachStatus>, { color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  Cold:    { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     icon: MessageSquare },
  Replied: { color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200', icon: Check },
  Booked:  { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CalendarIcon },
  Dead:    { color: 'text-gray-600',    bg: 'bg-gray-100 border-gray-200',    icon: X },
};

interface ContactCardProps {
  ct: any;
  selectMode: boolean;
  isSelected: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onMarkContacted: () => void;
  onSetStatus: (s: OutreachStatus) => void;
  onSnooze: (days: number | null) => void;
}

const ContactCard: React.FC<ContactCardProps> = ({
  ct, selectMode, isSelected, onTap, onLongPress, onMarkContacted, onSetStatus, onSnooze,
}) => {
  const name = [ct.first_name, ct.middle_name, ct.last_name].filter(Boolean).join(' ') || '(unnamed)';
  const fullName = ct.suffix ? `${name}, ${ct.suffix}` : name;
  const status: OutreachStatus = ct.outreach_status || null;
  const StatusIcon = status ? STATUS_META[status].icon : null;
  const isSnoozed = ct.snoozed_until && new Date(ct.snoozed_until).getTime() > Date.now();

  // Long-press detection: 500ms touch hold without movement triggers
  // selectMode. We avoid native contextmenu to let scroll keep working.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const handleClick = () => {
    if (longPressed.current) return; // long-press already fired; swallow click
    onTap();
  };

  return (
    <div
      className={`w-full p-3 bg-white rounded-lg border shadow-sm transition-colors ${
        isSelected ? 'border-[#911406] bg-amber-50/40' : 'border-gray-200 active:bg-gray-50'
      } ${isSnoozed ? 'opacity-60' : ''}`}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
    >
      <button onClick={handleClick} className="w-full text-left">
        <div className="flex items-start gap-2">
          {selectMode && (
            <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              isSelected ? 'bg-[#911406] border-[#911406]' : 'border-gray-300 bg-white'
            }`}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 truncate">{fullName}</h3>
            {ct.title && <p className="text-xs text-gray-600 truncate mt-0.5">{ct.title}</p>}
            {ct.company_name && <p className="text-xs text-gray-500 truncate mt-0.5">{ct.company_name}</p>}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {status && StatusIcon && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border ${STATUS_META[status].color} ${STATUS_META[status].bg}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status}
                </span>
              )}
              {ct.last_outreach_at && (
                <span className="text-[10px] text-gray-500">
                  · {Math.max(0, Math.floor((Date.now() - new Date(ct.last_outreach_at).getTime()) / 86400000))}d ago
                </span>
              )}
              {isSnoozed && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200">
                  <Clock className="w-3 h-3" />
                  Snoozed
                </span>
              )}
            </div>
          </div>
          {!selectMode && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />}
        </div>
      </button>

      {/* Per-card quick actions — hidden in selectMode (the bulk bar handles it). */}
      {!selectMode && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={(e) => { e.stopPropagation(); onMarkContacted(); }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium text-blue-700 bg-blue-50 active:bg-blue-100"
          >
            <Phone className="w-3.5 h-3.5" />
            Contacted
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium text-purple-700 bg-purple-50 active:bg-purple-100"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Status
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-40 p-0" onClick={(e) => e.stopPropagation()}>
              {(['Cold', 'Replied', 'Booked', 'Dead'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => onSetStatus(opt)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {opt}
                </button>
              ))}
              <button
                onClick={() => onSetStatus(null)}
                className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t"
              >
                Clear
              </button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium text-amber-700 bg-amber-50 active:bg-amber-100"
              >
                <Clock className="w-3.5 h-3.5" />
                Snooze
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-40 p-0" onClick={(e) => e.stopPropagation()}>
              {[
                { label: '1 day',   days: 1 },
                { label: '3 days',  days: 3 },
                { label: '1 week',  days: 7 },
                { label: '2 weeks', days: 14 },
              ].map(opt => (
                <button
                  key={opt.days}
                  onClick={() => onSnooze(opt.days)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {opt.label}
                </button>
              ))}
              {isSnoozed && (
                <button
                  onClick={() => onSnooze(null)}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t"
                >
                  Unsnooze
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};

/**
 * Full-screen detail sheet. Read-only view of every meaningful field plus
 * one-tap actions (call, email, open LinkedIn). Editing/merge live on
 * desktop — not worth duplicating the merge UI for a phone.
 */
const DetailSheet: React.FC<{ detail: { kind: SubTab; row: any }; onClose: () => void }> = ({ detail, onClose }) => {
  const { kind, row } = detail;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between h-14 px-4 bg-[#911406] text-white flex-shrink-0">
        <button onClick={onClose} className="p-2 -ml-2 rounded hover:bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-base capitalize">{kind === 'jobs' ? 'Job' : kind === 'companies' ? 'Company' : 'Contact'} details</h2>
        <span className="w-9" />
      </header>
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-3">
        {kind === 'jobs' && <JobDetail job={row} />}
        {kind === 'companies' && <CompanyDetail co={row} />}
        {kind === 'contacts' && <ContactDetail ct={row} />}
        <p className="text-[11px] text-gray-400 italic pt-4 text-center">
          Editing and merging are available on the desktop site.
        </p>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-gray-50 rounded-md p-3">
    <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500">{label}</div>
    <div className="text-sm text-gray-900 mt-0.5 break-words">{value || <span className="text-gray-400">—</span>}</div>
  </div>
);

const ActionLink: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; href: string }> = ({ icon: Icon, label, href }) => (
  <a
    href={href}
    target={href.startsWith('http') ? '_blank' : undefined}
    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
    className="flex items-center gap-2 px-3 py-2 bg-[#911406]/10 text-[#911406] rounded-md text-sm font-medium active:bg-[#911406]/20"
  >
    <Icon className="w-4 h-4" />
    {label}
  </a>
);

const JobDetail: React.FC<{ job: any }> = ({ job }) => (
  <>
    <h3 className="text-lg font-bold text-gray-900">{job.job_title || '(untitled)'}</h3>
    <p className="text-sm text-gray-600">{job.company_name || '—'}</p>
    {(job.job_url || job.google_jobs_url || job.indeed_url || job.linkedin_url) && (
      <div className="flex flex-wrap gap-2">
        <ActionLink icon={ExternalLink} label="Open posting" href={job.job_url || job.google_jobs_url || job.indeed_url || job.linkedin_url} />
      </div>
    )}
    <Field label="Location" value={[job.city, job.state].filter(Boolean).join(', ')} />
    <Field label="Job Type" value={job.job_type} />
    <Field label="Source" value={job.source || job.website_source} />
    <Field label="Date Found" value={job.created_at ? new Date(job.created_at).toLocaleString() : null} />
    <Field label="Description" value={job.description ? <pre className="whitespace-pre-wrap font-sans text-xs">{String(job.description).slice(0, 4000)}</pre> : null} />
  </>
);

const CompanyDetail: React.FC<{ co: any }> = ({ co }) => (
  <>
    <h3 className="text-lg font-bold text-gray-900">{co.company_name || '(unnamed)'}</h3>
    {co.company_type && <p className="text-sm text-gray-600">{co.company_type}</p>}
    {co.website && (
      <div className="flex flex-wrap gap-2">
        <ActionLink icon={ExternalLink} label="Website" href={co.website.startsWith('http') ? co.website : `https://${co.website}`} />
      </div>
    )}
    <Field label="Open roles" value={co.open_roles_count ?? 0} />
    <Field label="Contacts" value={co.contact_count ?? 0} />
    <Field label="Location" value={[co.city, co.state].filter(Boolean).join(', ')} />
    <Field label="Notes" value={co.notes} />
  </>
);

const ContactDetail: React.FC<{ ct: any }> = ({ ct }) => {
  const name = [ct.first_name, ct.middle_name, ct.last_name].filter(Boolean).join(' ') || '(unnamed)';
  const fullName = ct.suffix ? `${name}, ${ct.suffix}` : name;
  const phone = ct.phone_cell || ct.phone_work || ct.phone_home;
  const linkedin = ct.linkedin_url || (ct.source_url && String(ct.source_url).includes('linkedin.com/in/') ? ct.source_url : null);
  return (
    <>
      <h3 className="text-lg font-bold text-gray-900">{fullName}</h3>
      {ct.title && <p className="text-sm text-gray-600">{ct.title}{ct.company_name ? ` at ${ct.company_name}` : ''}</p>}
      <div className="flex flex-wrap gap-2">
        {phone &&    <ActionLink icon={Phone}    label="Call"     href={`tel:${phone}`} />}
        {ct.email && <ActionLink icon={Mail}     label="Email"    href={`mailto:${ct.email}`} />}
        {linkedin && <ActionLink icon={Linkedin} label="LinkedIn" href={linkedin} />}
      </div>
      <Field label="Email" value={ct.email} />
      <Field label="Cell" value={ct.phone_cell} />
      <Field label="Work" value={ct.phone_work} />
      <Field label="Home" value={ct.phone_home} />
      <Field label="Company" value={ct.company_name} />
      <Field label="Source" value={ct.source} />
      <Field label="Notes" value={ct.notes} />
    </>
  );
};

export default MobileMarketing;
