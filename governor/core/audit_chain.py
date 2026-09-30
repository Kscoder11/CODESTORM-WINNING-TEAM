import json
import hashlib
import datetime
from sqlalchemy.orm import Session
from governor.db import AuditEventModel

GENESIS_HASH = "0" * 64

def canonical_json(data: dict) -> str:
    """Consistently formatted canonical JSON string for hashing."""
    return json.dumps(data, sort_keys=True, separators=(',', ':'))

def compute_event_hash(prev_hash: str, payload_dict: dict) -> str:
    """Compute SHA256(prev_hash || canonical(payload))."""
    payload_str = canonical_json(payload_dict)
    raw = f"{prev_hash}:{payload_str}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def append_audit_event(db: Session, event_type: str, payload_dict: dict) -> AuditEventModel:
    """
    Appends a new hash-chained audit record into the database.
    """
    # Fetch last audit record
    last_event = db.query(AuditEventModel).order_by(AuditEventModel.seq.desc()).first()
    prev_hash = last_event.hash if last_event else GENESIS_HASH
    
    current_hash = compute_event_hash(prev_hash, payload_dict)
    
    new_event = AuditEventModel(
        ts=datetime.datetime.utcnow(),
        type=event_type,
        payload_json=canonical_json(payload_dict),
        prev_hash=prev_hash,
        hash=current_hash
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

def verify_audit_chain(db: Session) -> dict:
    """
    Re-computes the entire audit chain from sequence 1 to end.
    Returns {"ok": True, "first_bad_seq": None} or {"ok": False, "first_bad_seq": bad_seq}.
    """
    events = db.query(AuditEventModel).order_by(AuditEventModel.seq.asc()).all()
    if not events:
        return {"ok": True, "first_bad_seq": None}
        
    expected_prev_hash = GENESIS_HASH
    
    for event in events:
        # Check previous hash pointer
        if event.prev_hash != expected_prev_hash:
            return {"ok": False, "first_bad_seq": event.seq}
            
        # Re-compute current hash
        try:
            payload_dict = json.loads(event.payload_json)
        except Exception:
            return {"ok": False, "first_bad_seq": event.seq}
            
        computed_hash = compute_event_hash(event.prev_hash, payload_dict)
        if event.hash != computed_hash:
            return {"ok": False, "first_bad_seq": event.seq}
            
        expected_prev_hash = event.hash
        
    return {"ok": True, "first_bad_seq": None}
