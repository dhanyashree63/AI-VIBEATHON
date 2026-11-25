import React, { useState, useEffect } from 'react';
import {
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Compass,
  FileText
} from 'lucide-react';
import { getReport } from '../api';
import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';
import { useI18n } from '../context/I18nContext';

export default function Reports({ investigation, investigations = [], onSelectInvestigation, onStartInvestigation }) {
  const { t } = useI18n();
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState('summary');
  const inv = investigation?.investigation;

  useEffect(() => {
    if (inv?.id) {
      getReport(inv.id)
        .then(setReport)
        .catch(() => setReport(null));
    } else {
      setReport(null);
    }
  }, [inv?.id, investigation?.history?.length]);

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
    const filename = `REVERSE_AI_REPORT_${inv.id}.${isJson ? 'json' : 'md'}`;
    const blob = new Blob([content], { type: isJson ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('reports_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('reports_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 p-0.5">
            {['summary', 'markdown', 'json'].map((v) => (
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition ${
                  activeView === v
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('copied_btn') : t('copy_btn')}</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('export_btn')}</span>
          </button>
        </div>
      </div>

      {!report ? (
        <EmptyState
          icon={FileText}
          title={t('empty_reports_title')}
          description={t('empty_reports_desc')}
          primaryAction={
            onStartInvestigation
              ? { label: t('ob_cta_start'), onClick: onStartInvestigation }
              : undefined
          }
        />
      ) : activeView === 'summary' ? (
        <div className="space-y-5">
          <div className="p-5 rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Executive Summary</span>
              <span className="font-mono text-xs text-slate-400">{report.investigation_id}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{report.title}</h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{report.description}</p>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Discovered Findings ({report.anomalies_discovered?.length || 0})</span>
            </h3>
            <div className="space-y-2.5">
              {(report.anomalies_discovered || []).map((a) => (
                <div key={a.id} className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{a.title}</div>
                    <div className="text-slate-500 font-mono">
                      {a.metric}: {a.baseline_value} &rarr; {a.anomaly_value} (p={a.p_value})
                    </div>
                  </div>
                  <StatusBadge status={a.severity} />
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Competing Explanations &amp; Evidence ({report.competing_explanations?.length || 0})</span>
            </h3>
            <div className="space-y-3">
              {(report.competing_explanations || []).map((h) => (
                <div key={h.id} className="p-4 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{h.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{Math.round((h.strength_score || 0) * 100)}%</span>
                      <StatusBadge status={h.status} />
                    </div>
                  </div>
                  {h.supporting_evidence?.[0] && (
                    <div className="text-emerald-700 dark:text-emerald-400"><strong>Supporting:</strong> {h.supporting_evidence[0]}</div>
                  )}
                  {h.missing_evidence?.[0] && (
                    <div className="text-amber-700 dark:text-amber-400"><strong>Missing:</strong> {h.missing_evidence[0]}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Recommended Next Steps ({report.next_best_evidence_recommendations?.length || 0})</span>
            </h3>
            <div className="space-y-2.5">
              {(report.next_best_evidence_recommendations || []).map((r) => (
                <div key={r.id} className="p-4 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/50 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">+{r.expected_information_gain_bits} bits</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{r.what_to_collect}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625]">
          <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed select-text overflow-x-auto">
            {activeView === 'markdown' ? report.markdown_report : JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
