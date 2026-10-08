"""Only proxy an existing shared control socket. Never launch another runtime."""
import json
import os
from pathlib import Path
import queue
import stat
import subprocess
import threading
import time


class RuntimeUnavailable(RuntimeError):
    pass


class RuntimeBusy(RuntimeError):
    pass


class Proxy:
    def __init__(self, socket_path, executable='codex', timeout=10):
        self.socket_path = Path(socket_path)
        info = self.socket_path.lstat()
        if self.socket_path.is_symlink() or not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
            raise RuntimeUnavailable('Control socket is not an owned Unix socket')
        self.identity = {'path':str(self.socket_path),'device':info.st_dev,'inode':info.st_ino}
        self.timeout = timeout
        self.process = subprocess.Popen([executable,'app-server','proxy','--sock',str(self.socket_path)],
                                        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
        self.messages, self.notifications = queue.Queue(), []
        self.lock, self.counter = threading.Lock(), 0
        threading.Thread(target=self.read,daemon=True).start()
        try:
            self.call('initialize',{'clientInfo':{'name':'arcigy_feedback','version':'0.1.0'}})
            self.notify('initialized',{})
        except BaseException:
            self.close()
            raise

    def read(self):
        try:
            for line in self.process.stdout:
                if len(line) > 8*1024*1024:
                    break
                self.messages.put(json.loads(line))
        except (OSError,ValueError):
            pass
        finally:
            self.messages.put(None)

    def notify(self, method, params):
        self.process.stdin.write(json.dumps({'method':method,'params':params})+'\n')
        self.process.stdin.flush()

    def call(self, method, params):
        with self.lock:
            self.counter += 1
            request_id = self.counter
            self.process.stdin.write(json.dumps({'id':request_id,'method':method,'params':params})+'\n')
            self.process.stdin.flush()
            deadline = time.monotonic()+self.timeout
            while True:
                try:
                    message = self.messages.get(timeout=max(0,deadline-time.monotonic()))
                except queue.Empty:
                    raise TimeoutError('App-server result is unknown; reconcile before retry') from None
                if message is None:
                    raise RuntimeUnavailable('App-server proxy closed')
                if message.get('id') == request_id and 'method' not in message:
                    if 'error' in message:
                        raise RuntimeUnavailable('App-server rejected '+method)
                    return message['result']
                if 'method' in message and 'id' in message:
                    # Never auto-approve runtime permission requests.
                    self.process.stdin.write(json.dumps({'id':message['id'],'error':{'code':-32601,'message':'Human interaction required'}})+'\n')
                    self.process.stdin.flush()
                else:
                    self.notifications.append(message)

    def close(self):
        # This is our stdio proxy, never the shared daemon itself.
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()


class AppServerAdapter:
    def __init__(self, transport=None, shared_runtime_verifier=None):
        self.transport = transport
        # No supported shared desktop runtime attestation is available yet.
        # Production deliberately supplies no verifier. A saved thread/read is
        # not sufficient proof. Fixture tests inject a controlled fake runtime.
        self.verifier = shared_runtime_verifier

    def available(self):
        return bool(self.transport and self.verifier and self.verifier(self.transport.identity,None))

    def require_shared(self, thread=None):
        if not self.available() or not self.verifier(self.transport.identity,thread):
            raise RuntimeUnavailable('Shared native runtime identity is unverified; automatic wake is inactive')

    def idle(self, task):
        self.require_shared()
        session = task.get('session')
        if not session:
            return True
        thread = self.transport.call('thread/read',{'threadId':session['thread_id'],'includeTurns':False})['thread']
        self.require_shared(thread)
        return thread.get('status',{}).get('type') == 'idle'

    def wake(self, task, routing, dispatch_id, prompt, coordinator):
        self.require_shared()
        models = self.transport.call('model/list',{})['data']
        model = next((m for m in models if m.get('id') == routing['model'] or m.get('model') == routing['model']),None)
        efforts = [v.get('reasoningEffort') if isinstance(v,dict) else v for v in (model or {}).get('supportedReasoningEfforts',[])]
        if not model or routing['reasoning'] not in efforts:
            raise RuntimeUnavailable('Selected model/effort is not confirmed by this runtime')
        session = task.get('session')
        if session:
            thread_id = session['thread_id']
            thread = self.transport.call('thread/read',{'threadId':thread_id,'includeTurns':False})['thread']
            self.require_shared(thread)
            if thread.get('status',{}).get('type') != 'idle':
                raise RuntimeBusy('Native thread is not confirmed idle')
            if Path(thread.get('cwd','')).resolve() != Path(task['worktree']).resolve():
                raise RuntimeUnavailable('Native thread has another working directory')
            configuration = self.transport.call('thread/resume',{'threadId':thread_id,'model':routing['model'],
                                                  'config':{'model_reasoning_effort':routing['reasoning']}})
        else:
            result = self.transport.call('thread/start',{'cwd':task['worktree'],'model':routing['model'],
                                 'config':{'model_reasoning_effort':routing['reasoning']},
                                 'approvalPolicy':'never','sandbox':'workspace-write'})
            configuration = result
            thread_id = result['thread']['id']
            coordinator.bind_session(task['id'],thread_id,'local','native',json.dumps({
                'thread_id':thread_id,'transport':self.transport.identity,'dispatch_id':dispatch_id}))
        if configuration.get('model') != routing['model'] or configuration.get('reasoningEffort') != routing['reasoning']:
            raise RuntimeUnavailable('Runtime configuration differs from selected model/effort')
        text = '[Arcigy dispatch '+dispatch_id+']\n'+prompt
        result = self.transport.call('turn/start',{'threadId':thread_id,'model':routing['model'],
                                    'effort':routing['reasoning'],'input':[{'type':'text','text':text}]})
        return {'thread_id':thread_id,'turn_id':result['turn']['id'],'model':routing['model'],
                'effort':routing['reasoning'],'model_confirmed':True}

    def reconcile(self, dispatch_id, thread_id):
        self.require_shared()
        thread = self.transport.call('thread/read',{'threadId':thread_id,'includeTurns':True})['thread']
        self.require_shared(thread)
        marker = '[Arcigy dispatch '+dispatch_id+']'
        matches = []
        for turn in thread.get('turns',[]):
            if marker in json.dumps(turn.get('items',[])):
                matches.append({'turn_id':turn['id'],'status':turn.get('status')})
        if len(matches) != 1:
            raise RuntimeUnavailable('Dispatch outcome is ambiguous; no automatic retry')
        return matches[0]
