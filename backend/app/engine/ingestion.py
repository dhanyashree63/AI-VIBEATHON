import os
import re
import csv
import json
from pathlib import Path
from typing import Any
import pandas as pd
import numpy as np
from backend.app.engine.profiling import (
    scan_dataframe_for_pii,
    compute_numeric_distribution_profile,
    compute_high_correlations
)

DATETIME_PATTERNS = [
    r'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}',
    r'^\d{4}/\d{2}/\d{2}',
    r'^\d{2}/\d{2}/\d{4}',
    r'^\d{4}-\d{2}-\d{2}$'
]

ENTITY_KEYWORD_PATTERNS = [
    r'id$', r'_id$', r'code$', r'number$', r'num$', r'machine', r'device', r'sensor',
    r'unit', r'operator', r'batch', r'lot', r'line', r'station', r'part'
]

UNIT_PATTERNS = {
    "temperature": [("celsius", r'(?:°?C|celsius)'), ("fahrenheit", r'(?:°?F|fahrenheit)')],
    "energy": [("kwh", r'kwh'), ("mwh", r'mwh'), ("watts", r'watts?|kw')],
    "weight": [("kg", r'kg|kilogram'), ("lbs", r'lbs?|pound')],
    "pressure": [("psi", r'psi'), ("bar", r'bar'), ("kpa", r'kpa')]
}

def _detect_text_delimiter(sample: str) -> str | None:
    """Detects structured delimiter (comma, tab, semicolon, pipe) from a text sample."""
    lines = [ln for ln in sample.splitlines() if ln.strip()]
    if len(lines) < 2:
        return None
    try:
        dialect = csv.Sniffer().sniff("\n".join(lines[:10]), delimiters=",\t;|")
        delim = dialect.delimiter
        if lines[0].count(delim) >= 1 and lines[1].count(delim) >= 1:
            return delim
    except csv.Error:
        pass
    for delim in ["\t", ",", ";", "|"]:
        c0 = lines[0].count(delim)
        c1 = lines[1].count(delim)
        if c0 >= 1 and c1 == c0:
            return delim
    return None

