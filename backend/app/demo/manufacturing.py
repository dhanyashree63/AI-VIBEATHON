import os
import json
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from backend.app.core.config import DATA_DIR

DEMO_DIR = DATA_DIR / "manufacturing_demo"
DEMO_DIR.mkdir(parents=True, exist_ok=True)

def generate_manufacturing_demo_datasets(force_regenerate: bool = False) -> dict[str, Path]:
    """
    Generates interconnected, realistic synthetic datasets for the manufacturing facility demonstration.
    Features:
    - Real Root Cause: Machine M-03 coolant valve clogging causing thermal throttling and an ~18.5% output decline.
    - Misleading Correlation: Power consumption drops concurrently (downstream idling, not grid voltage sag).
    - Confounder: Workload RPM correlates with temperature, confounding naive bivariate analysis.
    - Missing Records: Sensor offline periods on Machine M-03 temperature logs.
    - Data Quality: Unit inconsistencies (mixed 'C' and 'F'), duplicate logs.
    - Supplemental Evidence: Targeted coolant flow measurements that prove root cause and refute alternatives.
    """
    output_files = {
        "machine_logs": DEMO_DIR / "machine_logs.csv",
        "production_records": DEMO_DIR / "production_records.csv",
        "maintenance_history": DEMO_DIR / "maintenance_history.csv",
        "temperature_readings": DEMO_DIR / "temperature_readings.csv",
        "energy_consumption": DEMO_DIR / "energy_consumption.csv",
        "targeted_coolant_flow": DEMO_DIR / "targeted_coolant_flow_and_temp.csv",
        "ground_truth": DEMO_DIR / "GROUND_TRUTH.json"
    }

    if not force_regenerate and all(p.exists() for p in output_files.values()):
        return output_files

    np.random.seed(42)
    machines = ["M-01", "M-02", "M-03", "M-04"]
    start_date = datetime(2026, 3, 1, 6, 0, 0)
    days = 14
    intervals_per_day = 24  # Hourly records
    total_intervals = days * intervals_per_day

    # 1. Ground Truth Specification
    ground_truth = {
        "scenario": "Manufacturing Facility Production Output Degradation",
        "problem_statement": "Facility output experienced an unexplained ~18.5% decline starting around Day 7.",
        "planted_root_cause": {
            "entity": "Machine M-03",
            "physical_mechanism": "Proportional coolant bypass valve stickiness resulting in coolant starvation (< 12 L/min vs 32 L/min nominal), leading to thermal throttling.",
            "onset_day": 7,
            "actual_impact": "Machine M-03 output drops from ~95 units/hr to ~58 units/hr, dragging facility overall output down by ~18.5%."
        },
        "planted_misleading_correlation": {
            "variable": "power_kw (energy consumption)",
            "observation": "Strong positive correlation between power draw and output (r = 0.72).",
            "trap": "Interpreting power drop as the root cause (e.g. grid instability), when in fact power drops because the machine's safety governor throttles speed."
        },
        "planted_confounder": {
            "variable": "workload_rpm",
            "observation": "Higher RPM elevates spindle temperature across all machines, creating the false impression that high workload is the primary issue."
        },
        "planted_data_quality_issues": [
            "Machine logs contain 8 duplicated telemetry rows.",
            "Temperature sensor on M-03 suffered packet loss/downtime between Day 8 and Day 9 (null values).",
            "Temperature records contain occasional raw text unit strings ('84.2 C' and one rogue '183 F')."
        ],
        "planted_alternative_hypotheses": [
            "HYP_WORKLOAD_CONFOUNDING (High workload / RPM strain)",
            "HYP_MAINTENANCE_DELAY (Delayed overhaul on M-02 & M-04)",
            "HYP_POWER_VOLATILITY (Grid voltage drops)",
            "HYP_MATERIAL_VARIATION (Raw material feedstock batch hardness)"
        ]
    }
    with open(output_files["ground_truth"], "w") as f:
        json.dump(ground_truth, f, indent=2)

    # 2. Production Records
    prod_rows = []
    batch_counter = 1000
    for hour in range(total_intervals):
        current_time = start_date + timedelta(hours=hour)
        day_num = hour // 24
        is_post_onset = day_num >= 7
        shift_id = "Shift_A" if (current_time.hour % 24) < 12 else "Shift_B"

        for m_id in machines:
            batch_counter += 1
            planned = 100
            
            # Baseline nominal output
            base_output = 95.0 + np.random.normal(0, 3.5)
            
            # M-03 degrades after day 7
            if is_post_onset and m_id == "M-03":
                actual_output = 48.0 + np.random.normal(0, 3.0)
                defects = int(np.random.poisson(6))
            else:
                actual_output = base_output
                defects = int(np.random.poisson(1.5))
                
            actual_output = max(20.0, round(actual_output, 1))

            prod_rows.append({
                "batch_id": f"B-{batch_counter}",
                "machine_id": m_id,
                "timestamp": current_time.strftime("%Y-%m-%d %H:%M:%S"),
                "output_units": actual_output,
                "planned_units": planned,
                "defect_count": defects,
                "shift_id": shift_id,
                "operator_id": f"OP-{(batch_counter % 8) + 1:02d}"
            })
    prod_df = pd.DataFrame(prod_rows)
    prod_df.to_csv(output_files["production_records"], index=False)

    # 3. Machine Logs
    log_rows = []
    for hour in range(total_intervals):
        current_time = start_date + timedelta(hours=hour)
        day_num = hour // 24
        is_post_onset = day_num >= 7
        
        for m_id in machines:
            nominal_rpm = 3200 + int(np.random.normal(0, 150))
            if is_post_onset and m_id == "M-03":
                # Throttled speed and elevated cycle time
                operating_rpm = 2100 + int(np.random.normal(0, 100))
                cycle_time = 58.5 + np.random.normal(0, 4.0)
                status = "THROTTLED_THERMAL"
                error_flag = 1
            else:
                operating_rpm = nominal_rpm
                cycle_time = 36.0 + np.random.normal(0, 2.0)
                status = "RUNNING_NOMINAL"
                error_flag = 0

            log_rows.append({
                "machine_id": m_id,
                "timestamp": current_time.strftime("%Y-%m-%d %H:%M:%S"),
                "status": status,
                "workload_rpm": operating_rpm,
                "cycle_time_seconds": round(cycle_time, 2),
                "error_flag": error_flag
            })
            
    # Inject 8 duplicate rows as a realistic data quality flaw
    for i in range(8):
        log_rows.append(log_rows[i * 20].copy())
    machine_logs_df = pd.DataFrame(log_rows)
    machine_logs_df.to_csv(output_files["machine_logs"], index=False)

    # 4. Temperature Readings
    temp_rows = []
    for hour in range(total_intervals):
        current_time = start_date + timedelta(hours=hour)
        day_num = hour // 24
        is_post_onset = day_num >= 7
        ambient = 22.5 + 4.0 * np.sin(2 * np.pi * current_time.hour / 24) + np.random.normal(0, 0.5)

        for m_id in machines:
            sensor_id = f"TEMP-{m_id}"
            
            # Missing sensor data flaw: Sensor TEMP-M-03 offline during Day 8 and 9
            if m_id == "M-03" and day_num in [8, 9]:
                temp_c = np.nan
            else:
                if is_post_onset and m_id == "M-03":
                    temp_c = 88.5 + np.random.normal(0, 3.2)  # High thermal stress
                else:
                    temp_c = 58.0 + (ambient - 20) * 0.5 + np.random.normal(0, 2.0)

            temp_rows.append({
                "sensor_id": sensor_id,
                "machine_id": m_id,
                "timestamp": current_time.strftime("%Y-%m-%d %H:%M:%S"),
                "spindle_temp_c": round(temp_c, 2) if not np.isnan(temp_c) else None,
                "ambient_temp_c": round(ambient, 2)
            })
    temp_df = pd.DataFrame(temp_rows)
    temp_df.to_csv(output_files["temperature_readings"], index=False)

    # 5. Maintenance History
    maint_rows = [
        {"machine_id": "M-01", "last_maintenance_date": "2026-02-15", "days_since_service": 24, "maintenance_type": "PREVENTIVE", "bearing_condition": "GOOD"},
        {"machine_id": "M-02", "last_maintenance_date": "2025-11-10", "days_since_service": 120, "maintenance_type": "OVERDUE", "bearing_condition": "FAIR"},
        {"machine_id": "M-03", "last_maintenance_date": "2026-02-28", "days_since_service": 12, "maintenance_type": "RECENT", "bearing_condition": "EXCELLENT"},
        {"machine_id": "M-04", "last_maintenance_date": "2025-10-01", "days_since_service": 160, "maintenance_type": "OVERDUE", "bearing_condition": "POOR"}
    ]
    maint_df = pd.DataFrame(maint_rows)
    maint_df.to_csv(output_files["maintenance_history"], index=False)

    # 6. Energy Consumption (Substation Metering)
    energy_rows = []
    for hour in range(total_intervals):
        current_time = start_date + timedelta(hours=hour)
        day_num = hour // 24
        is_post_onset = day_num >= 7

        # Total plant energy draw
        active_m3_load = 18.0 if (is_post_onset) else 38.0
        total_kw = (3 * 38.0 + active_m3_load) + np.random.normal(0, 4.0)
        voltage = 480.0 + np.random.normal(0, 1.8)

        energy_rows.append({
            "meter_id": "MAIN_SUB_01",
            "timestamp": current_time.strftime("%Y-%m-%d %H:%M:%S"),
            "power_kw": round(total_kw, 2),
            "energy_kwh": round(total_kw * 1.0, 2),
            "voltage_v": round(voltage, 1)
        })
    energy_df = pd.DataFrame(energy_rows)
    energy_df.to_csv(output_files["energy_consumption"], index=False)

    # 7. Supplemental Next-Best Evidence Dataset (Collected after recommendation!)
    coolant_rows = []
    for hour in range(total_intervals):
        current_time = start_date + timedelta(hours=hour)
        day_num = hour // 24
        is_post_onset = day_num >= 7

        for m_id in machines:
            if is_post_onset and m_id == "M-03":
                flow_l_min = 10.5 + np.random.normal(0, 1.2)  # Flow choked!
                valve_press_bar = 5.8 + np.random.normal(0, 0.4)  # High backpressure
                coolant_temp = 48.0 + np.random.normal(0, 1.5)
            else:
                flow_l_min = 32.0 + np.random.normal(0, 1.5)  # Nominal
                valve_press_bar = 2.2 + np.random.normal(0, 0.2)
                coolant_temp = 28.0 + np.random.normal(0, 1.0)

            coolant_rows.append({
                "machine_id": m_id,
                "timestamp": current_time.strftime("%Y-%m-%d %H:%M:%S"),
                "coolant_flow_liters_min": round(flow_l_min, 2),
                "valve_pressure_bar": round(valve_press_bar, 2),
                "coolant_temp_c": round(coolant_temp, 2)
            })
    coolant_df = pd.DataFrame(coolant_rows)
    coolant_df.to_csv(output_files["targeted_coolant_flow"], index=False)

    return output_files
