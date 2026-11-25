from typing import Any
import numpy as np

def score_hypothesis_evidence(
    p_val: float | None,
    effect_size: float | None,
    sample_size: int,
    is_confounded: bool = False,
    missing_evidence_count: int = 0,
    supporting_count: int = 0,
    contradicting_count: int = 0
) -> dict[str, Any]:
    """
    Transparent mathematical evidence scoring formula (0.05 to 0.98).
    Returns both the numeric strength score, categorical verdict, and exact component breakdown
    so users can audit how the score was computed.
    """
    if p_val is None or np.isnan(p_val) or sample_size < 5:
        return {
            "score": 0.20,
            "verdict": "INCONCLUSIVE",
            "breakdown": {
                "base": 0.20,
                "reason": "Insufficient sample size or missing statistical test metric."
            }
        }

    base = 0.45
    p_contrib = 0.0
    if p_val < 0.001:
        p_contrib = 0.25
    elif p_val < 0.01:
        p_contrib = 0.20
    elif p_val < 0.05:
        p_contrib = 0.12
    else:
        p_contrib = -0.22

    eff = abs(float(effect_size)) if (effect_size is not None and not np.isnan(effect_size)) else 0.0
    effect_contrib = 0.0
    if eff >= 0.8:
        effect_contrib = 0.18
    elif eff >= 0.5:
        effect_contrib = 0.12
    elif eff >= 0.2:
        effect_contrib = 0.04
    else:
        effect_contrib = -0.08

    sample_contrib = 0.05 if sample_size >= 50 else (-0.08 if sample_size < 15 else 0.0)
    confound_penalty = -0.35 if is_confounded else 0.0
    missing_penalty = -0.12 if missing_evidence_count >= 2 else (-0.05 if missing_evidence_count == 1 else 0.0)
    contradict_penalty = -0.08 * min(3, contradicting_count)
    support_bonus = 0.03 * min(3, supporting_count)

    raw_score = (
        base + p_contrib + effect_contrib + sample_contrib
        + confound_penalty + missing_penalty + contradict_penalty + support_bonus
    )
    final_score = float(np.round(np.clip(raw_score, 0.05, 0.98), 2))

    if is_confounded:
        verdict = "CONFOUNDED_OR_SPURIOUS"
    elif p_val >= 0.05:
        verdict = "WEAK_UNSUPPORTED"
    elif final_score >= 0.78:
        verdict = "STRONG_SUPPORT"
    elif final_score >= 0.55:
        verdict = "MODERATE_SUPPORT"
    else:
        verdict = "INCONCLUSIVE"

    return {
        "score": final_score,
        "verdict": verdict,
        "breakdown": {
            "base": base,
            "p_value_contribution": p_contrib,
            "effect_size_contribution": effect_contrib,
            "sample_size_contribution": sample_contrib,
            "confounding_penalty": confound_penalty,
            "missing_evidence_penalty": missing_penalty,
            "contradiction_penalty": contradict_penalty,
            "support_bonus": support_bonus
        }
    }

def compute_uncertainty_metrics(strength_scores: list[float]) -> dict[str, float]:
    """
    Computes normalized Shannon entropy (0 to 100% uncertainty) across competing hypotheses.
    """
    if not strength_scores or len(strength_scores) <= 1:
        return {"entropy_bits": 0.0, "max_entropy_bits": 0.0, "uncertainty_pct": 0.0}

    arr = np.array([max(0.01, float(s)) for s in strength_scores], dtype=float)
    probs = arr / np.sum(arr)
    entropy = float(-np.sum(probs * np.log2(probs)))
    max_entropy = float(np.log2(len(probs)))
    uncertainty_pct = round((entropy / max(1e-9, max_entropy)) * 100.0, 1)

    return {
        "entropy_bits": round(entropy, 4),
        "max_entropy_bits": round(max_entropy, 4),
        "uncertainty_pct": uncertainty_pct
    }
