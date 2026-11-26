import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Compass,
  FileText,
  Printer,
  FileSpreadsheet,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { getReport } from '../api';
import StatusBadge from './StatusBadge';
import { useI18n } from '../context/I18nContext';

export default function InspectReportModal({ investigationId, investigationTitle, onClose }) {
  const { t } = useI18n();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState('simple');

  useEffect(() => {
    if (!investigationId) return;
    setLoading(true);
    setError(null);
    getReport(investigationId)
      .then((r) => { setReport(r); setLoading(false); })
      .catch((e) => { setError(e.message || 'Failed to load report.'); setLoading(false); });
  }, [investigationId]);

  // Close on Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleCopy = () => {
    if (!report) return;
    const content = activeView === 'json' ? JSON.stringify(report, null, 2) : report.markdown_report;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report) return;
    const isJson = activeView === 'json';
    const content = isJson ? JSON.stringify(report, null, 2) : report.markdown_report;
    const filename = `REVERSE_AI_REPORT_${investigationId}.${isJson ? 'json' : 'md'}`;
    const blob = new Blob([content], { type: isJson ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    window.open(`/api/investigations/${encodeURIComponent(investigationId)}/report?format=csv`, '_blank');
  };

  const handlePrint = () => window.print();

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Report: ${investigationTitle}`}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{t('inv_report_title')}</div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{investigationTitle || investigationId}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* View toggle */}
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 p-0.5">
              {['simple', 'technical', 'markdown', 'json'].map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition ${
                    activeView === v
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <button
              onClick={handleCopy}
              disabled={!report}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition disabled:opacity-40"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? t('copied_btn') : t('copy_btn')}</span>
            </button>

            <button
              onClick={handleDownloadCsv}
              disabled={!report}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition disabled:opacity-40"
              title="Download CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={!report}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition disabled:opacity-40"
              title="Print / Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={!report}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white transition disabled:opacity-40"
              title="Download report file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{activeView === 'json' ? 'JSON' : 'MD'}</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin" />
              <span className="text-sm">Loading report…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-rose-500">
              <AlertTriangle className="w-7 h-7" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {!loading && !error && !report && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <FileText className="w-8 h-8" />
              <p className="text-sm">No report available yet. Run analysis first.</p>
            </div>
          )}

          {report && (activeView === 'simple' || activeView === 'technical') && (
            <div className="space-y-4">
              {/* Executive summary */}
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {activeView === 'simple' ? t('exec_summary') : t('tech_dossier')}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">{report.investigation_id}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{report.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {report.executive_summary || report.description}
                </p>
                {report.data_quality_summary && (
                  <div className="pt-2 flex flex-wrap gap-3 text-[11px] font-mono text-slate-500">
                    <span>Datasets: {report.data_quality_summary.datasets_count}</span>
                    <span>&bull;</span>
                    <span>Total Rows: {report.data_quality_summary.total_rows?.toLocaleString()}</span>
                    <span>&bull;</span>
                    <span>Avg Quality: {report.data_quality_summary.average_quality_score}%</span>
                  </div>
                )}
              </div>

              {/* Anomalies */}
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>{t('unusual_patterns_discovered')} ({report.anomalies_discovered?.length || 0})</span>
                </h3>
                <div className="space-y-2">
                  {(report.anomalies_discovered || []).map((a) => (
                    <div
                      key={a.id}
                      className="p-3.5 rounded-lg bg-white dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{a.title}</div>
                        <div className="text-slate-500 font-mono">
                          {a.metric}: {a.baseline_value} &rarr; {a.anomaly_value}
                          {activeView === 'technical' && ` (p=${a.p_value ?? 'exploratory'}, priority=${a.priority_score})`}
                        </div>
                      </div>
                      <StatusBadge status={a.severity} />
                    </div>
                  ))}
                  {(!report.anomalies_discovered || report.anomalies_discovered.length === 0) && (
                    <p className="text-xs text-slate-400 italic">No anomalies recorded yet.</p>
                  )}
                </div>
              </div>

              {/* Competing explanations */}
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('possible_explanations_evidence')} ({report.competing_explanations?.length || 0})</span>
                </h3>
                <div className="space-y-2.5">
                  {(report.competing_explanations || []).map((h) => (
                    <div
                      key={h.id}
                      className="p-4 rounded-lg bg-white dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{h.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {Math.round((h.strength_score || 0) * 100)}%
                          </span>
                          <StatusBadge status={h.status} />
                        </div>
                      </div>
                      {activeView === 'technical' && (
                        <div className="font-mono text-[11px] text-slate-500">
                          Effect size d={h.effect_size ?? 'N/A'} | p={h.p_value ?? 'N/A'} | 95% CI:{' '}
                          {h.confidence_interval?.length === 2
                            ? `[${h.confidence_interval[0]}, ${h.confidence_interval[1]}]`
                            : 'N/A'}
                        </div>
                      )}
                      {h.supporting_evidence?.[0] && (
                        <div className="text-emerald-700 dark:text-emerald-400">
                          <strong>{t('supporting_label')}:</strong> {h.supporting_evidence[0]}
                        </div>
                      )}
                      {h.contradicting_evidence?.[0] && (
                        <div className="text-rose-700 dark:text-rose-400">
                          <strong>{t('contradicting_label')}:</strong> {h.contradicting_evidence[0]}
                        </div>
                      )}
                      {h.missing_evidence?.[0] && (
                        <div className="text-amber-700 dark:text-amber-400">
                          <strong>{t('missing_label')}:</strong> {h.missing_evidence[0]}
                        </div>
                      )}
                    </div>
                  ))}
                  {(!report.competing_explanations || report.competing_explanations.length === 0) && (
                    <p className="text-xs text-slate-400 italic">No hypotheses evaluated yet.</p>
                  )}
                </div>
              </div>

              {/* Next steps */}
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('recommended_next_steps')} ({report.next_best_evidence_recommendations?.length || 0})</span>
                </h3>
                <div className="space-y-2.5">
                  {(report.next_best_evidence_recommendations || []).map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/50 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          +{r.expected_information_gain_bits} bits
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{r.what_to_collect}</p>
                    </div>
                  ))}
                  {(!report.next_best_evidence_recommendations || report.next_best_evidence_recommendations.length === 0) && (
                    <p className="text-xs text-slate-400 italic">No recommendations generated yet.</p>
                  )}
                </div>
              </div>

              {/* Limitations */}
              {report.limitations?.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-xs space-y-1.5">
                  <div className="font-semibold text-amber-800 dark:text-amber-300">{t('uncertainty_limitations')}</div>
                  <ul className="list-disc pl-4 space-y-1 text-amber-800/90 dark:text-amber-200/90">
                    {report.limitations.map((lim, i) => <li key={i}>{lim}</li>)}
                  </ul>
                </div>
              )}

              {/* Statistical methods (technical only) */}
              {activeView === 'technical' && report.statistical_methods?.length > 0 && (
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">{t('stat_methods_sources')}</div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                    {report.statistical_methods.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {report && (activeView === 'markdown' || activeView === 'json') && (
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111625]">
              <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed select-text overflow-x-auto">
                {activeView === 'markdown' ? report.markdown_report : JSON.stringify(report, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-[#0B0F1A]">
          <span className="text-[11px] text-slate-400 font-mono">{investigationId}</span>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 transition"
          >
            <X className="w-3.5 h-3.5" />
            {t('close_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
