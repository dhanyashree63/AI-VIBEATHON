import React from 'react';
import { CheckCircle2, Database, Search, Scale, Compass } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function HeroIllustration({ investigationsCount = 0, datasetsCount = 0 }) {
  const { t } = useI18n();
  const stages = [
    { icon: Database, label: t('stage_fusion'), detail: t('stage_fusion_desc') },
    { icon: Search, label: t('stage_anomaly'), detail: t('stage_anomaly_desc') },
    { icon: Scale, label: t('stage_competing'), detail: t('stage_competing_desc') },
    { icon: Compass, label: t('stage_next'), detail: t('stage_next_desc') }
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0D1220] p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="text-xs font-semibold text-slate-900 dark:text-white">
            {t('pipeline_title')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('pipeline_subtitle')}
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            {investigationsCount} {t('sessions_unit')}
          </span>
          <span className="px-2 py-0.5 rounded bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            {datasetsCount} {t('files_unit')}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {stages.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white dark:bg-[#13192B] border border-slate-200/80 dark:border-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{s.label}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.detail}</div>
                </div>
              </div>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
