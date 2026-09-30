import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseModel):
    PROJECT_NAME: str = "PNG5 Agent Permission Governor"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("GOVERNOR_ENV", "dev")
    MODE: str = os.getenv("GOVERNOR_MODE", "full")  # full | regex_only | off
    
    # Storage
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/governor.db")
    WORKSPACE_DIR: Path = Path(os.getenv("WORKSPACE_DIR", BASE_DIR / "demo" / "workspace")).resolve()
    POLICY_PATH: Path = Path(os.getenv("POLICY_PATH", BASE_DIR / "policies" / "policy.yaml")).resolve()
    RESOURCES_PATH: Path = Path(os.getenv("RESOURCES_PATH", BASE_DIR / "policies" / "resources.yaml")).resolve()
    
    # Limits & Thresholds
    MAX_BODY_BYTES: int = 65536
    APPROVAL_TTL_SECONDS: int = 300
    
    # Master API Keys (for demo & tests)
    ORCHESTRATOR_KEY: str = os.getenv("ORCHESTRATOR_KEY", "orch_key_secret_123")
    REVIEWER_KEY: str = os.getenv("REVIEWER_KEY", "rev_key_secret_456")
    ADMIN_KEY: str = os.getenv("ADMIN_KEY", "admin_key_secret_789")

settings = Settings()
