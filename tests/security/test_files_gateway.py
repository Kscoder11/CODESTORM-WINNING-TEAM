import pytest
import os
from gateway.files import open_secure_file

def test_path_escape_rejected():
    with pytest.raises(PermissionError, match="Path escape detected"):
        open_secure_file("/etc/passwd", mode="r")

def test_relative_path_rejected():
    with pytest.raises(ValueError, match="Absolute path required"):
        open_secure_file("workspace/file.txt", mode="r")

def test_symlink_rejected(tmp_path):
    import gateway.files
    gateway.files.WORKSPACE_DIR = str(tmp_path)
    
    target_file = tmp_path / "target.txt"
    target_file.write_text("hello")
    symlink_file = tmp_path / "symlink.txt"
    try:
        try:
            os.symlink(target_file, symlink_file)
        except OSError:
            pytest.skip("Symlink creation not permitted in this environment")
        with pytest.raises(PermissionError, match="Symlinks are not allowed"):
            open_secure_file(str(symlink_file), mode="r")
    finally:
        gateway.files.WORKSPACE_DIR = "/workspace"
