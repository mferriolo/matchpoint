import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowLeft, Building2, Briefcase, Globe, Settings, Loader2, Users,
  Search, ExternalLink, Star, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Database, Shield, Phone, Send,
  Linkedin, Unlink, Upload, Trash2, Zap,
  ArrowUpDown, ArrowUp, ArrowDown, ShieldAlert, FileText, ArrowRightLeft,
  Ban, RotateCcw, Eye, EyeOff, Pencil, Filter, X, Copy, GitMerge, Download
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

import { useToast } from '@/hooks/use-toast';
import TrackerControls from '@/components/marketing/TrackerControls';
import JobsTabContent from '@/components/marketing/JobsTabContent';
import ImportTool from '@/components/marketing/ImportTool';
import DataCleanup from '@/components/marketing/DataCleanup';
import PushToCrelate from '@/components/marketing/PushToCrelate';
import CrelateSyncStatus from '@/components/marketing/CrelateSyncStatus';
import MissingTitlesReport from '@/components/marketing/MissingTitlesReport';
import TitleMapping from '@/components/marketing/TitleMapping';
import { MultiSelectColumnHeader } from '@/components/marketing/MultiSelectColumnHeader';
import { exportMasterSheet, exportNewDataSheet, exportContactsToXlsx } from '@/utils/xlsxExport';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileMarketing from '@/components/mobile/MobileMarketing';
import JobPriorityBadge from '@/components/marketing/JobPriorityBadge';
import { priorityScore } from '@/lib/jobPriorityScore';
import OutreachStatusCell, { OutreachStatus } from '@/components/marketing/OutreachStatusCell';
import { loadSavedViews, writeSavedViews, consumeContactsLastVisit, SavedContactsView, loadVisibleCols, writeVisibleCols, DEFAULT_VISIBLE_COLS, ContactColumnKey } from '@/lib/marketingPrefs';
import { Sparkles, BookmarkPlus, Bookmark, Columns3, Sun, Clock, MessageSquareReply } from 'lucide-react';

/** Compact "12s ago" / "3m ago" / "1h ago" formatter for the freshness indicator. */
function formatAgo(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}




/**
 * Route entry. Picks a viewport-appropriate implementation. We branch
 * here (rather than inside DesktopMarketingNewJobs) so that the heavy
 * desktop component — and its dozens of hooks — only mounts when its
 * UI is actually shown. That keeps Rules-of-Hooks happy if the user
 * resizes across the breakpoint, and avoids running the desktop's
 * data-load + multi-tab state machine on a phone.
 */
const MarketingNewJobs: React.FC = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileMarketing /> : <DesktopMarketingNewJobs />;
};


