import json
from datetime import datetime
from typing import Any
from sqlalchemy.orm import Session
from backend.app.engine.database import (
    Investigation,
    DatasetRecord,
    AnomalyRecord,
    HypothesisRecord,
    RecommendationRecord,
    HistoryRecord
)

def generate_investigation_report(db: Session, investigation_id: str) -> dict[str, Any]:
    """Generates an exhaustive, audit-grade investigation report."""
    inv = db.query(Investigation).filter(Investigation.id == investigation_id).first()
    if not inv:
        return {"error": "Investigation not found"}
        
    datasets = db.query(DatasetRecord).filter(DatasetRecord.investigation_id == investigation_id).all()
    anomalies = db.query(AnomalyRecord).filter(AnomalyRecord.investigation_id == investigation_id).all()
    hypotheses = db.query(HypothesisRecord).filter(HypothesisRecord.investigation_id == investigation_id).all()
    recommendations = db.query(RecommendationRecord).filter(RecommendationRecord.investigation_id == investigation_id).all()
    history = db.query(HistoryRecord).filter(HistoryRecord.investigation_id == investigation_id).order_by(HistoryRecord.step_number.asc()).all()

    report_data = {
        "investigation_id": inv.id,
        "title": inv.title,
        "description": inv.description,
        "status": inv.status,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
        "datasets_analyzed": [
            {
                "id": d.id,
                "name": d.name,
                "filename": d.filename,
                "row_count": d.row_count,
                "column_count": d.column_count,
                "quality_score": d.quality_score,
                "is_supplemental": bool(d.is_supplemental)
            }
            for d in datasets
        ],
        "anomalies_discovered": [
            {
                "id": a.id,
                "title": a.title,
                "metric": a.metric,
                "baseline_value": a.baseline_value,
                "anomaly_value": a.anomaly_value,
                "percentage_change": a.percentage_change,
                "severity": a.severity,
                "p_value": a.p_value,
                "detected_timestamp": a.detected_timestamp
            }
            for a in anomalies
        ],
        "competing_explanations": [
            {
                "id": h.id,
                "title": h.title,
                "category": h.category,
                "status": h.status,
                "strength_score": h.strength_score,
                "effect_size": h.effect_size,
                "confidence_interval": json.loads(h.confidence_interval or "[]"),
                "p_value": h.p_value,
                "supporting_evidence": json.loads(h.supporting_evidence or "[]"),
                "contradicting_evidence": json.loads(h.contradicting_evidence or "[]"),
                "missing_evidence": json.loads(h.missing_evidence or "[]"),
                "limitations": json.loads(h.limitations or "[]")
            }
            for h in hypotheses
        ],
        "next_best_evidence_recommendations": [
            {
                "id": r.id,
                "title": r.title,
                "what_to_collect": r.what_to_collect,
                "why_needed": r.why_needed,
                "distinguishing_logic": r.distinguishing_logic,
                "expected_information_gain_bits": r.expected_information_gain,
                "expected_uncertainty_reduction_pct": r.expected_uncertainty_reduction,
                "required_sample_size": r.required_sample_size,
                "estimated_cost_usd": r.estimated_cost,
                "estimated_duration_days": r.estimated_duration_days,
                "status": r.status
            }
            for r in recommendations
        ],
        "investigation_audit_trail": [
            {
                "step": h.step_number,
                "event_type": h.event_type,
                "title": h.title,
                "description": h.description,
                "timestamp": h.created_at.isoformat() if h.created_at else None
            }
            for h in history
        ]
    }

    # Generate Markdown summary
    md_lines = [
        f"# REVERSE AI Investigation Dossier: {inv.title}",
        f"**Status:** {inv.status.upper()} | **Investigation ID:** `{inv.id}` | **Date:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "## Executive Summary",
        inv.description or "Automated multi-dataset causal investigation.",
        "",
        "## 1. Discovered Anomalies"
    ]
    for a in anomalies:
        md_lines.append(f"- **{a.title}** ({a.severity} severity): Baseline {a.baseline_value} -> Observed {a.anomaly_value} ({a.percentage_change:+.1f}%, Welch's t-test p = {a.p_value})")
    
    md_lines.append("\n## 2. Competing Explanations & Evidentiary Proof")
    for h in hypotheses:
        ci_str = f"[{h.confidence_interval}]" if h.confidence_interval else "N/A"
        md_lines.append(f"### {h.title} (Status: {h.status.upper()}, Probability Strength: {h.strength_score * 100:.1f}%)")
        md_lines.append(f"- **Description:** {h.description}")
        md_lines.append(f"- **Statistical Evidence:** Cohen's d = {h.effect_size or 0.0:.2f}, p-value = {h.p_value or 1.0}, 95% CI = {ci_str}")
        
        supporting = json.loads(h.supporting_evidence or "[]")
        if supporting:
            md_lines.append("- **Supporting Evidence:**")
            for s in supporting:
                md_lines.append(f"  * {s}")
                
        contradicting = json.loads(h.contradicting_evidence or "[]")
        if contradicting:
            md_lines.append("- **Contradicting Evidence:**")
            for c in contradicting:
                md_lines.append(f"  * {c}")
                
        missing = json.loads(h.missing_evidence or "[]")
        if missing:
            md_lines.append("- **Missing Evidence Identified:**")
            for m in missing:
                md_lines.append(f"  * {m}")

    md_lines.append("\n## 3. Recommended Next-Best Investigations")
    for r in recommendations:
        md_lines.append(f"### {r.title} (Expected Info Gain: {r.expected_information_gain:.3f} bits | Uncertainty Reduction: {r.expected_uncertainty_reduction:.1f}%)")
        md_lines.append(f"- **What to Collect:** {r.what_to_collect}")
        md_lines.append(f"- **Why Needed:** {r.why_needed}")
        md_lines.append(f"- **Distinguishing Logic:** {r.distinguishing_logic}")
        md_lines.append(f"- **Resource Estimate:** ${r.estimated_cost:,.2f} USD | {r.estimated_duration_days} Days | N = {r.required_sample_size} observations")

    report_data["markdown_report"] = "\n".join(md_lines)
    return report_data
