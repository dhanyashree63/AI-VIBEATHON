import React, { useState, useEffect } from 'react';
import {
  Compass,
  Zap,
  Sliders,
  DollarSign,
  Clock,
  Cpu,
  Percent,
  Upload,
  Info
} from 'lucide-react';
import { optimizeBudget, generateRecommendations, uploadSupplementalEvidence } from '../api';
import { useI18n } from '../context/I18nContext';

export default function NextBestEvidence({ investigation, onRefresh, onExecuteNextStep, isLoading }) {
  const { t } = useI18n();
  const inv = investigation?.investigation;
  const recommendations = investigation?.recommendations || [];

  const [budgetLimit, setBudgetLimit] = useState(inv?.budget_limit || 5000);
  const [timeLimit, setTimeLimit] = useState(inv?.time_limit_days || 7);
  const [maxObs, setMaxObs] = useState(300);
  const [maxParallel, setMaxParallel] = useState(2);
  const [optimizerResult, setOptimizerResult] = useState(null);
  const [suppFile, setSuppFile] = useState(null);
  const [suppName, setSuppName] = useState('');
  const [isUploadingSupp, setIsUploadingSupp] = useState(false);

  useEffect(() => {
    if (inv?.id && recommendations.length > 0) {
      runOptimization(budgetLimit, timeLimit, maxObs, maxParallel);
    }
  }, [inv?.id, recommendations.length]);

  const runOptimization = async (b, t, obs, par) => {
    if (!inv?.id) return;
    try {
      const res = await optimizeBudget(inv.id, b, t, obs, par);
      setOptimizerResult(res.optimization);
    } catch (err) {
      console.error('Optimization failed:', err);
    }
  };

  const handleConstraintChange = (b, t, obs, par) => {
    setBudgetLimit(b);
    setTimeLimit(t);
    setMaxObs(obs);
    setMaxParallel(par);
    runOptimization(b, t, obs, par);
  };

  const handleRegenerate = async () => {
    if (!inv?.id) return;
    try {
      await generateRecommendations(inv.id);
      onRefresh();
    } catch (err) {
      alert('Failed to generate recommendations: ' + err.message);
    }
  };

  const handleSupplementalUpload = async (e) => {
    e.preventDefault();
    if (!suppFile || !inv?.id) return;
    setIsUploadingSupp(true);
    try {
      await uploadSupplementalEvidence(inv.id, suppFile, suppName || suppFile.name);
      setSuppFile(null);
      setSuppName('');
      onRefresh();
    } catch (err) {
      alert('Failed to ingest supplemental evidence: ' + err.message);
    } finally {
      setIsUploadingSupp(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {t('nbe_title')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('nbe_subtitle')}
          </p>
        </div>

        <button
          onClick={handleRegenerate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>{t('nbe_recalc')}</span>
        </button>
      </div>

      {/* Budget & Resource Optimizer */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
            <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t('nbe_optimizer_title')}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Constrained Multi-Criteria</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">{t('nbe_budget')}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">${budgetLimit.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="500"
              max="15000"
              step="500"
              value={budgetLimit}
              onChange={(e) => handleConstraintChange(Number(e.target.value), timeLimit, maxObs, maxParallel)}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">{t('nbe_time_window')}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">{timeLimit} {t('nbe_days')}</span>
            </div>
            <input
              type="range"
              min="1"
              max="21"
              step="1"
              value={timeLimit}
              onChange={(e) => handleConstraintChange(budgetLimit, Number(e.target.value), maxObs, maxParallel)}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">{t('nbe_meas_limit')}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">N &le; {maxObs}</span>
            </div>
            <input
              type="range"
              min="20"
              max="500"
              step="20"
              value={maxObs}
              onChange={(e) => handleConstraintChange(budgetLimit, timeLimit, Number(e.target.value), maxParallel)}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">{t('nbe_parallel_cap')}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">{maxParallel} {t('nbe_teams')}</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={maxParallel}
              onChange={(e) => handleConstraintChange(budgetLimit, timeLimit, maxObs, Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>

        {optimizerResult && (
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase">{t('nbe_selected_plans')}</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">{optimizerResult.selected_investigations?.length || 0} {t('nbe_feasible')}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase">{t('nbe_est_cost')}</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">${optimizerResult.total_cost_usd?.toLocaleString()} ({optimizerResult.budget_utilized_pct}%)</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase">{t('nbe_obs_time')}</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">N={optimizerResult.total_observations_required} &bull; {optimizerResult.total_duration_days}d</div>
              </div>
              <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 uppercase">{t('nbe_exp_info_gain')}</div>
                <div className="font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">+{optimizerResult.total_expected_information_gain_bits} bits</div>
              </div>
            </div>

            {optimizerResult.assumptions_and_estimates?.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 dark:text-slate-200">Estimates &amp; Assumptions: </strong>
                  {optimizerResult.assumptions_and_estimates.join(' ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Supplemental Evidence Upload */}
      <div className="p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111625] space-y-3">
        <div className="text-xs font-semibold text-slate-900 dark:text-white">
          {t('nbe_upload_title')}
        </div>
        <form onSubmit={handleSupplementalUpload} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <input
            type="text"
            placeholder="Evidence Label (e.g. Coolant Flow Run)"
            value={suppName}
            onChange={(e) => setSuppName(e.target.value)}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="file"
            accept=".csv,.xlsx,.json,.txt"
            onChange={(e) => setSuppFile(e.target.files[0])}
            className="text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-800 dark:file:text-slate-200 cursor-pointer"
          />
          <button
            type="submit"
            disabled={!suppFile || isUploadingSupp}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition disabled:opacity-50 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploadingSupp ? t('nbe_reevaluating') : t('nbe_ingest_btn')}</span>
          </button>
        </form>
      </div>

      {/* Recommendations Cards */}
      {recommendations.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] text-slate-500 text-xs">
          {t('nbe_empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec, i) => {
            const isTop = i === 0;
            const dist = typeof rec.distinguishing_logic === 'string'
              ? JSON.parse(rec.distinguishing_logic || '{}')
              : (rec.distinguishing_logic || {});

            return (
              <div
                key={rec.id}
                className={`p-5 rounded-xl border bg-white dark:bg-[#111625] space-y-4 ${
                  isTop ? 'border-indigo-400 dark:border-indigo-600' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10.5px] font-semibold px-2.5 py-0.5 rounded-md uppercase ${
                        isTop
                          ? 'bg-[#4F46E5] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {isTop ? 'Rank 1 · Pareto Optimal' : `Alternative #${i + 1}`}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        Targets: {rec.target_hypotheses?.join(', ')}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">{rec.title}</h3>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                        +{rec.expected_information_gain_bits} bits
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        -{rec.expected_uncertainty_reduction_pct}% uncertainty
                      </div>
                    </div>

                    {isTop && inv?.id === 'INV-DEMO-MFG-01' && (
                      <button
                        onClick={onExecuteNextStep}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{t('nbe_run_sim_exp')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase">{t('nbe_what_collect')}</div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{rec.what_to_collect}</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase">{t('nbe_why_needed')}</div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{rec.why_needed}</p>
                  </div>
                </div>

                {Object.keys(dist).length > 0 && (
                  <div className="p-3.5 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/50 space-y-2 text-xs">
                    <div className="text-[10.5px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase">
                      {t('nbe_dist_outcomes')}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(dist).map(([key, val]) => (
                        <div key={key} className="space-y-0.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 capitalize text-[11px]">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 text-[11.5px] leading-relaxed">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-1">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Est. Cost</div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {rec.estimated_cost_usd !== null && rec.estimated_cost_usd !== undefined
                          ? `$${rec.estimated_cost_usd.toLocaleString()}`
                          : 'Cost not provided'}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Est. Duration</div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {rec.estimated_duration_days !== null && rec.estimated_duration_days !== undefined
                          ? `${rec.estimated_duration_days} Days`
                          : 'Not provided'}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Sample Size</div>
                      <div className="font-bold text-slate-900 dark:text-white">N = {rec.required_sample_size}</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                    <Percent className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Feasibility</div>
                      <div className="font-bold text-slate-900 dark:text-white">{Math.round((rec.feasibility_score || 0.8) * 100)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
