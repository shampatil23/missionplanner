import React from 'react';
import { LayoutDashboard, PlusCircle, Map, Plane, Activity } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onChangeView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const menuItems = [
    { id: 'request', label: 'PHC Request', icon: PlusCircle, role: 'Small Hospital' },
    { id: 'dispatch', label: 'Central Command', icon: LayoutDashboard, role: 'Big Hospital' },
    { id: 'mission', label: 'Mission Planner', icon: Map, role: 'System' },
    { id: 'drone', label: 'Drone View', icon: Plane, role: 'Simulation' },
  ];

  return (
    <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-full fixed left-0 top-0 z-50 shadow-2xl">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3 text-emerald-400 mb-1">
          <Activity className="w-6 h-6 animate-pulse" />
          <span className="font-bold text-lg tracking-wider">SMARTMED</span>
        </div>
        <p className="text-xs text-slate-500 uppercase tracking-widest ml-9">DroneNet</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
              currentView === item.id
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <item.icon className={`w-5 h-5 ${currentView === item.id ? 'animate-bounce' : ''}`} />
            <div className="text-left">
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-[10px] opacity-60 font-light uppercase">{item.role}</div>
            </div>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-900 rounded p-3 text-xs text-slate-500 font-mono">
          <div className="flex justify-between mb-1">
            <span>SYS:</span> <span className="text-emerald-500">ONLINE</span>
          </div>
          <div className="flex justify-between">
            <span>GPS:</span> <span className="text-blue-500">LOCKED</span>
          </div>
        </div>
      </div>
    </div>
  );
};
