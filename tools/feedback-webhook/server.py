#!/usr/bin/env python3
"""Signed Unix-socket receiver, loopback SSE and ACK. No LLM dependency."""
import argparse
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import signal
from pathlib import Path
import socketserver
import threading
import time

from protocol import MAX_BODY, private_json, signing_keys, verify
from store import Conflict, Full, Store


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass  # Request bodies and credentials must never enter access logs.

    def reply(self, status, value):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def body(self):
        if self.headers.get('Transfer-Encoding'):
            raise ValueError('Chunked requests are not accepted')
        length = int(self.headers.get('Content-Length', '-1'))
        if not 0 < length <= MAX_BODY:
            raise ValueError('Invalid request length')
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise ValueError('Incomplete request')
        return raw

    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+self.server.token)

    def do_POST(self):
        try:
            if self.path == '/events' and self.server.receiver:
                raw = self.body()
                event = verify(raw, self.headers, self.server.keys, self.server.allowed)
                seq = self.server.store.accept(event, raw)
                return self.reply(201, {'seq': seq, 'checksum': hashlib.sha256(raw).hexdigest()})
            if self.path == '/ack' and not self.server.receiver and self.authorized():
                value = json.loads(self.body())
                if set(value) != {'seq', 'checksum'} or type(value['seq']) is not int:
                    raise ValueError('Invalid ACK')
                self.server.store.ack(value['seq'], value['checksum'])
                return self.reply(200, {'accepted': True})
            self.reply(403, {'error': 'Not authorized'})
        except Conflict:
            self.reply(409, {'error': 'Conflicting event quarantined'})
        except Full:
            self.reply(507, {'error': 'Queue full; retry later'})
        except (ValueError, KeyError, TypeError, UnicodeError):
            self.reply(400, {'error': 'Invalid signed request'})
        except Exception:
            self.reply(503, {'error': 'Durable commit not confirmed; retry later'})

    def do_GET(self):
        if self.path != '/stream' or self.server.receiver or not self.authorized():
            return self.reply(403, {'error': 'Not authorized'})
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            # A new connection replays ALL unacknowledged records, including gaps.
            # Never use a maximum source event ID as a recovery cursor.
            while not self.server.stopping.is_set():
                for row in self.server.store.pending():
                    value = {'seq': row['seq'], 'checksum': row['checksum'], 'body': base64.b64encode(row['body']).decode('ascii')}
                    self.wfile.write(('id: '+str(row['seq'])+'\ndata: '+json.dumps(value,separators=(',',':'))+'\n\n').encode())
                self.wfile.write(b': transport keepalive\n\n')
                self.wfile.flush()
                self.server.stopping.wait(2)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def serve(store, unix_path, port, keys, token, allowed, ready=None, stop=None):
    if len(token) < 32:
        raise ValueError('Stream bearer token must contain at least 32 characters')
    path = Path(unix_path)
    if path.exists() or path.is_symlink():
        raise ValueError('Socket path already exists; verify previous owner before cleanup')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    unix = UnixServer(str(path), Handler)
    os.chmod(path, 0o660)
    try:
        tcp = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    except BaseException:
        unix.server_close()
        path.unlink()
        raise
    tcp.daemon_threads = True
    stopping = stop or threading.Event()
    for server, receiver in ((unix, True), (tcp, False)):
        server.store, server.receiver = store, receiver
        server.keys, server.token, server.allowed = keys, token, allowed
        server.stopping = stopping
    threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (unix,tcp)]
    for thread in threads:
        thread.start()
    if ready:
        ready(tcp.server_address[1])
    try:
        stopping.wait()
    finally:
        for server in (unix,tcp):
            server.shutdown()
            server.server_close()
        path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    config = private_json(args.config)
    allowed = {tuple(v) for v in config['allowed_sources']}
    stopping = threading.Event()
    for signum in (signal.SIGINT,signal.SIGTERM):
        signal.signal(signum,lambda *_: stopping.set())
    serve(Store(config['database']), config['unix_socket'], config['port'],
          signing_keys(config['key_file']), config['stream_token'], allowed, stop=stopping)


if __name__ == '__main__':
    main()
