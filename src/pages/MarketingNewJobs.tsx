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
  Ban, RotateCcw, Eye, EyeOff, Pencil, Filter, X, Copy, GitMerge
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
import { exportMasterSheet, exportNewDataSheet } from '@/utils/xlsxExport';




const MarketingNewJobs: React.FC = () => {
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
    | 'first_name' | 'last_name' | 'company_name' | 'title'
    | 'email' | 'phone_work' | 'phone_home' | 'phone_cell'
    | 'source' | 'created_at' | 'linkedin_url' | 'confidence_score';
  const [contactSortField, setContactSortField] = useState<ContactSortField>('confidence_score');
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

  const handleContactSort = (f: ContactSortField) => {
    if (contactSortField === f) setContactSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setContactSortField(f); setContactSortDir('asc'); }
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

  // Duplicate-review state. Groups are computed client-side from the
  // already-loaded contacts list (no edge function needed for detection
  // itself). Per-group LinkedIn lookups are on-demand; the user picks
  // which group to check, we call lookup-linkedin-profile for that one.
  const [showDuplicateReview, setShowDuplicateReview] = useState(false);
  const [duplicateLinkedin, setDuplicateLinkedin] = useState<Record<string, { linkedinUrl: string|null; currentCompany: string|null; currentTitle: string|null; snippet?: string; cached?: boolean; cachedAgeDays?: number; extractionSource?: string|null; alternativeProfiles?: { linkedinUrl: string; title: string; snippet: string }[]; manualOverride?: boolean }>>({});
  // Per-group state for the "paste URL" input so each group has its own draft.
  const [duplicateManualUrlDraft, setDuplicateManualUrlDraft] = useState<Record<string, string>>({});
  // Set of group keys currently being looked up so multiple in-flight
  // LinkedIn queries each show their own spinner. Previously this was
  // a single string, so clicking a second "Check LinkedIn" button
  // visually reset the first one while it was still processing.
  const [duplicateLookingUp, setDuplicateLookingUp] = useState<Set<string>>(new Set());
  const [duplicateDeleteIds, setDuplicateDeleteIds] = useState<Set<string>>(new Set());
  const [duplicateDeleting, setDuplicateDeleting] = useState(false);
  const [duplicateReplacing, setDuplicateReplacing] = useState<string | null>(null);

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

  // Ask the lookup-linkedin-profile function where a named person
  // currently works. Stores the result keyed by group key so the UI
  // can show it beside each duplicate group.
  const handleLookupLinkedinForGroup = async (groupKey: string, firstName: string, lastName: string, hintCompany?: string, force = false, manualUrl?: string) => {
    setDuplicateLookingUp(prev => { const next = new Set(prev); next.add(groupKey); return next; });
    try {
      const { data, error } = await supabase.functions.invoke('lookup-linkedin-profile', {
        body: { firstName, lastName, company: hintCompany || undefined, force, manualUrl: manualUrl || undefined },
      });
      if (error) {
        // supabase-js wraps 4xx/5xx responses in a FunctionsHttpError
        // whose .message is just "Edge Function returned a non-2xx
        // status code". The actual error is in .context (a Response).
        let detail = error.message || 'Unknown error';
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.text === 'function') {
            const raw = await ctx.text();
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.error) detail = parsed.error;
              else if (raw) detail = raw.slice(0, 500);
            } catch {
              if (raw) detail = raw.slice(0, 500);
            }
          }
        } catch {}
        console.error('lookup-linkedin-profile error detail:', detail);
        throw new Error(detail);
      }
      if (!data?.success) throw new Error(data?.error || 'Lookup failed');
      setDuplicateLinkedin(prev => ({
        ...prev,
        [groupKey]: {
          linkedinUrl: data.linkedinUrl || null,
          currentCompany: data.currentCompany || null,
          currentTitle: data.currentTitle || null,
          snippet: data.snippet || undefined,
          cached: !!data.cached,
          cachedAgeDays: data.cached_age_days || undefined,
          extractionSource: data.extraction_source || null,
          alternativeProfiles: Array.isArray(data.alternative_profiles) ? data.alternative_profiles : [],
          manualOverride: !!data.manual_override,
        },
      }));
    } catch (err: any) {
      toast({ title: 'LinkedIn lookup failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setDuplicateLookingUp(prev => { const next = new Set(prev); next.delete(groupKey); return next; });
    }
  };

  // Delete every contact the user checked for removal in the duplicate-
  // review dialog. Single DELETE ... WHERE id IN (...) call.
  const handleDeleteMarkedDuplicates = async () => {
    if (duplicateDeleteIds.size === 0) return;
    setDuplicateDeleting(true);
    try {
      const ids = Array.from(duplicateDeleteIds);
      const { error } = await supabase.from('marketing_contacts').delete().in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} duplicate${ids.length === 1 ? '' : 's'} deleted` });
      setDuplicateDeleteIds(new Set());
      setShowDuplicateReview(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setDuplicateDeleting(false);
    }
  };

  const toggleDuplicateDelete = (id: string) => {
    setDuplicateDeleteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Replace every record in a duplicate group with a single new record
  // reflecting the person's current company + title (from LinkedIn).
  // Used when the LinkedIn lookup shows the person now works somewhere
  // NOT represented by any of their existing records. Looks up the
  // matching marketing_companies row (if any) so the new contact is
  // properly linked; falls back to an unlinked row with just
  // company_name if the company isn't on file yet.
  const handleReplaceGroupWithNewAtCompany = async (group: { key: string; name: string; contacts: any[] }, currentCompany: string, currentTitle: string | null, linkedinUrl: string | null) => {
    if (!currentCompany) return;
    const confirmReplace = window.confirm(
      `Delete all ${group.contacts.length} existing record${group.contacts.length === 1 ? '' : 's'} for ${group.name} and create one new record at "${currentCompany}"${currentTitle ? ` (${currentTitle})` : ''}?`
    );
    if (!confirmReplace) return;
    setDuplicateReplacing(group.key);
    try {
      // Try to find an existing marketing_companies row whose name is a
      // loose match for the LinkedIn-reported current company. We'd
      // rather link the new contact properly than leave company_id null.
      const { data: candidateCompanies } = await supabase
        .from('marketing_companies')
        .select('id, company_name')
        .ilike('company_name', `%${currentCompany.split(' ')[0]}%`)
        .limit(10);
      const matchedCompany = (candidateCompanies || []).find(co => companyMatches(co.company_name, currentCompany)) || null;

      const nameParts = group.name.trim().split(/\s+/);
      const fn = nameParts[0] || '';
      const ln = nameParts.slice(1).join(' ') || '';

      const { error: insertErr } = await supabase.from('marketing_contacts').insert({
        first_name: fn,
        last_name: ln,
        company_name: currentCompany,
        company_id: matchedCompany?.id || null,
        title: currentTitle || '',
        linkedin_url: linkedinUrl || null,
        source: 'LinkedIn (dedup replace)',
        source_url: linkedinUrl || null,
        is_verified: true,
        notes: `Created via duplicate-review replace action on ${new Date().toISOString().slice(0, 10)} — previous ${group.contacts.length} record${group.contacts.length === 1 ? '' : 's'} deleted.`,
      });
      if (insertErr) throw insertErr;

      const ids = group.contacts.map(c => c.id);
      const { error: delErr } = await supabase.from('marketing_contacts').delete().in('id', ids);
      if (delErr) throw delErr;

      // Clean up any marked-for-deletion IDs that just got deleted so
      // the footer count updates immediately.
      setDuplicateDeleteIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });

      toast({
        title: `Replaced ${ids.length} record${ids.length === 1 ? '' : 's'} for ${group.name} with new at ${currentCompany}${matchedCompany ? '' : ' (unlinked — company not found in database)'}`,
      });
      loadData();
    } catch (err: any) {
      toast({ title: 'Replace failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setDuplicateReplacing(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('tracker');
  const [showImportTool, setShowImportTool] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showPushToCrelate, setShowPushToCrelate] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showMissingTitles, setShowMissingTitles] = useState(false);
  const [showTitleMapping, setShowTitleMapping] = useState(false);
  const [scrapingDescs, setScrapingDescs] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);

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
    'Value Based Care (VBC)', 'PACE Medical Groups', 'Health Plans',
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

  const openEditContact = (c: any) => {
    setEditingContact(c);
    setEditingContactDraft({
      first_name: c.first_name ?? '',
      last_name: c.last_name ?? '',
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
      for (const k of ['title', 'email', 'phone_work', 'phone_home', 'phone_cell', 'linkedin_url', 'source', 'notes']) {
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



  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.allSettled([
        supabase.from('marketing_jobs').select('*').order('created_at', { ascending: false }),
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
      }
    } catch (err: any) {
      console.error('Critical error loading data:', err);
      setLoadError(err.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleClearAllData = async () => {
    setClearing(true);
    try {
      // Delete in order: contacts, jobs, then companies (due to foreign keys)
      const { error: e1 } = await supabase.from('marketing_contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e1) console.warn('Error clearing contacts:', e1.message);
      
      const { error: e2 } = await supabase.from('marketing_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e2) console.warn('Error clearing jobs:', e2.message);
      
      const { error: e3 } = await supabase.from('marketing_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e3) console.warn('Error clearing companies:', e3.message);

      const { error: e4 } = await supabase.from('tracker_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e4) console.warn('Error clearing tracker runs:', e4.message);

      toast({ title: 'All Data Cleared', description: 'All companies, jobs, contacts, and tracker history have been deleted.' });
      setShowClearConfirm(false);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

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
  const handleScrapeDescriptions = async () => {
    setScrapingDescs(true);
    setScrapeResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-job-descriptions', {
        body: { action: 'scrape', limit: 50 }
      });
      if (error) throw error;
      setScrapeResult(data);
      toast({
        title: 'Scraping complete',
        description: `${data?.summary?.scraped || 0} descriptions scraped, ${data?.summary?.failed || 0} failed`,
      });
    } catch (e: any) {
      toast({ title: 'Scrape failed', description: e.message, variant: 'destructive' });
    } finally {
      setScrapingDescs(false);
    }
  };

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

  // Duplicate groups: contacts sharing the same first + last name
  // (case-insensitive). Groups are ordered by biggest first so the
  // user can tackle the worst offenders. Within each group, records
  // are sorted most-recently-added first since those are usually the
  // more authoritative current ones.
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const c of contacts) {
      const fn = (c.first_name || '').toLowerCase().trim();
      const ln = (c.last_name || '').toLowerCase().trim();
      if (!fn && !ln) continue;
      const key = `${fn}|${ln}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries())
      .filter(([, items]) => items.length >= 2)
      .map(([key, items]) => ({
        key,
        name: `${items[0].first_name || ''} ${items[0].last_name || ''}`.trim() || '(unnamed)',
        contacts: items.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      }))
      .sort((a, b) => b.contacts.length - a.contacts.length);
  }, [contacts]);

  // Fuzzy company-name match used to score which record in a duplicate
  // group best matches the currentCompany from LinkedIn. Lowercase +
  // substring-in-either-direction is enough for most recruiting
  // scenarios (e.g. "UnitedHealth Group" ≈ "UnitedHealthcare").
  const companyMatches = (a: string | null | undefined, b: string | null | undefined): boolean => {
    if (!a || !b) return false;
    const A = a.toLowerCase().trim();
    const B = b.toLowerCase().trim();
    if (!A || !B) return false;
    if (A === B) return true;
    if (A.includes(B) || B.includes(A)) return true;
    // Strip common suffixes and recompare.
    const strip = (s: string) => s.replace(/\b(inc|llc|corp|corporation|group|healthcare|health|medical|system|systems|care|pllc|pc)\.?\b/g, '').replace(/\s+/g, ' ').trim();
    const sA = strip(A); const sB = strip(B);
    if (sA && sB && (sA === sB || sA.includes(sB) || sB.includes(sA))) return true;
    return false;
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
      filterLinkedInPresence, filterAnyPhonePresence, filterConfidence]);

  // Options shown in the Confidence column's filter popover. Stringified
  // numbers so MultiSelectColumnHeader's string-Set matches our scores.
  const CONFIDENCE_OPTIONS = ['5', '4', '3', '2', '1', '0'];

  const openJobsCount = jobs.filter(j => !j.is_closed && j.status !== 'Closed').length;
  const closedJobsCount = jobs.filter(j => j.is_closed || j.status === 'Closed').length;
  const highPriorityCount = companies.filter(c => c.is_high_priority).length;
  const highPriorityJobsCount = jobs.filter(j => j.high_priority && !j.is_closed && j.status !== 'Closed').length;
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
            onClick={handleScrapeDescriptions}
            disabled={scrapingDescs}
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            title="Scrape job descriptions from job listing URLs"
          >
            {scrapingDescs ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {scrapingDescs ? 'Scraping...' : 'Scrape Descriptions'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportTool(true)}
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Upload className="w-4 h-4" /> Import Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Clear All
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
              <Building2 className="w-4 h-4" />Companies ({companies.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Users className="w-4 h-4" />Contacts ({contacts.length})
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
                        <tr key={c.id} className={`border-b transition-colors ${blocked ? 'bg-gray-100 opacity-60' : isSelected ? 'bg-amber-50 hover:bg-amber-100/50' : (c.is_high_priority ? 'bg-amber-50/50 hover:bg-amber-100/50' : !hasOpenRoles ? 'opacity-60 hover:bg-gray-50' : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50')}`}>
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
                  onClick={() => { setDuplicateDeleteIds(new Set()); setShowDuplicateReview(true); }}
                  disabled={duplicateGroups.length === 0}
                  className="text-gray-700"
                  title={duplicateGroups.length === 0 ? 'No duplicate contacts detected' : `${duplicateGroups.length} name${duplicateGroups.length === 1 ? '' : 's'} with multiple records`}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Deduplicate{duplicateGroups.length > 0 ? ` (${duplicateGroups.length})` : ''}
                </Button>
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
                      onClick={() => setShowDeleteContactsConfirm(true)}
                      className="bg-[#911406] hover:bg-[#7a1005] text-white"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Delete {selectedContactIds.size}
                    </Button>
                  </div>
                </div>
              )}

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
                      <MultiSelectColumnHeader<ContactSortField> field="first_name" label="First Name" filterValues={filterFirstName} filterOptions={uniqueContactFirstNames} onFilterChange={setFilterFirstName} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />
                      <MultiSelectColumnHeader<ContactSortField> field="last_name" label="Last Name" filterValues={filterLastName} filterOptions={uniqueContactLastNames} onFilterChange={setFilterLastName} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />
                      <MultiSelectColumnHeader<ContactSortField> field="company_name" label="Company" filterValues={filterContactCompany} filterOptions={uniqueContactCompanies} onFilterChange={setFilterContactCompany} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />
                      <MultiSelectColumnHeader<ContactSortField> field="title" label="Title" filterValues={filterContactTitle} filterOptions={uniqueContactTitles} onFilterChange={setFilterContactTitle} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />
                      <MultiSelectColumnHeader<ContactSortField> field="email" label="Email" filterValues={filterEmailPresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterEmailPresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by Email presence" />
                      <MultiSelectColumnHeader<ContactSortField>
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
                      />
                      <MultiSelectColumnHeader<ContactSortField> field="phone_home" label="Phone (Home)" filterValues={filterPhoneHomePresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterPhoneHomePresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by Home Phone presence" />
                      <MultiSelectColumnHeader<ContactSortField> field="phone_cell" label="Phone (Cell)" filterValues={filterPhoneCellPresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterPhoneCellPresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by Cell Phone presence" />
                      <MultiSelectColumnHeader<ContactSortField> field="source" label="Source" filterValues={filterContactSource} filterOptions={uniqueContactSourceValues} onFilterChange={setFilterContactSource} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} />
                      <MultiSelectColumnHeader<ContactSortField> field="created_at" label="Date / Time Added" filterValues={filterDateAdded} filterOptions={uniqueContactDates} onFilterChange={setFilterDateAdded} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by date added" />
                      <MultiSelectColumnHeader<ContactSortField> field="linkedin_url" label="LinkedIn URL" filterValues={filterLinkedInPresence} filterOptions={PRESENCE_OPTIONS} onFilterChange={setFilterLinkedInPresence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by LinkedIn presence" />
                      <MultiSelectColumnHeader<ContactSortField> field="confidence_score" label="Confidence" filterValues={filterConfidence} filterOptions={CONFIDENCE_OPTIONS} onFilterChange={setFilterConfidence} sortField={contactSortField} sortDir={contactSortDir} onSort={handleContactSort} filterPanelLabel="Filter by confidence score" />
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
                      <tr><td colSpan={13} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></td></tr>
                    ) : filteredContacts.length === 0 ? (
                      <tr><td colSpan={13} className="text-center py-12 text-gray-500">No contacts found. Run the tracker or import data to add contacts.</td></tr>
                    ) : filteredContacts.map((c, idx) => {
                      // Derive LinkedIn URL: prefer linkedin_url field, then check source_url for LinkedIn links
                      const linkedinUrl = c.linkedin_url || 
                        (c.source_url && c.source_url.includes('linkedin.com/in/') ? c.source_url : '');

                      return (
                        <tr 
                          key={c.id} 
                          className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          } ${selectedContact?.id === c.id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                          onClick={() => setSelectedContact(selectedContact?.id === c.id ? null : c)}
                        >
                          {/* First Name */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium">
                            {c.first_name || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Last Name */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium">
                            {c.last_name || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Company */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium text-sm">
                            {c.company_name || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Title */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.title || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Email */}
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
                          {/* Phone (Work) */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.phone_work || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Phone (Home) */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.phone_home || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Phone (Cell) */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.phone_cell || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Source */}
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
                          {/* Date / Time Added — from marketing_contacts.created_at.
                              Rendered in the viewer's local timezone; hovering
                              reveals the full ISO timestamp. */}
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
                          {/* LinkedIn URL */}
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
                          {/* Confidence (0-5). Bar widens + recolors with score. */}
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
                          {/* Per-row Edit + Enrich buttons + selection
                              checkbox. stopPropagation so interacting
                              with any of them doesn't toggle the detail
                              panel via the row's onClick. */}
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
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
                          {selectedContact.first_name} {selectedContact.last_name}
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
                        <label className="text-xs text-gray-500 font-medium">Last Name</label>
                        <p className="text-sm text-gray-900">{selectedContact.last_name || '—'}</p>
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
                <p className="text-xs text-gray-500">{[editingContact.first_name, editingContact.last_name].filter(Boolean).join(' ') || '(unnamed)'}{editingContact.company_name ? ` · ${editingContact.company_name}` : ''}</p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">First name</label>
                  <Input value={editingContactDraft.first_name || ''} onChange={e => setEditingContactDraft(d => ({ ...d, first_name: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Last name</label>
                  <Input value={editingContactDraft.last_name || ''} onChange={e => setEditingContactDraft(d => ({ ...d, last_name: e.target.value }))} className="mt-1" />
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

      {/* Duplicate Review Dialog — groups contacts by name and lets
          the user see each person's records side by side, optionally
          check LinkedIn to find their current company, and tick the
          records to delete. */}
      {showDuplicateReview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !duplicateDeleting && setShowDuplicateReview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Copy className="w-5 h-5 text-blue-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">Duplicate contacts</h3>
                  <p className="text-sm text-gray-500">
                    {duplicateGroups.length} name{duplicateGroups.length === 1 ? '' : 's'} with multiple records.
                    Click <em>Check LinkedIn</em> to find each person's current company — the record that matches
                    gets highlighted as the one to keep.
                  </p>
                </div>
                <button
                  onClick={() => setShowDuplicateReview(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5 bg-gray-50">
              {duplicateGroups.map(g => {
                const li = duplicateLinkedin[g.key];
                const lookedUp = !!li;
                return (
                  <div key={g.key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-white flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{g.name}</h4>
                        <p className="text-xs text-gray-500">{g.contacts.length} records</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {lookedUp && li.linkedinUrl && (
                          <a
                            href={li.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100"
                          >
                            <Linkedin className="w-3 h-3" />
                            Profile
                          </a>
                        )}
                        {lookedUp ? (
                          <div className="text-xs text-right">
                            {li.currentCompany ? (
                              <>
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  <span>Current: <strong className="text-emerald-700">{li.currentCompany}</strong></span>
                                  {li.extractionSource && (
                                    <span
                                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                                        li.extractionSource === 'apollo' ? 'bg-emerald-100 text-emerald-800' :
                                        li.extractionSource === 'snippet' ? 'bg-teal-100 text-teal-800' :
                                        li.extractionSource === 'regex' ? 'bg-amber-100 text-amber-800' :
                                        'bg-orange-100 text-orange-800'
                                      }`}
                                      title={
                                        li.extractionSource === 'apollo'
                                          ? 'Apollo structured work history — most reliable'
                                          : li.extractionSource === 'snippet'
                                            ? 'Parsed from LinkedIn\'s Experience meta-description in the Google snippet — reflects the real current employer'
                                            : li.extractionSource === 'regex'
                                              ? 'LinkedIn headline via title regex — often the person\'s self-description rather than their employer. Verify against the profile.'
                                              : 'AI-extracted from Google snippet — verify against the profile'
                                      }
                                    >
                                      {li.extractionSource === 'apollo' ? 'Apollo' :
                                        li.extractionSource === 'snippet' ? 'Experience' :
                                        li.extractionSource === 'regex' ? 'Headline ⚠' : 'AI'}
                                    </span>
                                  )}
                                  {li.cached && (
                                    <span className="text-[9px] uppercase tracking-wider bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold" title={`Served from cache${li.cachedAgeDays !== undefined ? ` (${li.cachedAgeDays}d old)` : ''} — no SerpAPI credit used`}>
                                      Cached{li.cachedAgeDays !== undefined ? ` ${li.cachedAgeDays}d` : ''}
                                    </span>
                                  )}
                                </div>
                                {li.currentTitle && (
                                  <div className="text-gray-600 mt-0.5">Title: <span className="font-medium">{li.currentTitle}</span></div>
                                )}
                                {li.cached && (
                                  <button
                                    onClick={() => {
                                      const [fn, ...rest] = g.name.split(' ');
                                      const ln = rest.join(' ');
                                      handleLookupLinkedinForGroup(g.key, fn, ln, undefined, true);
                                    }}
                                    disabled={duplicateLookingUp.has(g.key)}
                                    className="text-[10px] text-gray-500 hover:text-[#911406] underline mt-1"
                                    title="Force a fresh SerpAPI lookup (bypasses the 30-day cache)"
                                  >
                                    {duplicateLookingUp.has(g.key) ? 'Refreshing…' : 'Refresh from SerpAPI'}
                                  </button>
                                )}
                                {/* Alternative LinkedIn profiles — for
                                    shared-name cases (e.g. two Julie
                                    Ittys). The user can pick a
                                    different profile or paste their own
                                    URL if they know the right one. */}
                                {((li.alternativeProfiles && li.alternativeProfiles.length > 0) || true) && (
                                  <details className="mt-1 text-left">
                                    <summary className="text-[10px] text-gray-500 hover:text-[#911406] cursor-pointer">
                                      Wrong profile? {li.alternativeProfiles && li.alternativeProfiles.length > 0 ? `${li.alternativeProfiles.length} other candidate${li.alternativeProfiles.length === 1 ? '' : 's'}` : 'Paste correct URL'}
                                    </summary>
                                    <div className="space-y-1 mt-1.5 bg-gray-50 border border-gray-200 rounded p-2">
                                      {(li.alternativeProfiles || []).map(alt => {
                                        const slug = (alt.linkedinUrl.match(/\/in\/([^\/\?]+)/) || [])[1] || alt.linkedinUrl;
                                        return (
                                          <div key={alt.linkedinUrl} className="flex items-start gap-2 text-[10px]">
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-gray-700 truncate" title={alt.title}>{alt.title || slug}</div>
                                              <div className="text-gray-400 truncate" title={alt.linkedinUrl}>{slug}</div>
                                            </div>
                                            <button
                                              onClick={() => {
                                                const [fn, ...rest] = g.name.split(' ');
                                                const ln = rest.join(' ');
                                                handleLookupLinkedinForGroup(g.key, fn, ln, undefined, true, alt.linkedinUrl);
                                              }}
                                              disabled={duplicateLookingUp.has(g.key)}
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#911406] text-white hover:bg-[#7a1005] flex-shrink-0"
                                            >
                                              Use
                                            </button>
                                          </div>
                                        );
                                      })}
                                      <div className="pt-1 border-t border-gray-200 mt-1">
                                        <input
                                          type="text"
                                          placeholder="https://linkedin.com/in/..."
                                          value={duplicateManualUrlDraft[g.key] || ''}
                                          onChange={e => setDuplicateManualUrlDraft(prev => ({ ...prev, [g.key]: e.target.value }))}
                                          className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 font-mono"
                                        />
                                        <button
                                          onClick={() => {
                                            const draft = duplicateManualUrlDraft[g.key]?.trim();
                                            if (!draft || !draft.includes('linkedin.com/in/')) {
                                              toast({ title: 'Enter a linkedin.com/in/… URL', variant: 'destructive' });
                                              return;
                                            }
                                            const [fn, ...rest] = g.name.split(' ');
                                            const ln = rest.join(' ');
                                            handleLookupLinkedinForGroup(g.key, fn, ln, undefined, true, draft);
                                            setDuplicateManualUrlDraft(prev => ({ ...prev, [g.key]: '' }));
                                          }}
                                          disabled={duplicateLookingUp.has(g.key)}
                                          className="mt-1 text-[10px] px-2 py-0.5 rounded bg-gray-700 text-white hover:bg-gray-800"
                                        >
                                          Look up this URL
                                        </button>
                                      </div>
                                    </div>
                                  </details>
                                )}
                              </>
                            ) : (
                              <div className="space-y-1">
                                <span className="text-gray-500 italic">
                                  {li.linkedinUrl
                                    ? `LinkedIn profile found but the company couldn't be extracted from the Google snippet.`
                                    : `No matching LinkedIn profile found for this person.`}
                                </span>
                                {li.linkedinUrl && (
                                  <div className="flex items-center gap-2 justify-end">
                                    <a
                                      href={li.linkedinUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100"
                                    >
                                      <Linkedin className="w-3 h-3" />
                                      Open profile
                                    </a>
                                    <span className="text-[9px] text-gray-400 truncate max-w-[160px]" title={li.linkedinUrl}>
                                      {(li.linkedinUrl.match(/\/in\/([^\/\?]+)/) || [])[1] || li.linkedinUrl}
                                    </span>
                                  </div>
                                )}
                                {li.snippet && (
                                  <details className="text-[10px] text-gray-400 cursor-pointer">
                                    <summary className="hover:text-gray-600">show raw snippet</summary>
                                    <pre className="whitespace-pre-wrap break-all font-mono bg-gray-50 p-2 rounded mt-1 max-w-xs text-left">{li.snippet}</pre>
                                  </details>
                                )}
                                <button
                                  onClick={() => {
                                    const [fn, ...rest] = g.name.split(' ');
                                    const ln = rest.join(' ');
                                    handleLookupLinkedinForGroup(g.key, fn, ln, undefined, true);
                                  }}
                                  disabled={duplicateLookingUp.has(g.key)}
                                  className="text-[11px] text-[#911406] hover:underline font-medium"
                                >
                                  {duplicateLookingUp.has(g.key) ? 'Refreshing…' : 'Re-run with fresh SerpAPI query'}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Don't pass a hint company — the group has
                              // multiple companies by definition and a
                              // stale hint biases Google toward old records.
                              // We verify the result matches the person
                              // by name on the server side.
                              const [fn, ...rest] = g.name.split(' ');
                              const ln = rest.join(' ');
                              handleLookupLinkedinForGroup(g.key, fn, ln);
                            }}
                            disabled={duplicateLookingUp.has(g.key)}
                          >
                            {duplicateLookingUp.has(g.key)
                              ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Checking…</>
                              : <><Linkedin className="w-3.5 h-3.5 mr-1" /> Check LinkedIn</>}
                          </Button>
                        )}
                      </div>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="text-center px-2 py-2 font-semibold w-[90px]">Delete?</th>
                          <th className="text-left px-3 py-2 font-semibold">Company</th>
                          <th className="text-left px-3 py-2 font-semibold">Title</th>
                          <th className="text-left px-3 py-2 font-semibold">Email</th>
                          <th className="text-left px-3 py-2 font-semibold">Phone(s)</th>
                          <th className="text-left px-3 py-2 font-semibold">LinkedIn</th>
                          <th className="text-left px-3 py-2 font-semibold">Source</th>
                          <th className="text-right px-3 py-2 font-semibold">Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.contacts.map(c => {
                          const marked = duplicateDeleteIds.has(c.id);
                          // If we've done a LinkedIn check, highlight the record that matches the current employer.
                          const isCurrent = lookedUp && li.currentCompany && companyMatches(c.company_name, li.currentCompany);
                          const phones = [c.phone_work, c.phone_home, c.phone_cell].filter(Boolean).join(' · ') || '—';
                          const linkedin = c.linkedin_url || (c.source_url?.includes('linkedin.com/in/') ? c.source_url : '') || '';
                          return (
                            <tr
                              key={c.id}
                              className={`border-t border-gray-100 align-top ${marked ? 'bg-red-50/50 text-gray-500' : isCurrent ? 'bg-emerald-50' : ''}`}
                            >
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={marked}
                                  onChange={() => toggleDuplicateDelete(c.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2 font-medium truncate max-w-[180px]" title={c.company_name || ''}>
                                {c.company_name || <span className="text-gray-300">—</span>}
                                {isCurrent && <span className="ml-1.5 inline-block text-[9px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 font-semibold uppercase tracking-wider">Current</span>}
                              </td>
                              <td className="px-3 py-2 truncate max-w-[160px]" title={c.title || ''}>{c.title || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 truncate max-w-[180px]" title={c.email || ''}>{c.email || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 truncate max-w-[160px]" title={phones}>{phones}</td>
                              <td className="px-3 py-2">
                                {linkedin
                                  ? <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">profile</a>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2 truncate max-w-[120px]" title={c.source || ''}>{c.source || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                                {c.created_at ? new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {/* After LinkedIn check: two shortcut actions.
                        (1) Mark all non-matching records for deletion —
                        useful when one existing record already matches
                        the current employer.
                        (2) Replace all with a new record — useful when
                        the person now works somewhere not in the group
                        (e.g. Sarah Brown has 6 old records, none at
                        her current DaVita role). */}
                    {lookedUp && li.currentCompany && (() => {
                      const hasMatchingRecord = g.contacts.some(c => companyMatches(c.company_name, li.currentCompany));
                      const nonMatchingCount = g.contacts.filter(c => !companyMatches(c.company_name, li.currentCompany)).length;
                      return (
                        <div className="px-4 py-2 border-t bg-white flex items-center justify-end gap-3 flex-wrap">
                          {hasMatchingRecord && (
                            <button
                              onClick={() => {
                                const next = new Set(duplicateDeleteIds);
                                for (const c of g.contacts) {
                                  if (!companyMatches(c.company_name, li.currentCompany)) next.add(c.id);
                                  else next.delete(c.id);
                                }
                                setDuplicateDeleteIds(next);
                              }}
                              className="text-[11px] text-[#911406] hover:underline font-medium"
                            >
                              Mark all non-matching ({nonMatchingCount}) for deletion
                            </button>
                          )}
                          <button
                            onClick={() => handleReplaceGroupWithNewAtCompany(g, li.currentCompany!, li.currentTitle, li.linkedinUrl)}
                            disabled={duplicateReplacing === g.key}
                            className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                            title={`Delete all ${g.contacts.length} existing records and create one new record at ${li.currentCompany}`}
                          >
                            {duplicateReplacing === g.key
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Replacing…</>
                              : <>Replace all with new at {li.currentCompany}{li.currentTitle ? ` (${li.currentTitle})` : ''}</>}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {duplicateGroups.length === 0 && (
                <p className="text-sm text-gray-500 italic text-center py-10">No duplicate names detected.</p>
              )}
            </div>

            <div className="p-4 border-t bg-white flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {duplicateDeleteIds.size} contact{duplicateDeleteIds.size === 1 ? '' : 's'} marked for deletion
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDuplicateReview(false)}
                  disabled={duplicateDeleting}
                >
                  Close
                </Button>
                <Button
                  onClick={handleDeleteMarkedDuplicates}
                  disabled={duplicateDeleteIds.size === 0 || duplicateDeleting}
                  className="bg-[#911406] hover:bg-[#7a1005] text-white"
                >
                  {duplicateDeleting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" /> Delete {duplicateDeleteIds.size}</>
                  )}
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

      {/* Clear All Data Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Clear All Data?</h3>
              <p className="text-sm text-gray-500 text-center mb-1">
                This will permanently delete:
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-4 space-y-1">
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 flex-shrink-0" />
                  <strong>{jobs.length}</strong> jobs
                </p>
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <strong>{companies.length}</strong> companies
                </p>
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <strong>{contacts.length}</strong> contacts
                </p>
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Database className="w-4 h-4 flex-shrink-0" />
                  All tracker run history
                </p>
              </div>
              <p className="text-xs text-red-600 text-center font-medium">
                This action cannot be undone. Export your data first if you need a backup.
              </p>
            </div>
            <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowClearConfirm(false)} disabled={clearing}>
                Cancel
              </Button>
              <Button
                onClick={handleClearAllData}
                disabled={clearing}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                {clearing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Clearing...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Yes, Clear Everything</>
                )}
              </Button>
            </div>
          </div>
        </div>
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
