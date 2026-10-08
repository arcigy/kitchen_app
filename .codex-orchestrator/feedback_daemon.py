#!/usr/bin/env python3
"""Receive notifications through an outbound SSH tunnel. No timer invokes LLM."""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.request

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools/feedback-webhook'))
from protocol import MAX_BODY, parse_event, private_json
from store import Store
from coordinator import Coordinator
from model_policy import ModelPolicy
from app_server_adapter import AppServerAdapter
from feedback_events import Processor


def accept_delivery(value, inbox, allowed):
    if not isinstance(value,dict) or set(value) != {'seq','checksum','body'} or type(value['seq']) is not int or value['seq'] < 1:
        raise ValueError('Invalid stream delivery')
    if not isinstance(value['body'],str) or len(value['body']) > MAX_BODY*2:
        raise ValueError('Oversized stream delivery')
    raw = base64.b64decode(value['body'],validate=True)
    if hashlib.sha256(raw).hexdigest() != value['checksum']:
        raise ValueError('Stream payload checksum mismatch')
    event = parse_event(raw)
    if tuple(event[k] for k in ('source_id','tenant_id','project_id','cutover_epoch')) not in allowed:
        raise ValueError('Stream source is not enabled')
    return inbox.accept(event,raw)


def tunnel(config):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+',config['ssh_destination']):
        raise ValueError('Invalid SSH destination')
    for key in ('local_port','remote_port'):
        if type(config[key]) is not int or not 1024 <= config[key] <= 65535 or config[key] in {5180,5191}:
            raise ValueError('Use a dedicated non-shared port')
    return subprocess.Popen(['ssh','-N','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
        '-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3',
        '-o','UserKnownHostsFile='+config['known_hosts'],'-i',config['ssh_identity'],
        '-L','127.0.0.1:'+str(config['local_port'])+':127.0.0.1:'+str(config['remote_port']),
        config['ssh_destination']],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


def consume(base, token, inbox, allowed, stop, on_delivery):
    request = urllib.request.Request(base+'/stream',headers={'Authorization':'Bearer '+token})
    # No proxy environment, redirects or public destinations are used.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):
            raise ValueError('Stream redirect rejected')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
    with opener.open(request,timeout=10) as response:
        if response.headers.get_content_type() != 'text/event-stream':
            raise ValueError('Unexpected event stream')
        while not stop.is_set():
            line = response.readline(MAX_BODY*2+1024)
            if not line:
                break
            if len(line) >= MAX_BODY*2+1024:
                raise ValueError('Oversized stream line')
            if not line.startswith(b'data: '):
                continue
            value = json.loads(line[6:])
            seq = accept_delivery(value,inbox,allowed)
            ack = urllib.request.Request(base+'/ack',data=json.dumps({'seq':value['seq'],'checksum':value['checksum']}).encode(),
                    headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with opener.open(ack,timeout=10) as result:
                if result.status != 200:
                    raise RuntimeError('ACK was not confirmed')
            on_delivery(seq)


def drain(processor):
    after = 0
    while True:
        with processor.inbox.connect() as db:
            rows = [dict(r) for r in db.execute('SELECT * FROM deliveries WHERE acked IS NULL AND seq>? ORDER BY seq LIMIT 100',(after,))]
        if not rows:
            return
        for row in rows:
            after = row['seq']
            if row['state'] == 'waiting_runtime' and not processor.runtime.available():
                continue
            if row['state'] == 'dispatch_unknown' or (row['state']=='dispatched' and not processor.runtime.available()):
                continue
            try:
                processor.advance(row)
            except Exception:
                # The durable row survives. An unknown dispatch is never reset.
                with processor.inbox.connect() as db:
                    current = db.execute('SELECT state FROM deliveries WHERE seq=?',(row['seq'],)).fetchone()[0]
                if current != 'dispatch_unknown':
                    processor.inbox.state(row['seq'],'source_retry','Source/runtime operation unconfirmed; retained for retry')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True)
    args = parser.parse_args()
    os.umask(0o077)
    config = private_json(args.config)
    if len(config['stream_token']) < 32:
        raise ValueError('Invalid stream token')
    allowed = {tuple(row) for row in config['allowed_sources']}
    root = Path(config['coordinator_root']).resolve()
    spec = importlib.util.spec_from_file_location('arcigy_source_connector',root/'plugins/arcigy-feedback/scripts/server.py')
    source = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(source)
    c, inbox = Coordinator(root), Store(config['inbox'])
    # No config boolean can declare independent saved history a shared runtime.
    # Automatic wake remains inactive until a supported verifier is supplied.
    processor = Processor(c,inbox,source,AppServerAdapter(),ModelPolicy(root),config.get('authorization_policy'))
    stop = threading.Event()
    for signum in (signal.SIGINT,signal.SIGTERM):
        signal.signal(signum,lambda *_: stop.set())
    base = 'http://127.0.0.1:'+str(config['local_port'])
    delay = 1
    work = threading.Event()
    def process_inbox():
        while not stop.is_set():
            work.wait(30)
            work.clear()
            if not stop.is_set():
                drain(processor)
    worker = threading.Thread(target=process_inbox,daemon=True)
    worker.start()
    while not stop.is_set():
        child = tunnel(config)
        try:
            stop.wait(1)
            if child.poll() is not None:
                raise RuntimeError('Owned SSH tunnel did not start')
            work.set()
            consume(base,config['stream_token'],inbox,allowed,stop,lambda _: work.set())
            delay = 1
        except Exception:
            # Reconnect retries the deterministic transport, never an LLM turn.
            delay = min(60,delay*2)
        finally:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        stop.wait(delay)


if __name__ == '__main__':
    main()
