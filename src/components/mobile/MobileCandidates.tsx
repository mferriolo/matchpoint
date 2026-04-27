import React, { useEffect, useMemo, useState } from 'react';
import { Users, Search, Plus, Phone, Mail, MapPin, ChevronRight, X, Linkedin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Candidate } from '@/types/candidate';
import CandidateUpload from '@/components/candidates/CandidateUpload';

interface MobileCandidatesProps {
  /** Wired by AppLayout — switches to live-call view when a call starts. */
  onStartCall?: () => void;
}

/**
 * Mobile-first candidate list. Loads from the same `candidates` table as
 * the desktop CandidateDashboard so additions on either side flow both
 * ways. Reuses the existing CandidateUpload modal for adding (it already
 * works well on phones — full-screen sheet, single-column form).
 *
 * Power-user flows (skill/job-type filtering, batch select, side-by-side
 * detail panel) live on desktop; the mobile detail sheet shows the most
 * useful per-candidate fields plus tap-to-call/email/LinkedIn actions.
 */
const MobileCandidates: React.FC<MobileCandidatesProps> = () => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Candidate | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    } else {
      setCandidates(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Cross-tab sync: CandidateUpload dispatches this event on save so the
  // list stays fresh when the upload modal closes.
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('candidatesUpdated', handler);
    return () => window.removeEventListener('candidatesUpdated', handler);
  }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return candidates.filter(c => {
      const cc = (c as any).current_company || '';
      return !s ||
        `${c.first_name || ''} ${c.last_name || ''} ${c.current_job_title || ''} ${cc} ${c.location || ''}`
          .toLowerCase()
          .includes(s);
    });
  }, [candidates, search]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-3 py-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}…`}
            className="pl-9 h-10 text-sm"
          />
        </div>
        <Button
          onClick={() => setShowUpload(true)}
          className="w-full mt-2 bg-[#911406] hover:bg-[#911406]/90 text-white"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add Candidate
        </Button>
      </div>

      <div className="px-3 py-3 space-y-2 flex-1">
        {loading && <div className="text-center py-10 text-sm text-gray-500">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            {search ? 'No matches.' : 'No candidates yet.'}
          </div>
        )}
        {!loading && filtered.map(c => (
          <button
            key={c.id}
            onClick={() => setActive(c)}
            className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 active:bg-gray-50 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900 truncate">
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)'}
                </h3>
                {c.current_job_title && (
                  <p className="text-xs text-gray-600 truncate mt-0.5">{c.current_job_title}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                  {(c as any).current_company && <span className="truncate">{(c as any).current_company}</span>}
                  {c.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {c.location}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
            </div>
          </button>
        ))}
      </div>

      {active && <CandidateDetailSheet candidate={active} onClose={() => setActive(null)} />}

      {showUpload && (
        <CandidateUpload
          onClose={() => setShowUpload(false)}
          onCandidateAdded={() => {
            setShowUpload(false);
            load();
          }}
        />
      )}
    </div>
  );
};

const CandidateDetailSheet: React.FC<{ candidate: Candidate; onClose: () => void }> = ({ candidate: c, onClose }) => {
  const cellPhone = (c as any).cell_phone || (c as any).phone || (c as any).phone_cell;
  const homePhone = (c as any).home_phone || (c as any).phone_home;
  const personalEmail = (c as any).personal_email || (c as any).email;
  const workEmail = (c as any).work_email;
  const linkedin = (c as any).linkedin_url;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between h-14 px-4 bg-[#911406] text-white flex-shrink-0">
        <button onClick={onClose} className="p-2 -ml-2 rounded hover:bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-base">Candidate</h2>
        <span className="w-9" />
      </header>
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-3">
        <h3 className="text-lg font-bold text-gray-900">
          {[c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)'}
        </h3>
        {c.current_job_title && (
          <p className="text-sm text-gray-600">
            {c.current_job_title}{(c as any).current_company ? ` at ${(c as any).current_company}` : ''}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {cellPhone && <ActionLink icon={Phone} label="Call cell" href={`tel:${cellPhone}`} />}
          {homePhone && <ActionLink icon={Phone} label="Call home" href={`tel:${homePhone}`} />}
          {personalEmail && <ActionLink icon={Mail} label="Email" href={`mailto:${personalEmail}`} />}
          {linkedin && <ActionLink icon={Linkedin} label="LinkedIn" href={linkedin} />}
        </div>
        <Field label="Personal email" value={personalEmail} />
        <Field label="Work email" value={workEmail} />
        <Field label="Cell" value={cellPhone} />
        <Field label="Home" value={homePhone} />
        <Field label="Location" value={c.location} />
        <Field label="Summary" value={(c as any).summary} />
        <Field
          label="Skills"
          value={Array.isArray(c.skills) && c.skills.length > 0 ? c.skills.join(', ') : null}
        />
        <p className="text-[11px] text-gray-400 italic pt-4 text-center">
          Editing, presentation generation, and bulk actions are available on desktop.
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

export default MobileCandidates;
