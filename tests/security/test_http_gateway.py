import pytest
from gateway.http import is_safe_ip, secure_http_request

def test_safe_ips():
    assert is_safe_ip("8.8.8.8") == True
    assert is_safe_ip("192.168.1.1") == False
    assert is_safe_ip("127.0.0.1") == False
    assert is_safe_ip("169.254.169.254") == False

def test_unapproved_domain():
    with pytest.raises(PermissionError, match="not in the allowed list"):
        secure_http_request("http://malicious.com")

def test_non_http_rejected():
    with pytest.raises(ValueError, match="Only HTTP/HTTPS allowed"):
        secure_http_request("ftp://example.com")
