#!/usr/bin/env python3
"""
PUB400 bridge for the iBridge IBM i Command Lab.

The lab page (https://ibridge-mauve.vercel.app/lab) runs in YOUR browser, so it
can talk to this tiny server on YOUR computer at http://127.0.0.1:8765 — and
from here your home IP opens a real SSH session to pub400.com and runs the
SQL / CL command you picked. Your PUB400 password never touches Vercel; it
goes browser -> this script -> pub400.com, and is never written to disk.

Setup:
  1. Sign up free at https://www.pub400.com (you get a username + password).
  2. pip install paramiko        (once)
  3. python3 pub400_bridge.py    (keep it running while you use the lab)

Then open the lab, choose connection mode "Local bridge", and run commands.
"""
import json
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 8765
DEFAULT_REMOTE_HOST = "pub400.com"
DEFAULT_REMOTE_PORT = 2222
ALLOWED_ORIGINS = {
    "https://ibridge-mauve.vercel.app",
    "http://localhost:3000",
}

HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$", re.I)


def validate_host(host):
    h = (host or "").strip().lower() or DEFAULT_REMOTE_HOST
    if len(h) > 253 or not HOST_RE.match(h):
        return None, "Invalid host format."
    return h, None

SQL_ALLOW = re.compile(r"^\s*(select|values|with|explain)\b", re.I)
CL_DENY = re.compile(
    r"\b(chgusrprf|dltusrprf|chgpwd|pwr*dwnsys|strsst|inztap|dltlib|rmvlib|clrlib|"
    r"dltf|edtf|strsrvjob|chgjob|endjob)\b", re.I)


def validate(kind, command):
    cmd = (command or "").strip()
    if not cmd:
        return "Command is empty."
    if len(cmd) > 2000:
        return "Command too long (2000 chars max)."
    if kind == "sql" and not SQL_ALLOW.match(cmd):
        return "SQL is limited to read-only statements (SELECT / VALUES / WITH / EXPLAIN)."
    if kind == "cl" and CL_DENY.search(cmd):
        return "That CL command is blocked on the shared runner."
    return None


def to_system_command(kind, command):
    if kind == "sql":
        escaped = command.replace("'", "''")
        return 'system "RUNSQL SQL(\'%s\') COMMIT(*NONE)"' % escaped
    return 'system "%s"' % command.replace('"', "'")


def run_on_host(username, password, kind, command, host, port=DEFAULT_REMOTE_PORT):
    import paramiko
    client = paramiko.SSHClient()
    # The operator's host key is shown on first connect so the user can
    # verify it against their provider's documentation.
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, port=port, username=username,
                       password=password, timeout=20, banner_timeout=20,
                       auth_timeout=20, allow_agent=False, look_for_keys=False)
        key = client.get_transport().get_remote_server_key()
        import hashlib, base64
        fp = base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        print("Host key SHA256 for %s: %s" % (host, fp), flush=True)
        _, stdout, stderr = client.exec_command(to_system_command(kind, command), timeout=60)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        text = (out + ("\n[stderr]\n" + err if err.strip() else "")).strip()
        return {"output": text or "(command completed, no output)"}
    except Exception as e:  # paramiko.AuthenticationException etc.
        msg = str(e)
        if "authentication" in msg.lower():
            raise RuntimeError("Login failed — check your username/password on that host.")
        raise RuntimeError("SSH error: %s" % msg[:200])
    finally:
        client.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "Pub400Bridge/1.0"

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if urllib.parse.urlparse(self.path).path == "/health":
            self._json(200, {"ok": True, "default_host": DEFAULT_REMOTE_HOST, "mode": "local-bridge"})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/run":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode() or "{}")
        except Exception:
            self._json(422, {"error": "validation", "message": "JSON body required."})
            return
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        kind = "cl" if body.get("kind") == "cl" else "sql"
        command = str(body.get("command", ""))
        host, host_problem = validate_host(body.get("host"))
        if host_problem:
            self._json(422, {"error": "validation", "message": host_problem})
            return
        try:
            port = int(body.get("port") or DEFAULT_REMOTE_PORT)
        except (TypeError, ValueError):
            port = -1
        if port < 1 or port > 65535:
            self._json(422, {"error": "validation", "message": "Port must be between 1 and 65535."})
            return
        if not username or not password:
            self._json(422, {"error": "validation",
                             "message": "Username and password are required."})
            return
        problem = validate(kind, command)
        if problem:
            self._json(422, {"error": "validation", "message": problem})
            return
        try:
            result = run_on_host(username, password, kind, command, host, port)
            self._json(200, {"data": {"kind": kind, "command": command, "host": host,
                                      "output": result["output"][:20000], "port": port}})
        except RuntimeError as e:
            self._json(502, {"error": "ibmi", "message": str(e)[:300]})
        except Exception as e:  # never leak tracebacks
            self._json(502, {"error": "ibmi", "message": "Bridge error: %s" % str(e)[:160]})

    def log_message(self, *args):
        sys.stdout.write("bridge: %s\n" % (args[0] % args[1:]))


if __name__ == "__main__":
    try:
        import paramiko  # noqa: F401
    except ImportError:
        sys.exit("paramiko is required: pip install paramiko")
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print("PUB400 bridge listening on http://%s:%d" % (HOST, PORT), flush=True)
    print("Open https://ibridge-mauve.vercel.app/lab and pick 'Local bridge'.", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbridge stopped.")