def load_file_into_dataframe(file_path: str | Path) -> pd.DataFrame:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if path.stat().st_size == 0:
        raise ValueError("Dataset file is empty (0 bytes).")

    ext = path.suffix.lower()
    df: pd.DataFrame

    if ext == ".csv":
        last_err = None
        df = None
        for encoding in ["utf-8-sig", "utf-8", "latin1"]:
            try:
                df = pd.read_csv(file_path, encoding=encoding)
                break
            except UnicodeDecodeError as e:
                last_err = e
                continue
            except Exception as e:
                raise ValueError(f"Failed to parse CSV file: {str(e)}")
        if df is None:
            raise ValueError(f"Unable to decode CSV file: {last_err}")

    elif ext == ".txt":
        raw_text = None
        for encoding in ["utf-8-sig", "utf-8", "latin1"]:
            try:
                raw_text = path.read_text(encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        if not raw_text or not raw_text.strip():
            raise ValueError("TXT file is empty.")

        stripped = raw_text.strip()
        # Check if TXT contains JSON or JSON-lines
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                parsed = json.loads(stripped)
                df = pd.DataFrame(parsed if isinstance(parsed, list) else [parsed])
            except json.JSONDecodeError:
                # Try JSON-lines
                try:
                    df = pd.read_json(file_path, lines=True)
                except Exception:
                    raise ValueError("TXT file starts with JSON syntax but could not be parsed as valid JSON or JSON-lines.")
        else:
            delim = _detect_text_delimiter(raw_text[:8192])
            if not delim:
                raise ValueError(
                    "Unstructured TXT file: could not detect a consistent delimiter (tab, comma, semicolon, or pipe)."
                )
            try:
                df = pd.read_csv(file_path, sep=delim, encoding=encoding)
            except Exception as e:
                raise ValueError(f"Failed to parse structured TXT file: {str(e)}")

    elif ext == ".json":
        try:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                raw = json.load(f)
            if isinstance(raw, list):
                df = pd.DataFrame(raw)
            elif isinstance(raw, dict):
                # Support wrapper keys like {"data": [...]} or {"records": [...]} or columnar dict
                if "data" in raw and isinstance(raw["data"], list):
                    df = pd.DataFrame(raw["data"])
                elif "records" in raw and isinstance(raw["records"], list):
                    df = pd.DataFrame(raw["records"])
                else:
                    df = pd.DataFrame(raw)
            else:
                raise ValueError("JSON root must be an array of records or an object.")
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Failed to parse JSON file: {str(e)}")

    elif ext == ".xlsx":
        try:
            df = pd.read_excel(file_path, engine="openpyxl")
        except Exception as e:
            raise ValueError(f"Corrupted or unreadable Excel (.xlsx) file: {str(e)}")

    else:
        raise ValueError(f"Unsupported dataset format '{ext}'. Supported formats: .csv, .xlsx, .json, .txt.")

    if df.empty or len(df.columns) == 0:
        raise ValueError("Parsed dataset contains no rows or columns.")

    return df

def detect_column_type(series: pd.Series, col_name: str) -> dict[str, Any]:
    non_null = series.dropna()
    total_count = len(series)
    unique_count = non_null.nunique()
    
    # Check for empty series
    if total_count == 0 or len(non_null) == 0:
        return {
            "type": "empty",
            "semantic_type": "unknown",
            "is_identifier": False,
            "is_timestamp": False
        }

    # Timestamp check
    is_timestamp = False
    if pd.api.types.is_datetime64_any_dtype(series):
        is_timestamp = True
    elif series.dtype == "object":
        sample = non_null.astype(str).head(10)
        matches = 0
        for val in sample:
            if any(re.search(pat, val.strip(), re.IGNORECASE) for pat in DATETIME_PATTERNS):
                matches += 1
        if matches >= max(1, int(len(sample) * 0.7)):
            try:
                pd.to_datetime(sample, errors='raise')
                is_timestamp = True
            except Exception:
                pass
    
    if is_timestamp:
        return {
            "type": "datetime",
            "semantic_type": "timestamp",
            "is_identifier": False,
            "is_timestamp": True
        }

    # Identifier check
    is_id = False
    lower_col = col_name.lower()
    if any(re.search(pat, lower_col) for pat in ENTITY_KEYWORD_PATTERNS):
        # Likely identifier or entity key
        is_id = True
    elif unique_count == total_count and total_count > 10 and not pd.api.types.is_float_dtype(series):
        is_id = True

    # Numeric check
    if pd.api.types.is_numeric_dtype(series):
        if is_id:
            semantic = "identifier"
        elif unique_count <= 5 and total_count > 20:
            semantic = "categorical_numeric"
        else:
            semantic = "metric_continuous"
        
        return {
            "type": "integer" if pd.api.types.is_integer_dtype(series) else "float",
            "semantic_type": semantic,
            "is_identifier": is_id,
            "is_timestamp": False
        }

    # Boolean check
    if pd.api.types.is_bool_dtype(series):
        return {
            "type": "boolean",
            "semantic_type": "flag",
            "is_identifier": False,
            "is_timestamp": False
        }

    # Categorical vs Text vs Entity
    if unique_count <= 50 or (unique_count / max(1, total_count)) < 0.2:
        return {
            "type": "category",
            "semantic_type": "entity_id" if is_id else "category",
            "is_identifier": is_id,
            "is_timestamp": False
        }

    return {
        "type": "string",
        "semantic_type": "identifier" if is_id else "free_text",
        "is_identifier": is_id,
        "is_timestamp": False
    }

def detect_unit_inconsistencies(df: pd.DataFrame) -> list[dict[str, Any]]:
    inconsistencies = []
    for col in df.columns:
        lower_col = col.lower()
        # Look for explicit unit hints in column name or string values
        for unit_cat, unit_list in UNIT_PATTERNS.items():
            found_units = []
            for unit_name, pat in unit_list:
                if re.search(pat, lower_col, re.IGNORECASE):
                    found_units.append(unit_name)
            if len(found_units) > 1:
                inconsistencies.append({
                    "column": col,
                    "category": unit_cat,
                    "issue": f"Ambiguous column name referencing multiple conflicting units: {found_units}"
                })
        
        # Check string values for mixed units (e.g., '24 C', '75 F')
        if df[col].dtype == "object":
            sample = df[col].dropna().astype(str).head(100)
            has_c = any(re.search(r'\b\d+(\.\d+)?\s*°?[cC]\b', val) for val in sample)
            has_f = any(re.search(r'\b\d+(\.\d+)?\s*°?[fF]\b', val) for val in sample)
            if has_c and has_f:
                inconsistencies.append({
                    "column": col,
                    "category": "temperature",
                    "issue": "Mixed temperature units detected in values (contains both °C and °F)."
                })
    return inconsistencies

def generate_data_dictionary(df: pd.DataFrame, column_meta: dict[str, Any]) -> list[dict[str, Any]]:
    dictionary = []
    for col in df.columns:
        meta = column_meta.get(col, {})
        non_null_count = int(df[col].count())
        missing_count = int(df[col].isna().sum())
        unique_count = int(df[col].nunique())
        
        sample_vals = [str(x) for x in df[col].dropna().head(3).tolist()]
        
        entry = {
            "name": col,
            "detected_type": meta.get("type", "unknown"),
            "semantic_role": meta.get("semantic_type", "unknown"),
            "is_identifier": meta.get("is_identifier", False),
            "is_timestamp": meta.get("is_timestamp", False),
            "total_count": len(df),
            "valid_count": non_null_count,
            "missing_count": missing_count,
            "missing_pct": round((missing_count / max(1, len(df))) * 100, 2),
            "unique_values": unique_count,
            "sample_values": sample_vals
        }
        
        # Add basic stats for numerics
        if pd.api.types.is_numeric_dtype(df[col]) and non_null_count > 0:
            entry["min"] = float(np.round(df[col].min(), 4)) if not pd.isna(df[col].min()) else None
            entry["max"] = float(np.round(df[col].max(), 4)) if not pd.isna(df[col].max()) else None
            entry["mean"] = float(np.round(df[col].mean(), 4)) if not pd.isna(df[col].mean()) else None
            entry["std"] = float(np.round(df[col].std(), 4)) if not pd.isna(df[col].std()) else None
        
        dictionary.append(entry)
    return dictionary

def compute_quality_score(df: pd.DataFrame, duplicate_count: int, unit_issues: list, column_meta: dict) -> tuple[float, list[str]]:
    warnings = []
    penalties = 0.0
    total_cells = df.shape[0] * max(1, df.shape[1])
    total_missing = int(df.isna().sum().sum())
    missing_pct = (total_missing / max(1, total_cells)) * 100
    
    # Missing value penalty
    if missing_pct > 20:
        penalties += 25.0
        warnings.append(f"High missing values across dataset: {missing_pct:.1f}% of all cells are null.")
    elif missing_pct > 5:
        penalties += 10.0
        warnings.append(f"Moderate missing values: {missing_pct:.1f}% null cells.")
    elif missing_pct > 0:
        penalties += 3.0
        warnings.append(f"Minor missing values: {total_missing} null cells detected.")

    # Duplicate rows penalty
    dup_pct = (duplicate_count / max(1, len(df))) * 100
    if dup_pct > 10:
        penalties += 20.0
        warnings.append(f"Significant duplicate rows detected: {duplicate_count} rows ({dup_pct:.1f}%).")
    elif duplicate_count > 0:
        penalties += 5.0
        warnings.append(f"{duplicate_count} duplicate row(s) identified.")

    # Unit issues penalty
    if unit_issues:
        penalties += 15.0
        for issue in unit_issues:
            warnings.append(f"Unit conflict in '{issue.get('column')}': {issue.get('issue')}")

    # Check for empty or single-value columns
    for col, meta in column_meta.items():
        if df[col].nunique() <= 1 and len(df) >= 3:
            penalties += 4.0
            warnings.append(f"Column '{col}' is constant (zero variance).")

    quality_score = max(5.0, round(100.0 - penalties, 1))
    return quality_score, warnings

def inspect_and_profile_dataset(file_path: str | Path, dataset_name: str) -> dict[str, Any]:
    df = load_file_into_dataframe(file_path)
    row_count, col_count = df.shape
    duplicate_count = int(df.duplicated().sum())
    
    column_meta = {}
    timestamps = []
    entities = []
    
    for col in df.columns:
        c_meta = detect_column_type(df[col], col)
        column_meta[col] = c_meta
        if c_meta["is_timestamp"]:
            timestamps.append(col)
        if c_meta["is_identifier"]:
            entities.append(col)

    unit_issues = detect_unit_inconsistencies(df)
    data_dict = generate_data_dictionary(df, column_meta)
    quality_score, warnings = compute_quality_score(df, duplicate_count, unit_issues, column_meta)
    pii_report = scan_dataframe_for_pii(df)
    if pii_report["pii_detected"]:
        warnings.append(
            f"PII detected in column(s) {', '.join(pii_report['pii_columns'].keys())}. Masking recommended."
        )
    numeric_profiles = compute_numeric_distribution_profile(df)
    high_correlations = compute_high_correlations(df)
    
    return {
        "dataset_name": dataset_name,
        "row_count": row_count,
        "column_count": col_count,
        "duplicate_rows": duplicate_count,
        "quality_score": quality_score,
        "quality_warnings": warnings,
        "timestamps": timestamps,
        "entities": entities,
        "columns_meta": column_meta,
        "data_dictionary": data_dict,
        "unit_inconsistencies": unit_issues,
        "pii_report": pii_report,
        "numeric_profiles": numeric_profiles,
        "high_correlations": high_correlations
    }
