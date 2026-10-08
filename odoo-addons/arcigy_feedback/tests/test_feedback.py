import base64
import hashlib
import uuid
from copy import deepcopy
from unittest.mock import patch
from odoo import Command
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import AccessError, ValidationError


@tagged('post_install', '-at_install')
class TestFeedback(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env['project.project'].create({'name': 'Isolated feedback tests'})
        cls.env['ir.config_parameter'].sudo().set_param('arcigy_feedback.project_id', str(cls.project.id))
        cls.ingest = cls.env['res.users'].create({'name': 'Feedback test ingest', 'login': 'feedback-ingest-'+uuid.uuid4().hex,
            'arcigy_feedback_environment': 'develop', 'group_ids': [Command.set([cls.env.ref('base.group_portal').id, cls.env.ref('arcigy_feedback.group_ingest').id])]})
        cls.agent = cls.env['res.users'].create({'name': 'Feedback test agent', 'login': 'feedback-agent-'+uuid.uuid4().hex,
            'group_ids': [Command.set([cls.env.ref('base.group_portal').id, cls.env.ref('arcigy_feedback.group_agent').id])]})
        cls.release = cls.env['res.users'].create({'name': 'Feedback test release', 'login': 'feedback-release-'+uuid.uuid4().hex,
            'arcigy_feedback_environment': 'develop', 'group_ids': [Command.set([cls.env.ref('base.group_portal').id, cls.env.ref('arcigy_feedback.group_release').id])]})

    def report(self):
        self.content = {'screenshot.png': b'png-for-tests', 'diagnostics.json': b'{"hello":true}'}
        return {'version': 1, 'environment': 'develop', 'submissionId': uuid.uuid4().hex, 'tenantId': 'tenant-a',
            'userId': 'user-a', 'company': 'Firma A', 'author': 'Autor A', 'title': 'Farba dosky', 'description': 'Prvý riadok\nDruhý riadok',
            'comment': 'Doplnenie', 'kind': 'bug', 'capturedAt': '2026-09-18T00:00:00Z', 'sourceCommit': 'a'*40,
            'files': [{'name': name, 'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'mimetype': 'application/octet-stream'} for name, raw in self.content.items()]}

    def create_report(self):
        api = self.env['project.task'].with_user(self.ingest).with_context(arcigy_test_no_push=True)
        report = self.report()
        task_id = api.arcigy_begin_report(report)['taskId']
        for name, raw in self.content.items():
            api.arcigy_upload_part(task_id, name, 0, base64.b64encode(raw).decode())
        api.arcigy_complete_report(task_id)
        return api, report, self.env['project.task'].browse(task_id)

    def test_idempotence_and_incomplete_upload(self):
        api = self.env['project.task'].with_user(self.ingest).with_context(arcigy_test_no_push=True)
        report = self.report()
        task_id = api.arcigy_begin_report(report)['taskId']
        self.assertEqual(api.arcigy_begin_report(report)['taskId'], task_id)
        with self.assertRaises(ValidationError):
            api.arcigy_complete_report(task_id)
        self.assertFalse(self.env['project.task'].browse(task_id).arcigy_ready)
        altered = deepcopy(report)
        altered['title'] = 'Iný problém'
        with self.assertRaises(ValidationError):
            api.arcigy_begin_report(altered)

    def test_complete_is_atomic_and_notifies_once(self):
        api, report, task = self.create_report()
        attachments = self.env['ir.attachment'].search_count([('res_model', '=', 'project.task'), ('res_id', '=', task.id)])
        notices = len(task.arcigy_notifications)
        api.arcigy_complete_report(task.id)
        self.assertEqual(attachments, 2)
        self.assertEqual(len(task.arcigy_notifications), notices)
        self.assertTrue(task.arcigy_ready)
        self.assertEqual(task.arcigy_environment, 'develop')
        self.assertEqual(task.arcigy_body, report['description'])

    def test_scoped_auth_and_attachment_access(self):
        api, report, task = self.create_report()
        report['environment'] = 'main'
        with self.assertRaises(AccessError):
            api.arcigy_begin_report(report)
        with self.assertRaises(AccessError):
            api.arcigy_read_report(task.id)
        agent_api = self.env['project.task'].with_user(self.agent)
        other = self.env['ir.attachment'].create({'name': 'private', 'raw': b'private', 'res_model': 'project.project', 'res_id': self.project.id})
        with self.assertRaises(AccessError):
            agent_api.arcigy_read_attachment(task.id, other.id)
        self.assertEqual(agent_api.arcigy_read_report(task.id)['status'], 'new')

    def test_claim_complete_release_rollback_and_stale_event(self):
        _, _, task = self.create_report()
        agent = self.env['project.task'].with_user(self.agent)
        agent.arcigy_work_report(task.id, 'claim-a', 'start', {'worker': 'Codex A'})
        with self.assertRaises(ValidationError):
            agent.arcigy_work_report(task.id, 'claim-b', 'start', {'worker': 'Codex B'})
        agent.arcigy_work_report(task.id, 'done-a', 'complete', {'claim': 'claim-a', 'summary': 'Opravené', 'tests': 'Regresia prešla'})
        release = self.env['project.task'].with_user(self.release)
        receipt = {'environment': 'develop', 'revision': 'b'*40, 'sequence': 10, 'health': True, 'postgresReady': True,
                   'fixes': [{'reportId': task.id, 'commit': 'a'*40}]}
        release.arcigy_record_fix(receipt['fixes'][0])
        release.arcigy_record_release(receipt)
        self.assertEqual(task.arcigy_status, 'develop')
        release.arcigy_record_release({**receipt, 'sequence': 11, 'fixes': []})
        self.assertEqual(task.arcigy_status, 'implemented')
        self.assertFalse(release.arcigy_record_release(receipt)['applied'])
        self.assertEqual(task.arcigy_status, 'implemented')

    def test_migration_preserves_original_and_no_notification(self):
        original = self.env['project.task'].create({'name': '[Arcigy bug] Starý problém', 'project_id': self.project.id,
            'description': '<p>Arcigy feedback report\nsubmission=old\ntype=bug\n\nNeopravené</p>'})
        before = (original.name, original.description, original.state, original.stage_id.id)
        attachment = self.env['ir.attachment'].create({'name': 'diagnostics.json', 'raw': b'{"reporter":{"clientId":"delfi","userId":"ales"}}',
            'res_model': 'project.task', 'res_id': original.id})
        self.env['ir.config_parameter'].sudo().set_param('arcigy_feedback.legacy_baseline', original.id)
        self.env['project.task']._arcigy_migrate_legacy()
        self.env['project.task']._arcigy_migrate_legacy()
        self.assertEqual(before, (original.name, original.description, original.state, original.stage_id.id))
        self.assertEqual(original.arcigy_status, 'review')
        self.assertEqual(original.arcigy_environment, 'unknown')
        self.assertEqual(original.arcigy_tenant_id, 'delfi')
        self.assertEqual(attachment.raw, b'{"reporter":{"clientId":"delfi","userId":"ales"}}')
        self.assertFalse(original.arcigy_notifications)
        self.assertEqual(len(original.arcigy_events), 1)

    def test_push_transient_failure_is_retried(self):
        _, _, task = self.create_report()
        notice = task.arcigy_notifications.filtered(lambda n: n.state == 'pending')[:1]
        if not notice:
            device = self.env['mail.push.device'].sudo().create({'partner_id': self.env.ref('base.user_admin').partner_id.id,
                'endpoint': 'https://push.invalid/test', 'keys': '{}'})
            notice = self.env['arcigy.feedback.notification'].create({'task_id': task.id, 'partner_id': device.partner_id.id,
                'device_id': device.id, 'delivery_key': 'test-push', 'state': 'pending'})
        notice.next_attempt = '2000-01-01 00:00:00'
        self.env.flush_all()
        with patch('odoo.addons.arcigy_feedback.models.notification.push_to_end_point', side_effect=RuntimeError('503')):
            self.env['arcigy.feedback.notification']._send_pending()
        self.assertEqual(notice.state, 'pending')
        self.assertGreater(notice.attempts, 0)

    def test_new_legacy_sender_notifies_only_when_all_attachments_exist(self):
        self.env['ir.config_parameter'].sudo().set_param('arcigy_feedback.legacy_baseline', '0')
        task = self.env['project.task'].create({'name':'[Arcigy bug] Nový starý klient', 'project_id':self.project.id,
            'description':'<p>Arcigy feedback report\nsubmission=legacy-new\ntype=bug\n\nCelý text</p>'})
        attachments = self.env['ir.attachment'].with_context(arcigy_test_no_push=True)
        for name in ('screenshot.png', 'project-snapshot.json'):
            attachments.create({'name':name,'raw':b'{}','res_model':'project.task','res_id':task.id})
        self.assertFalse(task.arcigy_ready)
        self.assertFalse(task.arcigy_notifications)
        attachments.create({'name':'diagnostics.json','raw':b'{"reporter":{"clientId":"tenant-a","userId":"user-a"}}',
            'res_model':'project.task','res_id':task.id})
        self.assertTrue(task.arcigy_ready)
        self.assertEqual(task.arcigy_status,'new')
        self.assertEqual(task.arcigy_environment,'unknown')
        notices = len(task.arcigy_notifications)
        self.env['project.task']._arcigy_migrate_legacy()
        self.assertEqual(len(task.arcigy_notifications),notices)

    def test_release_reconciliation_no_duplicate_history_and_main_rollback(self):
        _, _, task = self.create_report()
        agent = self.env['project.task'].with_user(self.agent)
        agent.arcigy_work_report(task.id,'claim','start',{'worker':'Codex'})
        agent.arcigy_work_report(task.id,'done','complete',{'claim':'claim','summary':'Opravené','tests':'Prešli'})
        release = self.env['project.task'].with_user(self.release)
        receipt = {'environment':'develop','revision':'a'*40,'sequence':100,'health':True,'postgresReady':True,
            'fixes':[{'reportId':task.id,'commit':'b'*40}]}
        release.arcigy_record_fix(receipt['fixes'][0])
        release.arcigy_record_release(receipt)
        event_count = len(task.arcigy_events)
        release.arcigy_record_release({**receipt,'sequence':101})
        self.assertEqual(len(task.arcigy_events),event_count)
        self.release.arcigy_feedback_environment = 'main'
        release.arcigy_record_release({**receipt,'environment':'main'})
        self.assertEqual(task.arcigy_status,'main')
        release.arcigy_record_release({**receipt,'environment':'main','sequence':102,'fixes':[]})
        self.assertEqual(task.arcigy_status,'develop')
        agent.arcigy_work_report(task.id,'reopen','reopen',{'reason':'Potrebná ďalšia oprava'})
        agent.arcigy_work_report(task.id,'new-claim','start',{'worker':'Codex'})
        agent.arcigy_work_report(task.id,'new-done','complete',{'claim':'new-claim','summary':'Ďalšia lokálna oprava','tests':'Prešli'})
        release.arcigy_record_fix(receipt['fixes'][0])
        release.arcigy_record_release({**receipt,'environment':'main','sequence':103})
        self.assertEqual(task.arcigy_status,'implemented','An old deployed commit must not resolve a new repair.')
        new_fix = {'reportId':task.id,'commit':'c'*40}
        release.arcigy_record_fix(new_fix)
        release.arcigy_record_release({**receipt,'environment':'main','sequence':104,'fixes':[new_fix]})
        self.assertEqual(task.arcigy_status,'main')
        release.arcigy_record_release({**receipt,'environment':'main','sequence':105,'fixes':[]})
        self.assertEqual(task.arcigy_status,'implemented','Rollback cannot fall back to an older repair on develop.')
        release.arcigy_record_release({**receipt,'environment':'main','sequence':106,'fixes':[new_fix]})
        release.arcigy_record_release({**receipt,'environment':'main','sequence':107})
        self.assertEqual(task.arcigy_status,'implemented','Rolling back to an older fix for the same report is still a rollback.')
