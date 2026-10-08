import base64
import hashlib
import json
import re
from datetime import datetime

from markupsafe import Markup, escape
from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError

STATES = [('review', 'Na preverenie'), ('new', 'Nové'), ('working', 'Pracuje sa'),
          ('implemented', 'Zapracované'), ('develop', 'Nasadené na develope'), ('main', 'Vyriešené v produkcii')]
ENVIRONMENTS = [('unknown', 'Pôvod neoverený'), ('local', 'Local'), ('develop', 'Develop'), ('main', 'Main')]
KINDS = [('bug', 'Chyba'), ('feature_request', 'Nová funkcia'), ('improvement', 'Zlepšenie'),
         ('question', 'Otázka / podpora'), ('other', 'Iné')]
SHA = re.compile(r'^[a-f0-9]{64}$')
COMMIT = re.compile(r'^[a-f0-9]{40}$')


def bounded(value, label, limit=200, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValidationError('Neplatné pole: ' + label)
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


class FeedbackUser(models.Model):
    _inherit = 'res.users'
    arcigy_feedback_environment = fields.Selection(ENVIRONMENTS[1:], groups='base.group_system')


class FeedbackEvent(models.Model):
    _name = 'arcigy.feedback.event'
    _description = 'História opravy Arcigy'
    _order = 'id desc'
    task_id = fields.Many2one('project.task', required=True, ondelete='restrict', index=True)
    event_key = fields.Char(required=True, index=True)
    kind = fields.Char(required=True)
    payload = fields.Json(required=True)
    actor_id = fields.Many2one('res.users', required=True)
    _unique_key = models.Constraint('unique(event_key)', 'Udalosť už bola prijatá.')


class FeedbackPart(models.Model):
    _name = 'arcigy.feedback.part'
    _description = 'Časť podkladu Arcigy'
    task_id = fields.Many2one('project.task', required=True, ondelete='restrict', index=True)
    filename = fields.Char(required=True)
    number = fields.Integer(required=True)
    content = fields.Binary(attachment=True, required=True)
    checksum = fields.Char(required=True)
    _unique_part = models.Constraint('unique(task_id, filename, number)', 'Časť už bola prijatá.')


class FeedbackTask(models.Model):
    _inherit = 'project.task'

    arcigy_report = fields.Boolean(index=True, default=False)
    arcigy_ready = fields.Boolean(index=True, default=False)
    arcigy_key = fields.Char(index=True, copy=False)
    arcigy_fingerprint = fields.Char(copy=False)
    arcigy_environment = fields.Selection(ENVIRONMENTS, default='unknown', index=True)
    arcigy_status = fields.Selection(STATES, default='review', tracking=True, index=True)
    arcigy_kind = fields.Selection(KINDS, default='bug', index=True)
    arcigy_title = fields.Char()
    arcigy_body = fields.Text()
    arcigy_comment = fields.Text()
    arcigy_tenant_id = fields.Char(index=True)
    arcigy_company = fields.Char(index=True)
    arcigy_user_id = fields.Char(index=True)
    arcigy_author = fields.Char(index=True)
    arcigy_source_commit = fields.Char()
    arcigy_captured_at = fields.Char()
    arcigy_metadata = fields.Json()
    arcigy_manifest = fields.Json()
    arcigy_legacy = fields.Json(copy=False)
    arcigy_claim = fields.Char(copy=False)
    arcigy_revision = fields.Integer(default=0, copy=False)
    arcigy_worker = fields.Char()
    arcigy_screenshot = fields.Many2one('ir.attachment')
    arcigy_screenshot_data = fields.Binary(related='arcigy_screenshot.datas')
    arcigy_events = fields.One2many('arcigy.feedback.event', 'task_id')
    arcigy_notifications = fields.One2many('arcigy.feedback.notification', 'task_id')
    arcigy_timeline_html = fields.Html(compute='_arcigy_compute_timeline')
    _unique_arcigy_key = models.Constraint('unique(arcigy_key)', 'Hlásenie už existuje.')

    @api.depends('arcigy_events')
    def _arcigy_compute_timeline(self):
        labels = {'migration': 'Pôvodné hlásenie zachované na preverenie', 'received': 'Prijaté nové hlásenie',
                  'start': 'Začala sa oprava', 'complete': 'Oprava zapracovaná', 'reopen': 'Znovu otvorené',
                  'github': 'Oprava je na GitHube', 'deployment': 'Overené nasadenie', 'identity': 'Doplnená firma a autor'}
        for task in self:
            items = []
            for event in task.arcigy_events:
                data = event.payload or {}
                title = labels.get(event.kind, 'Aktualizácia hlásenia')
                detail = data.get('summary') or data.get('reason') or data.get('worker') or ''
                if event.kind == 'deployment':
                    title = ('Oprava nasadená: ' if data.get('included') else 'Oprava už nie je nasadená: ') + str(data.get('environment', '')).title()
                commit = data.get('commit') or data.get('revision')
                link = Markup('')
                if COMMIT.fullmatch(str(commit or '')):
                    link = Markup(' <a href="https://github.com/arcigy/kitchen_app/commit/%s" target="_blank" rel="noopener">Commit %s</a>') % (commit, commit[:10])
                items.append(Markup('<p><small>%s</small><br/><strong>%s</strong>%s<br/>%s</p>') %
                             (fields.Datetime.context_timestamp(task, event.create_date).strftime('%d.%m.%Y %H:%M'), title, link, detail))
            task.arcigy_timeline_html = Markup('').join(items)

    @api.depends('name', 'arcigy_report', 'arcigy_title')
    def _compute_display_name(self):
        super()._compute_display_name()
        for task in self.filtered('arcigy_report'):
            task.display_name = task.arcigy_title or task.name

    @api.model
    def arcigy_apply_identity_labels(self, identities):
        self._arcigy_role('manager')
        if not isinstance(identities, list) or len(identities) > 1000:
            raise ValidationError('Neplatný adresár.')
        count = 0
        for identity in identities:
            for key in ('tenantId', 'userId', 'company', 'author'):
                bounded(identity.get(key), key, 250)
            tasks = self.sudo().search([('arcigy_report', '=', True), ('arcigy_legacy', '!=', False),
                ('arcigy_tenant_id', '=', identity['tenantId']), ('arcigy_user_id', '=', identity['userId'])])
            for task in tasks:
                task._arcigy_lock()
                if task.arcigy_company == identity['company'] and task.arcigy_author == identity['author']:
                    continue
                task.write({'arcigy_company': identity['company'], 'arcigy_author': identity['author']})
                task._arcigy_event('identity:' + str(task.id) + ':' + digest(identity), 'identity', {'source': 'current_directory', **identity})
                count += 1
        return {'updated': count}

    def _arcigy_role(self, *roles):
        if not any(self.env.user.has_group('arcigy_feedback.group_' + role) for role in roles):
            raise AccessError('Nemáte prístup k tejto operácii podpory.')

    def get_formview_id(self, access_uid=None):
        if len(self) == 1 and self.arcigy_report:
            return self.env.ref('arcigy_feedback.form').id
        return super().get_formview_id(access_uid=access_uid)

    @api.model
    def arcigy_open_report(self, task_id):
        self._arcigy_role('manager')
        return self._arcigy_task(task_id).get_formview_action()

    def _arcigy_lock(self):
        self.ensure_one()
        self.env.cr.execute('SELECT id FROM project_task WHERE id=%s FOR UPDATE', (self.id,))
        self.invalidate_recordset()

    @api.model
    def _arcigy_task(self, task_id):
        if type(task_id) is not int:
            raise ValidationError('Neplatné číslo hlásenia.')
        task = self.sudo().browse(task_id).exists()
        if not task or not task.arcigy_report:
            raise AccessError('Hlásenie neexistuje.')
        return task

    @api.model
    def arcigy_begin_report(self, report):
        self._arcigy_role('ingest')
        if not isinstance(report, dict) or report.get('version') != 1:
            raise ValidationError('Nepodporovaná verzia hlásenia.')
        environment = report.get('environment')
        if environment != self.env.user.sudo().arcigy_feedback_environment or environment not in dict(ENVIRONMENTS[1:]):
            raise AccessError('Zdroj nezodpovedá integračnému účtu.')
        for key, size in [('submissionId', 120), ('tenantId', 150), ('userId', 150), ('company', 250),
                          ('author', 250), ('title', 180), ('description', 8000), ('capturedAt', 50)]:
            bounded(report.get(key), key, size)
        bounded(report.get('comment', ''), 'comment', 4000, False)
        if report.get('kind') not in dict(KINDS):
            raise ValidationError('Neplatný typ hlásenia.')
        manifest = report.get('files')
        if not isinstance(manifest, list) or not 2 <= len(manifest) <= 250:
            raise ValidationError('Chýba zoznam podkladov.')
        names = set()
        total = 0
        for item in manifest:
            if not isinstance(item, dict):
                raise ValidationError('Neplatný podklad.')
            name = bounded(item.get('name'), 'filename', 120)
            if not re.fullmatch(r'[A-Za-z0-9_.-]+', name) or name in names or name.startswith('.'):
                raise ValidationError('Neplatné meno súboru.')
            names.add(name)
            if not SHA.fullmatch(str(item.get('sha256', ''))) or type(item.get('size')) is not int or not 0 < item['size'] <= 200*1024*1024:
                raise ValidationError('Neplatná veľkosť alebo kontrolný súčet.')
            bounded(item.get('mimetype'), 'mimetype', 100)
            total += item['size']
        if total > 220*1024*1024 or not {'screenshot.png', 'diagnostics.json'} <= names:
            raise ValidationError('Podklady sú neúplné alebo príliš veľké.')
        key = digest([environment, report['tenantId'], report['userId'], report['submissionId']])
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', (int(key[:15], 16),))
        existing = self.sudo().search([('arcigy_key', '=', key)], limit=1)
        if existing:
            if existing.arcigy_fingerprint != digest(report):
                raise ValidationError('Rovnaké odoslanie má odlišný obsah.')
            return {'taskId': existing.id, 'ready': existing.arcigy_ready}
        project_id = int(self.env['ir.config_parameter'].sudo().get_param('arcigy_feedback.project_id', '1'))
        task = self.sudo().with_context(mail_create_nosubscribe=True, tracking_disable=True).create({
            'name': report['title'], 'project_id': project_id, 'arcigy_report': True,
            'description': Markup('<p>%s</p>') % escape(report['description']).replace('\n', Markup('<br/>')),
            'arcigy_key': key, 'arcigy_fingerprint': digest(report), 'arcigy_status': 'new',
            'arcigy_title': report['title'], 'arcigy_body': report['description'], 'arcigy_comment': report.get('comment', ''),
            'arcigy_environment': environment, 'arcigy_kind': report['kind'],
            'arcigy_tenant_id': report['tenantId'], 'arcigy_company': report['company'],
            'arcigy_user_id': report['userId'], 'arcigy_author': report['author'],
            'arcigy_source_commit': report.get('sourceCommit', ''), 'arcigy_captured_at': report['capturedAt'],
            'arcigy_metadata': report, 'arcigy_manifest': manifest,
        })
        return {'taskId': task.id, 'ready': False}

    @api.model
    def arcigy_upload_part(self, task_id, filename, number, data):
        self._arcigy_role('ingest')
        task = self._arcigy_task(task_id)
        if task.arcigy_environment != self.env.user.sudo().arcigy_feedback_environment:
            raise AccessError('Nesprávne prostredie.')
        task._arcigy_lock()
        item = next((x for x in task.arcigy_manifest or [] if x['name'] == filename), None)
        if not item or type(number) is not int or number < 0 or number >= (item['size']+4*1024*1024-1)//(4*1024*1024):
            raise ValidationError('Neplatná časť podkladu.')
        if not isinstance(data, str) or len(data) > 5592408:
            raise ValidationError('Časť je príliš veľká.')
        try:
            raw = base64.b64decode(data, validate=True)
        except ValueError:
            raise ValidationError('Neplatné kódovanie.')
        expected_size = min(4*1024*1024, item['size'] - number*4*1024*1024)
        if len(raw) != expected_size:
            raise ValidationError('Nesprávna veľkosť časti.')
        checksum = hashlib.sha256(raw).hexdigest()
        parts = self.env['arcigy.feedback.part'].sudo()
        old = parts.search([('task_id', '=', task.id), ('filename', '=', filename), ('number', '=', number)], limit=1)
        if old and old.checksum != checksum:
            raise ValidationError('Časť má odlišný obsah.')
        if not old:
            if task.arcigy_ready:
                raise ValidationError('Dokončené podklady nemožno zmeniť.')
            parts.create({'task_id': task.id, 'filename': filename, 'number': number, 'content': data, 'checksum': checksum})
        return {'ok': True}

    @api.model
    def arcigy_complete_report(self, task_id):
        self._arcigy_role('ingest')
        task = self._arcigy_task(task_id)
        if task.arcigy_environment != self.env.user.sudo().arcigy_feedback_environment:
            raise AccessError('Nesprávne prostredie.')
        task._arcigy_lock()
        if not task.arcigy_ready:
            for item in task.arcigy_manifest:
                parts = self.env['arcigy.feedback.part'].sudo().search([('task_id', '=', task.id), ('filename', '=', item['name'])], order='number')
                raw = b''.join(base64.b64decode(p.content) for p in parts)
                if len(raw) != item['size'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
                    raise ValidationError('Podklady ešte nie sú úplné: ' + item['name'])
                attachment = self.env['ir.attachment'].sudo().create({'name': item['name'], 'raw': raw,
                    'mimetype': item['mimetype'], 'res_model': 'project.task', 'res_id': task.id})
                if item['name'] == 'screenshot.png':
                    task.arcigy_screenshot = attachment
            task.arcigy_ready = True
            task._arcigy_event('received:' + task.arcigy_key, 'received', {'complete': True})
            task._arcigy_notify()
        return {'taskId': task.id, 'ready': True}

    def _arcigy_event(self, key, kind, payload):
        self.ensure_one()
        self._arcigy_lock()
        events = self.env['arcigy.feedback.event'].sudo()
        old = events.search([('event_key', '=', key)], limit=1)
        if old:
            if old.task_id != self or old.kind != kind or old.payload != payload:
                raise ValidationError('Udalosť má odlišný obsah.')
            return old
        self.arcigy_revision += 1
        event = events.create({'task_id': self.id, 'event_key': key, 'kind': kind, 'payload': payload, 'actor_id': self.env.uid})
        if kind == 'received':
            self.env['arcigy.feedback.webhook.outbox']._capture(event)
        return event

    @api.model
    def arcigy_list_reports(self, after_id=0, limit=50):
        self._arcigy_role('agent', 'manager')
        if type(after_id) is not int or type(limit) is not int or not 1 <= limit <= 100:
            raise ValidationError('Neplatná stránka.')
        events = self.env['arcigy.feedback.event'].sudo().search([('id', '>', after_id)], order='id', limit=limit)
        ids = events.mapped('task_id').ids
        return {'reports': [self._arcigy_task(i)._arcigy_summary() for i in ids],
                'cursor': max(events.ids or [after_id]), 'hasMore': len(events) == limit}

    def _arcigy_summary(self):
        self.ensure_one()
        return {'id': self.id, 'title': self.arcigy_title or self.name, 'status': self.arcigy_status,
                'environment': self.arcigy_environment, 'company': self.arcigy_company or self.arcigy_tenant_id,
                'author': self.arcigy_author or self.arcigy_user_id, 'createdAt': str(self.create_date),
                'url': '/odoo/project.task/' + str(self.id), 'worker': self.arcigy_worker or None}

    @api.model
    def arcigy_read_report(self, task_id):
        self._arcigy_role('agent', 'manager')
        task = self._arcigy_task(task_id)
        attachments = self.env['ir.attachment'].sudo().search([('res_model', '=', 'project.task'), ('res_id', '=', task.id)])
        return {**task._arcigy_summary(), 'description': task.arcigy_body, 'comment': task.arcigy_comment,
                'sourceId': self.env['arcigy.feedback.webhook.outbox']._configuration().get('source_id'),
                'tenantId': task.arcigy_tenant_id, 'projectId': str(task.project_id.id),
                'ready': task.arcigy_ready, 'revision': task.arcigy_revision, 'claim': task.arcigy_claim or None,
                'metadata': task.arcigy_metadata or {}, 'legacy': task.arcigy_legacy or {},
                'files': [{'id': a.id, 'name': a.name, 'size': a.file_size, 'sha256': hashlib.sha256(a.raw).hexdigest()} for a in attachments],
                'events': [{'id': e.id, 'kind': e.kind, 'at': str(e.create_date), 'payload': e.payload} for e in task.arcigy_events]}

    @api.model
    def arcigy_read_attachment(self, task_id, attachment_id, offset=0):
        self._arcigy_role('agent', 'manager')
        task = self._arcigy_task(task_id)
        if type(attachment_id) is not int or type(offset) is not int or offset < 0:
            raise ValidationError('Neplatná príloha.')
        attachment = self.env['ir.attachment'].sudo().browse(attachment_id).exists()
        if not attachment or attachment.res_model != 'project.task' or attachment.res_id != task.id:
            raise AccessError('Príloha nepatrí k hláseniu.')
        raw = attachment.raw
        return {'data': base64.b64encode(raw[offset:offset+4*1024*1024]).decode(), 'size': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest()}

    @api.model
    def arcigy_work_report(self, task_id, operation_id, action, details):
        self._arcigy_role('agent', 'manager')
        task = self._arcigy_task(task_id)
        task._arcigy_lock()
        bounded(operation_id, 'operation_id', 120)
        if not isinstance(details, dict) or len(json.dumps(details)) > 64000:
            raise ValidationError('Neplatné podklady práce.')
        key = 'work:' + str(task.id) + ':' + operation_id
        events = self.env['arcigy.feedback.event'].sudo()
        old = events.search([('event_key', '=', key)], limit=1)
        if old:
            task._arcigy_event(key, action, details)
            return {**task._arcigy_summary(), 'claim': task.arcigy_claim or None, 'revision': task.arcigy_revision}
        if action == 'start':
            bounded(details.get('worker'), 'worker', 250)
            expected = details.get('expected_revision')
            if expected is not None and (type(expected) is not int or expected != task.arcigy_revision):
                raise ValidationError('Hlásenie sa zmenilo; prečítajte ho znova.')
            if not task.arcigy_ready:
                raise ValidationError('Podklady hlásenia ešte nie sú úplné.')
            if task.arcigy_status == 'working' and task.arcigy_claim != operation_id:
                raise ValidationError('Na hlásení už pracuje ' + (task.arcigy_worker or 'iný pracovník'))
            if task.arcigy_status not in ('review', 'new', 'working'):
                raise ValidationError('Pred ďalšou opravou znovu otvorte hlásenie.')
            task.write({'arcigy_status': 'working', 'arcigy_worker': details['worker'], 'arcigy_claim': operation_id})
        elif action == 'complete':
            if task.arcigy_status != 'working' or details.get('claim') != task.arcigy_claim:
                raise ValidationError('Nesprávny vlastník rozpracovanej opravy.')
            bounded(details.get('summary'), 'summary', 8000)
            bounded(details.get('tests'), 'tests', 16000)
            task.arcigy_status = 'implemented'
        elif action == 'reopen':
            bounded(details.get('reason'), 'reason', 8000)
            task.write({'arcigy_status': 'review', 'arcigy_claim': False, 'arcigy_worker': False})
        else:
            raise ValidationError('Neplatná operácia.')
        task._arcigy_event(key, action, details)
        return {**task._arcigy_summary(), 'claim': task.arcigy_claim or None, 'revision': task.arcigy_revision}

    @api.model
    def arcigy_record_fix(self, fix):
        self._arcigy_role('release')
        if not isinstance(fix, dict) or not COMMIT.fullmatch(str(fix.get('commit', ''))):
            raise ValidationError('Neplatný commit opravy.')
        url = fix.get('pullRequest')
        if url and not re.fullmatch(r'https://github.com/arcigy/kitchen_app/pull/[0-9]+', url):
            raise ValidationError('Nesprávny repozitár.')
        task = self._arcigy_task(fix.get('reportId'))
        task._arcigy_lock()
        self.env.cr.execute("SELECT payload FROM arcigy_feedback_event WHERE task_id=%s AND kind='github' AND payload->>'commit'=%s ORDER BY id LIMIT 1", (task.id, fix['commit']))
        first = self.env.cr.fetchone()
        claim = first[0].get('claim', False) if first else (task.arcigy_claim or False)
        task._arcigy_event('fix:' + str(task.id) + ':' + digest(fix), 'github', {**fix, 'claim': claim})
        return {'linked': True}

    @api.model
    def arcigy_record_release(self, receipt):
        self._arcigy_role('release')
        if not isinstance(receipt, dict) or receipt.get('environment') not in ('develop', 'main'):
            raise ValidationError('Neplatné prostredie nasadenia.')
        environment = receipt['environment']
        if environment != self.env.user.sudo().arcigy_feedback_environment:
            raise AccessError('Nesprávne prostredie nasadenia.')
        if not COMMIT.fullmatch(str(receipt.get('revision', ''))) or receipt.get('health') is not True or receipt.get('postgresReady') is not True:
            raise ValidationError('Chýba overená revízia alebo dostupnosť.')
        sequence = receipt.get('sequence')
        if type(sequence) is not int or sequence <= 0:
            raise ValidationError('Neplatné poradie nasadenia.')
        fixes = receipt.get('fixes')
        if not isinstance(fixes, list) or len(fixes) > 10000:
            raise ValidationError('Chýba úplný zoznam nasadených opráv.')
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', (73197001 if environment == 'main' else 73197002,))
        params = self.env['ir.config_parameter'].sudo()
        parameter = 'arcigy_feedback.release.' + environment
        previous = json.loads(params.get_param(parameter, '{}'))
        if previous.get('sequence', 0) >= sequence:
            if previous.get('sequence') == sequence and previous != receipt:
                raise ValidationError('Nasadenie má odlišný obsah.')
            return {'applied': False}
        unchanged = all(previous.get(key) == receipt.get(key) for key in ('environment', 'revision', 'health', 'postgresReady', 'fixes'))
        by_id = {}
        for fix in fixes:
            if not isinstance(fix, dict) or type(fix.get('reportId')) is not int or not COMMIT.fullmatch(str(fix.get('commit', ''))):
                raise ValidationError('Neplatná väzba opravy.')
            by_id[fix['reportId']] = fix
        previous_ids = {x['reportId'] for x in previous.get('fixes', [])}
        other_environment = 'develop' if environment == 'main' else 'main'
        other = json.loads(params.get_param('arcigy_feedback.release.' + other_environment, '{}'))
        other_by_id = {x['reportId']: x for x in other.get('fixes', [])}

        def contains_current_repair(task, fix):
            if not fix or not task.arcigy_claim:
                return False
            self.env.cr.execute("SELECT 1 FROM arcigy_feedback_event WHERE task_id=%s AND kind='github' AND payload->>'commit'=%s AND payload->>'claim'=%s LIMIT 1",
                (task.id, fix['commit'], task.arcigy_claim))
            return bool(self.env.cr.fetchone())

        for report_id in sorted(previous_ids | set(by_id)):
            task = self._arcigy_task(report_id)
            task._arcigy_lock()
            included = report_id in by_id
            if not unchanged:
                task._arcigy_event('release:' + environment + ':' + str(sequence) + ':' + str(report_id), 'deployment',
                    {'environment': environment, 'revision': receipt['revision'], 'included': included, 'fix': by_id.get(report_id)})
            if task.arcigy_status not in ('new', 'review', 'working'):
                available = {environment: contains_current_repair(task, by_id.get(report_id)),
                             other_environment: contains_current_repair(task, other_by_id.get(report_id))}
                task.arcigy_status = 'main' if available['main'] else ('develop' if available['develop'] else 'implemented')
        params.set_param(parameter, json.dumps(receipt))
        return {'applied': not unchanged}

    @api.model
    def _arcigy_migrate_legacy(self, task_ids=None):
        from odoo.tools import html2plaintext
        params = self.env['ir.config_parameter'].sudo()
        project_id = int(params.get_param('arcigy_feedback.project_id', '1'))
        baseline = params.get_param('arcigy_feedback.legacy_baseline')
        if baseline is False:
            latest = self.sudo().with_context(active_test=False).search([('project_id', '=', project_id)], order='id desc', limit=1)
            baseline = str(latest.id or 0)
            params.set_param('arcigy_feedback.legacy_baseline', baseline)
        domain = [('project_id', '=', project_id), ('arcigy_report', '=', False)]
        if task_ids is not None:
            domain.append(('id', 'in', task_ids))
        tasks = self.sudo().with_context(active_test=False).search(domain)
        for task in tasks:
            task._arcigy_lock()
            if task.arcigy_report:
                continue
            plain = html2plaintext(task.description or '')
            attachments = self.env['ir.attachment'].sudo().search([('res_model', '=', 'project.task'), ('res_id', '=', task.id)])
            historical = task.id <= int(baseline)
            if not historical and not {'screenshot.png', 'project-snapshot.json', 'diagnostics.json'} <= set(attachments.mapped('name')):
                continue
            diagnostics = next((a for a in attachments if a.name == 'diagnostics.json'), None)
            metadata = {}
            if diagnostics:
                try:
                    metadata = json.loads(diagnostics.raw)
                except (ValueError, TypeError):
                    pass
            reporter = metadata.get('reporter', {}) if isinstance(metadata, dict) else {}
            kind_match = re.search(r'^type=(\w+)\s*$', plain, re.M)
            body = re.sub(r'^Arcigy feedback report\s*\nsubmission=[^\n]*\ntype=[^\n]*\n*', '', plain)
            body, separator, comment = body.partition('\nComment:\n')
            screenshot = next((a for a in attachments if a.mimetype == 'image/png'), None)
            values = {'arcigy_report': True, 'arcigy_ready': True, 'arcigy_status': 'review' if historical else 'new', 'arcigy_environment': 'unknown',
                'arcigy_title': re.sub(r'^\[Arcigy [^]]+\]\s*', '', task.name), 'arcigy_body': body,
                'arcigy_comment': comment if separator else '', 'arcigy_tenant_id': reporter.get('clientId'),
                'arcigy_user_id': reporter.get('userId'), 'arcigy_metadata': metadata,
                'arcigy_legacy': {'name': task.name, 'description': str(task.description or ''), 'state': task.state,
                                  'stageId': task.stage_id.id, 'active': task.active, 'contextComplete': False},
                'arcigy_screenshot': screenshot.id if screenshot else False}
            if kind_match and kind_match[1] in dict(KINDS):
                values['arcigy_kind'] = kind_match[1]
            task.with_context(tracking_disable=True).write(values)
            task._arcigy_event('legacy:' + str(task.id), 'migration', {'preserved': True, 'contextComplete': False})
            if not historical:
                known = self.sudo().search([('arcigy_report', '=', True), ('arcigy_tenant_id', '=', task.arcigy_tenant_id),
                    ('arcigy_user_id', '=', task.arcigy_user_id), ('arcigy_company', '!=', False), ('arcigy_author', '!=', False)], limit=1)
                if known:
                    task.write({'arcigy_company': known.arcigy_company, 'arcigy_author': known.arcigy_author})
                task._arcigy_notify()
        return len(tasks)


class FeedbackLegacyAttachment(models.Model):
    _inherit = 'ir.attachment'

    @api.model_create_multi
    def create(self, vals_list):
        attachments = super().create(vals_list)
        task_ids = attachments.filtered(lambda a: a.res_model == 'project.task' and a.res_id).mapped('res_id')
        if task_ids and self.env['ir.config_parameter'].sudo().get_param('arcigy_feedback.legacy_baseline') is not False:
            self.env['project.task']._arcigy_migrate_legacy(task_ids)
        return attachments
