import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { RequestForm } from './components/RequestForm';
import { DispatchDashboard } from './components/DispatchDashboard';
import { MissionControl } from './components/MissionControl';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dispatch');

  const renderContent = () => {
    switch (currentView) {
      case 'request':
        return <RequestForm />;
      case 'dispatch':
        return <DispatchDashboard />;
      case 'mission':
        return <MissionControl viewMode="planner" />;
      case 'drone':
        return <MissionControl viewMode="drone" />;
      default:
        return <DispatchDashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      
      <main className="flex-1 ml-64 h-full relative">
        {/* Background Grid Pattern for Technical Look */}
        <div className="absolute inset-0 z-0 opacity-5 pointer-events-none" 
             style={{ 
               backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)', 
               backgroundSize: '24px 24px' 
             }}>
        </div>

        <div className="relative z-10 h-full">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;