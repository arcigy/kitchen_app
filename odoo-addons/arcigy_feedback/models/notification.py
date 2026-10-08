import json
from datetime import timedelta
from requests import Session
from odoo import api, fields, models, SUPERUSER_ID
from odoo.exceptions import ValidationError
from odoo.modules.registry import Registry
from odoo.addons.mail.tools.web_push import push_to_end_point, DeviceUnreachableError
from .feedback import ENVIRONMENTS


class CheckedPushSession(Session):
    def post(self, *args, **kwargs):
        response = super().post(*args, **kwargs)
        if response.status_code not in (201, 404, 410):
            # The native helper only logs 429/5xx; raise so our durable queue retries.
            raise RuntimeError('Push service HTTP ' + str(response.status_code))
        return response


class FeedbackNotification(models.Model):
    _name = 'arcigy.feedback.notification'
    _description = 'Upozornenie Arcigy'
    task_id = fields.Many2one('project.task', required=True, ondelete='restrict', index=True)
    partner_id = fields.Many2one('res.partner', required=True, ondelete='restrict')
    device_id = fields.Many2one('mail.push.device', ondelete='set null')
    delivery_key = fields.Char(required=True)
    state = fields.Selection([('inbox', 'V Odoo'), ('pending', 'Čaká na odoslanie'),
                             ('accepted', 'Push služba prijala'), ('expired', 'Zariadenie treba znovu pripojiť')], required=True)
    read_at = fields.Datetime()
    attempts = fields.Integer(default=0)
    next_attempt = fields.Datetime(default=fields.Datetime.now)
    last_error = fields.Char()
    _unique_delivery = models.Constraint('unique(delivery_key)', 'Upozornenie už existuje.')

    @api.model
    def _send_pending(self):
        self.env.cr.execute("SELECT id FROM arcigy_feedback_notification WHERE state='pending' AND next_attempt <= NOW() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 20")
        records = self.sudo().browse([r[0] for r in self.env.cr.fetchall()])
        params = self.env['ir.config_parameter'].sudo()
        private_key = params.get_param('mail.web_push_vapid_private_key')
        public_key = params.get_param('mail.web_push_vapid_public_key')
        for notice in records:
            task = notice.task_id
            device = notice.device_id
            if not device:
                notice.state = 'expired'
                continue
            notice.attempts += 1
            notice.next_attempt = fields.Datetime.now() + timedelta(minutes=min(60, 2 ** min(notice.attempts-1, 6)))
            if not private_key or not public_key:
                notice.last_error = 'Web Push ešte nie je nastavený.'
                continue
            payload = {'title': '[' + dict(ENVIRONMENTS)[task.arcigy_environment] + '] ' + (task.arcigy_company or task.arcigy_tenant_id or 'Arcigy'),
                       'options': {'body': task.arcigy_title, 'tag': 'arcigy-feedback-' + str(task.id),
                                   'data': {'model': 'arcigy.feedback', 'res_id': task.id}}}
            try:
                push_to_end_point(base_url=self.get_base_url(), device={'id': device.id, 'endpoint': device.endpoint, 'keys': device.keys},
                    payload=json.dumps(payload), vapid_private_key=private_key, vapid_public_key=public_key, session=CheckedPushSession())
                notice.write({'state': 'accepted', 'last_error': False})
            except DeviceUnreachableError:
                notice.write({'state': 'expired', 'last_error': 'Povoľte upozornenia znova na zariadení.'})
            except Exception:
                notice.last_error = 'Push služba nepotvrdila prijatie; pokus sa zopakuje.'


class FeedbackTaskNotification(models.Model):
    _inherit = 'project.task'

    def _arcigy_notify(self):
        self.ensure_one()
        user = self.env.ref('base.user_admin')
        partner = user.partner_id
        notices = self.env['arcigy.feedback.notification'].sudo()
        notices.create({'task_id': self.id, 'partner_id': partner.id, 'delivery_key': 'inbox:' + str(self.id), 'state': 'inbox'})
        devices = self.env['mail.push.device'].sudo().search([('partner_id', '=', partner.id)])
        for device in devices:
            notices.create({'task_id': self.id, 'partner_id': partner.id, 'device_id': device.id,
                            'delivery_key': 'push:' + str(self.id) + ':' + str(device.id), 'state': 'pending'})
        partner._bus_send('arcigy.feedback/new', self._arcigy_summary())
        database = self.env.cr.dbname
        if not self.env.context.get('arcigy_test_no_push'):
            def send_after_commit():
                with Registry(database).cursor() as cr:
                    env = api.Environment(cr, SUPERUSER_ID, {})
                    env['arcigy.feedback.notification']._send_pending()
                    cr.commit()
            self.env.cr.postcommit.add(send_after_commit)

    @api.model
    def arcigy_inbox(self, read_task_id=None):
        self._arcigy_role('manager')
        notices = self.env['arcigy.feedback.notification'].sudo()
        domain = [('partner_id', '=', self.env.user.partner_id.id), ('state', '=', 'inbox'), ('read_at', '=', False)]
        if read_task_id is not None:
            if type(read_task_id) is not int:
                raise ValidationError('Neplatné hlásenie.')
            notices.search(domain + [('task_id', '=', read_task_id)]).write({'read_at': fields.Datetime.now()})
        return {'count': notices.search_count(domain)}
