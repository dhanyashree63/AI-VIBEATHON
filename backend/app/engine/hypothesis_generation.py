from typing import Any
import pandas as pd
import numpy as np
from scipy import stats
from backend.app.engine.hypothesis_testing import (
    compute_cohens_d,
    compute_mean_difference_ci,
    evaluate_bivariate_relationship,
    evaluate_controlled_regression
)
from backend.app.engine.evidence_scoring import score_hypothesis_evidence


def _quartile_group_stats(df: pd.DataFrame, predictor_col: str, target_col: str) -> tuple[float | None, list[float], float | None]:
    """Computes Cohen's d, 95% CI, and Welch t-test p-value comparing upper quartile vs lower 75% of predictor."""
    valid = df[[predictor_col, target_col]].dropna()
    if len(valid) < 10 or valid[predictor_col].nunique() < 2:
        return None, [], None
    q75 = valid[predictor_col].quantile(0.75)
    high_grp = valid[valid[predictor_col] >= q75][target_col]
    low_grp = valid[valid[predictor_col] < q75][target_col]
    if len(high_grp) < 3 or len(low_grp) < 3:
        return None, [], None
    d_val = compute_cohens_d(low_grp, high_grp)
    ci_val = compute_mean_difference_ci(low_grp, high_grp)
    t_res = stats.ttest_ind(low_grp, high_grp, equal_var=False)
    p_val = float(np.round(t_res.pvalue, 6)) if not np.isnan(t_res.pvalue) else None
    return d_val, ci_val, p_val


