import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8793


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


http.server.test(HandlerClass=NoCacheHandler, port=port)
