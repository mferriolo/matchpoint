import React, { useMemo, useState } from 'react';
import { Briefcase, Search, Plus, Phone, ChevronRight, X, Building, Calendar, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCallPrompt } from '@/contexts/CallPromptContext';
import { useToast } from '@/hooks/use-toast';
import StartCallDialog from '@/components/StartCallDialog';
import { Job } from '@/types/callprompt';

interface MobileJobsProps {
  /** Wired by AppLayout — switches to live-call view when a call starts. */
  onStartCall?: () => void;
}

/**
 * Mobile-first jobs list. Reads the same useCallPrompt context as the
 * desktop JobsDashboard, so jobs added on desktop appear here and vice
 * versa. Power-user flows on the desktop dashboard (drag-reorder, bulk
 * delete, AI re-analyze, inline rename) intentionally remain desktop-only;
 * the mobile detail sheet shows a "edit on desktop" hint.
 */
const MobileJobs: React.FC<MobileJobsProps> = ({ onStartCall }) => {
  const { jobs } = useCallPrompt();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [showStartCall, setShowStartCall] = useState(false);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return jobs.filter(j =>
      !s || `${j.title || ''} ${j.company || ''} ${j.jobType || ''}`.toLowerCase().includes(s)
    );
  }, [jobs, search]);

  return (
    <div className="flex flex-col min-h-full">
      {/* Action bar */}
      <div className="px-3 py-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${jobs.length} job${jobs.length === 1 ? '' : 's'}…`}
            className="pl-9 h-10 text-sm"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            onClick={() => setShowStartCall(true)}
            className="flex-1 bg-[#911406] hover:bg-[#911406]/90 text-white"
          >
            <Phone className="w-4 h-4 mr-1.5" /> Start Call
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="px-3 py-3 space-y-2 flex-1">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            {search ? 'No matches.' : 'No jobs yet — add one on desktop.'}
          </div>
        )}
        {filtered.map(j => (
          <button
            key={j.id}
            onClick={() => setActiveJob(j)}
            className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 active:bg-gray-50 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900 truncate">{j.title || '(untitled)'}</h3>
                <p className="text-xs text-gray-600 truncate mt-0.5 flex items-center gap-1">
                  <Building className="w-3 h-3 flex-shrink-0" />
                  {j.company || '—'}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                  {j.jobType && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{j.jobType}</span>}
                  {j.createdAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(j.createdAt).toLocaleDateString()}
                    </span>
                  )}
                  {j.isActive === false && (
                    <span className="text-gray-400 italic">Inactive</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
            </div>
          </button>
        ))}
      </div>

      {activeJob && (
        <JobDetailSheet
          job={activeJob}
          onClose={() => setActiveJob(null)}
          onStartCallForJob={() => {
            setActiveJob(null);
            setShowStartCall(true);
          }}
        />
      )}

      <StartCallDialog
        open={showStartCall}
        onOpenChange={setShowStartCall}
        onCallStarted={() => {
          setShowStartCall(false);
          if (onStartCall) onStartCall();
          else toast({ title: 'Call started' });
        }}
      />
    </div>
  );
};

const JobDetailSheet: React.FC<{ job: Job; onClose: () => void; onStartCallForJob: () => void }> = ({ job, onClose, onStartCallForJob }) => (
  <div className="fixed inset-0 z-50 flex flex-col bg-white">
    <header className="flex items-center justify-between h-14 px-4 bg-[#911406] text-white flex-shrink-0">
      <button onClick={onClose} className="p-2 -ml-2 rounded hover:bg-white/10" aria-label="Close">
        <X className="w-5 h-5" />
      </button>
      <h2 className="font-semibold text-base">Job details</h2>
      <span className="w-9" />
    </header>
    <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-3">
      <h3 className="text-lg font-bold text-gray-900">{job.title || '(untitled)'}</h3>
      <p className="text-sm text-gray-600">{job.company}</p>
      <Field label="Job Type" value={job.jobType} />
      <Field label="Created" value={job.createdAt ? new Date(job.createdAt).toLocaleString() : null} />
      <Field label="Status" value={job.isActive === false ? 'Inactive' : 'Active'} />
      {job.description && (
        <Field
          label="Description"
          value={<pre className="whitespace-pre-wrap font-sans text-xs">{String(job.description).slice(0, 4000)}</pre>}
        />
      )}
      <Button onClick={onStartCallForJob} className="w-full bg-[#911406] hover:bg-[#911406]/90 text-white">
        <Phone className="w-4 h-4 mr-2" /> Start Call for This Job
      </Button>
      <p className="text-[11px] text-gray-400 italic pt-4 text-center">
        Editing, AI re-analysis, and reordering are available on desktop.
      </p>
    </div>
  </div>
);

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-gray-50 rounded-md p-3">
    <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500">{label}</div>
    <div className="text-sm text-gray-900 mt-0.5 break-words">{value || <span className="text-gray-400">—</span>}</div>
  </div>
);

export default MobileJobs;
