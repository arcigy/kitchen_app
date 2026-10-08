"""Durable spool/inbox. Redelivery is normal; conflicting event bodies are not."""
import contextlib
import hashlib
import json
from pathlib import Path
import sqlite3
import time


class Conflict(ValueError):
    pass


class Full(RuntimeError):
    pass


class Store:
    def __init__(self, path, max_pending=100000, max_bytes=1024**3):
        self.path = str(path)
        self.max_pending, self.max_bytes = max_pending, max_bytes
        Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with contextlib.closing(sqlite3.connect(self.path, timeout=10, isolation_level=None)) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS deliveries (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL, tenant TEXT NOT NULL, event INTEGER NOT NULL,
                    body BLOB, checksum TEXT NOT NULL, accepted REAL NOT NULL,
                    acked REAL, state TEXT NOT NULL DEFAULT 'pending', detail TEXT,
                    UNIQUE(source,tenant,event));
                CREATE TABLE IF NOT EXISTS quarantine (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, tenant TEXT,
                    event INTEGER, checksum TEXT, received REAL);
            ''')

    @contextlib.contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        db.execute('BEGIN IMMEDIATE')
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def accept(self, event, raw):
        identity = (event['source_id'], event['tenant_id'], event['event_id'])
        checksum = hashlib.sha256(raw).hexdigest()
        conflict = False
        with self.connect() as db:
            old = db.execute('SELECT seq,checksum FROM deliveries WHERE source=? AND tenant=? AND event=?', identity).fetchone()
            if old:
                if old['checksum'] == checksum:
                    return old['seq']
                db.execute('INSERT INTO quarantine(source,tenant,event,checksum,received) VALUES(?,?,?,?,?)', (*identity, checksum, time.time()))
                conflict = True
            else:
                count, size = db.execute('SELECT count(*),coalesce(sum(length(body)),0) FROM deliveries WHERE acked IS NULL').fetchone()
                if count >= self.max_pending or size + len(raw) > self.max_bytes:
                    raise Full('Durable queue capacity reached; sender must retain outbox')
                return db.execute('INSERT INTO deliveries(source,tenant,event,body,checksum,accepted) VALUES(?,?,?,?,?,?)',
                                  (*identity, raw, checksum, time.time())).lastrowid
        if conflict:
            raise Conflict('Event identity was reused with different contents; quarantined')

    def pending(self, limit=100):
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM deliveries WHERE acked IS NULL ORDER BY seq LIMIT ?', (limit,))]

    def ack(self, seq, checksum):
        with self.connect() as db:
            row = db.execute('SELECT checksum FROM deliveries WHERE seq=?', (seq,)).fetchone()
            if not row or row['checksum'] != checksum:
                raise ValueError('ACK does not identify a durable delivery')
            db.execute('UPDATE deliveries SET acked=coalesce(acked,?) WHERE seq=?', (time.time(), seq))

    def state(self, seq, state, detail=None):
        with self.connect() as db:
            db.execute('UPDATE deliveries SET state=?,detail=? WHERE seq=?', (state, detail, seq))

    def collect(self, clock=time.time):
        # Retain identifiers/checksums forever. Unacknowledged events never expire.
        with self.connect() as db:
            db.execute('UPDATE deliveries SET body=NULL WHERE acked < ?', (clock()-90*86400,))
