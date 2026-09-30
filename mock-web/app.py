import json
from http.server import BaseHTTPRequestHandler, HTTPServer

class MockWebHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"message": "Hello from mock-web"}).encode())
        
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "received", "data_length": len(post_data)}).encode())

def run():
    print('Starting mock-web service...')
    server_address = ('', 80)
    httpd = HTTPServer(server_address, MockWebHandler)
    httpd.serve_forever()

if __name__ == '__main__':
    run()
