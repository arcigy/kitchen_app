#!/usr/bin/env python3
"""Auditable model routing. Only verified outcomes change the learned policy."""
import argparse
import contextlib
import datetime
import json
import math
from pathlib import Path
import sqlite3
import sys
import uuid

PHASES = {'planning', 'execution', 'integration', 'coordination'}
COMPLEXITIES = {'simple', 'medium', 'hard', 'complex', 'exceptional'}
OUTCOMES = {'quality_pass', 'quality_fail', 'infrastructure_failure', 'cancelled', 'awaiting_review'}
LADDERS = {
    'planning': [('gpt-6.1-sol', 'high'), ('gpt-6.1-sol', 'xhigh'), ('gpt-6.1-sol', 'max'), ('gpt-6-astra', 'xhigh'), ('gpt-6-astra', 'max')],
    'execution': [('gpt-6-luna', 'high'), ('gpt-6.1-sol', 'medium'), ('gpt-6.1-sol', 'high'), ('gpt-6.1-sol', 'xhigh')],
    'integration': [('gpt-6.1-sol', 'medium'), ('gpt-6.1-sol', 'high'), ('gpt-6.1-sol', 'xhigh')],
    'coordination': [('gpt-6-luna', 'high'), ('gpt-6.1-sol', 'medium'), ('gpt-6.1-sol', 'high')],
}
DEFAULTS = {'min_successes': 3, 'max_seconds': 300, 'max_tokens': 30000, 'max_credits': None}


class Error(ValueError):
    pass


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def nonempty(value, name):
    if not isinstance(value, str) or not value.strip():
        raise Error(name + ' must be a nonempty string')
    return value


