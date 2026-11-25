# REVERSE AI 2.0
> **Discover. Investigate. Prove.**  
> *"Most analytics tools answer the questions you ask. REVERSE AI investigates the questions you didn't know you needed to ask."*

---

## 🚀 Overview

**REVERSE AI 2.0** is an autonomous data investigation platform designed for complex operational environments. Rather than presenting passive dashboards or speculative LLM summaries, REVERSE AI formulates competing causal explanations, executes rigorous statistical hypothesis testing, identifies missing evidence, and determines the **Next-Best Evidence** using transparent mathematical scoring.

```
DISCOVER ──► INVESTIGATE ──► CHALLENGE ──► IDENTIFY MISSING EVIDENCE ──► RECOMMEND ──► LEARN
```

---

## 🏗️ Architecture & Modules

The platform is structured into modular layers:

- **Ingestion & Profiling** (`backend/app/engine/ingestion.py`):
  Multi-format parsing (CSV, XLSX, JSON), automated schema and data type classification, missing-value and duplicate detection, timestamp identification, unit conflict detection, and data quality scoring.
- **Fragmented Evidence Fusion** (`backend/app/engine/data_fusion.py`):
  Automated join-key candidate detection, compound timestamp + entity matching (preventing Cartesian explosion), match rate auditing, and caveat reporting.
- **Anomaly Detection** (`backend/app/engine/anomaly_detection.py`):
  Change-point detection with Welch's t-test verification and Isolation Forest multivariate outlier scanning.
- **Hypothesis Testing Engine** (`backend/app/engine/hypothesis_testing.py`):
  Python statistical computations using **SciPy**, **NumPy**, and **scikit-learn**:
  - Two-sample Welch's t-test ($p$-values)
  - Cohen's $d$ effect sizes
  - 95% Confidence Intervals for mean differences
  - Bivariate Pearson $r$ and Spearman $\rho$ correlations
  - Controlled multiple linear regression (testing confounder attenuation)
  - Transparent evidence strength scoring ($0.05$ to $0.98$).
- **Next-Best-Evidence Engine** (`backend/app/engine/next_best_evidence.py`):
  Computes Shannon entropy across the hypothesis probability distribution and calculates **Expected Information Gain (bits)** and **Expected Uncertainty Reduction (%)**, estimating required sample sizes via statistical power analysis.
- **Investigation Budget Optimizer** (`backend/app/engine/budget_optimizer.py`):
  Constrained multi-criteria optimization balancing information gain per dollar and information gain per day under user budget and time constraints.
- **Closed-Loop Discovery Memory** (`backend/app/engine/investigation_memory.py`):
  Persistent SQLite audit log preserving historical states, updating priors when new evidence arrives, identifying contradictions, and explaining conclusion changes.
- **Enterprise Frontend Workspace** (`frontend/src/`):
  Built with **React 18**, **Tailwind CSS**, and **Lucide Icons**. Clean, restrained enterprise UX without generic templates.

---

## 🏭 Manufacturing Demonstration Scenario

The platform includes a complete, interconnected scenario:
- **Problem Statement**: Plant-wide manufacturing output experienced an unexplained ~18.5% decline.
- **Datasets Ingested**:
  1. `machine_logs.csv` (machine RPM, cycle times, operating status, error flags)
  2. `production_records.csv` (hourly output quotas, defect counts, shifts, operators)
  3. `temperature_readings.csv` (spindle temperatures, ambient temperatures)
  4. `maintenance_history.csv` (preventative maintenance intervals, component condition)
  5. `energy_consumption.csv` (substation voltage, power kW draw)
- **Planted Ground Truth**:
  - **Root Cause**: Machine M-03 suffered from a sticking proportional coolant valve, resulting in coolant starvation ($< 12$ L/min vs 32 L/min nominal) and thermal throttling.
  - **Misleading Correlation**: Energy draw drops during output declines (downstream effect of safety throttling, not power grid instability).
  - **Confounder**: Workload RPM naturally elevates temperature on all machines, creating the illusion that speed alone is the problem.
  - **Missing Evidence**: Initial logs lacked coolant flow measurements and suffered intermittent temperature sensor downtime on Machine M-03.
  - **Targeted Resolution**: Next-best evidence recommended ultrasonic coolant flow logging, which confirms valve obstruction ($p < 0.0001$), refuting alternative workload and electrical hypotheses.

---

## 🧪 Testing & Verification

The platform includes 16 automated tests covering:
- Ingestion (CSV, JSON, missing values, constant columns, unit conflicts)
- Join key detection & fusion
- Cohen's $d$, 95% Confidence Intervals, and Controlled Regression Confounder attenuation
- Shannon entropy and Information Gain calculations
- Constrained budget optimization
- End-to-end API lifecycle and closed-loop memory updates

Run tests with:
```bash
python -m pytest backend/tests/ -v
```

---

## ⚡ Quick Start

### 1. Launch the Server
```bash
python run.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser to experience the REVERSE AI 2.0 workspace.

API documentation is accessible at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

### 2. Frontend Development (Optional)
If running Vite live development server:
```bash
cd frontend
npm run dev
```
Proxy routes all `/api` calls directly to FastAPI on port 8000.
