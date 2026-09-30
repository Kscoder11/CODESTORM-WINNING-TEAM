import os
import stat

WORKSPACE_DIR = "/workspace"

def open_secure_file(file_path: str, mode: str = 'r', max_size: int = None):
    if not os.path.isabs(file_path):
        raise ValueError("Absolute path required")
        
    resolved_path = os.path.realpath(file_path)
    if not resolved_path.startswith(WORKSPACE_DIR + os.sep) and resolved_path != WORKSPACE_DIR:
        raise PermissionError("Path escape detected")
        
    current_path = "/"
    parts = file_path.strip("/").split("/")
    for part in parts:
        if not part:
            continue
        current_path = os.path.join(current_path, part)
        if os.path.islink(current_path):
            raise PermissionError("Symlinks are not allowed")

    flags = os.O_NOFOLLOW
    if mode == 'r':
        flags |= os.O_RDONLY
    elif mode == 'w':
        flags |= os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    elif mode == 'a':
        flags |= os.O_WRONLY | os.O_CREAT | os.O_APPEND
    else:
        raise ValueError("Unsupported mode")

    try:
        fd = os.open(resolved_path, flags)
    except FileNotFoundError:
        if 'w' in mode or 'a' in mode:
            fd = os.open(resolved_path, flags)
        else:
            raise

    try:
        if max_size:
            st = os.fstat(fd)
            if mode == 'r' and st.st_size > max_size:
                raise ValueError("File exceeds maximum allowed size for reading")
        return os.fdopen(fd, mode)
    except Exception:
        os.close(fd)
        raise
