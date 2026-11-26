import React from 'react';
import {
  History,
  CheckCircle2,
  Database,
  Search,
  Scale,
  Compass,
  Zap,
  ArrowRight
} from 'lucide-react';
import EmptyState from './EmptyState';
import { useI18n } from '../context/I18nContext';

export default function InvestigationHistory({ investigation }) {
  const { t } = useI18n();
  const history = investigation?.history || [];

  const getEventIcon = (type) => {
    switch (type) {
      case 'INVESTIGATION_CREATED':
      case 'DEMO_INITIALIZED':
        return <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case 'DATASET_INGESTED':
      case 'DATASETS_FUSED':
        return <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
      case 'ANOMALY_DISCOVERED':
        return <Search className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      case 'HYPOTHESES_EVALUATED':
        return <Scale className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case 'RECOMMENDATION_FORMULATED':
        return <Compass className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />;
      case 'NEW_EVIDENCE_INGESTED':
      case 'CONCLUSION_UPDATE':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <History className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
          {t('hist_title')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('hist_subtitle')}
        </p>
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={History}
          title={t('empty_history_title')}
          description={t('empty_history_desc')}
        />
      ) : (
        <div className="relative pl-8 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-px before:bg-slate-200 dark:before:bg-slate-800 space-y-4">
          {history.map((ev, i) => {
            const isLatest = i === history.length - 1;
            const snapshot = ev.snapshot || {};

            return (
              <div key={ev.id} className="relative">
                <div
                  className={`absolute -left-8 top-1 w-6 h-6 rounded-full flex items-center justify-center border ${
                    isLatest
                      ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-500'
                      : 'bg-white dark:bg-[#111625] border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {getEventIcon(ev.event_type)}
                </div>

                <div
                  className={`p-4 rounded-xl border bg-white dark:bg-[#111625] ${
                    isLatest ? 'border-indigo-400 dark:border-indigo-600' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                        STEP #{ev.step_number}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{ev.title}</h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{ev.description}</p>

                  {snapshot.conclusions_changed && snapshot.conclusions_changed.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase">
                        {t('hist_conclusion_updates')}
                      </div>
                      <div className="space-y-2">
                        {snapshot.conclusions_changed.map((c, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{c.hypothesis}</span>
                            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                              <span className="line-through">{c.prior_status} ({Math.round(c.prior_strength * 100)}%)</span>
                              <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{c.new_status} ({Math.round(c.new_strength * 100)}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
