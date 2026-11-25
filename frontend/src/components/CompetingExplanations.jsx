import React, { useState } from 'react';
import {
  Scale,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileQuestion
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
import { evaluateHypotheses } from '../api';
import StatusBadge from './StatusBadge';
import { useTheme } from '../context/ThemeContext';

export default function CompetingExplanations({ investigation, onRefresh, isLoading }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [expandedId, setExpandedId] = useState(null);
  const inv = investigation?.investigation;
  const hypotheses = investigation?.hypotheses || [];

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
            Competing Explanations Engine
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Statistical hypothesis testing, Cohen&apos;s d effect sizes, 95% confidence intervals, and confounder controls.
          </p>
        </div>

        <button
          onClick={handleEvaluate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white transition cursor-pointer"
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Re-Evaluate All</span>
        </button>
      </div>

      {hypotheses.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] text-slate-500 dark:text-slate-400 text-xs">
          No hypotheses generated yet. Upload data and discover anomalies first.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Evidence Strength Comparison (%)
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
                      <div className="text-[10px] text-slate-500 font-mono">strength</div>
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
                          <span>Supporting ({h.supporting_evidence?.length || 0})</span>
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
                          <span>Contradicting ({h.contradicting_evidence?.length || 0})</span>
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
                          <span>Missing Evidence ({h.missing_evidence?.length || 0})</span>
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
    </div>
  );
}
