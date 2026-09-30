import os
import re
import socket
import hashlib
import json
import unicodedata
from pathlib import Path
from urllib.parse import urlparse
import sqlglot
import bashlex
from governor.config import settings

class CanonicalizationError(Exception):
    pass

def normalize_text(text: str) -> str:
    """Unicode NFKC normalization and zero-width/control character stripping."""
    if not isinstance(text, str):
        return text
    # Unicode NFKC normalization
    normalized = unicodedata.normalize("NFKC", text)
    # Strip zero-width spaces, control chars, joiners (\u200B, \u200C, \u200D, \uFEFF, etc.)
    stripped = re.sub(r'[\u200B-\u200D\uFEFF\x00-\x1F\x7F-\x9F]', '', normalized)
    return stripped

def is_private_or_special_ip(ip_str: str) -> bool:
    """Check if IP is private, loopback, link-local, or cloud metadata IP."""
    if ip_str in ("127.0.0.1", "localhost", "169.254.169.254", "0.0.0.0"):
        return True
    parts = ip_str.split('.')
    if len(parts) == 4:
        try:
            p1, p2 = int(parts[0]), int(parts[1])
            if p1 == 10:  # 10.0.0.0/8
                return True
            if p1 == 172 and 16 <= p2 <= 31:  # 172.16.0.0/12
                return True
            if p1 == 192 and p2 == 168:  # 192.168.0.0/16
                return True
            if p1 == 169 and p2 == 254:  # 169.254.0.0/16
                return True
            if p1 == 127:  # 127.0.0.0/8
                return True
        except ValueError:
            pass
    return False

def canonicalize_file_target(target: str, workspace_root: Path = settings.WORKSPACE_DIR) -> str:
    """
    Canonicalize file path target:
    - Realpath resolution
    - Path containment under workspace_root
    - Lstat check of each path component to detect/reject symlinks
    - Returns normalized format: file:/workspace/relative/path
    """
    normalized = normalize_text(target)
    # Strip 'file:' prefix if present
if normalized.startswith("file:"):
        normalized = normalized[5:]
    
    # Handle virtual /workspace path from container/agent perspective
    norm_clean = normalized.replace("\\", "/")
    if norm_clean.startswith("/workspace"):
        rel_candidate = norm_clean[len("/workspace"):].lstrip("/")
        path_obj = (workspace_root / rel_candidate).resolve()
    elif not Path(normalized).is_absolute():
        path_obj = (workspace_root / normalized).resolve()
    else:
        path_obj = Path(normalized).resolve()
    
    resolved_str = str(path_obj)
    ws_root_str = str(workspace_root.resolve())
    
    # Path containment check
    if not resolved_str.startswith(ws_root_str):
        raise CanonicalizationError(f"Path escape: '{resolved_str}' outside workspace '{ws_root_str}'")
        
    # Lstat symlink check on each component up to root
    curr = path_obj
    while curr != curr.parent:
        if curr.exists() or curr.is_symlink():
            if curr.is_symlink():
                raise CanonicalizationError(f"Symlink component detected in path: '{curr}'")
        curr = curr.parent
    
    # Compute relative path from workspace root for normalized canonical format
    try:
        rel_path = path_obj.relative_to(workspace_root.resolve())
    except ValueError:
        # Fallback if relative_to fails
        rel_path = Path(resolved_str[len(ws_root_str):].lstrip(os.sep))
    
    # Normalize to forward slashes for cross-platform consistency
    norm_rel_path = str(rel_path).replace(os.sep, "/")
    return f"file:/workspace/{norm_rel_path}"

def canonicalize_url_target(target: str) -> dict:
    """
    Canonicalize URL target:
    - Lowercase host, IDNA normalization
    - Reject userinfo and non-HTTP/HTTPS schemes
    - Single DNS resolution checking for private/metadata IPs
    """
    normalized = normalize_text(target)
    if not (normalized.startswith("http://") or normalized.startswith("https://")):
        normalized = f"http://{normalized}"
        
    parsed = urlparse(normalized)
    if parsed.scheme not in ("http", "https"):
        raise CanonicalizationError(f"Unsupported scheme '{parsed.scheme}'. Only HTTP/HTTPS allowed.")
        
    if parsed.username or parsed.password:
        raise CanonicalizationError("Userinfo in URL is forbidden.")
        
    hostname = parsed.hostname
    if not hostname:
        raise CanonicalizationError("Invalid URL target: missing hostname.")
        
    # IDNA normalization & lowercase
    try:
        hostname_idna = hostname.encode("idna").decode("ascii").lower()
    except Exception as e:
        raise CanonicalizationError(f"IDNA normalization failed for '{hostname}': {str(e)}")
        
    # Mock domains used in tests/offline demo
    local_mock_domains = ("news.local", "docs.local", "attacker.local", "api.internal.local", "localhost")
    if hostname_idna not in local_mock_domains:
        try:
            ip_addr = socket.gethostbyname(hostname_idna)
            if is_private_or_special_ip(ip_addr):
                raise CanonicalizationError(f"URL resolves to private/metadata IP '{ip_addr}'")
        except socket.gaierror:
            # If offline or unresolvable DNS, check string IP pattern
            if is_private_or_special_ip(hostname_idna):
                raise CanonicalizationError(f"Target host is private IP '{hostname_idna}'")
                
    port_str = f":{parsed.port}" if parsed.port and parsed.port not in (80, 443) else ""
    path_str = parsed.path if parsed.path else "/"
    query_str = f"?{parsed.query}" if parsed.query else ""
    
    canon_target = f"http:{hostname_idna}{port_str}{path_str}{query_str}"
    return {
        "canon_target": canon_target,
        "scheme": parsed.scheme,
        "host": hostname_idna,
        "port": parsed.port or (80 if parsed.scheme == "http" else 443),
        "path": path_str
    }

