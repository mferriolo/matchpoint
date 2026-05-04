import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Filter, X } from 'lucide-react';

export interface DateRange {
  from?: string;
  to?: string;
}

function fmtMD(iso: string | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1].slice(2)}`;
}

function RangePanel({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const hasValue = !!(value.from || value.to);
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>{label} range</span>
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-blue-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <label className="block text-[11px] text-gray-600">
        From
        <input
          type="date"
          value={value.from || ''}
          max={value.to || undefined}
          onChange={e => onChange({ ...value, from: e.target.value || undefined })}
          className="mt-0.5 block w-full h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <label className="block text-[11px] text-gray-600">
        To
        <input
          type="date"
          value={value.to || ''}
          min={value.from || undefined}
          onChange={e => onChange({ ...value, to: e.target.value || undefined })}
          className="mt-0.5 block w-full h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
    </div>
  );
}

/** Wide variant: full-width button-with-summary trigger for the
 *  filter-row layout used by TrackerJobsTable. */
export function DateRangeFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasValue = !!(value.from || value.to);
  const summary = !hasValue
    ? `All ${label.toLowerCase()}`
    : value.from && value.to
      ? `${fmtMD(value.from)} – ${fmtMD(value.to)}`
      : value.from
        ? `From ${fmtMD(value.from)}`
        : `Until ${fmtMD(value.to)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 w-full text-xs text-left rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between gap-1"
        >
          <span className={`truncate ${!hasValue ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
            {summary}
          </span>
          <ChevronDown className="w-3 h-3 flex-shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start">
        <RangePanel label={label} value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/** Compact variant: filter icon that sits inline next to a sort button,
 *  mirroring the look of MultiSelectColumnHeader. Used by JobsTabContent. */
export function DateRangeFilterIcon({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasFilter = !!(value.from || value.to);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`p-0.5 rounded transition-colors ml-0.5 ${hasFilter ? 'text-[#911406] bg-red-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            title={`Filter by ${label}${hasFilter ? ' (active)' : ''}`}
          >
            <Filter className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[260px] border-gray-200"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <RangePanel label={label} value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Clear filter"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </>
  );
}

/** Returns true if a row's timestamp falls inside the [from, to] range
 *  (inclusive). Empty fields are treated as open-ended. Anything that
 *  fails to parse is excluded when a filter is active. */
export function inDateRange(rowIso: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!rowIso) return false;
  const t = new Date(rowIso).getTime();
  if (!Number.isFinite(t)) return false;
  if (range.from) {
    const f = new Date(range.from + 'T00:00:00').getTime();
    if (t < f) return false;
  }
  if (range.to) {
    const tt = new Date(range.to + 'T23:59:59.999').getTime();
    if (t > tt) return false;
  }
  return true;
}
