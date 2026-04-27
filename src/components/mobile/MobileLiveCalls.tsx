import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Search, Plus, Calendar, ChevronRight, CalendarPlus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import StartCallDialog from '@/components/StartCallDialog';
import ScheduleCallDialog from '@/components/ScheduleCallDialog';

interface CallRecord {
  id: string;
  candidate_name: string;
  call_type: string;
  call_category: string;
  call_method: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
}

interface MobileLiveCallsProps {
  /**
   * Wired by AppLayout when this component is mounted via the in-app
   * 'live-call-landing' view. Pressing "Start Call" calls this so the
   * AppLayout switches to the live-call view.
   */
  onStartCall?: () => void;
}

/**
 * Mobile call landing. Tap a call to open its summary; tap Start to
 * launch a new call. Drag-reorder, multi-select, and the date-range
 * filter from the desktop version are dropped — the search box covers
 * the most common need on a phone.
 */
const MobileLiveCalls: React.FC<MobileLiveCallsProps> = ({ onStartCall }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showStartCall, setShowStartCall] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CallRecord | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .in('status', ['Completed', 'In Progress'])
      .order('start_time', { ascending: false });
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    } else {
      setCalls(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return calls.filter(c =>
      !s ||
      `${c.candidate_name || ''} ${c.call_type || ''} ${c.call_category || ''}`.toLowerCase().includes(s)
    );
  }, [calls, search]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('calls').delete().eq('id', pendingDelete.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setCalls(prev => prev.filter(c => c.id !== pendingDelete.id));
      toast({ title: 'Call deleted' });
    }
    setPendingDelete(null);
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-3 py-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search calls…"
            className="pl-9 h-10 text-sm"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            onClick={() => setShowStartCall(true)}
            className="flex-1 bg-[#911406] hover:bg-[#911406]/90 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Start Call
          </Button>
          <Button
            onClick={() => setShowSchedule(true)}
            variant="outline"
            className="flex-1 border-blue-600 text-blue-700"
          >
            <CalendarPlus className="w-4 h-4 mr-1.5" /> Schedule
          </Button>
        </div>
      </div>

      <div className="px-3 py-3 space-y-2 flex-1">
        {loading && <div className="text-center py-10 text-sm text-gray-500">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500">
            <Phone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            {search ? 'No matches.' : 'No call records yet.'}
          </div>
        )}
        {!loading && filtered.map(c => (
          <div key={c.id} className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <button
              onClick={() => navigate(`/call-summary/${c.id}`)}
              className="w-full text-left p-3 active:bg-gray-50"
            >
              <div className="flex items-start gap-2">
                <Phone className="w-5 h-5 text-[#911406] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-gray-900 truncate">{c.candidate_name || '—'}</h3>
                  <p className="text-xs text-gray-600 truncate mt-0.5">
                    {[c.call_category, c.call_type].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {c.start_time ? new Date(c.start_time).toLocaleString() : '—'}
                    </span>
                    {typeof c.duration_minutes === 'number' && <span>{c.duration_minutes} min</span>}
                    <span className="text-emerald-600 font-medium">{c.status}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
              </div>
            </button>
            <div className="px-3 pb-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingDelete(c)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <StartCallDialog
        open={showStartCall}
        onOpenChange={setShowStartCall}
        onCallStarted={() => {
          setShowStartCall(false);
          if (onStartCall) onStartCall();
        }}
      />
      <ScheduleCallDialog open={showSchedule} onOpenChange={setShowSchedule} />

      <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call record?</AlertDialogTitle>
            <AlertDialogDescription>
              Call with <strong>{pendingDelete?.candidate_name}</strong> will be permanently removed.
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
    </div>
  );
};

export default MobileLiveCalls;
