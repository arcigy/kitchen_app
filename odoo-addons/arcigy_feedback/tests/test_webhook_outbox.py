"""Run only in an isolated Odoo test database, never against customer data."""
import json
from unittest.mock import patch

from odoo.exceptions import ValidationError
from .test_feedback import TestFeedback


class TestWebhookOutbox(TestFeedback):
    def activate(self):
        return self.env['project.task'].with_user(self.env.ref('base.user_admin')).arcigy_activate_webhook('source-a','epoch-a','current')

    def test_capture_after_complete_once_and_not_backfill(self):
        _,_,old = self.create_report()
        self.activate()
        api,_,task = self.create_report()
        outbox = self.env['arcigy.feedback.webhook.outbox'].sudo()
        records = outbox.search([('event_id.task_id','=',task.id)])
        self.assertEqual(len(records),1)
        value = json.loads(records.body)
        self.assertEqual(value['report_id'],task.id)
        self.assertEqual(value['tenant_id'],task.arcigy_tenant_id)
        self.assertEqual(value['origin'],'live')
        self.assertFalse(outbox.search([('event_id.task_id','=',old.id)]))
        api.arcigy_complete_report(task.id)
        self.assertEqual(outbox.search_count([('event_id.task_id','=',task.id)]),1)

    def test_sender_failure_preserves_pending_for_retry(self):
        self.activate();_,_,task = self.create_report()
        model = self.env['arcigy.feedback.webhook.outbox'].sudo()
        record = model.search([('event_id.task_id','=',task.id)])
        with patch('odoo.addons.arcigy_feedback.models.webhook_outbox.send',side_effect=TimeoutError('fixture')):
            model._send_pending(record.ids)
        self.assertEqual(record.state,'pending')
        self.assertEqual(record.attempts,1)
        record.next_attempt = False
        # Use an explicit past time so the SQL retry selection is exercised.
        record.next_attempt = '2000-01-01 00:00:00'
        with patch('odoo.addons.arcigy_feedback.models.webhook_outbox.send') as sender:
            model._send_pending(record.ids)
        self.assertEqual(record.state,'accepted')
        self.assertEqual(sender.call_args.args[0],record.body.encode())

    def test_outbox_rolls_back_with_source_transaction(self):
        self.activate()
        before = self.env['arcigy.feedback.webhook.outbox'].sudo().search_count([])
        with self.assertRaisesRegex(RuntimeError,'fixture rollback'):
            with self.env.cr.savepoint():
                self.create_report()
                raise RuntimeError('fixture rollback')
        self.assertEqual(self.env['arcigy.feedback.webhook.outbox'].sudo().search_count([]),before)

    def test_atomic_claim_checks_current_revision_and_idempotent_owner(self):
        _,_,task = self.create_report()
        agent = self.env['project.task'].with_user(self.agent)
        with self.assertRaises(ValidationError):
            agent.arcigy_work_report(task.id,'stale','start',{'worker':'fixture','expected_revision':task.arcigy_revision-1})
        details = {'worker':'fixture','expected_revision':task.arcigy_revision}
        first = agent.arcigy_work_report(task.id,'owner','start',details)
        retry = agent.arcigy_work_report(task.id,'owner','start',details)
        self.assertEqual(first['claim'],'owner')
        self.assertEqual(retry['claim'],'owner')
        with self.assertRaises(ValidationError):
            agent.arcigy_work_report(task.id,'foreign','start',{'worker':'other','expected_revision':task.arcigy_revision})

