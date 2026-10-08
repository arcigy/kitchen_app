"""The notification wire format contains identifiers, never report contents."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import time

MAX_BODY = 16384
IDENTITY = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$')
FIELDS = {'schema_version', 'source_id', 'tenant_id', 'project_id', 'event_id',
          'report_id', 'revision', 'event_type', 'origin', 'occurred_at', 'cutover_epoch'}


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


def parse_event(raw):
    if not raw or len(raw) > MAX_BODY:
        raise ValueError('Invalid notification size')
    value = json.loads(raw, object_pairs_hook=no_duplicate_keys)
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError('Invalid notification fields')
    if type(value['schema_version']) is not int or value['schema_version'] != 1:
        raise ValueError('Unsupported notification version')
    for key in ('source_id', 'tenant_id', 'project_id', 'cutover_epoch'):
        if not isinstance(value[key], str) or not IDENTITY.fullmatch(value[key]):
            raise ValueError('Invalid notification identity')
    for key in ('event_id', 'report_id', 'revision'):
        if type(value[key]) is not int or not 1 <= value[key] <= 2**53-1:
            raise ValueError('Invalid notification identifier')
    if value['event_type'] != 'received' or value['origin'] != 'live':
        raise ValueError('Only live received notifications are eligible')
    from datetime import datetime
    if not isinstance(value['occurred_at'],str) or len(value['occurred_at']) > 80:
        raise ValueError('Invalid occurrence timestamp')
    at = datetime.fromisoformat(value['occurred_at'].replace('Z', '+00:00'))
    if at.tzinfo is None:
        raise ValueError('Occurrence time must include timezone')
    return value


def signature(key, timestamp, raw):
    return hmac.new(key, str(timestamp).encode('ascii') + b'.' + raw, hashlib.sha256).hexdigest()


def verify(raw, headers, keys, allowed, clock=time.time):
    try:
        timestamp = int(headers['X-Arcigy-Timestamp'])
        key = keys[headers['X-Arcigy-Key-Id']]
        supplied = headers['X-Arcigy-Signature']
    except (KeyError, ValueError, TypeError):
        raise ValueError('Missing signature headers') from None
    if abs(clock() - timestamp) > 300 or not isinstance(supplied, str):
        raise ValueError('Signature timestamp outside replay window')
    if not hmac.compare_digest(signature(key, timestamp, raw), supplied):
        raise ValueError('Invalid notification signature')
    event = parse_event(raw)
    if (event['source_id'], event['tenant_id'], event['project_id'], event['cutover_epoch']) not in allowed:
        raise ValueError('Notification source is not enabled')
    return event


def private_json(path):
    path = Path(path)
    stat = path.lstat()
    if path.is_symlink() or stat.st_mode & 0o077 or stat.st_uid != os.getuid():
        raise ValueError('Private configuration requires owned regular mode-0600 file')
    import stat as mode
    if not mode.S_ISREG(stat.st_mode):
        raise ValueError('Private configuration must be a regular file')
    return json.loads(path.read_bytes(), object_pairs_hook=no_duplicate_keys)


def signing_keys(path):
    value = private_json(path)
    if not isinstance(value, dict) or not value:
        raise ValueError('Signing key ring is empty')
    keys = {}
    for key_id, encoded in value.items():
        if not IDENTITY.fullmatch(key_id) or not isinstance(encoded, str) or not re.fullmatch(r'[0-9a-f]{64,128}', encoded):
            raise ValueError('Invalid signing key ring')
        keys[key_id] = bytes.fromhex(encoded)
    return keys
