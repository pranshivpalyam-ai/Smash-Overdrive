"""
Local dev server for Smash Overdrive that tells the browser never to cache.

    python serve.py            # http://127.0.0.1:8123/index.html
    python serve.py 9000       # another port

Plain `python -m http.server` sends no Cache-Control header, so Chrome keeps
JavaScript modules for hours and a normal refresh shows stale code (missing
stands, no music, old tuning). This wrapper adds `Cache-Control: no-store` to
every response so each load fetches the current files.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # one line per request
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f"Smash Overdrive dev server: http://127.0.0.1:{port}/index.html  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
