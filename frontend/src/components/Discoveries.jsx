import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  Search,
  Bookmark,
  BookmarkCheck,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Cpu,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
  Loader2,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { triggerAnomalyDiscovery, toggleFindingMark } from '../api';
import StatusBadge from './StatusBadge';
import { useI18n } from '../context/I18nContext';

function PriorityBadge({ priority }) {
  const p = (priority || 'medium').toLowerCase();
  const styles = {
    high: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    medium: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    low: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  };
  return (
    <span className={`text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded border ${styles[p] || styles.medium}`}>
      {p} priority
    </span>
  );
}

function FindingChart({ chartData }) {
  if (!chartData || !Array.isArray(chartData.series) || chartData.series.length === 0) {
    return null;
  }

  return (
    <div className="h-56 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1220] p-3">
      <ResponsiveContainer width="100%" height="100%">
        {chartData.type === 'line' ? (
          <LineChart data={chartData.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
            <XAxis dataKey={chartData.xKey} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
            <Line type="monotone" dataKey={chartData.yKey} stroke="#4F46E5" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        ) : chartData.type === 'scatter' ? (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
            <XAxis dataKey={chartData.xKey} name={chartData.xLabel || chartData.xKey} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis dataKey={chartData.yKey} name={chartData.yLabel || chartData.yKey} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
            <Scatter data={chartData.series} fill="#4F46E5" />
          </ScatterChart>
        ) : (
          <BarChart data={chartData.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
            <XAxis dataKey={chartData.xKey} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
            <Bar dataKey={chartData.yKey} fill="#4F46E5" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function Discoveries({ investigation, onRefresh, isLoading }) {
  const { t } = useI18n();
  const inv = investigation?.investigation;
  const rawFindings = investigation?.anomalies || [];

  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority_score');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFindingId, setSelectedFindingId] = useState(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  // Poll while background discovery is running
  useEffect(() => {
    if (inv?.status !== 'processing') {
      setIsScanning(false);
      return;
    }
    const timer = setInterval(() => {
      onRefresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [inv?.status, onRefresh]);

  const findings = useMemo(() => {
    return rawFindings.map((item) => {
      const payload = item.finding_payload && Object.keys(item.finding_payload).length > 0 ? item.finding_payload : {};
      return {
        ...item,
        priority: (item.priority || payload.priority || 'medium').toLowerCase(),
        priority_score: item.priority_score ?? payload.priority_score ?? 50,
        explanation: payload.explanation || item.statistical_summary?.explanation || '',
        affected_variables: payload.affected_variables || [item.metric],
        measured_values: payload.measured_values || item.statistical_summary || {},
        relevant_scope: payload.relevant_scope || item.detected_timestamp || 'Dataset-wide',
        statistical_method: payload.statistical_method || item.statistical_summary?.test_type || "Welch's t-test",
        supporting_evidence: payload.supporting_evidence || [],
        limitations: payload.limitations || [],
        why_it_matters: payload.why_it_matters || '',
        suggested_next_step: payload.suggested_next_step || '',
        evidence_strength: payload.evidence_strength || (item.p_value !== null && item.p_value < 0.05 ? 'statistically_supported' : 'exploratory'),
        q_value: payload.q_value ?? null,
        effect_size: payload.effect_size ?? null,
        confidence_interval: payload.confidence_interval || [],
        chart_data: payload.chart_data || null,
        dataset_understanding: payload.dataset_understanding || null,
        interpretation: payload.interpretation || null,
        performance: payload.performance || null,
        prioritisation_formula: payload.prioritisation_formula || null
      };
    });
  }, [rawFindings]);

  const counts = useMemo(() => {
    return {
      total: findings.length,
      high: findings.filter((f) => f.priority === 'high').length,
      medium: findings.filter((f) => f.priority === 'medium').length,
      low: findings.filter((f) => f.priority === 'low').length
    };
  }, [findings]);

  const filteredFindings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = findings.filter((f) => {
      if (priorityFilter !== 'all' && f.priority !== priorityFilter) return false;
      if (q) {
        const hay = `${f.title} ${f.explanation} ${(f.affected_variables || []).join(' ')} ${f.statistical_method}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'evidence') {
        if (a.evidence_strength === b.evidence_strength) return b.priority_score - a.priority_score;
        return a.evidence_strength === 'statistically_supported' ? -1 : 1;
      }
      return (b.priority_score || 0) - (a.priority_score || 0);
    });
    return list;
  }, [findings, priorityFilter, searchQuery, sortBy]);

  const selectedFinding = useMemo(
    () => findings.find((f) => f.id === selectedFindingId) || null,
    [findings, selectedFindingId]
  );

  const metaSource = findings[0] || {};

  const handleRunScan = async () => {
    if (!inv?.id) return;
    setScanError('');
    setIsScanning(true);
    try {
      await triggerAnomalyDiscovery(inv.id, null, true);
      onRefresh();
    } catch (err) {
      setIsScanning(false);
      setScanError(err.message || 'Unusual pattern scan failed.');
    }
  };

  const handleToggleMark = async (finding) => {
    if (!inv?.id) return;
    try {
      await toggleFindingMark(inv.id, finding.id, !finding.marked_for_investigation);
      onRefresh();
    } catch (err) {
      setScanError(err.message || 'Failed to update finding status.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            {t('disc_title')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('disc_subtitle')}
          </p>
        </div>

        <button
          onClick={handleRunScan}
          disabled={isLoading || isScanning || inv?.status === 'processing'}
          className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white transition cursor-pointer disabled:opacity-60"
        >
          {isScanning || inv?.status === 'processing' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Activity className="w-3.5 h-3.5" />
          )}
          <span>{isScanning || inv?.status === 'processing' ? t('disc_scanning') : t('disc_run_scan')}</span>
        </button>
      </div>

      {scanError && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{scanError}</span>
          </span>
          <button onClick={() => setScanError('')} className="p-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Discovery Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625]">
          <div className="text-[11px] text-slate-500">{t('disc_total_patterns')}</div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">{counts.total}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-[#111625]">
          <div className="text-[11px] text-rose-600 dark:text-rose-400">{t('disc_high_priority')}</div>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">{counts.high}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-[#111625]">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">{t('disc_medium_priority')}</div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">{counts.medium}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625]">
          <div className="text-[11px] text-slate-500">{t('disc_low_priority')}</div>
          <div className="text-xl font-bold font-mono text-slate-700 dark:text-slate-300 mt-0.5">{counts.low}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625]">
          <div className="text-[11px] text-slate-500">{t('disc_scan_status')}</div>
          <div className="text-xs font-semibold text-slate-900 dark:text-white mt-1.5 flex items-center gap-1.5">
            {inv?.status === 'processing' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>{t('disc_running')}</span>
              </>
            ) : findings.length > 0 ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>v{metaSource.analysis_version || 1} {t('disc_complete')}</span>
              </>
            ) : (
              <span className="text-slate-500">{t('disc_not_scanned')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Grounded Interpretation Summary */}
      {metaSource.interpretation?.overview_interpretation && (
        <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Compass className="w-4 h-4" />
              <span>{t('disc_summary')}</span>
            </span>
            {metaSource.performance && (
              <span className="text-[11px] font-mono text-slate-500">
                {metaSource.performance.runtime_ms} ms &bull; {metaSource.performance.peak_memory_mb} MB peak
              </span>
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {metaSource.interpretation.overview_interpretation}
          </p>
        </div>
      )}

      {/* Filter, Search, Sort Toolbar */}
      {findings.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all', 'high', 'medium', 'low'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setPriorityFilter(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition cursor-pointer ${
                  priorityFilter === lvl
                    ? 'bg-[#4F46E5] text-white'
                    : 'bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {lvl === 'all' ? `${t('disc_all')} (${counts.total})` : `${lvl} (${counts[lvl]})`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('disc_search_placeholder')}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 w-52"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="priority_score">{t('disc_sort_priority')}</option>
              <option value="evidence">{t('disc_sort_evidence')}</option>
              <option value="title">{t('disc_sort_title')}</option>
            </select>
          </div>
        </div>
      )}

      {/* Findings List or Empty State */}
      {filteredFindings.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] text-slate-500 dark:text-slate-400 text-xs">
          {findings.length === 0
            ? t('disc_empty')
            : t('disc_empty_filter')}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map((f) => (
            <div
              key={f.id}
              className={`p-4 sm:p-5 rounded-xl border transition bg-white dark:bg-[#111625] ${
                selectedFindingId === f.id
                  ? 'border-indigo-500 ring-1 ring-indigo-500/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={f.priority} />
                    <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded border ${
                      f.evidence_strength === 'statistically_supported'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}>
                      {f.evidence_strength === 'statistically_supported' ? t('disc_stat_supported') : t('disc_exploratory')}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Score: {f.priority_score}/100
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    {f.title}
                  </h3>

                  {f.explanation && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {f.explanation}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500 font-mono">
                    <span>Variables: {(f.affected_variables || []).join(', ')}</span>
                    <span>&bull;</span>
                    <span>Scope: {f.relevant_scope}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleMark(f)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                      f.marked_for_investigation
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                        : 'bg-white dark:bg-[#161C2E] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {f.marked_for_investigation ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    <span>{f.marked_for_investigation ? t('disc_marked') : t('disc_mark_btn')}</span>
                  </button>

                  <button
                    onClick={() => setSelectedFindingId(selectedFindingId === f.id ? null : f.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>{selectedFindingId === f.id ? t('disc_hide_details') : t('disc_view_evidence')}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Finding Detail Panel */}
      {selectedFinding && (
        <div className="p-5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-white dark:bg-[#111625] space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={selectedFinding.priority} />
                <span className="text-[11px] font-mono text-slate-400">{selectedFinding.id}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedFinding.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">{selectedFinding.explanation}</p>
            </div>
            <button
              onClick={() => setSelectedFindingId(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chart from actual dataset values */}
          <FindingChart chartData={selectedFinding.chart_data} />

          {/* Measured Values & Statistical Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">{t('disc_method_used')}</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{selectedFinding.statistical_method}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">{t('disc_scope')}</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{selectedFinding.relevant_scope}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">p-Value / FDR q-Value</div>
              <div className="font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                {selectedFinding.p_value !== null && selectedFinding.p_value !== undefined
                  ? `p=${selectedFinding.p_value}${selectedFinding.q_value !== null ? ` (q=${selectedFinding.q_value})` : ''}`
                  : 'Exploratory (no p-value)'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">Effect Size / CI</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {selectedFinding.effect_size !== null && selectedFinding.effect_size !== undefined
                  ? `d/r=${selectedFinding.effect_size}`
                  : 'N/A'}
                {selectedFinding.confidence_interval?.length === 2 &&
                  ` [${selectedFinding.confidence_interval[0]}, ${selectedFinding.confidence_interval[1]}]`}
              </div>
            </div>
          </div>

          {/* Measured Values Table */}
          {selectedFinding.measured_values && Object.keys(selectedFinding.measured_values).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(selectedFinding.measured_values).map(([k, v]) => (
                <span key={k} className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  {k}: <strong>{String(v)}</strong>
                </span>
              ))}
            </div>
          )}

          {/* Evidence, Why It Matters, Limitations, Next Step */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
              <div className="font-semibold text-slate-900 dark:text-white">{t('disc_supporting_ev')}</div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                {(selectedFinding.supporting_evidence || []).map((ev, idx) => (
                  <li key={idx}>{ev}</li>
                ))}
              </ul>
              {selectedFinding.why_it_matters && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="font-semibold text-slate-900 dark:text-white">{t('disc_why_matters')} </span>
                  <span className="text-slate-600 dark:text-slate-300">{selectedFinding.why_it_matters}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 p-3.5 rounded-lg bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60">
              <div className="font-semibold text-amber-800 dark:text-amber-300">{t('disc_limitations')}</div>
              <ul className="list-disc pl-4 space-y-1 text-amber-800/90 dark:text-amber-200/90">
                {(selectedFinding.limitations || []).map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
              {selectedFinding.suggested_next_step && (
                <div className="pt-2 border-t border-amber-200/70 dark:border-amber-900/60 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{t('disc_suggested_next')} </span>
                  <span>{selectedFinding.suggested_next_step}</span>
                </div>
              )}
            </div>
          </div>

          {selectedFinding.affected_entities && selectedFinding.affected_entities.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">{t('disc_segment_breakdown')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {selectedFinding.affected_entities.map((ent, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-xs font-mono">
                    <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white mb-1">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>{ent.entity}</span>
                      </span>
                      <span className="text-rose-600 dark:text-rose-400">{ent.drop_pct}%</span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400">
                      Mean: {ent.pre_mean} &rarr; <strong className="text-rose-600 dark:text-rose-400">{ent.post_mean}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable Technical Methodology */}
      {findings.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechDetails((prev) => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Technical Methodology, Prioritisation Formula &amp; Dataset Profile</span>
            </span>
            {showTechDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showTechDetails && (
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
              {metaSource.prioritisation_formula && (
                <div>
                  <strong>Prioritisation Formula:</strong>{' '}
                  <span className="font-mono text-[11px]">{metaSource.prioritisation_formula}</span>
                </div>
              )}
              {metaSource.dataset_understanding && (
                <div className="font-mono text-[11px]">
                  Domain: {metaSource.dataset_understanding.inferred_domain} ({metaSource.dataset_understanding.domain_confidence} confidence) &bull;{' '}
                  Numeric cols: {metaSource.dataset_understanding.numeric_columns?.length || 0} &bull;{' '}
                  Categorical cols: {metaSource.dataset_understanding.categorical_columns?.length || 0} &bull;{' '}
                  Time cols: {metaSource.dataset_understanding.datetime_columns?.length || 0} &bull;{' '}
                  Constant cols: {metaSource.dataset_understanding.constant_columns?.length || 0}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
