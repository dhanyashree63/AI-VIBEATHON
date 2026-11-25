import os
import re
import json
import uuid
import shutil
from pathlib import Path
from typing import Any, Optional
import csv
import io
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
import pandas as pd

from backend.app.core.config import settings
from backend.app.core.security import validate_uploaded_file, validate_file_content, read_upload_streaming, detect_pii, sanitize_filename
from backend.app.core.auth import get_optional_user, enforce_investigation_access
from backend.app.api.routes_auth import router as auth_router
from backend.app.api.routes_system import router as system_router, health_check, get_platform_settings_status
from backend.app.engine.database import (
    SessionLocal,
    get_db,
    User,
    Investigation,
    DatasetRecord,
    AnomalyRecord,
    HypothesisRecord,
    RecommendationRecord,
    HistoryRecord
)
from backend.app.engine.ingestion import inspect_and_profile_dataset, load_file_into_dataframe
from backend.app.engine.profiling import mask_dataframe_pii
from backend.app.engine.data_fusion import identify_candidate_join_keys, fuse_datasets
from backend.app.engine.anomaly_detection import detect_production_anomalies, extract_timeseries_chart_data
from backend.app.engine.discovery_engine import run_autonomous_discovery
from backend.app.engine.hypothesis_generation import generate_competing_explanations, simulate_what_if_scenario
from backend.app.engine.evidence_scoring import compute_uncertainty_metrics
from backend.app.engine.next_best_evidence import generate_evidence_recommendations
from backend.app.engine.budget_optimizer import optimize_investigation_budget
from backend.app.engine.investigation_memory import record_history_event, process_supplemental_evidence
from backend.app.engine.reporting import generate_investigation_report
from backend.app.engine.ai_provider import get_ai_provider, get_ai_provider_status
from backend.app.demo.manufacturing import generate_manufacturing_demo_datasets, DEMO_DIR

router = APIRouter()
router.include_router(auth_router)
router.include_router(system_router)

def _user_or_none(current_user: Any) -> User | None:
    return current_user if isinstance(current_user, User) else None

INV_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,64}$")

class InvestigationUpdatePayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    budget_limit: Optional[float] = None
    time_limit_days: Optional[int] = None

class FindingUpdatePayload(BaseModel):
    marked_for_investigation: bool

class WhatIfPayload(BaseModel):
    target_col: str
    predictor_col: str
    delta_pct: float

def _validate_inv_id(inv_id: str) -> str:
    if not inv_id or not INV_ID_PATTERN.match(inv_id):
        raise HTTPException(status_code=400, detail="Invalid investigation ID format.")
    return inv_id

def _serialize_investigation(inv: Investigation) -> dict[str, Any]:
    """Serializes an Investigation ORM row to a plain JSON-safe dictionary (immune to SQLAlchemy expire_on_commit)."""
    return {
        "id": inv.id,
        "title": inv.title,
        "description": inv.description,
        "status": inv.status or "draft",
        "analysis_stage": inv.analysis_stage or "idle",
        "analysis_error": inv.analysis_error,
        "budget_limit": inv.budget_limit,
        "time_limit_days": inv.time_limit_days,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None
    }

def _compute_real_progress(inv: Investigation) -> dict[str, Any]:
    """Derives investigation progress strictly from persisted database records."""
    has_datasets = len(inv.datasets) > 0
    has_anomalies = len(inv.anomalies) > 0
    has_hypotheses = len(inv.hypotheses) > 0
    has_recommendations = len(inv.recommendations) > 0
    return {
        "data_quality": "completed" if has_datasets else "pending",
        "pattern_discovery": "completed" if has_anomalies else ("running" if inv.analysis_stage == "pattern_discovery" else "pending"),
        "explanation_analysis": "completed" if has_hypotheses else ("running" if inv.analysis_stage == "explanation_analysis" else "pending"),
        "evidence_evaluation": "completed" if has_hypotheses else ("running" if inv.analysis_stage == "evidence_evaluation" else "pending"),
        "next_steps": "completed" if has_recommendations else ("running" if inv.analysis_stage == "recommendations" else "pending"),
        "analysis_stage": inv.analysis_stage or "idle",
        "analysis_error": inv.analysis_error
    }

