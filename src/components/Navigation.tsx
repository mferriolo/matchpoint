import React from 'react';
import { 
  Briefcase, 
  Phone, 
  FileText,
  Home,
  Users,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import SidebarVideoInterface from './SidebarVideoInterface';

interface NavigationProps {
  currentView: string;
  onViewChange: (view: any) => void;
  showVideoInSidebar?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange, showVideoInSidebar }) => {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'candidates', label: 'Candidates', icon: Users },
    { id: 'presentations', label: 'Presentations', icon: FileText },
    { id: 'dashboard', label: 'Jobs', icon: Briefcase },
    { id: 'live-call', label: 'Live Calls', icon: Phone },
  ];



  return (
    <div className="w-64 bg-[#6a1107] text-white p-6 flex flex-col">

      {/* Logo Header */}
      <div className="mb-8 flex items-center gap-3">
        <img 
          src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761676387442_b759d2c1.jpg" 
          alt="MatchPoint Logo" 
          className="w-12 h-12 object-contain bg-white rounded-full p-1"
        />
        <div>
          <h1 className="text-xl font-bold text-white">
            MatchPoint
          </h1>
          <p className="text-white/80 text-xs mt-0.5">AI Assistant</p>
        </div>
      </div>



      <nav className="space-y-2 flex-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id || (item.id === 'live-call' && currentView === 'live-call-landing');
          
          return (
            <Button
              key={item.id}
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                "w-full justify-start text-left hover:bg-white/10",
                isActive && "bg-white/20"
              )}
              onClick={() => onViewChange(item.id === 'live-call' ? 'live-call-landing' : item.id)}
            >
              <Icon className="mr-3 h-4 w-4" />
              {item.label}

            </Button>

          );
        })}

        <div className="border-t border-white/20 my-4" />

        <Button
          variant="ghost"
          className="w-full justify-start text-left hover:bg-white/10"
          onClick={() => window.open('/admin', '_blank')}
        >
          <Settings className="mr-3 h-4 w-4" />
          Administration
        </Button>
      </nav>



      <div className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Quick Stats</span>
          <Users className="h-4 w-4 text-red-300" />
        </div>
        <div className="text-xs text-red-200 space-y-1">
          <div>Active Jobs: 12</div>
          <div>Candidates: 234</div>
          <div>Calls Today: 8</div>
        </div>
      </div>
    </div>
  );
};

export default Navigation;