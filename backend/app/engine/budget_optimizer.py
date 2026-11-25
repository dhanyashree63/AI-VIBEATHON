from typing import Any

def optimize_investigation_budget(
    recommendations: list[dict[str, Any]],
    max_budget_usd: float = 5000.0,
    max_time_days: int = 7,
    min_feasibility: float = 0.70,
    max_observations: int = 500,
    max_parallel_experiments: int = 3
) -> dict[str, Any]:
    """
    Budget & Resource Optimizer for investigative experiments.
    Evaluates candidates across:
    - Expected information value (bits)
    - Estimated cost (USD)
    - Estimated duration (days)
    - Measurement limits (required sample size <= max_observations)
    - Resource constraints (selected count <= max_parallel_experiments)
    - Practical feasibility (>= min_feasibility)
    Explicitly discloses all assumptions and estimates.
    """
    assumptions = [
        "Costs and durations are engineering estimates based on standard sensor/lab rates, not vendor quotes.",
        "Selected experiments are assumed executable in parallel up to the configured resource limit.",
        "Information gain values assume conditionally independent diagnostic outcomes given the hypothesis priors."
    ]

    if not recommendations:
        return {
            "selected_investigations": [],
            "feasible_alternatives": [],
            "infeasible_options": [],
            "total_cost_usd": 0.0,
            "total_duration_days": 0,
            "total_observations_required": 0,
            "total_expected_information_gain_bits": 0.0,
            "budget_utilized_pct": 0.0,
            "time_utilized_pct": 0.0,
            "constraints": {
                "max_budget_usd": max_budget_usd,
                "max_time_days": max_time_days,
                "min_feasibility": min_feasibility,
                "max_observations": max_observations,
                "max_parallel_experiments": max_parallel_experiments
            },
            "assumptions_and_estimates": assumptions,
            "optimization_rationale": "No candidate investigations available to optimize."
        }

    scored_candidates = []
    for rec in recommendations:
        raw_cost = rec.get("estimated_cost_usd")
        raw_dur = rec.get("estimated_duration_days")
        cost = max(1.0, float(raw_cost)) if raw_cost is not None else 1.0
        duration = max(1, int(raw_dur)) if raw_dur is not None else 1
        feasibility = float(rec.get("feasibility_score") if rec.get("feasibility_score") is not None else 0.8)
        info_gain = float(rec.get("expected_information_gain_bits") if rec.get("expected_information_gain_bits") is not None else 0.5)
        sample_size = int(rec.get("required_sample_size") if rec.get("required_sample_size") is not None else 50)

        info_per_dollar = round((info_gain / cost) * 1000.0, 4)  # bits per $1,000
        info_per_day = round(info_gain / duration, 4)           # bits per day
        utility_score = round(info_gain * feasibility * 100.0 / (np_sqrt(cost / 500.0) * np_sqrt(duration)), 2)

        infeasibility_reasons = []
        if cost > max_budget_usd:
            infeasibility_reasons.append(f"Exceeds budget (${cost:,.0f} > ${max_budget_usd:,.0f})")
        if duration > max_time_days:
            infeasibility_reasons.append(f"Exceeds time limit ({duration}d > {max_time_days}d)")
        if feasibility < min_feasibility:
            infeasibility_reasons.append(f"Below feasibility threshold ({feasibility:.2f} < {min_feasibility:.2f})")
        if sample_size > max_observations:
            infeasibility_reasons.append(f"Exceeds measurement limit (N={sample_size} > {max_observations})")

        is_feasible = len(infeasibility_reasons) == 0

        scored_candidates.append({
            **rec,
            "info_per_dollar": info_per_dollar,
            "info_per_day": info_per_day,
            "utility_score": utility_score,
            "is_feasible": is_feasible,
            "infeasibility_reasons": infeasibility_reasons,
            "budget_headroom_usd": round(max_budget_usd - cost, 2) if is_feasible else None,
            "time_headroom_days": max_time_days - duration if is_feasible else None
        })

    feasible = [c for c in scored_candidates if c["is_feasible"]]
    infeasible = [c for c in scored_candidates if not c["is_feasible"]]
    feasible.sort(key=lambda x: x["utility_score"], reverse=True)

    selected = []
    current_cost = 0.0
    max_duration = 0
    total_obs = 0
    accumulated_info_gain = 0.0

    for item in feasible:
        if len(selected) >= max_parallel_experiments:
            break
        item_obs = int(item.get("required_sample_size", 50))
        if (
            (current_cost + item["estimated_cost_usd"] <= max_budget_usd)
            and (max(max_duration, item["estimated_duration_days"]) <= max_time_days)
            and (total_obs + item_obs <= max_observations)
        ):
            selected.append(item)
            current_cost += item["estimated_cost_usd"]
            max_duration = max(max_duration, item["estimated_duration_days"])
            total_obs += item_obs
            accumulated_info_gain += item["expected_information_gain_bits"]

    if not selected and feasible:
        selected = [feasible[0]]
        current_cost = feasible[0]["estimated_cost_usd"]
        max_duration = feasible[0]["estimated_duration_days"]
        total_obs = int(feasible[0].get("required_sample_size", 50))
        accumulated_info_gain = feasible[0]["expected_information_gain_bits"]

    return {
        "selected_investigations": selected,
        "feasible_alternatives": [c for c in feasible if c not in selected],
        "infeasible_options": infeasible,
        "total_cost_usd": round(current_cost, 2),
        "total_duration_days": max_duration,
        "total_observations_required": total_obs,
        "total_expected_information_gain_bits": round(accumulated_info_gain, 3),
        "budget_utilized_pct": round((current_cost / max(1.0, max_budget_usd)) * 100, 1),
        "time_utilized_pct": round((max_duration / max(1, max_time_days)) * 100, 1),
        "constraints": {
            "max_budget_usd": max_budget_usd,
            "max_time_days": max_time_days,
            "min_feasibility": min_feasibility,
            "max_observations": max_observations,
            "max_parallel_experiments": max_parallel_experiments
        },
        "assumptions_and_estimates": assumptions,
        "optimization_rationale": (
            f"Selected {len(selected)} feasible investigation(s) delivering +{round(accumulated_info_gain, 3)} bits of expected "
            f"information value while utilizing ${round(current_cost, 2):,.2f} USD ({round((current_cost / max(1.0, max_budget_usd)) * 100, 1)}% of budget), "
            f"{total_obs} observations (limit {max_observations}), over {max_duration} day(s)."
        )
    }

def np_sqrt(val: float) -> float:
    return max(0.1, val ** 0.5)
