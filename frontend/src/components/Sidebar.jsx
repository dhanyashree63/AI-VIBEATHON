import React from 'react';
import {
  LayoutDashboard,
  Search,
  Database,
  FileText,
  Settings,
  HelpCircle,
  X
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function Sidebar({
  activeTab,
  setActiveTab,
  counts,
  mobileOpen,
  setMobileOpen
}) {
  const { t } = useI18n();

  const primaryItems = [
    { id: 'overview', label: t('nav_overview'), icon: LayoutDashboard },
    { id: 'investigations', label: t('nav_investigations'), icon: Search, badge: counts?.investigations },
    { id: 'sources', label: t('nav_data_sources'), icon: Database, badge: counts?.datasets },
    { id: 'reports', label: t('nav_reports'), icon: FileText },
  ];

  const secondaryItems = [
    { id: 'settings', label: t('nav_settings'), icon: Settings },
    { id: 'help', label: t('nav_help'), icon: HelpCircle },
  ];

  const handleNav = (id) => {
    setActiveTab(id);
    if (setMobileOpen) setMobileOpen(false);
  };

  const renderItem = (item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleNav(item.id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
          isActive
            ? 'bg-[#4F46E5] text-white'
            : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
          <span>{item.label}</span>
        </div>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded ${
              isActive
                ? 'bg-white/20 text-white'
                : 'bg-white/[0.08] text-slate-300'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#10152F] dark:bg-[#090D18] text-white w-60 border-r border-white/[0.08] select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.08]">
        <button
          onClick={() => handleNav('overview')}
          className="flex items-center gap-2.5 text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7L12 12L21 7L12 2Z" fill="white" />
              <path d="M3 12L12 17L21 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85" />
              <path d="M3 17L12 22L21 17" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="font-display font-bold text-sm tracking-wide text-white leading-tight">
              REVERSE AI
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {t('platform_version')}
            </div>
          </div>
        </button>

        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08]"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 flex flex-col justify-between px-3 py-5 overflow-y-auto">
        <div className="space-y-5">
          <nav className="space-y-1">
            {primaryItems.map(renderItem)}
          </nav>

          <div className="border-t border-white/[0.08] pt-4">
            <nav className="space-y-1">
              {secondaryItems.map(renderItem)}
            </nav>
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.08] px-2">
          <div className="text-[11px] font-medium text-slate-400">
            {t('brand_tagline')}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-40 w-60">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
