import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Brain, Loader2, CheckCircle, AlertCircle, 
  FileText, Users, TrendingUp, Zap
} from 'lucide-react';

interface AIProcessingProps {
  onClose: () => void;
}

const AIProcessing: React.FC<AIProcessingProps> = ({ onClose }) => {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState({
    parseResumes: true,
    scoreMatch: true,
    extractSkills: true,
    analyzeExperience: true,
    predictFit: true,
    generateSummary: true
  });

  const handleProcess = async () => {
    setProcessing(true);
    const totalCandidates = 45; // Mock number
    
    for (let i = 0; i <= totalCandidates; i++) {
      setProcessedCount(i);
      setProgress((i / totalCandidates) * 100);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setProcessing(false);
    setTimeout(onClose, 2000);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            AI Batch Processing
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-blue-600" />
                <span className="font-semibold">Candidates</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">45</p>
              <p className="text-sm text-gray-600">Ready to process</p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-purple-600" />
                <span className="font-semibold">Processing Time</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">~5 min</p>
              <p className="text-sm text-gray-600">Estimated</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="font-semibold">Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-green-600">95%</p>
              <p className="text-sm text-gray-600">Match rate</p>
            </div>
          </div>

          {/* Processing Options */}
          <div>
            <h3 className="font-semibold mb-3">Processing Options</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="parse"
                  checked={selectedOptions.parseResumes}
                  onCheckedChange={(checked) => 
                    setSelectedOptions({...selectedOptions, parseResumes: checked as boolean})
                  }
                />
                <Label htmlFor="parse" className="flex-1">
                  <span className="font-medium">Parse & Extract Resume Data</span>
                  <p className="text-sm text-gray-500">Extract contact info, experience, education</p>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="score"
                  checked={selectedOptions.scoreMatch}
                  onCheckedChange={(checked) => 
                    setSelectedOptions({...selectedOptions, scoreMatch: checked as boolean})
                  }
                />
                <Label htmlFor="score" className="flex-1">
                  <span className="font-medium">Calculate Match Scores</span>
                  <p className="text-sm text-gray-500">AI scoring based on job requirements</p>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="skills"
                  checked={selectedOptions.extractSkills}
                  onCheckedChange={(checked) => 
                    setSelectedOptions({...selectedOptions, extractSkills: checked as boolean})
                  }
                />
                <Label htmlFor="skills" className="flex-1">
                  <span className="font-medium">Skills Analysis</span>
                  <p className="text-sm text-gray-500">Identify and categorize technical & soft skills</p>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="predict"
                  checked={selectedOptions.predictFit}
                  onCheckedChange={(checked) => 
                    setSelectedOptions({...selectedOptions, predictFit: checked as boolean})
                  }
                />
                <Label htmlFor="predict" className="flex-1">
                  <span className="font-medium">Predictive Culture Fit</span>
                  <p className="text-sm text-gray-500">Analyze compatibility with company culture</p>
                </Label>
              </div>
            </div>
          </div>

          {/* Job Selection */}
          <div>
            <Label htmlFor="job">Target Job Position (Optional)</Label>
            <Select>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select a job to match candidates against" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="senior-dev">Senior Software Engineer</SelectItem>
                <SelectItem value="product-mgr">Product Manager</SelectItem>
                <SelectItem value="data-sci">Data Scientist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Progress */}
          {processing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Processing {processedCount} of 45 candidates...
                </span>
                <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                AI is analyzing candidate profiles and generating insights...
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancel
            </Button>
            <Button 
              onClick={handleProcess}
              disabled={processing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Start AI Processing
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIProcessing;