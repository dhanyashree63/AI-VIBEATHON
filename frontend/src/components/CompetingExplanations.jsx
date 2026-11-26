import React, { useState, useMemo } from 'react';
import {
  Scale,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  Sliders
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';
import { evaluateHypotheses, runWhatIfSimulation } from '../api';
import StatusBadge from './StatusBadge';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

function getSupportLevelLabel(h, t) {
  if (h.status === 'proven_root_cause') return t('comp_strongly_supported');
  const s = h.strength_score || 0;
  if ((h.supporting_evidence?.length || 0) === 0 && (h.contradicting_evidence?.length || 0) === 0) {
    return t('comp_insufficient_ev');
  }
  if (h.status === 'refuted' || s < 0.35) return t('comp_weakly_supported');
  if (s >= 0.72) return t('comp_strongly_supported');
  if (s >= 0.45) return t('comp_moderately_supported');
  return t('comp_weakly_supported');
}

export default function CompetingExplanations({ investigation, onRefresh, isLoading }) {
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === 'dark';

  const [expandedId, setExpandedId] = useState(null);
  const inv = investigation?.investigation;
  const hypotheses = investigation?.hypotheses || [];
  const datasets = investigation?.datasets || [];

  // Extract numeric columns from first dataset for What-If simulation
  const numericColumns = useMemo(() => {
    const first = datasets[0];
    const meta = first?.schema_info || {};
    return Object.entries(meta)
      .filter(([, info]) => info?.type === 'integer' || info?.type === 'float')
      .map(([col]) => col);
  }, [datasets]);

  const [whatIfTarget, setWhatIfTarget] = useState('');
  const [whatIfPred, setWhatIfPred] = useState('');
  const [whatIfDelta, setWhatIfDelta] = useState(15);
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [whatIfError, setWhatIfError] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  const effectiveTarget = whatIfTarget || numericColumns[0] || '';
  const effectivePred = whatIfPred || numericColumns.find((c) => c !== effectiveTarget) || '';

  const handleRunWhatIf = async (e) => {
    e.preventDefault();
    if (!inv?.id || !effectiveTarget || !effectivePred) return;
    setWhatIfError('');
    setIsSimulating(true);
    try {
      const res = await runWhatIfSimulation(inv.id, effectiveTarget, effectivePred, whatIfDelta);
      setWhatIfResult(res.simulation);
    } catch (err) {
      setWhatIfError(err.message || 'What-If simulation failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleEvaluate = async () => {
    if (!inv?.id) return;
    try {
      await evaluateHypotheses(inv.id);
      onRefresh();
    } catch (err) {
      alert('Hypothesis evaluation failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {t('comp_title')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('comp_subtitle')}
          </p>
        </div>

        <button
          onClick={handleEvaluate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white transition cursor-pointer"
        >
          <Scale className="w-3.5 h-3.5" />
          <span>{t('comp_reevaluate')}</span>
        </button>
      </div>

      {hypotheses.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] text-slate-500 dark:text-slate-400 text-xs">
          {t('comp_empty')}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              {t('comp_chart_title')}
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={hypotheses.map((h) => ({
                    name: h.title.length > 28 ? `${h.title.slice(0, 28)}...` : h.title,
                    strength: Math.round((h.strength_score || 0) * 100),
                    status: h.status
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E2E8F0'} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke={isDark ? '#94A3B8' : '#64748B'} tick={{ fontSize: 10 }} unit="%" />
                  <YAxis type="category" dataKey="name" width={200} stroke={isDark ? '#CBD5E1' : '#334155'} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      fontSize: '12px',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="strength" name="Evidence Strength" radius={[0, 4, 4, 0]}>
                    {hypotheses.map((h) => (
                      <Cell
                        key={h.id}
                        fill={
                          h.status === 'proven_root_cause'
                            ? '#059669'
                            : h.status === 'refuted'
                            ? '#E11D48'
                            : '#4F46E5'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {hypotheses.map((h) => {
            const isExpanded = expandedId === h.id || h.status === 'proven_root_cause';
            const isRoot = h.status === 'proven_root_cause';
            const isRefuted = h.status === 'refuted';
            const ci = h.confidence_interval || [];

            return (
              <div
                key={h.id}
                className={`rounded-xl border bg-white dark:bg-[#111625] transition-colors overflow-hidden ${
                  isRoot
                    ? 'border-emerald-500/70'
                    : isRefuted
                    ? 'border-slate-200 dark:border-slate-800 opacity-80'
                    : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500'
                }`}
              >
                <div
                  onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                >
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <StatusBadge status={h.status} />
                      <span className="text-[10.5px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        {getSupportLevelLabel(h, t)}
                      </span>
                      {!isRoot && (
                        <span className="text-[10.5px] text-slate-400">
                          {t('comp_unverified')}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase">Category: {h.category}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">{h.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{h.description}</p>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      <div className={`text-xl font-bold font-mono ${
                        isRoot ? 'text-emerald-600 dark:text-emerald-400' : isRefuted ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'
                      }`}>
                        {Math.round(h.strength_score * 100)}%
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{t('comp_strength')}</div>
                    </div>
                    <div className="text-slate-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1220] space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="p-3 rounded-lg bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">Cohen&apos;s d</div>
                        <div className="font-bold text-slate-900 dark:text-white mt-1">
                          {h.effect_size !== null && h.effect_size !== undefined ? h.effect_size.toFixed(2) : 'N/A'}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">95% CI</div>
                        <div className="font-bold text-slate-900 dark:text-white mt-1">
                          {ci.length === 2 ? `[${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]` : 'N/A'}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">p-Value</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          {h.p_value !== null && h.p_value !== undefined ? h.p_value : 'N/A'}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase">Causal Control</div>
                        <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                          {isRefuted ? 'Refuted / Confounded' : 'Active Candidate'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-2 p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 text-[11px] uppercase">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('comp_supporting')} ({h.supporting_evidence?.length || 0})</span>
                        </div>
                        {h.supporting_evidence?.length > 0 ? (
                          <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                            {h.supporting_evidence.map((s, idx) => (
                              <li key={idx} className="leading-relaxed">&bull; {s}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-500 italic">No direct statistical support observed.</p>
                        )}
                      </div>

                      <div className="space-y-2 p-4 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50">
                        <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400 text-[11px] uppercase">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t('comp_contradicting')} ({h.contradicting_evidence?.length || 0})</span>
                        </div>
                        {h.contradicting_evidence?.length > 0 ? (
                          <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                            {h.contradicting_evidence.map((c, idx) => (
                              <li key={idx} className="leading-relaxed">&bull; {c}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-500 italic">No contradictory points identified.</p>
                        )}
                      </div>

                      <div className="space-y-2 p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400 text-[11px] uppercase">
                          <FileQuestion className="w-3.5 h-3.5" />
                          <span>{t('comp_missing_ev')} ({h.missing_evidence?.length || 0})</span>
                        </div>
                        {h.missing_evidence?.length > 0 ? (
                          <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                            {h.missing_evidence.map((m, idx) => (
                              <li key={idx} className="leading-relaxed">&bull; {m}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-500 italic">All required measurements satisfied.</p>
                        )}
                      </div>
                    </div>

                    {h.limitations?.length > 0 && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-[#111625] p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-900 dark:text-slate-200">Methodological Limitations: </strong>
                          {h.limitations.join(' ')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* What-If Scenario Explorer (Simulated Linear Projection) */}
      {numericColumns.length >= 2 && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('comp_whatif_title')}</h3>
            </div>
            <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              {t('comp_whatif_badge')}
            </span>
          </div>

          <form onSubmit={handleRunWhatIf} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t('comp_if_var_changes')}</label>
              <select
                value={effectivePred}
                onChange={(e) => setWhatIfPred(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
              >
                {numericColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Change (%): {whatIfDelta > 0 ? `+${whatIfDelta}%` : `${whatIfDelta}%`}</label>
              <input
                type="range"
                min="-50"
                max="50"
                step="5"
                value={whatIfDelta}
                onChange={(e) => setWhatIfDelta(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t('comp_projected_impact')}</label>
              <select
                value={effectiveTarget}
                onChange={(e) => setWhatIfTarget(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200"
              >
                {numericColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={isSimulating || !effectivePred || !effectiveTarget || effectivePred === effectiveTarget}
              className="px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition disabled:opacity-50 cursor-pointer"
            >
              {isSimulating ? t('comp_simulating') : t('comp_run_sim')}
            </button>
          </form>

          {whatIfError && (
            <div className="text-xs text-rose-600 dark:text-rose-400">{whatIfError}</div>
          )}

          {whatIfResult && (
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-4 font-mono">
                <span>
                  {whatIfResult.predictor_variable}: {whatIfResult.baseline_predictor_mean} &rarr; <strong>{whatIfResult.simulated_predictor_value}</strong> ({whatIfResult.predictor_delta_pct > 0 ? `+${whatIfResult.predictor_delta_pct}%` : `${whatIfResult.predictor_delta_pct}%`})
                </span>
                <span>
                  Projected {whatIfResult.target_variable}: {whatIfResult.baseline_target_mean} &rarr; <strong className="text-indigo-600 dark:text-indigo-400">{whatIfResult.projected_target_mean}</strong> ({whatIfResult.projected_target_delta_pct > 0 ? `+${whatIfResult.projected_target_delta_pct}%` : `${whatIfResult.projected_target_delta_pct}%`})
                </span>
                <span className="text-slate-500">R²={whatIfResult.model_metrics.r_squared} (n={whatIfResult.model_metrics.sample_size})</span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">{whatIfResult.disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
