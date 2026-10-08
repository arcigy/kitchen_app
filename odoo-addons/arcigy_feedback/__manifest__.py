{
    'name': 'Arcigy podpora',
    'version': '19.0.1.1.0',
    'license': 'LGPL-3',
    'depends': ['project', 'mail', 'web'],
    'data': ['security/security.xml', 'security/ir.model.access.csv', 'views/feedback.xml', 'data/webhook.xml', 'data/cron.xml'],
    'assets': {'web.assets_backend': ['arcigy_feedback/static/src/feedback.js', 'arcigy_feedback/static/src/feedback.scss']},
    'application': True,
    'post_init_hook': 'post_init_hook',
}
