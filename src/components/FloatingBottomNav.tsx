import React from 'react';
import {
  User,
  Shield,
  Sliders,
} from 'lucide-react';

export type ManagementTab = 'account' | 'security' | 'custom';

interface FloatingBottomNavProps {
  activeTab: ManagementTab;
  onSelectTab: (tab: ManagementTab) => void;
  themeMode?: 'dark' | 'light';
  triggerHaptic?: () => void;
  isEmbedded?: boolean;
}

export const FloatingBottomNav: React.FC<FloatingBottomNavProps> = ({
  activeTab,
  onSelectTab,
  themeMode = 'dark',
  triggerHaptic,
}) => {
  const navItems: { id: ManagementTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'custom', label: 'Customise', icon: Sliders },
  ];

  const activeIndex = navItems.findIndex(item => item.id === activeTab);

  return (
    <div className="w-full flex justify-center py-1">
      <nav
        aria-label="Profile Section Navigation Bar"
        className={`relative grid grid-cols-3 w-full max-w-sm px-2 py-1.5 rounded-full shadow-xl border backdrop-blur-md transition-all duration-200 ${
          themeMode === 'dark'
            ? 'bg-[#1e1f22]/95 border-[#3f4147] text-[#dbdee1] shadow-black/50'
            : 'bg-white/95 border-slate-300 text-slate-800 shadow-slate-300/40'
        }`}
      >
        {/* Sliding Indicator */}
        <div 
          className="absolute z-0 top-[6px] bottom-[6px] left-[8px] bg-[#5865f2] rounded-full shadow-md"
          style={{ 
            width: 'calc((100% - 16px) / 3)',
            transform: `translateX(${activeIndex * 100}%)`,
            transition: 'transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1)'
          }}
        />

        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (triggerHaptic) triggerHaptic();
                onSelectTab(item.id);
              }}
              className={`relative z-10 flex items-center justify-center gap-1.5 px-1 py-2 font-semibold transition-colors duration-200 cursor-pointer min-h-[40px] select-none ${
                isActive
                  ? 'text-white'
                  : themeMode === 'dark'
                  ? 'text-[#949ba4] hover:text-[#dbdee1]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <IconComponent className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`} />
              <span className="text-[11px] tracking-wide">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
