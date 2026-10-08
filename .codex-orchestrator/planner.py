#!/usr/bin/env python3
"""Run a read-only Codex planner and preserve its plan, lifecycle and evidence."""
import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

from model_policy import ModelPolicy

STOPPED = {'PAUSED', 'CANCELLED', 'BLOCKED'}


def atomic(path, value):
    temp = path.with_name(path.name + '.tmp')
    with temp.open('w') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def snapshot(worktree):
    """Include commit movement and untracked bytes, not only status names."""
    digest = hashlib.sha256()
    for args in (['rev-parse', 'HEAD'], ['status', '--porcelain=v1', '-z'],
                 ['diff', 'HEAD', '--binary']):
        digest.update(subprocess.check_output(['git', '-C', worktree] + args))
    paths = subprocess.check_output(['git', '-C', worktree, 'ls-files', '--others',
                                     '--exclude-standard', '-z']).split(b'\0')
    for raw in sorted(p for p in paths if p):
        path = Path(worktree) / os.fsdecode(raw)
        digest.update(raw + b'\0')
        if path.is_symlink():
            digest.update(b'link\0' + os.fsencode(os.readlink(path)))
        else:
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(65536), b''):
                    digest.update(chunk)
        digest.update(b'\0')
    return digest.hexdigest()


def stop_child(child, grace=1.0):
    """Kill only the process group created by this wrapper, including descendants."""
    if child is None:
        return
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        child.wait()
        return
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        child.poll()
        try:
            os.killpg(child.pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.05)
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait(timeout=5)


def session_id(events):
    found = None
    if events.exists():
        for line in events.read_text(errors='replace').splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict) and event.get('type') == 'thread.started':
                found = event.get('thread_id') or found
    return found


