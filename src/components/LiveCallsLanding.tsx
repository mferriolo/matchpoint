import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Phone, Trash2, Search, Calendar, GripVertical, CheckSquare, Square, RotateCcw, CalendarPlus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import StartCallDialog from '@/components/StartCallDialog';
import ScheduleCallDialog from '@/components/ScheduleCallDialog';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface CallRecord {
  id: string;
  job_id: string;
  candidate_name: string;
  call_type: string;
  call_category: string;
  call_method: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  display_order?: number;
}

export const LiveCallsLanding: React.FC<{ onStartCall: () => void }> = ({ onStartCall }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showStartCallDialog, setShowStartCallDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [filter, setFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [deleteCallId, setDeleteCallId] = useState<string | null>(null);
  const [deleteCallName, setDeleteCallName] = useState<string>('');
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => { setTypeFilter('all'); }, [categoryFilter]);
  useEffect(() => { fetchCalls(); }, []);

  const handleCallStarted = () => {
    setShowStartCallDialog(false);
    onStartCall();
  };
  
  const fetchCalls = async () => {
    console.log('=== FETCHING CALLS FROM DATABASE ===');
    const { data, error } = await supabase.from('calls')
      .select('*')
      .in('status', ['Completed', 'In Progress'])
      .order('start_time', { ascending: false });
    
    if (error) {
      console.error('Error fetching calls:', error);
      toast({
        title: "Error",
        description: "Failed to load call records",
        variant: "destructive"
      });
      return;
    }
    
    console.log('Calls fetched from database:', data?.length || 0);
    const uniqueCalls = data?.filter((call, index, self) => index === self.findIndex((c) => c.id === call.id)) || [];
    setCalls(uniqueCalls.map((call, idx) => ({ ...call, display_order: call.display_order ?? idx })));
    console.log('Calls state updated with:', uniqueCalls.length, 'calls');
  };


  const uniqueCallTypes = Array.from(new Set(calls.filter(c => categoryFilter === 'all' || c.call_category === categoryFilter).map(c => c.call_type)));
  const filteredCalls = calls.filter(c => {
    const matchesText = c.candidate_name.toLowerCase().includes(filter.toLowerCase()) || c.call_type.toLowerCase().includes(filter.toLowerCase());
    const callDate = new Date(c.start_time).toISOString().split('T')[0];
    const matchesDate = (!startDate || callDate >= startDate) && (!endDate || callDate <= endDate);
    return matchesText && matchesDate && (categoryFilter === 'all' || c.call_category === categoryFilter) && (typeFilter === 'all' || c.call_type === typeFilter);
  }).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const selectAllCalls = () => setSelectedCalls(new Set(filteredCalls.map(c => c.id)));
  const deselectAllCalls = () => setSelectedCalls(new Set());
  const allSelected = filteredCalls.length > 0 && selectedCalls.size === filteredCalls.length;
  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedCalls);
    checked ? newSelected.add(id) : newSelected.delete(id);
    setSelectedCalls(newSelected);
  };

  const handleDeleteSingleCall = async () => {
    if (!deleteCallId) return;
    const { error } = await supabase.from('calls').delete().eq('id', deleteCallId);
    if (error) { toast({ title: "Error", description: "Failed to delete call record", variant: "destructive" }); return; }
    setCalls(prev => prev.filter(c => c.id !== deleteCallId));
    toast({ title: "Success", description: "Call record deleted successfully" });
    setDeleteCallId(null); setDeleteCallName('');
  };


  const handleDeleteMultipleCalls = async () => {
    if (selectedCalls.size === 0) return;
    const { error } = await supabase.from('calls').delete().in('id', Array.from(selectedCalls));
    if (error) { toast({ title: "Error", description: "Failed to delete call records", variant: "destructive" }); return; }
    setCalls(prev => prev.filter(c => !selectedCalls.has(c.id)));
    toast({ title: "Success", description: `${selectedCalls.size} call record(s) deleted successfully` });
    setSelectedCalls(new Set()); setShowBulkDeleteConfirm(false);
  };


  // Handle drag end
  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(calls);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update display_order for all items
    const updatedItems = items.map((item, index) => ({
      ...item,
      display_order: index
    }));
    
    setCalls(updatedItems);
    
    // Optional: Save order to database
    // You could add a 'display_order' field and update it here
    // updateCallsOrder(updatedItems);
  };

  // Reset filters function
  const handleResetFilters = () => {
    setFilter('');
    setStartDate('');
    setEndDate('');
    setCategoryFilter('all');
    setTypeFilter('all');
  };

  // Check if any filters are active
  const hasActiveFilters = filter !== '' || startDate !== '' || endDate !== '' || typeFilter !== 'all';

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Live Calls</h1>
        <div className="flex gap-2">
          {selectedCalls.size > 0 && (<><span className="text-sm text-muted-foreground flex items-center">{selectedCalls.size} selected</span><Button variant="outline" size="sm" onClick={deselectAllCalls}>Clear Selection</Button><Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteConfirm(true)}><Trash2 className="w-4 h-4 mr-2" />Delete Selected ({selectedCalls.size})</Button></>)}
          <Button 
            size="lg" 
            onClick={() => setShowScheduleDialog(true)} 
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-all"
          >
            <CalendarPlus className="w-5 h-5 mr-2" />
            Schedule Call
          </Button>
          <Button size="lg" onClick={() => setShowStartCallDialog(true)} className="bg-gradient-to-r from-maroon-600 to-maroon-700 hover:from-maroon-700 hover:to-maroon-800 text-white font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-all"><Plus className="w-5 h-5 mr-2" />Start New Call</Button>
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center space-x-2 flex-1 min-w-[200px]"><Search className="w-4 h-4" /><Input placeholder="Search..." value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{uniqueCallTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <div className="flex items-center space-x-2"><Calendar className="w-4 h-4" /><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" /><span className="text-xs">to</span><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" /></div>
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button 
              onClick={handleResetFilters}
              variant="outline"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        )}
      </div>
      {filteredCalls.length > 0 && (<div className="flex items-center gap-2 p-2 border-b"><Button variant="ghost" size="sm" onClick={allSelected ? deselectAllCalls : selectAllCalls} className="flex items-center gap-2">{allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-gray-700 stroke-[2.5]" />}<span className="text-sm">{allSelected ? 'Deselect All' : 'Select All'}</span></Button></div>)}
      {filteredCalls.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Phone className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No call recordings found</p>
          <p className="text-sm">Start a new call to see recordings here</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="calls">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="grid gap-3">
                {filteredCalls.map((call, index) => (
                  <Draggable key={call.id} draggableId={call.id} index={index}>
                    {(provided, snapshot) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        onClick={() => navigate(`/call-summary/${call.id}`)}
                        className={`cursor-pointer hover:shadow-lg transition-shadow ${
                          snapshot.isDragging ? 'shadow-xl opacity-90' : ''
                        }`}
                      >
                        <CardContent className="flex items-center gap-4 p-4">
                          <Checkbox
                            checked={selectedCalls.has(call.id)}
                            onCheckedChange={(checked) => toggleSelect(call.id, checked as boolean)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div {...provided.dragHandleProps}>
                            <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                          </div>
                          <Phone className="w-8 h-8 text-maroon-500" />
                          <div className="flex-1">
                            <div className="text-xl font-bold">{call.candidate_name}</div>
                            <div className="text-sm text-gray-600">{call.call_category} • {call.call_type}</div>
                            <div className="text-xs text-gray-400 mt-1">{new Date(call.start_time).toLocaleString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{call.duration_minutes} min</div>
                            <div className="text-xs text-green-600">{call.status}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteCallId(call.id);
                              setDeleteCallName(call.candidate_name);
                            }}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
      <AlertDialog open={!!deleteCallId} onOpenChange={(open) => !open && setDeleteCallId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Call Record?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete the call with <strong>{deleteCallName}</strong>? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setDeleteCallId(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteSingleCall} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Multiple Call Records?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{selectedCalls.size}</strong> call record(s)? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteMultipleCalls} className="bg-red-600 hover:bg-red-700">Delete {selectedCalls.size} Record(s)</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <StartCallDialog open={showStartCallDialog} onOpenChange={setShowStartCallDialog} onCallStarted={handleCallStarted} />
      <ScheduleCallDialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog} />
    </div>
  );
};