"""Run with odoo shell only in the disposable ARC-003 integration database."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from odoo import api
from odoo.exceptions import ValidationError
from psycopg2.errors import SerializationFailure


def verify(env):
    if env.cr.dbname != 'arc003_fixture':
        raise RuntimeError('This fixture must never run against customer data')
    registry = env.registry
    user_id = env.ref('base.user_admin').id
    with registry.cursor() as cr:
        fixture = api.Environment(cr, user_id, {})
        project = fixture['project.project'].create({'name': 'ARC-003 isolated claim race'})
        task = fixture['project.task'].create({'name': 'Synthetic claim race', 'project_id': project.id,
                  'arcigy_report': True, 'arcigy_ready': True, 'arcigy_status': 'new'})
        task_id = task.id
        cr.commit()

    barrier = Barrier(2, timeout=10)

    def claim(owner):
        try:
            with registry.cursor() as cr:
                cr.execute("SET LOCAL lock_timeout = '5s'")
                fixture = api.Environment(cr, user_id, {})
                barrier.wait()
                result = fixture['project.task'].arcigy_work_report(task_id, owner, 'start',
                                            {'worker': owner, 'expected_revision': 0})
                cr.commit()
                return result['claim']
        except (ValidationError, SerializationFailure):
            return None

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(claim, ['race-a', 'race-b'], timeout=15))
        assert len([owner for owner in claims if owner]) == 1, claims
        with registry.cursor() as cr:
            fixture = api.Environment(cr, user_id, {})
            task = fixture['project.task'].browse(task_id)
            assert task.arcigy_claim in {'race-a', 'race-b'}
            assert task.arcigy_revision == 1
        print('ARC-003 independent transaction claim race: PASS')
    finally:
        with registry.cursor() as cr:
            fixture = api.Environment(cr, user_id, {})
            task = fixture['project.task'].browse(task_id)
            fixture['arcigy.feedback.event'].sudo().search([('task_id', '=', task_id)]).unlink()
            project = task.project_id
            task.unlink()
            project.unlink()
            cr.commit()


verify(env)
