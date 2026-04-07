import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, GripVertical, CheckCircle, Save } from 'lucide-react';
import { JOB_CATEGORIES, INITIAL_ACTIVE_JOBS } from '@/utils/jobTypesData';
import { useJobTypes } from '@/contexts/JobTypesContext';

const JobTypesManagement = () => {
  const { activeJobTypes, setActiveJobTypes } = useJobTypes();
  const [jobCategories, setJobCategories] = useState(JOB_CATEGORIES);
  const [newJobType, setNewJobType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Active Jobs');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, jobType: string) => {
    setDraggedItem(jobType);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropToActive = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedItem && !activeJobTypes.includes(draggedItem)) {
      setActiveJobTypes([...activeJobTypes, draggedItem]);
    }
    setDraggedItem(null);
  };

  const removeFromActive = (jobType: string) => {
    setActiveJobTypes(activeJobTypes.filter(job => job !== jobType));
  };

  const addNewJobType = () => {
    if (newJobType.trim() && selectedCategory) {
      setJobCategories(prev => ({
        ...prev,
        [selectedCategory]: [...prev[selectedCategory], newJobType.trim()]
      }));
      setNewJobType('');
    }
  };

  const removeJobType = (category: string, jobType: string) => {
    setJobCategories(prev => ({
      ...prev,
      [category]: prev[category].filter(job => job !== jobType)
    }));
    removeFromActive(jobType);
  };
  
  const makeJobActive = (jobType: string) => {
    if (!activeJobTypes.includes(jobType)) {
      setActiveJobTypes([...activeJobTypes, jobType]);
      
      // Add visual feedback animation
      const element = document.querySelector(`[data-job-type="${jobType}"]`);
      if (element) {
        element.classList.add('animate-pulse', 'bg-green-200', 'border-green-400');
        setTimeout(() => {
          element.classList.remove('animate-pulse', 'bg-green-200', 'border-green-400');
        }, 1000);
      }
    }
  };

  const saveJobTypes = () => {
    // Force a re-render of the context to update all components
    setActiveJobTypes([...activeJobTypes]);
    
    // Show visual feedback
    const saveButton = document.querySelector('[data-save-button]');
    if (saveButton) {
      saveButton.classList.add('bg-green-500', 'text-white');
      setTimeout(() => {
        saveButton.classList.remove('bg-green-500', 'text-white');
      }, 1000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Job Types Management</h2>
          <Button 
            onClick={saveJobTypes}
            data-save-button
            className="bg-blue-600 hover:bg-blue-700 text-white transition-all duration-300"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
        <div className="flex gap-2">
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            {Object.keys(jobCategories).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <Input
            placeholder="New job type"
            value={newJobType}
            onChange={(e) => setNewJobType(e.target.value)}
            className="w-48"
          />
          <Button onClick={addNewJobType}>
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
          <CardTitle className="text-green-800">Active Job Types</CardTitle>
        </CardHeader>
        <CardContent 
          className="p-6 min-h-32 border-2 border-dashed border-green-200"
          onDragOver={handleDragOver}
          onDrop={handleDropToActive}
        >
          <div className="flex flex-wrap gap-2">
            {activeJobTypes.map((job, index) => (
              <Badge key={index} variant="default" className="bg-green-100 text-green-800 px-3 py-1">
                {job}
                <button 
                  onClick={() => removeFromActive(job)}
                  className="ml-2 text-green-600 hover:text-green-800"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {Object.entries(jobCategories).map(([category, jobs]) => (
        <Card key={category}>
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="text-blue-800">{category}</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {jobs.filter(job => !activeJobTypes.includes(job)).map((job, index) => (
                <div
                  key={index}
                  data-job-type={job}
                  draggable
                  onDragStart={(e) => handleDragStart(e, job)}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border cursor-move hover:bg-gray-100 transition-all duration-300"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{job}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => makeJobActive(job)}
                      className="text-green-500 hover:text-green-700"
                      title="Make Active"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeJobType(category, job)}
                      className="text-red-500 hover:text-red-700"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default JobTypesManagement;