import fnmatch

def check_session_grant(action: str, canon_target: str, grants: list) -> bool:
    """
    Verifies if any of the session's active grants match the requested action and canonical target.
    """
    if not grants:
        return False
        
    for grant in grants:
        g_action = grant.get("action", "")
        g_glob = grant.get("target_glob", "")
        
        if g_action == "*" or g_action == action:
            if g_glob in ("*", "file:*", "db:*", "http:*", "email:*"):
                return True
            if fnmatch.fnmatch(canon_target, g_glob):
                return True
                
    return False
