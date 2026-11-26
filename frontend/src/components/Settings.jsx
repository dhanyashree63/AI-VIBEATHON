import React, { useEffect, useState } from 'react';
import { ShieldCheck, Sliders, Sun, Moon, Monitor, Globe, Check, Compass } from 'lucide-react';
import { fetchSettingsStatus } from '../api';
import { useTheme } from '../context/ThemeContext';
import { useI18n, LANGUAGES } from '../context/I18nContext';

export default function Settings({ onReopenOnboarding }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();

  const [status, setStatus] = useState(null);
  const [autoMaskPii, setAutoMaskPii] = useState(true);
  const [alphaLevel, setAlphaLevel] = useState('0.05');

  useEffect(() => {
    fetchSettingsStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const ai = status?.ai_provider;
  const sec = status?.security;

  const themeCards = [
    { id: 'light', label: t('theme_light'), desc: t('theme_light_desc'), icon: Sun },
    { id: 'dark', label: t('theme_dark'), desc: t('theme_dark_desc'), icon: Moon },
    { id: 'system', label: t('theme_system'), desc: `${t('theme_system_desc')} (${resolvedTheme})`, icon: Monitor }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {t('settings_title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {t('settings_subtitle')}
        </p>
      </div>

      {/* Appearance & Theme */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Sun className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t('theme_label')}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">{t('saved_locally')}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeCards.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D1220] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-4 h-4 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`} />
                  {active && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">{opt.label}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interface Language */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t('language_label')}</span>
          </div>
          <span className="text-[11px] font-mono uppercase text-slate-500">{lang}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  active
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D1220] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span>{l.native}</span>
                <span className="font-mono text-[10px] uppercase text-slate-400">{l.code}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile & Analysis Preferences */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{t('analysis_prefs')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">{t('auto_pii_title')}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('auto_pii_desc')}</div>
            </div>
            <input
              type="checkbox"
              checked={autoMaskPii}
              onChange={(e) => setAutoMaskPii(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">{t('alpha_title')}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('alpha_desc')}</div>
            </div>
            <select
              value={alphaLevel}
              onChange={(e) => setAlphaLevel(e.target.value)}
              className="bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
            >
              <option value="0.05">0.05</option>
              <option value="0.01">0.01</option>
              <option value="0.001">0.001</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security & AI Provider */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{t('security_engine_status')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">{t('path_traversal_label')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sec?.path_traversal_protection !== false ? 'ACTIVE' : 'OFF'}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">{t('pii_masking_label')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sec?.pii_detection_and_masking !== false ? 'ACTIVE' : 'OFF'}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">{t('active_provider_label')}</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate ml-2">{ai?.active_provider || 'deterministic_statistical_engine'}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">{t('upload_limit_label')}</span>
            <span className="text-slate-900 dark:text-white font-bold">
              {sec?.max_upload_mb || 50} MB ({(sec?.allowed_extensions || ['.csv', '.json', '.xlsx']).join(', ')})
            </span>
          </div>
        </div>
      </div>

      {/* Reopen Guided Walkthrough */}
      {onReopenOnboarding && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{t('ob_reopen_walkthrough')}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('ob_reopen_desc')}</p>
          </div>
          <button
            type="button"
            onClick={onReopenOnboarding}
            className="shrink-0 px-4 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition cursor-pointer"
          >
            {t('ob_reopen_walkthrough')}
          </button>
        </div>
      )}
    </div>
  );
}
