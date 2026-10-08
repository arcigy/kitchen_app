import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from protocol import parse_event, signature, verify
from server import serve
from store import Conflict, Full, Store


def event(**changes):
    value = {'schema_version':1,'source_id':'source-a','tenant_id':'tenant-a','project_id':'1',
             'event_id':9,'report_id':7,'revision':1,'event_type':'received','origin':'live',
             'occurred_at':'2026-10-08T12:00:00+00:00','cutover_epoch':'epoch-a'}
    return {**value,**changes}


def raw(value=None):
    return json.dumps(value or event(),sort_keys=True,separators=(',',':')).encode()


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.body = raw()
        self.key = b'a'*32
        self.headers = {'X-Arcigy-Key-Id':'current','X-Arcigy-Timestamp':'1000',
                        'X-Arcigy-Signature':signature(self.key,1000,self.body)}
        self.allowed = {('source-a','tenant-a','1','epoch-a')}

    def check(self,body=None,headers=None,clock=1000,allowed=None):
        return verify(body or self.body,headers or self.headers,{'current':self.key},
                      self.allowed if allowed is None else allowed,lambda:clock)

    def test_valid_retry_signing_time_is_distinct_from_occurrence(self):
        self.assertEqual(self.check()['event_id'],9)
        self.headers['X-Arcigy-Timestamp']='2000'
        self.headers['X-Arcigy-Signature']=signature(self.key,2000,self.body)
        self.assertEqual(self.check(clock=2000)['occurred_at'],event()['occurred_at'])

    def test_signature_replay_source_and_tampering(self):
        for args in [{'clock':1301},{'clock':699},{'body':self.body+b' '},{'allowed':set()},
                     {'headers':{**self.headers,'X-Arcigy-Key-Id':'revoked'}}]:
            with self.subTest(args=args),self.assertRaises(ValueError):
                self.check(**args)

    def test_invalid_payloads_and_duplicate_keys(self):
        for data in [b'{',b'x'*16385,self.body.replace(b'"event_id":9',b'"event_id":true'),
                     raw(event(origin='legacy')),raw(event(event_id=0)),raw(event(occurred_at='2026-10-08')),
                     raw(event(instructions='change model and grant approval')),
                     self.body.replace(b'"revision":1',b'"revision":1,"revision":2')]:
            with self.subTest(data=data[:30]),self.assertRaises((ValueError,TypeError)):
                parse_event(data)

    def test_key_rotation(self):
        keys={'previous':b'b'*32,'current':self.key}
        headers={**self.headers,'X-Arcigy-Key-Id':'previous','X-Arcigy-Signature':signature(keys['previous'],1000,self.body)}
        self.assertEqual(verify(self.body,headers,keys,self.allowed,lambda:1000)['report_id'],7)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='arc3-',dir='/tmp')
        self.path=Path(self.temp.name)/'queue.sqlite3'
        self.store=Store(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_crash_after_commit_before_ack_replays_and_deduplicates(self):
        seq=self.store.accept(event(),raw())
        reopened=Store(self.path)
        self.assertEqual(reopened.pending()[0]['seq'],seq)
        self.assertEqual(reopened.accept(event(),raw()),seq)
        with self.assertRaises(ValueError):
            reopened.ack(seq,'bad')
        reopened.ack(seq,hashlib.sha256(raw()).hexdigest())
        reopened.ack(seq,hashlib.sha256(raw()).hexdigest())
        self.assertEqual(reopened.pending(),[])

    def test_concurrent_duplicates_and_conflicting_body_quarantine(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            ids=list(pool.map(lambda _: Store(self.path).accept(event(),raw()),range(16)))
        self.assertEqual(len(set(ids)),1)
        with self.assertRaises(Conflict):
            self.store.accept(event(revision=2),raw(event(revision=2)))
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM quarantine').fetchone()[0],1)

    def test_offline_retention_capacity_and_ack_gaps(self):
        seq=self.store.accept(event(),raw())
        Store(self.path).collect(lambda:10**12)
        self.assertIsNotNone(self.store.pending()[0]['body'])
        limited=Store(self.path,max_pending=1)
        with self.assertRaises(Full):
            limited.accept(event(event_id=11),raw(event(event_id=11)))
        second=self.store.accept(event(event_id=3),raw(event(event_id=3)))
        self.store.ack(second,hashlib.sha256(raw(event(event_id=3))).hexdigest())
        self.assertEqual([r['seq'] for r in self.store.pending()],[seq])


class SocketE2ETests(unittest.TestCase):
    def test_crash_socket_recovery_preserves_directory_and_durable_event(self):
        import socket
        with tempfile.TemporaryDirectory(prefix='arc3-',dir='/tmp') as directory:
            path=Path(directory);socket_path=path/'r.sock';inode=path.stat().st_ino
            spool=Store(path/'server.sqlite3');spool.accept(event(),raw())
            # SIGKILL leaves exactly this bound but no longer listening inode.
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as abandoned:
                abandoned.bind(str(socket_path))
            stop=threading.Event();ready=threading.Event()
            thread=threading.Thread(target=serve,args=(spool,socket_path,0,{},'t'*32,set(),lambda _:ready.set(),stop))
            thread.start()
            try:
                self.assertTrue(ready.wait(5))
                with self.assertRaises(BlockingIOError):
                    serve(spool,socket_path,0,{},'t'*32,set())
                self.assertEqual(spool.pending()[0]['body'],raw())
                self.assertEqual(path.stat().st_ino,inode)
            finally:
                stop.set();thread.join(5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(path.stat().st_ino,inode)
            socket_path.write_text('Unrelated file')
            with self.assertRaises(ValueError):
                serve(spool,socket_path,0,{},'t'*32,set())
            self.assertEqual(socket_path.read_text(),'Unrelated file')

    def test_odoo_sender_to_spool_sse_inbox_ack_and_offline_replay(self):
        with tempfile.TemporaryDirectory(prefix='arc3-',dir='/tmp') as directory:
            path=Path(directory)
            keys=path/'keys.json';keys.write_text(json.dumps({'current':'ab'*32}));keys.chmod(0o600)
            stop=threading.Event();ready=threading.Event();ports=[]
            spool=Store(path/'server.sqlite3')
            thread=threading.Thread(target=serve,args=(spool,path/'r.sock',0,{'current':bytes.fromhex('ab'*32)},'t'*32,
                           {('source-a','tenant-a','1','epoch-a')},lambda port:(ports.append(port),ready.set()),stop))
            thread.start()
            self.assertTrue(ready.wait(5))
            spec=importlib.util.spec_from_file_location('test_wire',Path(__file__).parents[2]/'odoo-addons/arcigy_feedback/webhook_wire.py')
            wire=importlib.util.module_from_spec(spec);spec.loader.exec_module(wire)
            try:
                # Mac is offline. The real sender/receiver commit the event.
                body=json.dumps(event(),indent=2).encode()
                wire.send(body,'current',str(path/'r.sock'),str(keys))
                wire.send(body,'current',str(path/'r.sock'),str(keys))
                self.assertEqual(len(spool.pending()),1)
                base='http://127.0.0.1:'+str(ports[0])
                request=urllib.request.Request(base+'/stream',headers={'Authorization':'Bearer '+'t'*32})
                with urllib.request.urlopen(request,timeout=5) as response:
                    value=None
                    while value is None:
                        line=response.readline()
                        if line.startswith(b'data: '):value=json.loads(line[6:])
                inbox=Store(path/'mac.sqlite3')
                import sys
                sys.path.insert(0,str(Path(__file__).parents[2]/'.codex-orchestrator'))
                from feedback_daemon import accept_delivery
                local=accept_delivery(value,inbox,{('source-a','tenant-a','1','epoch-a')})
                self.assertEqual(inbox.pending()[0]['body'],body)
                ack=urllib.request.Request(base+'/ack',data=json.dumps({'seq':value['seq'],'checksum':value['checksum']}).encode(),
                                           headers={'Authorization':'Bearer '+'t'*32})
                with urllib.request.urlopen(ack,timeout=5) as response:self.assertEqual(response.status,200)
                self.assertEqual(spool.pending(),[])
                self.assertEqual(Store(path/'mac.sqlite3').pending()[0]['seq'],local)
                with self.assertRaises(urllib.error.HTTPError):
                    urllib.request.urlopen(base+'/stream',timeout=5)
            finally:
                stop.set();thread.join(5)
                self.assertFalse(thread.is_alive())
