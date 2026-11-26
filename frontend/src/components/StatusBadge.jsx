import React from 'react';
import { useI18n } from '../context/I18nContext';

export function mapInvestigationStatus(inv) {
  if (!inv) return 'Draft';
  const raw = (inv.status || '').toLowerCase();
  if (raw === 'draft') return 'Draft';
  if (raw === 'ready') return 'Ready';
  if (raw === 'processing') return 'Processing';
  if (raw === 'completed' || raw === 'proven_root_cause') return 'Completed';
  if (raw === 'failed') return 'Failed';
  if (raw === 'archived') return 'Archived';
  if ((inv.dataset_count || 0) === 0 && (inv.anomaly_count || 0) === 0) return 'Draft';
  return 'Ready';
}

export default function StatusBadge({ status }) {
  const { t } = useI18n();
  const normalized = (status || '').toLowerCase().replace(/_/g, ' ');

  let styles = 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  let dot = 'bg-slate-500 dark:bg-slate-400';
  let label = status || 'Draft';

  if (normalized === 'completed' || normalized === 'proven root cause' || normalized === 'supported') {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70';
    dot = 'bg-emerald-600 dark:bg-emerald-400';
    if (normalized === 'proven root cause') label = t('status_proven');
    else if (normalized === 'completed') label = t('status_completed');
    else label = t('status_supported');
  } else if (normalized === 'processing' || normalized === 'in progress' || normalized === 'active') {
    styles = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70';
    dot = 'bg-indigo-600 dark:bg-indigo-400';
    label = normalized === 'processing' ? t('status_processing') : t('status_in_progress');
  } else if (normalized === 'ready') {
    styles = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70';
    dot = 'bg-blue-600 dark:bg-blue-400';
    label = t('status_ready');
  } else if (normalized === 'draft' || normalized === 'inconclusive') {
    styles = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70';
    dot = 'bg-amber-500 dark:bg-amber-400';
    label = normalized === 'draft' ? t('status_draft') : t('status_inconclusive');
  } else if (normalized === 'archived') {
    styles = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700';
    dot = 'bg-slate-400';
    label = t('status_archived');
  } else if (normalized === 'failed' || normalized === 'refuted' || normalized === 'critical' || normalized === 'high') {
    styles = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70';
    dot = 'bg-rose-600 dark:bg-rose-400';
    label = normalized === 'refuted' ? t('status_refuted') : (normalized === 'failed' ? t('status_failed') : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase());
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap ${styles}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}
