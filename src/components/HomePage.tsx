import React, { useState } from 'react';
import { Users, Briefcase, ArrowRight, Brain, FileSearch, TrendingUp, Phone, FileText, Plus, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StartCallDialog from '@/components/StartCallDialog';

interface HomePageProps {
  onSelectModule: (module: 'candidates' | 'jobs') => void;
  onStartCall?: () => void;
  onNavigateToLiveCalls?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSelectModule, onStartCall, onNavigateToLiveCalls }) => {
  const navigate = useNavigate();
  const [showStartCallDialog, setShowStartCallDialog] = useState(false);

  const handleCallStarted = () => {
    if (onStartCall) {
      onStartCall();
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-12">
        <div className="absolute top-4 right-4">
          <Button variant="outline" className="border-[#911406] text-[#911406] hover:bg-[#911406] hover:text-white bg-gray-100" onClick={() => window.open('/admin', '_blank')}>
            Administration
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className="flex justify-center mb-0">
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761744091410_20a0b346.jpg" 
              alt="MatchPoint Logo" 
              className="h-64 object-contain"
            />
          </div>
          <p className="text-base text-gray-700 mt-0 pt-0">Upload, Call, Screen, and Present Top Talent and Searches — in Seconds.</p>
        </div>



        {/* Venn Diagram Layout */}
        {/* Venn Diagram Layout */}
        <div className="relative max-w-5xl mx-auto h-[750px] mb-16">



          {/* Top Left - Candidates */}
          <Card 
            className="absolute top-0 left-[10%] w-80 group hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 hover:border-[#911406] bg-gray-100 hover:z-20"
            onClick={() => onSelectModule('candidates')}
          >
            <div className="p-5">
              <div className="w-10 h-10 bg-[#911406]/10 rounded-full flex items-center justify-center group-hover:bg-[#911406]/20 transition-colors mx-auto mb-3">
                <Users className="w-5 h-5 text-[#911406]" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-[#911406] text-center">Process Candidates</h2>
              <p className="text-gray-600 text-sm mb-3 text-center">AI-powered screening and matching</p>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-[#911406]" /><span>AI Resume Analysis</span></div>
                <div className="flex items-center gap-2"><FileSearch className="w-4 h-4 text-[#911406]" /><span>Smart Presentations</span></div>
              </div>
              <div className="flex justify-center">
                <Button className="bg-[#911406] text-white hover:bg-[#911406]/90 rounded-full w-24 h-24 flex flex-col items-center justify-center p-2" size="sm">
                  <span className="text-xs font-semibold">Process</span>
                  <ArrowRight className="w-4 h-4 mt-1" />
                </Button>
              </div>

            </div>
          </Card>



          {/* Top Right - Jobs */}
          <Card 
            className="absolute top-0 right-[10%] w-80 group hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 hover:border-[#911406] bg-gray-100 hover:z-20"
            onClick={() => onSelectModule('jobs')}
          >
            <div className="p-5">
              <div className="w-10 h-10 bg-[#911406]/10 rounded-full flex items-center justify-center group-hover:bg-[#911406]/20 transition-colors mx-auto mb-3">
                <Briefcase className="w-5 h-5 text-[#911406]" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-[#911406] text-center">Analyze Jobs</h2>

              <p className="text-gray-600 text-sm mb-3 text-center">Intelligent job order management</p>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-[#911406]" /><span>AI Interview Questions</span></div>
                <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#911406]" /><span>Call Coaching</span></div>
              </div>
              <div className="flex justify-center">
                <Button className="bg-[#911406] text-white hover:bg-[#911406]/90 rounded-full w-24 h-24 flex flex-col items-center justify-center p-2" size="sm">
                  <span className="text-xs font-semibold">Analyze</span>

                  <ArrowRight className="w-4 h-4 mt-1" />
                </Button>
              </div>

            </div>
          </Card>





          {/* Bottom Left - Presentations */}
          <Card 
            className="absolute bottom-0 left-[10%] w-80 group hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 hover:border-[#911406] bg-gray-100 hover:z-20"
            onClick={() => navigate('/presentations')}
          >
            <div className="p-5">
              <div className="w-10 h-10 bg-[#911406]/10 rounded-full flex items-center justify-center group-hover:bg-[#911406]/20 transition-colors mx-auto mb-3">
                <FileText className="w-5 h-5 text-[#911406]" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-[#911406] text-center">Presentations</h2>
              <p className="text-gray-600 text-sm mb-3 text-center">Create and manage presentations</p>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-[#911406]" /><span>AI-Generated</span></div>
                <div className="flex items-center gap-2"><FileSearch className="w-4 h-4 text-[#911406]" /><span>Match to Jobs</span></div>
              </div>
              <div className="flex justify-center">
                <Button className="bg-[#911406] text-white hover:bg-[#911406]/90 rounded-full w-24 h-24 flex flex-col items-center justify-center p-2" size="sm">
                  <span className="text-xs font-semibold">Create</span>

                  <ArrowRight className="w-4 h-4 mt-1" />
                </Button>
              </div>

            </div>
          </Card>




          {/* Bottom Right - Live Calls */}
          <Card 
            className="absolute bottom-0 right-[10%] w-80 group hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 hover:border-[#911406] bg-gray-100 hover:z-20"
            onClick={() => onNavigateToLiveCalls && onNavigateToLiveCalls()}
          >
            <div className="p-5">
              <div className="w-10 h-10 bg-[#911406]/10 rounded-full flex items-center justify-center group-hover:bg-[#911406]/20 transition-colors mx-auto mb-3">
                <Phone className="w-5 h-5 text-[#911406]" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-[#911406] text-center">Live Calls</h2>
              <p className="text-gray-600 text-sm mb-3 text-center">Real-time AI coaching</p>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-[#911406]" /><span>AI Coaching</span></div>
                <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#911406]" /><span>Call Summaries</span></div>
              </div>
              <div className="flex justify-center">
                <Button className="bg-[#911406] text-white hover:bg-[#911406]/90 rounded-full w-24 h-24 flex flex-col items-center justify-center p-2" size="sm">
                  <span className="text-xs font-semibold">View</span>
                  <ArrowRight className="w-4 h-4 mt-1" />
                </Button>
              </div>

            </div>
          </Card>





          {/* Center Logo Button */}
          <button 
            onClick={() => navigate('/presentations')}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 group cursor-pointer transition-all duration-300 hover:scale-105"
          >
            <div className="w-80 h-80 bg-white rounded-full flex items-center justify-center shadow-2xl border-4 border-[#911406] p-12 group-hover:shadow-3xl group-hover:border-[#7a1005] transition-all">
              <img 
                src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761763534934_2511ca46.jpg" 
                alt="MatchPoint Symbol" 
                className="w-full h-full object-contain"
              />
            </div>
          </button>




        </div>

        {/* Marketing for New Jobs Button */}
        <div className="flex justify-center mb-8 -mt-4">
          <Card 
            className="w-full max-w-lg group hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 hover:border-[#911406] bg-gray-100 hover:z-20"
            onClick={() => navigate('/marketing')}
          >
            <div className="p-5 flex items-center gap-5">
              <div className="w-16 h-16 bg-[#911406]/10 rounded-full flex items-center justify-center group-hover:bg-[#911406]/20 transition-colors flex-shrink-0">
                <Megaphone className="w-7 h-7 text-[#911406]" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-[#911406]">Marketing for New Jobs</h2>
                <p className="text-gray-600 text-sm mt-1">Track companies hiring and their open positions</p>
              </div>
              <Button className="bg-[#911406] text-white hover:bg-[#911406]/90 rounded-full w-16 h-16 flex flex-col items-center justify-center p-2 flex-shrink-0" size="sm">
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </Card>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <div className="text-center"><div className="text-3xl font-bold text-[#911406]">10K+</div><div className="text-sm text-gray-600">Candidates Processed</div></div>
          <div className="text-center"><div className="text-3xl font-bold text-[#911406]">500+</div><div className="text-sm text-gray-600">Active Jobs</div></div>
          <div className="text-center"><div className="text-3xl font-bold text-[#911406]">95%</div><div className="text-sm text-gray-600">Match Accuracy</div></div>
          <div className="text-center"><div className="text-3xl font-bold text-[#911406]">3x</div><div className="text-sm text-gray-600">Faster Screening</div></div>
        </div>

        <div className="mt-16 flex justify-center">
          <Button size="lg" onClick={() => setShowStartCallDialog(true)} className="bg-[#911406] hover:bg-[#911406]/90 text-white font-bold px-8 py-6 text-lg shadow-2xl">
            <Plus className="w-6 h-6 mr-2" />Start New Call
          </Button>
        </div>

        <StartCallDialog open={showStartCallDialog} onOpenChange={setShowStartCallDialog} onCallStarted={handleCallStarted} />
      </div>
    </div>
  );
};

export default HomePage;
