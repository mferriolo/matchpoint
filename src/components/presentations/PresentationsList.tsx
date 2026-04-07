import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { 
  Search, 
  Filter, 
  Calendar,
  FileText,
  Edit,
  Trash2,
  Copy,
  User,
  Briefcase,
  Building,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import ConfirmationDialog from '@/components/ui/confirmation-dialog';

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

interface PresentationsListProps {
  presentations: Presentation[];
  onRefresh: () => void;
  onEdit: (presentation: Presentation) => void;
  onDuplicate: (presentation: Presentation) => void;
}

export default function PresentationsList({ 
  presentations, 
  onRefresh, 
  onEdit,
  onDuplicate 
}: PresentationsListProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const { isOpen, dialogConfig, showConfirmation, hideConfirmation } = useConfirmDialog();

  const filteredPresentations = presentations
    .filter(p => {
      const searchLower = searchQuery.toLowerCase();
      return (
        p.presentation_name.toLowerCase().includes(searchLower) ||
        p.candidate_name?.toLowerCase().includes(searchLower) ||
        p.job_title?.toLowerCase().includes(searchLower) ||
        p.company?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        return a.presentation_name.localeCompare(b.presentation_name);
      }
    });

  const handleDelete = (presentation: Presentation) => {
    showConfirmation({
      title: 'Delete Presentation?',
      message: `Are you sure you want to delete "${presentation.presentation_name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonColor: 'red',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('candidate_presentations')
            .delete()
            .eq('id', presentation.id);

          if (error) throw error;

          toast({
            title: "Presentation deleted",
            description: "The presentation has been removed successfully."
          });
          
          onRefresh();
        } catch (error) {
          console.error('Error deleting presentation:', error);
          toast({
            title: "Error",
            description: "Failed to delete presentation",
            variant: "destructive"
          });
        }
      }
    });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search presentations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm text-gray-500">
          Found {filteredPresentations.length} presentation{filteredPresentations.length !== 1 ? 's' : ''}
        </div>

        <div className="space-y-3">
          {filteredPresentations.map((presentation) => (
            <Card key={presentation.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">
                      {presentation.presentation_name}
                    </h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {presentation.candidate_name}
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        {presentation.job_title}
                      </div>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        {presentation.company}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      Created {format(new Date(presentation.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(presentation)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDuplicate(presentation)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(presentation)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedId(expandedId === presentation.id ? null : presentation.id)}
                  className="mt-2"
                >
                  {expandedId === presentation.id ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Hide Content
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Show Content
                    </>
                  )}
                </Button>

                {expandedId === presentation.id && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm">
                      {presentation.presentation_content}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {filteredPresentations.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchQuery ? 'No presentations found matching your search.' : 'No saved presentations yet.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={isOpen}
        onClose={hideConfirmation}
        onConfirm={dialogConfig.onConfirm}
        title={dialogConfig.title}
        message={dialogConfig.message}
        confirmText={dialogConfig.confirmText}
        cancelText={dialogConfig.cancelText}
        confirmButtonColor={dialogConfig.confirmButtonColor}
        isDestructive={dialogConfig.isDestructive}
      />
    </>
  );
}