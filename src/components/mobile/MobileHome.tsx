import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Briefcase, FileText, Phone, Megaphone, ArrowRight } from 'lucide-react';
import MobileShell from './MobileShell';

interface Tile {
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  to: () => void;
}

/**
 * Mobile home: stacked cards instead of the desktop's Venn-diagram layout.
 * Each card is a full-width tap target (≥56px) so it's comfortable on a
 * phone. Routes match the desktop equivalents — for the in-app views that
 * live inside AppLayout, we pass `initialView` via location.state the same
 * way the bottom-nav tabs do.
 */
const MobileHome: React.FC = () => {
  const navigate = useNavigate();

  const tiles: Tile[] = [
    { label: 'Process Candidates', desc: 'AI screening + matching', icon: Users,     to: () => navigate('/', { state: { initialView: 'candidates' } }) },
    { label: 'Analyze Jobs',       desc: 'Job order management',    icon: Briefcase, to: () => navigate('/', { state: { initialView: 'dashboard' } }) },
    { label: 'Live Calls',         desc: 'Real-time AI coaching',   icon: Phone,     to: () => navigate('/', { state: { initialView: 'live-call-landing' } }) },
    { label: 'Presentations',      desc: 'Create and manage',       icon: FileText,  to: () => navigate('/presentations') },
    { label: 'Marketing',          desc: 'Track hiring companies',  icon: Megaphone, to: () => navigate('/marketing') },
  ];

  return (
    <MobileShell title="MatchPoint">
      <div className="px-4 py-5 space-y-3">
        <div className="text-center mb-4">
          <img
            src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761744091410_20a0b346.jpg"
            alt="MatchPoint"
            className="h-32 object-contain mx-auto"
          />
          <p className="text-xs text-gray-600 mt-1">Upload, Call, Screen, Present.</p>
        </div>
        {tiles.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              onClick={t.to}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 active:bg-gray-50 shadow-sm"
            >
              <div className="w-11 h-11 flex-shrink-0 rounded-full bg-[#911406]/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#911406]" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-gray-900 text-sm">{t.label}</div>
                <div className="text-xs text-gray-500">{t.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </MobileShell>
  );
};

export default MobileHome;
