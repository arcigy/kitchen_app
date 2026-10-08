"""Pure local-socket webhook sender; imported without Odoo by regression tests."""
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import re
import socket
import stat
import time

SOCKET = '/run/arcigy-feedback-webhook/receiver.sock'
KEY_FILE = '/etc/arcigy-feedback-webhook/signing-keys.json'


class UnixConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.host)


def send(raw, key_id, socket_path=SOCKET, key_file=KEY_FILE):
    path = Path(key_file)
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise ValueError('Signing keys must be an owned private file')
    encoded = json.loads(path.read_text())[key_id]
    if not isinstance(encoded, str) or not re.fullmatch(r'[0-9a-f]{64,128}', encoded):
        raise ValueError('Invalid signing key')
    timestamp = str(int(time.time()))
    signature = hmac.new(bytes.fromhex(encoded), timestamp.encode()+b'.'+raw, hashlib.sha256).hexdigest()
    connection = UnixConnection(socket_path, timeout=3)
    try:
        connection.request('POST', '/events', body=raw, headers={
            'Content-Type': 'application/json', 'X-Arcigy-Key-Id': key_id,
            'X-Arcigy-Timestamp': timestamp, 'X-Arcigy-Signature': signature})
        response = connection.getresponse()
        result = response.read(4097)
        if response.status not in (200, 201) or len(result) > 4096:
            raise RuntimeError('Receiver did not confirm durable commit')
        value = json.loads(result)
        if value.get('checksum') != hashlib.sha256(raw).hexdigest():
            raise RuntimeError('Receiver confirmed a different payload')
    finally:
        connection.close()