const DesktopMarketingNewJobs: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchCompanies, setSearchCompanies] = useState('');
  const [searchContacts, setSearchContacts] = useState('');

  // Contacts tab sort + per-column filters. Multi-select filters use an
  // empty Set to mean "no filter"; for presence filters (email, phones,
  // LinkedIn) callers pass options ['Has data', 'No data'] and the
  // filter logic interprets them directly.
  type ContactSortField =
    | 'priority_score'
    | 'first_name' | 'last_name' | 'company_name' | 'title'
    | 'email' | 'phone_work' | 'phone_home' | 'phone_cell'
    | 'source' | 'created_at' | 'linkedin_url' | 'confidence_score';
  // Default to priority desc — hottest contacts (those at companies with
  // the freshest top-rank open jobs) first.
  const [contactSortField, setContactSortField] = useState<ContactSortField>('priority_score');
  const [contactSortDir, setContactSortDir] = useState<'asc'|'desc'>('desc');
  const [filterFirstName, setFilterFirstName] = useState<Set<string>>(new Set());
  const [filterLastName, setFilterLastName] = useState<Set<string>>(new Set());
  const [filterContactCompany, setFilterContactCompany] = useState<Set<string>>(new Set());
  const [filterContactTitle, setFilterContactTitle] = useState<Set<string>>(new Set());
  const [filterContactSource, setFilterContactSource] = useState<Set<string>>(new Set());
  const [filterDateAdded, setFilterDateAdded] = useState<Set<string>>(new Set());
  const [filterEmailPresence, setFilterEmailPresence] = useState<Set<string>>(new Set());
  const [filterPhoneWorkPresence, setFilterPhoneWorkPresence] = useState<Set<string>>(new Set());
  const [filterPhoneHomePresence, setFilterPhoneHomePresence] = useState<Set<string>>(new Set());
  const [filterPhoneCellPresence, setFilterPhoneCellPresence] = useState<Set<string>>(new Set());
  const [filterLinkedInPresence, setFilterLinkedInPresence] = useState<Set<string>>(new Set());
  const [filterConfidence, setFilterConfidence] = useState<Set<string>>(new Set());
  // Cross-phone filter: "has ANY phone populated" vs "has NO phones".
  // Stored separately from the per-column filters so the user can mix them
  // (e.g. "has any phone but no cell").
  const [filterAnyPhonePresence, setFilterAnyPhonePresence] = useState<Set<string>>(new Set());
  const [anyPhoneFilterOpen, setAnyPhoneFilterOpen] = useState(false);
  // Outreach-status bucket filter on the Contacts tab. Multi-select. The
  // synthetic 'Never' value means last_outreach_at IS NULL; the others
  // are the four CHECK-constrained statuses on marketing_contacts.
  const [filterOutreachStatus, setFilterOutreachStatus] = useState<Set<string>>(new Set());
  // "Days since last outreach" bucket — works alongside status.
  const [filterOutreachAge, setFilterOutreachAge] = useState<Set<string>>(new Set());

  // ── New since last visit ────────────────────────────────────────────
  // Snapshot the prior lastVisit on first render and advance the stamp
  // to "now". A toggle then filters Contacts to rows created after the
  // snapshot. Stable across renders via ref.
  const previousVisitRef = React.useRef<number>(0);
  if (previousVisitRef.current === 0) {
    previousVisitRef.current = consumeContactsLastVisit();
  }
  const [newSinceLastVisit, setNewSinceLastVisit] = useState(false);

  // ── Caching / freshness ─────────────────────────────────────────────
  // loadData skips refetches within FRESHNESS_MS unless force=true. A
  // ref holds the most recent successful load timestamp so loadData
  // stays a stable reference across renders (otherwise the
  // useEffect(()=>loadData(), [loadData]) below loops). A separate
  // state mirror drives the "Updated Ns ago" indicator re-rendering.
  const FRESHNESS_MS = 30_000;
  const lastUpdatedRef = React.useRef<number>(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);
  const [, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // ── Saved views (Contacts tab only for v1) ──────────────────────────
  const [savedViews, setSavedViews] = useState<SavedContactsView[]>(() => loadSavedViews());
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

  // ── Column visibility (Contacts tab) ────────────────────────────────
  // Default set hides 6 columns the recruiter rarely scans (Phone Home/Cell,
  // Source, Date Added, LinkedIn, Confidence) so the table fits without
  // horizontal scroll. Toggleable via the "Columns" button; persisted.
  const [visibleCols, setVisibleCols] = useState<Set<ContactColumnKey>>(() => new Set(loadVisibleCols()));
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const isColVisible = (k: ContactColumnKey) => visibleCols.has(k);
  const toggleColVisible = (k: ContactColumnKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      writeVisibleCols(Array.from(next));
      return next;
    });
  };
  const resetColsToDefault = () => {
    const next = new Set<ContactColumnKey>(DEFAULT_VISIBLE_COLS);
    setVisibleCols(next);
    writeVisibleCols(Array.from(next));
  };

  // ── Today presets ───────────────────────────────────────────────────
  // Three one-click filters that answer "who should I call today?". Each
  // sets the outreach status + age filters and clears anything else that
  // would shrink the result. Identified by the `activeTodayPreset` so the
  // card can show as selected.
  type TodayPreset = 'never' | 'cold-7' | 'replied-pending';
  const [activeTodayPreset, setActiveTodayPreset] = useState<TodayPreset | null>(null);
  const applyTodayPreset = (preset: TodayPreset) => {
    if (activeTodayPreset === preset) {
      // Toggle off: clear the outreach filters.
      setFilterOutreachStatus(new Set());
      setFilterOutreachAge(new Set());
      setActiveTodayPreset(null);
      return;
    }
    if (preset === 'never') {
      setFilterOutreachStatus(new Set(['Never']));
      setFilterOutreachAge(new Set());
    } else if (preset === 'cold-7') {
      setFilterOutreachStatus(new Set(['Cold']));
      setFilterOutreachAge(new Set(['8-14 days', '15-30 days', '30+ days']));
    } else if (preset === 'replied-pending') {
      setFilterOutreachStatus(new Set(['Replied']));
      setFilterOutreachAge(new Set());
    }
    setActiveTodayPreset(preset);
    setActiveSavedViewId(null);
  };

  /** Snapshot all Contacts-tab filters into a JSON-safe shape. */
  const captureContactsViewFilters = (): Record<string, string[]> => ({
    firstName:        Array.from(filterFirstName),
    lastName:         Array.from(filterLastName),
    company:          Array.from(filterContactCompany),
    title:            Array.from(filterContactTitle),
    source:           Array.from(filterContactSource),
    dateAdded:        Array.from(filterDateAdded),
    emailPresence:    Array.from(filterEmailPresence),
    phoneWorkPresence: Array.from(filterPhoneWorkPresence),
    phoneHomePresence: Array.from(filterPhoneHomePresence),
    phoneCellPresence: Array.from(filterPhoneCellPresence),
    linkedinPresence: Array.from(filterLinkedInPresence),
    anyPhonePresence: Array.from(filterAnyPhonePresence),
    confidence:       Array.from(filterConfidence),
    outreachStatus:   Array.from(filterOutreachStatus),
    outreachAge:      Array.from(filterOutreachAge),
  });

  /** Apply a previously-saved view: rehydrate every filter Set + sort + search. */
  const applySavedView = (v: SavedContactsView) => {
    const f = v.filters || {};
    const set = (arr?: string[]) => new Set(arr || []);
    setFilterFirstName(set(f.firstName));
    setFilterLastName(set(f.lastName));
    setFilterContactCompany(set(f.company));
    setFilterContactTitle(set(f.title));
    setFilterContactSource(set(f.source));
    setFilterDateAdded(set(f.dateAdded));
    setFilterEmailPresence(set(f.emailPresence));
    setFilterPhoneWorkPresence(set(f.phoneWorkPresence));
    setFilterPhoneHomePresence(set(f.phoneHomePresence));
    setFilterPhoneCellPresence(set(f.phoneCellPresence));
    setFilterLinkedInPresence(set(f.linkedinPresence));
    setFilterAnyPhonePresence(set(f.anyPhonePresence));
    setFilterConfidence(set(f.confidence));
    setFilterOutreachStatus(set(f.outreachStatus));
    setFilterOutreachAge(set(f.outreachAge));
    setSearchContacts(v.search || '');
    setContactSortField((v.sortField as ContactSortField) || 'priority_score');
    setContactSortDir(v.sortDir || 'desc');
    setActiveSavedViewId(v.id);
    setSavedViewsOpen(false);
  };

  const saveCurrentView = () => {
    const name = window.prompt('Name this view (e.g. "VBC CMOs not contacted")');
    if (!name) return;
    const view: SavedContactsView = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      createdAt: Date.now(),
      search: searchContacts,
      sortField: contactSortField,
      sortDir: contactSortDir,
      filters: captureContactsViewFilters(),
    };
    const next = [view, ...savedViews];
    setSavedViews(next);
    writeSavedViews(next);
    setActiveSavedViewId(view.id);
    setSavedViewsOpen(false);
    toast({ title: 'View saved', description: name });
  };

  const deleteSavedView = (id: string) => {
    const next = savedViews.filter(v => v.id !== id);
    setSavedViews(next);
    writeSavedViews(next);
    if (activeSavedViewId === id) setActiveSavedViewId(null);
  };

  const handleContactSort = (f: ContactSortField) => {
    if (contactSortField === f) setContactSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setContactSortField(f);
      // Numeric/date columns default to desc (highest/newest first);
      // text columns default to asc.
      setContactSortDir(
        f === 'priority_score' || f === 'confidence_score' || f === 'created_at' ? 'desc' : 'asc'
      );
    }
  };

  // Multi-select + bulk delete for contacts. The checkbox column is on
  // the far right of the Contacts table; a bulk-action bar appears when
  // any rows are selected. Deletes are confirmed via a dialog and fire
  // a single `.in('id', [...])` so the round-trip stays tight.
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showDeleteContactsConfirm, setShowDeleteContactsConfirm] = useState(false);
  const [deletingContacts, setDeletingContacts] = useState(false);
  const [showWipeContactsConfirm, setShowWipeContactsConfirm] = useState(false);
  const [wipingContacts, setWipingContacts] = useState(false);

  // Contact merge-candidate review state — mirror of the company
  // merge flow. Auto-detected groups are computed from the loaded
  // contacts (same name → same group); manual group comes from the
  // bulk-selection bar. Merge calls the merge_contacts RPC.
  const [showContactMerge, setShowContactMerge] = useState(false);
  const [contactMergeSelection, setContactMergeSelection] = useState<Record<string, { canonicalId: string; includeIds: Set<string> }>>({});
  const [contactMergingInFlight, setContactMergingInFlight] = useState(false);
  const [contactMergeResultSummary, setContactMergeResultSummary] = useState<Array<{ group: string; ok: boolean; contacts_deleted?: number; fields_filled?: string[]; error?: string }> | null>(null);
  const [contactManualMergeGroup, setContactManualMergeGroup] = useState<{ key: string; items: any[] } | null>(null);

  const toggleContactSelect = (id: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearContactSelection = () => setSelectedContactIds(new Set());

  // Enrich a set of contacts by invoking the enrich-contacts edge
  // function. It reuses the contact_runs table (mode='enrich') so the
  // existing progress panel + dialog picks it up without extra wiring.
  // Used by both the bulk "Enrich N" button and the per-row enrich icon.
  const enrichContactsById = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (contactRunIsActive) {
      toast({ title: 'Another run is active', description: 'Wait for the current run to finish before starting another.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('enrich-contacts', { body: { contactIds: ids } });
      // supabase-js wraps 4xx/5xx responses in a FunctionsHttpError whose
      // `context` is the raw Response. Unwrap it so the toast shows the
      // actual error from the edge function, not just "non 2xx status".
      if (error) {
        let detail = error.message || 'Unknown error';
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.text === 'function') {
            const raw = await ctx.text();
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.error) {
                detail = parsed.error;
                // The enrich function attaches a `visible_env_var_names`
                // array when keys are missing — surface it so the user
                // can spot a rename at a glance.
                if (parsed.visible_env_var_names) {
                  detail += ` · Env vars visible to the function: ${parsed.visible_env_var_names.join(', ')}`;
                }
                if (parsed.hint) detail += ` · ${parsed.hint}`;
              }
              else if (raw) detail = raw.slice(0, 800);
            } catch {
              if (raw) detail = raw.slice(0, 800);
            }
          }
        } catch {}
        console.error('enrich-contacts error detail:', detail);
        throw new Error(detail);
      }
      if (!data?.success || !data?.run_id) throw new Error(data?.error || 'No run id returned');
      setContactRun({
        id: data.run_id,
        status: 'running',
        mode: 'enrich',
        items_total: data.items_total || ids.length,
        items_processed: 0,
        contacts_added: 0,
        ai_added: 0,
        crelate_added: 0,
        apollo_added: 0,
        leadership_added: 0,
        emails_verified: 0,
        duplicates_skipped: 0,
        current_item: null,
        target_company_name: null,
        per_item: [],
      });
      // Clear selection so the bulk bar disappears; the progress panel
      // takes over. Safe to call even for a single-row enrich.
      clearContactSelection();
    } catch (err: any) {
      toast({ title: 'Enrich failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  const handleEnrichSelectedContacts = () => enrichContactsById(Array.from(selectedContactIds));

  // ── Bulk outreach actions ───────────────────────────────────────────
  // Each handler chunks ids ~500/req for the same PostgREST URL-length
  // reason as the delete path above. Optimistically updates the local
  // contacts list so the UI reflects the change immediately without
  // waiting on a full reload — loadData() still runs to reconcile.
  const updateContactsBulk = async (
    ids: string[],
    patch: Record<string, any>,
    successTitle: string,
  ) => {
    if (ids.length === 0) return;
    try {
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase
          .from('marketing_contacts')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .in('id', batch);
        if (error) throw error;
      }
      // Optimistic local merge.
      setContacts(prev => prev.map(c => (ids.includes(c.id) ? { ...c, ...patch } : c)));
      toast({ title: successTitle });
      clearContactSelection();
      loadData();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  /** Stamp last_outreach_at=now on all selected. Sets outreach_status to 'Cold'
   *  for rows that are currently NULL, but does NOT overwrite an existing
   *  status (so a Booked contact stays Booked). */
  const handleBulkMarkContacted = async () => {
    const ids = Array.from(selectedContactIds);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    // Two separate updates: first the timestamp on everyone, then the
    // status on rows that need a default. Keeps the SQL simple and avoids
    // a CASE expression / RPC.
    try {
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase
          .from('marketing_contacts')
          .update({ last_outreach_at: now, updated_at: now })
          .in('id', batch);
        if (error) throw error;
      }
      const needsDefault = contacts.filter(c => ids.includes(c.id) && !c.outreach_status).map(c => c.id);
      for (let i = 0; i < needsDefault.length; i += batchSize) {
        const batch = needsDefault.slice(i, i + batchSize);
        if (batch.length === 0) continue;
        const { error } = await supabase
          .from('marketing_contacts')
          .update({ outreach_status: 'Cold', updated_at: now })
          .in('id', batch);
        if (error) throw error;
      }
      setContacts(prev => prev.map(c => {
        if (!ids.includes(c.id)) return c;
        return { ...c, last_outreach_at: now, outreach_status: c.outreach_status || 'Cold' };
      }));
      toast({ title: `Marked ${ids.length} contact${ids.length === 1 ? '' : 's'} contacted` });
      clearContactSelection();
      loadData();
    } catch (err: any) {
      toast({ title: 'Mark contacted failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  const handleBulkSetStatus = async (status: OutreachStatus) => {
    const ids = Array.from(selectedContactIds);
    if (ids.length === 0) return;
    if (status === null) {
      await updateContactsBulk(ids, { outreach_status: null, last_outreach_at: null }, `Cleared status on ${ids.length}`);
    } else {
      await updateContactsBulk(ids, { outreach_status: status, last_outreach_at: new Date().toISOString() }, `Set ${ids.length} to ${status}`);
    }
  };

  const handleDeleteSelectedContacts = async () => {
    if (selectedContactIds.size === 0) return;
    setDeletingContacts(true);
    try {
      const ids = Array.from(selectedContactIds);
      // Batch to keep the request URL + payload under Supabase/PostgREST
      // limits. Single `.in('id', ids)` with thousands of UUIDs returns
      // silently on some proxies; chunking ~500 at a time is reliable.
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase.from('marketing_contacts').delete().in('id', batch);
        if (error) throw error;
      }
      toast({
        title: `${ids.length} contact${ids.length === 1 ? '' : 's'} deleted`,
      });
      clearContactSelection();
      setShowDeleteContactsConfirm(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setDeletingContacts(false);
    }
  };

  // Nuke every row in marketing_contacts. Delegated to the wipe-contacts
  // edge function (service role) so we don't hit PostgREST row limits
  // or RLS quirks from the client.
  const handleWipeAllContacts = async () => {
    setWipingContacts(true);
    try {
      const { data, error } = await supabase.functions.invoke('wipe-contacts', {
        body: { confirm: 'WIPE_ALL_CONTACTS' },
      });
      if (error) {
        let detail = error.message || 'Unknown error';
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.text === 'function') {
            const raw = await ctx.text();
            try { const parsed = JSON.parse(raw); if (parsed?.error) detail = parsed.error; } catch { if (raw) detail = raw.slice(0, 500); }
          }
        } catch {}
        throw new Error(detail);
      }
      if (!data?.success) throw new Error(data?.error || 'Wipe failed');
      toast({
        title: `Wiped ${data.deleted || 0} contact${data.deleted === 1 ? '' : 's'}`,
        description: 'marketing_contacts cleared and contact_count zeroed.',
      });
      clearContactSelection();
      setShowWipeContactsConfirm(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Wipe failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setWipingContacts(false);
    }
  };

  // Confirm contact merges: for each group with ≥2 items, call the
  // merge_contacts RPC. Falls back to defaultMergeSelection if state
  // wasn't populated (same fast-click safety net as the company flow).
  const handleConfirmContactMerges = async () => {
    setContactMergingInFlight(true);
    const activeGroups = contactManualMergeGroup ? [contactManualMergeGroup] : contactMergeCandidates;
    const results: Array<{ group: string; ok: boolean; contacts_deleted?: number; fields_filled?: string[]; error?: string }> = [];
    for (const g of activeGroups) {
      const sel = contactMergeSelection[g.key] || defaultMergeSelection(g.items);
      const mergeIds = Array.from(sel.includeIds).filter(id => id !== sel.canonicalId);
      if (mergeIds.length === 0) continue;
      try {
        const { data, error } = await supabase.rpc('merge_contacts', {
          canonical_id: sel.canonicalId,
          merge_ids: mergeIds,
        });
        if (error) throw error;
        results.push({ group: g.key, ok: true, ...((data as any) || {}) });
      } catch (err: any) {
        results.push({ group: g.key, ok: false, error: err.message || String(err) });
      }
    }
    setContactMergingInFlight(false);
    setContactMergeResultSummary(results);
    const okResults = results.filter(r => r.ok);
    const failResults = results.filter(r => !r.ok);
    const totalDeleted = okResults.reduce((n, r) => n + (r.contacts_deleted || 0), 0);
    const totalFieldsFilled = okResults.reduce((n, r) => n + (r.fields_filled?.length || 0), 0);
    toast({
      title: failResults.length === 0
        ? `Merged ${okResults.length} contact group${okResults.length === 1 ? '' : 's'}`
        : `Merged ${okResults.length}, ${failResults.length} failed`,
      description: failResults.length > 0
        ? failResults.map(r => r.error).join(' · ')
        : `${totalDeleted} contact${totalDeleted === 1 ? '' : 's'} deleted${totalFieldsFilled > 0 ? ` · filled ${totalFieldsFilled} empty field${totalFieldsFilled === 1 ? '' : 's'} on canonicals` : ''}`,
      variant: failResults.length > 0 ? 'destructive' : undefined,
    });
    setShowContactMerge(false);
    setContactMergeSelection({});
    setContactManualMergeGroup(null);
    clearContactSelection();
    loadData();
  };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('tracker');
  const [showImportTool, setShowImportTool] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showPushToCrelate, setShowPushToCrelate] = useState(false);
  const [showMissingTitles, setShowMissingTitles] = useState(false);
  const [showTitleMapping, setShowTitleMapping] = useState(false);

  // Contact enrichment state. The find-contacts edge function runs in
  // the background via EdgeRuntime.waitUntil — the HTTP call returns
  // immediately with a contact_runs row id, and we poll that row for
  // live progress. contactRun holds the polled row; findingContactsForId
  // identifies which per-row spinner to show on the Companies tab.
  const [contactRun, setContactRun] = useState<any | null>(null);
  const [findingContactsForId, setFindingContactsForId] = useState<string | null>(null);
  // Last completed run — kept around so the user can see results after
  // the progress panel goes away. Auto-opens on completion; user can
  // re-open via the "Last run details" button on the Contacts tab.
  const [contactRunResult, setContactRunResult] = useState<any | null>(null);
  const [showContactRunResult, setShowContactRunResult] = useState(false);
  const contactRunIsActive = !!contactRun && contactRun.status === 'running';
  const findingContactsAll = contactRunIsActive && contactRun?.mode === 'all';





  // Companies tab state
  const [filterHighPriorityCompanies, setFilterHighPriorityCompanies] = useState(false);
  const [togglingCompanyPriorityId, setTogglingCompanyPriorityId] = useState<string | null>(null);
  const [autoPrioritizing, setAutoPrioritizing] = useState(false);
  const [companySortField, setCompanySortField] = useState<'company_name' | 'company_type' | 'open_roles_count' | 'contact_count' | 'is_high_priority' | 'has_md_cmo'>('open_roles_count');
  const [companySortDir, setCompanySortDir] = useState<'asc' | 'desc'>('desc');
  const [showAutoPrioritizeResults, setShowAutoPrioritizeResults] = useState(false);
  const [autoPrioritizeResults, setAutoPrioritizeResults] = useState<any>(null);

  // Multi-select + blocking for companies. Selected ids drive the bulk
  // action bar; blocked rows are hidden by default and excluded from
  // future scraper runs (the scraper consults marketing_companies.is_blocked).
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [showBlockedCompanies, setShowBlockedCompanies] = useState(false);

  // Inline edit of company_type. Only one row can be in edit mode at a
  // time; editingCompanyTypeId === c.id swaps the Category cell into a
  // <select>. Same constants the scraper uses for company categorization.
  const COMPANY_CATEGORY_OPTIONS = [
    'Value Based Care (VBC)', 'ACO', 'PACE Medical Groups', 'Health Plans',
    'Health Systems', 'Hospitals', 'FQHC', 'All Others'
  ];
  const [editingCompanyTypeId, setEditingCompanyTypeId] = useState<string | null>(null);

  // Category column filter on the Companies tab. Multi-select: empty set
  // == "no filter"; any non-empty set restricts to the listed categories.
  // Open state is managed by Radix Popover internally.
  const [filterCompanyCategory, setFilterCompanyCategory] = useState<Set<string>>(new Set());
  const [companyCategoryFilterOpen, setCompanyCategoryFilterOpen] = useState(false);

  // Company merge-candidate review. mergeSelection is keyed by group key
  // and stores { canonicalId, includeIds } — the canonical is the row
  // everything else gets reassigned to; includeIds are the members of
  // the group the user wants swept into the merge (unchecked ones are
  // left alone). mergingInFlight disables UI while RPC calls are in
  // flight. mergeResultSummary holds the list of per-group outcomes
  // from the most recent confirm, for the results toast/dialog.
  const [showMergeCandidates, setShowMergeCandidates] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Record<string, { canonicalId: string; includeIds: Set<string> }>>({});
  const [mergingInFlight, setMergingInFlight] = useState(false);
  const [mergeResultSummary, setMergeResultSummary] = useState<Array<{ group: string; ok: boolean; canonical_name?: string; jobs_moved?: number; contacts_moved?: number; companies_deleted?: number; fields_filled?: string[]; error?: string }> | null>(null);
  // When non-null, the merge dialog renders a single group containing
  // these specific companies (manual pick from the bulk selection bar)
  // instead of the auto-detected candidates. Cleared when the dialog
  // closes or the merge completes.
  const [manualMergeGroup, setManualMergeGroup] = useState<{ key: string; items: any[] } | null>(null);

  // Row-level edit modal state for companies + contacts. editingX holds
  // the row being edited (null = closed); editingXDraft holds in-flight
  // form values; savingX disables Save while the update is in flight.
  // One modal at a time per entity type; opening a new row replaces the
  // draft.
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [editingCompanyDraft, setEditingCompanyDraft] = useState<Record<string, any>>({});
  const [savingCompanyEdit, setSavingCompanyEdit] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [editingContactDraft, setEditingContactDraft] = useState<Record<string, any>>({});
  const [savingContactEdit, setSavingContactEdit] = useState(false);

  const openEditCompany = (c: any) => {
    setEditingCompany(c);
    setEditingCompanyDraft({
      company_name: c.company_name ?? '',
      website: c.website ?? '',
      careers_url: c.careers_url ?? '',
      company_type: c.company_type ?? '',
      industry: c.industry ?? '',
      location: c.location ?? '',
      homepage_url: c.homepage_url ?? '',
      role_types_hired: c.role_types_hired ?? '',
      source: c.source ?? '',
      notes: c.notes ?? '',
      is_high_priority: !!c.is_high_priority,
      is_blocked: !!c.is_blocked,
      has_md_cmo: !!c.has_md_cmo,
    });
  };

  const handleSaveCompanyEdit = async () => {
    if (!editingCompany) return;
    setSavingCompanyEdit(true);
    try {
      const updates: Record<string, any> = { ...editingCompanyDraft, updated_at: new Date().toISOString() };
      // Coerce empty strings to null for text fields so filters /
      // searches don't see phantom zero-length values.
      for (const k of ['website', 'careers_url', 'industry', 'location', 'homepage_url', 'role_types_hired', 'source', 'notes', 'company_type']) {
        if (updates[k] === '') updates[k] = null;
      }
      const { error } = await supabase.from('marketing_companies').update(updates).eq('id', editingCompany.id);
      if (error) throw error;
      // If company_name changed, cascade the text label onto jobs +
      // contacts that reference this company so the denormalized field
      // stays in sync with the relational id.
      if (editingCompanyDraft.company_name && editingCompanyDraft.company_name !== editingCompany.company_name) {
        await supabase.from('marketing_jobs').update({ company_name: editingCompanyDraft.company_name }).eq('company_id', editingCompany.id);
        await supabase.from('marketing_contacts').update({ company_name: editingCompanyDraft.company_name }).eq('company_id', editingCompany.id);
      }
      toast({ title: 'Company updated' });
      setEditingCompany(null);
      setEditingCompanyDraft({});
      loadData();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setSavingCompanyEdit(false);
    }
  };

  /**
   * Copy a recruiter-friendly "contact pack" to clipboard: name, title,
   * company, email, phone, LinkedIn — formatted for pasting into a draft
   * email or ATS note. Only includes fields that have values, so the
   * paste isn't littered with empty placeholders.
   */
  const copyContactPack = async (c: any) => {
    const name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ').trim();
    const fullName = c.suffix ? (name ? `${name}, ${c.suffix}` : c.suffix) : (name || '(unnamed)');
    const titleAt = [c.title, c.company_name].filter(Boolean).join(' at ');
    const linkedin = c.linkedin_url || (c.source_url && String(c.source_url).includes('linkedin.com/in/') ? c.source_url : '');
    const phone = c.phone_cell || c.phone_work || c.phone_home;
    const lines = [
      fullName,
      titleAt,
      c.email,
      phone,
      linkedin,
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `Contact pack for ${fullName}` });
    } catch {
      toast({ title: 'Copy failed', description: 'Browser blocked clipboard access.', variant: 'destructive' });
    }
  };

  /**
   * Hand off contacts to a spreadsheet. If any rows are checked we export
   * just those; otherwise we export the current filtered/sorted view (so
   * the recruiter can hit a saved view + Export and get exactly that
   * list). Each row is decorated with its computed priority so the
   * exported sheet matches what's on screen.
   */
  const handleExportContacts = (which: 'selected' | 'visible') => {
    const base = which === 'selected'
      ? contacts.filter(c => selectedContactIds.has(c.id))
      : filteredContacts;
    if (base.length === 0) {
      toast({ title: 'Nothing to export', description: 'No contacts match the current view.', variant: 'destructive' });
      return;
    }
    const decorated = base.map(c => ({ ...c, _priorityScore: priorityForContact(c) }));
    const prefix = which === 'selected' ? `Contacts (selected ${decorated.length})` : `Contacts (${decorated.length})`;
    const file = exportContactsToXlsx(decorated, prefix);
    toast({ title: 'Exported', description: file });
  };

  const openEditContact = (c: any) => {
    setEditingContact(c);
    setEditingContactDraft({
      first_name: c.first_name ?? '',
      middle_name: c.middle_name ?? '',
      last_name: c.last_name ?? '',
      suffix: c.suffix ?? '',
      title: c.title ?? '',
      email: c.email ?? '',
      phone_work: c.phone_work ?? '',
      phone_home: c.phone_home ?? '',
      phone_cell: c.phone_cell ?? '',
      linkedin_url: c.linkedin_url ?? '',
      company_name: c.company_name ?? '',
      source: c.source ?? '',
      notes: c.notes ?? '',
    });
  };

  const handleSaveContactEdit = async () => {
    if (!editingContact) return;
    setSavingContactEdit(true);
    try {
      const updates: Record<string, any> = { ...editingContactDraft, updated_at: new Date().toISOString() };
      for (const k of ['middle_name', 'suffix', 'title', 'email', 'phone_work', 'phone_home', 'phone_cell', 'linkedin_url', 'source', 'notes']) {
        if (updates[k] === '') updates[k] = null;
      }
      const { error } = await supabase.from('marketing_contacts').update(updates).eq('id', editingContact.id);
      if (error) throw error;
      toast({ title: 'Contact updated' });
      setEditingContact(null);
      setEditingContactDraft({});
      loadData();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setSavingContactEdit(false);
    }
  };

  // Kick off a find-contacts run. The edge function returns a run_id
  // immediately and continues processing in the background. We then
  // poll the contact_runs row every 2s until it hits completed/failed.
  const handleFindContacts = async (opts: { mode: 'all'; forceRestart?: boolean } | { mode: 'company'; companyId: string; companyName?: string }) => {
    const isAll = opts.mode === 'all';
    if (!isAll) setFindingContactsForId(opts.companyId);
    try {
      // forceRestart:true tells find-contacts to skip the 24h
      // resume-from-last lookup and process EVERY eligible company.
      const body = isAll
        ? { mode: 'all', forceRestart: !!(opts as { forceRestart?: boolean }).forceRestart }
        : { mode: 'company', companyId: opts.companyId };
      const { data, error } = await supabase.functions.invoke('find-contacts', { body });
      if (error) {
        let detail = error.message || 'Unknown error';
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.text === 'function') {
            const raw = await ctx.text();
            try { const parsed = JSON.parse(raw); if (parsed?.error) detail = parsed.error; else if (raw) detail = raw.slice(0, 500); }
            catch { if (raw) detail = raw.slice(0, 500); }
          }
        } catch {}
        throw new Error(detail);
      }
      if (!data?.success || !data?.run_id) throw new Error(data?.error || 'No run id returned');

      // Seed the polled-row state so the progress UI shows up on the
      // first render even before the first poll.
      setContactRun({
        id: data.run_id,
        status: 'running',
        mode: data.mode,
        items_total: data.items_total || 0,
        items_processed: 0,
        contacts_added: 0,
        ai_added: 0,
        crelate_added: 0,
        duplicates_skipped: 0,
        current_item: null,
        target_company_name: isAll ? null : (opts.companyName || null),
        per_item: [],
      });
      // Per-row spinner is cleared by the poller when status != 'running'.
    } catch (err: any) {
      if (!isAll) setFindingContactsForId(null);
      toast({ title: 'Find Contacts failed', description: err.message || String(err), variant: 'destructive' });
    }
  };

  // Poll the active contact_runs row for progress. Started whenever we
  // have a run id with status === 'running'; cleared when it terminates.
  useEffect(() => {
    if (!contactRun?.id || contactRun.status !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase
          .from('contact_runs')
          .select('*')
          .eq('id', contactRun.id)
          .maybeSingle();
        if (!data || cancelled) return;
        setContactRun(data);
        if (data.status === 'completed') {
          const added = data.contacts_added ?? 0;
          const skipped = data.duplicates_skipped ?? 0;
          const processed = data.items_processed ?? 0;
          const isAll = data.mode === 'all';
          const isEnrich = data.mode === 'enrich';
          toast({
            title: isEnrich
              ? `Enriched ${added} of ${processed} contacts${skipped ? ` (${skipped} had nothing to add)` : ''}`
              : isAll
                ? `Find Contacts: ${added} added across ${processed} companies${skipped ? `, ${skipped} duplicates skipped` : ''}`
                : `${data.target_company_name || 'Company'}: ${added} new contact${added === 1 ? '' : 's'}${skipped ? `, ${skipped} duplicates skipped` : ''}`,
          });
          setFindingContactsForId(null);
          // Persist the final row so the dialog can show full details
          // (per-source counts, per-company breakdown, errors) after the
          // live progress panel disappears.
          setContactRunResult(data);
          setShowContactRunResult(true);
          loadData();
        } else if (data.status === 'failed') {
          toast({ title: 'Find Contacts failed', description: data.error_message || 'Unknown error', variant: 'destructive' });
          setFindingContactsForId(null);
          setContactRunResult(data);
          setShowContactRunResult(true);
          // Reload even on failure/cancel — partial runs may have
          // already inserted rows into marketing_contacts that the user
          // would otherwise need to refresh the page to see.
          loadData();
        }
      } catch (e) {
        console.warn('contact_runs poll error:', e);
      }
    };
    const interval = setInterval(tick, 2000);
    // Poll once immediately so the user sees counters start moving fast.
    tick();
    return () => { cancelled = true; clearInterval(interval); };
  }, [contactRun?.id, contactRun?.status, toast]);

  const handleSaveCompanyType = async (id: string, newType: string) => {
    try {
      const { error } = await supabase.from('marketing_companies')
        .update({ company_type: newType, industry: newType, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Category updated' });
      setEditingCompanyTypeId(null);
      loadData();
    } catch (err: any) {
      toast({ title: 'Error updating category', description: err.message, variant: 'destructive' });
    }
  };

  const toggleCompanySelect = (id: string) => {
    setSelectedCompanyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearCompanySelection = () => setSelectedCompanyIds(new Set());

  const handleToggleCompanyBlock = async (id: string, currentlyBlocked: boolean) => {
    try {
      const { error } = await supabase.from('marketing_companies')
        .update({ is_blocked: !currentlyBlocked, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast({ title: currentlyBlocked ? 'Company unblocked' : 'Company blocked from future runs' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error updating block flag', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkCompanyBlock = async (block: boolean) => {
    if (selectedCompanyIds.size === 0) return;
    const ids = Array.from(selectedCompanyIds);
    try {
      const { error } = await supabase.from('marketing_companies')
        .update({ is_blocked: block, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toast({ title: block ? `${ids.length} company(s) blocked` : `${ids.length} company(s) unblocked` });
      clearCompanySelection();
      loadData();
    } catch (err: any) {
      toast({ title: 'Error updating companies', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkCompanyDelete = async () => {
    if (selectedCompanyIds.size === 0) return;
    if (!confirm(`Delete ${selectedCompanyIds.size} selected company(s) and their associated jobs? This cannot be undone.`)) return;
    const ids = Array.from(selectedCompanyIds);
    try {
      const { error } = await supabase.from('marketing_companies').delete().in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} company(s) deleted` });
      clearCompanySelection();
      loadData();
    } catch (err: any) {
      toast({ title: 'Error deleting companies', description: err.message, variant: 'destructive' });
    }
  };



  const loadData = useCallback(async (opts: { force?: boolean } = {}) => {
    // Freshness short-circuit: if we just loaded and nobody asked us to
    // bypass the cache, skip. Read via ref so the callback stays stable.
    if (!opts.force && lastUpdatedRef.current && Date.now() - lastUpdatedRef.current < FRESHNESS_MS) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // Refresh priority_score before reading. Recency drifts daily, so
      // a row written yesterday at 100 may be 75 today — the RPC fixes
      // every job in a single UPDATE. Awaited so the subsequent SELECT
      // sees fresh values; if the RPC fails (e.g. older DB without the
      // migration applied), we just log and let the client-side
      // priorityScore() fallback cover it.
      try {
        const { error: recErr } = await supabase.rpc('recompute_marketing_job_priorities');
        if (recErr) console.warn('recompute_marketing_job_priorities:', recErr.message);
      } catch (e) {
        console.warn('recompute_marketing_job_priorities exception:', (e as Error).message);
      }

      const results = await Promise.allSettled([
        supabase.from('marketing_jobs').select('*').order('priority_score', { ascending: false }),
        supabase.from('marketing_companies').select('*').order('open_roles_count', { ascending: false }),
        supabase.from('marketing_contacts').select('*').order('created_at', { ascending: false })
      ]);

      const jobsResult = results[0];
      const companiesResult = results[1];
      const contactsResult = results[2];

      if (jobsResult.status === 'fulfilled') {
        if (jobsResult.value.error) {
          console.warn('Error loading marketing_jobs:', jobsResult.value.error.message);
        } else {
          setJobs(jobsResult.value.data || []);
        }
      }

      if (companiesResult.status === 'fulfilled') {
        if (companiesResult.value.error) {
          console.warn('Error loading marketing_companies:', companiesResult.value.error.message);
        } else {
          setCompanies(companiesResult.value.data || []);
        }
      }

      if (contactsResult.status === 'fulfilled') {
        if (contactsResult.value.error) {
          console.warn('Error loading marketing_contacts:', contactsResult.value.error.message);
        } else {
          setContacts(contactsResult.value.data || []);
        }
      }

      const allFailed = results.every(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
      if (allFailed) {
        setLoadError('Unable to connect to the database. Please check your connection and try again.');
      } else {
        const t = Date.now();
        lastUpdatedRef.current = t;
        setLastUpdatedAt(t);
      }
    } catch (err: any) {
      console.error('Critical error loading data:', err);
      setLoadError(err.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExportMaster = () => {
    try {
      if (jobs.length === 0 && contacts.length === 0 && companies.length === 0) {
        toast({ title: 'No Data to Export', description: 'Load or import data before exporting.', variant: 'destructive' });
        return;
      }
      const filename = exportMasterSheet(jobs, contacts, companies);
      toast({ title: 'Download Started', description: `${filename} — check your downloads folder.` });
    } catch (err: any) {
      console.error('[Export] Master sheet error:', err);
      toast({ title: 'Export Error', description: err.message || 'Failed to generate the spreadsheet. Please try again.', variant: 'destructive' });
    }
  };

  const handleExportNewData = () => {
    try {
      const netNew = jobs.filter(j => j.is_net_new);
      const exportJobs = netNew.length > 0 ? netNew : jobs.slice(0, 10);
      if (exportJobs.length === 0) {
        toast({ title: 'No Data to Export', description: 'No jobs available to export.', variant: 'destructive' });
        return;
      }
      const filename = exportNewDataSheet(exportJobs);
      toast({ title: 'Download Started', description: `${filename} — check your downloads folder.` });
    } catch (err: any) {
      console.error('[Export] New data sheet error:', err);
      toast({ title: 'Export Error', description: err.message || 'Failed to generate the spreadsheet. Please try again.', variant: 'destructive' });
    }
  };


  // Toggle company high priority
  const handleToggleCompanyPriority = useCallback(async (companyId: string, currentPriority: boolean) => {
    setTogglingCompanyPriorityId(companyId);
    try {
      const { error } = await supabase
        .from('marketing_companies')
        .update({ is_high_priority: !currentPriority, updated_at: new Date().toISOString() })
        .eq('id', companyId);
      if (error) throw error;
      toast({ title: !currentPriority ? 'Marked as High Priority' : 'Priority removed' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error updating priority', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingCompanyPriorityId(null);
    }
  }, [toast, loadData]);

  // Auto-prioritize companies and jobs
  const handleAutoPrioritize = useCallback(async () => {
    setAutoPrioritizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-prioritize-jobs', {
        body: {}
      });
      if (error) throw error;
      if (data?.success) {
        setAutoPrioritizeResults(data);
        setShowAutoPrioritizeResults(true);
        toast({
          title: 'Auto-Prioritize Complete',
          description: `${data.summary.companiesMarkedHighPriority} companies and ${data.summary.jobsMarkedHighPriority} jobs marked as high priority`
        });
        await loadData();
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      toast({ title: 'Error auto-prioritizing', description: err.message, variant: 'destructive' });
    } finally {
      setAutoPrioritizing(false);
    }
  }, [toast, loadData]);

  // Company sort handler
  const handleCompanySort = (field: typeof companySortField) => {
    if (companySortField === field) {
      setCompanySortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCompanySortField(field);
      setCompanySortDir('asc');
    }
  };


  // Companies filter + sort
  const filteredCompanies = useMemo(() => {
    return companies
      .filter(c => {
        // Hide blocked companies unless the user opts in via the toggle.
        if (!showBlockedCompanies && c.is_blocked) return false;
        if (filterHighPriorityCompanies && !c.is_high_priority) return false;
        if (filterCompanyCategory.size > 0 && !filterCompanyCategory.has(c.company_type || '')) return false;
        if (!searchCompanies) return true;
        const s = searchCompanies.toLowerCase();
        return c.company_name?.toLowerCase().includes(s) ||
          c.company_type?.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        let aVal: any, bVal: any;
        switch (companySortField) {
          case 'company_name': aVal = a.company_name || ''; bVal = b.company_name || ''; break;
          case 'company_type': aVal = a.company_type || ''; bVal = b.company_type || ''; break;
          case 'open_roles_count': aVal = a.open_roles_count || 0; bVal = b.open_roles_count || 0; break;
          case 'contact_count': aVal = a.contact_count || 0; bVal = b.contact_count || 0; break;
          case 'is_high_priority': aVal = a.is_high_priority ? 1 : 0; bVal = b.is_high_priority ? 1 : 0; break;
          case 'has_md_cmo': aVal = a.has_md_cmo ? 1 : 0; bVal = b.has_md_cmo ? 1 : 0; break;
          default: aVal = ''; bVal = '';
        }
        if (typeof aVal === 'number') {
          return companySortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const cmp = aVal.toString().localeCompare(bVal.toString());
        return companySortDir === 'asc' ? cmp : -cmp;
      });
  }, [companies, searchCompanies, filterHighPriorityCompanies, filterCompanyCategory, showBlockedCompanies, companySortField, companySortDir]);

  const highPriorityCompanyCount = useMemo(() => companies.filter(c => c.is_high_priority).length, [companies]);

  // Company-name normalization for merge-candidate detection. Strips
  // generic corporate / healthcare suffixes iteratively until nothing
  // matches so "Devoted Health Services", "Devoted Medical Group", and
  // "Devoted Medical Services" all collapse to "devoted". A company
  // whose ENTIRE name is a generic suffix (e.g. "Medical Group" on its
  // own) is left alone so it doesn't become an empty-key magnet.
  const companyMergeCandidates = useMemo(() => {
    const COMPANY_SUFFIXES = [
      // Multi-word first (longest match wins)
      'health services', 'medical services', 'medical group', 'health group',
      'medical center', 'health center', 'health system', 'health systems',
      'medical associates', 'medical partners',
      // Single-word
      'healthcare', 'health', 'medical', 'hospital', 'clinic',
      'services', 'group', 'corp', 'corporation', 'incorporated', 'inc',
      'llc', 'ltd', 'pllc', 'associates', 'partners', 'enterprises',
      'holdings', 'systems', 'system', 'company', 'co', 'pa', 'pc',
    ].sort((a, b) => b.length - a.length);

    const normalize = (name: string): string => {
      let s = (name || '').toLowerCase().trim();
      if (!s) return '';
      s = s.replace(/[.,\-\(\)&'"\/]/g, ' ').replace(/\s+/g, ' ').trim();
      let changed = true;
      while (changed) {
        changed = false;
        for (const sfx of COMPANY_SUFFIXES) {
          if (s === sfx) return s; // don't strip to empty
          if (s.endsWith(' ' + sfx)) {
            s = s.slice(0, -(sfx.length + 1)).trim();
            changed = true;
            break;
          }
        }
      }
      return s;
    };

    // Per-company contact counts — contact_count on the row isn't always
    // populated, so derive from the loaded contacts array for the UI.
    const contactCountByCoId = new Map<string, number>();
    for (const ct of contacts) {
      if (!ct.company_id) continue;
      contactCountByCoId.set(ct.company_id, (contactCountByCoId.get(ct.company_id) || 0) + 1);
    }

    const groups = new Map<string, any[]>();
    for (const c of companies) {
      const key = normalize(c.company_name);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        ...c,
        _contact_count: c.contact_count ?? contactCountByCoId.get(c.id) ?? 0,
      });
    }
    return Array.from(groups.entries())
      .filter(([, items]) => items.length >= 2)
      .map(([key, items]) => ({
        key,
        items: items.slice().sort((a, b) => {
          // Sort members so the "best" canonical default lands first:
          // most open roles first, then most contacts, then shortest
          // name (more generic short name is often the canonical).
          const scoreA = (a.open_roles_count || 0) * 10 + (a._contact_count || 0);
          const scoreB = (b.open_roles_count || 0) * 10 + (b._contact_count || 0);
          if (scoreA !== scoreB) return scoreB - scoreA;
          return (a.company_name || '').length - (b.company_name || '').length;
        }),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [companies, contacts]);

  // Compute defaults for a group: top-sorted member is canonical, all
  // members are included. Used both to seed state when the dialog opens
  // and as a fallback inside the confirm handler when state hasn't been
  // populated yet (prevents silent no-ops when the user clicks Confirm
  // before React commits the seeding render).
  const defaultMergeSelection = (items: any[]) => ({
    canonicalId: items[0].id,
    includeIds: new Set(items.map(i => i.id)),
  });

  // Confirm the queued merges: for each group where the user left ≥ 2
  // rows checked (canonical + at least one merge), call the
  // merge_companies RPC. Results are accumulated for the summary.
  // The dialog renders whichever source is active: a manual group built
  // from the bulk-selection bar, or the auto-detected candidates.
  const activeMergeGroups = manualMergeGroup ? [manualMergeGroup] : companyMergeCandidates;

  // Seed mergeSelection for any group that doesn't have an entry yet
  // when the dialog opens (or when the set of active groups changes).
  // Uses useEffect rather than setState-during-render so the state is
  // reliably committed by the time the user clicks Confirm.
  useEffect(() => {
    if (!showMergeCandidates) return;
    setMergeSelection(prev => {
      let next = prev;
      let changed = false;
      for (const g of activeMergeGroups) {
        if (!next[g.key]) {
          if (!changed) { next = { ...prev }; changed = true; }
          next[g.key] = defaultMergeSelection(g.items);
        }
      }
      return changed ? next : prev;
    });
  }, [showMergeCandidates, activeMergeGroups]);

  const handleConfirmCompanyMerges = async () => {
    setMergingInFlight(true);
    const results: Array<{ group: string; ok: boolean; canonical_name?: string; jobs_moved?: number; contacts_moved?: number; companies_deleted?: number; fields_filled?: string[]; error?: string }> = [];
    for (const g of activeMergeGroups) {
      // Fall back to default selection if state wasn't populated yet
      // (React may not have committed the seed effect by the time the
      // user clicks Confirm). Keeps the bulk-select path from silently
      // no-op-ing when the user clicks fast.
      const sel = mergeSelection[g.key] || defaultMergeSelection(g.items);
      const mergeIds = Array.from(sel.includeIds).filter(id => id !== sel.canonicalId);
      if (mergeIds.length === 0) continue;
      try {
        const { data, error } = await supabase.rpc('merge_companies', {
          canonical_id: sel.canonicalId,
          merge_ids: mergeIds,
        });
        if (error) throw error;
        results.push({ group: g.key, ok: true, ...((data as any) || {}) });
      } catch (err: any) {
        results.push({ group: g.key, ok: false, error: err.message || String(err) });
      }
    }
    setMergingInFlight(false);
    setMergeResultSummary(results);
    const okResults = results.filter(r => r.ok);
    const failResults = results.filter(r => !r.ok);
    const totalFieldsFilled = okResults.reduce((n, r) => n + (r.fields_filled?.length || 0), 0);
    const totalJobsMoved = okResults.reduce((n, r) => n + (r.jobs_moved || 0), 0);
    const totalContactsMoved = okResults.reduce((n, r) => n + (r.contacts_moved || 0), 0);
    const totalDeleted = okResults.reduce((n, r) => n + (r.companies_deleted || 0), 0);
    toast({
      title: failResults.length === 0
        ? `Merged ${okResults.length} group${okResults.length === 1 ? '' : 's'}`
        : `Merged ${okResults.length}, ${failResults.length} failed`,
      description: failResults.length > 0
        ? failResults.map(r => r.error).join(' · ')
        : `${totalDeleted} compan${totalDeleted === 1 ? 'y' : 'ies'} deleted · ${totalJobsMoved} job${totalJobsMoved === 1 ? '' : 's'} and ${totalContactsMoved} contact${totalContactsMoved === 1 ? '' : 's'} reassigned${totalFieldsFilled > 0 ? ` · filled ${totalFieldsFilled} empty field${totalFieldsFilled === 1 ? '' : 's'} on canonicals` : ''}`,
      variant: failResults.length > 0 ? 'destructive' : undefined,
    });
    setShowMergeCandidates(false);
    setMergeSelection({});
    // Clear any manual selection that fed into this merge so the
    // bulk bar disappears and the auto-detected list is shown next time.
    setManualMergeGroup(null);
    clearCompanySelection();
    loadData();
  };

  // Derived LinkedIn URL per contact — the column reads from either the
  // explicit linkedin_url field or falls back to source_url when it looks
  // like a LinkedIn profile. Computed once here so sort + filter + table
  // render all agree on the same value.
  const getLinkedin = (c: any): string =>
    c.linkedin_url || (c.source_url && c.source_url.includes('linkedin.com/in/') ? c.source_url : '');

  // "Has data / No data" filter helper. Empty set or both options
  // selected means "no filter"; one option means restrict to that side.
  /** Map a contact's last_outreach_at to a bucket key the filter uses. */
  const outreachAgeBucket = (iso: string | null | undefined): string => {
    if (!iso) return 'Never';
    const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
    if (!Number.isFinite(days) || days < 0) return 'Never';
    if (days <= 3)  return '0-3 days';
    if (days <= 7)  return '4-7 days';
    if (days <= 14) return '8-14 days';
    if (days <= 30) return '15-30 days';
    return '30+ days';
  };
  const OUTREACH_AGE_OPTIONS = ['Never', '0-3 days', '4-7 days', '8-14 days', '15-30 days', '30+ days'];
  const OUTREACH_STATUS_OPTIONS = ['Never', 'Cold', 'Replied', 'Booked', 'Dead'];

  const presencePasses = (val: any, filter: Set<string>): boolean => {
    if (filter.size === 0 || filter.size === 2) return true;
    const has = !!(val && String(val).trim());
    if (filter.has('Has data') && has) return true;
    if (filter.has('No data') && !has) return true;
    return false;
  };

  // Unique-value options for the multi-select filter dropdowns. Date
  // Added is rounded to a YYYY-MM-DD key so the filter shows one entry
  // per calendar day instead of one per contact.
  const uniqueContactFirstNames = useMemo(() =>
    Array.from(new Set(contacts.map(c => c.first_name).filter(Boolean))).sort(), [contacts]);
  const uniqueContactLastNames = useMemo(() =>
    Array.from(new Set(contacts.map(c => c.last_name).filter(Boolean))).sort(), [contacts]);
  const uniqueContactCompanies = useMemo(() =>
    Array.from(new Set(contacts.map(c => c.company_name).filter(Boolean))).sort(), [contacts]);
  const uniqueContactTitles = useMemo(() =>
    Array.from(new Set(contacts.map(c => c.title).filter(Boolean))).sort(), [contacts]);
  const uniqueContactSourceValues = useMemo(() =>
    Array.from(new Set(contacts.map(c => c.source).filter(Boolean))).sort(), [contacts]);
  // Date key for filtering: a "Month Day, Year" string (e.g. "Apr 14,
  // 2026") so the dropdown shows human-readable dates and the filter
  // comparison is straight equality. Internally we also keep an ISO
  // sort key so the dropdown orders most-recent first.
  const formatDateKey = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const uniqueContactDates = useMemo(() => {
    const pairs: { label: string; iso: string }[] = [];
    const seen = new Set<string>();
    for (const c of contacts) {
      if (!c.created_at) continue;
      const iso = new Date(c.created_at).toISOString().slice(0, 10);
      if (seen.has(iso)) continue;
      seen.add(iso);
      pairs.push({ label: formatDateKey(c.created_at), iso });
    }
    pairs.sort((a, b) => b.iso.localeCompare(a.iso));
    return pairs.map(p => p.label);
  }, [contacts]);
  const PRESENCE_OPTIONS = ['Has data', 'No data'];

  // Contact merge candidates: contacts sharing the same first + last
  // name (case-insensitive). Same shape as companyMergeCandidates so
  // the merge dialog can render either with the same pattern. Ordered
  // biggest group first; within each group, top-sorted item is the
  // canonical default (most recent, with a preference for rows that
  // have richer data).
  const contactMergeCandidates = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const c of contacts) {
      const fn = (c.first_name || '').toLowerCase().trim();
      const ln = (c.last_name || '').toLowerCase().trim();
      if (!fn && !ln) continue;
      const key = `${fn}|${ln}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    const richness = (c: any) => {
      let s = 0;
      if (c.email) s++;
      if (c.phone_work || c.phone_home || c.phone_cell) s++;
      if (c.linkedin_url) s++;
      if (c.title) s++;
      if (c.company_name) s++;
      if (c.is_verified) s += 2;
      return s;
    };
    return Array.from(groups.entries())
      .filter(([, items]) => items.length >= 2)
      .map(([key, items]) => ({
        key,
        items: items.slice().sort((a, b) => {
          const rd = richness(b) - richness(a);
          if (rd !== 0) return rd;
          return (b.created_at || '').localeCompare(a.created_at || '');
        }),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [contacts]);

  const activeContactMergeGroups = contactManualMergeGroup ? [contactManualMergeGroup] : contactMergeCandidates;

  // Seed contact merge selection when the dialog opens (mirror of the
  // company-merge useEffect pattern; avoids setState-during-render
  // races so a fast Confirm click doesn't silently no-op).
  useEffect(() => {
    if (!showContactMerge) return;
    setContactMergeSelection(prev => {
      let next = prev;
      let changed = false;
      for (const g of activeContactMergeGroups) {
        if (!next[g.key]) {
          if (!changed) { next = { ...prev }; changed = true; }
          next[g.key] = defaultMergeSelection(g.items);
        }
      }
      return changed ? next : prev;
    });
  }, [showContactMerge, activeContactMergeGroups]);

  // Contact priority = the highest priority_score among open jobs at the
  // contact's company. Cached per company so we don't iterate all jobs
  // for every contact row. Falls back to a client-side compute when the
  // DB hasn't backfilled yet.
  const contactPriorityByCompany = useMemo(() => {
    const m = new Map<string, number>();
    const isOpen = (j: any) => j.is_active !== false && !j.archived && !j.is_blocked;
    const companyTypeById = new Map<string, string>();
    const companyTypeByName = new Map<string, string>();
    for (const co of companies) {
      if (co?.id && co.company_type) companyTypeById.set(co.id, co.company_type);
      if (co?.company_name && co.company_type) {
        companyTypeByName.set(String(co.company_name).toLowerCase().trim(), co.company_type);
      }
    }
    for (const j of jobs) {
      if (!isOpen(j)) continue;
      const ct = (j.company_id && companyTypeById.get(j.company_id)) ||
        (j.company_name && companyTypeByName.get(String(j.company_name).toLowerCase().trim())) ||
        null;
      const score = typeof j.priority_score === 'number'
        ? j.priority_score
        : priorityScore({ datePosted: j.date_posted, lastSeenAt: j.last_seen_at, createdAt: j.created_at, jobTitle: j.job_title, companyType: ct, description: j.description }).total;
      const keys: string[] = [];
      if (j.company_id) keys.push(`id:${j.company_id}`);
      if (j.company_name) keys.push(`name:${String(j.company_name).toLowerCase().trim()}`);
      for (const k of keys) {
        const prev = m.get(k);
        if (prev === undefined || score > prev) m.set(k, score);
      }
    }
    return m;
  }, [jobs, companies]);

  const priorityForContact = (c: any): number | null => {
    if (c.company_id) {
      const v = contactPriorityByCompany.get(`id:${c.company_id}`);
      if (typeof v === 'number') return v;
    }
    if (c.company_name) {
      const v = contactPriorityByCompany.get(`name:${String(c.company_name).toLowerCase().trim()}`);
      if (typeof v === 'number') return v;
    }
    return null;
  };

  // Contacts filter + sort
  const filteredContacts = useMemo(() => {
    const s = searchContacts.toLowerCase();
    const list = contacts.filter(c => {
      if (s) {
        const matches = (c.company_name || '').toLowerCase().includes(s) ||
          (c.first_name || '').toLowerCase().includes(s) ||
          (c.last_name || '').toLowerCase().includes(s) ||
          (c.title || '').toLowerCase().includes(s) ||
          (c.email || '').toLowerCase().includes(s);
        if (!matches) return false;
      }
      if (filterFirstName.size > 0 && !filterFirstName.has(c.first_name || '')) return false;
      if (filterLastName.size > 0 && !filterLastName.has(c.last_name || '')) return false;
      if (filterContactCompany.size > 0 && !filterContactCompany.has(c.company_name || '')) return false;
      if (filterContactTitle.size > 0 && !filterContactTitle.has(c.title || '')) return false;
      if (filterContactSource.size > 0 && !filterContactSource.has(c.source || '')) return false;
      if (filterDateAdded.size > 0) {
        const key = c.created_at ? formatDateKey(c.created_at) : '';
        if (!filterDateAdded.has(key)) return false;
      }
      if (!presencePasses(c.email, filterEmailPresence)) return false;
      if (!presencePasses(c.phone_work, filterPhoneWorkPresence)) return false;
      if (!presencePasses(c.phone_home, filterPhoneHomePresence)) return false;
      if (!presencePasses(c.phone_cell, filterPhoneCellPresence)) return false;
      if (!presencePasses(getLinkedin(c), filterLinkedInPresence)) return false;
      if (filterConfidence.size > 0 && !filterConfidence.has(String(c.confidence_score ?? 0))) return false;
      // Outreach status — 'Never' is the synthetic key for null status.
      if (filterOutreachStatus.size > 0) {
        const statusKey = c.outreach_status || 'Never';
        if (!filterOutreachStatus.has(statusKey)) return false;
      }
      if (filterOutreachAge.size > 0) {
        if (!filterOutreachAge.has(outreachAgeBucket(c.last_outreach_at))) return false;
      }
      // "What's new since last visit" — applies if the toggle is on.
      if (newSinceLastVisit) {
        const t = c.created_at ? new Date(c.created_at).getTime() : 0;
        if (!t || t <= previousVisitRef.current) return false;
      }
      // "Any phone" cross-column check: filter option labels map to
      // presence semantics — Has data = any of the 3 phones populated,
      // No data = all 3 empty.
      if (filterAnyPhonePresence.size === 1) {
        const anyPhone = (c.phone_work || c.phone_home || c.phone_cell || '').toString().trim();
        if (filterAnyPhonePresence.has('Has data') && !anyPhone) return false;
        if (filterAnyPhonePresence.has('No data') && anyPhone) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (contactSortField) {
        case 'priority_score': {
          // Same lookup the badge column uses — max open-job score at
          // the contact's company. Nulls sort last in desc order.
          const ap = priorityForContact(a);
          const bp = priorityForContact(b);
          aVal = ap === null ? -Infinity : ap;
          bVal = bp === null ? -Infinity : bp;
          break;
        }
        case 'first_name': aVal = (a.first_name || '').toLowerCase(); bVal = (b.first_name || '').toLowerCase(); break;
        case 'last_name': aVal = (a.last_name || '').toLowerCase(); bVal = (b.last_name || '').toLowerCase(); break;
        case 'company_name': aVal = (a.company_name || '').toLowerCase(); bVal = (b.company_name || '').toLowerCase(); break;
        case 'title': aVal = (a.title || '').toLowerCase(); bVal = (b.title || '').toLowerCase(); break;
        case 'email': aVal = (a.email || '').toLowerCase(); bVal = (b.email || '').toLowerCase(); break;
        case 'phone_work': aVal = (a.phone_work || ''); bVal = (b.phone_work || ''); break;
        case 'phone_home': aVal = (a.phone_home || ''); bVal = (b.phone_home || ''); break;
        case 'phone_cell': aVal = (a.phone_cell || ''); bVal = (b.phone_cell || ''); break;
        case 'source': aVal = (a.source || '').toLowerCase(); bVal = (b.source || '').toLowerCase(); break;
        case 'created_at': aVal = a.created_at ? new Date(a.created_at).getTime() : 0; bVal = b.created_at ? new Date(b.created_at).getTime() : 0; break;
        case 'linkedin_url': aVal = getLinkedin(a).toLowerCase(); bVal = getLinkedin(b).toLowerCase(); break;
        case 'confidence_score': aVal = Number(a.confidence_score ?? 0); bVal = Number(b.confidence_score ?? 0); break;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return contactSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return contactSortDir === 'asc' ? cmp : -cmp;
    });
  }, [contacts, searchContacts, contactSortField, contactSortDir,
      filterFirstName, filterLastName, filterContactCompany, filterContactTitle,
      filterContactSource, filterDateAdded, filterEmailPresence,
      filterPhoneWorkPresence, filterPhoneHomePresence, filterPhoneCellPresence,
      filterLinkedInPresence, filterAnyPhonePresence, filterConfidence,
      filterOutreachStatus, filterOutreachAge, newSinceLastVisit,
      contactPriorityByCompany]);

  // Options shown in the Confidence column's filter popover. Stringified
  // numbers so MultiSelectColumnHeader's string-Set matches our scores.
  const CONFIDENCE_OPTIONS = ['5', '4', '3', '2', '1', '0'];

  // Tab-bar headline counts apply the same scoping the Tracker uses so
  // Jobs / Companies / Contacts all describe the same active universe:
  //   eligibleOpenJobs = open jobs at a non-blocked company that exists
  //                      in the companies list (drops orphans + blocked).
  //   companiesWithOpenJobs = the distinct companies that own at least
  //                           one of those jobs.
  //   contactsForActiveCompanies = contacts whose company has ≥1 of
  //                                those jobs.
  const eligibleOpenJobs = useMemo(() => {
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const co of companies) {
      if (co?.id) byId.set(co.id, co);
      if (co?.company_name) byName.set(String(co.company_name).toLowerCase().trim(), co);
    }
    return jobs.filter(j => {
      if (j.is_closed || j.status === 'Closed') return false;
      const co = (j.company_id && byId.get(j.company_id)) ||
                 (j.company_name && byName.get(String(j.company_name).toLowerCase().trim())) ||
                 null;
      if (!co) return false;            // orphan — no matching company
      if (co.is_blocked) return false;  // blocked-company job
      return true;
    });
  }, [jobs, companies]);

  const activeCompanyKeys = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const j of eligibleOpenJobs) {
      if (j.company_id) ids.add(String(j.company_id));
      if (j.company_name) names.add(String(j.company_name).toLowerCase().trim());
    }
    return { ids, names };
  }, [eligibleOpenJobs]);

  const companiesWithOpenJobs = useMemo(() => {
    return companies.filter(c => {
      if (c?.id && activeCompanyKeys.ids.has(String(c.id))) return true;
      if (c?.company_name && activeCompanyKeys.names.has(String(c.company_name).toLowerCase().trim())) return true;
      return false;
    });
  }, [companies, activeCompanyKeys]);

  const contactsForActiveCompanies = useMemo(() => {
    return contacts.filter(c => {
      if (c?.company_id && activeCompanyKeys.ids.has(String(c.company_id))) return true;
      if (c?.company_name && activeCompanyKeys.names.has(String(c.company_name).toLowerCase().trim())) return true;
      return false;
    });
  }, [contacts, activeCompanyKeys]);

  const openJobsCount = eligibleOpenJobs.length;
  const closedJobsCount = jobs.filter(j => j.is_closed || j.status === 'Closed').length;
  const highPriorityCount = companies.filter(c => c.is_high_priority).length;
  const highPriorityJobsCount = eligibleOpenJobs.filter(j => j.high_priority).length;
  const crelateCount = contacts.filter(c => c.source === 'Crelate ATS').length;

  // Company sort icon helper
  const CompanySortIcon = ({ field }: { field: typeof companySortField }) => {
    if (companySortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 flex-shrink-0" />;
    return companySortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />
      : <ArrowDown className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />;
  };



  const categoryBadge = (cat: string) => {
    const colors: Record<string, string> = {
      'Value Based Care (VBC)': 'bg-blue-100 text-blue-800',
      'ACO': 'bg-cyan-100 text-cyan-800',
      'PACE Medical Groups': 'bg-purple-100 text-purple-800',
      'Health Plans': 'bg-green-100 text-green-800',
      'Health Systems': 'bg-orange-100 text-orange-800',
      'Hospitals': 'bg-red-100 text-red-800',
      'FQHC': 'bg-teal-100 text-teal-800',
      'All Others': 'bg-gray-100 text-gray-800'
    };
    return colors[cat] || 'bg-gray-100 text-gray-800';
  };

  const sourceBadge = (source: string) => {
    if (source === 'Crelate ATS') return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
    if (source === 'LinkedIn') return 'bg-sky-100 text-sky-800 border border-sky-200';
    if (source === 'About/Team Page') return 'bg-teal-100 text-teal-800 border border-teal-200';
    if (source?.includes('Sweep')) return 'bg-violet-100 text-violet-800 border border-violet-200';
    if (source?.includes('AI')) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    return 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  const sourceIcon = (source: string) => {
    if (source === 'Crelate ATS') return <Database className="w-3 h-3" />;
    if (source === 'LinkedIn') return <Linkedin className="w-3 h-3" />;
    if (source === 'About/Team Page') return <Globe className="w-3 h-3" />;
    if (source?.includes('AI')) return <Globe className="w-3 h-3" />;
    return <Users className="w-3 h-3" />;
  };

  const buildCompanyJobsSearch = (companyName: string) => {
    const q = encodeURIComponent(`${companyName} healthcare jobs`);
    return `https://www.google.com/search?q=${q}&ibp=htl;jobs`;
  };

  const getVerifiedContactUrl = (c: any): { url: string; label: string; type: 'crelate' | 'linkedin' | 'website' | 'none' } => {
    if (c.source === 'Crelate ATS' && c.crelate_contact_id) {
      const url = `https://app.crelate.com/go#stage/_Contacts/DefaultView/${c.crelate_contact_id}/summary`;
      return { url, label: 'Open in Crelate', type: 'crelate' };
    }
    if (c.source_url && c.source_url.startsWith('http')) {
      const isFabricatedSearch = c.source_url.includes('/search/results/') || 
                                  c.source_url.includes('?q=') ||
                                  c.source_url.includes('&keywords=') ||
                                  c.source_url.includes('ibp=htl');
      if (!isFabricatedSearch) {
        if (c.source_url.includes('linkedin.com/in/')) {
          return { url: c.source_url, label: 'LinkedIn Profile', type: 'linkedin' };
        }
        return { url: c.source_url, label: 'View Source', type: 'website' };
      }
    }
    if (c.crelate_url && c.crelate_url.includes('crelate.com/go#stage')) {
      return { url: c.crelate_url, label: 'Open in Crelate', type: 'crelate' };
    }
    return { url: '', label: 'No verified link', type: 'none' };
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-600 hover:text-[#911406]">
            <ArrowLeft className="w-4 h-4 mr-1" /> Home
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Healthcare Recruiting Tracker</h1>
            <p className="text-xs text-gray-500">Structured healthcare recruiting intelligence engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button

            variant="outline"
            size="sm"
            onClick={() => setShowPushToCrelate(true)}
            disabled={companies.length === 0 && contacts.length === 0 && jobs.length === 0}
            className="gap-1.5 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
            title="Push companies, contacts, and jobs to Crelate ATS"
          >
            <Send className="w-4 h-4" /> Push to Crelate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportTool(true)}
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Upload className="w-4 h-4" /> Import Data
          </Button>
          <div className="h-6 w-px bg-gray-200" />
          <Button variant="outline" size="sm" onClick={() => navigate('/admin')} className="text-gray-600 hover:text-blue-700 gap-1.5">
            <Settings className="w-4 h-4" /> Settings
          </Button>
        </div>
      </div>

      {/* Stats Bar */}


      <div className="bg-white border-b px-6 py-3 flex gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span className="font-semibold">{openJobsCount}</span> Open Jobs
        </div>
        <div className="flex items-center gap-2 text-sm">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="font-semibold">{closedJobsCount}</span> Closed
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4 text-purple-600" />
          <span className="font-semibold">{companies.length}</span> Companies
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-green-600" />
          <span className="font-semibold">{contacts.length}</span> Contacts
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-amber-500" />
          <span className="font-semibold">{highPriorityCount}</span> Priority Co.
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-yellow-500" />
          <span className="font-semibold">{highPriorityJobsCount}</span> Priority Jobs
        </div>

      </div>

      {/* Error Banner */}
      {loadError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="text-red-700 border-red-300 hover:bg-red-100 gap-1.5"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="bg-white border border-gray-200 shadow-sm w-fit mb-4">
            <TabsTrigger value="tracker" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Shield className="w-4 h-4" />Tracker
            </TabsTrigger>
            <TabsTrigger value="jobs" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Briefcase className="w-4 h-4" />Jobs ({openJobsCount})

            </TabsTrigger>
            <TabsTrigger value="companies" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Building2 className="w-4 h-4" />Companies ({companiesWithOpenJobs.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Users className="w-4 h-4" />Contacts ({contactsForActiveCompanies.length})
            </TabsTrigger>
          </TabsList>

          {/* TRACKER TAB */}
          <TabsContent value="tracker" className="flex-1 mt-0 space-y-4">
            {/* Crelate Sync Status Dashboard */}
            <CrelateSyncStatus
              companies={companies}
              contacts={contacts}
              jobs={jobs}
            />
            <TrackerControls
              onComplete={loadData}
              onExportMaster={handleExportMaster}
              onExportNewData={handleExportNewData}
              jobs={jobs}
              companies={companies}
              contacts={contacts}
              loading={loading}
            />
          </TabsContent>


          {/* JOBS TAB */}
          <TabsContent value="jobs" className="flex-1 mt-0">
            <JobsTabContent
              jobs={jobs}
              companies={companies}
              loading={loading}
              onRefresh={loadData}
            />
          </TabsContent>

          {/* COMPANIES TAB */}
          <TabsContent value="companies" className="flex-1 mt-0">
            <div className="bg-white rounded-xl border shadow-sm flex flex-col">
              <div className="bg-purple-50 border-b border-purple-100 px-4 py-2.5 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span className="text-xs text-purple-700">
                  <strong>Jobs Page</strong> links go to verified careers pages when available, or Google Jobs search for that company. Click the star to toggle high priority.
                </span>
              </div>
              {/* Toolbar */}
              <div className="p-4 border-b flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search companies..." value={searchCompanies} onChange={e => setSearchCompanies(e.target.value)} className="pl-9" />
                </div>

                {/* High Priority Quick Filter */}
                <button
                  onClick={() => setFilterHighPriorityCompanies(prev => !prev)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium transition-all ${
                    filterHighPriorityCompanies
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-400 shadow-sm ring-1 ring-yellow-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-300'
                  }`}
                  title={filterHighPriorityCompanies ? 'Show all companies' : 'Show only high priority companies'}
                >
                  <Star
                    className="w-3.5 h-3.5"
                    fill={filterHighPriorityCompanies ? 'currentColor' : 'none'}
                    strokeWidth={filterHighPriorityCompanies ? 0 : 1.5}
                  />
                  High Priority
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    filterHighPriorityCompanies
                      ? 'bg-yellow-200 text-yellow-900'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {highPriorityCompanyCount}
                  </span>
                </button>

                <span className="text-sm text-gray-500">
                  {filteredCompanies.length} of {companies.length} companies
                  {(() => {
                    const hidden = companies.filter(c => c.is_blocked).length;
                    return hidden > 0 && !showBlockedCompanies ? (
                      <span className="text-gray-400"> ({hidden} blocked hidden)</span>
                    ) : null;
                  })()}
                </span>

                {/* Show / Hide Blocked toggle */}
                <button
                  type="button"
                  onClick={() => setShowBlockedCompanies(s => !s)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                  title={showBlockedCompanies ? 'Hide blocked companies' : 'Show blocked companies'}
                >
                  {showBlockedCompanies ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showBlockedCompanies ? 'Hide blocked' : 'Show blocked'}
                </button>

                {/* Auto-Prioritize Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoPrioritize}
                  disabled={autoPrioritizing || companies.length === 0}
                  className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400"
                  title="Auto-detect high priority companies (VBC or 10+ openings) and jobs (Medical Director/CMO or from priority companies)"
                >
                  {autoPrioritizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {autoPrioritizing ? 'Analyzing...' : 'Auto-Prioritize'}
                </Button>

                {/* Merge Candidates — groups companies by normalized
                    name prefix so obvious dupes can be collapsed. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMergeSelection({});
                    setMergeResultSummary(null);
                    setShowMergeCandidates(true);
                  }}
                  disabled={companyMergeCandidates.length === 0}
                  className="gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-400"
                  title={companyMergeCandidates.length === 0
                    ? 'No merge candidates detected'
                    : `${companyMergeCandidates.length} group${companyMergeCandidates.length === 1 ? '' : 's'} of similar company names detected`}
                >
                  <GitMerge className="w-4 h-4" />
                  Search and Merge Companies{companyMergeCandidates.length > 0 ? ` (${companyMergeCandidates.length})` : ''}
                </Button>
              </div>

              {/* Bulk action bar - visible only when 1+ rows selected */}
              {selectedCompanyIds.size > 0 && (
                <div className="px-4 py-2 border-b bg-amber-50 border-amber-200 flex items-center gap-2">
                  <span className="text-sm font-medium text-amber-900">
                    {selectedCompanyIds.size} selected
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        // Build a manual merge group from the selection
                        // and open the merge dialog. Dialog reuses the
                        // canonical-picker + RPC path already used for
                        // auto-detected candidates.
                        const selected = companies.filter(c => selectedCompanyIds.has(c.id));
                        if (selected.length < 2) return;
                        const contactCountByCoId = new Map<string, number>();
                        for (const ct of contacts) {
                          if (!ct.company_id) continue;
                          contactCountByCoId.set(ct.company_id, (contactCountByCoId.get(ct.company_id) || 0) + 1);
                        }
                        const items = selected
                          .map(c => ({ ...c, _contact_count: c.contact_count ?? contactCountByCoId.get(c.id) ?? 0 }))
                          .sort((a, b) => {
                            const scoreA = (a.open_roles_count || 0) * 10 + (a._contact_count || 0);
                            const scoreB = (b.open_roles_count || 0) * 10 + (b._contact_count || 0);
                            if (scoreA !== scoreB) return scoreB - scoreA;
                            return (a.company_name || '').length - (b.company_name || '').length;
                          });
                        setManualMergeGroup({ key: 'manual-selection', items });
                        setMergeSelection({});
                        setShowMergeCandidates(true);
                      }}
                      disabled={selectedCompanyIds.size < 2}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-purple-300 bg-white hover:bg-purple-50 text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={selectedCompanyIds.size < 2 ? 'Select at least two companies to merge' : 'Merge the selected companies — pick a canonical; others are merged into it'}
                    >
                      <GitMerge className="w-3.5 h-3.5" /> Merge
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkCompanyBlock(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-200 bg-white hover:bg-red-50 text-red-700"
                      title="Block selected from future scraper runs"
                    >
                      <Ban className="w-3.5 h-3.5" /> Block
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkCompanyBlock(false)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                      title="Unblock selected"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Unblock
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkCompanyDelete}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-200 bg-white hover:bg-red-50 text-red-700"
                      title="Delete selected permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                    <button
                      type="button"
                      onClick={clearCompanySelection}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded text-gray-500 hover:bg-amber-100"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="text-center px-2 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[36px]">
                        <input
                          type="checkbox"
                          checked={filteredCompanies.length > 0 && filteredCompanies.every(c => selectedCompanyIds.has(c.id))}
                          onChange={() => {
                            const allSelected = filteredCompanies.length > 0 && filteredCompanies.every(c => selectedCompanyIds.has(c.id));
                            if (allSelected) setSelectedCompanyIds(new Set());
                            else setSelectedCompanyIds(new Set(filteredCompanies.map(c => c.id)));
                          }}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406] cursor-pointer"
                          title="Select / deselect all visible"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('company_name')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Company <CompanySortIcon field="company_name" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 relative select-none">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleCompanySort('company_type')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                            Category <CompanySortIcon field="company_type" />
                          </button>
                          <Popover open={companyCategoryFilterOpen} onOpenChange={setCompanyCategoryFilterOpen}>
                            <PopoverTrigger asChild>
                              <button
                                className={`p-0.5 rounded transition-colors ml-0.5 ${filterCompanyCategory.size > 0 ? 'text-[#911406] bg-red-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                title={`Filter by Category${filterCompanyCategory.size > 0 ? ` (${filterCompanyCategory.size} selected)` : ''}`}
                              >
                                <Filter className="w-3 h-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              sideOffset={4}
                              className="p-0 w-[260px] max-h-[420px] flex flex-col border-gray-200"
                              onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                              <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Filter by Category</p>
                                {filterCompanyCategory.size > 0 && (
                                  <span className="text-[10px] text-[#911406] font-semibold">{filterCompanyCategory.size} selected</span>
                                )}
                              </div>
                              <div className="py-1 overflow-y-auto flex-1">
                                {COMPANY_CATEGORY_OPTIONS.map(opt => {
                                  const checked = filterCompanyCategory.has(opt);
                                  return (
                                    <label
                                      key={opt}
                                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 cursor-pointer ${checked ? 'bg-red-50/50 text-[#911406] font-medium' : 'text-gray-700'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = new Set(filterCompanyCategory);
                                          if (next.has(opt)) next.delete(opt);
                                          else next.add(opt);
                                          setFilterCompanyCategory(next);
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30 cursor-pointer"
                                      />
                                      <span className="truncate flex-1">{opt}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between gap-2 bg-gray-50/50">
                                <button
                                  onClick={() => setFilterCompanyCategory(new Set(COMPANY_CATEGORY_OPTIONS))}
                                  className="text-[11px] text-gray-600 hover:text-[#911406] font-medium"
                                >
                                  Select all
                                </button>
                                <button
                                  onClick={() => setFilterCompanyCategory(new Set())}
                                  className="text-[11px] text-gray-600 hover:text-[#911406] font-medium disabled:opacity-40"
                                  disabled={filterCompanyCategory.size === 0}
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setCompanyCategoryFilterOpen(false)}
                                  className="text-[11px] text-white bg-[#911406] hover:bg-[#7a1005] px-2.5 py-1 rounded font-medium"
                                >
                                  Done
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          {filterCompanyCategory.size > 0 && (
                            <>
                              <span className="text-[10px] font-semibold text-[#911406] bg-red-50 px-1 rounded tabular-nums">{filterCompanyCategory.size}</span>
                              <button
                                onClick={() => setFilterCompanyCategory(new Set())}
                                className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Clear filter"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold">Find Open Jobs</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('open_roles_count')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Open Roles <CompanySortIcon field="open_roles_count" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('contact_count')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Contacts <CompanySortIcon field="contact_count" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 w-[80px]">
                        <button onClick={() => handleCompanySort('is_high_priority')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Priority <CompanySortIcon field="is_high_priority" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('has_md_cmo')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          MD/CMO <CompanySortIcon field="has_md_cmo" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[140px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className="text-center py-16">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400 mb-2" />
                        <span className="text-sm text-gray-400">Loading companies...</span>
                      </td></tr>
                    ) : filteredCompanies.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-16">
                        <div className="text-gray-400">
                          {searchCompanies || filterHighPriorityCompanies ? (
                            <>
                              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              <p className="text-sm font-medium">No companies match your filters</p>
                              <button onClick={() => { setSearchCompanies(''); setFilterHighPriorityCompanies(false); }} className="text-xs text-[#911406] hover:underline mt-1">Clear filters</button>
                            </>
                          ) : (
                            <p className="text-sm font-medium">No companies found</p>
                          )}
                        </div>
                      </td></tr>
                    ) : filteredCompanies.map((c, idx) => {
                      const hasOpenRoles = (c.open_roles_count || 0) > 0;
                      const hasVerifiedCareers = c.careers_url &&
                        c.careers_url.startsWith('http') &&
                        !c.careers_url.includes('google.com/search') &&
                        !c.careers_url.includes('indeed.com/jobs') &&
                        !c.careers_url.includes('linkedin.com/jobs') &&
                        !c.careers_url.includes('?q=') &&
                        !c.careers_url.includes('&keywords=');
                      const isSelected = selectedCompanyIds.has(c.id);
                      const blocked = !!c.is_blocked;

                      return (
                        <tr key={c.id} data-mp-company-id={c.id} className={`border-b transition-colors ${blocked ? 'bg-gray-100 opacity-60' : isSelected ? 'bg-amber-50 hover:bg-amber-100/50' : (c.is_high_priority ? 'bg-amber-50/50 hover:bg-amber-100/50' : !hasOpenRoles ? 'opacity-60 hover:bg-gray-50' : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50')}`}>
                          <td className="px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCompanySelect(c.id)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406] cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{c.company_name}</div>
                          </td>
                          <td className="px-4 py-3">
                            {editingCompanyTypeId === c.id ? (
                              <select
                                autoFocus
                                // If the stored value doesn't match any option, start blank
                                // and force the user to make an explicit choice. Without this
                                // the browser silently shows the first option as "selected"
                                // but onChange never fires, so closing the dropdown doesn't save.
                                value={COMPANY_CATEGORY_OPTIONS.includes(c.company_type || '') ? c.company_type : ''}
                                onChange={e => { if (e.target.value) handleSaveCompanyType(c.id, e.target.value); }}
                                onBlur={() => setEditingCompanyTypeId(null)}
                                className="text-xs border border-[#911406] rounded px-2 py-1 bg-white focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
                              >
                                <option value="" disabled>Select category…</option>
                                {COMPANY_CATEGORY_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingCompanyTypeId(c.id)}
                                className={`text-xs px-2 py-0.5 rounded-full cursor-pointer hover:ring-1 hover:ring-[#911406]/30 ${categoryBadge(c.company_type)}`}
                                title="Click to change category"
                              >
                                {c.company_type || '-'}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {hasOpenRoles ? (
                              <div className="flex items-center gap-2">
                                <a
                                  href={buildCompanyJobsSearch(c.company_name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors font-medium"
                                  title={`Search Google Jobs for ${c.company_name} open positions`}
                                >
                                  <Globe className="w-3 h-3" />
                                  Search Jobs
                                </a>
                                {hasVerifiedCareers && (
                                  <a
                                    href={c.careers_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-medium"
                                    title={`Visit ${c.company_name} careers page`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Careers Page
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Unlink className="w-3 h-3" />
                                No open roles
                              </span>
                            )}
                          </td>
                          <td className="text-center px-4 py-3">
                            <span className={`font-semibold ${hasOpenRoles ? 'text-gray-900' : 'text-gray-400'}`}>
                              {c.open_roles_count || 0}
                            </span>
                          </td>
                          <td className="text-center px-4 py-3">{c.contact_count || 0}</td>
                          {/* Clickable Priority Star */}
                          <td className="text-center px-4 py-3">
                            <button
                              onClick={() => handleToggleCompanyPriority(c.id, !!c.is_high_priority)}
                              disabled={togglingCompanyPriorityId === c.id}
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                                c.is_high_priority
                                  ? 'text-yellow-500 hover:text-yellow-600'
                                  : 'text-gray-300 hover:text-yellow-400'
                              }`}
                              title={c.is_high_priority ? 'Remove high priority' : 'Mark as high priority'}
                            >
                              {togglingCompanyPriorityId === c.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Star
                                  className="w-5 h-5"
                                  fill={c.is_high_priority ? 'currentColor' : 'none'}
                                  strokeWidth={c.is_high_priority ? 0 : 1.5}
                                />
                              )}
                            </button>
                          </td>
                          <td className="text-center px-4 py-3">
                            {c.has_md_cmo ? <CheckCircle className="w-4 h-4 text-green-600 mx-auto" /> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="text-center px-4 py-3">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleFindContacts({ mode: 'company', companyId: c.id, companyName: c.company_name })}
                                disabled={contactRunIsActive || findingContactsForId === c.id}
                                className="inline-flex items-center justify-center p-1.5 rounded text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                                title={`Find more hiring contacts at ${c.company_name} (AI + Crelate)`}
                              >
                                {(findingContactsForId === c.id) || (contactRunIsActive && contactRun?.target_company_id === c.id)
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Users className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => openEditCompany(c)}
                                className="inline-flex items-center justify-center p-1.5 rounded text-blue-600 hover:bg-blue-50"
                                title="Edit company record (all fields)"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleCompanyBlock(c.id, blocked)}
                                className={`inline-flex items-center justify-center p-1.5 rounded ${blocked ? 'text-gray-600 hover:bg-gray-200' : 'text-red-600 hover:bg-red-50'}`}
                                title={blocked ? 'Unblock (allow scraper to discover jobs at this company)' : 'Block from future scraper runs'}
                              >
                                {blocked ? <RotateCcw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Auto-Prioritize Results Dialog */}
            {showAutoPrioritizeResults && autoPrioritizeResults && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[80vh] flex flex-col">
                  <div className="p-6 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Auto-Prioritize Complete</h3>
                        <p className="text-sm text-gray-500">
                          Analyzed {autoPrioritizeResults.summary.totalCompanies} companies and {autoPrioritizeResults.summary.totalJobs} jobs
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <Building2 className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-amber-700">{autoPrioritizeResults.summary.companiesMarkedHighPriority}</p>
                        <p className="text-xs text-amber-600 font-medium">Companies Marked</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <Briefcase className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-amber-700">{autoPrioritizeResults.summary.jobsMarkedHighPriority}</p>
                        <p className="text-xs text-amber-600 font-medium">Jobs Marked</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 mb-4">
                      <p className="font-semibold mb-1">Criteria Used:</p>
                      <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                        <li><strong>Companies:</strong> Value Based Care (VBC) category OR 10+ open roles</li>
                        <li><strong>Jobs:</strong> Medical Director / CMO titles OR jobs from high priority companies</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">
                        Total high priority companies: <strong>{autoPrioritizeResults.summary.highPriorityCompanyCount}</strong>
                      </p>
                    </div>

                    {/* Details */}
                    {autoPrioritizeResults.details && autoPrioritizeResults.details.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Changes Made:</p>
                        <div className="max-h-[200px] overflow-y-auto border rounded-lg">
                          {autoPrioritizeResults.details.map((detail: string, i: number) => (
                            <div key={i} className={`px-3 py-2 text-xs text-gray-600 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${i > 0 ? 'border-t' : ''}`}>
                              {detail}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {autoPrioritizeResults.details?.length === 0 && (
                      <div className="text-center py-4 text-gray-400">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                        <p className="text-sm">All priorities are already up to date. No changes needed.</p>
                      </div>
                    )}
                  </div>
                  <div className="border-t bg-gray-50 px-6 py-4 flex justify-end">
                    <Button onClick={() => setShowAutoPrioritizeResults(false)}>Done</Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>


          {/* CONTACTS TAB */}
          <TabsContent value="contacts" className="flex-1 mt-0">
            <div className="bg-white rounded-xl border shadow-sm">
              {/* Recruiter quick-bar: freshness indicator, "new since last
                  visit" toggle, saved views dropdown. Only shown on
                  Contacts since this is where the daily workflow lives. */}
              <div className="px-4 py-2 border-b bg-gray-50/50 flex items-center gap-3 flex-wrap text-xs">
                <span className="text-gray-500">
                  {lastUpdatedAt
                    ? `Updated ${formatAgo(Date.now() - lastUpdatedAt)}`
                    : 'Loading…'}
                </span>
                <button
                  onClick={() => loadData({ force: true })}
                  disabled={loading}
                  className="text-[#911406] hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                  title="Refetch jobs / companies / contacts now"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <span className="text-gray-300">·</span>
                {(() => {
                  const newCount = contacts.filter(c => {
                    const t = c.created_at ? new Date(c.created_at).getTime() : 0;
                    return t && t > previousVisitRef.current;
                  }).length;
                  if (previousVisitRef.current === 0) return (
                    <span className="text-gray-400 italic">First visit — everything is new.</span>
                  );
                  return (
                    <button
                      onClick={() => setNewSinceLastVisit(v => !v)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${
                        newSinceLastVisit
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-200'
                      }`}
                      title={`${newCount} contact${newCount === 1 ? '' : 's'} added since your last visit`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {newSinceLastVisit ? `Showing ${newCount} new` : `New since last visit (${newCount})`}
                    </button>
                  );
                })()}
                <span className="text-gray-300">·</span>
                <Popover open={savedViewsOpen} onOpenChange={setSavedViewsOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:border-gray-300">
                      <Bookmark className="w-3 h-3" />
                      {activeSavedViewId
                        ? (savedViews.find(v => v.id === activeSavedViewId)?.name || 'Saved view')
                        : `Saved views (${savedViews.length})`}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Saved views</span>
                      <button onClick={saveCurrentView} className="text-[11px] text-[#911406] hover:underline inline-flex items-center gap-0.5">
                        <BookmarkPlus className="w-3 h-3" />
                        Save current
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {savedViews.length === 0 && (
                        <p className="text-xs text-gray-500 italic px-3 py-4">
                          No saved views yet. Set up your filters and click "Save current" to keep this combo around.
                        </p>
                      )}
                      {savedViews.map(v => (
                        <div key={v.id} className={`flex items-center justify-between px-3 py-2 border-t hover:bg-gray-50 ${activeSavedViewId === v.id ? 'bg-amber-50/40' : ''}`}>
                          <button onClick={() => applySavedView(v)} className="flex-1 text-left text-sm text-gray-800 truncate" title={v.name}>
                            {v.name}
                          </button>
                          <button
                            onClick={() => deleteSavedView(v.id)}
                            className="text-[10px] text-red-500 hover:text-red-700 hover:underline ml-2"
                          >
                            delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {/* Toolbar */}
              <div className="p-4 border-b flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search contacts by name, company, title, email..." value={searchContacts} onChange={e => setSearchContacts(e.target.value)} className="pl-9" />
                </div>
                {/* Source filter moved into the Source column header below.
                    Any Phone filter lives inside the Phone (Work) column
                    header below — see the extraButton prop. */}
                <Button
                  onClick={() => handleFindContacts({ mode: 'all' })}
                  disabled={contactRunIsActive}
                  className="bg-[#911406] hover:bg-[#7a1005] text-white"
                  title="Find more contacts (AI + Crelate) for every company with open jobs. Skips companies processed in any run in the last 24h."
                >
                  {findingContactsAll ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finding contacts…</>
                  ) : (
                    <><Users className="w-4 h-4 mr-2" /> Find Contacts</>
                  )}
                </Button>
                {/* Escape hatch: bypass the 24h resume-from-last skip
                    set and re-scan every eligible company. Confirm
                    before firing since it burns a full sweep's worth
                    of SerpAPI + OpenAI credits. */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const ok = window.confirm('Force a full rescan of every company with open jobs? This ignores the 24h skip-already-processed filter and will re-hit every company — expect a full SerpAPI + OpenAI sweep.');
                    if (ok) handleFindContacts({ mode: 'all', forceRestart: true });
                  }}
                  disabled={contactRunIsActive}
                  className="text-gray-700 border-gray-300 hover:bg-gray-50"
                  title="Force a full rescan — ignores the 24h resume-from-last skip list. Costs API credits."
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Force Rescan
                </Button>
                {contactRunResult && !contactRunIsActive && (
                  <Button
                    variant="outline"
                    onClick={() => setShowContactRunResult(true)}
                    className="text-gray-700"
                    title="Show details from the last Find Contacts run"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Last run details
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setContactManualMergeGroup(null);
                    setContactMergeSelection({});
                    setContactMergeResultSummary(null);
                    setShowContactMerge(true);
                  }}
                  disabled={contactMergeCandidates.length === 0}
                  className="text-purple-700 border-purple-300 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-400"
                  title={contactMergeCandidates.length === 0
                    ? 'No merge candidates detected'
                    : `${contactMergeCandidates.length} group${contactMergeCandidates.length === 1 ? '' : 's'} of contacts sharing a name`}
                >
                  <GitMerge className="w-4 h-4 mr-2" />
                  Search and Merge Contacts{contactMergeCandidates.length > 0 ? ` (${contactMergeCandidates.length})` : ''}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExportContacts(selectedContactIds.size > 0 ? 'selected' : 'visible')}
                  disabled={contacts.length === 0}
                  className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  title={selectedContactIds.size > 0
                    ? `Export the ${selectedContactIds.size} selected contact${selectedContactIds.size === 1 ? '' : 's'} to .xlsx`
                    : `Export the ${filteredContacts.length} contact${filteredContacts.length === 1 ? '' : 's'} currently visible to .xlsx`}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export {selectedContactIds.size > 0 ? `${selectedContactIds.size} Selected` : `${filteredContacts.length} Visible`}
                </Button>
                {/* Column visibility picker. Lets the recruiter hide the
                    six "secondary" columns (LinkedIn, source, dates, etc.)
                    so the table fits without horizontal scroll. */}
                <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="text-gray-700 border-gray-300 hover:bg-gray-50"
                      title="Show or hide table columns"
                    >
                      <Columns3 className="w-4 h-4 mr-2" />
                      Columns ({visibleCols.size})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-0">
                    <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Columns</span>
                      <button onClick={resetColsToDefault} className="text-[11px] text-[#911406] hover:underline">Reset</button>
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {([
                        { k: 'priority',    label: 'Priority' },
                        { k: 'first_name',  label: 'First name' },
                        { k: 'last_name',   label: 'Last name' },
                        { k: 'company',     label: 'Company' },
                        { k: 'title',       label: 'Title' },
                        { k: 'email',       label: 'Email' },
                        { k: 'phone_work',  label: 'Phone (Work)' },
                        { k: 'phone_home',  label: 'Phone (Home)' },
                        { k: 'phone_cell',  label: 'Phone (Cell)' },
                        { k: 'outreach',    label: 'Outreach status' },
                        { k: 'last_touch',  label: 'Last touch' },
                        { k: 'source',      label: 'Source' },
                        { k: 'created_at',  label: 'Date added' },
                        { k: 'linkedin',    label: 'LinkedIn' },
                        { k: 'confidence',  label: 'Confidence' },
                      ] as { k: ContactColumnKey; label: string }[]).map(({ k, label }) => (
                        <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isColVisible(k)}
                            onChange={() => toggleColVisible(k)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  onClick={() => setShowWipeContactsConfirm(true)}
                  disabled={contacts.length === 0 || contactRunIsActive || wipingContacts}
                  className="text-red-700 border-red-200 hover:bg-red-50"
                  title="Delete every row in marketing_contacts. Use before rerunning Find Contacts from scratch."
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Wipe All
                </Button>
                <span className="text-sm text-gray-500">{filteredContacts.length} contacts</span>
              </div>

              {/* Bulk-action bar — only visible when rows are selected
                  via the far-right checkbox column. */}
              {selectedContactIds.size > 0 && (
                <div className="px-4 py-2.5 border-b bg-red-50/70 flex items-center justify-between">
                  <div className="text-sm text-[#911406] font-medium">
                    {selectedContactIds.size} contact{selectedContactIds.size === 1 ? '' : 's'} selected
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={clearContactSelection}
                      className="text-gray-700"
                    >
                      Clear selection
                    </Button>
                    <Button
                      onClick={handleEnrichSelectedContacts}
                      disabled={contactRunIsActive}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white"
                      title="Fill in missing fields (email, LinkedIn, phone, title) via Apollo + Hunter"
                    >
                      <Zap className="w-4 h-4 mr-1.5" />
                      Enrich {selectedContactIds.size}
                    </Button>
                    <Button
                      onClick={handleBulkMarkContacted}
                      className="bg-blue-700 hover:bg-blue-800 text-white"
                      title="Stamp last_outreach_at = now for all selected (sets status to Cold for any that have no status yet)"
                    >
                      <Phone className="w-4 h-4 mr-1.5" />
                      Mark contacted
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="text-purple-700 border-purple-300 hover:bg-purple-50"
                          title="Set outreach status for all selected contacts"
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          Set status
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-52 p-0">
                        <div className="px-3 py-2 border-b bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                          Set status on {selectedContactIds.size}
                        </div>
                        {(['Cold', 'Replied', 'Booked', 'Dead'] as const).map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleBulkSetStatus(opt)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {opt}
                          </button>
                        ))}
                        <button
                          onClick={() => handleBulkSetStatus(null)}
                          className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t"
                        >
                          Clear status & timestamp
                        </button>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="outline"
                      onClick={() => handleExportContacts('selected')}
                      className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      title="Export the selected contacts to an .xlsx spreadsheet"
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Export {selectedContactIds.size}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Build a manual merge group from the current
                        // selection and open the merge dialog. Mirrors
                        // the company-tab bulk merge flow.
                        const selected = contacts.filter(c => selectedContactIds.has(c.id));
                        if (selected.length < 2) return;
                        const items = selected.slice().sort((a, b) => {
                          const richness = (c: any) => {
                            let s = 0;
                            if (c.email) s++;
                            if (c.phone_work || c.phone_home || c.phone_cell) s++;
                            if (c.linkedin_url) s++;
                            if (c.title) s++;
                            if (c.company_name) s++;
                            if (c.is_verified) s += 2;
                            return s;
                          };
                          const rd = richness(b) - richness(a);
                          if (rd !== 0) return rd;
                          return (b.created_at || '').localeCompare(a.created_at || '');
                        });
                        setContactManualMergeGroup({ key: 'manual-selection', items });
                        setContactMergeSelection({});
                        setContactMergeResultSummary(null);
                        setShowContactMerge(true);
                      }}
                      disabled={selectedContactIds.size < 2}
                      className="text-purple-700 border-purple-300 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={selectedContactIds.size < 2 ? 'Select at least two contacts to merge' : 'Merge the selected contacts — pick a canonical; others are merged into it'}
                    >
                      <GitMerge className="w-4 h-4 mr-1.5" />
                      Merge {selectedContactIds.size}
                    </Button>
                    <Button
                      onClick={() => setShowDeleteContactsConfirm(true)}
                      className="bg-[#911406] hover:bg-[#7a1005] text-white"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Delete {selectedContactIds.size}
                    </Button>
                  </div>
                </div>
              )}

              {/* Today view — three preset cards that pre-apply outreach
                  filters for the highest-frequency recruiter triage:
                  "never contacted", "cold and stale", "replied but not
                  yet booked". Cards toggle off if clicked while active. */}
              {(() => {
                const presetCounts = {
                  never: contacts.filter(c => !c.outreach_status && !c.last_outreach_at).length,
                  coldStale: contacts.filter(c => {
                    if (c.outreach_status !== 'Cold') return false;
                    if (!c.last_outreach_at) return true;
                    const days = (Date.now() - new Date(c.last_outreach_at).getTime()) / 86_400_000;
                    return days > 7;
                  }).length,
                  repliedPending: contacts.filter(c => c.outreach_status === 'Replied').length,
                };
                const Card = ({
                  preset, title, subtitle, count, icon: Icon, accent,
                }: {
                  preset: TodayPreset; title: string; subtitle: string; count: number;
                  icon: React.ComponentType<{ className?: string }>; accent: string;
                }) => {
                  const active = activeTodayPreset === preset;
                  return (
                    <button
                      onClick={() => applyTodayPreset(preset)}
                      className={`flex-1 min-w-[200px] text-left p-3 rounded-lg border transition-colors ${
                        active
                          ? `${accent} border-current ring-2 ring-current/20`
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                      title={active ? 'Click to clear this preset' : title}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`p-1.5 rounded-md ${active ? 'bg-white/40' : 'bg-gray-50'}`}>
                          <Icon className={`w-4 h-4 ${active ? '' : 'text-gray-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tabular-nums">{count}</span>
                            <span className="text-xs font-medium uppercase tracking-wide opacity-80">{title}</span>
                          </div>
                          <p className="text-[11px] mt-0.5 opacity-70 truncate">{subtitle}</p>
                        </div>
                      </div>
                    </button>
                  );
                };
                return (
                  <div className="px-4 py-3 border-b bg-gray-50/50 flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mr-1">Today</span>
                    <Card
                      preset="never"
                      title="Never contacted"
                      subtitle="Top of the call list"
                      count={presetCounts.never}
                      icon={Sun}
                      accent="bg-blue-50 text-blue-800"
                    />
                    <Card
                      preset="cold-7"
                      title="Cold &gt; 7 days"
                      subtitle="Stale outreach — re-engage"
                      count={presetCounts.coldStale}
                      icon={Clock}
                      accent="bg-amber-50 text-amber-800"
                    />
                    <Card
                      preset="replied-pending"
                      title="Replied, not booked"
                      subtitle="Move to a meeting"
                      count={presetCounts.repliedPending}
                      icon={MessageSquareReply}
                      accent="bg-purple-50 text-purple-800"
                    />
                  </div>
                );
              })()}

              {/* Active-filter chip row. Renders one chip per active filter
                  Set or non-trivial flag, with an inline X to clear just
                  that filter. Hidden when nothing is filtered so the
                  toolbar doesn't grow unnecessarily. */}
              {(() => {
                type Chip = { key: string; label: string; clear: () => void };
                const chips: Chip[] = [];
                const setChip = <T extends string>(setName: string, set: Set<T>, setSetter: (s: Set<T>) => void) => {
                  if (set.size === 0) return;
                  chips.push({
                    key: setName,
                    label: `${setName}: ${Array.from(set).slice(0, 3).join(', ')}${set.size > 3 ? ` +${set.size - 3}` : ''}`,
                    clear: () => setSetter(new Set<T>()),
                  });
                };
                setChip('First name', filterFirstName, setFilterFirstName as any);
                setChip('Last name', filterLastName, setFilterLastName as any);
                setChip('Company', filterContactCompany, setFilterContactCompany as any);
                setChip('Title', filterContactTitle, setFilterContactTitle as any);
                setChip('Source', filterContactSource, setFilterContactSource as any);
                setChip('Date added', filterDateAdded, setFilterDateAdded as any);
                setChip('Email', filterEmailPresence, setFilterEmailPresence as any);
                setChip('Phone (work)', filterPhoneWorkPresence, setFilterPhoneWorkPresence as any);
                setChip('Phone (home)', filterPhoneHomePresence, setFilterPhoneHomePresence as any);
                setChip('Phone (cell)', filterPhoneCellPresence, setFilterPhoneCellPresence as any);
                setChip('Any phone', filterAnyPhonePresence, setFilterAnyPhonePresence as any);
                setChip('LinkedIn', filterLinkedInPresence, setFilterLinkedInPresence as any);
                setChip('Confidence', filterConfidence, setFilterConfidence as any);
                setChip('Outreach', filterOutreachStatus, setFilterOutreachStatus as any);
                setChip('Last touch', filterOutreachAge, setFilterOutreachAge as any);
                if (newSinceLastVisit) {
                  chips.push({ key: 'newSinceLastVisit', label: 'New since last visit', clear: () => setNewSinceLastVisit(false) });
                }
                if (searchContacts) {
                  chips.push({ key: 'search', label: `Search: "${searchContacts}"`, clear: () => setSearchContacts('') });
                }
                if (chips.length === 0) return null;
                return (
                  <div className="px-4 py-2 border-b bg-white flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mr-1">Filters</span>
                    {chips.map(c => (
                      <button
                        key={c.key}
                        onClick={() => { c.clear(); setActiveTodayPreset(null); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
                        title="Click to clear this filter"
                      >
                        {c.label}
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setFilterFirstName(new Set());
                        setFilterLastName(new Set());
                        setFilterContactCompany(new Set());
                        setFilterContactTitle(new Set());
                        setFilterContactSource(new Set());
                        setFilterDateAdded(new Set());
                        setFilterEmailPresence(new Set());
                        setFilterPhoneWorkPresence(new Set());
                        setFilterPhoneHomePresence(new Set());
                        setFilterPhoneCellPresence(new Set());
                        setFilterLinkedInPresence(new Set());
                        setFilterAnyPhonePresence(new Set());
                        setFilterConfidence(new Set());
                        setFilterOutreachStatus(new Set());
                        setFilterOutreachAge(new Set());
                        setNewSinceLastVisit(false);
                        setSearchContacts('');
                        setActiveTodayPreset(null);
                      }}
                      className="ml-1 text-[11px] text-gray-500 hover:text-[#911406] underline"
                    >
                      Clear all
                    </button>
                  </div>
                );
              })()}

              {/* Live progress panel — visible while a find-contacts run
                  is in flight. Polls contact_runs every 2s. */}
              {contactRunIsActive && contactRun && (
                <div className="px-4 py-3 border-b bg-emerald-50/50">
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <div className="flex items-center gap-2 text-emerald-900 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                      {contactRun.mode === 'enrich'
                        ? `Enriching ${contactRun.items_total} contact${contactRun.items_total === 1 ? '' : 's'}…`
                        : contactRun.mode === 'all'
                          ? `Finding contacts across ${contactRun.items_total} companies…`
                          : `Finding contacts for ${contactRun.target_company_name || 'company'}…`}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-emerald-900/80 tabular-nums">
                      <span><strong>{contactRun.items_processed || 0}</strong>/{contactRun.items_total || 0} {contactRun.mode === 'enrich' ? 'contacts' : 'companies'}</span>
                      <span>·</span>
                      <span><strong className="text-emerald-800">{contactRun.contacts_added || 0}</strong> {contactRun.mode === 'enrich' ? 'enriched' : 'contacts added'}</span>
                      {(contactRun.duplicates_skipped || 0) > 0 && (
                        <>
                          <span>·</span>
                          <span>{contactRun.duplicates_skipped} duplicates skipped</span>
                        </>
                      )}
                      <button
                        onClick={async () => {
                          if (!contactRun?.id) return;
                          await supabase.from('contact_runs')
                            .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Cancelled by user' })
                            .eq('id', contactRun.id);
                          toast({ title: 'Run cancelled', description: 'The UI stopped polling; work in flight on the server may still finish in the background.' });
                        }}
                        className="ml-2 text-[11px] px-2 py-0.5 border border-emerald-300 rounded hover:bg-white text-emerald-900"
                        title="Mark this run as failed so you can start a new one. Work already in flight on the server will still finish."
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-500 ease-out"
                      style={{
                        width: `${contactRun.items_total > 0
                          ? Math.min(100, Math.round(((contactRun.items_processed || 0) / contactRun.items_total) * 100))
                          : 0}%`
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-emerald-900/70 gap-3 flex-wrap">
                    {/* Per-source breakdown — only renders non-zero counts
                        to keep the panel tight. */}
                    <div className="flex items-center gap-2 tabular-nums">
                      {(contactRun.leadership_added || 0) > 0 && <span>Leadership: <strong>{contactRun.leadership_added}</strong></span>}
                      {(contactRun.apollo_added || 0) > 0 && <span>· Apollo: <strong>{contactRun.apollo_added}</strong></span>}
                      {(contactRun.ai_added || 0) > 0 && <span>· AI: <strong>{contactRun.ai_added}</strong></span>}
                      {(contactRun.crelate_added || 0) > 0 && <span>· Crelate: <strong>{contactRun.crelate_added}</strong></span>}
                      {(contactRun.emails_verified || 0) > 0 && <span>· Hunter-verified: <strong>{contactRun.emails_verified}</strong></span>}
                    </div>
                    {contactRun.current_item && (
                      <p className="truncate max-w-[50%]">
                        Processing: <span className="font-medium">{contactRun.current_item}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Spreadsheet-style table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {/* Priority — heat-gradient badge, derived from the
                          hottest open job at the contact's company.
                          Sortable by clicking the header. */}
                      {isColVisible('priority') && (
                        <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider w-[80px]">
                          <button
                            type="button"
                            onClick={() => handleContactSort('priority_score')}
                            className="inline-flex items-center justify-center hover:text-[#911406] transition-colors"
                            title="Sort by priority"
                          >
                            Priority
                            {contactSortField !== 'priority_score'
                              ? <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 flex-shrink-0" />
                              : contactSortDir === 'asc'
                                ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />
                                : <ArrowDown className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />}
                          </button>
                        </th>
                      )}
                      {isColVisible('first_name') && <MultiSelectColumnHeader<ContactSortField> field="first_name" label="First Name" filterValues={filterFirstName} filterOptions={uniqueContactFirstNames} onFilterChange={setFilterFirstName} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />}
                      {isColVisible('last_name') && <MultiSelectColumnHeader<ContactSortField> field="last_name" label="Last Name" filterValues={filterLastName} filterOptions={uniqueContactLastNames} onFilterChange={setFilterLastName} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />}
                      {isColVisible('company') && <MultiSelectColumnHeader<ContactSortField> field="company_name" label="Company" filterValues={filterContactCompany} filterOptions={uniqueContactCompanies} onFilterChange={setFilterContactCompany} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />}
                      {isColVisible('title') && <MultiSelectColumnHeader<ContactSortField> field="title" label="Title" filterValues={filterContactTitle} filterOptions={uniqueContactTitles} onFilterChange={setFilterContactTitle} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />}
                      {isColVisible('email') && <MultiSelectColumnHeader<ContactSortField> field="email" label="Email" filterValues={filterEmailPresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterEmailPresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by Email presence" />}
                      {isColVisible('phone_work') && <MultiSelectColumnHeader<ContactSortField>
                        field="phone_work"
                        label="Phone (Work)"
                        filterValues={filterPhoneWorkPresence}
                        filterOptions={PRESENCE_OPTIONS}
                        onFilterChange={setFilterPhoneWorkPresence}
                        sortField={contactSortField}
                        sortDir={contactSortDir}
                        onSort={handleContactSort}
                        filterPanelLabel="Filter by Work Phone presence"
                        extraButton={
                          <Popover open={anyPhoneFilterOpen} onOpenChange={setAnyPhoneFilterOpen}>
                            <PopoverTrigger asChild>
                              <button
                                className={`inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold ml-1 px-1.5 py-0.5 rounded border transition-colors ${
                                  filterAnyPhonePresence.size > 0
                                    ? 'border-[#911406] text-[#911406] bg-red-50'
                                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                                title="Filter by whether the contact has ANY phone populated"
                              >
                                <Phone className="w-3 h-3" />
                                Any
                                {filterAnyPhonePresence.size > 0 && (
                                  <span className="ml-0.5 text-[9px] font-bold bg-[#911406] text-white px-1 rounded tabular-nums">
                                    {filterAnyPhonePresence.size}
                                  </span>
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              sideOffset={4}
                              className="p-0 w-[240px] flex flex-col border-gray-200"
                              onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                              <div className="p-2 border-b border-gray-100">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Filter by any phone</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">Checks Work OR Home OR Cell.</p>
                              </div>
                              <div className="py-1">
                                {['Has data', 'No data'].map(opt => {
                                  const checked = filterAnyPhonePresence.has(opt);
                                  return (
                                    <label
                                      key={opt}
                                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 cursor-pointer ${checked ? 'bg-red-50/50 text-[#911406] font-medium' : 'text-gray-700'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = new Set(filterAnyPhonePresence);
                                          if (next.has(opt)) next.delete(opt); else next.add(opt);
                                          setFilterAnyPhonePresence(next);
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30 cursor-pointer"
                                      />
                                      <span>{opt === 'Has data' ? 'Has any phone' : 'Has no phones'}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between gap-2 bg-gray-50/50">
                                <button
                                  onClick={() => setFilterAnyPhonePresence(new Set())}
                                  className="text-[11px] text-gray-600 hover:text-[#911406] font-medium disabled:opacity-40"
                                  disabled={filterAnyPhonePresence.size === 0}
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setAnyPhoneFilterOpen(false)}
                                  className="text-[11px] text-white bg-[#911406] hover:bg-[#7a1005] px-2.5 py-1 rounded font-medium"
                                >
                                  Done
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        }
                      />}
                      {isColVisible('phone_home') && <MultiSelectColumnHeader<ContactSortField> field="phone_home" label="Phone (Home)" filterValues={filterPhoneHomePresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterPhoneHomePresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by Home Phone presence" />}
                      {isColVisible('phone_cell') && <MultiSelectColumnHeader<ContactSortField> field="phone_cell" label="Phone (Cell)" filterValues={filterPhoneCellPresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterPhoneCellPresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by Cell Phone presence" />}
                      {isColVisible('source') && <MultiSelectColumnHeader<ContactSortField> field="source" label="Source" filterValues={filterContactSource} filterOptions={uniqueContactSourceValues} onFilterChange={setFilterContactSource} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />}
                      {isColVisible('created_at') && <MultiSelectColumnHeader<ContactSortField> field="created_at" label="Date / Time Added" filterValues={filterDateAdded} filterOptions={uniqueContactDates} onFilterChange={setFilterDateAdded} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by date added" />}
                      {isColVisible('linkedin') && <MultiSelectColumnHeader<ContactSortField> field="linkedin_url" label="LinkedIn URL" filterValues={filterLinkedInPresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterLinkedInPresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by LinkedIn presence" />}
                      {isColVisible('confidence') && <MultiSelectColumnHeader<ContactSortField> field="confidence_score" label="Confidence" filterValues={filterConfidence} filterOptions={CONFIDENCE_OPTIONS} onFilterChange={setFilterConfidence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by confidence score" />}
                      {/* Outreach status — multi-select bucket filter. Not
                          sortable (would need a ContactSortField); recruiters
                          filter on this far more than they sort by it. */}
                      {isColVisible('outreach') && <MultiSelectColumnHeader<ContactSortField>
                        field={'created_at' as ContactSortField}
                        label="Outreach"
                        filterValues={filterOutreachStatus}
                        filterOptions={OUTREACH_STATUS_OPTIONS}
                        onFilterChange={setFilterOutreachStatus}
                        sortField={contactSortField}
                        sortDir={contactSortDir}
                        onSort={() => {/* not sortable */}}
                        filterPanelLabel="Filter by outreach status"
                      />}
                      {/* Last touch — bucketed days-since filter. */}
                      {isColVisible('last_touch') && <MultiSelectColumnHeader<ContactSortField>
                        field={'created_at' as ContactSortField}
                        label="Last Touch"
                        filterValues={filterOutreachAge}
                        filterOptions={OUTREACH_AGE_OPTIONS}
                        onFilterChange={setFilterOutreachAge}
                        sortField={contactSortField}
                        sortDir={contactSortDir}
                        onSort={() => {/* not sortable */}}
                        filterPanelLabel="Filter by days since last outreach"
                      />}
                      <th className="text-center px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider w-[120px]">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30 cursor-pointer"
                          checked={filteredContacts.length > 0 && filteredContacts.every(c => selectedContactIds.has(c.id))}
                          ref={el => {
                            // Tri-state: indeterminate when some (but not
                            // all) visible rows are selected. Purely visual.
                            if (el) {
                              const total = filteredContacts.length;
                              const sel = filteredContacts.filter(c => selectedContactIds.has(c.id)).length;
                              el.indeterminate = sel > 0 && sel < total;
                            }
                          }}
                          onChange={() => {
                            const allSelected = filteredContacts.length > 0 && filteredContacts.every(c => selectedContactIds.has(c.id));
                            if (allSelected) {
                              // Deselect only the currently-visible ones so selections on filtered-out rows survive.
                              setSelectedContactIds(prev => {
                                const next = new Set(prev);
                                filteredContacts.forEach(c => next.delete(c.id));
                                return next;
                              });
                            } else {
                              setSelectedContactIds(prev => {
                                const next = new Set(prev);
                                filteredContacts.forEach(c => next.add(c.id));
                                return next;
                              });
                            }
                          }}
                          title="Select / deselect all visible contacts"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={visibleCols.size + 1} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></td></tr>
                    ) : filteredContacts.length === 0 ? (
                      <tr><td colSpan={visibleCols.size + 1} className="text-center py-12 text-gray-500">No contacts match the current filters. Clear filters above or click a Today preset.</td></tr>
                    ) : filteredContacts.map((c, idx) => {
                      // Derive LinkedIn URL: prefer linkedin_url field, then check source_url for LinkedIn links
                      const linkedinUrl = c.linkedin_url || 
                        (c.source_url && c.source_url.includes('linkedin.com/in/') ? c.source_url : '');

                      const cPriority = priorityForContact(c);
                      return (
                        <tr
                          key={c.id}
                          data-mp-contact-id={c.id}
                          className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          } ${selectedContact?.id === c.id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                          onClick={() => setSelectedContact(selectedContact?.id === c.id ? null : c)}
                        >
                          {/* Priority (heat-gradient badge) */}
                          {isColVisible('priority') && (
                            <td className="px-2 py-2.5 border-r border-gray-100 text-center">
                              <JobPriorityBadge
                                score={cPriority}
                                title={cPriority !== null ? `Top open-job priority at this company: ${Math.round(cPriority)}/100` : undefined}
                              />
                            </td>
                          )}
                          {isColVisible('first_name') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium">
                              {c.first_name || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('last_name') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium">
                              {c.last_name || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('company') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium text-sm">
                              {c.company_name || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('title') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                              {c.title || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('email') && (
                            <td className="px-4 py-2.5 border-r border-gray-100">
                              {c.email ? (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="text-blue-600 hover:underline text-sm"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {c.email}
                                </a>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )}
                          {isColVisible('phone_work') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                              {c.phone_work || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('phone_home') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                              {c.phone_home || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('phone_cell') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                              {c.phone_cell || <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          {isColVisible('source') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-sm">
                              {c.source ? (
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sourceBadge(c.source)}`}>
                                  {sourceIcon(c.source)}
                                  {c.source === 'Crelate ATS' ? 'Crelate' : c.source?.includes('Sweep') ? 'AI Sweep' : c.source?.includes('AI') ? 'AI' : c.source || ''}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )}
                          {isColVisible('created_at') && (
                            <td
                              className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm tabular-nums"
                              title={c.created_at || ''}
                            >
                              {c.created_at ? (
                                (() => {
                                  const d = new Date(c.created_at);
                                  return (
                                    <span>
                                      <span className="font-medium text-gray-800">{d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                      <span className="text-gray-500 ml-1.5">{d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )}
                          {isColVisible('linkedin') && (
                            <td className="px-4 py-2.5 border-r border-gray-100 text-sm" onClick={e => e.stopPropagation()}>
                              {linkedinUrl ? (
                                <a
                                  href={linkedinUrl.startsWith('http') ? linkedinUrl : `https://${linkedinUrl}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors font-medium"
                                  title={`View LinkedIn profile`}
                                >
                                  <Linkedin className="w-3 h-3" />
                                  Profile
                                </a>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )}
                          {isColVisible('confidence') && (
                            <td className="px-3 py-2.5 border-r border-gray-100" onClick={e => e.stopPropagation()}>
                              {(() => {
                                const score = Number(c.confidence_score ?? 0);
                                const barColor =
                                  score >= 5 ? 'bg-emerald-600' :
                                  score >= 4 ? 'bg-emerald-500' :
                                  score >= 3 ? 'bg-amber-500' :
                                  score >= 2 ? 'bg-orange-500' :
                                  score >= 1 ? 'bg-red-400' : 'bg-red-600';
                                const pillColor =
                                  score >= 4 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                  score >= 2 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                                  'bg-red-50 text-red-800 border-red-200';
                                return (
                                  <div className="flex items-center gap-2" title={`Confidence ${score}/5`}>
                                    <span className={`inline-flex items-center justify-center tabular-nums text-xs font-semibold px-1.5 py-0.5 rounded border ${pillColor}`} style={{ minWidth: 26 }}>
                                      {score}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden" style={{ minWidth: 50 }}>
                                      <div className={`h-full ${barColor}`} style={{ width: `${(score / 5) * 100}%` }} />
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                          )}
                          {isColVisible('outreach') && (
                            <td className="px-3 py-2.5 border-r border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                              <OutreachStatusCell
                                contactId={c.id}
                                status={(c.outreach_status as OutreachStatus) ?? null}
                                lastOutreachAt={c.last_outreach_at}
                                onUpdated={(status, ts) => {
                                  setContacts(prev => prev.map(row => row.id === c.id ? { ...row, outreach_status: status, last_outreach_at: ts } : row));
                                }}
                              />
                            </td>
                          )}
                          {isColVisible('last_touch') && (
                            <td className="px-3 py-2.5 border-r border-gray-100 text-xs tabular-nums" onClick={e => e.stopPropagation()}>
                              {c.last_outreach_at ? (
                                (() => {
                                  const days = Math.floor((Date.now() - new Date(c.last_outreach_at).getTime()) / 86_400_000);
                                  const tone =
                                    days <= 3  ? 'text-emerald-700' :
                                    days <= 7  ? 'text-emerald-600' :
                                    days <= 14 ? 'text-amber-600' :
                                    days <= 30 ? 'text-orange-600' :
                                                 'text-red-600';
                                  return (
                                    <span className={`${tone} font-medium`} title={new Date(c.last_outreach_at).toLocaleString()}>
                                      {days === 0 ? 'today' : `${days}d ago`}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-gray-300 italic">never</span>
                              )}
                            </td>
                          )}
                          {/* Per-row Copy + Edit + Enrich buttons + selection
                              checkbox. stopPropagation so interacting with
                              any of them doesn't toggle the detail panel
                              via the row's onClick. */}
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => copyContactPack(c)}
                                className="p-1 rounded hover:bg-amber-50 text-amber-700 transition-colors"
                                title="Copy contact pack (name, title, company, email, phone, LinkedIn)"
                                aria-label="Copy contact pack"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openEditContact(c)}
                                className="p-1 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                                title="Edit contact record (all fields)"
                                aria-label="Edit this contact"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => enrichContactsById([c.id])}
                                disabled={contactRunIsActive}
                                className="p-1 rounded hover:bg-emerald-50 text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title={contactRunIsActive ? 'A run is already active' : 'Enrich this contact (SerpAPI+AI, Lusha, Apollo, Hunter)'}
                                aria-label="Enrich this contact"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30 cursor-pointer"
                                checked={selectedContactIds.has(c.id)}
                                onChange={() => toggleContactSelect(c.id)}
                                title="Select contact"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Contact Detail Panel */}
              {selectedContact && (() => {
                const selectedLinkedinUrl = selectedContact.linkedin_url || 
                  (selectedContact.source_url && selectedContact.source_url.includes('linkedin.com/in/') ? selectedContact.source_url : '');
                return (
                  <div className="border-t bg-gray-50 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-base">
                          {[selectedContact.first_name, selectedContact.middle_name, selectedContact.last_name].filter(Boolean).join(' ')}
                          {selectedContact.suffix ? `, ${selectedContact.suffix}` : ''}
                        </h3>
                        <p className="text-sm text-gray-500">{selectedContact.title}{selectedContact.title && selectedContact.company_name ? ' at ' : ''}{selectedContact.company_name}</p>
                      </div>
                      <button onClick={() => setSelectedContact(null)} className="text-gray-400 hover:text-gray-600">
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                      <div>
                        <label className="text-xs text-gray-500 font-medium">First Name</label>
                        <p className="text-sm text-gray-900">{selectedContact.first_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Middle</label>
                        <p className="text-sm text-gray-900">{selectedContact.middle_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Last Name</label>
                        <p className="text-sm text-gray-900">{selectedContact.last_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Suffix</label>
                        <p className="text-sm text-gray-900">{selectedContact.suffix || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Email</label>
                        <p className="text-sm">
                          {selectedContact.email ? (
                            <a href={`mailto:${selectedContact.email}`} className="text-blue-600 hover:underline">{selectedContact.email}</a>
                          ) : '—'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Phone (Work)</label>
                        <p className="text-sm text-gray-900">{selectedContact.phone_work || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Phone (Home)</label>
                        <p className="text-sm text-gray-900">{selectedContact.phone_home || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Phone (Cell)</label>
                        <p className="text-sm text-gray-900">{selectedContact.phone_cell || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Title</label>
                        <p className="text-sm text-gray-900">{selectedContact.title || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Company</label>
                        <p className="text-sm text-gray-900">{selectedContact.company_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Source</label>
                        <p className="text-sm">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sourceBadge(selectedContact.source)}`}>
                            {sourceIcon(selectedContact.source)}
                            {selectedContact.source || 'Unknown'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">LinkedIn URL</label>
                        {selectedLinkedinUrl ? (
                          <a 
                            href={selectedLinkedinUrl.startsWith('http') ? selectedLinkedinUrl : `https://${selectedLinkedinUrl}`}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                            View Profile
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                    {selectedContact.notes && (
                      <div className="mt-3">
                        <label className="text-xs text-gray-500 font-medium">Notes</label>
                        <p className="text-sm text-gray-600 mt-0.5">{selectedContact.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Merge Candidates Dialog — groups companies whose normalized
          names collapse to the same prefix (e.g. "Devoted Health
          Services" / "Devoted Medical Group" / "Devoted Medical Services"
          → "devoted"). For each group the user picks a canonical row;
          other checked members get their jobs + contacts reassigned to
          canonical and their company rows deleted via the
          merge_companies RPC (one transaction per group). */}
      {showMergeCandidates && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !mergingInFlight && (setShowMergeCandidates(false), setManualMergeGroup(null))}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <GitMerge className="w-5 h-5 text-purple-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{manualMergeGroup ? 'Merge selected companies' : 'Merge candidates'}</h3>
                  <p className="text-sm text-gray-500">
                    {manualMergeGroup
                      ? `${manualMergeGroup.items.length} compan${manualMergeGroup.items.length === 1 ? 'y' : 'ies'} selected for merge.`
                      : `${activeMergeGroups.length} group${activeMergeGroups.length === 1 ? '' : 's'} of similar company names.`}
                    {' '}Pick the canonical row{manualMergeGroup ? '' : ' in each group'}; jobs and contacts from the other rows are reassigned to it and the merged company records are deleted.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                    Empty fields on canonical are filled from merged rows (website, industry, careers_url, location, company_type, source).
                    is_high_priority / has_md_cmo OR across all rows. notes are concatenated. Aggregate counts recompute. is_blocked / crelate_id / status are left untouched.
                  </p>
                </div>
                <button
                  onClick={() => !mergingInFlight && (setShowMergeCandidates(false), setManualMergeGroup(null))}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5 bg-gray-50">
              {activeMergeGroups.map(g => {
                const sel = mergeSelection[g.key] || defaultMergeSelection(g.items);
                const canonicalId = sel.canonicalId;
                const includeIds = sel.includeIds;
                const mergeCount = Array.from(includeIds).filter(id => id !== canonicalId).length;
                return (
                  <div key={g.key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-white flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">Normalized: <span className="font-mono text-purple-700">{g.key}</span></h4>
                        <p className="text-xs text-gray-500">{g.items.length} companies · {mergeCount} will be merged into canonical</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="text-center px-2 py-2 font-semibold w-[60px]" title="Canonical: the row everything else merges into">Keep</th>
                            <th className="text-center px-2 py-2 font-semibold w-[60px]" title="Include this row in the merge (if unchecked, row is left alone)">Merge</th>
                            <th className="text-left px-3 py-2 font-semibold">Company</th>
                            <th className="text-left px-3 py-2 font-semibold">Website</th>
                            <th className="text-right px-2 py-2 font-semibold">Roles</th>
                            <th className="text-right px-2 py-2 font-semibold">Contacts</th>
                            <th className="text-left px-3 py-2 font-semibold">Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map(c => {
                            const isCanonical = c.id === canonicalId;
                            const isIncluded = includeIds.has(c.id);
                            return (
                              <tr key={c.id} className={`border-t border-gray-100 ${isCanonical ? 'bg-emerald-50/60' : isIncluded ? '' : 'text-gray-400'}`}>
                                <td className="text-center px-2 py-2">
                                  <input
                                    type="radio"
                                    name={`canonical-${g.key}`}
                                    checked={isCanonical}
                                    onChange={() => setMergeSelection(prev => ({
                                      ...prev,
                                      [g.key]: {
                                        canonicalId: c.id,
                                        includeIds: new Set([...(prev[g.key]?.includeIds || new Set()), c.id]),
                                      },
                                    }))}
                                    disabled={mergingInFlight}
                                  />
                                </td>
                                <td className="text-center px-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={isIncluded}
                                    disabled={isCanonical || mergingInFlight}
                                    onChange={() => setMergeSelection(prev => {
                                      const cur = prev[g.key] || { canonicalId, includeIds: new Set<string>() };
                                      const next = new Set(cur.includeIds);
                                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                      return { ...prev, [g.key]: { ...cur, includeIds: next } };
                                    })}
                                    title={isCanonical ? 'Canonical row is always included' : 'Include this row in the merge'}
                                  />
                                </td>
                                <td className="px-3 py-2 font-medium">
                                  {c.company_name}
                                  {isCanonical && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">canonical</span>}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[200px]" title={c.website || ''}>
                                  {c.website ? (
                                    <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                      {c.website}
                                    </a>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">{c.open_roles_count || 0}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{c._contact_count || 0}</td>
                                <td className="px-3 py-2 text-xs text-gray-600">{c.company_type || c.industry || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {activeMergeGroups.length === 0 && (
                <p className="text-sm text-gray-500 italic text-center py-10">No merge candidates detected.</p>
              )}
            </div>

            <div className="p-4 border-t bg-white flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {(() => {
                  const totalMerges = activeMergeGroups.reduce((n, g) => {
                    const sel = mergeSelection[g.key] || defaultMergeSelection(g.items);
                    return n + Array.from(sel.includeIds).filter(id => id !== sel.canonicalId).length;
                  }, 0);
                  return totalMerges > 0
                    ? `${totalMerges} compan${totalMerges === 1 ? 'y' : 'ies'} will be merged into their canonical.`
                    : 'No merges queued yet.';
                })()}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => { setShowMergeCandidates(false); setManualMergeGroup(null); }} disabled={mergingInFlight}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmCompanyMerges}
                  disabled={mergingInFlight || activeMergeGroups.every(g => {
                    const sel = mergeSelection[g.key] || defaultMergeSelection(g.items);
                    return Array.from(sel.includeIds).filter(id => id !== sel.canonicalId).length === 0;
                  })}
                  className="bg-purple-700 hover:bg-purple-800 text-white"
                >
                  {mergingInFlight ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Merging…</>) : (<><GitMerge className="w-4 h-4 mr-2" /> Confirm merges</>)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal — writes directly to marketing_companies.
          Auto-maintained fields (contact_count, open_roles_count) and
          audit fields (id, created_at, crelate_id) are not editable
          here. company_name changes cascade onto the denormalized
          company_name column in marketing_jobs / marketing_contacts. */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingCompanyEdit && (setEditingCompany(null), setEditingCompanyDraft({}))}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Pencil className="w-5 h-5 text-blue-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">Edit company</h3>
                <p className="text-xs text-gray-500">{editingCompany.company_name}</p>
              </div>
              <button
                onClick={() => { setEditingCompany(null); setEditingCompanyDraft({}); }}
                disabled={savingCompanyEdit}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Company name</label>
                <Input
                  value={editingCompanyDraft.company_name || ''}
                  onChange={e => setEditingCompanyDraft(d => ({ ...d, company_name: e.target.value }))}
                  className="mt-1"
                  placeholder="Company name"
                />
                <p className="text-[10px] text-gray-400 mt-1">Renaming cascades to jobs + contacts that reference this company.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Category</label>
                  <select
                    value={COMPANY_CATEGORY_OPTIONS.includes(editingCompanyDraft.company_type) ? editingCompanyDraft.company_type : ''}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, company_type: e.target.value, industry: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-white"
                  >
                    <option value="">—</option>
                    {COMPANY_CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Location</label>
                  <Input
                    value={editingCompanyDraft.location || ''}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, location: e.target.value }))}
                    className="mt-1"
                    placeholder="City, State"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Website</label>
                  <Input
                    value={editingCompanyDraft.website || ''}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, website: e.target.value }))}
                    className="mt-1"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Careers URL</label>
                  <Input
                    value={editingCompanyDraft.careers_url || ''}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, careers_url: e.target.value }))}
                    className="mt-1"
                    placeholder="https://example.com/careers"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Homepage URL</label>
                  <Input
                    value={editingCompanyDraft.homepage_url || ''}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, homepage_url: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Source</label>
                  <Input
                    value={editingCompanyDraft.source || ''}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, source: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Role types hired</label>
                <Input
                  value={editingCompanyDraft.role_types_hired || ''}
                  onChange={e => setEditingCompanyDraft(d => ({ ...d, role_types_hired: e.target.value }))}
                  className="mt-1"
                  placeholder="e.g. Medical Director, CMO, Physician"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Notes</label>
                <textarea
                  value={editingCompanyDraft.notes || ''}
                  onChange={e => setEditingCompanyDraft(d => ({ ...d, notes: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-white resize-y"
                />
              </div>
              <div className="flex items-center gap-5 pt-2 border-t">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editingCompanyDraft.is_high_priority}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, is_high_priority: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  High priority
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editingCompanyDraft.has_md_cmo}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, has_md_cmo: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  Has MD/CMO
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editingCompanyDraft.is_blocked}
                    onChange={e => setEditingCompanyDraft(d => ({ ...d, is_blocked: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  Blocked
                </label>
              </div>
            </div>
            <div className="p-4 border-t bg-white flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditingCompany(null); setEditingCompanyDraft({}); }} disabled={savingCompanyEdit}>Cancel</Button>
              <Button onClick={handleSaveCompanyEdit} disabled={savingCompanyEdit} className="bg-[#911406] hover:bg-[#7a1005] text-white">
                {savingCompanyEdit ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>) : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal — writes directly to marketing_contacts.
          company_name is editable as free text; company_id is not
          rewired here (use Find Contacts or the company-merge flow for
          that). confidence_score and audit fields are not editable. */}
      {editingContact && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingContactEdit && (setEditingContact(null), setEditingContactDraft({}))}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Pencil className="w-5 h-5 text-blue-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">Edit contact</h3>
                <p className="text-xs text-gray-500">{(() => {
                  const name = [editingContact.first_name, editingContact.middle_name, editingContact.last_name].filter(Boolean).join(' ');
                  const withSuffix = editingContact.suffix ? `${name || '(unnamed)'}, ${editingContact.suffix}` : (name || '(unnamed)');
                  return editingContact.company_name ? `${withSuffix} · ${editingContact.company_name}` : withSuffix;
                })()}</p>
              </div>
              <button
                onClick={() => { setEditingContact(null); setEditingContactDraft({}); }}
                disabled={savingContactEdit}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4">
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">First name</label>
                  <Input value={editingContactDraft.first_name || ''} onChange={e => setEditingContactDraft(d => ({ ...d, first_name: e.target.value }))} className="mt-1" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Middle</label>
                  <Input value={editingContactDraft.middle_name || ''} onChange={e => setEditingContactDraft(d => ({ ...d, middle_name: e.target.value }))} className="mt-1" placeholder="A. or Anne" />
                </div>
                <div className="col-span-4">
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Last name</label>
                  <Input value={editingContactDraft.last_name || ''} onChange={e => setEditingContactDraft(d => ({ ...d, last_name: e.target.value }))} className="mt-1" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Suffix</label>
                  <Input value={editingContactDraft.suffix || ''} onChange={e => setEditingContactDraft(d => ({ ...d, suffix: e.target.value }))} className="mt-1" placeholder="MD, MBA" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Title</label>
                <Input value={editingContactDraft.title || ''} onChange={e => setEditingContactDraft(d => ({ ...d, title: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Company</label>
                <Input value={editingContactDraft.company_name || ''} onChange={e => setEditingContactDraft(d => ({ ...d, company_name: e.target.value }))} className="mt-1" />
                <p className="text-[10px] text-gray-400 mt-1">Free text. Use Find Contacts / Search and Merge Companies to relink this row's company_id.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Email</label>
                <Input type="email" value={editingContactDraft.email || ''} onChange={e => setEditingContactDraft(d => ({ ...d, email: e.target.value }))} className="mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Phone (Work)</label>
                  <Input value={editingContactDraft.phone_work || ''} onChange={e => setEditingContactDraft(d => ({ ...d, phone_work: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Phone (Home)</label>
                  <Input value={editingContactDraft.phone_home || ''} onChange={e => setEditingContactDraft(d => ({ ...d, phone_home: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Phone (Cell)</label>
                  <Input value={editingContactDraft.phone_cell || ''} onChange={e => setEditingContactDraft(d => ({ ...d, phone_cell: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">LinkedIn URL</label>
                  <Input value={editingContactDraft.linkedin_url || ''} onChange={e => setEditingContactDraft(d => ({ ...d, linkedin_url: e.target.value }))} className="mt-1" placeholder="https://linkedin.com/in/..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Source</label>
                  <Input value={editingContactDraft.source || ''} onChange={e => setEditingContactDraft(d => ({ ...d, source: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Notes</label>
                <textarea
                  value={editingContactDraft.notes || ''}
                  onChange={e => setEditingContactDraft(d => ({ ...d, notes: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-white resize-y"
                />
              </div>
            </div>
            <div className="p-4 border-t bg-white flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditingContact(null); setEditingContactDraft({}); }} disabled={savingContactEdit}>Cancel</Button>
              <Button onClick={handleSaveContactEdit} disabled={savingContactEdit} className="bg-[#911406] hover:bg-[#7a1005] text-white">
                {savingContactEdit ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>) : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Candidates / Selected Contacts Dialog — mirrors the
          company-merge dialog. Auto-detected groups cluster contacts
          that share a first + last name; a manual group can also be
          built by selecting rows and clicking Merge in the bulk bar.
          Confirm calls the merge_contacts RPC per group (canonical
          row keeps its identity + any non-empty fields, merged rows'
          non-empty values fill canonical's empty fields, notes are
          concatenated, confidence recomputed, merged rows deleted). */}
      {showContactMerge && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !contactMergingInFlight && (setShowContactMerge(false), setContactManualMergeGroup(null))}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <GitMerge className="w-5 h-5 text-purple-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{contactManualMergeGroup ? 'Merge selected contacts' : 'Merge candidates'}</h3>
                  <p className="text-sm text-gray-500">
                    {contactManualMergeGroup
                      ? `${contactManualMergeGroup.items.length} contact${contactManualMergeGroup.items.length === 1 ? '' : 's'} selected for merge.`
                      : `${activeContactMergeGroups.length} group${activeContactMergeGroups.length === 1 ? '' : 's'} of contacts sharing a name.`}
                    {' '}Pick the canonical row{contactManualMergeGroup ? '' : ' in each group'}; non-empty fields from the others fill canonical's empty slots and the merged rows are deleted.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                    Empty fields on canonical are filled from merged rows (company, email, title, phones, LinkedIn, source).
                    is_verified ORs across all rows. notes are concatenated with a "[merged from …]" prefix. Confidence recomputes. id, first_name, last_name, created_at stay on canonical.
                  </p>
                </div>
                <button
                  onClick={() => !contactMergingInFlight && (setShowContactMerge(false), setContactManualMergeGroup(null))}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5 bg-gray-50">
              {activeContactMergeGroups.map(g => {
                const sel = contactMergeSelection[g.key] || defaultMergeSelection(g.items);
                const canonicalId = sel.canonicalId;
                const includeIds = sel.includeIds;
                const mergeCount = Array.from(includeIds).filter(id => id !== canonicalId).length;
                const headerName = g.items[0]
                  ? `${g.items[0].first_name || ''} ${g.items[0].last_name || ''}`.trim() || '(unnamed)'
                  : g.key;
                return (
                  <div key={g.key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-white flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{headerName}</h4>
                        <p className="text-xs text-gray-500">{g.items.length} records · {mergeCount} will be merged into canonical</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="text-center px-2 py-2 font-semibold w-[60px]" title="Canonical: the row everything else merges into">Keep</th>
                            <th className="text-center px-2 py-2 font-semibold w-[60px]" title="Include this row in the merge (if unchecked, row is left alone)">Merge</th>
                            <th className="text-left px-3 py-2 font-semibold">Company</th>
                            <th className="text-left px-3 py-2 font-semibold">Title</th>
                            <th className="text-left px-3 py-2 font-semibold">Email</th>
                            <th className="text-left px-3 py-2 font-semibold">Phones</th>
                            <th className="text-center px-2 py-2 font-semibold" title="Confidence score (0-5)">Conf</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map(c => {
                            const isCanonical = c.id === canonicalId;
                            const isIncluded = includeIds.has(c.id);
                            const phones = [c.phone_work, c.phone_cell, c.phone_home].filter(Boolean).join(' · ') || '—';
                            return (
                              <tr key={c.id} className={`border-t border-gray-100 ${isCanonical ? 'bg-emerald-50/60' : isIncluded ? '' : 'text-gray-400'}`}>
                                <td className="text-center px-2 py-2">
                                  <input
                                    type="radio"
                                    name={`contact-canonical-${g.key}`}
                                    checked={isCanonical}
                                    onChange={() => setContactMergeSelection(prev => ({
                                      ...prev,
                                      [g.key]: {
                                        canonicalId: c.id,
                                        includeIds: new Set([...(prev[g.key]?.includeIds || new Set()), c.id]),
                                      },
                                    }))}
                                    disabled={contactMergingInFlight}
                                  />
                                </td>
                                <td className="text-center px-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={isIncluded}
                                    disabled={isCanonical || contactMergingInFlight}
                                    onChange={() => setContactMergeSelection(prev => {
                                      const cur = prev[g.key] || { canonicalId, includeIds: new Set<string>() };
                                      const next = new Set(cur.includeIds);
                                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                      return { ...prev, [g.key]: { ...cur, includeIds: next } };
                                    })}
                                    title={isCanonical ? 'Canonical row is always included' : 'Include this row in the merge'}
                                  />
                                </td>
                                <td className="px-3 py-2 truncate max-w-[180px]" title={c.company_name || ''}>
                                  {c.company_name || <span className="text-gray-300">—</span>}
                                  {isCanonical && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">canonical</span>}
                                </td>
                                <td className="px-3 py-2 truncate max-w-[160px]" title={c.title || ''}>{c.title || <span className="text-gray-300">—</span>}</td>
                                <td className="px-3 py-2 text-xs truncate max-w-[160px]" title={c.email || ''}>
                                  {c.email ? (
                                    <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">{c.email}</a>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[150px]" title={phones}>{phones}</td>
                                <td className="px-2 py-2 text-center tabular-nums">{c.confidence_score ?? 0}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {activeContactMergeGroups.length === 0 && (
                <p className="text-sm text-gray-500 italic text-center py-10">No merge candidates detected.</p>
              )}
            </div>

            <div className="p-4 border-t bg-white flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {(() => {
                  const totalMerges = activeContactMergeGroups.reduce((n, g) => {
                    const sel = contactMergeSelection[g.key] || defaultMergeSelection(g.items);
                    return n + Array.from(sel.includeIds).filter(id => id !== sel.canonicalId).length;
                  }, 0);
                  return totalMerges > 0
                    ? `${totalMerges} contact${totalMerges === 1 ? '' : 's'} will be merged into their canonical.`
                    : 'No merges queued yet.';
                })()}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => { setShowContactMerge(false); setContactManualMergeGroup(null); }} disabled={contactMergingInFlight}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmContactMerges}
                  disabled={contactMergingInFlight || activeContactMergeGroups.every(g => {
                    const sel = contactMergeSelection[g.key] || defaultMergeSelection(g.items);
                    return Array.from(sel.includeIds).filter(id => id !== sel.canonicalId).length === 0;
                  })}
                  className="bg-purple-700 hover:bg-purple-800 text-white"
                >
                  {contactMergingInFlight ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Merging…</>) : (<><GitMerge className="w-4 h-4 mr-2" /> Confirm merges</>)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Delete Selected Contacts Confirmation */}
      {showDeleteContactsConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !deletingContacts && setShowDeleteContactsConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Delete {selectedContactIds.size} contact{selectedContactIds.size === 1 ? '' : 's'}?
                  </h3>
                  <p className="text-sm text-gray-500">This removes them from the database permanently.</p>
                </div>
              </div>
            </div>
            <div className="p-6 text-sm text-gray-700 space-y-2">
              <p>
                The selected contact{selectedContactIds.size === 1 ? '' : 's'} will be deleted from <code className="text-xs bg-gray-100 px-1 rounded">marketing_contacts</code>.
                Company contact counts will refresh on the next load.
              </p>
              <p className="text-xs text-gray-500">
                If any of these came from Crelate, re-running Find Contacts will pull them back in —
                block the contact at the source if you want them gone for good.
              </p>
            </div>
            <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteContactsConfirm(false)}
                disabled={deletingContacts}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteSelectedContacts}
                disabled={deletingContacts}
                className="bg-[#911406] hover:bg-[#7a1005] text-white"
              >
                {deletingContacts ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" /> Delete {selectedContactIds.size}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe All Contacts Confirmation */}
      {showWipeContactsConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !wipingContacts && setShowWipeContactsConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Wipe ALL contacts?
                  </h3>
                  <p className="text-sm text-gray-500">This deletes every row in marketing_contacts.</p>
                </div>
              </div>
            </div>
            <div className="p-6 text-sm text-gray-700 space-y-2">
              <p>
                All <strong>{contacts.length}</strong> contact{contacts.length === 1 ? '' : 's'} will be permanently removed and every company's contact_count will be reset to 0. This cannot be undone.
              </p>
              <p className="text-xs text-gray-500">
                Use this to start over with the new About/Team + LinkedIn-only discovery. You can rebuild the list by pressing Find Contacts afterwards.
              </p>
            </div>
            <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowWipeContactsConfirm(false)}
                disabled={wipingContacts}
              >
                Cancel
              </Button>
              <Button
                onClick={handleWipeAllContacts}
                disabled={wipingContacts}
                className="bg-[#911406] hover:bg-[#7a1005] text-white"
              >
                {wipingContacts ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Wiping…</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" /> Wipe {contacts.length} contact{contacts.length === 1 ? '' : 's'}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Find Contacts Results Dialog — shows the final breakdown for
          the most recent completed (or failed) run. Auto-opens when a
          run finishes; re-opens via the "Last run details" button. */}
      {showContactRunResult && contactRunResult && (() => {
        const r = contactRunResult;
        const isAll = r.mode === 'all';
        const isEnrich = r.mode === 'enrich';
        const succeeded = r.status === 'completed';
        const per: any[] = Array.isArray(r.per_item) ? r.per_item : [];
        const companiesWithAdds = per.filter(p => (p.ai_added + p.crelate_added + p.apollo_added + p.leadership_added) > 0);
        const companiesWithErrors = per.filter(p => Array.isArray(p.errors) && p.errors.length > 0);
        // Enrich-specific bookkeeping: a contact was enriched if at least
        // one field was filled; otherwise we surface the per-contact
        // skip_reason so the user knows why it was a no-op.
        const enrichedCount = isEnrich ? per.filter(p => Array.isArray(p.fields_updated) && p.fields_updated.length > 0).length : 0;
        const skippedContacts = isEnrich ? per.filter(p => !p.fields_updated || p.fields_updated.length === 0) : [];
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowContactRunResult(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${succeeded ? 'bg-emerald-100' : 'bg-red-100'} flex items-center justify-center`}>
                    {succeeded
                      ? <Users className="w-5 h-5 text-emerald-700" />
                      : <AlertTriangle className="w-5 h-5 text-red-700" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      {succeeded
                        ? (isEnrich ? 'Enrich complete' : 'Find Contacts complete')
                        : (isEnrich ? 'Enrich failed' : 'Find Contacts failed')}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {isEnrich
                        ? `${r.items_processed || 0} of ${r.items_total || 0} contacts processed`
                        : isAll
                          ? `${r.items_processed || 0} of ${r.items_total || 0} companies processed`
                          : `Target: ${r.target_company_name || 'company'}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowContactRunResult(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {/* Top-line counter */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                  <p className="text-4xl font-bold text-emerald-700 tabular-nums">
                    {isEnrich ? enrichedCount : (r.contacts_added || 0)}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-emerald-900/70 font-semibold mt-1">
                    {isEnrich
                      ? `contact${enrichedCount === 1 ? '' : 's'} enriched${r.items_total ? ` of ${r.items_total}` : ''}`
                      : `new contact${(r.contacts_added || 0) === 1 ? '' : 's'} added`}
                  </p>
                  {isEnrich && enrichedCount === 0 && r.items_total > 0 && (
                    <p className="text-xs text-amber-700 mt-1 font-medium">
                      No fields were filled — see diagnostics + per-contact reasons below.
                    </p>
                  )}
                  {!isEnrich && (r.duplicates_skipped || 0) > 0 && (
                    <p className="text-xs text-emerald-900/60 mt-1">{r.duplicates_skipped} duplicate{r.duplicates_skipped === 1 ? '' : 's'} skipped</p>
                  )}
                </div>

                {/* Per-source breakdown */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">By source</h4>
                  <div className="grid grid-cols-6 gap-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800 tabular-nums">{r.ai_added || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">SerpAPI+AI</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-800 tabular-nums">{r.lusha_added || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mt-0.5">Lusha 📞</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800 tabular-nums">{r.apollo_added || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Apollo</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800 tabular-nums">{r.emails_verified || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Hunter ✉️</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800 tabular-nums">{r.leadership_added || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Leadership</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800 tabular-nums">{r.crelate_added || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Crelate</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Lusha is the primary phone source (direct dials + mobiles). It's skipped for contacts that already have both email + phone to preserve credits.
                  </p>
                </div>

                {/* Diagnostics panel for enrich runs — shows the blob
                    the edge function writes to error_message on
                    success/failure so we can see what sources were
                    configured, how many rows loaded, and totals even
                    when per_item is empty. */}
                {isEnrich && r.error_message && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <h4 className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-1.5">Diagnostics</h4>
                    <p className="text-[11px] text-slate-700 font-mono break-all leading-relaxed">{r.error_message}</p>
                  </div>
                )}

                {/* Per-row detail. For enrich: one row per contact with
                    the specific fields that got filled OR a reason why
                    nothing happened. For find: one row per company with
                    source-column counters. */}
                {per.length > 0 && isEnrich && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                      Per contact ({enrichedCount}/{per.length} enriched)
                    </h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Contact</th>
                            <th className="text-left px-3 py-2 font-semibold">Fields filled / Skip reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {per.map((p, i) => {
                            const filled: string[] = Array.isArray(p.fields_updated) ? p.fields_updated : [];
                            const wasEnriched = filled.length > 0;
                            return (
                              <tr key={i} className={`border-t border-gray-100 align-top ${wasEnriched ? 'text-gray-800' : 'text-gray-500'}`}>
                                <td className="px-3 py-2 font-medium truncate max-w-[200px]" title={p.label}>{p.label}</td>
                                <td className="px-3 py-2">
                                  {wasEnriched ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {filled.map(f => (
                                        <span key={f} className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                          {f}
                                        </span>
                                      ))}
                                      {p.lusha_added ? (
                                        <span className="text-[10px] text-emerald-700 font-medium">via Lusha</span>
                                      ) : null}
                                      {p.apollo_matched && (
                                        <span className="text-[10px] text-gray-400">via Apollo</span>
                                      )}
                                      {p.hunter_matched && (
                                        <span className="text-[10px] text-gray-400">· Hunter email</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="text-[11px] italic">
                                        {p.skip_reason || (Array.isArray(p.errors) && p.errors.length > 0 ? p.errors.join(' · ') : 'no change')}
                                      </span>
                                      {/* Surface Lusha's raw response
                                          shape when it was attempted
                                          but matched nothing — lets us
                                          tell whether Lusha's parser
                                          needs another response shape. */}
                                      {p.lusha_attempted && !p.lusha_matched && p.lusha_debug && (
                                        <details className="text-[10px] text-gray-400 mt-0.5">
                                          <summary className="cursor-pointer hover:text-gray-600">Lusha raw</summary>
                                          <pre className="whitespace-pre-wrap break-all font-mono bg-gray-50 p-1.5 rounded mt-0.5">{String(p.lusha_debug)}</pre>
                                        </details>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Helpful context when nothing was enriched. */}
                    {enrichedCount === 0 && per.length > 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                        <p className="font-semibold mb-1">Why are zero contacts enriched?</p>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-900/90">
                          <li>Apollo's <strong>free tier</strong> returns a profile but locks the email/phone behind credits — so those fields don't flow through. LinkedIn URL and title <em>should</em> still come through on free.</li>
                          <li>If your companies don't have a <strong>website</strong> set, matching falls back to organization name which is noisier. Set the company's website on the Companies tab and re-run.</li>
                          <li>The person may genuinely not be in Apollo's database, or their Apollo profile has no data to add beyond what you already have.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {per.length > 0 && !isEnrich && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                      Per company ({companiesWithAdds.length}/{per.length} produced contacts)
                    </h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[260px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Company</th>
                            <th className="text-right px-2 py-2 font-semibold" title="Leadership page">Lead</th>
                            <th className="text-right px-2 py-2 font-semibold">Apollo</th>
                            <th className="text-right px-2 py-2 font-semibold">AI</th>
                            <th className="text-right px-2 py-2 font-semibold">Crelate</th>
                            <th className="text-right px-2 py-2 font-semibold" title="Hunter-verified emails">Email</th>
                            <th className="text-right px-2 py-2 font-semibold" title="Duplicates skipped">Dup</th>
                          </tr>
                        </thead>
                        <tbody>
                          {per.map((p, i) => {
                            const total = (p.ai_added || 0) + (p.crelate_added || 0) + (p.apollo_added || 0) + (p.leadership_added || 0);
                            return (
                              <tr key={i} className={`border-t border-gray-100 ${total === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
                                <td className="px-3 py-1.5 truncate max-w-[200px]" title={p.label}>{p.label}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{p.leadership_added || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{p.apollo_added || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{p.ai_added || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{p.crelate_added || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{p.emails_verified || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{p.duplicates_skipped || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Errors surfacing — e.g. Apollo 401 / credit exhaustion.
                    For successful enrich runs, the diagnostic blob lives
                    in its own panel above so we don't double-render it
                    here as an "Issue". */}
                {(companiesWithErrors.length > 0 || (r.error_message && !(isEnrich && succeeded))) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <h4 className="text-xs uppercase tracking-wider text-amber-800 font-semibold mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Issues
                    </h4>
                    {r.error_message && !(isEnrich && succeeded) && (
                      <p className="text-xs text-amber-900 font-mono bg-white/60 p-2 rounded mb-2">{r.error_message}</p>
                    )}
                    {companiesWithErrors.length > 0 && (
                      <ul className="text-xs text-amber-900 space-y-1 max-h-[120px] overflow-y-auto">
                        {companiesWithErrors.slice(0, 15).map((p, i) => (
                          <li key={i}>
                            <span className="font-medium">{p.label}:</span> {(p.errors as string[]).join(' · ')}
                          </li>
                        ))}
                        {companiesWithErrors.length > 15 && (
                          <li className="italic">…and {companiesWithErrors.length - 15} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                <p className="text-[11px] text-gray-500">
                  {r.started_at && `Started ${new Date(r.started_at).toLocaleTimeString()}`}
                  {r.completed_at && r.started_at && ` · duration ${Math.max(1, Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000))}s`}
                </p>
                <div className="flex items-center gap-2">
                  {!isAll && r.target_company_name && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchContacts(r.target_company_name);
                        setActiveTab('contacts');
                        setShowContactRunResult(false);
                      }}
                    >
                      View contacts at {r.target_company_name}
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowContactRunResult(false)}
                    className="bg-[#911406] hover:bg-[#7a1005] text-white"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Import Tool Dialog */}
      {showImportTool && (
        <ImportTool
          onComplete={loadData}
          onClose={() => setShowImportTool(false)}
        />
      )}

      {/* Data Cleanup Dialog */}
      {showCleanup && (
        <DataCleanup
          onClose={() => setShowCleanup(false)}
          onComplete={loadData}
        />
      )}

      {/* Push to Crelate Dialog */}
      {showPushToCrelate && (
        <PushToCrelate
          companies={companies}
          contacts={contacts}
          jobs={jobs}
          onClose={() => setShowPushToCrelate(false)}
          onComplete={loadData}
        />
      )}



      {/* Missing Titles Report Dialog */}
      {showMissingTitles && (
        <MissingTitlesReport
          standalone
          onClose={() => setShowMissingTitles(false)}
        />
      )}

      {/* Title Mapping Dialog */}
      {showTitleMapping && (
        <TitleMapping
          onClose={() => setShowTitleMapping(false)}
        />
      )}
    </div>




  );
};

export default MarketingNewJobs;
