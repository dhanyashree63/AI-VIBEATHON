import numpy as np
from typing import Any

def compute_system_entropy(probabilities: list[float]) -> float:
    """Computes Shannon entropy in bits for hypothesis probability distribution."""
    probs = np.array(probabilities, dtype=float)
    probs = probs[probs > 0]
    if len(probs) <= 1:
        return 0.0
    probs = probs / np.sum(probs)
    return float(-np.sum(probs * np.log2(probs)))

def estimate_required_sample_size(expected_effect_size: float = 0.6, alpha: float = 0.05, power: float = 0.80) -> int:
    """
    Computes required sample size per group for two-sided test using power analysis formula:
    N = 2 * ((z_alpha + z_beta) / effect_size)^2
    """
    z_alpha = 1.96   # alpha = 0.05 (two-sided)
    z_beta = 0.8416  # 80% statistical power
    d = max(0.2, abs(expected_effect_size))
    n_per_group = 2 * ((z_alpha + z_beta) / d) ** 2
    return int(np.ceil(n_per_group))

def _compute_bayesian_info_gain(priors: np.ndarray, target_indices: list[int], diagnostic_sensitivity: float = 0.90) -> tuple[float, float]:
    """
    Transparent mathematical Expected Information Gain (EIG) via Bayes' theorem:
    Models a diagnostic experiment targeting `target_indices` with given sensitivity and specificity.
    Returns (expected_info_gain_bits, uncertainty_reduction_pct).
    """
    prior_entropy = compute_system_entropy(priors.tolist())
    if prior_entropy <= 1e-6 or not target_indices:
        return 0.0, 0.0

    # Likelihood of positive test outcome P(O+ | H_i)
    p_pos_given_h = np.array([
        diagnostic_sensitivity if i in target_indices else (1.0 - diagnostic_sensitivity)
        for i in range(len(priors))
    ])
    p_neg_given_h = 1.0 - p_pos_given_h

    p_pos = float(np.sum(priors * p_pos_given_h))
    p_neg = float(np.sum(priors * p_neg_given_h))

    post_pos = (priors * p_pos_given_h) / max(1e-9, p_pos)
    post_neg = (priors * p_neg_given_h) / max(1e-9, p_neg)

    exp_post_entropy = p_pos * compute_system_entropy(post_pos.tolist()) + p_neg * compute_system_entropy(post_neg.tolist())
    info_gain = max(0.0, prior_entropy - exp_post_entropy)
    uncertainty_reduction_pct = round((info_gain / max(1e-9, prior_entropy)) * 100.0, 1)
    return round(float(info_gain), 3), uncertainty_reduction_pct

