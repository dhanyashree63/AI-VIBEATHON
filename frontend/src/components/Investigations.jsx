import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Play,
  ArrowLeft,
  Database,
  Clock,
  AlertTriangle,
  Scale,
  Compass,
  History as HistoryIcon,
  BarChart3,
  Zap,
  Info,
  FolderOpen,
  ExternalLink,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Loader2,
  X,
  ArrowUpDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import StatusBadge, { mapInvestigationStatus } from './StatusBadge';
import Discoveries from './Discoveries';
import CompetingExplanations from './CompetingExplanations';
import NextBestEvidence from './NextBestEvidence';
import InvestigationHistory from './InvestigationHistory';
import UploadPanel from './UploadPanel';
import {
  fetchInvestigationCharts,
  updateInvestigation,
  deleteInvestigation,
  runInvestigationAnalysis
} from '../api';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

const ENTITY_COLORS = ['#4F46E5', '#2563EB', '#E11D48', '#059669', '#D97706', '#7C3AED'];

export default function Investigations({
  investigations = [],
  selectedInvestigation,
  onSelectInvestigation,
  onInspectInvestigation,
  onClearSelection,
  onOpenNewModal,
  onLoadDemo,
  onExecuteNextStep,
  onRefresh,
  onListChanged,
  onDeletedInvestigation,
  onShowToast,
  isLoading,
  initialSubTab = 'summary'
}) {
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('updated_at'); // updated_at | created_at
  const [sortOrder, setSortOrder] = useState('desc'); // desc | asc
  const [subTab, setSubTab] = useState(initialSubTab);
  const [chartData, setChartData] = useState(null);

  // Management modals & action state
  const [editingItem, setEditingItem] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editError, setEditError] = useState('');
  const [deletingItem, setDeletingItem] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [actionError, setActionError] = useState('');

  const inv = selectedInvestigation?.investigation;
  const progress = selectedInvestigation?.progress;
  const datasets = selectedInvestigation?.datasets || [];
  const anomalies = selectedInvestigation?.anomalies || [];
  const hypotheses = selectedInvestigation?.hypotheses || [];
  const recommendations = selectedInvestigation?.recommendations || [];
  const history = selectedInvestigation?.history || [];

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab, inv?.id]);

  useEffect(() => {
    if (inv?.id) {
      fetchInvestigationCharts(inv.id)
        .then(setChartData)
        .catch(() => setChartData(null));
    }
  }, [inv?.id, datasets.length, hypotheses.length, history.length]);

  const openEditModal = (item, e) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setEditTitle(item.title || '');
    setEditDesc(item.description || '');
    setEditError('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    if (editTitle.trim().length < 2) {
      setEditError('Investigation name must be at least 2 characters.');
      return;
    }
    setIsMutating(true);
    setEditError('');
    try {
      const res = await updateInvestigation(editingItem.id, {
        title: editTitle.trim(),
        description: editDesc.trim()
      });
      if (!res?.investigation?.id) {
        throw new Error('Server did not return the updated investigation.');
      }
      setEditingItem(null);
      if (onListChanged) await onListChanged();
      if (inv?.id === editingItem.id && onRefresh) await onRefresh();
      if (onShowToast) onShowToast('Investigation updated.');
    } catch (err) {
      setEditError(err.message || 'Failed to update investigation.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleToggleArchive = async (item, e) => {
    if (e) e.stopPropagation();
    setIsMutating(true);
    setActionError('');
    try {
      const nextStatus = item.status === 'archived' ? 'ready' : 'archived';
      const res = await updateInvestigation(item.id, { status: nextStatus });
      if (!res?.investigation?.id) {
        throw new Error('Server did not return updated status.');
      }
      if (onListChanged) await onListChanged();
      if (inv?.id === item.id && onRefresh) await onRefresh();
      if (onShowToast) {
        onShowToast(nextStatus === 'archived' ? 'Investigation archived.' : 'Investigation restored.');
      }
    } catch (err) {
      setActionError(err.message || 'Failed to update status.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsMutating(true);
    setActionError('');
    try {
      const targetId = deletingItem.id;
      await deleteInvestigation(targetId);
      setDeletingItem(null);
      if (onDeletedInvestigation) {
        await onDeletedInvestigation(targetId);
      } else {
        if (inv?.id === targetId && onClearSelection) onClearSelection();
        if (onListChanged) await onListChanged();
      }
    } catch (err) {
      setActionError(err.message || 'Failed to delete investigation.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!inv?.id || isAnalyzing || inv.status === 'processing') return;
    setIsAnalyzing(true);
    setActionError('');
    try {
      await runInvestigationAnalysis(inv.id);
      if (onRefresh) await onRefresh();
      if (onListChanged) await onListChanged();
    } catch (err) {
      setActionError(err.message || 'Analysis failed.');
      if (onRefresh) await onRefresh();
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Shared Edit & Delete Confirmation Modals
  const renderManagementModals = () => (
    <>
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] shadow-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('edit_inv_title')}</h3>
              <button onClick={() => setEditingItem(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('name_label')}</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('modal_desc_label')}</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              {editError && <p className="text-xs text-rose-600 dark:text-rose-400">{editError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setEditingItem(null)} className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400">
                  {t('cancel_btn')}
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="px-4 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium disabled:opacity-50"
                >
                  {isMutating ? t('saving_btn') : t('save_changes_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] shadow-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('delete_inv_title')}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              This will permanently delete <strong className="text-slate-900 dark:text-white">{deletingItem.title}</strong> ({deletingItem.id}), its uploaded datasets, findings, and audit history. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setDeletingItem(null)} className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                {t('cancel_btn')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isMutating}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
              >
                {isMutating ? t('deleting_btn') : t('delete_permanently_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ------------------------------------------------------------------
  // DETAIL WORKSPACE VIEW (/investigations/{id})
  // ------------------------------------------------------------------
  if (selectedInvestigation && inv) {
    const topAnomaly = anomalies[0];
    const topHypothesis = hypotheses[0];
    const topRecommendation = recommendations[0];
    const isProven = hypotheses.some((h) => h.status === 'proven_root_cause');
    const isSimulated = chartData?.is_simulated || inv.id === 'INV-DEMO-MFG-01';
    const dailySeries = chartData?.timeseries?.daily_series || [];
    const entities = chartData?.timeseries?.entities || [];
    const uncertainty = chartData?.uncertainty;

    const avgQuality = datasets.length > 0
      ? (datasets.reduce((acc, d) => acc + (d.quality_score || 0), 0) / datasets.length).toFixed(1)
      : '0';

    const progressItems = [
      { key: 'data_quality', label: t('wf_1_title'), status: progress?.data_quality || (datasets.length > 0 ? 'completed' : 'pending') },
      { key: 'pattern_discovery', label: t('wf_2_title'), status: progress?.pattern_discovery || (anomalies.length > 0 ? 'completed' : 'pending') },
      { key: 'explanation_analysis', label: t('wf_3_title'), status: progress?.explanation_analysis || (hypotheses.length > 0 ? 'completed' : 'pending') },
      { key: 'evidence_evaluation', label: t('comp_title'), status: progress?.evidence_evaluation || (hypotheses.length > 0 ? 'completed' : 'pending') },
      { key: 'next_steps', label: t('wf_4_title'), status: progress?.next_steps || (recommendations.length > 0 ? 'completed' : 'pending') },
    ];

    const tabs = [
      { id: 'summary', label: t('tab_summary'), icon: BarChart3 },
      { id: 'discoveries', label: `${t('tab_discoveries')} (${anomalies.length})`, icon: AlertTriangle },
      { id: 'explanations', label: `${t('tab_explanations')} (${hypotheses.length})`, icon: Scale },
      { id: 'next_evidence', label: `${t('tab_next_evidence')} (${recommendations.length})`, icon: Compass },
      { id: 'history', label: `${t('tab_history')} (${history.length})`, icon: HistoryIcon },
    ];

    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {renderManagementModals()}

        {/* Top Bar: Back + Management Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClearSelection}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('back_to_investigations')}</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {onInspectInvestigation && (
              <button
                type="button"
                onClick={() => onInspectInvestigation(inv.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 transition cursor-pointer"
                title="Open in separate browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{t('inspect_btn')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openEditModal(inv)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{t('edit_btn')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleArchive(inv)}
              disabled={isMutating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-400 transition cursor-pointer"
            >
              {inv.status === 'archived' ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              <span>{inv.status === 'archived' ? t('restore_btn') : t('archive_btn')}</span>
            </button>
            <button
              type="button"
              onClick={() => setDeletingItem(inv)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-rose-600 dark:text-rose-400 hover:border-rose-400 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('delete_btn')}</span>
            </button>
          </div>
        </div>

        {(actionError || inv.analysis_error) && (
          <div className="px-4 py-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
            <span>{actionError || inv.analysis_error}</span>
            {datasets.length > 0 && (
              <button
                type="button"
                onClick={handleRunAnalysis}
                className="px-3 py-1 rounded bg-rose-600 text-white font-medium shrink-0"
              >
                {t('retry_btn')}
              </button>
            )}
          </div>
        )}

        {isSimulated && (
          <div className="px-4 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong className="font-semibold mr-1">[Simulated Demo Data]</strong>
              Synthetic manufacturing datasets with planted patterns. All statistical tests, p-values, effect sizes, and information gain scores are computed live.
            </span>
          </div>
        )}

        {/* Header Card */}
        <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-6 transition-colors">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={isProven ? 'Proven Root Cause' : mapInvestigationStatus(inv)} />
                <span className="font-mono text-[11px] text-slate-400">{inv.id}</span>
                {uncertainty && hypotheses.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Uncertainty: {uncertainty.uncertainty_pct}%
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {inv.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
                {inv.description || chartData?.narrative || 'No description provided.'}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400 pt-1">
                <span>Created: {inv.created_at ? new Date(inv.created_at).toLocaleString() : '—'}</span>
                <span>Updated: {inv.updated_at ? new Date(inv.updated_at).toLocaleString() : '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {datasets.length > 0 && inv.status !== 'completed' && (
                <button
                  type="button"
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing || inv.status === 'processing'}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition disabled:opacity-60 cursor-pointer"
                >
                  {isAnalyzing || inv.status === 'processing' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>{isAnalyzing || inv.status === 'processing' ? t('running_analysis') : t('run_analysis')}</span>
                </button>
              )}

              {topRecommendation && !isProven && isSimulated && (
                <button
                  onClick={onExecuteNextStep}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition cursor-pointer disabled:opacity-60"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{t('prove_root_cause')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
            {tabs.map((tabItem) => {
              const Icon = tabItem.icon;
              const active = subTab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setSubTab(tabItem.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tabItem.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-Tab Content */}
        {subTab === 'summary' && (
          <div className="space-y-6">
            {/* Investigation Progress Checklist (Real Backend State) */}
            <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('inv_progress')}
                </h2>
                <span className="font-mono text-[11px] text-slate-400">
                  {t('stage_label')}: {inv.analysis_stage || 'idle'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {progressItems.map((p) => (
                  <div
                    key={p.key}
                    className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      p.status === 'completed'
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                        : p.status === 'running'
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-50 dark:bg-[#0D1220] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {p.status === 'completed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : p.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                    <span className="font-medium truncate">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Inline Upload for Draft Investigations */}
            {datasets.length === 0 && (
              <UploadPanel
                activeInvestigationId={inv.id}
                onUploadComplete={async () => {
                  if (onRefresh) await onRefresh();
                  if (onListChanged) await onListChanged();
                  if (onShowToast) onShowToast('Dataset attached. Investigation is now Ready for analysis.');
                }}
              />
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div onClick={() => setSubTab('discoveries')} className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-4 hover:border-indigo-400 transition cursor-pointer">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('discovered_shift')}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {topAnomaly ? `${topAnomaly.percentage_change > 0 ? '+' : ''}${topAnomaly.percentage_change}%` : '—'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono truncate">
                  {topAnomaly ? `${topAnomaly.metric} · p=${topAnomaly.p_value}` : '—'}
                </div>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('connected_datasets')}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">{datasets.length}</div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  {t('avg_quality')}: {avgQuality}%
                </div>
              </div>

              <div onClick={() => setSubTab('explanations')} className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-4 hover:border-indigo-400 transition cursor-pointer">
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('leading_hypothesis')}</div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                  {topHypothesis ? `${Math.round(topHypothesis.strength_score * 100)}%` : '—'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {topHypothesis?.title || '—'}
                </div>
              </div>

              <div onClick={() => setSubTab('next_evidence')} className="rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 p-4 hover:border-indigo-500 transition cursor-pointer">
                <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{t('next_best_evidence_card')}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {topRecommendation ? `+${topRecommendation.expected_information_gain_bits} bits` : '—'}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  {topRecommendation ? `-${topRecommendation.expected_uncertainty_reduction_pct}% ${t('uncertainty_label')}` : '—'}
                </div>
              </div>
            </div>

            {dailySeries.length > 0 && (
              <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-6 space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Metric Trajectory ({chartData?.timeseries?.metric})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Daily mean across facility and individual sub-entities computed directly from fused records.
                  </p>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailySeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E2E8F0'} />
                      <XAxis dataKey="date" stroke={isDark ? '#94A3B8' : '#64748B'} tick={{ fontSize: 11 }} />
                      <YAxis stroke={isDark ? '#94A3B8' : '#64748B'} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                          borderColor: isDark ? '#334155' : '#E2E8F0',
                          color: isDark ? '#F1F5F9' : '#0F172A',
                          fontSize: '12px',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line
                        type="monotone"
                        dataKey="overall"
                        name="Facility Mean"
                        stroke={isDark ? '#E2E8F0' : '#0F172A'}
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        dot={false}
                      />
                      {entities.map((ent, idx) => (
                        <Line
                          key={ent}
                          type="monotone"
                          dataKey={ent}
                          name={ent}
                          stroke={ENTITY_COLORS[idx % ENTITY_COLORS.length]}
                          strokeWidth={ent === 'M-03' ? 2.5 : 1.75}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'discoveries' && (
          <Discoveries investigation={selectedInvestigation} onRefresh={onRefresh} isLoading={isLoading} />
        )}
        {subTab === 'explanations' && (
          <CompetingExplanations investigation={selectedInvestigation} onRefresh={onRefresh} isLoading={isLoading} />
        )}
        {subTab === 'next_evidence' && (
          <NextBestEvidence
            investigation={selectedInvestigation}
            onRefresh={onRefresh}
            onExecuteNextStep={onExecuteNextStep}
            isLoading={isLoading}
          />
        )}
        {subTab === 'history' && (
          <InvestigationHistory investigation={selectedInvestigation} />
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // INVESTIGATIONS LIST VIEW
  // ------------------------------------------------------------------
  const filtered = investigations
    .filter((item) => {
      const matchesQuery =
        !searchQuery.trim() ||
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id?.toLowerCase().includes(searchQuery.toLowerCase());
      const statusLabel = mapInvestigationStatus(item);
      const matchesStatus = statusFilter === 'All' || statusLabel === statusFilter;
      return matchesQuery && matchesStatus;
    })
    .sort((a, b) => {
      const valA = new Date(a[sortBy] || 0).getTime();
      const valB = new Date(b[sortBy] || 0).getTime();
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {renderManagementModals()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('investigations_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('investigations_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onLoadDemo}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{t('cta_see_how_it_works')}</span>
          </button>
          <button
            onClick={onOpenNewModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('create_btn')}</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="px-4 py-2.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
          {actionError}
        </div>
      )}

      {/* Search, Status Filter & Sort Bar */}
      <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="updated_at">{t('sort_updated')}</option>
              <option value="created_at">{t('sort_created')}</option>
            </select>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="desc">{t('sort_newest')}</option>
              <option value="asc">{t('sort_oldest')}</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800">
          {[
            { id: 'All', label: t('filter_all') },
            { id: 'Draft', label: t('status_draft') },
            { id: 'Ready', label: t('status_ready') },
            { id: 'Processing', label: t('status_processing') },
            { id: 'Completed', label: t('status_completed') },
            { id: 'Failed', label: t('status_failed') },
            { id: 'Archived', label: t('status_archived') }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                statusFilter === st.id
                  ? 'bg-[#4F46E5] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-12 text-center">
          <div className="w-10 h-10 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
            <FolderOpen className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('no_investigations')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('no_investigations_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const statusLabel = mapInvestigationStatus(item);
            const updated = item.updated_at
              ? new Date(item.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Recently';

            return (
              <div
                key={item.id}
                onClick={() => onSelectInvestigation(item.id)}
                className="group rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 p-5 transition-colors cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={statusLabel} />
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {onInspectInvestigation && (
                        <button
                          type="button"
                          onClick={() => onInspectInvestigation(item.id)}
                          title="Inspect in separate tab"
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => openEditModal(item, e)}
                        title="Rename / Edit"
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleToggleArchive(item, e)}
                        title={item.status === 'archived' ? 'Restore' : 'Archive'}
                        className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        {item.status === 'archived' ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingItem(item);
                        }}
                        title="Delete"
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {item.description || 'Autonomous data investigation session.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      {item.dataset_count || 0} {t('datasets_label')}
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-400">{item.id}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {updated}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
