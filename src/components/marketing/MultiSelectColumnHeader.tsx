import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Multi-select column header used across the Jobs, Companies, and
// Contacts tabs. Uses Radix Popover (portal-based) for the dropdown —
// this takes care of focus management, click-outside, escape handling,
// and (crucially) keeps the popover DOM stable across parent re-renders
// so that checking one checkbox doesn't tear down and rebuild the popup.
//
// For columns that should filter on presence/absence of data instead of
// unique values, callers pass filterOptions={['Has Any Data', 'Has No
// Data']} and interpret the resulting set in their own filter logic.

export type MultiSelectColumnHeaderProps<Field extends string> = {
  field: Field;
  label: string;
  filterValues: Set<string>;
  filterOptions: string[];
  onFilterChange: (next: Set<string>) => void;
  sortField: Field;
  sortDir: 'asc' | 'desc';
  onSort: (f: Field) => void;
  /** Label shown at the top of the dropdown. Defaults to `Filter by {label}`. */
  filterPanelLabel?: string;
};

export function MultiSelectColumnHeader<Field extends string>(props: MultiSelectColumnHeaderProps<Field>) {
  const { field, label, filterValues, filterOptions, onFilterChange,
    sortField, sortDir, onSort, filterPanelLabel } = props;
  const hasFilter = filterValues.size > 0;
  const [open, setOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');

  React.useEffect(() => { if (!open) setFilterSearch(''); }, [open]);

  const cleanOptions = useMemo(() => filterOptions.filter(o => o !== 'All'), [filterOptions]);
  const displayOptions = useMemo(() => {
    if (!filterSearch) return cleanOptions;
    const s = filterSearch.toLowerCase();
    return cleanOptions.filter(opt => opt.toLowerCase().includes(s));
  }, [cleanOptions, filterSearch]);

  const toggleOption = (opt: string) => {
    const next = new Set(filterValues);
    if (next.has(opt)) next.delete(opt); else next.add(opt);
    onFilterChange(next);
  };

  const sortIcon = sortField !== field
    ? <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 flex-shrink-0" />
    : sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />
      : <ArrowDown className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />;

  const panelTitle = filterPanelLabel ?? `Filter by ${label}`;

  return (
    <th className="text-left px-4 py-3 font-medium text-gray-600 relative select-none">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSort(field)}
          className="flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold"
        >
          {label}
          {sortIcon}
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className={`p-0.5 rounded transition-colors ml-0.5 ${hasFilter ? 'text-[#911406] bg-red-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              title={`${panelTitle}${hasFilter ? ` (${filterValues.size} selected)` : ''}`}
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
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{panelTitle}</p>
                {hasFilter && (
                  <span className="text-[10px] text-[#911406] font-semibold">{filterValues.size} selected</span>
                )}
              </div>
              {cleanOptions.length > 8 && (
                <input
                  type="text"
                  placeholder={`Search ${label.toLowerCase()}...`}
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#911406]/30 focus:border-[#911406]/30"
                />
              )}
            </div>
            <div className="py-1 overflow-y-auto flex-1">
              {displayOptions.map(opt => {
                const checked = filterValues.has(opt);
                return (
                  <label
                    key={opt}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 cursor-pointer ${checked ? 'bg-red-50/50 text-[#911406] font-medium' : 'text-gray-700'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(opt)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406]/30 cursor-pointer"
                    />
                    <span className="truncate flex-1">{opt}</span>
                  </label>
                );
              })}
              {displayOptions.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2 italic">No matches</p>
              )}
            </div>
            <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between gap-2 bg-gray-50/50">
              <button
                onClick={() => onFilterChange(new Set(displayOptions))}
                className="text-[11px] text-gray-600 hover:text-[#911406] font-medium"
              >
                Select all{filterSearch ? ' (visible)' : ''}
              </button>
              <button
                onClick={() => onFilterChange(new Set())}
                className="text-[11px] text-gray-600 hover:text-[#911406] font-medium disabled:opacity-40"
                disabled={!hasFilter}
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] text-white bg-[#911406] hover:bg-[#7a1005] px-2.5 py-1 rounded font-medium"
              >
                Done
              </button>
            </div>
          </PopoverContent>
        </Popover>
        {hasFilter && (
          <>
            <span className="text-[10px] font-semibold text-[#911406] bg-red-50 px-1 rounded tabular-nums">{filterValues.size}</span>
            <button
              onClick={() => onFilterChange(new Set())}
              className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Clear filter"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </th>
  );
}