# -------------------------------------------------------------
# Investigations Management
# -------------------------------------------------------------
@router.post("/investigations")
def create_investigation(
    title: str = Form(...),
    description: str = Form(None),
    budget_limit: float = Form(10000.0),
    time_limit_days: int = Form(14),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_optional_user)
):
    user_obj = _user_or_none(current_user)
    clean_title = (title or "").strip()
    if len(clean_title) < 2:
        raise HTTPException(status_code=400, detail="Investigation name must be at least 2 characters.")
    if len(clean_title) > 200:
        raise HTTPException(status_code=400, detail="Investigation name must be 200 characters or fewer.")
    if budget_limit < 0 or time_limit_days < 1:
        raise HTTPException(status_code=400, detail="Budget and time limit must be positive values.")

    inv_id = f"INV-{uuid.uuid4().hex[:8].upper()}"
    inv = Investigation(
        id=inv_id,
        owner_id=user_obj.id if user_obj else None,
        title=clean_title,
        description=(description or "").strip() or None,
        status="draft",
        analysis_stage="idle",
        budget_limit=budget_limit,
        time_limit_days=time_limit_days
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    record_history_event(
        db=db,
        investigation_id=inv_id,
        event_type="INVESTIGATION_CREATED",
        title="Investigation Created",
        description=f"Investigation '{clean_title}' created in Draft status."
    )
    db.refresh(inv)
    return {"status": "success", "investigation": _serialize_investigation(inv)}

@router.get("/investigations")
def list_investigations(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort_by: str = Query("updated_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_optional_user)
):
    user_obj = _user_or_none(current_user)
    query = db.query(Investigation)
    if user_obj is not None:
        query = query.filter((Investigation.owner_id == user_obj.id) | (Investigation.id == "INV-DEMO-MFG-01"))
    if status and status.lower() != "all":
        query = query.filter(Investigation.status == status.lower())

    sort_col = Investigation.created_at if sort_by == "created_at" else Investigation.updated_at
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    invs = query.all()
    search_lower = (search or "").strip().lower()
    results = []
    for inv in invs:
        if search_lower:
            haystack = f"{inv.id} {inv.title} {inv.description or ''}".lower()
            if search_lower not in haystack:
                continue
        results.append({
            "id": inv.id,
            "title": inv.title,
            "description": inv.description,
            "status": inv.status,
            "analysis_stage": inv.analysis_stage or "idle",
            "analysis_error": inv.analysis_error,
            "dataset_count": len(inv.datasets),
            "anomaly_count": len(inv.anomalies),
            "hypothesis_count": len(inv.hypotheses),
            "recommendation_count": len(inv.recommendations),
            "created_at": inv.created_at,
            "updated_at": inv.updated_at
        })
    return {"investigations": results}

@router.get("/investigations/{inv_id}")
def get_investigation(inv_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_optional_user)):
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    enforce_investigation_access(inv, _user_or_none(current_user))
        
    return {
        "investigation": _serialize_investigation(inv),
        "progress": _compute_real_progress(inv),
        "datasets": [
            {
                "id": d.id,
                "name": d.name,
                "filename": d.filename,
                "format": d.format,
                "row_count": d.row_count,
                "column_count": d.column_count,
                "quality_score": d.quality_score,
                "schema_info": json.loads(d.schema_info or "{}"),
                "profiling_info": json.loads(d.profiling_info or "{}"),
                "is_supplemental": bool(d.is_supplemental),
                "created_at": d.created_at
            }
            for d in inv.datasets
        ],
        "anomalies": [
            {
                "id": a.id,
                "dataset_id": a.dataset_id,
                "title": a.title,
                "metric": a.metric,
                "baseline_value": a.baseline_value,
                "anomaly_value": a.anomaly_value,
                "percentage_change": a.percentage_change,
                "severity": a.severity,
                "priority": getattr(a, "priority", None) or "medium",
                "priority_score": getattr(a, "priority_score", None) or 50.0,
                "p_value": a.p_value,
                "affected_entities": json.loads(a.affected_entities or "[]"),
                "statistical_summary": json.loads(a.statistical_summary or "{}"),
                "finding_payload": json.loads(getattr(a, "finding_payload", None) or "{}"),
                "analysis_version": getattr(a, "analysis_version", None) or 1,
                "marked_for_investigation": bool(getattr(a, "marked_for_investigation", 0)),
                "detected_timestamp": a.detected_timestamp,
                "created_at": a.created_at
            }
            for a in sorted(
                inv.anomalies,
                key=lambda x: getattr(x, "priority_score", None) or 0.0,
                reverse=True
            )
        ],
        "hypotheses": [
            {
                "id": h.id,
                "title": h.title,
                "description": h.description,
                "category": h.category,
                "status": h.status,
                "strength_score": h.strength_score,
                "effect_size": h.effect_size,
                "confidence_interval": json.loads(h.confidence_interval or "[]"),
                "p_value": h.p_value,
                "supporting_evidence": json.loads(h.supporting_evidence or "[]"),
                "contradicting_evidence": json.loads(h.contradicting_evidence or "[]"),
                "missing_evidence": json.loads(h.missing_evidence or "[]"),
                "limitations": json.loads(h.limitations or "[]"),
                "statistical_tests": json.loads(h.statistical_tests or "{}")
            }
            for h in inv.hypotheses
        ],
        "recommendations": [
            {
                "id": r.id,
                "title": r.title,
                "target_hypotheses": json.loads(r.target_hypotheses or "[]"),
                "what_to_collect": r.what_to_collect,
                "why_needed": r.why_needed,
                "distinguishing_logic": r.distinguishing_logic,
                "expected_information_gain_bits": r.expected_information_gain,
                "expected_uncertainty_reduction_pct": r.expected_uncertainty_reduction,
                "required_sample_size": r.required_sample_size,
                "estimated_cost_usd": r.estimated_cost,
                "estimated_duration_days": r.estimated_duration_days,
                "feasibility_score": r.feasibility_score,
                "limitations": json.loads(r.limitations or "[]"),
                "status": r.status
            }
            for r in inv.recommendations
        ],
        "history": [
            {
                "id": h.id,
                "step_number": h.step_number,
                "event_type": h.event_type,
                "title": h.title,
                "description": h.description,
                "snapshot": json.loads(h.snapshot or "{}"),
                "created_at": h.created_at
            }
            for h in sorted(inv.history, key=lambda x: x.step_number)
        ]
    }

@router.patch("/investigations/{inv_id}")
def update_investigation(
    inv_id: str,
    payload: InvestigationUpdatePayload,
    db: Session = Depends(get_db)
):
    """Rename, edit description, or archive/restore an investigation with strict state validation."""
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    changes = []

    if payload.title is not None:
        clean_title = payload.title.strip()
        if len(clean_title) < 2:
            raise HTTPException(status_code=400, detail="Investigation name must be at least 2 characters.")
        if len(clean_title) > 200:
            raise HTTPException(status_code=400, detail="Investigation name must be 200 characters or fewer.")
        if clean_title != inv.title:
            changes.append(f"Renamed from '{inv.title}' to '{clean_title}'")
            inv.title = clean_title

    if payload.description is not None:
        clean_desc = payload.description.strip() or None
        if clean_desc != inv.description:
            changes.append("Updated description")
            inv.description = clean_desc

    if payload.budget_limit is not None:
        if payload.budget_limit < 0:
            raise HTTPException(status_code=400, detail="Budget limit must be non-negative.")
        inv.budget_limit = payload.budget_limit

    if payload.time_limit_days is not None:
        if payload.time_limit_days < 1:
            raise HTTPException(status_code=400, detail="Time limit must be at least 1 day.")
        inv.time_limit_days = payload.time_limit_days

    if payload.status is not None:
        target_status = payload.status.strip().lower()
        if target_status not in {"draft", "ready", "archived", "completed"}:
            raise HTTPException(status_code=400, detail=f"Cannot manually transition status to '{target_status}'.")
        if inv.status == "processing":
            raise HTTPException(status_code=409, detail="Cannot change status while analysis is currently processing.")
        if target_status == "completed" and len(inv.hypotheses) == 0:
            raise HTTPException(status_code=400, detail="Cannot mark completed without actual analysis results.")
        if target_status != inv.status:
            # If restoring from archived, pick the true derived status
            if inv.status == "archived" and target_status != "archived":
                if len(inv.hypotheses) > 0:
                    target_status = "completed"
                elif len(inv.datasets) > 0:
                    target_status = "ready"
                else:
                    target_status = "draft"
            changes.append(f"Status changed from '{inv.status}' to '{target_status}'")
            inv.status = target_status

    db.commit()
    db.refresh(inv)

    if changes:
        record_history_event(
            db=db,
            investigation_id=inv_id,
            event_type="INVESTIGATION_UPDATED",
            title="Investigation Updated",
            description="; ".join(changes)
        )
        db.refresh(inv)

    return {"status": "success", "investigation": _serialize_investigation(inv)}

@router.delete("/investigations/{inv_id}")
def delete_investigation(inv_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_optional_user)):
    """Permanently deletes an investigation, its child DB records, and its uploaded dataset directory."""
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    enforce_investigation_access(inv, _user_or_none(current_user))
    if inv.status == "processing":
        raise HTTPException(status_code=409, detail="Cannot delete an investigation while analysis is running.")

    db.delete(inv)
    db.commit()

    # Clean up storage folder safely (verified child of STORAGE_DIR)
    inv_storage = (settings.STORAGE_DIR / inv_id).resolve()
    if inv_storage.exists() and settings.STORAGE_DIR.resolve() in inv_storage.parents:
        shutil.rmtree(inv_storage, ignore_errors=True)

    return {"status": "success", "deleted_id": inv_id}

