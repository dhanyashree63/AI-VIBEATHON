import json
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, Float, DateTime, ForeignKey, text, event
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from backend.app.core.config import settings

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})

@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

VALID_INVESTIGATION_STATUSES = {"draft", "ready", "processing", "completed", "failed", "archived"}

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Investigation(Base):
    __tablename__ = "investigations"
    
    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="draft")  # draft, ready, processing, completed, failed, archived
    analysis_stage = Column(String, default="idle")  # idle, quality_check, pattern_discovery, explanation_analysis, evidence_evaluation, recommendations, completed, failed
    analysis_error = Column(Text, nullable=True)
    budget_limit = Column(Float, default=10000.0)
    time_limit_days = Column(Integer, default=14)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    datasets = relationship("DatasetRecord", back_populates="investigation", cascade="all, delete-orphan")
    anomalies = relationship("AnomalyRecord", back_populates="investigation", cascade="all, delete-orphan")
    hypotheses = relationship("HypothesisRecord", back_populates="investigation", cascade="all, delete-orphan")
    recommendations = relationship("RecommendationRecord", back_populates="investigation", cascade="all, delete-orphan")
    history = relationship("HistoryRecord", back_populates="investigation", cascade="all, delete-orphan")

class DatasetRecord(Base):
    __tablename__ = "datasets"
    
    id = Column(String, primary_key=True, index=True)
    investigation_id = Column(String, ForeignKey("investigations.id"), nullable=False)
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    format = Column(String, nullable=False)  # csv, xlsx, json
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    quality_score = Column(Float, default=100.0)
    schema_info = Column(Text, default="{}")  # JSON string
    profiling_info = Column(Text, default="{}")  # JSON string
    is_supplemental = Column(Integer, default=0)  # 1 if uploaded as next-best evidence
    created_at = Column(DateTime, default=datetime.utcnow)

    investigation = relationship("Investigation", back_populates="datasets")

class AnomalyRecord(Base):
    __tablename__ = "anomalies"
    
    id = Column(String, primary_key=True, index=True)
    investigation_id = Column(String, ForeignKey("investigations.id"), nullable=False)
    dataset_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    metric = Column(String, nullable=False)
    baseline_value = Column(Float, nullable=True)
    anomaly_value = Column(Float, nullable=True)
    percentage_change = Column(Float, nullable=True)
    detected_timestamp = Column(String, nullable=True)
    affected_entities = Column(Text, default="[]")  # JSON list
    severity = Column(String, default="HIGH")  # CRITICAL, HIGH, MEDIUM, LOW
    priority = Column(String, default="medium")  # high, medium, low
    priority_score = Column(Float, default=50.0)
    p_value = Column(Float, nullable=True)
    statistical_summary = Column(Text, default="{}")  # JSON
    finding_payload = Column(Text, default="{}")  # Full Step 5 structured finding JSON
    analysis_version = Column(Integer, default=1)
    marked_for_investigation = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    investigation = relationship("Investigation", back_populates="anomalies")
    hypotheses = relationship("HypothesisRecord", back_populates="anomaly")

