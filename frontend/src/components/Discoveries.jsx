import React from 'react';
import { TrendingDown, Activity, Cpu } from 'lucide-react';
import { triggerAnomalyDiscovery } from '../api';
import StatusBadge from './StatusBadge';

export default function Discoveries({ investigation, onRefresh, isLoading }) {
  const inv = investigation?.investigation;
  const anomalies = investigation?.anomalies || [];

  const handleRescan = async () => {
    if (!inv?.id) return;
    try {
      await triggerAnomalyDiscovery(inv.id);
      onRefresh();
    } catch (err) {
      alert('Anomaly discovery scan failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Autonomous Anomaly Discoveries
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Statistical change-point detection and multivariate outlier scanning computed directly from your data.
          </p>
        </div>

        <button
          onClick={handleRescan}
          disabled={isLoading}
          className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Re-scan Telemetry</span>
        </button>
      </div>

      {anomalies.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] text-slate-500 dark:text-slate-400 text-xs">
          No anomalies detected yet. Upload data and run a scan.
        </div>
      ) : (
        <div className="space-y-4">
          {anomalies.map((anom) => {
            const stat = anom.statistical_summary || {};
            return (
              <div key={anom.id} className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <StatusBadge status={anom.severity} />
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Metric: {anom.metric}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">{anom.title}</h3>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 flex items-center md:justify-end gap-1">
                      <TrendingDown className="w-5 h-5" />
                      <span>{anom.percentage_change}%</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      Baseline: {anom.baseline_value} &rarr; Observed: {anom.anomaly_value}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Statistical Test</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1 truncate" title={stat.test_type}>
                      {stat.test_type || "Welch's t-test"}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">p-Value</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-1">{anom.p_value}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">t-Statistic</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{stat.t_statistic || 'N/A'}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase">Sample Sizes</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      Pre: {stat.pre_sample_size || '—'} &bull; Post: {stat.post_sample_size || '—'}
                    </div>
                  </div>
                </div>

                {anom.affected_entities && anom.affected_entities.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">Sub-Entity Impact Breakdown</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {anom.affected_entities.map((ent, idx) => (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