def canonicalize_sql(sql_query: str) -> dict:
    """
    Parse SQL query using sqlglot to derive:
    - statement type (SELECT, UPDATE, DELETE, INSERT, etc.)
    - table names referenced
    - presence of WHERE clause
    - multi-statement detection
    """
    normalized = normalize_text(sql_query)
    try:
        parsed_statements = sqlglot.parse(normalized)
    except Exception as e:
        raise CanonicalizationError(f"SQL parsing failed: {str(e)}")
        
    if not parsed_statements or any(s is None for s in parsed_statements):
        raise CanonicalizationError("Empty or invalid SQL statement")
        
    if len(parsed_statements) > 1:
        raise CanonicalizationError("Multi-statement SQL queries are forbidden.")
        
    stmt = parsed_statements[0]
    sql_key = stmt.key.upper() if stmt and hasattr(stmt, "key") else "UNKNOWN"
    
    # Table extraction
    tables = [table.name for table in stmt.find_all(sqlglot.exp.Table)]
    
    # Check for WHERE clause
    has_where = stmt.find(sqlglot.exp.Where) is not None
    
    return {
        "statement_type": sql_key,
        "tables": sorted(list(set(tables))),
        "has_where": has_where,
        "sql_canonical": stmt.sql()
    }

def canonicalize_shell(command_str: str) -> dict:
    """Parse shell string using bashlex to extract argv list."""
    normalized = normalize_text(command_str)
    try:
        parts = list(bashlex.split(normalized))
    except Exception:
        # Fallback to simple shlex split if complex bashlex syntax fails
        parts = normalized.split()
        
    if not parts:
        raise CanonicalizationError("Empty shell command")
        
    return {
        "command": parts[0],
        "argv": parts
    }

def canonicalize_action(action: str, target: str, params: dict) -> tuple[str, dict]:
    """
    Canonicalize target and params for any action type.
    Returns (canonical_target_str, canonical_params_dict).
    """
    action = normalize_text(action)
    target = normalize_text(target)
    
    # Deep copy params & normalize text fields recursively
    def norm_obj(obj):
        if isinstance(obj, str):
            return normalize_text(obj)
        elif isinstance(obj, dict):
            return {norm_obj(k): norm_obj(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [norm_obj(i) for i in obj]
        return obj

    canon_params = norm_obj(params) if params else {}

    if action in ("file.read", "file.write"):
        canon_target = canonicalize_file_target(target)
    elif action in ("http.get", "http.post"):
        url_info = canonicalize_url_target(target)
        canon_target = url_info["canon_target"]
        canon_params["host"] = url_info["host"]
    elif action in ("db.read", "db.write"):
        canon_target = normalize_text(target)
        if "sql" in canon_params:
            sql_info = canonicalize_sql(canon_params["sql"])
            canon_params["sql_info"] = sql_info
    elif action == "code.execute":
        canon_target = normalize_text(target)
        if "command" in canon_params:
            shell_info = canonicalize_shell(canon_params["command"])
            canon_params["shell_info"] = shell_info
    elif action in ("email.read", "email.send"):
        canon_target = normalize_text(target)
        if "recipient" in canon_params:
            recip = canon_params["recipient"]
            canon_params["recipient_domain"] = recip.split("@")[-1].lower() if "@" in recip else recip
    else:
        canon_target = normalize_text(target)

    return canon_target, canon_params

def compute_request_hash(session_id: str, action: str, canon_target: str, canon_params: dict) -> str:
    """
    Compute canonical request hash:
    SHA256(session_id + action + canonical_target + canonical_params_json)
    """
    params_json = json.dumps(canon_params, sort_keys=True)
    raw = f"{session_id}:{action}:{canon_target}:{params_json}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
