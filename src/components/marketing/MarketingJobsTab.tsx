import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Save, X, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MarketingJob {
  id: string;
  company_id: string | null;
  company_name: string;
  job_title: string;
  job_type: string;
  location: string;
  salary_range: string;
  job_url: string;
  source: string;
  date_posted: string | null;
  notes: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MarketingCompanyOption {
  id: string;
  company_name: string;
}

type SortField = keyof MarketingJob;
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS = ['Open', 'Applied', 'Interviewing', 'Placed', 'Closed'];

const STATUS_COLORS: Record<string, string> = {
  'Open': 'bg-green-100 text-green-800',
  'Applied': 'bg-blue-100 text-blue-800',
  'Interviewing': 'bg-purple-100 text-purple-800',
  'Placed': 'bg-emerald-100 text-emerald-800',
  'Closed': 'bg-gray-100 text-gray-600',
};

const MarketingJobsTab: React.FC = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<MarketingJob[]>([]);
  const [companies, setCompanies] = useState<MarketingCompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<MarketingJob>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<MarketingJob>>({
    company_name: '', company_id: null, job_title: '', job_type: '', location: '',
    salary_range: '', job_url: '', source: '', date_posted: null, notes: '', status: 'Open'
  });
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setJobs(data || []);
    } catch (err: any) {
      toast({ title: 'Error loading jobs', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchCompanies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_companies')
        .select('id, company_name')
        .order('company_name');
      if (error) throw error;
      setCompanies(data || []);
    } catch (err: any) {
      console.error('Error fetching companies:', err);
    }
  }, []);

  useEffect(() => { fetchJobs(); fetchCompanies(); }, [fetchJobs, fetchCompanies]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleCompanySelect = (companyId: string, setter: (fn: (d: any) => any) => void) => {
    const company = companies.find(c => c.id === companyId);
    if (company) {
      setter((d: any) => ({ ...d, company_id: company.id, company_name: company.company_name }));
    } else {
      setter((d: any) => ({ ...d, company_id: null }));
    }
  };

  const handleAddNew = async () => {
    if (!newRow.job_title?.trim()) {
      toast({ title: 'Job title is required', variant: 'destructive' });
      return;
    }
    if (!newRow.company_name?.trim()) {
      toast({ title: 'Company name is required', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('marketing_jobs').insert([{
        company_id: newRow.company_id || null,
        company_name: newRow.company_name?.trim(),
        job_title: newRow.job_title?.trim(),
        job_type: newRow.job_type || '',
        location: newRow.location || '',
        salary_range: newRow.salary_range || '',
        job_url: newRow.job_url || '',
        source: newRow.source || '',
        date_posted: newRow.date_posted || null,
        notes: newRow.notes || '',
        status: newRow.status || 'Open',
      }]);
      if (error) throw error;
      toast({ title: 'Job added successfully' });
      setAddingNew(false);
      setNewRow({ company_name: '', company_id: null, job_title: '', job_type: '', location: '', salary_range: '', job_url: '', source: '', date_posted: null, notes: '', status: 'Open' });
      fetchJobs();
    } catch (err: any) {
      toast({ title: 'Error adding job', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (job: MarketingJob) => {
    setEditingId(job.id);
    setEditData({ ...job });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editData.job_title?.trim()) {
      toast({ title: 'Job title is required', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('marketing_jobs')
        .update({
          company_id: editData.company_id || null,
          company_name: editData.company_name?.trim() || '',
          job_title: editData.job_title?.trim(),
          job_type: editData.job_type || '',
          location: editData.location || '',
          salary_range: editData.salary_range || '',
          job_url: editData.job_url || '',
          source: editData.source || '',
          date_posted: editData.date_posted || null,
          notes: editData.notes || '',
          status: editData.status || 'Open',
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);
      if (error) throw error;
      toast({ title: 'Job updated' });
      setEditingId(null);
      setEditData({});
      fetchJobs();
    } catch (err: any) {
      toast({ title: 'Error updating job', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete job "${title}"?`)) return;
    try {
      const { error } = await supabase.from('marketing_jobs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Job deleted' });
      fetchJobs();
    } catch (err: any) {
      toast({ title: 'Error deleting job', description: err.message, variant: 'destructive' });
    }
  };

  const filtered = jobs
    .filter(j => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return j.company_name.toLowerCase().includes(s) ||
        j.job_title.toLowerCase().includes(s) ||
        j.job_type.toLowerCase().includes(s) ||
        j.location.toLowerCase().includes(s) ||
        j.status.toLowerCase().includes(s) ||
        j.source.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const aVal = (a[sortField] ?? '') as string;
      const bVal = (b[sortField] ?? '') as string;
      const cmp = aVal.toString().localeCompare(bVal.toString());
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406]" /> : <ArrowDown className="w-3 h-3 ml-1 text-[#911406]" />;
  };

  const columns: { key: SortField; label: string; width: string }[] = [
    { key: 'company_name', label: 'Company', width: 'min-w-[180px]' },
    { key: 'job_title', label: 'Job Title', width: 'min-w-[200px]' },
    { key: 'job_type', label: 'Job Type', width: 'min-w-[140px]' },
    { key: 'location', label: 'Location', width: 'min-w-[140px]' },
    { key: 'salary_range', label: 'Salary Range', width: 'min-w-[130px]' },
    { key: 'job_url', label: 'Job URL', width: 'min-w-[160px]' },
    { key: 'source', label: 'Source', width: 'min-w-[120px]' },
    { key: 'status', label: 'Status', width: 'min-w-[120px]' },
    { key: 'date_posted', label: 'Date Posted', width: 'min-w-[130px]' },
    { key: 'notes', label: 'Notes', width: 'min-w-[200px]' },
  ];

  const renderCell = (job: MarketingJob, col: typeof columns[0]) => {
    const isEditing = editingId === job.id;
    const value = isEditing ? (editData[col.key] ?? '') : (job[col.key] ?? '');

    if (isEditing) {
      if (col.key === 'company_name') {
        return (
          <div className="space-y-1">
            <select
              value={editData.company_id || ''}
              onChange={e => handleCompanySelect(e.target.value, setEditData)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
            >
              <option value="">-- Select or type below --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
            <input
              type="text"
              value={editData.company_name || ''}
              onChange={e => setEditData(d => ({ ...d, company_name: e.target.value }))}
              placeholder="Or type company name"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
            />
          </div>
        );
      }
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
      if (col.key === 'date_posted') {
        return (
          <input
            type="date"
            value={value ? new Date(value as string).toISOString().split('T')[0] : ''}
            onChange={e => setEditData(d => ({ ...d, date_posted: e.target.value ? new Date(e.target.value).toISOString() : null }))}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
          />
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
    if (col.key === 'job_url' && value) {
      const url = (value as string).startsWith('http') ? value as string : `https://${value}`;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-sm">
          View <ExternalLink className="w-3 h-3" />
        </a>
      );
    }
    if (col.key === 'date_posted' && value) {
      try {
        return <span className="text-sm text-gray-700">{new Date(value as string).toLocaleDateString()}</span>;
      } catch {
        return <span className="text-sm text-gray-700">{value as string}</span>;
      }
    }
    return <span className="text-sm text-gray-700">{value as string}</span>;
  };

  const renderNewCell = (col: typeof columns[0]) => {
    if (col.key === 'company_name') {
      return (
        <div className="space-y-1">
          <select
            value={newRow.company_id || ''}
            onChange={e => handleCompanySelect(e.target.value, setNewRow)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
          >
            <option value="">-- Select or type below --</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <input
            type="text"
            value={newRow.company_name || ''}
            onChange={e => setNewRow(d => ({ ...d, company_name: e.target.value }))}
            placeholder="Or type company name"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
          />
        </div>
      );
    }
    if (col.key === 'status') {
      return (
        <select
          value={newRow.status || 'Open'}
          onChange={e => setNewRow(d => ({ ...d, status: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      );
    }
    if (col.key === 'date_posted') {
      return (
        <input
          type="date"
          value={newRow.date_posted ? new Date(newRow.date_posted).toISOString().split('T')[0] : ''}
          onChange={e => setNewRow(d => ({ ...d, date_posted: e.target.value ? new Date(e.target.value).toISOString() : null }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[#911406] focus:border-[#911406] outline-none"
        />
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
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{filtered.length} jobs</span>
          <Button onClick={() => setAddingNew(true)} className="bg-[#911406] hover:bg-[#911406]/90 text-white" disabled={addingNew}>
            <Plus className="w-4 h-4 mr-1" /> Add Job
          </Button>
        </div>
      </div>

      {/* Spreadsheet */}
      <div ref={tableRef} className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-[70px] sticky left-0 bg-gray-50 z-20">
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
                <td className="px-2 py-1.5 border-r border-gray-200 sticky left-0 bg-green-50 z-20">
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
                <td colSpan={columns.length + 1} className="text-center py-12 text-gray-400">
                  Loading jobs...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-12 text-gray-400">
                  {searchTerm ? 'No jobs match your search.' : 'No jobs yet. Click "Add Job" to get started.'}
                </td>
              </tr>
            ) : (
              filtered.map((job, idx) => {
                const isEditing = editingId === job.id;
                return (
                  <tr
                    key={job.id}
                    className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-gray-100/50 transition-colors`}
                  >
                    <td className={`px-2 py-1.5 border-r border-gray-200 sticky left-0 z-20 ${isEditing ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
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
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(job)} className="p-1 rounded hover:bg-blue-100 text-blue-600" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(job.id, job.job_title)} className="p-1 rounded hover:bg-red-100 text-red-600" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-1.5 border-r border-gray-200">
                        {renderCell(job, col)}
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

export default MarketingJobsTab;
