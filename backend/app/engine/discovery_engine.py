import math
import time
import tracemalloc
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import IsolationForest


PRIORITISATION_FORMULA_DOC = (
    "priority_score = 35 * S_sig + 25 * S_mag + 20 * S_reach + 10 * S_rel + 10 * S_rec "
    "(0-100 scale). S_sig = 1 - min(1, q_value / 0.05) for FDR-tested findings (0.4 for exploratory); "
    "S_mag = normalized effect size or % deviation; S_reach = min(1, 2 * affected_rows / total_rows); "
    "S_rel = completeness of affected variables; S_rec = corroboration factor."
)


def _safe_float(val: Any, digits: int = 4) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, digits)
    except (TypeError, ValueError):
        return None


def _is_id_column(col_name: str, series: pd.Series) -> bool:
    lower = col_name.lower()
    if any(k in lower for k in ("_id", "uuid", "index")) or lower == "id":
        return True
    n = len(series.dropna())
    if n > 20 and not pd.api.types.is_float_dtype(series) and series.nunique() == n:
        return True
    return False


def _infer_dataset_domain(columns: list[str]) -> tuple[str, str]:
    joined = " ".join(c.lower() for c in columns)
    domain_signals = [
        ("manufacturing", ["machine", "spindle", "coolant", "output_units", "defect", "scrap", "downtime", "maintenance"]),
        ("financial_transactions", ["amount", "transaction", "debit", "credit", "invoice", "balance", "payment", "currency"]),
        ("sensor_readings", ["sensor", "temperature", "pressure", "vibration", "voltage", "humidity", "rpm", "telemetry"]),
        ("sales_records", ["revenue", "order", "sales", "discount", "sku", "product", "quantity", "margin"]),
        ("operational_logs", ["latency", "error", "status_code", "endpoint", "request", "duration_ms", "host"]),
        ("customer_activity", ["customer", "user_id", "session", "churn", "signup", "retention", "click"]),
    ]
    best_domain = "general_tabular"
    best_hits = 0
    for domain, keywords in domain_signals:
        hits = sum(1 for kw in keywords if kw in joined)
        if hits > best_hits:
            best_hits = hits
            best_domain = domain
    confidence = "high" if best_hits >= 3 else "moderate" if best_hits >= 2 else "low"
    if best_hits == 0:
        best_domain = "general_tabular"
    return best_domain, confidence


