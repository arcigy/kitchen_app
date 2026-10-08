"""Capture inside the source transaction, network only after its commit."""
import json
import re
from datetime import timedelta, timezone

from odoo import api, fields, models, SUPERUSER_ID
from odoo.exceptions import ValidationError
from odoo.modules.registry import Registry
from ..webhook_wire import send

IDENTITY = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$')
PARAMETER = 'arcigy_feedback.webhook_cutover'


class FeedbackWebhookOutbox(models.Model):
    _name = 'arcigy.feedback.webhook.outbox'
    _description = 'Trvalé doručenie udalostí opráv Arcigy'
    event_id = fields.Many2one('arcigy.feedback.event', required=True, ondelete='restrict', index=True)
    body = fields.Text(required=True)
    state = fields.Selection([('pending', 'Čaká'), ('accepted', 'Prijaté')], default='pending', required=True, index=True)
    attempts = fields.Integer(default=0)
    next_attempt = fields.Datetime(default=fields.Datetime.now, index=True)
    last_error = fields.Char()
    _unique_event = models.Constraint('unique(event_id)', 'Udalosť už je vo fronte.')

    @api.model
    def _configuration(self, lock=False):
        # Read the single installed row directly, avoiding worker-local config
        # caches. FOR UPDATE causes a stale REPEATABLE READ transaction to fail
        # serialization and retry rather than miss a concurrent activation.
        self.env.cr.execute('SELECT value FROM ir_config_parameter WHERE key=%s'+(' FOR UPDATE' if lock else ''), (PARAMETER,))
        row = self.env.cr.fetchone()
        if not row:
            raise ValidationError('Najprv aktualizujte modul a inicializujte webhook konfiguráciu.')
        return json.loads(row[0])

    @api.model
    def _capture(self, event):
        # The same transaction lock is used by activation. IDs/sequences alone
        # cannot safely determine which concurrent commits belong to cutover.
        config = self._configuration(lock=True)
        epoch = config.get('epoch')
        task = event.task_id
        if config.get('enabled') is not True or not epoch or event.kind != 'received' or not task.arcigy_ready or task.arcigy_legacy:
            return
        source = config['source_id']
        identities = [source, epoch, task.arcigy_tenant_id, str(task.project_id.id)]
        if any(not isinstance(v, str) or not IDENTITY.fullmatch(v) for v in identities):
            raise ValidationError('Neplatná identita webhook zdroja.')
        body = {'schema_version': 1, 'source_id': source, 'tenant_id': task.arcigy_tenant_id,
                'project_id': str(task.project_id.id), 'event_id': event.id, 'report_id': task.id,
                'revision': task.arcigy_revision, 'event_type': 'received', 'origin': 'live',
                'occurred_at': event.create_date.replace(tzinfo=timezone.utc).isoformat(), 'cutover_epoch': epoch}
        record = self.sudo().create({'event_id': event.id, 'body': json.dumps(body, sort_keys=True, separators=(',', ':'))})
        database, record_id = self.env.cr.dbname, record.id
        if not self.env.context.get('arcigy_test_no_push'):
            def after_commit():
                # Failure cannot undo the accepted report. A durable outbox row
                # remains for the deterministic cron retry after process death.
                try:
                    with Registry(database).cursor() as cr:
                        env = api.Environment(cr, SUPERUSER_ID, {})
                        env['arcigy.feedback.webhook.outbox']._send_pending([record_id])
                        cr.commit()
                except Exception:
                    pass
            self.env.cr.postcommit.add(after_commit)

    @api.model
    def _send_pending(self, record_ids=None):
        self.flush_model(['state','next_attempt'])
        ids = ' AND id = ANY(%s)' if record_ids is not None else ''
        self.env.cr.execute("SELECT id FROM arcigy_feedback_webhook_outbox WHERE state='pending' AND next_attempt <= clock_timestamp()" + ids +
                            ' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 20', (record_ids,) if record_ids is not None else ())
        records = self.sudo().browse([row[0] for row in self.env.cr.fetchall()])
        key_id = self._configuration().get('key_id')
        for record in records:
            record.attempts += 1
            record.next_attempt = fields.Datetime.now()+timedelta(seconds=min(3600, 2**min(record.attempts, 12)))
            try:
                send(record.body.encode(), key_id)
                record.write({'state': 'accepted', 'last_error': False})
            except Exception:
                record.last_error = 'Receiver nepotvrdil trvalé prijatie; opakovanie zostáva vo fronte.'


class FeedbackWebhookTask(models.Model):
    _inherit = 'project.task'

    @api.model
    def arcigy_activate_webhook(self, source_id, epoch, key_id):
        self._arcigy_role('manager')
        if any(not isinstance(v, str) or not IDENTITY.fullmatch(v) for v in (source_id, epoch, key_id)):
            raise ValidationError('Neplatná konfigurácia webhooku.')
        old_config = self.env['arcigy.feedback.webhook.outbox']._configuration(lock=True)
        params = self.env['ir.config_parameter'].sudo()
        old = old_config.get('epoch')
        if old and (old != epoch or old_config.get('source_id') != source_id):
            raise ValidationError('Aktívna epocha sa nesmie potichu zmeniť.')
        params.set_param(PARAMETER,json.dumps({'enabled':True,'source_id':source_id,'epoch':epoch,'key_id':key_id}))
        return {'sourceId': source_id, 'epoch': epoch, 'active': True}

    @api.model
    def arcigy_deactivate_webhook(self):
        self._arcigy_role('manager')
        config = self.env['arcigy.feedback.webhook.outbox']._configuration(lock=True)
        config['enabled'] = False
        self.env['ir.config_parameter'].sudo().set_param(PARAMETER,json.dumps(config))
        return {'active': False}
