import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface SmartJobUpdateProps {
  jobId: string;
  questionLists: {
    timing: string[];
    job: string[];
    company: string[];
    hiring: string[];
  };
  existingData: {
    timingQuestions: { [key: string]: string };
    jobQuestions: { [key: string]: string };
    companyQuestions: { [key: string]: string };
    hiringQuestions: { [key: string]: string };
  };
  onUpdate: (updates: any) => void;
}

const SmartJobUpdate: React.FC<SmartJobUpdateProps> = ({
  jobId,
  questionLists,
  existingData,
  onUpdate
}) => {
  const [newInfo, setNewInfo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSmartUpdate = async () => {
    if (!newInfo.trim()) {
      toast({
        title: 'No Information',
        description: 'Please enter some information to analyze.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-job-update', {
        body: {
          newInfo,
          existingData,
          questionLists
        }
      });

      if (error) throw error;

      if (data?.success && data?.updates) {
        onUpdate(data.updates);
        setLastUpdate(data.updates.summary || 'Information updated successfully');
        setNewInfo('');
        toast({
          title: 'Job Order Updated',
          description: data.updates.summary || 'New information has been added to the appropriate fields.',
        });
      } else {
        throw new Error(data?.error || 'Failed to process information');
      }
    } catch (error) {
      console.error('Smart update error:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to analyze and update job order.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-purple-800 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          Smart Job Update
        </CardTitle>
        <p className="text-sm text-purple-600">
          Paste any new information about this job and AI will automatically update the right fields.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={newInfo}
          onChange={(e) => setNewInfo(e.target.value)}
          placeholder="Example: The work schedule is Monday-Friday 8am-5pm. The hiring manager is Sarah Johnson. The biggest challenge has been finding candidates with both clinical experience and leadership skills. The salary range is $85,000-$95,000..."
          className="min-h-[120px] border-purple-200 focus:border-purple-400 focus:ring-purple-400"
        />
        
        <div className="flex items-center justify-between">
          <Button
            onClick={handleSmartUpdate}
            disabled={isProcessing || !newInfo.trim()}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze & Update
              </>
            )}
          </Button>
          
          {lastUpdate && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full">
              <Check className="h-4 w-4" />
              {lastUpdate}
            </div>
          )}
        </div>

        <div className="text-xs text-purple-500 flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            AI will match your information to existing questions. New data will be appended to existing answers, not replaced.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartJobUpdate;