class HypothesisRecord(Base):
    __tablename__ = "hypotheses"
    
    id = Column(String, primary_key=True, index=True)
    investigation_id = Column(String, ForeignKey("investigations.id"), nullable=False)
    anomaly_id = Column(String, ForeignKey("anomalies.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, default="operational")  # thermal, operational, maintenance, electrical, raw_material
    status = Column(String, default="active")  # active, supported, refuted, inconclusive
    strength_score = Column(Float, default=0.5)  # 0.0 to 1.0 probability/strength
    supporting_evidence = Column(Text, default="[]")  # JSON list
    contradicting_evidence = Column(Text, default="[]")  # JSON list
    missing_evidence = Column(Text, default="[]")  # JSON list
    statistical_tests = Column(Text, default="{}")  # JSON of real test results
    effect_size = Column(Float, nullable=True)
    confidence_interval = Column(Text, default="[]")  # JSON [lower, upper]
    p_value = Column(Float, nullable=True)
    limitations = Column(Text, default="[]")  # JSON list
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    investigation = relationship("Investigation", back_populates="hypotheses")
    anomaly = relationship("AnomalyRecord", back_populates="hypotheses")

class RecommendationRecord(Base):
    __tablename__ = "recommendations"
    
    id = Column(String, primary_key=True, index=True)
    investigation_id = Column(String, ForeignKey("investigations.id"), nullable=False)
    title = Column(String, nullable=False)
    target_hypotheses = Column(Text, default="[]")  # JSON list of hypothesis IDs
    what_to_collect = Column(Text, nullable=False)
    why_needed = Column(Text, nullable=False)
    distinguishing_logic = Column(Text, nullable=False)
    expected_information_gain = Column(Float, default=0.0)
    expected_uncertainty_reduction = Column(Float, default=0.0)
    required_sample_size = Column(Integer, default=50)
    estimated_cost = Column(Float, nullable=True, default=None)
    estimated_duration_days = Column(Integer, nullable=True, default=None)
    feasibility_score = Column(Float, default=0.85)  # 0.0 to 1.0
    limitations = Column(Text, default="[]")  # JSON
    status = Column(String, default="recommended")  # recommended, executed, skipped
    created_at = Column(DateTime, default=datetime.utcnow)

    investigation = relationship("Investigation", back_populates="recommendations")

class HistoryRecord(Base):
    __tablename__ = "investigation_history"
    
    id = Column(String, primary_key=True, index=True)
    investigation_id = Column(String, ForeignKey("investigations.id"), nullable=False)
    step_number = Column(Integer, default=1)
    event_type = Column(String, nullable=False)  # DISCOVERY, HYPOTHESIS_TEST, EVIDENCE_RECOMMENDED, NEW_EVIDENCE_INGESTED, CONCLUSION_UPDATE
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    snapshot = Column(Text, default="{}")  # JSON state snapshot
    created_at = Column(DateTime, default=datetime.utcnow)

    investigation = relationship("Investigation", back_populates="history")

def init_db():
    Base.metadata.create_all(bind=engine)
    # Safe additive migration for existing SQLite databases
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(investigations)")).fetchall()]
        if "owner_id" not in cols:
            conn.execute(text("ALTER TABLE investigations ADD COLUMN owner_id VARCHAR"))
        if "analysis_stage" not in cols:
            conn.execute(text("ALTER TABLE investigations ADD COLUMN analysis_stage VARCHAR DEFAULT 'idle'"))
        if "analysis_error" not in cols:
            conn.execute(text("ALTER TABLE investigations ADD COLUMN analysis_error TEXT"))

        anom_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(anomalies)")).fetchall()]
        if "dataset_id" not in anom_cols:
            conn.execute(text("ALTER TABLE anomalies ADD COLUMN dataset_id VARCHAR"))
        if "priority" not in anom_cols:
            conn.execute(text("ALTER TABLE anomalies ADD COLUMN priority VARCHAR DEFAULT 'medium'"))
        if "priority_score" not in anom_cols:
            conn.execute(text("ALTER TABLE anomalies ADD COLUMN priority_score FLOAT DEFAULT 50.0"))
        if "finding_payload" not in anom_cols:
            conn.execute(text("ALTER TABLE anomalies ADD COLUMN finding_payload TEXT DEFAULT '{}'"))
        if "analysis_version" not in anom_cols:
            conn.execute(text("ALTER TABLE anomalies ADD COLUMN analysis_version INTEGER DEFAULT 1"))
        if "marked_for_investigation" not in anom_cols:
            conn.execute(text("ALTER TABLE anomalies ADD COLUMN marked_for_investigation INTEGER DEFAULT 0"))

        # Performance indexes on foreign keys
        for tbl in ("datasets", "anomalies", "hypotheses", "recommendations", "investigation_history"):
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{tbl}_inv_id ON {tbl}(investigation_id)"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