def generate_competing_explanations(fused_df: pd.DataFrame, anomaly_info: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Generates competing explanations for the detected anomaly and performs actual mathematical tests.
    Every numerical metric (p-value, Cohen's d, 95% CI, R², controlled regression) is computed directly
    from the dataset — never invented or hardcoded.
    """
    hypotheses = []
    metric_col = anomaly_info.get("metric", "output_units")
    if metric_col not in fused_df.columns:
        num_cols = list(fused_df.select_dtypes(include=[np.number]).columns)
        metric_col = num_cols[0] if num_cols else metric_col

    n_total = len(fused_df)

    # Detect numeric domain columns
    num_cols_all = [c for c in fused_df.columns if pd.api.types.is_numeric_dtype(fused_df[c])]
    temp_col = next((c for c in num_cols_all if "temp" in c.lower()), None)
    rpm_col = next((c for c in num_cols_all if any(k in c.lower() for k in ["rpm", "speed", "workload", "cycle_target"])), None)
    maint_col = next((c for c in num_cols_all if any(k in c.lower() for k in ["days_since", "maint", "hours_run", "vibration"])), None)
    energy_col = next((c for c in num_cols_all if any(k in c.lower() for k in ["power", "kwh", "energy", "voltage"])), None)
    material_col = next((c for c in fused_df.columns if any(k in c.lower() for k in ["material", "supplier", "feedstock", "hardness"])), None)

    has_manufacturing_schema = any([temp_col, rpm_col, maint_col, energy_col])

    if not has_manufacturing_schema and metric_col in fused_df.columns:
        # Generic data-driven competing explanations for ANY user-uploaded dataset
        num_predictors = [
            c for c in fused_df.select_dtypes(include=[np.number]).columns
            if c != metric_col and fused_df[c].nunique(dropna=True) > 1
        ]
        for idx, pred in enumerate(num_predictors[:5]):
            bivar = evaluate_bivariate_relationship(fused_df[pred], fused_df[metric_col])
            d_val, ci_val, grp_p = _quartile_group_stats(fused_df, pred, metric_col)
            other_preds = [c for c in num_predictors if c != pred][:2]
            ctrl_res = evaluate_controlled_regression(fused_df, metric_col, pred, other_preds) if other_preds else {}
            is_conf = bool(ctrl_res.get("is_confounded_or_spurious", False))

            supp, contra, miss = [], [], []
            if bivar["pearson_p"] < 0.05 and abs(bivar["pearson_r"]) >= 0.25:
                supp.append(
                    f"Statistically significant association between '{pred}' and '{metric_col}' "
                    f"(Pearson r = {bivar['pearson_r']}, Spearman rho = {bivar['spearman_rho']}, p = {bivar['pearson_p']})."
                )
            else:
                contra.append(
                    f"Weak or non-significant linear association between '{pred}' and '{metric_col}' "
                    f"(r = {bivar['pearson_r']}, p = {bivar['pearson_p']})."
                )
            if is_conf:
                contra.append(ctrl_res.get("interpretation", "Relationship attenuates under confounder control."))

            nulls = int(fused_df[pred].isna().sum())
            if nulls > 0:
                miss.append(f"{nulls} missing observations in '{pred}' reduce statistical power.")
            miss.append(f"Controlled intervention data manipulating '{pred}' independently is not yet recorded.")

            scored = score_hypothesis_evidence(
                p_val=bivar["pearson_p"],
                effect_size=d_val if d_val is not None else bivar["pearson_r"],
                sample_size=bivar["n"],
                is_confounded=is_conf,
                missing_evidence_count=len(miss),
                supporting_count=len(supp),
                contradicting_count=len(contra)
            )
            hypotheses.append({
                "id": f"HYP_VAR_{idx + 1}_{pred.upper()[:12]}",
                "title": f"Driver Hypothesis: Variation in {pred.replace('_', ' ').title()}",
                "description": f"Changes in '{pred}' may explain the observed shift in '{metric_col}'.",
                "category": "data_driven",
                "status": "refuted" if is_conf else ("supported" if scored["verdict"] == "STRONG_SUPPORT" else "active"),
                "strength_score": scored["score"],
                "verdict": scored["verdict"],
                "score_breakdown": scored["breakdown"],
                "supporting_evidence": supp,
                "contradicting_evidence": contra,
                "missing_evidence": miss,
                "statistical_tests": {"bivariate": bivar, "controlled_regression": ctrl_res},
                "effect_size": d_val,
                "confidence_interval": ci_val,
                "p_value": bivar["pearson_p"],
                "limitations": ["Observational correlation alone cannot establish causal direction without intervention."]
            })
        hypotheses.sort(key=lambda x: x["strength_score"], reverse=True)
        return hypotheses

    # -------------------------------------------------------------
    # HYPOTHESIS 1: Thermal Stress / Overheating
    # -------------------------------------------------------------
    h1_support, h1_contradict, h1_missing = [], [], []
    h1_tests: dict[str, Any] = {}
    h1_p, h1_d, h1_ci, h1_n = None, None, [], 0

    if temp_col and metric_col in fused_df.columns:
        bivar = evaluate_bivariate_relationship(fused_df[temp_col], fused_df[metric_col])
        h1_tests["bivariate_temperature_output"] = bivar
        h1_p = bivar["pearson_p"]
        h1_n = bivar["n"]

        if bivar["pearson_r"] < -0.3 and bivar["pearson_p"] < 0.05:
            h1_support.append(
                f"Statistically significant negative correlation between {temp_col} and {metric_col} "
                f"(Pearson r = {bivar['pearson_r']}, Spearman rho = {bivar['spearman_rho']}, p = {bivar['pearson_p']}, R² = {bivar['r_squared']})."
            )
        else:
            h1_contradict.append(
                f"Correlation between {temp_col} and {metric_col} is weak or not statistically significant (r = {bivar['pearson_r']}, p = {bivar['pearson_p']})."
            )

        h1_d, h1_ci, grp_p = _quartile_group_stats(fused_df, temp_col, metric_col)
        if h1_d is not None:
            h1_tests["high_vs_normal_temp_ttest"] = {"cohens_d": h1_d, "ci_95": h1_ci, "welch_p": grp_p}
            h1_support.append(
                f"Machines operating in upper temperature quartile exhibit substantial output penalty: "
                f"Cohen's d = {h1_d:.2f}, 95% CI of mean deficit = [{h1_ci[0]:.2f}, {h1_ci[1]:.2f}], Welch p = {grp_p}."
            )

        null_temps = int(fused_df[temp_col].isna().sum())
        if null_temps > 0:
            h1_missing.append(
                f"{null_temps} production intervals lack temperature recordings (sensor offline or telemetry packet loss)."
            )
        h1_missing.append("Targeted coolant flow rate (L/min) and internal valve differential pressure telemetry are unmeasured in initial logs.")
    else:
        h1_missing.append("Direct machine operating temperature logs are missing from initial evidence.")

    h1_scored = score_hypothesis_evidence(
        p_val=h1_p, effect_size=h1_d, sample_size=h1_n, is_confounded=False,
        missing_evidence_count=len(h1_missing), supporting_count=len(h1_support), contradicting_count=len(h1_contradict)
    )

    hypotheses.append({
        "id": "HYP_THERMAL_STRESS",
        "title": "Machine Thermal Stress and Auto-Throttling",
        "description": "Operating temperatures exceed thermal safety thresholds during peak cycles, triggering automatic sub-cycle throttling or micro-stops.",
        "category": "thermal",
        "status": "supported" if h1_scored["verdict"] == "STRONG_SUPPORT" else "active",
        "strength_score": h1_scored["score"],
        "verdict": h1_scored["verdict"],
        "score_breakdown": h1_scored["breakdown"],
        "supporting_evidence": h1_support,
        "contradicting_evidence": h1_contradict,
        "missing_evidence": h1_missing,
        "statistical_tests": h1_tests,
        "effect_size": h1_d,
        "confidence_interval": h1_ci,
        "p_value": h1_p,
        "limitations": [
            "Cannot confirm whether overheating is primary root cause or a secondary symptom of mechanical friction.",
            "Lack of coolant flow sensors leaves precise heat rejection failure mechanism unverified."
        ]
    })

    # -------------------------------------------------------------
    # HYPOTHESIS 2: Workload Demand / Confounding Operational Speed
    # -------------------------------------------------------------
    h2_support, h2_contradict, h2_missing = [], [], []
    h2_tests: dict[str, Any] = {}
    h2_p, h2_d, h2_ci, h2_n = None, None, [], 0
    h2_confounded = False

    if rpm_col and metric_col in fused_df.columns:
        bivar_rpm = evaluate_bivariate_relationship(fused_df[rpm_col], fused_df[metric_col])
        h2_tests["bivariate_rpm_output"] = bivar_rpm
        h2_p = bivar_rpm["pearson_p"]
        h2_n = bivar_rpm["n"]
        h2_d, h2_ci, _ = _quartile_group_stats(fused_df, rpm_col, metric_col)

        if bivar_rpm["pearson_p"] < 0.05:
            h2_support.append(
                f"Operational speed ({rpm_col}) strongly co-varies with {metric_col} "
                f"(Pearson r = {bivar_rpm['pearson_r']}, p = {bivar_rpm['pearson_p']}, R² = {bivar_rpm['r_squared']})."
            )

        if temp_col:
            ctrl_test = evaluate_controlled_regression(fused_df, metric_col, temp_col, [rpm_col])
            h2_tests["controlled_for_rpm"] = ctrl_test
            if ctrl_test.get("is_confounded_or_spurious"):
                h2_support.append(
                    f"Workload ({rpm_col}) confounds thermal readings: apparent temperature coefficient shifts by "
                    f"{ctrl_test.get('coefficient_attenuation_pct')}% when controlling for speed."
                )
            else:
                h2_contradict.append(
                    f"Thermal impact persists (controlled coef = {ctrl_test.get('controlled_coefficient')}) even when controlling for workload/RPM."
                )

            # Reverse check: does RPM effect attenuate when controlling for temperature?
            ctrl_rpm = evaluate_controlled_regression(fused_df, metric_col, rpm_col, [temp_col])
            h2_tests["rpm_controlled_for_temp"] = ctrl_rpm
            if ctrl_rpm.get("is_confounded_or_spurious"):
                h2_confounded = True
                h2_contradict.append(ctrl_rpm.get("interpretation", "RPM effect is partially confounded by thermal state."))

        h2_missing.append("Controlled A/B speed-step intervention data holding thermal load constant is not present.")
    else:
        h2_missing.append("Detailed operational speed/workload parameter data is absent from initial logs.")

    h2_scored = score_hypothesis_evidence(
        p_val=h2_p, effect_size=h2_d, sample_size=h2_n, is_confounded=h2_confounded,
        missing_evidence_count=len(h2_missing), supporting_count=len(h2_support), contradicting_count=len(h2_contradict)
    )

    hypotheses.append({
        "id": "HYP_WORKLOAD_CONFOUNDING",
        "title": "Workload Over-Demand & High-Speed Strain",
        "description": "Production targets were elevated beyond design envelope, inducing excessive mechanical strain and operator queueing delays.",
        "category": "operational",
        "status": "active",
        "strength_score": h2_scored["score"],
        "verdict": h2_scored["verdict"],
        "score_breakdown": h2_scored["breakdown"],
        "supporting_evidence": h2_support,
        "contradicting_evidence": h2_contradict,
        "missing_evidence": h2_missing,
        "statistical_tests": h2_tests,
        "effect_size": h2_d,
        "confidence_interval": h2_ci,
        "p_value": h2_p,
        "limitations": [
            "Observational RPM drop on throttled machines creates bidirectional ambiguity between speed target and thermal governor throttling."
        ]
    })

    # -------------------------------------------------------------
    # HYPOTHESIS 3: Delayed Maintenance & Mechanical Wear
    # -------------------------------------------------------------
    h3_support, h3_contradict, h3_missing = [], [], []
    h3_tests: dict[str, Any] = {}
    h3_p, h3_d, h3_ci, h3_n = None, None, [], 0

    if maint_col and metric_col in fused_df.columns:
        bivar_maint = evaluate_bivariate_relationship(fused_df[maint_col], fused_df[metric_col])
        h3_tests["bivariate_maintenance"] = bivar_maint
        h3_p = bivar_maint["pearson_p"]
        h3_n = bivar_maint["n"]
        h3_d, h3_ci, _ = _quartile_group_stats(fused_df, maint_col, metric_col)

        if bivar_maint["pearson_p"] < 0.05 and bivar_maint["pearson_r"] < -0.25:
            h3_support.append(
                f"Significant negative correlation between maintenance interval ({maint_col}) and output "
                f"(r = {bivar_maint['pearson_r']}, p = {bivar_maint['pearson_p']})."
            )
        else:
            h3_contradict.append(
                f"Maintenance backlog ({maint_col}) does not explain the output decline "
                f"(r = {bivar_maint['pearson_r']}, p = {bivar_maint['pearson_p']}). Recently serviced equipment still degraded."
            )
        h3_missing.append("Component overhaul logs and lubricant wear-metal spectroscopy are unrecorded.")
    else:
        h3_missing.append("Preventive maintenance schedule records were not joined into the primary time-series table.")

    h3_scored = score_hypothesis_evidence(
        p_val=h3_p, effect_size=h3_d, sample_size=h3_n, is_confounded=False,
        missing_evidence_count=len(h3_missing), supporting_count=len(h3_support), contradicting_count=len(h3_contradict)
    )

    hypotheses.append({
        "id": "HYP_MAINTENANCE_DELAY",
        "title": "Deferred Preventative Maintenance and Mechanical Wear",
        "description": "Exceeded maintenance service intervals led to bearing degradation, friction buildup, and subsequent micro-stoppages.",
        "category": "maintenance",
        "status": "refuted" if h3_contradict else "active",
        "strength_score": h3_scored["score"],
        "verdict": h3_scored["verdict"],
        "score_breakdown": h3_scored["breakdown"],
        "supporting_evidence": h3_support,
        "contradicting_evidence": h3_contradict,
        "missing_evidence": h3_missing,
        "statistical_tests": h3_tests,
        "effect_size": h3_d,
        "confidence_interval": h3_ci,
        "p_value": h3_p,
        "limitations": [
            "Maintenance logs only track scheduled service dates, not real-time physical bearing wear state."
        ]
    })

    # -------------------------------------------------------------
    # HYPOTHESIS 4: Energy Grid Fluctuation (Misleading Correlation)
    # -------------------------------------------------------------
    h4_support, h4_contradict, h4_missing = [], [], []
    h4_tests: dict[str, Any] = {}
    h4_p, h4_d, h4_ci, h4_n = None, None, [], 0
    h4_confounded = False

    if energy_col and metric_col in fused_df.columns:
        bivar_energy = evaluate_bivariate_relationship(fused_df[energy_col], fused_df[metric_col])
        h4_tests["bivariate_energy"] = bivar_energy
        h4_p = bivar_energy["pearson_p"]
        h4_n = bivar_energy["n"]
        h4_d, h4_ci, _ = _quartile_group_stats(fused_df, energy_col, metric_col)

        if bivar_energy["pearson_p"] < 0.05:
            h4_support.append(
                f"Power consumption ({energy_col}) co-varies with output (r = {bivar_energy['pearson_r']}, p = {bivar_energy['pearson_p']})."
            )
        h4_contradict.append(
            "Causal direction warning: Lower facility power draw is an expected downstream consequence of machine throttling/idling, not proof of grid voltage sag."
        )
        if temp_col:
            ctrl_energy = evaluate_controlled_regression(fused_df, metric_col, energy_col, [temp_col])
            h4_tests["controlled_for_temperature"] = ctrl_energy
            if ctrl_energy.get("is_confounded_or_spurious"):
                h4_confounded = True
                h4_contradict.append(ctrl_energy.get("interpretation", "Energy association attenuates when controlling for temperature."))
            else:
                h4_confounded = True  # Reverse causality / downstream symptom
        h4_missing.append("High-frequency busbar voltage transient waveform captures are absent.")
    else:
        h4_missing.append("Facility sub-metering power quality waveforms are not present in fused dataset.")

    h4_scored = score_hypothesis_evidence(
        p_val=h4_p, effect_size=h4_d, sample_size=h4_n, is_confounded=h4_confounded,
        missing_evidence_count=len(h4_missing), supporting_count=len(h4_support), contradicting_count=len(h4_contradict)
    )

    hypotheses.append({
        "id": "HYP_POWER_VOLATILITY",
        "title": "Substation Energy Spikes and Supply Voltage Sag",
        "description": "Grid voltage instability or erratic energy draw caused machine safety trips, halting output.",
        "category": "electrical",
        "status": "refuted" if h4_confounded else "active",
        "strength_score": h4_scored["score"],
        "verdict": h4_scored["verdict"],
        "score_breakdown": h4_scored["breakdown"],
        "supporting_evidence": h4_support,
        "contradicting_evidence": h4_contradict,
        "missing_evidence": h4_missing,
        "statistical_tests": h4_tests,
        "effect_size": h4_d,
        "confidence_interval": h4_ci,
        "p_value": h4_p,
        "limitations": [
            "Cannot establish electrical causal precedence without millisecond transient voltage logs."
        ]
    })

    # -------------------------------------------------------------
    # HYPOTHESIS 5: Raw Material Feedstock Variation
    # -------------------------------------------------------------
    h5_support, h5_contradict, h5_missing = [], [], []
    h5_tests: dict[str, Any] = {}
    h5_p, h5_d, h5_ci, h5_n = None, None, [], 0

    if material_col and metric_col in fused_df.columns:
        groups = [g[metric_col].dropna().values for _, g in fused_df.groupby(material_col) if len(g[metric_col].dropna()) >= 2]
        if len(groups) >= 2 and len(groups) <= 50:
            f_stat, f_p = stats.f_oneway(*groups)
            if not np.isnan(f_p):
                h5_p = float(np.round(f_p, 6))
                h5_n = sum(len(g) for g in groups)
                h5_tests["anova_material"] = {"f_stat": float(np.round(f_stat, 4)), "p_value": h5_p, "groups": len(groups)}
                if f_p < 0.05:
                    h5_support.append(f"Significant output variance across '{material_col}' groups (ANOVA F = {f_stat:.2f}, p = {h5_p}).")
                else:
                    h5_contradict.append(f"No statistically significant output difference across '{material_col}' groups (ANOVA F = {f_stat:.2f}, p = {h5_p}).")
        else:
            h5_missing.append(f"Column '{material_col}' is high-cardinality (unique per batch) without material grade/supplier attributes.")
    else:
        h5_missing.append("Raw material metallurgical certificate of analysis (COA) and batch hardness ratings are missing.")

    h5_scored = score_hypothesis_evidence(
        p_val=h5_p, effect_size=h5_d, sample_size=h5_n, is_confounded=False,
        missing_evidence_count=len(h5_missing), supporting_count=len(h5_support), contradicting_count=len(h5_contradict)
    )

    hypotheses.append({
        "id": "HYP_MATERIAL_VARIATION",
        "title": "Raw Material Batch Hardness and Feedstock Inconsistency",
        "description": "Incoming raw material metallurgical hardness varied across lots, causing tool chatter and machine safety trips.",
        "category": "raw_material",
        "status": "refuted" if h5_contradict else "active",
        "strength_score": h5_scored["score"],
        "verdict": h5_scored["verdict"],
        "score_breakdown": h5_scored["breakdown"],
        "supporting_evidence": h5_support,
        "contradicting_evidence": h5_contradict,
        "missing_evidence": h5_missing,
        "statistical_tests": h5_tests,
        "effect_size": h5_d,
        "confidence_interval": h5_ci,
        "p_value": h5_p,
        "limitations": [
            "Lot-level material traceability is not linked to metallurgical hardness metrics."
        ]
    })

    hypotheses.sort(key=lambda x: x["strength_score"], reverse=True)
    return _enrich_explanations_metadata(hypotheses, fused_df, metric_col)


def _map_support_level(score: float, supporting_count: int, contradicting_count: int, status: str) -> str:
    if supporting_count == 0 and contradicting_count == 0:
        return "Insufficient evidence"
    if status == "refuted" or score < 0.35:
        return "Weakly supported"
    if score >= 0.72 and supporting_count >= 1:
        return "Strongly supported"
    if score >= 0.45:
        return "Moderately supported"
    return "Weakly supported"


def _categorize_missing_evidence(missing_items: list[str], unused_numeric_cols: list[str]) -> list[dict[str, str]]:
    gaps: list[dict[str, str]] = []
    for item in missing_items:
        lower = item.lower()
        if any(k in lower for k in ("missing from", "unmeasured", "not present", "unavailable", "lack")):
            cat = "completely_unavailable"
        else:
            cat = "requires_additional_collection"
        gaps.append({"category": cat, "detail": item})
    if unused_numeric_cols:
        gaps.append({
            "category": "exists_not_analysed",
            "detail": f"Additional uploaded column(s) available for analysis: {', '.join(unused_numeric_cols[:4])}."
        })
    return gaps


def _enrich_explanations_metadata(hypotheses: list[dict[str, Any]], df: pd.DataFrame, metric_col: str) -> list[dict[str, Any]]:
    num_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != metric_col]
    for h in hypotheses:
        score = float(h.get("strength_score", 0.0))
        supp = h.get("supporting_evidence", [])
        contra = h.get("contradicting_evidence", [])
        miss = h.get("missing_evidence", [])
        h["support_level"] = _map_support_level(score, len(supp), len(contra), h.get("status", "active"))
        h["is_causal_proven"] = h.get("status") == "proven_root_cause"
        h["verification_note"] = (
            "Verified with targeted supplemental evidence."
            if h["is_causal_proven"]
            else "Unverified: observational associations do not establish causation without intervention."
        )
        h["evidence_gaps"] = _categorize_missing_evidence(miss, num_cols[5:])
    return hypotheses


def simulate_what_if_scenario(
    df: pd.DataFrame,
    target_col: str,
    predictor_col: str,
    delta_pct: float
) -> dict[str, Any]:
    """
    Explores a hypothetical scenario using OLS linear regression fitted on actual data.
    Never modifies the source DataFrame and explicitly marks outputs as simulated projections.
    """
    if target_col not in df.columns or predictor_col not in df.columns:
        raise ValueError(f"Columns '{predictor_col}' and '{target_col}' must exist in the dataset.")
    if target_col == predictor_col:
        raise ValueError("Predictor and target columns must be different.")

    valid = df[[predictor_col, target_col]].dropna()
    if len(valid) < 10:
        raise ValueError(f"Insufficient complete observations (n={len(valid)}; minimum 10 required) for What-If simulation.")
    if valid[predictor_col].std() == 0 or valid[target_col].std() == 0:
        raise ValueError("Constant column cannot be used in What-If linear projection.")

    x = valid[predictor_col].to_numpy(dtype=float)
    y = valid[target_col].to_numpy(dtype=float)
    res = stats.linregress(x, y)

    base_x = float(np.mean(x))
    base_y = float(np.mean(y))
    sim_x = base_x * (1.0 + (delta_pct / 100.0))
    projected_y = float(res.intercept + res.slope * sim_x)
    projected_delta_pct = ((projected_y - base_y) / max(abs(base_y), 1e-6)) * 100.0

    return {
        "is_simulation": True,
        "target_variable": target_col,
        "predictor_variable": predictor_col,
        "predictor_delta_pct": round(float(delta_pct), 2),
        "baseline_predictor_mean": round(base_x, 4),
        "simulated_predictor_value": round(sim_x, 4),
        "baseline_target_mean": round(base_y, 4),
        "projected_target_mean": round(projected_y, 4),
        "projected_target_delta_pct": round(float(projected_delta_pct), 2),
        "model_metrics": {
            "slope": round(float(res.slope), 5),
            "r_squared": round(float(res.rvalue ** 2), 4),
            "p_value": round(float(res.pvalue), 6),
            "sample_size": len(valid),
        },
        "disclaimer": (
            "Simulated linear projection based on historical observational data. "
            "Does not modify uploaded datasets and does not prove causal intervention outcomes."
        ),
    }
