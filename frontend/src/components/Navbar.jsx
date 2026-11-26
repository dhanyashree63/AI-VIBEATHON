import React, { useState, useRef, useEffect } from 'react';
import {
  HelpCircle,
  Bell,
  ChevronDown,
  Menu,
  Settings,
  Sun,
  Moon,
  Monitor,
  Globe,
  Play,
  LogIn,
  LogOut
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useI18n, LANGUAGES } from '../context/I18nContext';

export default function Navbar({
  onOpenMobileMenu,
  onNavigate,
  onLoadDemo,
  recentEvents = [],
  isLoading,
  user = null,
  onOpenAuth,
  onLogout
}) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const langRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themeOptions = [
    { id: 'light', icon: Sun, label: t('theme_light') },
    { id: 'dark', icon: Moon, label: t('theme_dark') },
    { id: 'system', icon: Monitor, label: t('theme_system') }
  ];

  return (
    <header className="h-16 bg-white dark:bg-[#111625] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 transition-colors">
      {/* Left: Mobile Menu Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Right: Theme Toggle, Language Selector, Help, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* 3-Way Theme Segmented Switcher (Light / Dark / System) */}
        <div
          className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F1A] p-0.5"
          role="group"
          aria-label={t('theme_label')}
        >
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={active}
                className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        {/* Language Selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            aria-label={t('language_label')}
          >
            <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="uppercase font-mono text-[11px]">{lang}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {langOpen && (
            <div className="absolute right-0 mt-1.5 w-52 max-h-80 overflow-y-auto rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 shadow-lg py-1 z-50">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setLangOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition ${
                    lang === l.code
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span>{l.native}</span>
                    {l.native !== l.label && (
                      <span className="text-[10px] text-slate-400">({l.label})</span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-slate-400 shrink-0">{l.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Help Button */}
        <button
          onClick={() => onNavigate('help')}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <HelpCircle className="w-4 h-4" />
          <span>{t('nav_help')}</span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {recentEvents.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-1.5 w-80 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 shadow-lg p-3 z-50">
              <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">{t('recent_activity')}</span>
                <span className="text-[11px] font-mono text-slate-500">{recentEvents.length}</span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 mt-1">
                {recentEvents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">{t('no_activity_yet')}</div>
                ) : (
                  recentEvents.slice(-5).reverse().map((ev) => (
                    <div key={ev.id} className="px-1.5 py-2">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{ev.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{ev.description}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <div className="w-6 h-6 rounded-md bg-[#10152F] dark:bg-indigo-600 text-white flex items-center justify-center text-[11px] font-semibold">
              RA
            </div>
            <span className="hidden sm:inline text-xs font-medium text-slate-700 dark:text-slate-200">
              {t('investigator_role')}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 z-50">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {user ? user.name : t('investigator_role')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user ? user.email : t('local_workspace')}
                </div>
              </div>
              <div className="p-1 space-y-0.5">
                {user ? (
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      if (onLogout) onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('sign_out')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      if (onOpenAuth) onOpenAuth();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t('sign_in_register')}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onLoadDemo();
                  }}
                  disabled={isLoading}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{t('cta_see_how_it_works')}</span>
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('nav_settings')}</span>
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('help');
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('nav_help')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
