import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Briefcase, MapPin, DollarSign, Star, Send } from 'lucide-react';
import { Candidate } from '@/types/candidate';

interface Props {
  candidate: Candidate;
  onClose: () => void;
}

const JobMatchingPanel: React.FC<Props> = ({ candidate, onClose }) => {
  const matchingJobs = [
    {
      id: 1,
      title: 'Senior RN - ICU',
      hospital: 'Mount Sinai Hospital',
      location: 'New York, NY',
      salary: '$95,000 - $115,000',
      matchScore: 92,
      urgency: 'High'
    },
    {
      id: 2,
      title: 'Charge Nurse - Emergency',
      hospital: 'NYU Langone Health',
      location: 'Brooklyn, NY',
      salary: '$88,000 - $105,000',
      matchScore: 87,
      urgency: 'Medium'
    },
    {
      id: 3,
      title: 'Clinical Nurse Specialist',
      hospital: 'NewYork-Presbyterian',
      location: 'Manhattan, NY',
      salary: '$92,000 - $110,000',
      matchScore: 85,
      urgency: 'Low'
    }
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job Matches for {candidate.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {matchingJobs.map((job) => (
            <Card key={job.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{job.title}</h3>
                    <p className="text-gray-600">{job.hospital}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 mb-1">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="font-bold text-lg">{job.matchScore}%</span>
                    </div>
                    <Badge variant={job.urgency === 'High' ? 'destructive' : 
                           job.urgency === 'Medium' ? 'default' : 'secondary'}>
                      {job.urgency} Priority
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-4 text-sm text-gray-600 mb-3">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {job.location}
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {job.salary}
                  </div>
                </div>

                <Progress value={job.matchScore} className="mb-3" />

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1">
                    <Send className="w-4 h-4 mr-2" />
                    Submit Candidate
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobMatchingPanel;