"""No real Odoo, account, app-server or LLM is used by this suite."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest

HERE=Path(__file__).parent
sys.path.insert(0,str(HERE.parent/'tools/feedback-webhook'))
from protocol import parse_event
from store import Store
from feedback_events import Processor, authoritative, Ineligible
from feedback_authorization import evaluate, policy_digest
from feedback_daemon import source_connector
from app_server_adapter import AppServerAdapter, RuntimeUnavailable, RuntimeBusy
import test_coordinator as fixture
Error=fixture.Error


def event():
    return {'schema_version':1,'source_id':'source-a','tenant_id':'tenant-a','project_id':'1','event_id':9,
            'report_id':7,'revision':1,'event_type':'received','origin':'live','occurred_at':'2026-10-08T12:00:00+00:00',
            'cutover_epoch':'epoch-a'}


def report():
    return {'id':7,'sourceId':'source-a','tenantId':'tenant-a','projectId':'1','ready':True,'revision':1,
            'legacy':{},'status':'new','events':[{'id':9,'kind':'received','payload':{'complete':True}}]}


def authorization():
    return {'id':'repairs-v1','version':1,'source_id':'source-a','tenant_id':'tenant-a','project_id':'1',
            'allowed_paths':['src','tests'],'operations':['edit','test','commit'],'max_files':10,
            'expires_at':'2099-01-01T00:00:00+00:00'}


class Source:
    def __init__(self):self.report=report();self.calls=[]
    def execute(self,name,args):
        self.calls.append((name,args))
        if name=='read_report':return deepcopy(self.report)
        self.report.update(status='working',claim=args['operation_id'],revision=self.report['revision']+1)
        return deepcopy(self.report)


class Policy:
    def __init__(self):self.calls=[]
    def select(self,task,**kwargs):
        self.calls.append((task,kwargs))
        return {'routing_id':'fixture-route','model':'gpt-6.1-sol','reasoning':'high'}
    def outcome(self,*args):pass


class Runtime:
    def __init__(self,enabled=True,fail=False):self.enabled=enabled;self.fail=fail;self.calls=[]
    def available(self):return self.enabled
    def idle(self,task):return True
    def wake(self,task,routing,dispatch_id,prompt,c):
        self.calls.append((task,routing,dispatch_id,prompt))
        if self.fail:raise TimeoutError('Fixture: send outcome unknown')
        return {'thread_id':'fixture-thread','turn_id':'fixture-turn','model':routing['model'],
                'effort':routing['reasoning'],'model_confirmed':True}


class FeedbackTests(unittest.TestCase):
    setUp=fixture.CoordinatorTests.setUp
    tearDown=fixture.CoordinatorTests.tearDown
    git=fixture.CoordinatorTests.git
    bind_environment=fixture.CoordinatorTests.bind_environment

    def make_task(self):
        external={k:event()[k] for k in ('source_id','tenant_id','project_id','report_id')}
        task=self.c.register('Fixture feedback','Local fixture repair','feedback',external=external)
        return self.c.prepare_worktree(task['id'])

    def processor(self,runtime=None):
        inbox=Store(self.root/'inbox.sqlite3')
        value=event();raw=json.dumps(value).encode();inbox.accept(value,raw)
        source,policy=Source(),Policy()
        return Processor(self.c,inbox,source,runtime or Runtime(),policy),inbox.pending()[0]

    def test_external_registration_is_atomic_and_idempotent(self):
        external={k:event()[k] for k in ('source_id','tenant_id','project_id','report_id')}
        with ThreadPoolExecutor(max_workers=6) as pool:
            ids=list(pool.map(lambda _:self.c.register('Fixture','Same source','feedback',external=external)['id'],range(12)))
        self.assertEqual(len(set(ids)),1)
        self.assertEqual(len(self.c.all()),1)

    def test_standing_authorization_binds_exact_plan_and_revokes(self):
        task=self.make_task();self.c.claim(task['id']);self.c.save_plan(task['id'],'Repair only src/fixture.py')
        policy=authorization();self.c.grant_feedback_policy(policy,'Actual fixture human consent, not a real approval')
        task=self.c.authorize_feedback_plan(task['id'],policy['id'],{'paths':['src/fixture.py'],'operations':['edit','test']})
        self.assertIsNone(task['approval'])
        self.assertEqual(task['policy_authorization']['policy_sha256'],policy_digest(policy))
        self.assertEqual(self.c.begin(task['id'])['status'],'IMPLEMENTING')
        self.c.revoke_feedback_policy(policy['id'],'Fixture revocation')
        task=self.c.get(task['id'])
        self.assertEqual(task['status'],'PAUSED');self.assertTrue(task['stop_pending'])
        with self.assertRaises(Error):self.c.plan_guard(task)

    def test_changed_plan_scope_or_expiry_needs_new_authorization(self):
        task=self.make_task();self.c.claim(task['id']);self.c.save_plan(task['id'],'Local repair')
        policy=authorization();self.c.grant_feedback_policy(policy,'Fixture human consent')
        for scope in [{'paths':['.env'],'operations':['edit']},{'paths':['src/app.py'],'operations':['deploy']},
                      {'paths':['tests/../../private'],'operations':['edit']},{'paths':['.codex-orchestrator/coordinator.py'],'operations':['edit']}]:
            with self.assertRaises(ValueError):self.c.authorize_feedback_plan(task['id'],policy['id'],scope)
        self.c.authorize_feedback_plan(task['id'],policy['id'],{'paths':['src/a.py'],'operations':['edit']})
        self.c.save_plan(task['id'],'Different plan')
        with self.assertRaises(Error):self.c.begin(task['id'])
        policy['expires_at']='2000-01-01T00:00:00+00:00'
        with self.assertRaises(ValueError):evaluate(policy,task['external_feedback'],{'paths':['src/a.py'],'operations':['edit']})

    def test_inactive_shared_runtime_stores_task_without_llm_or_claim(self):
        p,row=self.processor(AppServerAdapter())
        self.assertEqual(p.process(row),'waiting_runtime')
        self.assertEqual(p.process(row),'waiting_runtime')
        self.assertEqual(len(self.c.all()),1)
        self.assertEqual(p.policy.calls,[])
        self.assertTrue(all(name=='read_report' for name,_ in p.source.calls))

    def test_one_notification_one_dispatch_duplicate_zero_extra_llm(self):
        p,row=self.processor()
        self.assertEqual(p.process(row),'sent');self.assertEqual(p.process(row),'sent')
        self.assertEqual(len(p.runtime.calls),1);self.assertEqual(len(p.policy.calls),1)
        self.assertEqual(p.policy.calls[0][1]['phase'],'planning')
        self.assertFalse(any(name=='start_report' for name,_ in p.source.calls))

    def test_timeout_is_never_blindly_retried(self):
        p,row=self.processor(Runtime(fail=True))
        with self.assertRaises(TimeoutError):p.process(row)
        self.assertEqual(p.process(row),'unknown')
        self.assertEqual(len(p.runtime.calls),1)

    def test_source_authority_stale_history_foreign_claim_and_status(self):
        variants=[{'id':8},{'tenantId':'other'},{'ready':False},{'revision':0},{'legacy':{'old':True}},
                  {'events':[]},{'status':'working','claim':'foreign'},
                  *[{'status':s} for s in ('implemented','develop','main')]]
        for change in variants:
            with self.subTest(change=change),self.assertRaises(Ineligible):authoritative(event(),{**report(),**change})
        p,row=self.processor();p.source.report['tenantId']='other'
        self.assertEqual(p.process(row),'ineligible');self.assertEqual(p.runtime.calls,[]);self.assertEqual(self.c.all(),[])

    def test_pause_cancel_and_capacity_do_not_wake(self):
        p,row=self.processor(Runtime(enabled=False));p.process(row)
        task=self.c.all()[0];self.c.transition(task['id'],'PAUSED','Fixture')
        p.runtime.enabled=True
        self.assertEqual(p.process(row),'waiting_task');self.assertEqual(p.runtime.calls,[])

    def test_planning_to_policy_authorized_execution_claims_once(self):
        p,row=self.processor()
        self.assertEqual(p.process(row),'sent')
        task=self.c.all()[0]
        scope={'paths':['src/fixture.py'],'operations':['edit','test']}
        self.c.save_plan(task['id'],'Repair src/fixture.py only',scope)
        self.c.grant_feedback_policy(authorization(),'Fixture human standing authorization')
        p.authorization_policy='repairs-v1'
        self.assertEqual(p.advance(row),'sent')
        self.assertEqual(len(p.runtime.calls),2)
        self.assertEqual([v[1]['phase'] for v in p.policy.calls],['planning','execution'])
        self.assertEqual(len([name for name,_ in p.source.calls if name=='start_report']),1)
        self.assertEqual(p.process(row,'execution'),'waiting_approval')
        self.assertEqual(len(p.runtime.calls),2)

    def test_full_capacity_does_not_select_model_or_wake(self):
        for index in range(3):
            task=self.c.register('Busy fixture','Fixture','busy-'+str(index),sample=True)
            task=self.c.prepare_worktree(task['id']);self.c.claim(task['id'])
        p,row=self.processor()
        self.assertEqual(p.process(row),'capacity_queued')
        self.assertEqual(p.runtime.calls,[]);self.assertEqual(p.policy.calls,[])


class Transport:
    identity={'path':'fixture.sock','device':1,'inode':2}
    def __init__(self,status='idle',model='gpt-6.1-sol'):self.calls=[];self.status=status;self.model=model
    def call(self,method,params):
        self.calls.append((method,params))
        if method=='model/list':return {'data':[{'id':'gpt-6.1-sol','supportedReasoningEfforts':[{'reasoningEffort':'high'}]}]}
        if method=='thread/read':return {'thread':{'id':'fixture-thread','cwd':'/tmp/fixture','status':{'type':self.status}}}
        if method=='thread/resume':return {'model':self.model,'reasoningEffort':'high'}
        if method=='turn/start':return {'turn':{'id':'fixture-turn'}}
        raise AssertionError(method)


class AdapterTests(unittest.TestCase):
    def test_not_loaded_or_independent_runtime_cannot_resume_desktop(self):
        transport=Transport('notLoaded');adapter=AppServerAdapter(transport,lambda *_:True)
        task={'session':{'thread_id':'fixture-thread'},'worktree':'/tmp/fixture'}
        with self.assertRaises(RuntimeBusy):adapter.wake(task,{'model':'gpt-6.1-sol','reasoning':'high'},'dispatch','Fixture',None)
        self.assertFalse(any(m=='thread/resume' for m,_ in transport.calls))
        independent=AppServerAdapter(transport)
        with self.assertRaises(RuntimeUnavailable):independent.require_shared()

    def test_selected_model_is_echoed_and_explicit_on_turn(self):
        transport=Transport();adapter=AppServerAdapter(transport,lambda *_:True)
        task={'session':{'thread_id':'fixture-thread'},'worktree':'/tmp/fixture'}
        result=adapter.wake(task,{'model':'gpt-6.1-sol','reasoning':'high'},'dispatch','Fixture',None)
        turn=next(p for m,p in transport.calls if m=='turn/start')
        self.assertEqual(turn['model'],'gpt-6.1-sol');self.assertEqual(turn['effort'],'high')
        self.assertIn('[Arcigy dispatch dispatch]',turn['input'][0]['text'])
        self.assertTrue(result['model_confirmed'])
        mismatch=Transport(model='different')
        with self.assertRaises(RuntimeUnavailable):AppServerAdapter(mismatch,lambda *_:True).wake(
            task,{'model':'gpt-6.1-sol','reasoning':'high'},'dispatch','Fixture',None)
        self.assertFalse(any(m=='turn/start' for m,_ in mismatch.calls))


class ConnectorTests(unittest.TestCase):
    def test_claim_is_server_confirmed_not_synthesized(self):
        connector=source_connector()
        for value in [{'status':'working'},{'status':'implemented','claim':'op'},{'status':'working','claim':'other'}]:
            connector.call=lambda *_:value
            with self.assertRaises(ValueError):connector.execute('start_report',{'task_id':7,'operation_id':'op','worker':'fixture'})
        connector.call=lambda *_:{'status':'working','claim':'op'}
        self.assertEqual(connector.execute('start_report',{'task_id':7,'operation_id':'op','worker':'fixture','expected_revision':1})['claim'],'op')
