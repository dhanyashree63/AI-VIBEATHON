import React from 'react';
import {
  Plus,
  Play,
  ArrowRight,
  Database,
  Clock,
  FolderOpen,
  ExternalLink
} from 'lucide-react';
import HeroIllustration from './HeroIllustration';
import UploadPanel from './UploadPanel';
import WorkflowCards from './WorkflowCards';
import StatusBadge, { mapInvestigationStatus } from './StatusBadge';
import { useI18n } from '../context/I18nContext';

export default function Overview({
  investigations = [],
  activeInvestigationId,
  onOpenNewModal,
  onLoadDemo,
  onOpenInvestigation,
  onInspectInvestigation,
  onViewAllInvestigations,
  onUploadComplete,
  isLoading
}) {
  const { t } = useI18n();
  const totalDatasets = investigations.reduce((sum, inv) => sum + (inv.dataset_count || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* 1. HERO SECTION */}
      <section className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 lg:p-10 transition-colors">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-[11px] font-mono font-semibold tracking-[0.14em] text-indigo-600 dark:text-indigo-400 uppercase">
              {t('brand_tagline')}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white leading-[1.18] tracking-tight">
              {t('hero_title_prefix')}{' '}
              <span className="text-indigo-600 dark:text-indigo-400">
                {t('hero_title_highlight')}
              </span>
              .
            </h1>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              {t('hero_subtitle')}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onOpenNewModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('cta_start_investigation')}</span>
              </button>

              <button
                onClick={onLoadDemo}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Play className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{isLoading ? t('loading_demo') : t('cta_see_how_it_works')}</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <HeroIllustration
              investigationsCount={investigations.length}
              datasetsCount={totalDatasets}
            />
          </div>
        </div>
      </section>

      {/* 2. DATA UPLOAD PANEL */}
      <UploadPanel
        activeInvestigationId={activeInvestigationId}
        investigations={investigations}
        onUploadComplete={onUploadComplete}
        onOpenInvestigation={onOpenInvestigation}
      />

      {/* 3. WORKFLOW CARDS */}
      <WorkflowCards />

      {/* 4. RECENT INVESTIGATIONS */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              {t('recent_investigations')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('recent_subtitle')}
            </p>
          </div>
          {investigations.length > 0 && (
            <button
              onClick={onViewAllInvestigations}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <span>{t('view_all')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {investigations.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-10 text-center">
            <div className="w-10 h-10 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mb-3">
              <FolderOpen className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('no_investigations')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              {t('no_investigations_desc')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {investigations.slice(0, 6).map((inv) => {
              const statusLabel = mapInvestigationStatus(inv);
              const updatedDate = inv.updated_at
                ? new Date(inv.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Recently';

              return (
                <div
                  key={inv.id}
                  onClick={() => onOpenInvestigation(inv.id)}
                  className="group rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 p-5 transition-colors cursor-pointer flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <StatusBadge status={statusLabel} />
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10.5px] text-slate-400">{inv.id}</span>
                        {onInspectInvestigation && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectInvestigation(inv.id);
                            }}
                            title="Inspect in separate tab"
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                      {inv.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {inv.description || 'Autonomous multi-dataset causal investigation.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      {inv.dataset_count || 0} {t('datasets_label')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {updatedDate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
