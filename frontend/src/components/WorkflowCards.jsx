import React from 'react';
import { Database, TrendingUp, Lightbulb, Target, ArrowRight } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function WorkflowCards() {
  const { t } = useI18n();

  const steps = [
    {
      step: '01',
      title: t('wf_1_title'),
      description: t('wf_1_desc'),
      icon: Database,
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/60',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      step: '02',
      title: t('wf_2_title'),
      description: t('wf_2_desc'),
      icon: TrendingUp,
      iconBg: 'bg-blue-50 dark:bg-blue-950/60',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      step: '03',
      title: t('wf_3_title'),
      description: t('wf_3_desc'),
      icon: Lightbulb,
      iconBg: 'bg-amber-50 dark:bg-amber-950/60',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      step: '04',
      title: t('wf_4_title'),
      description: t('wf_4_desc'),
      icon: Target,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <section className="space-y-3.5">
      <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
        {t('workflow_heading')}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 relative">
        {steps.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={item.step} className="relative flex items-stretch">
              <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] p-5 flex flex-col justify-between transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.iconBg}`}>
                      <Icon className={`w-4 h-4 ${item.iconColor}`} />
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden xl:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-slate-400">
                  <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
