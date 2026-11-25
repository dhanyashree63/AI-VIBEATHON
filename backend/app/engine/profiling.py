from typing import Any
import numpy as np
import pandas as pd
from backend.app.core.security import detect_pii, mask_pii

def scan_dataframe_for_pii(df: pd.DataFrame, max_sample_rows: int = 200) -> dict[str, Any]:
    """Scans string/object columns in a DataFrame for PII (emails, phones, SSNs, credit cards)."""
    sample_df = df.head(max_sample_rows)
    pii_columns: dict[str, list[str]] = {}
    total_hits = 0

    for col in sample_df.select_dtypes(include=["object", "string"]).columns:
        joined = " ".join(sample_df[col].dropna().astype(str).tolist())
        if not joined:
            continue
        findings = detect_pii(joined)
        if findings:
            pii_columns[col] = list(findings.keys())
            total_hits += sum(len(v) for v in findings.values())

    return {
        "pii_detected": len(pii_columns) > 0,
        "pii_columns": pii_columns,
        "total_pattern_hits": total_hits
    }

def mask_dataframe_pii(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Detects and masks PII in object/string columns, returning a sanitized copy and report."""
    scan = scan_dataframe_for_pii(df)
    if not scan["pii_detected"]:
        return df, scan

    masked_df = df.copy()
    for col in scan["pii_columns"].keys():
        if col in masked_df.columns:
            masked_df[col] = masked_df[col].apply(
                lambda v: mask_pii(str(v)) if pd.notna(v) else v
            )
    return masked_df, scan

def compute_numeric_distribution_profile(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    """Computes distribution metrics (IQR, skewness, outlier counts) for numeric columns."""
    profiles: dict[str, dict[str, Any]] = {}
    for col in df.select_dtypes(include=[np.number]).columns:
        s = df[col].dropna().astype(float)
        if len(s) == 0:
            continue
        q1 = float(s.quantile(0.25))
        median = float(s.quantile(0.50))
        q3 = float(s.quantile(0.75))
        iqr = q3 - q1
        lower_fence = q1 - 1.5 * iqr
        upper_fence = q3 + 1.5 * iqr
        outliers = int(((s < lower_fence) | (s > upper_fence)).sum())
        skew_val = float(s.skew()) if len(s) >= 3 and s.std() > 0 else 0.0

        profiles[col] = {
            "count": int(len(s)),
            "mean": round(float(s.mean()), 4),
            "std": round(float(s.std()), 4) if len(s) > 1 else 0.0,
            "min": round(float(s.min()), 4),
            "q1": round(q1, 4),
            "median": round(median, 4),
            "q3": round(q3, 4),
            "max": round(float(s.max()), 4),
            "iqr": round(iqr, 4),
            "skewness": round(skew_val, 4),
            "iqr_outlier_count": outliers,
            "iqr_outlier_pct": round((outliers / max(1, len(s))) * 100, 2)
        }
    return profiles

def compute_high_correlations(df: pd.DataFrame, threshold: float = 0.7) -> list[dict[str, Any]]:
    """Identifies highly correlated numeric variable pairs (potential multicollinearity or confounders)."""
    num_df = df.select_dtypes(include=[np.number])
    valid_cols = [c for c in num_df.columns if num_df[c].nunique(dropna=True) > 1]
    if len(valid_cols) < 2:
        return []

    corr_matrix = num_df[valid_cols].corr()
    pairs = []
    for i in range(len(valid_cols)):
        for j in range(i + 1, len(valid_cols)):
            c1, c2 = valid_cols[i], valid_cols[j]
            val = corr_matrix.loc[c1, c2]
            if pd.notna(val) and abs(val) >= threshold:
                pairs.append({
                    "col_a": c1,
                    "col_b": c2,
                    "pearson_r": round(float(val), 4),
                    "strength": "very_high" if abs(val) >= 0.85 else "high"
                })
    pairs.sort(key=lambda x: abs(x["pearson_r"]), reverse=True)
    return pairs
