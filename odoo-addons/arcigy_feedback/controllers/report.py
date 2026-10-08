from odoo import http
from odoo.http import request


class FeedbackLink(http.Controller):
    @http.route('/odoo/arcigy.feedback/<int:task_id>', type='http', auth='user', readonly=True)
    def report(self, task_id, **kwargs):
        # Native Odoo push opens /odoo/<model>/<id>. Route it to our dedicated
        # action, preserving the destination through Odoo's login redirect.
        tasks = request.env['project.task']
        tasks._arcigy_role('manager')
        task = tasks.browse(task_id).exists()
        if not task or not task.arcigy_report or not task.arcigy_ready:
            return request.not_found()
        task.check_access('read')
        action = request.env.ref('arcigy_feedback.action')
        return request.redirect('/odoo/action-%s/%s' % (action.id, task.id))
