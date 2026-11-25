import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LinearRegression
from typing import Any

def compute_cohens_d(group1: np.ndarray | pd.Series, group2: np.ndarray | pd.Series) -> float:
    """Calculates Cohen's d effect size between two independent groups."""
    g1 = np.asarray(group1, dtype=float)
    g2 = np.asarray(group2, dtype=float)
    g1 = g1[~np.isnan(g1)]
    g2 = g2[~np.isnan(g2)]
    
    n1, n2 = len(g1), len(g2)
    if n1 < 2 or n2 < 2:
        return 0.0
    
    var1 = np.var(g1, ddof=1)
    var2 = np.var(g2, ddof=1)
    pooled_sd = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
    if pooled_sd == 0:
        return 0.0
    return float(np.round((np.mean(g1) - np.mean(g2)) / pooled_sd, 4))

def compute_mean_difference_ci(group1: np.ndarray | pd.Series, group2: np.ndarray | pd.Series, confidence: float = 0.95) -> list[float]:
    """Computes exact Student's t confidence interval for the difference between two independent means."""
    g1 = np.asarray(group1, dtype=float)
    g2 = np.asarray(group2, dtype=float)
    g1 = g1[~np.isnan(g1)]
    g2 = g2[~np.isnan(g2)]
    
    n1, n2 = len(g1), len(g2)
    if n1 < 2 or n2 < 2:
        return [0.0, 0.0]
    
    mean_diff = np.mean(g1) - np.mean(g2)
    var1 = np.var(g1, ddof=1)
    var2 = np.var(g2, ddof=1)
    
    se_diff = np.sqrt(var1 / n1 + var2 / n2)
    if se_diff == 0:
        return [float(np.round(mean_diff, 4)), float(np.round(mean_diff, 4))]
    
    # Welch-Satterthwaite degrees of freedom
    num = (var1 / n1 + var2 / n2) ** 2
    denom = ((var1 / n1) ** 2 / (n1 - 1)) + ((var2 / n2) ** 2 / (n2 - 1))
    df = num / denom if denom > 0 else (n1 + n2 - 2)
    
    t_crit = stats.t.ppf((1 + confidence) / 2.0, df=df)
    margin = t_crit * se_diff
    
    return [float(np.round(mean_diff - margin, 4)), float(np.round(mean_diff + margin, 4))]

def evaluate_bivariate_relationship(x: pd.Series, y: pd.Series) -> dict[str, Any]:
    """Computes Pearson, Spearman correlations, and linear regression parameters."""
    valid_mask = x.notna() & y.notna()
    x_clean = x[valid_mask].astype(float)
    y_clean = y[valid_mask].astype(float)
    
    n = len(x_clean)
    if n < 5 or x_clean.std() == 0 or y_clean.std() == 0:
        return {
            "n": n,
            "pearson_r": 0.0,
            "pearson_p": 1.0,
            "spearman_rho": 0.0,
            "spearman_p": 1.0,
            "r_squared": 0.0,
            "slope": 0.0,
            "intercept": 0.0
        }
        
    p_r, p_pval = stats.pearsonr(x_clean, y_clean)
    s_rho, s_pval = stats.spearmanr(x_clean, y_clean)
    lin = stats.linregress(x_clean, y_clean)
    
    return {
        "n": n,
        "pearson_r": float(np.round(p_r, 4)),
        "pearson_p": float(np.round(p_pval, 6)),
        "spearman_rho": float(np.round(s_rho, 4)),
        "spearman_p": float(np.round(s_pval, 6)),
        "r_squared": float(np.round(lin.rvalue ** 2, 4)),
        "slope": float(np.round(lin.slope, 4)),
        "intercept": float(np.round(lin.intercept, 4)),
        "stderr": float(np.round(lin.stderr, 4)) if lin.stderr is not None else 0.0
    }

