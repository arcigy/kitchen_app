"""Exercise the planner wrapper against a stub CLI in disposable Git repositories."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

COORDINATOR = load('planner_test_coordinator', HERE / 'coordinator.py')
PLANNER = load('planner_under_test', HERE / 'planner.py')


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='arcigy-planner-test-')
        self.root = Path(self.temporary.name)
        self.git('init', '-b', 'develop')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Planner test')
        (self.root / '.gitignore').write_text('.codex-orchestrator/\nbin/\n')
        (self.root / 'README.md').write_text('Disposable planner fixture\n')
        self.git('add', '.gitignore', 'README.md')
        self.git('commit', '-m', 'test: fixture')
        home = self.root / '.codex-orchestrator'
        home.mkdir()
        shutil.copy2(HERE / 'coordinator.py', home / 'coordinator.py')
        shutil.copy2(HERE / 'feedback_authorization.py', home / 'feedback_authorization.py')
        shutil.copy2(HERE / 'model_policy.py', home / 'model_policy.py')
        shutil.copy2(HERE / 'model-policy.json', home / 'model-policy.json')
        self.c = COORDINATOR.Coordinator(self.root)
        task = self.c.register('Planner fixture', 'Preserve this original request.', 'planner-fixture', sample=True)
        self.task = self.c.prepare_worktree(task['id'])
        self.directory = home / 'tasks' / task['id']
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.stub = self.bin / 'codex'
        self.stub.write_text('#!' + sys.executable + '\n' + r'''
import json, os, pathlib, signal, subprocess, sys, time
mode = os.environ.get('STUB_MODE', 'success')
record = pathlib.Path(os.environ['STUB_RECORD'])
print(json.dumps({'type': 'thread.started', 'thread_id': 'actual-stub-session'}), flush=True)
print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 1200, 'cached_input_tokens': 300, 'output_tokens': 450, 'reasoning_output_tokens': 100}}), flush=True)
if mode == 'early-exit':
    raise SystemExit(9)
record.write_text(json.dumps({'argv': sys.argv[1:], 'prompt': sys.stdin.read()}))
if mode == 'fail':
    raise SystemExit(7)
if mode == 'timeout':
    child = subprocess.Popen([sys.executable, '-c', 'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(60)'])
    pathlib.Path(os.environ['STUB_CHILD_PID']).write_text(str(child.pid))
    time.sleep(60)
answer = pathlib.Path(sys.argv[sys.argv.index('-o') + 1])
answer.write_text('Complete safe implementation plan.\n')
if mode == 'change-head':
    subprocess.run(['git', '-C', sys.argv[sys.argv.index('-C') + 1], 'commit', '--allow-empty', '-m', 'test: unexpected planner commit'], check=True, stdout=subprocess.DEVNULL)
''')
        self.stub.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        STUB_RECORD=str(self.directory / 'stub-record.json'),
                        STUB_CHILD_PID=str(self.directory / 'stub-child.pid'))

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', '-C', str(cwd or self.root), *args], text=True).strip()

    def command(self, *extra):
        return [sys.executable, str(HERE / 'planner.py'), self.task['id'], '--root', str(self.root), *extra]

    def run_planner(self, mode='success', *extra):
        return subprocess.run(self.command(*extra), env=dict(self.env, STUB_MODE=mode),
                              text=True, capture_output=True, timeout=20)

    def metadata(self):
        return json.loads((self.directory / 'planner.json').read_text())

    def assert_not_running(self, pid):
        result = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True)
        self.assertTrue(result.returncode != 0 or result.stdout.strip().startswith('Z'), result.stdout)

    def test_success_persists_plan_and_readonly_flags(self):
        result = self.run_planner()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.c.get(self.task['id'])['status'], 'AWAITING_APPROVAL')
        self.assertEqual((self.directory / 'PLAN.md').read_text(), 'Complete safe implementation plan.\n')
        self.assertEqual(self.metadata()['status'], 'COMPLETED')
        self.assertEqual(self.metadata()['session_id'], 'actual-stub-session')
        self.assertEqual(self.metadata()['model'], 'gpt-6.1-sol')
        self.assertEqual(self.metadata()['reasoning'], 'high')
        self.assertEqual(self.metadata()['outcome'], 'awaiting_review')
        self.assertFalse(self.metadata()['routing_eligible'])
        self.assertEqual(self.metadata()['usage'], {'input_tokens': 1200, 'cached_input_tokens': 300,
                                                   'output_tokens': 450, 'reasoning_output_tokens': 100})
        captured = json.loads(Path(self.env['STUB_RECORD']).read_text())
        argv = captured['argv']
        self.assertEqual(argv[argv.index('-s') + 1], 'read-only')
        self.assertEqual(argv[argv.index('-m') + 1], 'gpt-6.1-sol')
        self.assertIn('model_reasoning_effort="high"', argv)
        self.assertIn('--ignore-user-config', argv)
        self.assertIn('features.apps=false', argv)
        self.assertIn('approval_policy="never"', argv)
        self.assertIn('Preserve this original request.', captured['prompt'])
        outcome = PLANNER.ModelPolicy(self.root).history()[0]['outcome']
        self.assertEqual(outcome['outcome'], 'awaiting_review')
        self.assertFalse(outcome['verified'])
        self.assertFalse(outcome['eligible'])
        self.assertEqual(outcome['tokens'], {'input': 1200, 'output': 450, 'cached_input': 300})

    def test_previous_plan_and_new_instruction_are_preserved(self):
        self.c.claim(self.task['id'])
        self.c.save_plan(self.task['id'], 'Earlier proposal, retain relevant decisions.')
        self.c.transition(self.task['id'], 'PAUSED', 'Explicitly pause before replan')
        instruction = self.directory / 'new-instruction.txt'
        instruction.write_text('Also address recovery after interruption.')
        result = self.run_planner('success', '--instruction-file', str(instruction))
        self.assertEqual(result.returncode, 0, result.stderr)
        prompt = json.loads(Path(self.env['STUB_RECORD']).read_text())['prompt']
        self.assertIn('Earlier proposal, retain relevant decisions.', prompt)
        self.assertIn('Also address recovery after interruption.', prompt)

    def test_failed_cli_and_early_stdin_exit_record_blocked(self):
        for mode in ('fail', 'early-exit'):
            with self.subTest(mode=mode):
                result = self.run_planner(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.c.get(self.task['id'])['status'], 'BLOCKED')
                self.assertEqual(self.metadata()['status'], 'FAILED')
                self.assertEqual(self.metadata()['session_id'], 'actual-stub-session')
                self.assertEqual(self.metadata()['exit_code'], 7 if mode == 'fail' else 9)
                outcome = PLANNER.ModelPolicy(self.root).history()[0]['outcome']
                self.assertEqual(outcome['outcome'], 'infrastructure_failure')
                self.assertFalse(outcome['verified'])

    def test_spawn_failure_leaves_durable_blocked_state(self):
        self.stub.unlink()
        # Keep only Git available, so codex cannot fall through to the real installed CLI.
        (self.bin / 'git').symlink_to(shutil.which('git'))
        self.env['PATH'] = str(self.bin)
        result = self.run_planner()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.c.get(self.task['id'])['status'], 'BLOCKED')
        self.assertEqual(self.metadata()['status'], 'FAILED')
        self.assertIsNone(self.metadata()['exit_code'])

    def test_timeout_kills_owned_descendants_and_retains_session(self):
        result = self.run_planner('timeout', '--timeout-seconds', '0.6')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.c.get(self.task['id'])['status'], 'BLOCKED')
        self.assertIn('TimeoutError', self.metadata()['error'])
        self.assertEqual(self.metadata()['session_id'], 'actual-stub-session')
        self.assert_not_running(int(Path(self.env['STUB_CHILD_PID']).read_text()))

    def test_parent_interruption_cleans_up_and_records_blocked(self):
        child = subprocess.Popen(self.command(), env=dict(self.env, STUB_MODE='timeout'),
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while not Path(self.env['STUB_CHILD_PID']).exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(Path(self.env['STUB_CHILD_PID']).exists())
            child.send_signal(signal.SIGTERM)
            child.communicate(timeout=10)
            self.assertNotEqual(child.returncode, 0)
            self.assertEqual(self.c.get(self.task['id'])['status'], 'BLOCKED')
            self.assertEqual(self.metadata()['session_id'], 'actual-stub-session')
            self.assert_not_running(int(Path(self.env['STUB_CHILD_PID']).read_text()))
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate()

    def test_pause_stops_owned_process_before_releasing_reservation(self):
        child = subprocess.Popen(self.command(), env=dict(self.env, STUB_MODE='timeout'),
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while not Path(self.env['STUB_CHILD_PID']).exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(Path(self.env['STUB_CHILD_PID']).exists())
            paused = self.c.transition(self.task['id'], 'PAUSED', 'User requested pause')
            self.assertTrue(paused['stop_pending'])
            _stdout, stderr = child.communicate(timeout=10)
            self.assertEqual(child.returncode, 0, stderr)
            task = self.c.get(self.task['id'])
            self.assertEqual(task['status'], 'PAUSED')
            self.assertFalse(task['stop_pending'])
            self.assertEqual(self.metadata()['status'], 'STOPPED')
            self.assert_not_running(int(Path(self.env['STUB_CHILD_PID']).read_text()))
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate()

    def test_unexpected_commit_is_blocked_and_preserved(self):
        before = self.git('rev-parse', 'HEAD', cwd=self.task['worktree'])
        result = self.run_planner('change-head')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.c.get(self.task['id'])['status'], 'BLOCKED')
        self.assertNotEqual(self.git('rev-parse', 'HEAD', cwd=self.task['worktree']), before)
        self.assertIn('Worktree changed', self.metadata()['persistence_error'])
        self.assertFalse((self.directory / 'PLAN.md').exists())
        outcome = PLANNER.ModelPolicy(self.root).history()[0]['outcome']
        self.assertEqual(outcome['outcome'], 'quality_fail')
        self.assertTrue(outcome['verified'])
        self.assertIn('Worktree changed', outcome['evidence'])

    def test_dirty_tree_is_rejected_before_cli_launch(self):
        (Path(self.task['worktree']) / 'uncommitted.txt').write_text('Do not overwrite')
        result = self.run_planner()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.c.get(self.task['id'])['status'], 'BLOCKED')
        self.assertFalse(Path(self.env['STUB_RECORD']).exists())

    def test_snapshot_detects_head_and_untracked_content(self):
        path = self.task['worktree']
        before = PLANNER.snapshot(path)
        self.git('commit', '--allow-empty', '-m', 'test: head-only change', cwd=path)
        self.assertNotEqual(PLANNER.snapshot(path), before)
        untracked = Path(path) / 'new.txt'
        untracked.write_text('first')
        before = PLANNER.snapshot(path)
        untracked.write_text('second')
        self.assertNotEqual(PLANNER.snapshot(path), before)


if __name__ == '__main__':
    unittest.main(verbosity=2)