@router.post("/investigations/{inv_id}/run-analysis")
def run_full_investigation_analysis(inv_id: str, db: Session = Depends(get_db)):
    """
    Executes the full investigation pipeline (fuse -> discover -> evaluate hypotheses -> recommendations)
    with explicit backend state transitions (ready -> processing -> completed/failed)
    and duplicate-job protection (409 if already processing).
    """
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    if inv.status == "processing":
        raise HTTPException(status_code=409, detail="Analysis is already running for this investigation.")
    if len(inv.datasets) == 0:
        raise HTTPException(status_code=400, detail="Upload at least one dataset before running analysis.")

    # Transition to processing
    inv.status = "processing"
    inv.analysis_stage = "quality_check"
    inv.analysis_error = None
    db.commit()

    try:
        # 1. Fuse datasets if multiple
        if len(inv.datasets) > 1:
            fuse_investigation_datasets(inv_id, db=db)

        # 2. Pattern discovery
        inv.analysis_stage = "pattern_discovery"
        db.commit()
        disc_res = discover_anomalies(inv_id, metric_col=None, db=db)

        # 3. Competing explanations & evidence evaluation
        inv.analysis_stage = "explanation_analysis"
        db.commit()
        hyp_res = evaluate_hypotheses(inv_id, db=db)

        # 4. Next-best-evidence recommendations
        inv.analysis_stage = "recommendations"
        db.commit()
        rec_res = generate_recommendations(inv_id, db=db)

        # Transition to completed
        inv.status = "completed"
        inv.analysis_stage = "completed"
        inv.analysis_error = None
        db.commit()

        return {
            "status": "success",
            "investigation_id": inv_id,
            "investigation_status": inv.status,
            "anomalies_count": len(disc_res.get("anomalies", [])),
            "hypotheses_count": len(hyp_res.get("hypotheses", [])),
            "recommendations_count": len(rec_res.get("recommendations", []))
        }
    except HTTPException:
        db.rollback()
        failed_inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
        if failed_inv:
            failed_inv.status = "failed"
            failed_inv.analysis_stage = "failed"
            db.commit()
        raise
    except Exception as e:
        db.rollback()
        failed_inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
        if failed_inv:
            failed_inv.status = "failed"
            failed_inv.analysis_stage = "failed"
            failed_inv.analysis_error = str(e)
            db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# -------------------------------------------------------------
# Dataset Ingestion & Profiling
# -------------------------------------------------------------
@router.post("/investigations/{inv_id}/datasets/upload")
def upload_dataset(
    inv_id: str,
    file: UploadFile = File(...),
    dataset_name: str = Form(None),
    is_supplemental: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_optional_user)
):
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    enforce_investigation_access(inv, _user_or_none(current_user))

    clean_filename = validate_uploaded_file(file)
    content = read_upload_streaming(file)
    detected_format = validate_file_content(content, clean_filename, getattr(file, "content_type", None))
    name = dataset_name or Path(clean_filename).stem.replace("_", " ").title()

    # Save to disk securely only after content validation passes
    inv_storage = settings.STORAGE_DIR / inv_id
    inv_storage.mkdir(parents=True, exist_ok=True)
    file_path = inv_storage / f"{uuid.uuid4().hex[:6]}_{clean_filename}"

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    # Ingestion & Profiling Pipeline
    try:
        profile_res = inspect_and_profile_dataset(file_path, name)
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=400, detail=f"Failed to parse and profile dataset: {str(e)}")

    dataset_id = f"DS-{uuid.uuid4().hex[:8].upper()}"
    record = DatasetRecord(
        id=dataset_id,
        investigation_id=inv_id,
        name=name,
        filename=clean_filename,
        file_path=str(file_path),
        format=Path(clean_filename).suffix.lstrip(".").lower(),
        row_count=profile_res["row_count"],
        column_count=profile_res["column_count"],
        quality_score=profile_res["quality_score"],
        schema_info=json.dumps(profile_res["columns_meta"]),
        profiling_info=json.dumps(profile_res),
        is_supplemental=1 if is_supplemental else 0
    )
    db.add(record)
    # Transition Draft -> Ready when first dataset arrives
    if inv.status == "draft":
        inv.status = "ready"
        inv.analysis_stage = "quality_check"
    db.commit()
    db.refresh(record)

    # Record history
    record_history_event(
        db=db,
        investigation_id=inv_id,
        event_type="DATASET_INGESTED",
        title=f"Dataset Ingested: {name}",
        description=f"Ingested '{clean_filename}' ({profile_res['row_count']} rows, {profile_res['column_count']} cols). Quality score: {profile_res['quality_score']}%.",
        state_snapshot={"dataset_id": dataset_id, "quality_score": profile_res["quality_score"]}
    )

    # If supplemental evidence was uploaded, trigger Closed-Loop Memory update automatically
    closed_loop_res = None
    if is_supplemental:
        new_df = load_file_into_dataframe(file_path)
        closed_loop_res = process_supplemental_evidence(db, inv_id, record, new_df)

    return {
        "status": "success",
        "dataset_id": dataset_id,
        "profile": profile_res,
        "closed_loop_update": closed_loop_res
    }