def understand_dataset(df: pd.DataFrame, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    """Examines dataset structure, column types, missingness, and domain context."""
    total_rows, total_cols = df.shape
    numeric_cols: list[str] = []
    constant_cols: list[str] = []
    categorical_cols: list[str] = []
    datetime_cols: list[str] = []
    identifier_cols: list[str] = []
    missing_pct_by_col: dict[str, float] = {}

    for col in df.columns:
        series = df[col]
        missing_pct = round(float(series.isna().mean() * 100), 2) if total_rows > 0 else 0.0
        missing_pct_by_col[col] = missing_pct
        non_null = series.dropna()

        if len(non_null) == 0:
            constant_cols.append(col)
            continue

        # Check datetime
        is_dt = pd.api.types.is_datetime64_any_dtype(series)
        if not is_dt and series.dtype == "object":
            sample = non_null.astype(str).head(15)
            col_lower = col.lower()
            if any(k in col_lower for k in ("time", "date", "timestamp", "created", "day", "hour")):
                parsed = pd.to_datetime(sample, errors="coerce")
                if parsed.notna().mean() >= 0.7:
                    is_dt = True
        if is_dt:
            datetime_cols.append(col)
            continue

        if _is_id_column(col, series):
            identifier_cols.append(col)
            continue

        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            if non_null.nunique() <= 1:
                constant_cols.append(col)
            else:
                numeric_cols.append(col)
        else:
            if non_null.nunique() <= 1:
                constant_cols.append(col)
            else:
                categorical_cols.append(col)

    domain, domain_conf = _infer_dataset_domain(list(df.columns))
    high_missing_cols = [c for c, pct in missing_pct_by_col.items() if pct >= 15.0]

    return {
        "row_count": int(total_rows),
        "column_count": int(total_cols),
        "inferred_domain": domain,
        "domain_confidence": domain_conf,
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "datetime_columns": datetime_cols,
        "identifier_columns": identifier_cols,
        "constant_columns": constant_cols,
        "missing_pct_by_column": missing_pct_by_col,
        "high_missing_columns": high_missing_cols,
    }


def _make_finding(
    finding_id: str,
    title: str,
    explanation: str,
    affected_variables: list[str],
    measured_values: dict[str, Any],
    relevant_scope: str,
    statistical_method: str,
    supporting_evidence: list[str],
    limitations: list[str],
    why_it_matters: str,
    suggested_next_step: str,
    metric: str,
    baseline_value: float | None,
    observed_value: float | None,
    percentage_change: float | None,
    detected_timestamp: str,
    p_value: float | None,
    effect_size: float | None,
    confidence_interval: list[float] | None,
    evidence_strength: str,
    affected_records: int,
    corroborated: bool = False,
    chart_data: dict[str, Any] | None = None,
    affected_entities: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": finding_id,
        "title": title,
        "explanation": explanation,
        "affected_variables": affected_variables,
        "measured_values": measured_values,
        "relevant_scope": relevant_scope,
        "statistical_method": statistical_method,
        "supporting_evidence": supporting_evidence,
        "limitations": limitations,
        "why_it_matters": why_it_matters,
        "suggested_next_step": suggested_next_step,
        "metric": metric,
        "baseline_value": _safe_float(baseline_value, 4),
        "anomaly_value": _safe_float(observed_value, 4),
        "percentage_change": _safe_float(percentage_change, 2),
        "detected_timestamp": detected_timestamp,
        "p_value": _safe_float(p_value, 6) if p_value is not None else None,
        "q_value": None,
        "effect_size": _safe_float(effect_size, 4),
        "confidence_interval": confidence_interval or [],
        "evidence_strength": evidence_strength,  # "statistically_supported" | "exploratory"
        "affected_records": int(affected_records),
        "corroborated": corroborated,
        "chart_data": chart_data or {},
        "affected_entities": affected_entities or [],
    }


def detect_statistical_outliers(df: pd.DataFrame, understanding: dict[str, Any]) -> list[dict[str, Any]]:
    """Univariate (Z-score / Modified Z-score / IQR) and multivariate (Isolation Forest) outlier detection."""
    findings: list[dict[str, Any]] = []
    numeric_cols = understanding["numeric_columns"]

    for col in numeric_cols:
        series = df[col].dropna()
        n = len(series)
        if n < 12:
            continue

        skew = float(series.skew()) if n >= 3 else 0.0
        median = float(series.median())
        mean = float(series.mean())
        std = float(series.std(ddof=1))

        # Choose method based on skewness
        if abs(skew) <= 1.0 and std > 0:
            z_scores = np.abs((series - mean) / std)
            outlier_mask = z_scores > 3.0
            method = "Standard Z-Score (|z| > 3.0)"
            threshold_desc = "|z| > 3.0"
        else:
            mad = float(np.median(np.abs(series - median)))
            if mad > 0:
                mod_z = 0.6745 * np.abs(series - median) / mad
                outlier_mask = mod_z > 3.5
                method = "Modified Z-Score via MAD (|Mz| > 3.5)"
                threshold_desc = "|Mz| > 3.5"
            else:
                q1, q3 = float(series.quantile(0.25)), float(series.quantile(0.75))
                iqr = q3 - q1
                if iqr <= 0:
                    continue
                outlier_mask = (series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)
                method = "Tukey IQR Fences (1.5 × IQR)"
                threshold_desc = "outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]"

        outlier_vals = series[outlier_mask]
        outlier_count = int(len(outlier_vals))
        if outlier_count == 0:
            continue

        outlier_pct = round((outlier_count / n) * 100, 2)
        # Only surface if meaningful (< 25% of data, otherwise it's heavy-tailed rather than isolated outliers)
        if outlier_pct > 25.0:
            continue

        extreme_val = float(outlier_vals.iloc[int(np.argmax(np.abs(outlier_vals - median)))])
        pct_from_median = ((extreme_val - median) / max(abs(median), 1e-6)) * 100

        # Build histogram/bucket chart from actual values
        counts, edges = np.histogram(series, bins=min(10, max(5, int(np.sqrt(n)))))
        chart_series = [
            {"bucket": f"{round(edges[i], 2)}–{round(edges[i + 1], 2)}", "count": int(counts[i])}
            for i in range(len(counts))
        ]

        findings.append(
            _make_finding(
                finding_id=f"FIND-OUTLIER-{col.upper()[:16]}",
                title=f"Unusual extreme values detected in {col.replace('_', ' ')}",
                explanation=(
                    f"{outlier_count} record(s) ({outlier_pct}% of valid rows) in '{col}' fall outside "
                    f"the expected range ({threshold_desc}). Most extreme value observed: {round(extreme_val, 3)} "
                    f"vs median {round(median, 3)}."
                ),
                affected_variables=[col],
                measured_values={
                    "outlier_count": outlier_count,
                    "outlier_pct": outlier_pct,
                    "median": round(median, 4),
                    "mean": round(mean, 4),
                    "std": round(std, 4),
                    "most_extreme_value": round(extreme_val, 4),
                    "sample_size": n,
                },
                relevant_scope=f"Across {n} valid observations of '{col}'",
                statistical_method=method,
                supporting_evidence=[
                    f"{outlier_count} of {n} records exceeded {threshold_desc}.",
                    f"Median={round(median, 3)}, Mean={round(mean, 3)}, Min={round(float(series.min()), 3)}, Max={round(float(series.max()), 3)}.",
                ],
                limitations=[
                    "Statistical outliers are unusual values, not automatically data-entry errors.",
                    "Univariate detection does not account for interacting variables.",
                ],
                why_it_matters=f"Extreme values in '{col}' can reflect rare operational events, genuine anomalies, or measurement spikes.",
                suggested_next_step=f"Inspect the {outlier_count} flagged records in '{col}' alongside timestamps and entity/segment labels.",
                metric=col,
                baseline_value=median,
                observed_value=extreme_val,
                percentage_change=pct_from_median,
                detected_timestamp="Multiple records",
                p_value=None,
                effect_size=abs(extreme_val - median) / max(std, 1e-6),
                confidence_interval=[],
                evidence_strength="exploratory",
                affected_records=outlier_count,
                chart_data={"type": "bar", "xKey": "bucket", "yKey": "count", "series": chart_series},
            )
        )

    # Multivariate Isolation Forest
    if len(numeric_cols) >= 2:
        clean_num = df[numeric_cols].dropna()
        if len(clean_num) >= 25:
            iso = IsolationForest(contamination=0.05, random_state=42)
            preds = iso.fit_predict(clean_num)
            flagged = int(np.sum(preds == -1))
            if flagged > 0:
                pct = round((flagged / len(clean_num)) * 100, 2)
                findings.append(
                    _make_finding(
                        finding_id="FIND-MV-ISOLATION",
                        title="Unusual multi-variable combinations detected",
                        explanation=(
                            f"Isolation Forest identified {flagged} record(s) ({pct}% of {len(clean_num)} complete rows) "
                            f"whose combined values across {len(numeric_cols)} numerical variables deviate from normal clusters."
                        ),
                        affected_variables=numeric_cols[:6],
                        measured_values={
                            "flagged_records": flagged,
                            "evaluated_rows": len(clean_num),
                            "flagged_pct": pct,
                            "features_used": len(numeric_cols),
                        },
                        relevant_scope=f"Joint feature space ({', '.join(numeric_cols[:4])})",
                        statistical_method="Isolation Forest (contamination=0.05, random_state=42)",
                        supporting_evidence=[
                            f"{flagged} rows isolated with shorter average tree path lengths across {len(numeric_cols)} variables.",
                        ],
                        limitations=[
                            "Isolation Forest is an exploratory unsupervised method; it does not produce p-values.",
                            "Contamination parameter sets an upper sensitivity target of 5%.",
                        ],
                        why_it_matters="Records can look normal in each column individually while exhibiting an unusual combination across variables.",
                        suggested_next_step="Filter the flagged rows and compare their categorical/time attributes against normal clusters.",
                        metric="multivariate_profile",
                        baseline_value=0.0,
                        observed_value=float(flagged),
                        percentage_change=pct,
                        detected_timestamp="Multiple records",
                        p_value=None,
                        effect_size=None,
                        confidence_interval=[],
                        evidence_strength="exploratory",
                        affected_records=flagged,
                    )
                )

    return findings


def detect_timeseries_patterns(df: pd.DataFrame, understanding: dict[str, Any]) -> list[dict[str, Any]]:
    """Detects change points, trends, variance shifts, and missing intervals in time-indexed data."""
    findings: list[dict[str, Any]] = []
    if not understanding["datetime_columns"]:
        return findings

    time_col = understanding["datetime_columns"][0]
    parsed_time = pd.to_datetime(df[time_col], errors="coerce")
    valid_df = df.copy()
    valid_df["_parsed_ts"] = parsed_time
    valid_df = valid_df.dropna(subset=["_parsed_ts"]).sort_values("_parsed_ts")

    if len(valid_df) < 12:
        return findings

    # 1. Missing time interval check
    deltas = valid_df["_parsed_ts"].diff().dropna()
    positive_deltas = deltas[deltas > pd.Timedelta(0)]
    if len(positive_deltas) >= 5:
        median_delta = positive_deltas.median()
        gap_threshold = median_delta * 2.5
        gaps = positive_deltas[positive_deltas > gap_threshold]
        if len(gaps) > 0 and median_delta > pd.Timedelta(0):
            max_gap = gaps.max()
            gap_idx = gaps.idxmax()
            gap_time = str(valid_df.loc[gap_idx, "_parsed_ts"])
            findings.append(
                _make_finding(
                    finding_id="FIND-TS-GAPS",
                    title=f"Missing time intervals detected in '{time_col}'",
                    explanation=(
                        f"Detected {len(gaps)} time gap(s) exceeding 2.5× the typical sampling interval "
                        f"({median_delta}). Largest gap was {max_gap} ending at {gap_time}."
                    ),
                    affected_variables=[time_col],
                    measured_values={
                        "gap_count": int(len(gaps)),
                        "typical_interval_sec": round(median_delta.total_seconds(), 2),
                        "largest_gap_sec": round(max_gap.total_seconds(), 2),
                    },
                    relevant_scope=f"{valid_df['_parsed_ts'].iloc[0]} to {valid_df['_parsed_ts'].iloc[-1]}",
                    statistical_method="Median Sampling Interval Gap Detection (> 2.5 × median Δt)",
                    supporting_evidence=[
                        f"Typical interval: {median_delta}; {len(gaps)} interval(s) exceeded {gap_threshold}.",
                    ],
                    limitations=["Gaps may reflect scheduled downtime, non-working hours, or telemetry outages."],
                    why_it_matters="Missing time intervals can distort rolling averages and mask events that occurred during blind spots.",
                    suggested_next_step="Verify whether the largest gap corresponds to planned shutdowns or missing logs.",
                    metric=time_col,
                    baseline_value=median_delta.total_seconds(),
                    observed_value=max_gap.total_seconds(),
                    percentage_change=((max_gap.total_seconds() - median_delta.total_seconds()) / max(median_delta.total_seconds(), 1.0)) * 100,
                    detected_timestamp=gap_time,
                    p_value=None,
                    effect_size=None,
                    confidence_interval=[],
                    evidence_strength="exploratory",
                    affected_records=int(len(gaps)),
                )
            )

    # 2. Change-point, trend, and variance shift per numeric column
    entity_col = understanding["categorical_columns"][0] if understanding["categorical_columns"] else None

    for col in understanding["numeric_columns"][:6]:
        sub = valid_df[["_parsed_ts", col] + ([entity_col] if entity_col else [])].dropna(subset=[col])
        n = len(sub)
        if n < 12:
            continue

        # Change-point scan (25%..75%)
        best_stat = 0.0
        best_p = 1.0
        best_idx = n // 2
        step = max(1, n // 20)
        vals = sub[col].to_numpy(dtype=float)

        for idx in range(int(n * 0.25), int(n * 0.75), step):
            pre, post = vals[:idx], vals[idx:]
            if len(pre) >= 6 and len(post) >= 6 and (np.std(pre) > 0 or np.std(post) > 0):
                t_res = stats.ttest_ind(pre, post, equal_var=False)
                if not np.isnan(t_res.statistic) and abs(t_res.statistic) > abs(best_stat):
                    best_stat = float(t_res.statistic)
                    best_p = float(t_res.pvalue)
                    best_idx = idx

        pre_w = vals[:best_idx]
        post_w = vals[best_idx:]
        pre_mean = float(np.mean(pre_w))
        post_mean = float(np.mean(post_w))
        pct_change = ((post_mean - pre_mean) / max(abs(pre_mean), 1e-6)) * 100
        pooled_sd = math.sqrt(((np.var(pre_w, ddof=1) + np.var(post_w, ddof=1)) / 2.0)) if (len(pre_w) > 1 and len(post_w) > 1) else 0.0
        cohens_d = (post_mean - pre_mean) / max(pooled_sd, 1e-6) if pooled_sd > 0 else 0.0

        if best_p < 0.05 and abs(pct_change) >= 5.0:
            split_ts = str(sub["_parsed_ts"].iloc[best_idx])
            direction = "decreased" if pct_change < 0 else "increased"

            # Affected segment breakdown if available
            affected_entities = []
            if entity_col:
                for ent, grp in sub.groupby(entity_col):
                    if grp[entity_col].nunique() == 0:
                        continue
                    g_pre = grp[grp["_parsed_ts"] < sub["_parsed_ts"].iloc[best_idx]][col]
                    g_post = grp[grp["_parsed_ts"] >= sub["_parsed_ts"].iloc[best_idx]][col]
                    if len(g_pre) >= 3 and len(g_post) >= 3:
                        g_pct = ((g_post.mean() - g_pre.mean()) / max(abs(g_pre.mean()), 1e-6)) * 100
                        if abs(g_pct) >= 5.0:
                            affected_entities.append({
                                "entity": str(ent),
                                "pre_mean": round(float(g_pre.mean()), 2),
                                "post_mean": round(float(g_post.mean()), 2),
                                "drop_pct": round(float(g_pct), 2),
                            })

            # Downsampled real series for chart (max 30 points)
            stride = max(1, n // 30)
            chart_series = [
                {
                    "time": str(sub["_parsed_ts"].iloc[i])[:16],
                    "value": round(float(vals[i]), 3),
                }
                for i in range(0, n, stride)
            ]

            findings.append(
                _make_finding(
                    finding_id=f"FIND-TS-SHIFT-{col.upper()[:14]}",
                    title=f"{col.replace('_', ' ').title()} {direction} after {split_ts[:10]}",
                    explanation=(
                        f"{col.replace('_', ' ').title()} {direction} by {abs(pct_change):.1f}% "
                        f"(from {pre_mean:.2f} to {post_mean:.2f}) starting around {split_ts}."
                    ),
                    affected_variables=[col, time_col],
                    measured_values={
                        "baseline_mean": round(pre_mean, 4),
                        "post_shift_mean": round(post_mean, 4),
                        "percentage_change": round(pct_change, 2),
                        "t_statistic": round(best_stat, 4),
                        "pre_sample_size": len(pre_w),
                        "post_sample_size": len(post_w),
                    },
                    relevant_scope=f"Before vs after {split_ts}",
                    statistical_method="Change-Point Scan + Welch's Two-Sample t-test (unequal variance)",
                    supporting_evidence=[
                        f"Pre-shift mean={pre_mean:.2f} (n={len(pre_w)}, sd={np.std(pre_w, ddof=1):.2f}) vs Post-shift mean={post_mean:.2f} (n={len(post_w)}, sd={np.std(post_w, ddof=1):.2f}).",
                        f"Welch t={best_stat:.3f}, Cohen's d={cohens_d:.3f}.",
                    ],
                    limitations=[
                        "Change-point scan tests candidate splits and requires multiple-testing awareness.",
                        "Temporal shift alone does not prove which factor caused the change.",
                    ],
                    why_it_matters=f"A sustained shift in '{col}' indicates a structural change in behavior rather than isolated noise.",
                    suggested_next_step=f"Compare segments and covariates before and after {split_ts[:10]} to isolate what changed.",
                    metric=col,
                    baseline_value=pre_mean,
                    observed_value=post_mean,
                    percentage_change=pct_change,
                    detected_timestamp=split_ts,
                    p_value=best_p,
                    effect_size=abs(cohens_d),
                    confidence_interval=[],
                    evidence_strength="statistically_supported",
                    affected_records=len(post_w),
                    corroborated=len(affected_entities) > 0,
                    chart_data={"type": "line", "xKey": "time", "yKey": "value", "series": chart_series},
                    affected_entities=affected_entities,
                )
            )

        # Spearman monotonic trend over time
        time_ord = np.arange(n, dtype=float)
        if np.std(vals) > 0:
            rho, trend_p = stats.spearmanr(time_ord, vals)
            if not np.isnan(rho) and trend_p < 0.05 and abs(rho) >= 0.35:
                slope, _, _, _, _ = stats.linregress(time_ord, vals)
                trend_dir = "upward" if rho > 0 else "downward"
                stride = max(1, n // 30)
                chart_series = [
                    {"time": str(sub["_parsed_ts"].iloc[i])[:16], "value": round(float(vals[i]), 3)}
                    for i in range(0, n, stride)
                ]
                findings.append(
                    _make_finding(
                        finding_id=f"FIND-TS-TREND-{col.upper()[:14]}",
                        title=f"Consistent {trend_dir} trend in {col.replace('_', ' ')}",
                        explanation=(
                            f"'{col}' shows a statistically significant {trend_dir} monotonic trend over time "
                            f"(Spearman rho = {rho:.3f} across {n} observations)."
                        ),
                        affected_variables=[col, time_col],
                        measured_values={
                            "spearman_rho": round(float(rho), 4),
                            "linear_slope_per_step": round(float(slope), 5),
                            "sample_size": n,
                        },
                        relevant_scope=f"{sub['_parsed_ts'].iloc[0]} to {sub['_parsed_ts'].iloc[-1]}",
                        statistical_method="Spearman Rank Correlation over Time Index",
                        supporting_evidence=[
                            f"Spearman rho={rho:.3f} across {n} time-ordered records.",
                        ],
                        limitations=["Monotonic trend summarizes overall direction and may combine step changes with gradual drift."],
                        why_it_matters=f"Persistent drift in '{col}' can indicate wear, gradual growth, or accumulating bias.",
                        suggested_next_step=f"Check whether the {trend_dir} trend in '{col}' is uniform across all segments.",
                        metric=col,
                        baseline_value=float(vals[0]),
                        observed_value=float(vals[-1]),
                        percentage_change=((vals[-1] - vals[0]) / max(abs(vals[0]), 1e-6)) * 100,
                        detected_timestamp=str(sub["_parsed_ts"].iloc[-1]),
                        p_value=float(trend_p),
                        effect_size=abs(float(rho)),
                        confidence_interval=[],
                        evidence_strength="statistically_supported",
                        affected_records=n,
                        chart_data={"type": "line", "xKey": "time", "yKey": "value", "series": chart_series},
                    )
                )

    return findings


def detect_correlations_and_relationships(df: pd.DataFrame, understanding: dict[str, Any]) -> list[dict[str, Any]]:
    """Finds strong positive and negative pairwise correlations with Fisher-z CIs when sample size >= 20."""
    findings: list[dict[str, Any]] = []
    num_cols = understanding["numeric_columns"][:10]
    if len(num_cols) < 2:
        return findings

    for i in range(len(num_cols)):
        for j in range(i + 1, len(num_cols)):
            c1, c2 = num_cols[i], num_cols[j]
            pair_df = df[[c1, c2]].dropna()
            n = len(pair_df)
            if n < 15:
                continue
            if pair_df[c1].std() == 0 or pair_df[c2].std() == 0:
                continue

            r, p_val = stats.pearsonr(pair_df[c1], pair_df[c2])
            if np.isnan(r) or p_val >= 0.05 or abs(r) < 0.7:
                continue

            rho, _ = stats.spearmanr(pair_df[c1], pair_df[c2])
            direction = "positive" if r > 0 else "negative"

            # Fisher-z 95% CI only when n >= 20
            ci: list[float] = []
            if n >= 20 and abs(r) < 0.9999:
                z = np.arctanh(r)
                se = 1.0 / math.sqrt(n - 3)
                ci = [round(float(np.tanh(z - 1.96 * se)), 4), round(float(np.tanh(z + 1.96 * se)), 4)]

            # Sample up to 40 real points for scatter chart
            stride = max(1, n // 40)
            scatter_series = [
                {"x": round(float(pair_df[c1].iloc[k]), 3), "y": round(float(pair_df[c2].iloc[k]), 3)}
                for k in range(0, n, stride)
            ]

            findings.append(
                _make_finding(
                    finding_id=f"FIND-CORR-{c1.upper()[:8]}-{c2.upper()[:8]}",
                    title=f"Strong {direction} relationship between {c1.replace('_', ' ')} and {c2.replace('_', ' ')}",
                    explanation=(
                        f"'{c1}' and '{c2}' move strongly in {'the same' if r > 0 else 'opposite'} direction "
                        f"(Pearson r = {r:.3f}, Spearman rho = {rho:.3f}, n = {n}). Correlation does not prove causation."
                    ),
                    affected_variables=[c1, c2],
                    measured_values={
                        "pearson_r": round(float(r), 4),
                        "r_squared": round(float(r ** 2), 4),
                        "spearman_rho": round(float(rho), 4),
                        "sample_size": n,
                    },
                    relevant_scope=f"Pairwise across {n} complete rows",
                    statistical_method="Pearson & Spearman Correlation with Fisher-z 95% CI",
                    supporting_evidence=[
                        f"Pearson r={r:.3f} (R²={r**2:.3f}), Spearman rho={rho:.3f} across n={n} rows.",
                    ],
                    limitations=[
                        "Correlation measures co-variation only; it does not establish cause and effect.",
                        "Confounding variables or shared time trends may drive both metrics.",
                    ],
                    why_it_matters=f"Changes in '{c1}' are strongly associated with changes in '{c2}', making this pair valuable for deeper investigation.",
                    suggested_next_step=f"Test whether '{c1}' and '{c2}' remain correlated when controlling for time or segment.",
                    metric=f"{c1} vs {c2}",
                    baseline_value=0.0,
                    observed_value=round(float(r), 4),
                    percentage_change=round(float((r ** 2) * 100), 2),
                    detected_timestamp="Dataset-wide",
                    p_value=float(p_val),
                    effect_size=abs(float(r)),
                    confidence_interval=ci,
                    evidence_strength="statistically_supported",
                    affected_records=n,
                    chart_data={"type": "scatter", "xKey": "x", "yKey": "y", "xLabel": c1, "yLabel": c2, "series": scatter_series},
                )
            )

    return findings


def detect_distribution_patterns(df: pd.DataFrame, understanding: dict[str, Any]) -> list[dict[str, Any]]:
    """Detects heavy skewness, bimodality, and rare/imbalanced categories."""
    findings: list[dict[str, Any]] = []

    for col in understanding["numeric_columns"][:6]:
        series = df[col].dropna()
        n = len(series)
        if n < 20:
            continue
        skew = float(series.skew())
        kurt = float(series.kurt())  # excess kurtosis
        # Bimodality coefficient
        bc = (skew ** 2 + 1.0) / (kurt + 3.0) if (kurt + 3.0) > 0 else 0.0

        if abs(skew) >= 1.5:
            counts, edges = np.histogram(series, bins=8)
            chart_series = [
                {"bucket": f"{round(edges[i], 1)}–{round(edges[i + 1], 1)}", "count": int(counts[i])}
                for i in range(len(counts))
            ]
            findings.append(
                _make_finding(
                    finding_id=f"FIND-DIST-SKEW-{col.upper()[:12]}",
                    title=f"Heavily {'right' if skew > 0 else 'left'}-skewed distribution in {col.replace('_', ' ')}",
                    explanation=(
                        f"'{col}' is strongly asymmetric (skewness = {skew:.2f}, median = {series.median():.2f} "
                        f"vs mean = {series.mean():.2f}), suggesting a long tail of extreme values."
                    ),
                    affected_variables=[col],
                    measured_values={
                        "skewness": round(skew, 3),
                        "mean": round(float(series.mean()), 3),
                        "median": round(float(series.median()), 3),
                        "sample_size": n,
                    },
                    relevant_scope=f"Distribution across {n} rows",
                    statistical_method="Sample Skewness & Mean-Median Divergence",
                    supporting_evidence=[f"Skewness={skew:.2f}; Mean={series.mean():.2f}, Median={series.median():.2f}."],
                    limitations=["Skewed distributions violate normality assumptions; non-parametric tests are preferred."],
                    why_it_matters=f"Heavy skewness in '{col}' means averages alone can be misleading.",
                    suggested_next_step=f"Use median/IQR summaries for '{col}' and inspect the tail values.",
                    metric=col,
                    baseline_value=float(series.median()),
                    observed_value=float(series.mean()),
                    percentage_change=((float(series.mean()) - float(series.median())) / max(abs(float(series.median())), 1e-6)) * 100,
                    detected_timestamp="Dataset-wide",
                    p_value=None,
                    effect_size=abs(skew),
                    confidence_interval=[],
                    evidence_strength="exploratory",
                    affected_records=n,
                    chart_data={"type": "bar", "xKey": "bucket", "yKey": "count", "series": chart_series},
                )
            )
        elif n >= 30 and bc > 0.555:
            counts, edges = np.histogram(series, bins=10)
            chart_series = [
                {"bucket": f"{round(edges[i], 1)}–{round(edges[i + 1], 1)}", "count": int(counts[i])}
                for i in range(len(counts))
            ]
            findings.append(
                _make_finding(
                    finding_id=f"FIND-DIST-BIMOD-{col.upper()[:12]}",
                    title=f"Multiple clusters / bimodal pattern in {col.replace('_', ' ')}",
                    explanation=(
                        f"'{col}' exhibits a bimodality coefficient of {bc:.3f} (> 0.555), indicating the data may come "
                        f"from two or more distinct operating regimes or subpopulations."
                    ),
                    affected_variables=[col],
                    measured_values={"bimodality_coefficient": round(bc, 4), "sample_size": n},
                    relevant_scope=f"Distribution across {n} rows",
                    statistical_method="Sarle's Bimodality Coefficient (BC > 0.555)",
                    supporting_evidence=[f"BC={bc:.3f} across n={n} observations."],
                    limitations=["BC > 0.555 is an exploratory indicator of multimodality, not a formal cluster test."],
                    why_it_matters=f"Multiple modes in '{col}' often correspond to distinct shifts, equipment states, or customer tiers.",
                    suggested_next_step=f"Group '{col}' by categorical columns or time periods to see what separates the clusters.",
                    metric=col,
                    baseline_value=float(series.median()),
                    observed_value=round(bc, 3),
                    percentage_change=None,
                    detected_timestamp="Dataset-wide",
                    p_value=None,
                    effect_size=bc,
                    confidence_interval=[],
                    evidence_strength="exploratory",
                    affected_records=n,
                    chart_data={"type": "bar", "xKey": "bucket", "yKey": "count", "series": chart_series},
                )
            )

    # Rare / imbalanced categories
    for col in understanding["categorical_columns"][:5]:
        series = df[col].dropna().astype(str)
        n = len(series)
        if n < 20:
            continue
        vc = series.value_counts()
        if len(vc) < 2:
            continue
        top_pct = float(vc.iloc[0] / n * 100)
        rare = vc[(vc / n) < 0.02]
        if top_pct >= 85.0 or len(rare) > 0:
            chart_series = [{"category": str(k), "count": int(v)} for k, v in vc.head(8).items()]
            findings.append(
                _make_finding(
                    finding_id=f"FIND-CAT-IMBAL-{col.upper()[:12]}",
                    title=f"Imbalanced or rare categories in {col.replace('_', ' ')}",
                    explanation=(
                        f"In '{col}', '{vc.index[0]}' accounts for {top_pct:.1f}% of records"
                        + (f" and {len(rare)} rare category(ies) appear in <2% of rows." if len(rare) > 0 else ".")
                    ),
                    affected_variables=[col],
                    measured_values={
                        "dominant_category": str(vc.index[0]),
                        "dominant_pct": round(top_pct, 2),
                        "rare_category_count": int(len(rare)),
                        "unique_categories": int(len(vc)),
                    },
                    relevant_scope=f"Categorical breakdown ({n} rows)",
                    statistical_method="Category Frequency & Imbalance Analysis",
                    supporting_evidence=[f"Top category '{vc.index[0]}'={vc.iloc[0]}/{n} ({top_pct:.1f}%)."],
                    limitations=["Category imbalance may reflect normal domain mix rather than a data error."],
                    why_it_matters="Severely imbalanced groups reduce statistical power when comparing rare segments.",
                    suggested_next_step=f"Check whether rare categories in '{col}' represent exceptions, faults, or data-entry typos.",
                    metric=col,
                    baseline_value=round(100.0 / len(vc), 2),
                    observed_value=round(top_pct, 2),
                    percentage_change=None,
                    detected_timestamp="Dataset-wide",
                    p_value=None,
                    effect_size=None,
                    confidence_interval=[],
                    evidence_strength="exploratory",
                    affected_records=int(vc.iloc[0]),
                    chart_data={"type": "bar", "xKey": "category", "yKey": "count", "series": chart_series},
                )
            )

    return findings


def detect_segment_differences(df: pd.DataFrame, understanding: dict[str, Any]) -> list[dict[str, Any]]:
    """Compares numeric metrics across valid categorical segments using Kruskal-Wallis H-test."""
    findings: list[dict[str, Any]] = []
    cat_cols = understanding["categorical_columns"]
    num_cols = understanding["numeric_columns"]
    if not cat_cols or not num_cols:
        return findings

    for cat in cat_cols[:4]:
        vc = df[cat].dropna().value_counts()
        valid_groups = vc[vc >= 5].index.tolist()
        if not (2 <= len(valid_groups) <= 12):
            continue

        for num in num_cols[:4]:
            sub = df[df[cat].isin(valid_groups)][[cat, num]].dropna()
            groups = [grp[num].to_numpy(dtype=float) for _, grp in sub.groupby(cat) if len(grp) >= 5]
            if len(groups) < 2:
                continue
            if all(np.std(g) == 0 for g in groups):
                continue

            h_stat, p_val = stats.kruskal(*groups)
            if np.isnan(h_stat) or p_val >= 0.05:
                continue

            total_n = sum(len(g) for g in groups)
            epsilon_sq = max(0.0, (float(h_stat) - len(groups) + 1) / max(1, total_n - len(groups)))
            if epsilon_sq < 0.06:  # Require at least moderate effect size
                continue

            seg_means = sub.groupby(cat)[num].agg(["mean", "count"]).sort_values("mean")
            overall_mean = float(sub[num].mean())
            low_seg = str(seg_means.index[0])
            high_seg = str(seg_means.index[-1])
            low_mean = float(seg_means["mean"].iloc[0])
            high_mean = float(seg_means["mean"].iloc[-1])
            gap_pct = ((high_mean - low_mean) / max(abs(overall_mean), 1e-6)) * 100

            chart_series = [
                {"segment": str(idx), "mean": round(float(row["mean"]), 3), "count": int(row["count"])}
                for idx, row in seg_means.iterrows()
            ]

            findings.append(
                _make_finding(
                    finding_id=f"FIND-SEG-{cat.upper()[:8]}-{num.upper()[:8]}",
                    title=f"Significant {num.replace('_', ' ')} differences across {cat.replace('_', ' ')} segments",
                    explanation=(
                        f"'{num}' varies significantly across '{cat}' groups (Kruskal-Wallis H = {h_stat:.2f}, "
                        f"effect size ε² = {epsilon_sq:.3f}). Lowest segment '{low_seg}' averages {low_mean:.2f} "
                        f"vs highest '{high_seg}' at {high_mean:.2f}."
                    ),
                    affected_variables=[cat, num],
                    measured_values={
                        "kruskal_h": round(float(h_stat), 4),
                        "epsilon_squared": round(float(epsilon_sq), 4),
                        "overall_mean": round(overall_mean, 3),
                        "lowest_segment": low_seg,
                        "lowest_mean": round(low_mean, 3),
                        "highest_segment": high_seg,
                        "highest_mean": round(high_mean, 3),
                    },
                    relevant_scope=f"Across {len(groups)} segments of '{cat}' (n={total_n})",
                    statistical_method="Kruskal-Wallis H-Test (non-parametric multi-group comparison)",
                    supporting_evidence=[
                        f"H={h_stat:.2f}, ε²={epsilon_sq:.3f} across {len(groups)} groups (each n >= 5).",
                        f"'{low_seg}' mean={low_mean:.2f} vs '{high_seg}' mean={high_mean:.2f}.",
                    ],
                    limitations=[
                        "Group sizes may be unequal; Kruskal-Wallis ranks observations without assuming normality.",
                        "Segment differences may be confounded by time or other variables.",
                    ],
                    why_it_matters=f"Disparities across '{cat}' pinpoint which specific segments are driving variation in '{num}'.",
                    suggested_next_step=f"Investigate what distinguishes '{low_seg}' from '{high_seg}' in '{cat}'.",
                    metric=num,
                    baseline_value=overall_mean,
                    observed_value=low_mean,
                    percentage_change=((low_mean - overall_mean) / max(abs(overall_mean), 1e-6)) * 100,
                    detected_timestamp="Segment-wide",
                    p_value=float(p_val),
                    effect_size=epsilon_sq,
                    confidence_interval=[],
                    evidence_strength="statistically_supported",
                    affected_records=int(seg_means["count"].iloc[0]),
                    chart_data={"type": "bar", "xKey": "segment", "yKey": "mean", "series": chart_series},
                )
            )

    return findings


def apply_benjamini_hochberg(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Applies Benjamini-Hochberg FDR correction across all p-value-tested findings."""
    tested = [(idx, f["p_value"]) for idx, f in enumerate(findings) if f.get("p_value") is not None]
    m = len(tested)
    if m == 0:
        return findings

    tested.sort(key=lambda x: x[1])
    q_values = [0.0] * m
    running_min = 1.0
    for rank_minus_1 in range(m - 1, -1, -1):
        rank = rank_minus_1 + 1
        p = tested[rank_minus_1][1]
        bh = min(1.0, (p * m) / rank)
        running_min = min(running_min, bh)
        q_values[rank_minus_1] = round(running_min, 6)

    for pos, (orig_idx, _) in enumerate(tested):
        q = q_values[pos]
        findings[orig_idx]["q_value"] = q
        if q >= 0.05:
            findings[orig_idx]["evidence_strength"] = "exploratory"
            findings[orig_idx]["limitations"].append(
                f"After Benjamini-Hochberg FDR correction (m={m} tests), q={q} >= 0.05; treated as exploratory."
            )

    return findings


def prioritize_findings(
    findings: list[dict[str, Any]],
    total_rows: int,
    missing_pct_by_col: dict[str, float],
) -> list[dict[str, Any]]:
    """Ranks findings using the documented weighted prioritisation formula."""
    for f in findings:
        q = f.get("q_value")
        if q is not None and f["evidence_strength"] == "statistically_supported":
            s_sig = max(0.0, 1.0 - min(1.0, q / 0.05))
        else:
            s_sig = 0.4

        eff = f.get("effect_size")
        pct = f.get("percentage_change")
        if eff is not None:
            s_mag = min(1.0, abs(float(eff)) / 1.5)
        elif pct is not None:
            s_mag = min(1.0, abs(float(pct)) / 50.0)
        else:
            s_mag = 0.35

        reach_ratio = (f.get("affected_records", 0) / max(1, total_rows)) * 2.0
        s_reach = min(1.0, reach_ratio)

        cols = [c for c in f.get("affected_variables", []) if c in missing_pct_by_col]
        avg_missing = sum(missing_pct_by_col[c] for c in cols) / max(1, len(cols)) if cols else 0.0
        s_rel = max(0.0, 1.0 - (avg_missing / 100.0))

        s_rec = 1.0 if f.get("corroborated") else 0.5

        score = round(35 * s_sig + 25 * s_mag + 20 * s_reach + 10 * s_rel + 10 * s_rec, 1)
        f["priority_score"] = score

        if score >= 65.0 and f["evidence_strength"] == "statistically_supported":
            f["priority"] = "high"
            f["severity"] = "HIGH"
        elif score >= 40.0:
            f["priority"] = "medium"
            f["severity"] = "MEDIUM"
        else:
            f["priority"] = "low"
            f["severity"] = "LOW"

    findings.sort(key=lambda x: x["priority_score"], reverse=True)
    return findings


def run_autonomous_discovery(
    df: pd.DataFrame,
    dataset_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    analysis_version: int = 1,
) -> dict[str, Any]:
    """
    Runs the full Step 5 Autonomous Discovery Engine on a DataFrame,
    tracking runtime and peak memory usage.
    """
    tracemalloc.start()
    t0 = time.perf_counter()

    understanding = understand_dataset(df, metadata=metadata)
    if df.empty or len(df) < 3:
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        return {
            "dataset_understanding": understanding,
            "findings": [],
            "summary": {
                "total_findings": 0,
                "high_priority": 0,
                "medium_priority": 0,
                "low_priority": 0,
                "statistically_supported": 0,
                "exploratory": 0,
            },
            "prioritisation_formula": PRIORITISATION_FORMULA_DOC,
            "performance": {
                "runtime_ms": round((time.perf_counter() - t0) * 1000, 2),
                "peak_memory_mb": round(peak / (1024 * 1024), 3),
            },
        }

    raw_findings: list[dict[str, Any]] = []
    raw_findings.extend(detect_timeseries_patterns(df, understanding))
    raw_findings.extend(detect_segment_differences(df, understanding))
    raw_findings.extend(detect_correlations_and_relationships(df, understanding))
    raw_findings.extend(detect_statistical_outliers(df, understanding))
    raw_findings.extend(detect_distribution_patterns(df, understanding))

    corrected = apply_benjamini_hochberg(raw_findings)
    ranked = prioritize_findings(corrected, len(df), understanding["missing_pct_by_column"])

    for f in ranked:
        f["dataset_id"] = dataset_id
        f["analysis_version"] = analysis_version

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    summary = {
        "total_findings": len(ranked),
        "high_priority": sum(1 for f in ranked if f["priority"] == "high"),
        "medium_priority": sum(1 for f in ranked if f["priority"] == "medium"),
        "low_priority": sum(1 for f in ranked if f["priority"] == "low"),
        "statistically_supported": sum(1 for f in ranked if f["evidence_strength"] == "statistically_supported"),
        "exploratory": sum(1 for f in ranked if f["evidence_strength"] == "exploratory"),
    }

    return {
        "dataset_understanding": understanding,
        "findings": ranked,
        "summary": summary,
        "prioritisation_formula": PRIORITISATION_FORMULA_DOC,
        "performance": {
            "runtime_ms": elapsed_ms,
            "peak_memory_mb": round(peak / (1024 * 1024), 3),
        },
    }
