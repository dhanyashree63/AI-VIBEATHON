import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Eye,
  X,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { previewDataset, fuseDatasets, deleteDataset } from '../api';
import UploadPanel from './UploadPanel';
import EmptyState from './EmptyState';
import { useI18n } from '../context/I18nContext';

export default function DataSources({
  investigation,
  investigations = [],
  onSelectInvestigation,
  onRefresh,
  isLoading
}) {
  const { t } = useI18n();
  const [previewData, setPreviewData] = useState(null);
  const [fuseAudit, setFuseAudit] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const inv = investigation?.investigation;
  const datasets = investigation?.datasets || [];

  useEffect(() => {
    if (!previewData) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPreviewData(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [previewData]);

  const handlePreview = async (dsId) => {
    setActionError('');
    try {
      const res = await previewDataset(inv.id, dsId);
      setPreviewData(res);
    } catch (err) {
      setActionError('Failed to load dataset preview: ' + err.message);
    }
  };

  const handleDeleteDataset = async (dsId, dsName) => {
    if (!window.confirm(`Remove dataset "${dsName}" from this investigation?`)) return;
    setActionError('');
    setDeletingId(dsId);
    try {
      await deleteDataset(inv.id, dsId);
      if (previewData?.dataset_id === dsId) {
        setPreviewData(null);
      }
      onRefresh();
    } catch (err) {
      setActionError('Failed to remove dataset: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFuse = async () => {
    setActionError('');
    try {
      const res = await fuseDatasets(inv.id);
      setFuseAudit(res);
      onRefresh();
    } catch (err) {
      setActionError('Fusion failed: ' + err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('data_sources_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('data_sources_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {investigations.length > 0 && (
            <select
              value={inv?.id || ''}
              onChange={(e) => onSelectInvestigation(e.target.value)}
              className="bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 max-w-xs"
            >
              {investigations.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          )}

          {datasets.length > 1 && (
            <button
              onClick={handleFuse}
              disabled={isLoading}
              className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('ds_fuse_btn')}</span>
            </button>
          )}
        </div>
      </div>

      <UploadPanel
        activeInvestigationId={inv?.id}
        investigations={investigations}
        onUploadComplete={(id) => {
          if (id && id !== inv?.id) onSelectInvestigation(id);
          else onRefresh();
        }}
      />

      {actionError && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </span>
          <button onClick={() => setActionError('')} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Datasets Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('ds_connected_stores')} ({datasets.length})
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">{t('ds_auto_scan')}</span>
        </div>

        {datasets.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileSpreadsheet}
              title={t('empty_datasets_title')}
              description={t('empty_datasets_desc')}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {datasets.map((d) => {
              const profile = d.profiling_info || {};
              const warnings = profile.quality_warnings || [];
              const piiDetected = Boolean(profile.pii_report?.pii_detected);
              const dupRows = profile.duplicate_rows || 0;

              return (
              <div key={d.id} className="px-5 py-4 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{d.name}</span>
                      {d.format && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                          {d.format}
                        </span>
                      )}
                      {d.is_supplemental && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {t('ds_supplemental')}
                        </span>
                      )}
                      {piiDetected && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <ShieldAlert className="w-3 h-3" />
                          {t('ds_pii_detected')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono pl-9 flex items-center gap-2.5 flex-wrap">
                      <span>{d.row_count?.toLocaleString()} {t('ds_rows')}</span>
                      <span>&bull;</span>
                      <span>{d.column_count} {t('ds_columns')}</span>
                      {dupRows > 0 && (
                        <>
                          <span>&bull;</span>
                          <span className="text-amber-600 dark:text-amber-400">{dupRows} duplicates</span>
                        </>
                      )}
                      <span>&bull;</span>
                      <span>{d.filename}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className={`text-sm font-mono font-bold ${
                          d.quality_score >= 80
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : d.quality_score >= 60
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {d.quality_score}%
                        </span>
                        {d.quality_score >= 80 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">Quality Score</div>
                    </div>

                    <button
                      onClick={() => handlePreview(d.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>{t('inspect_btn')}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteDataset(d.id, d.name)}
                      disabled={deletingId === d.id}
                      title="Remove dataset"
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="pl-9 flex flex-wrap gap-1.5">
                    {warnings.slice(0, 3).map((w, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60"
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{w}</span>
                      </span>
                    ))}
                    {warnings.length > 3 && (
                      <span className="text-[11px] text-slate-500 self-center">
                        +{warnings.length - 3} more (click Inspect)
                      </span>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fusion Audit */}
      {fuseAudit && (
        <div className="p-5 rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 text-xs font-semibold uppercase">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Multi-Source Fusion Audit Complete</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Unified <strong>{fuseAudit.fused_rows}</strong> records across <strong>{fuseAudit.fused_columns}</strong> columns.
          </p>
          {fuseAudit.audit_trail?.map((a, i) => (
            <div key={i} className="text-xs font-mono bg-white dark:bg-[#111625] p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>{a.step} on [{a.left_keys?.join(', ')}]</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{a.match_rate_pct}% match</span>
            </div>
          ))}
          {fuseAudit.limitations?.map((l, i) => (
            <div key={i} className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800/70 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}

      {/* Dataset Inspection Pop-up Modal */}
      {previewData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewData(null); }}
          role="dialog"
          aria-modal="true"
          aria-label={`Dataset Inspection: ${previewData.name}`}
        >
          <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Dataset Inspection: {previewData.name}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {previewData.total_rows?.toLocaleString()} rows &bull; {previewData.total_columns} columns
                  {previewData.profiling?.quality_score !== undefined && (
                    <> &bull; Quality: {previewData.profiling.quality_score}%</>
                  )}
                </p>
              </div>
              <button
                onClick={() => setPreviewData(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Data Quality Summary Grid */}
          {previewData.profiling && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase">Data Quality &amp; Validation Report</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Quality Score</div>
                  <div className={`text-base font-mono font-bold mt-0.5 ${
                    previewData.profiling.quality_score >= 80
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : previewData.profiling.quality_score >= 60
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {previewData.profiling.quality_score}%
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Duplicate Rows</div>
                  <div className="text-base font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    {previewData.profiling.duplicate_rows ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Detected Timestamps</div>
                  <div className="text-xs font-mono text-slate-800 dark:text-slate-200 mt-1 truncate">
                    {previewData.profiling.timestamps?.length
                      ? previewData.profiling.timestamps.join(', ')
                      : 'None'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">PII Scan</div>
                  <div className={`text-xs font-semibold mt-1 ${
                    previewData.profiling.pii_report?.pii_detected
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {previewData.profiling.pii_report?.pii_detected
                      ? `Flagged (${Object.keys(previewData.profiling.pii_report.pii_columns || {}).join(', ')})`
                      : 'No PII detected'}
                  </div>
                </div>
              </div>

              {previewData.profiling.quality_warnings?.length > 0 && (
                <div className="space-y-1.5">
                  {previewData.profiling.quality_warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/60">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {previewData.profiling.high_correlations?.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    High Pairwise Correlations (|r| &ge; 0.7)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previewData.profiling.high_correlations.slice(0, 6).map((c, idx) => (
                      <span key={idx} className="text-[11px] font-mono px-2 py-0.5 rounded bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        {c.col_a} &harr; {c.col_b}: r={c.r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase">Automatic Data Dictionary</h4>
            <div className="overflow-x-auto max-h-60 rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-[11.5px] font-mono">
                <thead className="bg-slate-50 dark:bg-[#0D1220] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">Column</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Completeness</th>
                    <th className="p-2.5">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                  {previewData.profiling?.data_dictionary?.map((col) => (
                    <tr key={col.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-semibold">{col.name}</td>
                      <td className="p-2.5 text-indigo-600 dark:text-indigo-400">{col.detected_type}</td>
                      <td className="p-2.5 text-slate-500 dark:text-slate-400">{col.semantic_role}</td>
                      <td className="p-2.5">
                        {col.missing_pct > 0
                          ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{col.missing_pct}% null</span>
                          : <span className="text-emerald-600 dark:text-emerald-400 font-semibold">100% valid</span>}
                      </td>
                      <td className="p-2.5 text-slate-500 dark:text-slate-400">
                        {col.mean !== undefined ? `mean=${col.mean}, std=${col.std}` : col.sample_values?.slice(0, 2).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase">Sample Rows</h4>
            <div className="overflow-x-auto max-h-56 rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-[11.5px] font-mono">
                <thead className="bg-slate-50 dark:bg-[#0D1220] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    {previewData.columns?.slice(0, 8).map((col) => (
                      <th key={col} className="p-2.5 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                  {previewData.preview_rows?.slice(0, 6).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {previewData.columns?.slice(0, 8).map((col) => (
                        <td key={col} className="p-2.5 whitespace-nowrap">{String(row[col])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            </div>

            {/* Modal Footer */}
            <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1220] flex items-center justify-end">
              <button
                onClick={() => setPreviewData(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('close_btn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
