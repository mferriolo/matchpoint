import React, { useState } from 'react';
import { Phone, Check, MessageSquare, Calendar as CalendarIcon, X as XIcon, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export type OutreachStatus = 'Cold' | 'Replied' | 'Booked' | 'Dead' | null;

const STATUS_META: Record<NonNullable<OutreachStatus>, { color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  Cold:    { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     icon: MessageSquare },
  Replied: { color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200', icon: Check },
  Booked:  { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CalendarIcon },
  Dead:    { color: 'text-gray-600',    bg: 'bg-gray-100 border-gray-200',    icon: XIcon },
};

interface OutreachStatusCellProps {
  contactId: string;
  status: OutreachStatus;
  lastOutreachAt?: string | null;
  /** Called after a successful update so the parent can refresh its
   *  local list. Receives the new status + timestamp. */
  onUpdated: (status: OutreachStatus, lastOutreachAt: string | null) => void;
}

/**
 * Compact status badge that opens a popover for editing. Picking a
 * status auto-stamps last_outreach_at to now() unless the user is
 * clearing back to "Not contacted" (which clears the stamp too). The
 * "Mark contacted" shortcut sets status to Cold without overriding it
 * if it's already set.
 */
export const OutreachStatusCell: React.FC<OutreachStatusCellProps> = ({ contactId, status, lastOutreachAt, onUpdated }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (newStatus: OutreachStatus, opts: { clearTimestamp?: boolean } = {}) => {
    setBusy(true);
    const newTs = opts.clearTimestamp ? null : new Date().toISOString();
    try {
      const { error } = await supabase
        .from('marketing_contacts')
        .update({ outreach_status: newStatus, last_outreach_at: newTs, updated_at: new Date().toISOString() })
        .eq('id', contactId);
      if (error) throw error;
      onUpdated(newStatus, newTs);
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const stampOnly = async () => {
    // Quick "mark contacted now" — only sets timestamp, defaults status
    // to Cold if currently null so subsequent filters work. Doesn't
    // overwrite an existing status (e.g. someone already Booked).
    setBusy(true);
    try {
      const { error } = await supabase
        .from('marketing_contacts')
        .update({
          last_outreach_at: new Date().toISOString(),
          outreach_status: status ?? 'Cold',
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);
      if (error) throw error;
      onUpdated(status ?? 'Cold', new Date().toISOString());
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const Meta = status ? STATUS_META[status] : null;
  const trigger = (
    <button
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      disabled={busy}
      className={`inline-flex items-center gap-1 text-[11px] font-medium rounded border px-2 py-0.5 ${
        Meta ? `${Meta.color} ${Meta.bg}` : 'text-gray-500 bg-gray-50 border-gray-200 hover:border-gray-300'
      }`}
      title={lastOutreachAt ? `${status || 'Contacted'} · last touch ${new Date(lastOutreachAt).toLocaleDateString()}` : 'Not contacted yet — click to set'}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : (Meta ? <Meta.icon className="w-3 h-3" /> : <Phone className="w-3 h-3" />)}
      {status || 'Not contacted'}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-52 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
          Outreach status
        </div>
        <button
          onClick={stampOnly}
          disabled={busy}
          className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 flex items-center gap-2 border-b"
        >
          <Phone className="w-3.5 h-3.5 text-blue-600" />
          Mark contacted now
        </button>
        {(['Cold', 'Replied', 'Booked', 'Dead'] as const).map(opt => {
          const Icon = STATUS_META[opt].icon;
          const isCurrent = status === opt;
          return (
            <button
              key={opt}
              onClick={() => apply(opt)}
              disabled={busy}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${isCurrent ? 'bg-amber-50/50' : ''}`}
            >
              <Icon className={`w-3.5 h-3.5 ${STATUS_META[opt].color}`} />
              {opt}
              {isCurrent && <span className="ml-auto text-[10px] text-gray-400">current</span>}
            </button>
          );
        })}
        {(status || lastOutreachAt) && (
          <button
            onClick={() => apply(null, { clearTimestamp: true })}
            disabled={busy}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t"
          >
            Clear status & timestamp
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default OutreachStatusCell;
