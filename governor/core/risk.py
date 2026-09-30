from typing import Dict, Tuple

BASE_RISK_SCORES: Dict[str, int] = {
    "file.read": 5,
    "db.read": 15,
    "http.get": 15,
    "email.read": 15,
    "file.write": 25,
    "email.send": 30,
    "db.write": 35,
    "http.post": 35,
    "code.execute": 40,
}

SENSITIVITY_SCORES: Dict[str, int] = {
    "public": 0,
    "internal": 5,
    "confidential": 15,
    "restricted": 25,
}

ENVIRONMENT_SCORES: Dict[str, int] = {
    "dev": 0,
    "staging": 5,
    "prod": 20,
}

TAINT_SCORES: Dict[str, int] = {
    "trusted": 0,
    "internal": 0,
    "user": 5,
    "external": 10,
    "untrusted": 20,
}

def calculate_risk_score(
    action: str,
    sensitivity: str,
    environment: str,
    session_taint: str,
    injection_advisory: bool = False,
    burst_signal: bool = False,
    risky_imports_signal: bool = False,
) -> Tuple[int, Dict[str, int], str]:
    """
    Computes dynamic risk score bounded to [0, 100].
    Returns (total_score, breakdown_dict, outcome_str).
    """
    base = BASE_RISK_SCORES.get(action, 20)
    sens = SENSITIVITY_SCORES.get(sensitivity, 25)
    env = ENVIRONMENT_SCORES.get(environment, 20)
    taint = TAINT_SCORES.get(session_taint, 20)
    
    signals = 0
    if injection_advisory:
        signals += 15
    if burst_signal:
        signals += 10
    if risky_imports_signal:
        signals += 10
        
    raw_score = base + sens + env + taint + signals
    total_score = min(100, raw_score)
    
    breakdown = {
        "base": base,
        "sensitivity": sens,
        "environment": env,
        "taint": taint,
        "signals": signals,
    }
    
    if total_score < 30:
        outcome = "ALLOW"
    elif total_score <= 54:
        outcome = "CONSTRAIN"
    elif total_score <= 79:
        outcome = "ESCALATE"
    else:
        outcome = "DENY"
        
    return total_score, breakdown, outcome