def evaluate_controlled_regression(df: pd.DataFrame, target_col: str, predictor_col: str, confounder_cols: list[str]) -> dict[str, Any]:
    """
    Tests whether the predictor remains significant when controlling for potential confounders.
    Critical for distinguishing true causal signals from spurious correlations.
    """
    all_cols = [target_col, predictor_col] + [c for c in confounder_cols if c in df.columns]
    clean_df = df[all_cols].dropna().astype(float)
    
    n = len(clean_df)
    if n < 10:
        return {"controlled": False, "reason": "Insufficient observations after dropping nulls."}
        
    # Uncontrolled model: target ~ predictor
    X_simple = clean_df[[predictor_col]].values
    y = clean_df[target_col].values
    
    reg_simple = LinearRegression().fit(X_simple, y)
    r2_simple = float(np.round(reg_simple.score(X_simple, y), 4))
    coef_simple = float(np.round(reg_simple.coef_[0], 4))
    
    # Controlled model: target ~ predictor + confounders
    conf_present = [c for c in confounder_cols if c in df.columns]
    X_ctrl = clean_df[[predictor_col] + conf_present].values
    reg_ctrl = LinearRegression().fit(X_ctrl, y)
    r2_ctrl = float(np.round(reg_ctrl.score(X_ctrl, y), 4))
    coef_ctrl = float(np.round(reg_ctrl.coef_[0], 4))
    
    # Check coefficient shift: does the effect size drop dramatically when controlling for confounders?
    drop_pct = 0.0
    if abs(coef_simple) > 1e-5:
        drop_pct = float(np.round(((coef_simple - coef_ctrl) / coef_simple) * 100, 2))
        
    is_confounded = abs(drop_pct) > 50.0 and abs(coef_ctrl) < abs(coef_simple)
    
    return {
        "controlled": True,
        "sample_size": n,
        "confounders_tested": conf_present,
        "uncontrolled_coefficient": coef_simple,
        "uncontrolled_r2": r2_simple,
        "controlled_coefficient": coef_ctrl,
        "controlled_r2": r2_ctrl,
        "coefficient_attenuation_pct": drop_pct,
        "is_confounded_or_spurious": is_confounded,
        "interpretation": (
            f"Controlling for {', '.join(conf_present)} attenuates the apparent effect of '{predictor_col}' by {drop_pct}%. "
            f"{'The relationship appears partially or wholly confounded.' if is_confounded else 'The relationship remains stable after controlling for confounders.'}"
        )
    }

def calculate_evidence_strength(p_val: float, effect_size: float, n: int, is_confounded: bool = False, missing_evidence_count: int = 0) -> tuple[float, str]:
    """
    Computes a transparent 0.0 to 1.0 probability/strength score based on statistical criteria:
    - Statistical significance (p-value < 0.05, 0.01, 0.001)
    - Effect size magnitude (|Cohen's d| or |r| >= 0.5 is large, >= 0.2 is medium)
    - Sample size adequacy
    - Penalties for confounding or major missing measurements
    """
    if np.isnan(p_val) or n < 5:
        return 0.20, "INCONCLUSIVE"
        
    base_score = 0.50
    
    # P-value contribution
    if p_val < 0.001:
        base_score += 0.25
    elif p_val < 0.01:
        base_score += 0.20
    elif p_val < 0.05:
        base_score += 0.10
    else:
        base_score -= 0.25  # Statistically not significant
        
    # Effect size contribution
    abs_d = abs(effect_size)
    if abs_d >= 0.8:  # Large effect
        base_score += 0.15
    elif abs_d >= 0.5:  # Moderate effect
        base_score += 0.10
    elif abs_d < 0.2:  # Negligible effect
        base_score -= 0.10

    # Sample size confidence
    if n >= 50:
        base_score += 0.05
    elif n < 15:
        base_score -= 0.10
        
    # Penalty for confounding
    if is_confounded:
        base_score -= 0.35
        
    # Penalty for missing critical evidence
    if missing_evidence_count > 1:
        base_score -= 0.15
    elif missing_evidence_count == 1:
        base_score -= 0.05

    final_score = float(np.round(np.clip(base_score, 0.05, 0.98), 2))
    
    if is_confounded or p_val > 0.05:
        verdict = "REFUTED_OR_CONFOUNDED" if is_confounded else "WEAK_UNSUPPORTED"
    elif final_score >= 0.75:
        verdict = "STRONG_SUPPORT"
    elif final_score >= 0.55:
        verdict = "MODERATE_SUPPORT"
    else:
        verdict = "INCONCLUSIVE"
        
    return final_score, verdict
