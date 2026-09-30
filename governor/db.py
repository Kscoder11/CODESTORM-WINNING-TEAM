import datetime
from sqlalchemy import (
    create_engine, Column, String, Integer, Float, Boolean, Text, DateTime, ForeignKey, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from governor.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {},
    echo=False
)

# Enable SQLite WAL mode and foreign key support
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class APIKeyModel(Base):
    __tablename__ = "api_keys"
    
    id = Column(String(64), primary_key=True)
    role = Column(String(32), nullable=False)  # orchestrator | reviewer | admin
    key_hash = Column(String(128), nullable=False, index=True)
    label = Column(String(128), nullable=False)

class SessionModel(Base):
    __tablename__ = "sessions"
    
    id = Column(String(64), primary_key=True)
    token_hash = Column(String(128), nullable=False, index=True)
    agent_name = Column(String(128), nullable=False)
    task = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, default="ACTIVE")  # ACTIVE | SUSPENDED | EXPIRED
    created_by = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

class GrantModel(Base):
    __tablename__ = "grants"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id"), nullable=False, index=True)
    action = Column(String(64), nullable=False)
    target_glob = Column(String(256), nullable=False)
    constraints_json = Column(Text, nullable=False, default="{}")

class LedgerModel(Base):
    __tablename__ = "ledger"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id"), nullable=False, index=True)
    source = Column(String(256), nullable=False)
    trust = Column(String(32), nullable=False)
    sensitivity = Column(String(32), nullable=False)
    indicators_json = Column(Text, nullable=False, default="[]")
    injection_flag = Column(Boolean, default=False)
    ts = Column(DateTime, default=datetime.datetime.utcnow)

class DecisionModel(Base):
    __tablename__ = "decisions"
    
    seq = Column(Integer, primary_key=True, autoincrement=True)
    ts = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    action = Column(String(64), nullable=False)
    canon_target = Column(Text, nullable=False)
    canon_params_json = Column(Text, nullable=False)
    request_hash = Column(String(64), nullable=False, index=True)
    outcome = Column(String(32), nullable=False)  # ALLOW | CONSTRAIN | ESCALATE | DENY
    score = Column(Integer, nullable=False)
    breakdown_json = Column(Text, nullable=False)
    rules_json = Column(Text, nullable=False)
    policy_version = Column(String(32), nullable=False, default="1.0")
    decision_ms = Column(Float, nullable=False)
    audit_ms = Column(Float, nullable=False)
    exec_status = Column(String(32), nullable=True)
    exec_ms = Column(Float, nullable=True)
    mode = Column(String(32), nullable=False, default="full")

class ApprovalModel(Base):
    __tablename__ = "approvals"
    
    id = Column(String(64), primary_key=True)
    request_hash = Column(String(64), nullable=False, index=True)
    decision_seq = Column(Integer, nullable=True)
    status = Column(String(32), nullable=False, index=True)  # PENDING | APPROVED | DENIED | EXPIRED | CONSUMED
    reviewer = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)

class AuditEventModel(Base):
    __tablename__ = "audit_events"
    
    seq = Column(Integer, primary_key=True, autoincrement=True)
    ts = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    type = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=False)
    prev_hash = Column(String(64), nullable=False)
    hash = Column(String(64), nullable=False, index=True)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