@router.get("/investigations/{inv_id}/datasets/{ds_id}/preview")
def preview_dataset(inv_id: str, ds_id: str, limit: int = Query(50), db: Session = Depends(get_db)):
    ds = db.query(DatasetRecord).filter(DatasetRecord.id == ds_id, DatasetRecord.investigation_id == inv_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    df = load_file_into_dataframe(ds.file_path)
    preview_rows = df.head(limit).fillna("").to_dict(orient="records")
    profiling = json.loads(ds.profiling_info or "{}")
    
    return {
        "dataset_id": ds.id,
        "name": ds.name,
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "columns": list(df.columns),
        "preview_rows": preview_rows,
        "profiling": profiling
    }

@router.delete("/investigations/{inv_id}/datasets/{ds_id}")
def delete_dataset(inv_id: str, ds_id: str, db: Session = Depends(get_db)):
    """Removes an uploaded dataset from an investigation and deletes its stored file."""
    _validate_inv_id(inv_id)
    ds = db.query(DatasetRecord).filter(DatasetRecord.id == ds_id, DatasetRecord.investigation_id == inv_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    ds_name = ds.name
    stored_path = Path(ds.file_path).resolve()
    db.delete(ds)
    db.flush()

    # If no datasets remain and no analysis results exist, revert status to draft
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    remaining = db.query(DatasetRecord).filter(DatasetRecord.investigation_id == inv_id).count()
    if inv and remaining == 0 and inv.status == "ready":
        inv.status = "draft"
        inv.analysis_stage = "idle"

    db.commit()

    # Delete stored file safely only if inside STORAGE_DIR (never delete demo source CSVs in DATA_DIR)
    if stored_path.exists() and settings.STORAGE_DIR.resolve() in stored_path.parents:
        try:
            stored_path.unlink()
        except OSError:
            pass

    record_history_event(
        db=db,
        investigation_id=inv_id,
        event_type="DATASET_REMOVED",
        title=f"Dataset Removed: {ds_name}",
        description=f"Removed dataset '{ds_name}' ({ds_id}) from investigation."
    )

    return {"status": "success", "deleted_dataset_id": ds_id}

# -------------------------------------------------------------
# Dataset Connection & Fusion
# -------------------------------------------------------------
@router.post("/investigations/{inv_id}/fuse")
def fuse_investigation_datasets(inv_id: str, db: Session = Depends(get_db)):
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    datasets = db.query(DatasetRecord).filter(DatasetRecord.investigation_id == inv_id).all()
    if not datasets:
        raise HTTPException(status_code=400, detail="No datasets available in this investigation.")

    dfs = {}
    metas = {}
    for d in datasets:
        dfs[d.name] = load_file_into_dataframe(d.file_path)
        metas[d.name] = json.loads(d.profiling_info or "{}")

    # Auto-detect join candidates between all dataset pairs
    join_candidates = []
    names = list(dfs.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            cands = identify_candidate_join_keys(dfs[names[i]], dfs[names[j]], metas[names[i]], metas[names[j]])
            for c in cands:
                join_candidates.append({
                    "left_dataset": names[i],
                    "right_dataset": names[j],
                    **c
                })

    # Pick the best compatible join spec for every dataset pair (sorted by compatibility)
    join_candidates.sort(key=lambda x: x["compatibility_score"], reverse=True)
    connected = []
    seen_pairs = set()
    for cand in join_candidates:
        pair_key = tuple(sorted([cand["left_dataset"], cand["right_dataset"]]))
        if pair_key not in seen_pairs and cand["compatibility_score"] >= 30.0:
            connected.append({**cand, "join_type": "left"})
            seen_pairs.add(pair_key)

    fused_df, audit_trail, limitations = fuse_datasets(dfs, connected)

    # Save fused snapshot for downstream statistical modeling
    fused_path = settings.STORAGE_DIR / inv_id / "fused_dataset.csv"
    fused_df.to_csv(fused_path, index=False)

    record_history_event(
        db=db,
        investigation_id=inv_id,
        event_type="DATASETS_FUSED",
        title="Fragmented Evidence Fused",
        description=f"Fused {len(dfs)} datasets into {len(fused_df)} unified records across {len(fused_df.columns)} dimensions.",
        state_snapshot={"audit_trail": audit_trail, "limitations": limitations}
    )

    return {
        "status": "success",
        "fused_rows": len(fused_df),
        "fused_columns": len(fused_df.columns),
        "columns": list(fused_df.columns),
        "join_candidates": join_candidates,
        "audit_trail": audit_trail,
        "limitations": limitations
    }

# -------------------------------------------------------------
# Autonomous Pattern Discovery (Step 5)
# -------------------------------------------------------------
def _execute_discovery_for_investigation(inv_id: str, db: Session) -> dict[str, Any]:
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    fused_path = settings.STORAGE_DIR / inv_id / "fused_dataset.csv"
    ds = db.query(DatasetRecord).filter(DatasetRecord.investigation_id == inv_id).first()
    if fused_path.exists():
        df = pd.read_csv(fused_path)
        ds_id = ds.id if ds else None
    else:
        if not ds:
            raise HTTPException(status_code=400, detail="No datasets available to inspect.")
        df = load_file_into_dataframe(ds.file_path)
        ds_id = ds.id

    existing_versions = [
        getattr(a, "analysis_version", 1) or 1
        for a in db.query(AnomalyRecord).filter(AnomalyRecord.investigation_id == inv_id).all()
    ]
    next_version = (max(existing_versions) + 1) if existing_versions else 1

    discovery_out = run_autonomous_discovery(
        df,
        dataset_id=ds_id,
        analysis_version=next_version,
    )
    findings = discovery_out["findings"]
    understanding = discovery_out["dataset_understanding"]
    interpretation = get_ai_provider().interpret_discovery_findings(understanding, findings)

    # Clear prior findings for this investigation to prevent duplicates while advancing version
    db.query(AnomalyRecord).filter(AnomalyRecord.investigation_id == inv_id).delete()

    saved_records = []
    for f in findings:
        rec = AnomalyRecord(
            id=f"{inv_id}__{f['id']}",
            investigation_id=inv_id,
            dataset_id=ds_id,
            title=f["title"],
            metric=f["metric"],
            baseline_value=f["baseline_value"],
            anomaly_value=f["anomaly_value"],
            percentage_change=f["percentage_change"],
            detected_timestamp=str(f["detected_timestamp"]),
            affected_entities=json.dumps(f.get("affected_entities", [])),
            severity=f["severity"],
            priority=f["priority"],
            priority_score=f["priority_score"],
            p_value=f["p_value"],
            statistical_summary=json.dumps(f.get("measured_values", {})),
            finding_payload=json.dumps({
                **f,
                "dataset_understanding": understanding,
                "interpretation": interpretation,
                "performance": discovery_out["performance"],
                "prioritisation_formula": discovery_out["prioritisation_formula"],
            }),
            analysis_version=next_version,
            marked_for_investigation=0,
        )
        db.add(rec)
        saved_records.append(rec)

    db.commit()

    if saved_records:
        top_anom = saved_records[0]
        record_history_event(
            db=db,
            investigation_id=inv_id,
            event_type="ANOMALY_DISCOVERED",
            title=f"Discovery Scan v{next_version}: {len(saved_records)} Unusual Pattern(s)",
            description=(
                f"{interpretation.get('overview_interpretation', '')} "
                f"(Runtime: {discovery_out['performance']['runtime_ms']} ms, "
                f"Peak memory: {discovery_out['performance']['peak_memory_mb']} MB)."
            ),
            state_snapshot={
                "anomaly_id": top_anom.id,
                "analysis_version": next_version,
                "summary": discovery_out["summary"],
                "performance": discovery_out["performance"],
            }
        )

    return {
        "status": "success",
        "analysis_version": next_version,
        "anomalies": findings,
        "findings": findings,
        "summary": discovery_out["summary"],
        "dataset_understanding": understanding,
        "interpretation": interpretation,
        "prioritisation_formula": discovery_out["prioritisation_formula"],
        "performance": discovery_out["performance"],
    }


def _run_discovery_background(inv_id: str) -> None:
    db = SessionLocal()
    try:
        _execute_discovery_for_investigation(inv_id, db)
        inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
        if inv:
            inv.status = "completed" if len(inv.hypotheses) > 0 else "ready"
            inv.analysis_stage = "completed" if len(inv.hypotheses) > 0 else "pattern_discovery"
            inv.analysis_error = None
            db.commit()
    except Exception as exc:
        db.rollback()
        inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
        if inv:
            inv.status = "failed"
            inv.analysis_stage = "failed"
            inv.analysis_error = str(exc)
            db.commit()
    finally:
        db.close()


@router.post("/investigations/{inv_id}/discover")
def discover_anomalies(
    inv_id: str,
    metric_col: str = Form(None),
    background: bool = Form(False),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    if len(inv.datasets) == 0:
        raise HTTPException(status_code=400, detail="No datasets available to inspect.")

    if background and background_tasks is not None:
        if inv.status == "processing":
            raise HTTPException(status_code=409, detail="Discovery scan is already running for this investigation.")
        inv.status = "processing"
        inv.analysis_stage = "pattern_discovery"
        inv.analysis_error = None
        db.commit()
        background_tasks.add_task(_run_discovery_background, inv_id)
        return {"status": "processing", "investigation_id": inv_id}

    return _execute_discovery_for_investigation(inv_id, db)


@router.patch("/investigations/{inv_id}/findings/{finding_id}")
def update_finding_status(
    inv_id: str,
    finding_id: str,
    payload: FindingUpdatePayload,
    db: Session = Depends(get_db)
):
    """Marks or unmarks an unusual pattern for further investigation."""
    _validate_inv_id(inv_id)
    rec = db.query(AnomalyRecord).filter(
        AnomalyRecord.id == finding_id,
        AnomalyRecord.investigation_id == inv_id
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Finding not found")

    rec.marked_for_investigation = 1 if payload.marked_for_investigation else 0
    db.commit()
    return {
        "status": "success",
        "finding_id": rec.id,
        "marked_for_investigation": bool(rec.marked_for_investigation),
    }

# -------------------------------------------------------------
# Competing Explanations Engine
# -------------------------------------------------------------
@router.post("/investigations/{inv_id}/hypotheses/evaluate")
def evaluate_hypotheses(inv_id: str, db: Session = Depends(get_db)):
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    top_anomaly = db.query(AnomalyRecord).filter(AnomalyRecord.investigation_id == inv_id).first()
    anom_dict = {
        "metric": top_anomaly.metric if top_anomaly else "output_units",
        "title": top_anomaly.title if top_anomaly else "Unexplained Output Shift"
    }

    fused_path = settings.STORAGE_DIR / inv_id / "fused_dataset.csv"
    if fused_path.exists():
        df = pd.read_csv(fused_path)
    else:
        ds = db.query(DatasetRecord).filter(DatasetRecord.investigation_id == inv_id).first()
        if not ds:
            raise HTTPException(status_code=400, detail="No datasets available.")
        df = load_file_into_dataframe(ds.file_path)

    hypotheses = generate_competing_explanations(df, anom_dict)

    # Persist hypotheses with investigation-scoped primary keys
    db.query(HypothesisRecord).filter(HypothesisRecord.investigation_id == inv_id).delete()
    for h in hypotheses:
        scoped_hid = f"{inv_id}__{h['id']}"
        rec = HypothesisRecord(
            id=scoped_hid,
            investigation_id=inv_id,
            anomaly_id=top_anomaly.id if top_anomaly else None,
            title=h["title"],
            description=h["description"],
            category=h["category"],
            status=h["status"],
            strength_score=h["strength_score"],
            supporting_evidence=json.dumps(h["supporting_evidence"]),
            contradicting_evidence=json.dumps(h["contradicting_evidence"]),
            missing_evidence=json.dumps(h["missing_evidence"]),
            statistical_tests=json.dumps(h["statistical_tests"]),
            effect_size=h.get("effect_size"),
            confidence_interval=json.dumps(h.get("confidence_interval", [])),
            p_value=h.get("p_value"),
            limitations=json.dumps(h.get("limitations", []))
        )
        db.add(rec)
    db.commit()

    record_history_event(
        db=db,
        investigation_id=inv_id,
        event_type="HYPOTHESES_EVALUATED",
        title="Competing Explanations Formulated & Tested",
        description=f"Generated and statistically evaluated {len(hypotheses)} competing causal hypotheses using SciPy and scikit-learn.",
        state_snapshot={"hypotheses_count": len(hypotheses), "lead_hypothesis": hypotheses[0]["title"] if hypotheses else None}
    )

    return {"status": "success", "hypotheses": hypotheses}

# -------------------------------------------------------------
# Next-Best-Evidence Engine & Budget Optimization
# -------------------------------------------------------------
@router.post("/investigations/{inv_id}/recommendations/generate")
def generate_recommendations(inv_id: str, db: Session = Depends(get_db)):
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    hypotheses_records = db.query(HypothesisRecord).filter(HypothesisRecord.investigation_id == inv_id).all()
    hypotheses = [
        {
            "id": h.id.split("__", 1)[-1],
            "title": h.title,
            "strength_score": h.strength_score,
            "category": h.category
        }
        for h in hypotheses_records
    ]

    recs = generate_evidence_recommendations(hypotheses)

    db.query(RecommendationRecord).filter(RecommendationRecord.investigation_id == inv_id).delete()
    for r in recs:
        scoped_rid = f"{inv_id}__{r['id']}"
        rec = RecommendationRecord(
            id=scoped_rid,
            investigation_id=inv_id,
            title=r["title"],
            target_hypotheses=json.dumps(r["target_hypotheses"]),
            what_to_collect=r["what_to_collect"],
            why_needed=r["why_needed"],
            distinguishing_logic=json.dumps(r["distinguishing_logic"]),
            expected_information_gain=r["expected_information_gain_bits"],
            expected_uncertainty_reduction=r["expected_uncertainty_reduction_pct"],
            required_sample_size=r["required_sample_size"],
            estimated_cost=r["estimated_cost_usd"],
            estimated_duration_days=r["estimated_duration_days"],
            feasibility_score=r["feasibility_score"],
            limitations=json.dumps(r["limitations"]),
            status=r["status"]
        )
        db.add(rec)
    db.commit()

    if recs:
        top = recs[0]
        cost_str = f"${top['estimated_cost_usd']:,.2f}" if top.get("estimated_cost_usd") is not None else "Cost not provided"
        dur_str = f"{top['estimated_duration_days']} days" if top.get("estimated_duration_days") is not None else "Duration not provided"
        record_history_event(
            db=db,
            investigation_id=inv_id,
            event_type="RECOMMENDATION_FORMULATED",
            title=f"Next-Best Evidence Recommended: {top['title']}",
            description=(
                f"Formulated optimal next investigation: '{top['title']}'. "
                f"Expected Info Gain: {top['expected_information_gain_bits']} bits ({top['expected_uncertainty_reduction_pct']}% uncertainty reduction). "
                f"{cost_str}, {dur_str}."
            ),
            state_snapshot={"recommendation_id": top["id"], "info_gain": top["expected_information_gain_bits"]}
        )

    return {"status": "success", "recommendations": recs}


@router.post("/investigations/{inv_id}/what-if")
def run_what_if_simulation(inv_id: str, payload: WhatIfPayload, db: Session = Depends(get_db)):
    """Runs a non-destructive linear What-If projection on the investigation's dataset."""
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    fused_path = settings.STORAGE_DIR / inv_id / "fused_dataset.csv"
    if fused_path.exists():
        df = pd.read_csv(fused_path)
    else:
        ds = db.query(DatasetRecord).filter(DatasetRecord.investigation_id == inv_id).first()
        if not ds:
            raise HTTPException(status_code=400, detail="No datasets available for What-If simulation.")
        df = load_file_into_dataframe(ds.file_path)

    try:
        result = simulate_what_if_scenario(df, payload.target_col, payload.predictor_col, payload.delta_pct)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"status": "success", "simulation": result}

@router.post("/investigations/{inv_id}/budget/optimize")
def optimize_budget(
    inv_id: str,
    max_budget: float = Form(5000.0),
    max_days: int = Form(7),
    max_observations: int = Form(500),
    max_parallel_experiments: int = Form(3),
    db: Session = Depends(get_db)
):
    recs_records = db.query(RecommendationRecord).filter(RecommendationRecord.investigation_id == inv_id).all()
    recs = [
        {
            "id": r.id,
            "title": r.title,
            "expected_information_gain_bits": r.expected_information_gain,
            "expected_uncertainty_reduction_pct": r.expected_uncertainty_reduction,
            "required_sample_size": r.required_sample_size,
            "estimated_cost_usd": r.estimated_cost,
            "estimated_duration_days": r.estimated_duration_days,
            "feasibility_score": r.feasibility_score
        }
        for r in recs_records
    ]

    optimization_result = optimize_investigation_budget(
        recs,
        max_budget_usd=max_budget,
        max_time_days=max_days,
        max_observations=max_observations,
        max_parallel_experiments=max_parallel_experiments
    )
    return {"status": "success", "optimization": optimization_result}


@router.get("/investigations/{inv_id}/charts")
def get_investigation_charts(inv_id: str, db: Session = Depends(get_db)):
    """Returns real computed chart series (time-series, per-entity degradation, uncertainty, narrative)."""
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    fused_path = settings.STORAGE_DIR / inv_id / "fused_dataset.csv"
    df = pd.DataFrame()
    if fused_path.exists():
        df = pd.read_csv(fused_path)
    elif inv.datasets:
        df = load_file_into_dataframe(inv.datasets[0].file_path)

    top_anom = inv.anomalies[0] if inv.anomalies else None
    metric_col = top_anom.metric if top_anom else None
    ts_data = extract_timeseries_chart_data(df, metric_col=metric_col) if not df.empty else {"daily_series": [], "entities": [], "metric": None}

    hyps = sorted(inv.hypotheses, key=lambda h: h.strength_score or 0.0, reverse=True)
    uncertainty = compute_uncertainty_metrics([h.strength_score or 0.1 for h in hyps])

    provider = get_ai_provider()
    narrative = provider.explain_findings({
        "anomaly": {
            "metric": top_anom.metric,
            "percentage_change": top_anom.percentage_change,
            "p_value": top_anom.p_value
        } if top_anom else {},
        "hypotheses": [
            {"title": h.title, "strength_score": h.strength_score, "effect_size": h.effect_size or 0.0}
            for h in hyps
        ],
        "top_recommendation": {
            "title": inv.recommendations[0].title,
            "expected_information_gain_bits": inv.recommendations[0].expected_information_gain
        } if inv.recommendations else {}
    })

    return {
        "timeseries": ts_data,
        "uncertainty": uncertainty,
        "narrative": narrative,
        "ai_provider": provider.provider_name,
        "is_simulated": inv_id == "INV-DEMO-MFG-01"
    }

# -------------------------------------------------------------
# Closed-Loop Supplemental Evidence & Memory
# -------------------------------------------------------------
@router.post("/investigations/{inv_id}/evidence/supplement")
def ingest_supplemental_evidence(
    inv_id: str,
    file: UploadFile = File(...),
    dataset_name: str = Form("Targeted Coolant Flow & Valve Pressure Evidence"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_optional_user)
):
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    enforce_investigation_access(inv, _user_or_none(current_user))

    clean_filename = validate_uploaded_file(file)
    content = read_upload_streaming(file)
    validate_file_content(content, clean_filename, getattr(file, "content_type", None))

    inv_storage = settings.STORAGE_DIR / inv_id
    inv_storage.mkdir(parents=True, exist_ok=True)
    file_path = inv_storage / f"supplemental_{clean_filename}"

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    try:
        profile_res = inspect_and_profile_dataset(file_path, dataset_name)
        new_df = load_file_into_dataframe(file_path)
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=400, detail=f"Failed to parse supplemental dataset: {str(e)}")

    record = DatasetRecord(
        id=f"DS-SUPP-{uuid.uuid4().hex[:6].upper()}",
        investigation_id=inv_id,
        name=dataset_name,
        filename=clean_filename,
        file_path=str(file_path),
        format=Path(clean_filename).suffix.lstrip(".").lower(),
        row_count=profile_res["row_count"],
        column_count=profile_res["column_count"],
        quality_score=profile_res["quality_score"],
        schema_info=json.dumps(profile_res["columns_meta"]),
        profiling_info=json.dumps(profile_res),
        is_supplemental=1
    )
    db.add(record)
    # Transition Draft -> Ready when first dataset arrives
    if inv.status == "draft":
        inv.status = "ready"
        inv.analysis_stage = "quality_check"
    db.commit()
    db.refresh(record)

    update_result = process_supplemental_evidence(db, inv_id, record, new_df)
    return {"status": "success", "closed_loop_update": update_result}

# -------------------------------------------------------------
# Reports & Audit History
# -------------------------------------------------------------
@router.get("/investigations/{inv_id}/report")
def get_report(inv_id: str, format: str = "json", db: Session = Depends(get_db), current_user: Any = Depends(get_optional_user)):
    _validate_inv_id(inv_id)
    inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    enforce_investigation_access(inv, _user_or_none(current_user))
    report = generate_investigation_report(db, inv_id)
    if "error" in report:
        raise HTTPException(status_code=404, detail=report["error"])

    if format.lower() == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Finding_ID", "Title", "Priority", "Priority_Score", "Metric",
            "Baseline_Value", "Observed_Value", "Change_Pct", "P_Value", "Timestamp"
        ])
        for a in report.get("anomalies_discovered", []):
            writer.writerow([
                a.get("id"),
                a.get("title"),
                a.get("priority"),
                a.get("priority_score"),
                a.get("metric"),
                a.get("baseline_value"),
                a.get("anomaly_value"),
                a.get("percentage_change"),
                a.get("p_value"),
                a.get("detected_timestamp"),
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=REVERSE_AI_FINDINGS_{inv_id}.csv"},
        )

    return report

# -------------------------------------------------------------
# Hackathon Demonstration Mode
# -------------------------------------------------------------
@router.post("/demo/load-manufacturing")
def load_manufacturing_demo(db: Session = Depends(get_db)):
    """
    Sets up the complete end-to-end manufacturing demonstration scenario:
    1. Generates realistic synthetic datasets with planted operational defect.
    2. Creates an investigation record.
    3. Ingests and profiles the 5 core datasets.
    4. Automatically fuses them.
    5. Discovers the ~18.5% output decline anomaly.
    6. Formulates competing explanations with statistical testing.
    7. Formulates Next-Best-Evidence recommendations with Expected Information Gain.
    Ready for immediate interactive walkthrough!
    """
    demo_files = generate_manufacturing_demo_datasets(force_regenerate=True)

    demo_id = "INV-DEMO-MFG-01"
    # Clean prior demo run if exists
    existing = db.query(Investigation).filter(Investigation.id == demo_id).first()
    if existing:
        db.delete(existing)
        db.commit()

    inv = Investigation(
        id=demo_id,
        title="Autonomous Investigation: Plant-Wide Production Output Decline",
        description=(
            "Investigation into an unexplained ~18.5% drop in manufacturing output. "
            "Fragmented evidence from machine telemetry, maintenance records, temperature sensors, "
            "and electrical power feeds are fused to isolate root causes."
        ),
        budget_limit=8000.0,
        time_limit_days=10
    )
    db.add(inv)
    db.commit()

    # Core initial datasets to ingest
    initial_ds_keys = ["production_records", "machine_logs", "temperature_readings", "maintenance_history", "energy_consumption"]
    loaded_records = {}

    for k in initial_ds_keys:
        p = demo_files[k]
        name = k.replace("_", " ").title()
        profile_res = inspect_and_profile_dataset(p, name)
        rec = DatasetRecord(
            id=f"DS-{k.upper()[:10]}",
            investigation_id=demo_id,
            name=name,
            filename=p.name,
            file_path=str(p),
            format="csv",
            row_count=profile_res["row_count"],
            column_count=profile_res["column_count"],
            quality_score=profile_res["quality_score"],
            schema_info=json.dumps(profile_res["columns_meta"]),
            profiling_info=json.dumps(profile_res),
            is_supplemental=0
        )
        db.add(rec)
        loaded_records[k] = rec
    db.commit()

    record_history_event(
        db=db,
        investigation_id=demo_id,
        event_type="DEMO_INITIALIZED",
        title="Manufacturing Demonstration Initialized",
        description="Ingested 5 fragmented operational datasets comprising 1,600+ multi-variate observations across 4 production machines."
    )

    # 1. Fuse all 5 fragmented datasets
    dfs = {name: load_file_into_dataframe(demo_files[k]) for k, name in [
        ("production_records", "Production Records"),
        ("machine_logs", "Machine Logs"),
        ("temperature_readings", "Temperature Readings"),
        ("maintenance_history", "Maintenance History"),
        ("energy_consumption", "Energy Consumption")
    ]}
    
    # Define explicit multi-source join chain across all 5 tables
    join_specs = [
        {"left_dataset": "Production Records", "right_dataset": "Machine Logs", "left_key": "machine_id", "right_key": "machine_id", "join_type": "left"},
        {"left_dataset": "Production Records", "right_dataset": "Temperature Readings", "left_key": "machine_id", "right_key": "machine_id", "join_type": "left"},
        {"left_dataset": "Production Records", "right_dataset": "Maintenance History", "left_key": "machine_id", "right_key": "machine_id", "join_type": "left"},
        {"left_dataset": "Production Records", "right_dataset": "Energy Consumption", "left_key": "timestamp", "right_key": "timestamp", "join_type": "left"}
    ]
    fused_df, audit, limits = fuse_datasets(dfs, join_specs)
    
    demo_storage = settings.STORAGE_DIR / demo_id
    demo_storage.mkdir(parents=True, exist_ok=True)
    fused_path = demo_storage / "fused_dataset.csv"
    fused_df.to_csv(fused_path, index=False)

    record_history_event(
        db=db,
        investigation_id=demo_id,
        event_type="DATASETS_FUSED",
        title="Multi-Source Data Fusion Complete",
        description=f"Fused telemetry, production quotas, and temperature series into {len(fused_df)} unified records.",
        state_snapshot={"audit": audit, "limitations": limits}
    )

    # 2. Anomaly Discovery
    anomalies = detect_production_anomalies(fused_df, metric_col="output_units")
    top_anom = None
    for a in anomalies:
        anom_rec = AnomalyRecord(
            id=f"ANOM-{uuid.uuid4().hex[:6].upper()}",
            investigation_id=demo_id,
            title=a["title"],
            metric=a["metric"],
            baseline_value=a["baseline_value"],
            anomaly_value=a["anomaly_value"],
            percentage_change=a["percentage_change"],
            detected_timestamp=str(a["detected_timestamp"]),
            affected_entities=json.dumps(a["affected_entities"]),
            severity=a["severity"],
            p_value=a["p_value"],
            statistical_summary=json.dumps(a["statistical_summary"])
        )
        db.add(anom_rec)
        if not top_anom:
            top_anom = anom_rec
    db.commit()

    if top_anom:
        record_history_event(
            db=db,
            investigation_id=demo_id,
            event_type="ANOMALY_DISCOVERED",
            title=f"Discovered: {top_anom.title}",
            description=f"Detected statistically verified shift in production output (p = {top_anom.p_value:.6f}, {top_anom.percentage_change:+.1f}% drop on Machine M-03)."
        )

    # 3. Competing Explanations
    anom_dict = {"metric": "output_units", "title": top_anom.title if top_anom else "Output Drop"}
    hypotheses = generate_competing_explanations(fused_df, anom_dict)
    for h in hypotheses:
        h_rec = HypothesisRecord(
            id=f"{demo_id}__{h['id']}",
            investigation_id=demo_id,
            anomaly_id=top_anom.id if top_anom else None,
            title=h["title"],
            description=h["description"],
            category=h["category"],
            status=h["status"],
            strength_score=h["strength_score"],
            supporting_evidence=json.dumps(h["supporting_evidence"]),
            contradicting_evidence=json.dumps(h["contradicting_evidence"]),
            missing_evidence=json.dumps(h["missing_evidence"]),
            statistical_tests=json.dumps(h["statistical_tests"]),
            effect_size=h.get("effect_size"),
            confidence_interval=json.dumps(h.get("confidence_interval", [])),
            p_value=h.get("p_value"),
            limitations=json.dumps(h.get("limitations", []))
        )
        db.add(h_rec)
    db.commit()

    # 4. Next-Best-Evidence Recommendations
    recs = generate_evidence_recommendations(hypotheses)
    for r in recs:
        r_rec = RecommendationRecord(
            id=f"{demo_id}__{r['id']}",
            investigation_id=demo_id,
            title=r["title"],
            target_hypotheses=json.dumps(r["target_hypotheses"]),
            what_to_collect=r["what_to_collect"],
            why_needed=r["why_needed"],
            distinguishing_logic=json.dumps(r["distinguishing_logic"]),
            expected_information_gain=r["expected_information_gain_bits"],
            expected_uncertainty_reduction=r["expected_uncertainty_reduction_pct"],
            required_sample_size=r["required_sample_size"],
            estimated_cost=r["estimated_cost_usd"],
            estimated_duration_days=r["estimated_duration_days"],
            feasibility_score=r["feasibility_score"],
            limitations=json.dumps(r["limitations"]),
            status=r["status"]
        )
        db.add(r_rec)
    inv.status = "completed"
    inv.analysis_stage = "completed"
    db.commit()

    record_history_event(
        db=db,
        investigation_id=demo_id,
        event_type="RECOMMENDATION_FORMULATED",
        title="Next-Best Evidence Identified",
        description=f"Recommended targeted coolant flow telemetry to distinguish thermal valve defect from workload confounding (Expected Info Gain: {recs[0]['expected_information_gain_bits']} bits)."
    )

    return {
        "status": "success",
        "demo_investigation_id": demo_id,
        "is_simulated": True,
        "simulation_disclosure": "Demo Mode uses synthetic manufacturing datasets with planted patterns; all statistical tests and discoveries are computed live.",
        "datasets_loaded": len(initial_ds_keys),
        "fused_records": len(fused_df),
        "anomalies_detected": len(anomalies),
        "hypotheses_evaluated": len(hypotheses),
        "recommendations_formulated": len(recs),
        "message": "Simulated manufacturing demo loaded successfully. All statistical tests were computed live."
    }

@router.post("/demo/execute-next-step")
def execute_demo_next_step(db: Session = Depends(get_db)):
    """
    Executes the Next-Best-Evidence recommendation in Demo Mode:
    Ingests the simulated targeted coolant flow dataset, runs closed-loop statistical re-evaluation,
    and updates conclusions without rewriting history.
    """
    demo_id = "INV-DEMO-MFG-01"
    inv = db.query(Investigation).filter(Investigation.id == demo_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Demo scenario not initialized. Please load demo first.")

    coolant_file = DEMO_DIR / "targeted_coolant_flow_and_temp.csv"
    if not coolant_file.exists():
        generate_manufacturing_demo_datasets(force_regenerate=True)

    profile_res = inspect_and_profile_dataset(coolant_file, "Targeted Coolant Flow & Valve Pressure Evidence (Simulated)")
    new_df = load_file_into_dataframe(coolant_file)

    record = db.query(DatasetRecord).filter(DatasetRecord.id == "DS-COOLANT-SUPP", DatasetRecord.investigation_id == demo_id).first()
    if not record:
        record = DatasetRecord(
            id="DS-COOLANT-SUPP",
            investigation_id=demo_id,
            name="Targeted Coolant Flow & Valve Pressure Evidence (Simulated)",
            filename=coolant_file.name,
            file_path=str(coolant_file),
            format="csv",
            row_count=profile_res["row_count"],
            column_count=profile_res["column_count"],
            quality_score=profile_res["quality_score"],
            schema_info=json.dumps(profile_res["columns_meta"]),
            profiling_info=json.dumps(profile_res),
            is_supplemental=1
        )
        db.add(record)
        db.commit()
        db.refresh(record)

    update_result = process_supplemental_evidence(db, demo_id, record, new_df, is_simulated=True)
    return {
        "status": "success",
        "is_simulated": True,
        "simulation_disclosure": "Supplemental coolant flow telemetry is simulated demo evidence; statistical re-evaluation was computed live.",
        "message": "Simulated supplemental evidence ingested and evaluated.",
        "closed_loop_update": update_result
    }
