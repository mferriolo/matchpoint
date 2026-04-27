import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search, ChevronRight, X, Copy as CopyIcon, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import MobileShell from './MobileShell';

interface Presentation {
  id: string;
  presentation_name: string;
  presentation_content: string;
  candidate_name: string;
  job_title: string;
  company: string;
  created_at: string;
  updated_at: string;
}

/**
 * Mobile presentations view. Lists saved presentations and lets the user
 * read or copy them. Generation requires picking a candidate + job and
 * waiting for an AI call — that flow stays on desktop where the multi-
 * step form is comfortable. We surface a hint when the saved list is
 * empty so the user knows where to create one.
 */
const MobilePresentations: React.FC = () => {
  const { toast } = useToast();
  const [list, setList] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Presentation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Presentation | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('candidate_presentations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    } else {
      setList(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return list.filter(p =>
      !s ||
      `${p.presentation_name || ''} ${p.candidate_name || ''} ${p.job_title || ''} ${p.company || ''}`
        .toLowerCase()
        .includes(s)
    );
  }, [list, search]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('candidate_presentations').delete().eq('id', pendingDelete.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setList(prev => prev.filter(p => p.id !== pendingDelete.id));
      toast({ title: 'Presentation deleted' });
    }
    setPendingDelete(null);
  };

  return (
    <MobileShell title="Presentations">
      <div className="px-3 py-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search presentations…"
            className="pl-9 h-10 text-sm"
          />
        </div>
      </div>

      <div className="px-3 py-3 space-y-2">
        {loading && <div className="text-center py-10 text-sm text-gray-500">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500 px-6">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            {search ? 'No matches.' : 'No saved presentations yet.'}
            {!search && (
              <p className="text-xs text-gray-400 mt-2">
                Create new presentations on the desktop site — pick a candidate, pick a job, save the result here.
              </p>
            )}
          </div>
        )}
        {!loading && filtered.map(p => (
          <button
            key={p.id}
            onClick={() => setActive(p)}
            className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 active:bg-gray-50 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <FileText className="w-5 h-5 text-[#911406] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900 truncate">
                  {p.presentation_name || `${p.candidate_name} — ${p.job_title}`}
                </h3>
                <p className="text-xs text-gray-600 truncate mt-0.5">
                  {[p.candidate_name, p.job_title].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                  {p.company ? ` · ${p.company}` : ''}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
            </div>
          </button>
        ))}
      </div>

      {active && (
        <DetailSheet
          presentation={active}
          onClose={() => setActive(null)}
          onDelete={() => { setPendingDelete(active); setActive(null); }}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this presentation?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingDelete?.presentation_name}</strong> will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileShell>
  );
};

const DetailSheet: React.FC<{ presentation: Presentation; onClose: () => void; onDelete: () => void }> = ({ presentation: p, onClose, onDelete }) => {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.presentation_content || '');
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: 'Long-press to select text manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between h-14 px-4 bg-[#911406] text-white flex-shrink-0">
        <button onClick={onClose} className="p-2 -ml-2 rounded hover:bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-base truncate flex-1 text-center">{p.candidate_name}</h2>
        <span className="w-9" />
      </header>
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] space-y-3">
        <h3 className="text-lg font-bold text-gray-900">{p.presentation_name}</h3>
        <p className="text-sm text-gray-600">{p.job_title}{p.company ? ` · ${p.company}` : ''}</p>
        <p className="text-xs text-gray-500">
          Saved {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
        </p>
        <div className="bg-gray-50 rounded-md p-3 mt-3">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-900 leading-relaxed">
            {p.presentation_content}
          </pre>
        </div>
      </div>
      <div className="flex-shrink-0 p-3 border-t bg-white pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex gap-2">
        <Button onClick={copy} variant="outline" className="flex-1">
          <CopyIcon className="w-4 h-4 mr-1.5" /> Copy
        </Button>
        <Button onClick={onDelete} variant="outline" className="flex-1 text-red-600 border-red-200">
          <Trash2 className="w-4 h-4 mr-1.5" /> Delete
        </Button>
      </div>
    </div>
  );
};

export default MobilePresentations;