def generate_evidence_recommendations(hypotheses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Identifies what additional evidence would most effectively distinguish between competing explanations.
    Uses transparent Bayesian Expected Information Gain (Shannon entropy reduction) and power analysis.
    """
    if not hypotheses:
        return []

    scores = np.array([max(0.05, float(h.get("strength_score", 0.5))) for h in hypotheses])
    priors = scores / np.sum(scores)
    hyp_ids = [h["id"] for h in hypotheses]
    hyp_dict = {h["id"]: h for h in hypotheses}

    recommendations = []

    # 1. Targeted Coolant Flow & Valve Differential Pressure (Thermal vs Workload)
    if "HYP_THERMAL_STRESS" in hyp_dict and "HYP_WORKLOAD_CONFOUNDING" in hyp_dict:
        t_idx = [hyp_ids.index("HYP_THERMAL_STRESS")]
        ig, ur = _compute_bayesian_info_gain(priors, t_idx, diagnostic_sensitivity=0.92)
        n_obs = estimate_required_sample_size(expected_effect_size=0.8) * 2

        recommendations.append({
            "id": "REC_COOLANT_FLOW_MONITORING",
            "title": "Continuous Coolant Flow & Valve Differential Pressure Logging",
            "target_hypotheses": ["HYP_THERMAL_STRESS", "HYP_WORKLOAD_CONFOUNDING"],
            "what_to_collect": "Ultrasonic flow meter readings (liters/min) and valve pressure differential (ΔP in bar) on machine heat exchanger circuits alongside spindle temperatures under comparable workloads.",
            "why_needed": (
                "Surface temperature sensors alone cannot distinguish between excessive heat generation from workload "
                "versus impaired heat rejection caused by a sticking coolant bypass valve."
            ),
            "distinguishing_logic": {
                "outcome_if_thermal_valve_failure": "Coolant flow drops below 12 L/min during peak cycles while manifold pressure spikes, directly proving mechanical restriction.",
                "outcome_if_workload_overdrive": "Coolant flow remains nominal (> 28 L/min) while total BTU thermal dissipation exceeds rated radiator capacity, confirming workload overload."
            },
            "expected_information_gain_bits": ig,
            "expected_uncertainty_reduction_pct": ur,
            "required_sample_size": n_obs,
            "estimated_cost_usd": 1200.0,
            "estimated_duration_days": 2,
            "feasibility_score": 0.95,
            "limitations": [
                "Requires clamp-on ultrasonic flow sensors on coolant supply lines without halting production.",
                "Cost & duration are engineering estimates based on standard non-invasive clamp-on instrumentation."
            ],
            "status": "top_recommendation"
        })

    # 2. Controlled Operating Speed Step-Test (A/B Intervention)
    if "HYP_WORKLOAD_CONFOUNDING" in hyp_dict:
        t_idx = [hyp_ids.index("HYP_WORKLOAD_CONFOUNDING")]
        ig, ur = _compute_bayesian_info_gain(priors, t_idx, diagnostic_sensitivity=0.84)
        n_obs = estimate_required_sample_size(expected_effect_size=0.5) * 2

        recommendations.append({
            "id": "REC_CONTROLLED_SPEED_EXPERIMENT",
            "title": "Controlled Spindle Speed & Batch Size Step-Intervention",
            "target_hypotheses": ["HYP_WORKLOAD_CONFOUNDING", "HYP_THERMAL_STRESS"],
            "what_to_collect": "Controlled A/B test running affected and baseline machines at identical 85% rated RPM for 48 hours while holding part geometry and lubrication constant.",
            "why_needed": (
                "Breaks observational confounding between workload demand and temperature by actively manipulating the speed variable."
            ),
            "distinguishing_logic": {
                "outcome_if_workload_cause": "Output per active hour stabilizes and micro-stops cease, proving the system was pushed beyond its operating envelope.",
                "outcome_if_intrinsic_failure": "Thermal runaway and micro-throttling still occur even at 85% load, confirming an intrinsic hardware fault."
            },
            "expected_information_gain_bits": ig,
            "expected_uncertainty_reduction_pct": ur,
            "required_sample_size": n_obs,
            "estimated_cost_usd": 3500.0,
            "estimated_duration_days": 3,
            "feasibility_score": 0.80,
            "limitations": [
                "Requires plant manager approval to temporarily derate throughput.",
                "Estimated cost reflects opportunity cost of reduced production volume during the 48-hour window."
            ],
            "status": "alternative_recommendation"
        })

    # 3. Vibration Spectral Analysis & Lubricant Tribology
    if "HYP_MAINTENANCE_DELAY" in hyp_dict:
        t_idx = [hyp_ids.index("HYP_MAINTENANCE_DELAY")]
        ig, ur = _compute_bayesian_info_gain(priors, t_idx, diagnostic_sensitivity=0.80)
        n_obs = 16

        recommendations.append({
            "id": "REC_VIBRATION_SPECTRAL_ANALYSIS",
            "title": "Tri-Axial High-Frequency Vibration FFT & Lubricant Spectrometry",
            "target_hypotheses": ["HYP_MAINTENANCE_DELAY", "HYP_THERMAL_STRESS"],
            "what_to_collect": "FFT acceleration spectra (10 Hz - 10 kHz) on spindle bearings and laboratory ICP optical emission spectroscopy of oil samples for wear metals (Fe, Cu, Cr).",
            "why_needed": "Directly detects subsurface bearing spalling, cage fracture, and boundary lubrication failure.",
            "distinguishing_logic": {
                "outcome_if_maintenance_wear": "Prominent peaks at bearing pass frequencies (BPFO/BPFI) and elevated iron particulate (> 45 ppm).",
                "outcome_if_no_wear": "Clean vibration spectra (< 0.2 mm/s RMS) and nominal oil baseline, refuting mechanical bearing failure."
            },
            "expected_information_gain_bits": ig,
            "expected_uncertainty_reduction_pct": ur,
            "required_sample_size": n_obs,
            "estimated_cost_usd": 1800.0,
            "estimated_duration_days": 4,
            "feasibility_score": 0.88,
            "limitations": [
                "External oil laboratory turnaround typically takes 48-72 hours."
            ],
            "status": "alternative_recommendation"
        })

    # Generic fallback for non-manufacturing user-uploaded datasets
    if not recommendations and len(hypotheses) >= 1:
        for i, h in enumerate(hypotheses[:3]):
            ig, ur = _compute_bayesian_info_gain(priors, [i], diagnostic_sensitivity=0.85)
            n_obs = estimate_required_sample_size(expected_effect_size=0.5) * 2
            missing_list = h.get("missing_evidence", [])
            missing_hint = missing_list[0] if missing_list else f"Controlled measurements for '{h['title']}'."
            recommendations.append({
                "id": f"REC_TARGETED_{i + 1}",
                "title": f"Targeted Evidence Collection: {h['title']}",
                "target_hypotheses": [h["id"]],
                "what_to_collect": missing_hint,
                "why_needed": "Evaluates missing evidence and separates true signal from observational confounding.",
                "distinguishing_logic": {
                    "outcome_if_supported": f"Target metric shifts consistently (p < 0.05, N >= {n_obs}) when new observations are added.",
                    "outcome_if_refuted": "Target metric shows no statistically significant response, reducing support for this explanation."
                },
                "expected_information_gain_bits": ig,
                "expected_uncertainty_reduction_pct": ur,
                "required_sample_size": n_obs,
                "estimated_cost_usd": None,
                "estimated_duration_days": None,
                "feasibility_score": round(0.90 - i * 0.08, 2),
                "priority": "high" if i == 0 else "medium",
                "expected_outcome": f"Resolves {ur}% of hypothesis entropy (target N >= {n_obs}).",
                "limitations": [
                    "Collection cost and duration are not provided for custom datasets.",
                    "Observational follow-up reduces uncertainty but only controlled design establishes causation."
                ],
                "status": "top_recommendation" if i == 0 else "alternative_recommendation"
            })

    recommendations.sort(key=lambda x: x["expected_information_gain_bits"], reverse=True)
    for idx, rec in enumerate(recommendations):
        rec.setdefault("priority", "high" if idx == 0 else "medium")
        rec.setdefault(
            "expected_outcome",
            f"Expected uncertainty reduction: {rec.get('expected_uncertainty_reduction_pct', 0)}% "
            f"(+{rec.get('expected_information_gain_bits', 0)} bits)."
        )
    return recommendations
