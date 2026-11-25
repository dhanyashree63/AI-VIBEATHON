import json
from pathlib import Path
from typing import Any
import pandas as pd
import numpy as np

def identify_candidate_join_keys(df1: pd.DataFrame, df2: pd.DataFrame, meta1: dict, meta2: dict) -> list[dict[str, Any]]:
    """Identifies potential join keys between two dataframes based on column names, data types, and value overlap."""
    candidates = []
    
    col_meta1 = meta1.get("columns_meta", {})
    col_meta2 = meta2.get("columns_meta", {})
    
    for c1 in df1.columns:
        m1 = col_meta1.get(c1, {})
        c1_clean = c1.lower().replace("_", "").replace(" ", "").replace("-", "")
        
        for c2 in df2.columns:
            m2 = col_meta2.get(c2, {})
            c2_clean = c2.lower().replace("_", "").replace(" ", "").replace("-", "")
            
            # Check for direct name match or normalized name match
            name_match = (c1.lower() == c2.lower()) or (c1_clean == c2_clean)
            
            # Check for semantic entity or timestamp match
            both_ids = m1.get("is_identifier") and m2.get("is_identifier")
            both_time = m1.get("is_timestamp") and m2.get("is_timestamp")
            
            if name_match or both_ids or both_time:
                # Calculate actual value overlap
                s1 = df1[c1].dropna().astype(str).unique()
                s2 = df2[c2].dropna().astype(str).unique()
                
                intersection = set(s1).intersection(set(s2))
                overlap_count = len(intersection)
                
                if overlap_count > 0:
                    coverage_df1 = round((overlap_count / max(1, len(s1))) * 100, 1)
                    coverage_df2 = round((overlap_count / max(1, len(s2))) * 100, 1)
                    
                    candidates.append({
                        "left_key": c1,
                        "right_key": c2,
                        "left_type": m1.get("type"),
                        "right_type": m2.get("type"),
                        "is_timestamp": both_time or ("time" in c1_clean or "date" in c1_clean),
                        "is_entity_id": both_ids or ("id" in c1_clean or "machine" in c1_clean),
                        "shared_distinct_values": overlap_count,
                        "left_coverage_pct": coverage_df1,
                        "right_coverage_pct": coverage_df2,
                        "compatibility_score": round((coverage_df1 + coverage_df2) / 2.0, 1)
                    })
    
    # Sort candidates by compatibility score descending
    candidates.sort(key=lambda x: x["compatibility_score"], reverse=True)
    return candidates

def fuse_datasets(
    datasets_dict: dict[str, pd.DataFrame],
    join_specs: list[dict[str, Any]]
) -> tuple[pd.DataFrame, list[dict[str, Any]], list[str]]:
    """
    Fuses multiple datasets according to explicit join specifications.
    Returns: (fused_dataframe, join_audit_trail, quality_limitations)
    Never silently drops unmatched data without documenting match rates and caveats.
    """
    if not datasets_dict:
        return pd.DataFrame(), [], ["No datasets provided for fusion."]
    
    if len(datasets_dict) == 1:
        name = list(datasets_dict.keys())[0]
        return datasets_dict[name].copy(), [], [f"Single dataset '{name}' used directly without cross-joins."]
    
    audit_trail = []
    limitations = []
    
    # Start with the primary / anchor dataset (e.g. production records or the largest table)
    dataset_names = list(datasets_dict.keys())
    # Sort to prefer production or output tables as base if available
    base_name = next((n for n in dataset_names if "production" in n.lower() or "output" in n.lower()), dataset_names[0])
    
    fused_df = datasets_dict[base_name].copy()
    joined_tables = {base_name}
    
    for spec in join_specs:
        left_name = spec.get("left_dataset")
        right_name = spec.get("right_dataset")
        left_key = spec.get("left_key")
        right_key = spec.get("right_key")
        join_type = spec.get("join_type", "left")  # left, inner, outer
        
        if not (left_name and right_name and left_key and right_key):
            continue
            
        if left_name not in joined_tables and right_name in joined_tables:
            # Swap left and right to attach to current fused df
            left_name, right_name = right_name, left_name
            left_key, right_key = right_key, left_key
        
        if left_name in joined_tables and right_name in datasets_dict and right_name not in joined_tables:
            right_df = datasets_dict[right_name].copy()
            
            # Check if both dataframes have timestamp AND entity identifier
            time_keys = [c for c in ["timestamp", "date", "datetime"] if c in fused_df.columns and c in right_df.columns]
            
            # Determine join keys: use compound key if timestamp and entity both exist
            merge_on_left = [left_key]
            merge_on_right = [right_key]
            if time_keys and left_key not in time_keys:
                merge_on_left.append(time_keys[0])
                merge_on_right.append(time_keys[0])
            
            # Clean string keys
            for lk in merge_on_left:
                fused_df[lk] = fused_df[lk].astype(str).str.strip()
            for rk in merge_on_right:
                right_df[rk] = right_df[rk].astype(str).str.strip()
            
            before_len = len(fused_df)
            merged = pd.merge(
                fused_df,
                right_df,
                left_on=merge_on_left,
                right_on=merge_on_right,
                how=join_type,
                suffixes=("", f"_{right_name}")
            )
            
            # Compute match statistics
            matched_count = merged[merge_on_right[0]].notna().sum()
            match_pct = round((matched_count / max(1, len(fused_df))) * 100, 2)
            
            audit = {
                "step": f"Joined '{left_name}' and '{right_name}'",
                "left_keys": merge_on_left,
                "right_keys": merge_on_right,
                "join_type": join_type,
                "records_before": before_len,
                "records_after": len(merged),
                "match_rate_pct": match_pct,
                "unmatched_records": int(len(fused_df) - matched_count)
            }
            audit_trail.append(audit)
            
            if match_pct < 80.0:
                limitations.append(
                    f"Warning: Low match rate ({match_pct}%) when joining '{right_name}' on {left_key}={right_key}. "
                    f"{audit['unmatched_records']} base records lack corresponding data in '{right_name}'."
                )
            
            fused_df = merged
            joined_tables.add(right_name)

    return fused_df, audit_trail, limitations
