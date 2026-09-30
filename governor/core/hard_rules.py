import fnmatch
import re
import yaml
from pathlib import Path
from governor.config import settings
from governor.core.canon import is_private_or_special_ip

class HardDenyException(Exception):
    def __init__(self, rule_id: str, message: str):
        self.rule_id = rule_id
        self.message = message
        super().__init__(f"{rule_id}: {message}")

def load_policy_yaml() -> dict:
    """Load policy YAML file."""
    if not settings.POLICY_PATH.exists():
        return {}
    try:
        with open(settings.POLICY_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}

def evaluate_hard_denies(
    action: str,
    canon_target: str,
    canon_params: dict,
    session_grants: list,
    session_ledger_entries: list = None,
    approval_object: dict = None,
    request_hash: str = None
) -> None:
    """
    Evaluates Hard-Deny rules HD1-HD10 in sequential order.
    Raises HardDenyException(rule_id, message) if any hard-deny triggers.
    """
    policy = load_policy_yaml()
    secret_patterns = policy.get("secret_patterns", [
        "*.env", "*secret*", "*credentials*", "/etc/shadow", "~/.ssh/*", "*id_rsa*"
    ])
    egress_allowlists = policy.get("egress_allowlist", {})

    # --- HD1: Secret or Credential Path ---
    if action in ("file.read", "file.write"):
        target_lower = canon_target.lower()
        for pat in secret_patterns:
            clean_pat = pat.lower()
            if fnmatch.fnmatch(target_lower, clean_pat) or clean_pat.replace("*", "") in target_lower:
                raise HardDenyException("HD1", f"Access to secret/credential path matching '{pat}' is prohibited.")

    # --- HD2: Path Escape or Symlink ---
    if action in ("file.read", "file.write"):
        # Check canonical target format - normalized format is file:/workspace/...
        # Path traversal would have been caught in canonicalization, but double-check
        if not canon_target.startswith("file:/workspace/") or ".." in canon_target:
            raise HardDenyException("HD2", "Path traversal or workspace boundary escape detected.")

    # --- HD3: Destructive Shell Command ---
    if action == "code.execute":
        shell_info = canon_params.get("shell_info", {})
        argv = shell_info.get("argv", [])
        command_str = canon_params.get("command", "")
        
        # Check unparseable shell or dangerous patterns
        danger_regexes = [
            r'rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|-[a-zA-Z]*f[a-zA-Z]*\s+)*(/|~|\*|/\*)',
            r'mkfs.*',
            r'dd\s+.*of=/dev/.*',
            r':\(\)\s*\{\s*:\|\:&\s*\};:', # Fork bomb
            r'chmod\s+(-R\s+)?777\s+/'
        ]
        for regex in danger_regexes:
            if re.search(regex, command_str):
                raise HardDenyException("HD3", f"Destructive or illegal shell command detected matching pattern '{regex}'.")
        
        if argv and argv[0] == "rm":
            ws_root = str(settings.WORKSPACE_DIR)
            for arg in argv[1:]:
                if arg in ("/", "~", "*", "/workspace", "/workspace/*", ws_root) or arg.startswith("-r"):
                    if any(a in ("/", "~", "*", "/workspace", "/workspace/*", ws_root) for a in argv):
                        raise HardDenyException("HD3", "Destructive rm command targeting root/workspace is prohibited.")

    # --- HD4: Dangerous or Illegal SQL ---
    if action in ("db.read", "db.write"):
        sql_info = canon_params.get("sql_info", {})
        stmt_type = sql_info.get("statement_type", "UNKNOWN")
        tables = sql_info.get("tables", [])
        has_where = sql_info.get("has_where", False)
        
        # DDL or dangerous commands
        ddl_types = ("DROP", "ALTER", "CREATE", "TRUNCATE", "VACUUM")
        if stmt_type in ddl_types:
            raise HardDenyException("HD4", f"DDL operation '{stmt_type}' is prohibited.")
            
        # Check forbidden sqlite system tables
        for t in tables:
            if t.lower() in ("sqlite_master", "sqlite_sequence", "pragma"):
                raise HardDenyException("HD4", f"Access to system table/pragma '{t}' is prohibited.")
                
        # UPDATE/DELETE without WHERE clause
        if action == "db.write" and stmt_type in ("UPDATE", "DELETE") and not has_where:
            raise HardDenyException("HD4", f"{stmt_type} query without a WHERE clause is prohibited.")

    # --- HD6: Private / Metadata / Non-HTTP Network Target ---
    if action in ("http.get", "http.post"):
        host = canon_params.get("host", "")
        if host and is_private_or_special_ip(host):
            raise HardDenyException("HD6", f"Access to private/metadata IP or loopback address '{host}' is prohibited.")

    # --- HD5: Disallowed Egress ---
    if action == "http.get":
        allowed_hosts = egress_allowlists.get("http.get", ["docs.local", "news.local"])
        host = canon_params.get("host", "")
        if host and host not in allowed_hosts:
            raise HardDenyException("HD5", f"Egress HTTP GET to host '{host}' not in allowlist {allowed_hosts}.")

    if action == "http.post":
        allowed_hosts = egress_allowlists.get("http.post", ["api.internal.local"])
        host = canon_params.get("host", "")
        if host and host not in allowed_hosts:
            raise HardDenyException("HD5", f"Egress HTTP POST to host '{host}' not in allowlist {allowed_hosts}.")

    if action == "email.send":
        allowed_domains = egress_allowlists.get("email.send", ["internal.local", "company.local"])
        recip_domain = canon_params.get("recipient_domain", "")
        if recip_domain and recip_domain not in allowed_domains:
            raise HardDenyException("HD5", f"Email domain '{recip_domain}' not in allowlist {allowed_domains}.")

    # --- HD7: Sensitive-Data Exfiltration Armed ---
    if action in ("http.post", "email.send") and session_ledger_entries:
        # Check if session read confidential or restricted data in the session history
        has_armed_sensitive_read = False
        for entry in session_ledger_entries:
            sens = entry.get("sensitivity", "public")
            if sens in ("confidential", "restricted"):
                has_armed_sensitive_read = True
                break
        if has_armed_sensitive_read:
            raise HardDenyException("HD7", "Session is armed with confidential data; external data transmission blocked.")

    # --- HD8: Untrusted Lineage Indicator Match ---
    if session_ledger_entries:
        # Collect untrusted indicators from session ledger
        untrusted_indicators = set()
        for entry in session_ledger_entries:
            if entry.get("trust") == "untrusted":
                indicators = entry.get("indicators", [])
                for ind in indicators:
                    if len(ind) >= 6:
                        untrusted_indicators.add(ind.lower())
                        
        # Check if target or params contain untrusted indicators
        target_check = canon_target.lower()
        params_str = str(canon_params).lower()
        for ind in untrusted_indicators:
            if ind in target_check or ind in params_str:
                raise HardDenyException("HD8", f"Request contains untrusted lineage indicator '{ind}' from malicious content.")

    # --- HD9: Approval Redemption Failure ---
    if approval_object:
        app_status = approval_object.get("status")
        app_hash = approval_object.get("request_hash")
        
        if app_status != "APPROVED":
            raise HardDenyException("HD9", f"Approval status is '{app_status}', expected 'APPROVED'.")
        if request_hash and app_hash != request_hash:
            raise HardDenyException("HD9", "Approval request hash mismatch. Replay or modified payload detected.")

    # --- HD10: Missing Least-Privilege Grant ---
    if session_grants is not None:
        matched_grant = False
        for grant in session_grants:
            g_action = grant.get("action")
            g_glob = grant.get("target_glob", "")
            
            # Action match (* or exact)
            if g_action in ("*", action):
                # Target glob match
                if fnmatch.fnmatch(canon_target, g_glob) or g_glob in ("*", "file:*", "db:*", "http:*"):
                    matched_grant = True
                    break
        if not matched_grant:
            raise HardDenyException("HD10", f"Action '{action}' on target '{canon_target}' is not permitted by session grants.")