def number(value, name, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or (integer and not isinstance(value, int)):
        raise Error(name + ' must be a nonnegative ' + ('integer' if integer else 'finite number'))
    return value


class ModelPolicy:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.home = self.root / '.codex-orchestrator'
        self.state = self.home / 'state'
        self.state.mkdir(parents=True, exist_ok=True)
        self.db = self.state / 'ledger.sqlite3'
        self.config = dict(DEFAULTS)
        path = self.home / 'model-policy.json'
        if path.exists():
            config = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(config, dict) or set(config) - set(DEFAULTS):
                raise Error('Unknown policy configuration')
            self.config.update(config)
        number(self.config['min_successes'], 'min_successes', True)
        if self.config['min_successes'] < 3:
            raise Error('min_successes must be at least 3')
        for key in ('max_seconds', 'max_tokens', 'max_credits'):
            if self.config[key] is not None:
                number(self.config[key], key, key == 'max_tokens')
                if self.config[key] == 0:
                    raise Error(key + ' must be positive or null')
        with self.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS model_routes (n INTEGER PRIMARY KEY AUTOINCREMENT, routing_id TEXT UNIQUE NOT NULL, task_id TEXT NOT NULL, phase TEXT NOT NULL, complexity TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL, outcome TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS model_policy_state (policy_key TEXT PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS model_policy_events (n INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, routing_id TEXT NOT NULL, data TEXT NOT NULL)')

    @contextlib.contextmanager
    def transaction(self):
        db = sqlite3.connect(self.db, timeout=60, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA busy_timeout=60000')
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

    def initial(self, phase, complexity):
        if phase == 'planning':
            return 3 if complexity in {'hard', 'complex', 'exceptional'} else 0
        if phase == 'execution':
            return {'simple': 0, 'medium': 0, 'hard': 1, 'complex': 2, 'exceptional': 3}[complexity]
        return 0

    def policy_state(self, db, phase, complexity):
        key = phase + ':' + complexity
        row = db.execute('SELECT data FROM model_policy_state WHERE policy_key=?', (key,)).fetchone()
        state = json.loads(row['data']) if row else {'rung': self.initial(phase, complexity), 'successes': 0, 'sample_size': 0, 'slow_successes': 0, 'trial': None}
        return key, state

    def save(self, db, key, state, routing_id, before, cause):
        db.execute('INSERT OR REPLACE INTO model_policy_state VALUES (?,?)', (key, json.dumps(state, sort_keys=True)))
        db.execute('INSERT INTO model_policy_events(at,routing_id,data) VALUES(?,?,?)', (now(), routing_id, json.dumps({'key': key, 'before': before, 'after': state, 'cause': cause}, sort_keys=True)))

    def select(self, task_id, phase, complexity='medium', reason='Explicit routing assessment', exceptional_reason=None, eligible=True):
        nonempty(task_id, 'task_id')
        nonempty(reason, 'reason')
        if not isinstance(eligible, bool):
            raise Error('eligible must be boolean')
        if not isinstance(phase, str) or not isinstance(complexity, str) or phase not in PHASES or complexity not in COMPLEXITIES:
            raise Error('Invalid phase or complexity')
        if exceptional_reason is not None:
            nonempty(exceptional_reason, 'exceptional_reason')
            if phase != 'execution':
                raise Error('Exceptional Astra override applies only to execution')
        with self.transaction() as db:
            key, state = self.policy_state(db, phase, complexity)
            before = dict(state)
            rung = state['rung']
            routing_id = 'route-' + uuid.uuid4().hex
            experiment = None
            rationale = 'Default assessment' if state['sample_size'] == 0 else 'Learned from verified comparable outcomes'
            if exceptional_reason is not None:
                failed = db.execute('SELECT data,outcome FROM model_routes WHERE task_id=? AND phase=? AND complexity=? AND outcome IS NOT NULL', (task_id, phase, complexity)).fetchall()
                lower_failures = [r for r in failed if json.loads(r['outcome'])['outcome'] == 'quality_fail' and json.loads(r['outcome'])['eligible'] and json.loads(r['outcome'])['verified'] and json.loads(r['data'])['model'] != 'gpt-6-astra']
                strong_failure = any(json.loads(r['data'])['model'] == 'gpt-6.1-sol' and json.loads(r['data'])['reasoning'] in {'high', 'xhigh'} for r in lower_failures)
                if len(lower_failures) < 2 or not strong_failure:
                    raise Error('Astra execution requires two verified lower-model failures for this task and complexity, including Sol high or xhigh')
                model, reasoning = 'gpt-6-astra', 'xhigh'
                rationale = 'Explicit exceptional execution override after lower-model quality failure: ' + exceptional_reason
            else:
                floor = 1 if phase == 'planning' and complexity in {'hard', 'complex', 'exceptional'} else 0
                if eligible and rung > floor and state['trial'] is None and state['successes'] >= self.config['min_successes'] and state['slow_successes'] >= self.config['min_successes']:
                    experiment = {'kind': 'cheaper_trial', 'baseline_rung': rung, 'trial_rung': rung - 1}
                    rung -= 1
                    state['trial'] = routing_id
                    rationale = 'Trial one cheaper rung after repeated verified costly or slow successes'
                model, reasoning = LADDERS[phase][rung]
            result = {'routing_id': routing_id, 'task_id': task_id, 'phase': phase, 'complexity': complexity, 'model': model, 'reasoning': reasoning, 'reason': reason, 'policy_reason': rationale, 'sample_size': state['sample_size'], 'experiment': experiment, 'rung': rung, 'exceptional_reason': exceptional_reason, 'eligible': eligible}
            db.execute('INSERT INTO model_routes(routing_id,task_id,phase,complexity,at,data) VALUES(?,?,?,?,?,?)', (routing_id, task_id, phase, complexity, now(), json.dumps(result, sort_keys=True)))
            self.save(db, key, state, routing_id, before, 'selection')
            return result

    def normalize_outcome(self, payload):
        if not isinstance(payload, dict):
            raise Error('Outcome must be an object')
        allowed = {'outcome', 'evidence', 'verified', 'eligible', 'duration_seconds', 'tokens', 'usage_source', 'credits', 'credits_source'}
        if set(payload) - allowed or not isinstance(payload.get('outcome'), str) or payload.get('outcome') not in OUTCOMES:
            raise Error('Invalid outcome fields or outcome enum')
        result = {'outcome': payload['outcome'], 'evidence': payload.get('evidence'), 'verified': payload.get('verified', False), 'eligible': payload.get('eligible', True), 'duration_seconds': payload.get('duration_seconds'), 'tokens': payload.get('tokens'), 'usage_source': payload.get('usage_source'), 'credits': payload.get('credits'), 'credits_source': payload.get('credits_source')}
        for key in ('verified', 'eligible'):
            if not isinstance(result[key], bool):
                raise Error(key + ' must be boolean')
        if result['verified']:
            nonempty(result['evidence'], 'verified evidence')
        if result['outcome'] in {'quality_pass', 'quality_fail'} and not result['verified']:
            raise Error('Quality outcomes require verified evaluation evidence')
        if result['outcome'] in {'cancelled', 'awaiting_review'} and result['verified']:
            raise Error('Incomplete outcomes cannot be verified')
        if result['duration_seconds'] is not None:
            number(result['duration_seconds'], 'duration_seconds')
        if result['tokens'] is not None:
            tokens = result['tokens']
            if not isinstance(tokens, dict) or not tokens or set(tokens) - {'input', 'output', 'cached_input'}:
                raise Error('tokens must contain actual input/output/cached_input counts')
            for key, value in tokens.items():
                number(value, key, True)
            if 'cached_input' in tokens and 'input' in tokens and tokens['cached_input'] > tokens['input']:
                raise Error('cached_input cannot exceed input')
            nonempty(result['usage_source'], 'usage_source')
        if result['credits'] is not None:
            number(result['credits'], 'credits')
            nonempty(result['credits_source'], 'credits_source')
        return result

    def outcome(self, routing_id, payload):
        with self.transaction() as db:
            row = db.execute('SELECT * FROM model_routes WHERE routing_id=?', (routing_id,)).fetchone()
            if row is None:
                raise Error('Unknown routing ID')
            if not isinstance(payload, dict):
                raise Error('Outcome must be an object')
            prior = json.loads(row['outcome']) if row['outcome'] is not None else None
            effective = dict(payload)
            if prior is not None:
                for field in ('tokens', 'usage_source', 'duration_seconds', 'credits', 'credits_source', 'eligible'):
                    if field not in effective:
                        effective[field] = prior[field]
                if not prior['eligible'] and effective.get('eligible'):
                    raise Error('Excluded samples cannot become eligible on finalization')
            route = json.loads(row['data'])
            if not route.get('eligible', True):
                if effective.get('eligible', False):
                    raise Error('Excluded routing selection cannot become eligible')
                effective['eligible'] = False
            result = self.normalize_outcome(effective)
            if prior is not None:
                if prior == result:
                    return prior
                if prior['outcome'] != 'awaiting_review':
                    raise Error('Contradictory outcome already recorded')
                if result['outcome'] == 'awaiting_review':
                    raise Error('Contradictory awaiting_review record')
            route = json.loads(row['data'])
            key, state = self.policy_state(db, route['phase'], route['complexity'])
            before = dict(state)
            eligible = result['eligible'] and result['verified'] and result['outcome'] in {'quality_pass', 'quality_fail'}
            trial = route['experiment'] is not None
            if eligible:
                state['sample_size'] += 1
                if result['outcome'] == 'quality_fail':
                    state['rung'] = min(max(state['rung'], route['rung'] + 1), len(LADDERS[route['phase']]) - 1)
                    state['successes'] = state['slow_successes'] = 0
                elif route['exceptional_reason'] is None and (route['rung'] == state['rung'] or (trial and state['rung'] == route['experiment']['baseline_rung'])):
                    if trial:
                        state['rung'] = route['rung']
                        state['successes'] = state['slow_successes'] = 0
                    state['successes'] += 1
                    token_count = sum((result['tokens'] or {}).get(k, 0) for k in ('input', 'output'))
                    costly = any(value is not None and self.config[threshold] is not None and value >= self.config[threshold] for value, threshold in [(result['duration_seconds'], 'max_seconds'), (token_count if result['tokens'] else None, 'max_tokens'), (result['credits'], 'max_credits')])
                    state['slow_successes'] += int(costly)
            if state['trial'] == routing_id and result['outcome'] != 'awaiting_review':
                state['trial'] = None
                if not eligible or result['outcome'] == 'quality_fail':
                    state['successes'] = state['slow_successes'] = 0
            db.execute('UPDATE model_routes SET outcome=? WHERE routing_id=?', (json.dumps(result, sort_keys=True), routing_id))
            self.save(db, key, state, routing_id, before, {'outcome': result})
            return result

    def history(self, limit=20):
        if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
            raise Error('limit must be a positive integer')
        with self.transaction() as db:
            return [dict(json.loads(row['data']), outcome=json.loads(row['outcome']) if row['outcome'] else None) for row in db.execute('SELECT data,outcome FROM model_routes ORDER BY n DESC LIMIT ?', (limit,))]

    def status(self):
        with self.transaction() as db:
            return {'config': self.config, 'policies': {r['policy_key']: json.loads(r['data']) for r in db.execute('SELECT * FROM model_policy_state ORDER BY policy_key')}, 'routes': db.execute('SELECT COUNT(*) FROM model_routes').fetchone()[0]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default=str(Path(__file__).resolve().parent.parent))
    subs = parser.add_subparsers(dest='command', required=True)
    select = subs.add_parser('select')
    select.add_argument('task_id')
    select.add_argument('--phase', choices=sorted(PHASES), required=True)
    select.add_argument('--complexity', choices=sorted(COMPLEXITIES), default='medium')
    select.add_argument('--reason', required=True)
    select.add_argument('--exceptional-reason')
    select.add_argument('--ineligible', action='store_true', help='Exclude sample/simulation from learning and trials')
    outcome = subs.add_parser('outcome')
    outcome.add_argument('routing_id')
    outcome.add_argument('--file', required=True)
    history = subs.add_parser('history')
    history.add_argument('--limit', type=int, default=20)
    subs.add_parser('status')
    args = parser.parse_args(argv)
    try:
        policy = ModelPolicy(args.root)
        if args.command == 'select':
            result = policy.select(args.task_id, args.phase, args.complexity, args.reason, args.exceptional_reason, eligible=not args.ineligible)
        elif args.command == 'outcome':
            result = policy.outcome(args.routing_id, json.loads(Path(args.file).read_text(encoding='utf-8')))
        elif args.command == 'history':
            result = policy.history(args.limit)
        else:
            result = policy.status()
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (Error, OSError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
