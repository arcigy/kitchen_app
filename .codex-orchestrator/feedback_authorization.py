"""Explicit standing authorization, distinct from human approval of a plan."""
import datetime as dt
import hashlib
import json
from pathlib import PurePosixPath
import re

OPERATIONS = {'edit', 'test', 'commit'}


def policy_digest(policy):
    return hashlib.sha256(json.dumps(policy, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_policy(policy):
    fields = {'id','version','source_id','tenant_id','project_id','allowed_paths','operations','max_files','expires_at'}
    if not isinstance(policy, dict) or set(policy) != fields or policy['version'] != 1:
        raise ValueError('Invalid feedback authorization policy')
    for name in ('id','source_id','tenant_id','project_id'):
        if not isinstance(policy[name], str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,119}',policy[name]):
            raise ValueError('Invalid policy identity')
    if type(policy['max_files']) is not int or not 1 <= policy['max_files'] <= 100:
        raise ValueError('Invalid policy file limit')
    if not isinstance(policy['operations'], list) or not policy['operations'] or not all(isinstance(v,str) for v in policy['operations']) or not set(policy['operations']) <= OPERATIONS:
        raise ValueError('Policy permits an unsupported operation')
    if not isinstance(policy['allowed_paths'], list) or not policy['allowed_paths']:
        raise ValueError('Policy must identify allowed code paths')
    for path in policy['allowed_paths']:
        safe_path(path)
    if not isinstance(policy['expires_at'],str):
        raise ValueError('Invalid policy expiration')
    expiry = dt.datetime.fromisoformat(policy['expires_at'])
    if expiry.tzinfo is None:
        raise ValueError('Policy expiration needs timezone')
    return policy


def safe_path(path):
    if not isinstance(path, str) or not path or '\\' in path or '*' in path:
        raise ValueError('Use explicit repository paths')
    parts = PurePosixPath(path).parts
    if path.startswith('/') or '..' in parts or '.' in parts or not parts or str(PurePosixPath(path)) != path.rstrip('/'):
        raise ValueError('Unsafe repository path')
    if any(p.startswith('.env') or p in {'storage','exports','outputs','.git','dist','node_modules'} for p in parts):
        raise ValueError('Private/runtime paths cannot receive delegated approval')
    if parts[0] in {'.codex-orchestrator','.codex','.github','plugins','odoo-addons','tools'}:
        raise ValueError('Automation/security infrastructure requires explicit human plan approval')
    return path.rstrip('/')


def evaluate(policy, external, scope, clock=None):
    validate_policy(policy)
    clock = clock or dt.datetime.now(dt.timezone.utc)
    if clock >= dt.datetime.fromisoformat(policy['expires_at']):
        raise ValueError('Authorization policy expired')
    if not external or any(external.get(k) != policy[k] for k in ('source_id','tenant_id','project_id')):
        raise ValueError('Task source is outside authorization policy')
    if not isinstance(scope, dict) or set(scope) != {'paths','operations'}:
        raise ValueError('A concrete structured plan scope is required')
    paths, operations = scope['paths'], scope['operations']
    if not isinstance(paths,list) or not paths or not all(isinstance(v,str) for v in paths) or len(paths) > policy['max_files'] or len(set(paths)) != len(paths):
        raise ValueError('Plan exceeds policy file limit')
    if not isinstance(operations,list) or not operations or not all(isinstance(v,str) for v in operations) or not set(operations) <= set(policy['operations']):
        raise ValueError('Plan operation is outside policy')
    for path in paths:
        safe_path(path)
        if not any(path == prefix.rstrip('/') or path.startswith(prefix.rstrip('/')+'/') for prefix in policy['allowed_paths']):
            raise ValueError('Plan path is outside policy')
    return {'policy_sha256': policy_digest(policy), 'scope': scope}
