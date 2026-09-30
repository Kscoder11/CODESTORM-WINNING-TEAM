import socket
import urllib.request
import urllib.parse
from urllib.error import URLError, HTTPError
import ipaddress

ALLOWED_DOMAINS = {"example.com", "api.example.com"}
MAX_RESPONSE_SIZE = 1024 * 1024
TIMEOUT = 5

def is_allowed_domain(domain):
    return domain.lower() in ALLOWED_DOMAINS

def is_safe_ip(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
            return False
        if str(ip) == "169.254.169.254":
            return False
        return True
    except ValueError:
        return False

def secure_http_request(url, method="GET", data=None, headers=None, max_redirects=5):
    if headers is None:
        headers = {}
    current_url = url
    redirects_followed = 0

    while redirects_followed <= max_redirects:
        parsed_url = urllib.parse.urlparse(current_url)
        if parsed_url.scheme not in ["http", "https"]:
            raise ValueError("Only HTTP/HTTPS allowed")
        domain = parsed_url.hostname
        if not is_allowed_domain(domain):
            raise PermissionError(f"Domain {domain} is not in the allowed list")

        try:
            ip = socket.gethostbyname(domain)
        except socket.gaierror:
            raise URLError(f"Could not resolve domain {domain}")

        if not is_safe_ip(ip):
            raise PermissionError(f"IP {ip} is not allowed (private/metadata)")

        req = urllib.request.Request(current_url, data=data, headers=headers, method=method)
        try:
            class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    return None
            opener = urllib.request.build_opener(NoRedirectHandler)
            response = opener.open(req, timeout=TIMEOUT)
            body = response.read(MAX_RESPONSE_SIZE + 1)
            if len(body) > MAX_RESPONSE_SIZE:
                raise ValueError("Response exceeds 1MB limit")
            return {"status": response.status, "headers": dict(response.headers), "body": body}

        except HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                redirects_followed += 1
                current_url = urllib.parse.urljoin(current_url, e.headers.get('Location'))
                continue
            else:
                body = e.read(MAX_RESPONSE_SIZE + 1)
                if len(body) > MAX_RESPONSE_SIZE:
                    raise ValueError("Response exceeds 1MB limit")
                return {"status": e.code, "headers": dict(e.headers), "body": body}
    raise ValueError("Too many redirects")
