import concurrent.futures
import json
from pathlib import Path
import tempfile
import unittest

from model_policy import COMPLEXITIES, Error, ModelPolicy, PHASES


class ModelPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.policy = ModelPolicy(self.root)

    def select(self, phase='execution', complexity='medium', task='ARC-1', **kwargs):
        return self.policy.select(task, phase, complexity, reason='Explicit approved scope assessment', **kwargs)

    def outcome(self, choice, outcome='quality_pass', **kwargs):
        payload = {'outcome': outcome, 'verified': True, 'evidence': 'Actual tests passed' if outcome == 'quality_pass' else 'Actual test exposes model error'}
        payload.update(kwargs)
        return self.policy.outcome(choice['routing_id'], payload)

    def test_defaults_and_planning_floor(self):
        for phase in PHASES:
            for complexity in COMPLEXITIES:
                choice = self.select(phase, complexity)
                self.assertNotIn('terra', choice['model'])
                if phase == 'planning':
                    self.assertIn(choice['model'], {'gpt-6.1-sol', 'gpt-6-astra'})
                    self.assertIn(choice['reasoning'], {'high', 'xhigh', 'max'})
        self.assertEqual(self.select('execution')['model'], 'gpt-6-luna')
        self.assertEqual(self.select('integration')['reasoning'], 'medium')
        self.assertEqual(self.select('planning', 'hard')['model'], 'gpt-6-astra')

    def test_failure_escalation_persists(self):
        self.outcome(self.select(), 'quality_fail')
        self.policy = ModelPolicy(self.root)
        choice = self.select()
        self.assertEqual((choice['model'], choice['reasoning']), ('gpt-6.1-sol', 'medium'))
        self.assertEqual(choice['sample_size'], 1)
        self.assertEqual(self.select(complexity='simple')['model'], 'gpt-6-luna')

    def test_infrastructure_and_incomplete_never_escalate(self):
        for outcome in ('infrastructure_failure', 'cancelled', 'awaiting_review'):
            self.policy.outcome(self.select()['routing_id'], {'outcome': outcome, 'evidence': 'Network unavailable'})
        self.assertEqual(self.select()['model'], 'gpt-6-luna')
        self.assertEqual(self.select()['sample_size'], 0)

    def test_quality_requires_verified_evidence(self):
        choice = self.select()
        for payload in ({'outcome': 'quality_pass'}, {'outcome': 'quality_fail', 'verified': True}, {'outcome': 'cancelled', 'verified': True, 'evidence': 'raw completion'}):
            with self.assertRaises(Error):
                self.policy.outcome(choice['routing_id'], payload)

    def test_downshift_trial_failure_returns_to_baseline(self):
        for _ in range(3):
            choice = self.select(complexity='hard')
            self.assertIsNone(choice['experiment'])
            self.outcome(choice, duration_seconds=301)
        trial = self.select(complexity='hard')
        self.assertEqual(trial['model'], 'gpt-6-luna')
        self.assertEqual(trial['experiment']['kind'], 'cheaper_trial')
        concurrent = self.select(complexity='hard')
        self.assertEqual(concurrent['model'], 'gpt-6.1-sol')
        self.assertIsNone(concurrent['experiment'])
        self.outcome(trial, 'quality_fail')
        restored = self.select(complexity='hard')
        self.assertEqual(restored['model'], 'gpt-6.1-sol')
        self.assertIsNone(restored['experiment'])

    def test_downshift_trial_success_adopts_cheaper_rung(self):
        for _ in range(3):
            self.outcome(self.select(complexity='hard'), tokens={'input': 31000, 'output': 100}, usage_source='codex turn.completed')
        trial = self.select(complexity='hard')
        self.outcome(trial)
        choice = self.select(complexity='hard')
        self.assertEqual(choice['model'], 'gpt-6-luna')
        self.assertIsNone(choice['experiment'])

    def test_successes_without_costly_measurements_do_not_trial(self):
        for _ in range(5):
            self.outcome(self.select(complexity='hard'))
        self.assertIsNone(self.select(complexity='hard')['experiment'])

    def test_planning_downshift_never_below_required_effort(self):
        for _ in range(15):
            self.outcome(self.select('planning', 'complex'), duration_seconds=400)
        choice = self.select('planning', 'complex')
        self.assertEqual(choice['model'], 'gpt-6.1-sol')
        self.assertEqual(choice['reasoning'], 'xhigh')
        for _ in range(10):
            self.outcome(self.select('planning', 'simple'), duration_seconds=400)
        self.assertEqual(self.select('planning', 'simple')['reasoning'], 'high')

    def test_excluded_samples_preserve_history_without_training(self):
        for _ in range(4):
            self.outcome(self.select(), 'quality_fail', eligible=False)
            self.outcome(self.select(complexity='hard'), duration_seconds=999, eligible=False)
        self.assertEqual(self.select()['model'], 'gpt-6-luna')
        self.assertEqual(self.select()['sample_size'], 0)
        self.assertIsNone(self.select(complexity='hard')['experiment'])
        self.assertTrue(any(row['outcome'] and row['outcome']['eligible'] is False for row in self.policy.history()))

    def test_awaiting_review_finalizes_once_and_preserves_telemetry(self):
        choice = self.select()
        pending = {'outcome': 'awaiting_review', 'tokens': {'input': 12, 'output': 4, 'cached_input': 3}, 'duration_seconds': 2, 'usage_source': 'codex turn.completed'}
        self.policy.outcome(choice['routing_id'], pending)
        done = self.outcome(choice)
        self.assertEqual(done['tokens'], pending['tokens'])
        self.assertEqual(done['duration_seconds'], 2)
        self.assertIsNone(done['credits'])
        self.outcome(choice)
        self.policy.outcome(choice['routing_id'], done)
        self.assertEqual(self.select()['sample_size'], 1)
        with self.assertRaises(Error):
            self.outcome(choice, 'quality_fail')

    def test_sample_cannot_become_eligible_on_review(self):
        choice = self.select()
        self.policy.outcome(choice['routing_id'], {'outcome': 'awaiting_review', 'eligible': False})
        with self.assertRaises(Error):
            self.outcome(choice, eligible=True)
        result = self.outcome(choice)
        self.assertFalse(result['eligible'])
        self.assertEqual(self.select()['sample_size'], 0)

    def test_unavailable_credits_null_and_usage_requires_source(self):
        choice = self.select()
        with self.assertRaises(Error):
            self.outcome(choice, credits=3)
        with self.assertRaises(Error):
            self.outcome(choice, tokens={'input': 3})
        result = self.outcome(choice)
        self.assertIsNone(result['credits'])
        self.assertIsNone(result['tokens'])

    def test_astra_execution_requires_exception_and_task_failure(self):
        with self.assertRaises(Error):
            self.select(exceptional_reason='Unusual requirement')
        failed = self.select()
        self.outcome(failed, 'quality_fail')
        with self.assertRaises(Error):
            self.select(task='ARC-2', exceptional_reason='Different task')
        with self.assertRaises(Error):
            self.select(exceptional_reason='Only one Luna failure')
        self.outcome(self.select(), 'quality_fail')
        with self.assertRaises(Error):
            self.select(exceptional_reason='Sol medium failure still insufficient')
        self.outcome(self.select(), 'quality_fail')
        choice = self.select(exceptional_reason='Verified lower model missed critical requirements')
        self.assertEqual(choice['model'], 'gpt-6-astra')
        self.assertIn('Explicit exceptional', choice['policy_reason'])
        for _ in range(10):
            self.outcome(self.select(), 'quality_fail')
        self.assertEqual(self.select()['model'], 'gpt-6.1-sol')

    def test_sample_selection_does_not_reserve_trial_or_change_learning(self):
        for _ in range(3):
            self.outcome(self.select(complexity='hard'), duration_seconds=999)
        before = self.policy.status()['policies']['execution:hard']
        sample = self.select(complexity='hard', eligible=False)
        self.assertIsNone(sample['experiment'])
        self.outcome(sample, duration_seconds=999)
        self.assertEqual(before, self.policy.status()['policies']['execution:hard'])
        self.assertIsNotNone(self.select(complexity='hard')['experiment'])
        with self.assertRaises(Error):
            self.outcome(self.select(eligible=False), eligible=True)

    def test_new_quality_failure_prevents_stale_trial_from_lowering_policy(self):
        for _ in range(3):
            self.outcome(self.select(complexity='hard'), duration_seconds=999)
        trial = self.select(complexity='hard')
        normal = self.select(complexity='hard')
        self.outcome(normal, 'quality_fail')
        self.outcome(trial)
        self.assertEqual(self.select(complexity='hard')['reasoning'], 'high')

    def test_invalid_inputs(self):
        for phase, complexity in [('other', 'medium'), ('planning', 'huge')]:
            with self.assertRaises(Error):
                self.select(phase, complexity)
        for value in (-1, True, 1.2, float('inf')):
            with self.assertRaises(Error):
                self.outcome(self.select(), tokens={'input': value}, usage_source='event')
        for payload in ({'outcome': []}, {'outcome': 'done'}, {'outcome': 'quality_pass', 'verified': 'yes'}, {'outcome': 'cancelled', 'unexpected': 1}):
            with self.assertRaises(Error):
                self.policy.outcome(self.select()['routing_id'], payload)

    def test_concurrent_selection_and_outcome_are_serialized(self):
        def attempt(index):
            policy = ModelPolicy(self.root)
            choice = policy.select('ARC-' + str(index), 'integration', reason='Independent attempt')
            payload = {'outcome': 'quality_pass', 'verified': True, 'evidence': 'Checks passed', 'duration_seconds': 301}
            policy.outcome(choice['routing_id'], payload)
            policy.outcome(choice['routing_id'], payload)
            return choice['routing_id']
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            ids = list(pool.map(attempt, range(20)))
        self.assertEqual(len(set(ids)), 20)
        self.assertEqual(self.policy.status()['policies']['integration:medium']['sample_size'], 20)
        with self.policy.transaction() as db:
            events = db.execute('SELECT COUNT(*) FROM model_policy_events').fetchone()[0]
        self.assertEqual(events, 40)

    def test_config_threshold_validation(self):
        path = self.root / '.codex-orchestrator' / 'model-policy.json'
        for config in ({'min_successes': 2}, {'max_seconds': -1}, {'unknown': 12}):
            path.write_text(json.dumps(config))
            with self.assertRaises(Error):
                ModelPolicy(self.root)


if __name__ == '__main__':
    unittest.main()
