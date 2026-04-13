import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Save, X, Pencil, Ban, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MarketingCompany {
  id: string;
  company_name: string;
  industry: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  location: string;
  notes: string;
  status: string;
  source: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  is_blocked: boolean;
}

type SortField = keyof MarketingCompany;
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS = ['New', 'Contacted', 'In Discussion', 'Active Client', 'Not Interested'];

const STATUS_COLORS: Record<string, string> = {
  'New': 'bg-blue-100 text-blue-800',
  'Contacted': 'bg-yellow-100 text-yellow-800',
  'In Discussion': 'bg-purple-100 text-purple-800',
  'Active Client': 'bg-green-100 text-green-800',
  'Not Interested': 'bg-gray-100 text-gray-600',
};

const MarketingCompaniesTab: React.FC = () => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<MarketingCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<MarketingCompany>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<MarketingCompany>>({
    company_name: '', industry: '', website: '', contact_name: '',
    contact_email: '', contact_phone: '', location: '', notes: '', status: 'New', source: ''
  });
  // Multi-select + blocking state. Selected rows are tracked by id; the
  // bulk action bar appears when >0 are selected. Blocked rows are hidden
  // from the table by default and excluded from future scraper runs.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBlocked, setShowBlocked] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_companies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCompanies(data || []);
    } catch (err: any) {
      toast({ title: 'Error loading companies', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleAddNew = async () => {
    if (!newRow.company_name?.trim()) {
      toast({ title: 'Company name is required', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('marketing_companies').insert([{
        company_name: newRow.company_name?.trim(),
        industry: newRow.industry || '',
        website: newRow.website || '',
        contact_name: newRow.contact_name || '',
        contact_email: newRow.contact_email || '',
        contact_phone: newRow.contact_phone || '',
        location: newRow.location || '',
        notes: newRow.notes || '',
        status: newRow.status || 'New',
        source: newRow.source || '',
      }]);
      if (error) throw error;
      toast({ title: 'Company added successfully' });
      setAddingNew(false);
      setNewRow({ company_name: '', industry: '', website: '', contact_name: '', contact_email: '', contact_phone: '', location: '', notes: '', status: 'New', source: '' });
      fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error adding company', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (company: MarketingCompany) => {
    setEditingId(company.id);
    setEditData({ ...company });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editData.company_name?.trim()) {
      toast({ title: 'Company name is required', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('marketing_companies')
        .update({
          company_name: editData.company_name?.trim(),
          industry: editData.industry || '',
          website: editData.website || '',
          contact_name: editData.contact_name || '',
          contact_email: editData.contact_email || '',
          contact_phone: editData.contact_phone || '',
          location: editData.location || '',
          notes: editData.notes || '',
          status: editData.status || 'New',
          source: editData.source || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);
      if (error) throw error;
      toast({ title: 'Company updated' });
      setEditingId(null);
      setEditData({});
      fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error updating company', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all associated jobs?`)) return;
    try {
      const { error } = await supabase.from('marketing_companies').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Company deleted' });
      fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error deleting company', description: err.message, variant: 'destructive' });
    }
  };

  // ---------- Selection + blocking ----------
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleToggleBlock = async (id: string, currentlyBlocked: boolean) => {
    try {
      const { error } = await supabase.from('marketing_companies')
        .update({ is_blocked: !currentlyBlocked, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast({ title: currentlyBlocked ? 'Company unblocked' : 'Company blocked from future runs' });
      fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error updating block flag', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkBlock = async (block: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase.from('marketing_companies')
        .update({ is_blocked: block, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toast({ title: block ? `${ids.length} company(s) blocked` : `${ids.length} company(s) unblocked` });
      clearSelection();
      fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error updating companies', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected company(s) and their associated jobs? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase.from('marketing_companies').delete().in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} company(s) deleted` });
      clearSelection();
      fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error deleting companies', description: err.message, variant: 'destructive' });
    }
  };

  const filtered = companies
    .filter(c => showBlocked || !c.is_blocked)
    .filter(c => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return c.company_name.toLowerCase().includes(s) ||
        c.industry.toLowerCase().includes(s) ||
        c.contact_name.toLowerCase().includes(s) ||
        c.location.toLowerCase().includes(s) ||
        c.status.toLowerCase().includes(s) ||
        c.source.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const aVal = (a[sortField] ?? '') as string;
      const bVal = (b[sortField] ?? '') as string;
      const cmp = aVal.toString().localeCompare(bVal.toString());
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const blockedCount = companies.filter(c => c.is_blocked).length;
  const allVisibleSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406]" /> : <ArrowDown className="w-3 h-3 ml-1 text-[#911406]" />;
  };

  const columns: { key: SortField; label: string; width: string }[] = [
    { key: 'company_name', label: 'Company Name', width: 'min-w-[180px]' },
    { key: 'industry', label: 'Industry', width: 'min-w-[140px]' },
    { key: 'website', label: 'Website', width: 'min-w-[160px]' },
    { key: 'contact_name', label: 'Contact', width: 'min-w-[140px]' },
    { key: 'contact_email', label: 'Email', width: 'min-w-[180px]' },
    { key: 'contact_phone', label: 'Phone', width: 'min-w-[130px]' },
    { key: 'location', label: 'Location', width: 'min-w-[140px]' },
    { key: 'status', label: 'Status', width: 'min-w-[140px]' },
    { key: 'source', label: 'Source', width: 'min-w-[120px]' },
    { key: 'notes', label: 'Notes', width: 'min-w-[200px]' },
  ];

  const renderCell = (company: MarketingCompany, col: typeof columns[0]) => {
    const isEditing = editingId === company.id;
    const value = isEditing ? (editData[col.key] ?? '') : (company[col.key] ?? '');

    if (isEditing) {
      if (col.key === 'status') {
        return (
          <select
            value={value as string}
            onChange={e => setEditData(d => ({ ...d, [col.key]: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      }
      if (col.key === 'notes') {
        return (
          <textarea
            value={value as string}
            onChange={e => setEditData(d => ({ ...d, [col.key]: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none resize-none"
            rows={2}
          />
        );
      }
      return (
        <input
          type="text"
          value={value as string}
          onChange={e => setEditData(d => ({ ...d, [col.key]: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
        />
      );
    }

    // Display mode
    if (col.key === 'status') {
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[value as string] || 'bg-gray-100 text-gray-600'}`}>{value as string}</span>;
    }
    if (col.key === 'website' && value) {
      const url = (value as string).startsWith('http') ? value as string : `https://${value}`;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-sm">
          {value as string} <ExternalLink className="w-3 h-3" />
        </a>
      );
    }
    if (col.key === 'contact_email' && value) {
      return <a href={`mailto:${value}`} className="text-blue-600 hover:underline text-sm">{value as string}</a>;
    }
    return <span className="text-sm text-gray-700">{value as string}</span>;
  };

  const renderNewCell = (col: typeof columns[0]) => {
    if (col.key === 'status') {
      return (
        <select
          value={newRow.status || 'New'}
          onChange={e => setNewRow(d => ({ ...d, status: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      );
    }
    if (col.key === 'notes') {
      return (
        <textarea
          value={(newRow[col.key as keyof typeof newRow] as string) || ''}
          onChange={e => setNewRow(d => ({ ...d, [col.key]: e.target.value }))}
          placeholder={col.label}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none resize-none"
          rows={2}
        />
      );
    }
    return (
      <input
        type="text"
        value={(newRow[col.key as keyof typeof newRow] as string) || ''}
        onChange={e => setNewRow(d => ({ ...d, [col.key]: e.target.value }))}
        placeholder={col.label}
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search companies..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {filtered.length} companies{blockedCount > 0 && !showBlocked && <span className="text-gray-400"> ({blockedCount} blocked hidden)</span>}
          </span>
          <button
            type="button"
            onClick={() => setShowBlocked(s => !s)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
            title={showBlocked ? 'Hide blocked companies' : 'Show blocked companies'}
          >
            {showBlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showBlocked ? 'Hide blocked' : 'Show blocked'}
          </button>
          <Button onClick={() => setAddingNew(true)} className="bg-[#911406] hover:bg-[#911406]/90 text-white" disabled={addingNew}>
            <Plus className="w-4 h-4 mr-1" /> Add Company
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <span className="text-sm font-medium text-amber-900">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleBulkBlock(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-200 bg-white hover:bg-red-50 text-red-700"
              title="Block selected from future scraper runs"
            >
              <Ban className="w-3.5 h-3.5" /> Block
            </button>
            <button
              type="button"
              onClick={() => handleBulkBlock(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              title="Unblock selected"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Unblock
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-200 bg-white hover:bg-red-50 text-red-700"
              title="Delete selected permanently"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded text-gray-500 hover:bg-amber-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet */}
      <div ref={tableRef} className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-[36px] sticky left-0 bg-gray-50 z-20">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406] cursor-pointer"
                  title={allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
                />
              </th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-[96px] sticky left-[36px] bg-gray-50 z-20">
                Actions
              </th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 cursor-pointer hover:bg-gray-100 select-none ${col.width}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center">
                    {col.label}
                    <SortIcon field={col.key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* New row */}
            {addingNew && (
              <tr className="bg-green-50 border-b border-gray-200">
                <td className="px-2 py-1.5 border-r border-gray-200 sticky left-0 bg-green-50 z-20" />
                <td className="px-2 py-1.5 border-r border-gray-200 sticky left-[36px] bg-green-50 z-20">
                  <div className="flex gap-1">
                    <button onClick={handleAddNew} className="p-1 rounded hover:bg-green-200 text-green-700" title="Save">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={() => setAddingNew(false)} className="p-1 rounded hover:bg-red-100 text-red-600" title="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                {columns.map(col => (
                  <td key={col.key} className="px-2 py-1.5 border-r border-gray-200">
                    {renderNewCell(col)}
                  </td>
                ))}
              </tr>
            )}

            {/* Data rows */}
            {loading ? (
              <tr>
                <td colSpan={columns.length + 2} className="text-center py-12 text-gray-400">
                  Loading companies...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="text-center py-12 text-gray-400">
                  {searchTerm ? 'No companies match your search.' : 'No companies yet. Click "Add Company" to get started.'}
                </td>
              </tr>
            ) : (
              filtered.map((company, idx) => {
                const isEditing = editingId === company.id;
                const isSelected = selectedIds.has(company.id);
                const blocked = company.is_blocked;
                const baseBg = blocked ? 'bg-gray-100' : isEditing ? 'bg-blue-50' : isSelected ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30';
                return (
                  <tr
                    key={company.id}
                    className={`border-b border-gray-100 ${baseBg} hover:bg-gray-100/50 transition-colors ${blocked ? 'opacity-60' : ''}`}
                  >
                    <td className={`px-2 py-1.5 border-r border-gray-200 sticky left-0 z-20 text-center ${baseBg}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(company.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406] cursor-pointer"
                      />
                    </td>
                    <td className={`px-2 py-1.5 border-r border-gray-200 sticky left-[36px] z-20 ${baseBg}`}>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={handleSaveEdit} className="p-1 rounded hover:bg-green-100 text-green-700" title="Save">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setEditingId(null); setEditData({}); }} className="p-1 rounded hover:bg-red-100 text-red-600" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-0.5">
                          <button onClick={() => handleEdit(company)} className="p-1 rounded hover:bg-blue-100 text-blue-600" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleBlock(company.id, blocked)}
                            className={`p-1 rounded ${blocked ? 'hover:bg-gray-200 text-gray-600' : 'hover:bg-red-100 text-red-600'}`}
                            title={blocked ? 'Unblock (allow scraper to discover jobs at this company)' : 'Block from future scraper runs'}
                          >
                            {blocked ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleDelete(company.id, company.company_name)} className="p-1 rounded hover:bg-red-100 text-red-600" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-1.5 border-r border-gray-200">
                        {renderCell(company, col)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketingCompaniesTab;
