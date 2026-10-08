from . import models
from . import controllers


def post_init_hook(env):
    import os
    baseline = os.environ.get('ARCIGY_FEEDBACK_LEGACY_BASELINE')
    if baseline is not None:
        env['ir.config_parameter'].sudo().set_param('arcigy_feedback.legacy_baseline', str(int(baseline)))
    # Additive migration: never rewrite the source task, description, state or attachments.
    env['project.task']._arcigy_migrate_legacy()
    env.ref('base.user_admin').write({'group_ids': [(4, env.ref('arcigy_feedback.group_manager').id)]})