def completed_usage(events):
    """Return usage from the actual completed turn, when the CLI supplied it."""
    usage = None
    if events.exists():
        for line in events.read_text(errors='replace').splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict) and event.get('type') == 'turn.completed':
                candidate = event.get('usage')
                if isinstance(candidate, dict):
                    usage = {key: candidate.get(key) for key in
                             ('input_tokens', 'cached_input_tokens', 'output_tokens',
                              'reasoning_output_tokens')}
    return usage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--instruction-file', type=Path)
    parser.add_argument('--timeout-seconds', type=float, default=1800)
    parser.add_argument('--complexity', choices=('simple', 'medium', 'hard', 'complex', 'exceptional'),
                        default='medium')
    parser.add_argument('--assessment', default='Read-only implementation planning')
    args = parser.parse_args()
    if not math.isfinite(args.timeout_seconds) or args.timeout_seconds <= 0:
        parser.error('--timeout-seconds must be finite and positive')
    root = args.root.resolve()
    coordinator = root / '.codex-orchestrator/coordinator.py'

    def call(*arguments):
        result = subprocess.run([sys.executable, str(coordinator), '--root', str(root), *arguments],
                                text=True, capture_output=True, timeout=70)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return json.loads(result.stdout)

    task = call('show', args.task)
    directory = root / '.codex-orchestrator/tasks' / task['id']
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'planner.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Planner already running for this task')
        task = call('show', args.task)
        if task['status'] != 'PLANNING':
            task = call('claim', args.task)
        if task['status'] != 'PLANNING':
            print(json.dumps({'status': task['status'], 'started': False}))
            return
        policy = ModelPolicy(root)
        routing = policy.select(args.task, phase='planning', complexity=args.complexity,
                                reason=args.assessment, eligible=not task.get('sample', False))
        stamp = str(time.time_ns())
        answer = directory / ('planner-' + stamp + '.md')
        events = directory / ('planner-' + stamp + '.jsonl')
        errors = directory / ('planner-' + stamp + '.stderr')
        record = directory / 'planner.json'
        metadata = {'task_id': args.task, 'kind': 'cli-read-only', 'started_at': time.time(),
                    'events': str(events), 'stderr': str(errors), 'session_id': None,
                    'status': 'STARTING', 'sandbox': 'read-only',
                    'timeout_seconds': args.timeout_seconds,
                    'routing_id': routing['routing_id'], 'model': routing['model'],
                    'reasoning': routing['reasoning'], 'routing_reason': routing['reason'],
                    'policy_reason': routing.get('policy_reason'),
                    'complexity': routing['complexity'], 'sample_size': routing['sample_size'],
                    'experiment': routing['experiment'], 'routing_eligible': routing['eligible']}
        atomic(record, metadata)
        child = None
        failure = None
        before = None
        started_monotonic = time.monotonic()
        outcome_recorded = False
        previous_handlers = {}

        def record_outcome(outcome, evidence=None, verified=False):
            nonlocal outcome_recorded
            usage = completed_usage(events)
            tokens = None
            if usage and all(isinstance(usage.get(key), int) and not isinstance(usage.get(key), bool)
                             and usage[key] >= 0 for key in ('input_tokens', 'output_tokens')):
                tokens = {'input': usage['input_tokens'], 'output': usage['output_tokens']}
                cached = usage.get('cached_input_tokens')
                if isinstance(cached, int) and not isinstance(cached, bool) and 0 <= cached <= tokens['input']:
                    tokens['cached_input'] = cached
            metadata['usage'] = usage
            metadata['duration_seconds'] = max(0.0, time.monotonic() - started_monotonic)
            policy.outcome(routing['routing_id'], {
                'outcome': outcome, 'evidence': evidence, 'verified': verified,
                'eligible': not task.get('sample', False),
                'duration_seconds': metadata['duration_seconds'],
                'tokens': tokens, 'usage_source': 'Codex turn.completed usage' if tokens else None,
                'credits': None, 'credits_source': None,
            })
            metadata['outcome'] = outcome
            outcome_recorded = True

        def interrupted(signum, _frame):
            raise InterruptedError('Planner wrapper interrupted by signal ' + str(signum))

        try:
            for signum in (signal.SIGTERM, signal.SIGINT):
                previous_handlers[signum] = signal.signal(signum, interrupted)
            worktree = task.get('worktree')
            if not worktree:
                raise RuntimeError('Bind the actual task worktree before running the planner')
            dirty = subprocess.check_output(['git', '-C', worktree, 'status', '--porcelain=v1',
                                             '--untracked-files=all'])
            if dirty:
                raise RuntimeError('Planning requires a clean worktree; preserve existing changes')
            before = snapshot(worktree)
            instruction = args.instruction_file.read_text() if args.instruction_file else ''
            prompt = ('You are the read-only planning worker for Arcigy task ' + args.task + '. '
                      'Communicate in Slovak. Read AGENTS.md and relevant code. Do not implement or write files, '
                      'do not launch services, do not connect to databases, do not read .env or customer storage. '
                      'Output the complete implementation plan in your final answer; the coordinator saves it. '
                      'Cover original requirements, affected files, architecture/API/storage implications, '
                      'dependencies/conflicts, acceptance criteria, tests and risks. '
                      'Approval is required before implementation. Original user request follows:\n\n'
                      + task['original_request'] + '\n\nPrevious plan, revise if applicable:\n'
                      + task.get('plan', '') + '\n\nAdditional planning instruction:\n' + instruction)
            command = ['codex', 'exec', '--ignore-user-config', '--ignore-rules', '-s', 'read-only',
                       '-C', worktree, '-m', routing['model'], '-c',
                       'model_reasoning_effort="' + routing['reasoning'] + '"',
                       '-c', 'approval_policy="never"', '-c', 'features.apps=false',
                       '--json', '-o', str(answer), '-']
            # A file avoids blocked writes and BrokenPipe when the CLI exits before reading stdin.
            with tempfile.TemporaryFile(mode='w+') as input_file, events.open('w') as output, errors.open('w') as error:
                input_file.write(prompt)
                input_file.seek(0)
                child = subprocess.Popen(command, stdin=input_file, stdout=output, stderr=error,
                                         text=True, start_new_session=True)
                metadata.update(status='RUNNING', pid=child.pid)
                atomic(record, metadata)
                deadline = time.monotonic() + args.timeout_seconds
                while child.poll() is None:
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Planner exceeded configured execution timeout')
                    if call('show', args.task)['status'] in STOPPED:
                        metadata['status'] = 'STOPPED'
                        break
                    time.sleep(min(0.2, max(0, deadline - time.monotonic())))
            if metadata['status'] != 'STOPPED':
                if child.returncode != 0 or not answer.is_file() or not answer.read_text().strip():
                    raise RuntimeError('Planner failed; see preserved task logs')
        except BaseException as error:
            failure = error
            metadata.update(status='FAILED', error=type(error).__name__ + ': ' + str(error))
        finally:
            # Ignore repeated interruption while tearing down our owned process group.
            for signum in previous_handlers:
                signal.signal(signum, signal.SIG_IGN)
            try:
                stop_child(child)
            except BaseException as error:
                failure = failure or error
                metadata.update(status='FAILED', cleanup_error=str(error))
            metadata.update(exit_code=child.returncode if child else None, finished_at=time.time(),
                            session_id=session_id(events), usage=completed_usage(events),
                            duration_seconds=max(0.0, time.monotonic() - started_monotonic))
            atomic(record, metadata)
            for signum, handler in previous_handlers.items():
                signal.signal(signum, handler)
        def acknowledge_owned_stop(task):
            if task.get('stop_pending') and 'cleanup_error' not in metadata:
                proof = directory / ('planner-stop-' + stamp + '.json')
                atomic(proof, {'task_id': args.task, 'stopped': True,
                              'evidence': {'kind': 'cli-read-only', 'pid': child.pid if child else None,
                                           'exit_code': metadata['exit_code'],
                                           'observation': 'Owned planner process group terminated and child reaped; no native chat interruption is claimed.'}})
                call('ack-stop', args.task, '--evidence-file', str(proof))

        try:
            task = call('show', args.task)
            if failure:
                record_outcome('infrastructure_failure',
                               'Planner execution did not produce an acceptable plan: ' + metadata.get('error', 'unknown failure'))
                if task['status'] not in STOPPED and task['status'] != 'INTEGRATED':
                    task = call('transition', args.task, 'BLOCKED', '--reason', metadata.get('error', 'Planner cleanup failed'))
                acknowledge_owned_stop(task)
                raise RuntimeError(metadata.get('error', 'Planner failed')) from failure
            if task['status'] in STOPPED or metadata['status'] == 'STOPPED':
                record_outcome('cancelled', 'Planner stopped by task lifecycle request')
                acknowledge_owned_stop(task)
                metadata['status'] = 'STOPPED'
                atomic(record, metadata)
                print(json.dumps(metadata))
                return
            if before != snapshot(worktree):
                message = 'Worktree changed during read-only planning; preserve changes and investigate'
                record_outcome('quality_fail', message, verified=True)
                raise RuntimeError(message)
            result = call('save-plan', args.task, '--file', str(answer))
            record_outcome('awaiting_review', 'Plan saved and awaiting human approval')
            metadata['status'] = 'COMPLETED'
            atomic(record, metadata)
            print(json.dumps({'task': result, 'planner': metadata}, ensure_ascii=False))
        except (RuntimeError, OSError, subprocess.SubprocessError) as error:
            if not outcome_recorded:
                record_outcome('infrastructure_failure',
                               'Planner persistence failed: ' + str(error))
            metadata.update(status='FAILED', persistence_error=str(error))
            atomic(record, metadata)
            try:
                task = call('show', args.task)
                if task['status'] not in STOPPED and task['status'] != 'INTEGRATED':
                    task = call('transition', args.task, 'BLOCKED', '--reason', 'Planner failed; see preserved task logs')
                acknowledge_owned_stop(task)
            except (RuntimeError, OSError, subprocess.SubprocessError) as state_error:
                metadata['state_update_error'] = str(state_error)
                atomic(record, metadata)
            raise


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
