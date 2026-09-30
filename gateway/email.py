import os
import json
import uuid
from datetime import datetime

OUTBOX_DIR = "/workspace/outbox"
ALLOWED_EMAIL_DOMAINS = {"internal.example.com"}

def init_outbox():
    if not os.path.exists(OUTBOX_DIR):
        os.makedirs(OUTBOX_DIR, exist_ok=True)

def secure_send_email(to_address: str, subject: str, body: str):
    init_outbox()
    try:
        domain = to_address.split('@')[1]
    except IndexError:
        raise ValueError("Invalid email address format")

    if domain.lower() not in ALLOWED_EMAIL_DOMAINS:
        raise PermissionError(f"Email domain {domain} is not approved")

    email_id = str(uuid.uuid4())
    email_data = {
        "id": email_id,
        "to": to_address,
        "subject": subject,
        "body": body,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    file_path = os.path.join(OUTBOX_DIR, f"{email_id}.json")
    with open(file_path, 'w') as f:
        json.dump(email_data, f)
    return email_id
