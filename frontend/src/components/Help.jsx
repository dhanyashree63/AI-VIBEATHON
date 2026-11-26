import React, { useState } from 'react';
import {
  HelpCircle,
  BookOpen,
  Database,
  Scale,
  Compass,
  History,
  ChevronDown,
  ChevronUp,
  Wrench,
  Play
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function Help({ onLoadDemo, onReopenOnboarding, isLoading }) {
  const { t } = useI18n();
  const [openFaq, setOpenFaq] = useState(0);

  const faqs = [
    { q: t('faq_1_q'), a: t('faq_1_a') },
    { q: t('faq_2_q'), a: t('faq_2_a') },
    { q: t('faq_3_q'), a: t('faq_3_a') },
    { q: t('faq_4_q'), a: t('faq_4_a') }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('help_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('help_subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onReopenOnboarding && (
            <button
              type="button"
              onClick={onReopenOnboarding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t('ob_reopen_walkthrough')}</span>
            </button>
          )}
          <button
            onClick={onLoadDemo}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{t('cta_see_how_it_works')}</span>
          </button>
        </div>
      </div>

      {/* Getting Started */}
      <section className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{t('getting_started_4')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {[
            { n: '01', title: t('wf_1_title'), text: t('wf_1_desc') },
            { n: '02', title: t('wf_2_title'), text: t('wf_2_desc') },
            { n: '03', title: t('wf_3_title'), text: t('wf_3_desc') },
            { n: '04', title: t('wf_4_title'), text: t('wf_4_desc') }
          ].map((s) => (
            <div key={s.n} className="p-4 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">{s.n}</span>
              <div className="font-semibold text-slate-900 dark:text-white">{s.title}</div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Explanations */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            icon: Database,
            title: t('help_feat_1_title'),
            desc: t('help_feat_1_desc')
          },
          {
            icon: Scale,
            title: t('help_feat_2_title'),
            desc: t('help_feat_2_desc')
          },
          {
            icon: Compass,
            title: t('help_feat_3_title'),
            desc: t('help_feat_3_desc')
          },
          {
            icon: History,
            title: t('help_feat_4_title'),
            desc: t('help_feat_4_desc')
          }
        ].map((f, idx) => {
          const Icon = f.icon;
          return (
            <div key={idx} className="p-5 rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          );
        })}
      </section>

      {/* FAQs */}
      <section className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{t('faq_heading')}</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {faqs.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="py-3">
                <button
                  onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                  className="w-full flex items-center justify-between text-left gap-4"
                >
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">{item.q}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-indigo-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>
                {isOpen && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed pr-6">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="rounded-xl bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 p-5 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Wrench className="w-4 h-4 text-slate-500" />
          <span>{t('troubleshooting_heading')}</span>
        </div>
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-5 leading-relaxed">
          <li><strong>{t('ts_1_q')}</strong> {t('ts_1_a')}</li>
          <li><strong>{t('ts_2_q')}</strong> {t('ts_2_a')}</li>
          <li><strong>{t('ts_3_q')}</strong> {t('ts_3_a')}</li>
        </ul>
      </section>
    </div>
  );
}
