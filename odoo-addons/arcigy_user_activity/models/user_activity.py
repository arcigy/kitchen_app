from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError


MAX_BATCH_ITEMS = 500
MAX_ACTIVE_SECONDS = 172800
COMMON_KEYS = {
    "kind",
    "environment",
    "external_key",
    "client_external_id",
    "user_external_id",
    "source_updated_at",
}
KIND_KEYS = {
    "presence": COMMON_KEYS | {"state", "last_seen_at"},
    "daily": COMMON_KEYS
    | {
        "activity_date",
        "time_zone",
        "first_active_at",
        "last_active_at",
        "active_seconds",
        "session_count",
    },
    "interval": COMMON_KEYS
    | {
        "interval_id",
        "activity_date",
        "time_zone",
        "started_at",
        "ended_at",
        "active_seconds",
    },
}


def _bounded_text(value, field_name, maximum=300):
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise ValidationError(f"Invalid {field_name}.")
    if any(ord(character) < 32 for character in value):
        raise ValidationError(f"Invalid {field_name}.")
    return value


def _bounded_integer(value, field_name, maximum):
    if type(value) is not int or value < 0 or value > maximum:
        raise ValidationError(f"Invalid {field_name}.")
    return value


def _utc_datetime(value, field_name, nullable=False):
    if value is None and nullable:
        return False
    if not isinstance(value, str) or len(value) > 40:
        raise ValidationError(f"Invalid {field_name}.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError(f"Invalid {field_name}.") from error
    if parsed.tzinfo is None:
        raise ValidationError(f"Invalid {field_name}.")
    return fields.Datetime.to_string(parsed.astimezone(timezone.utc).replace(tzinfo=None))


def _utc_token(value, field_name):
    if not isinstance(value, str) or len(value) > 40:
        raise ValidationError(f"Invalid {field_name}.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError(f"Invalid {field_name}.") from error
    if parsed.tzinfo is None:
        raise ValidationError(f"Invalid {field_name}.")
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _activity_date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValidationError("Invalid activity_date.")
    try:
        return fields.Date.to_string(date.fromisoformat(value))
    except ValueError as error:
        raise ValidationError("Invalid activity_date.") from error


def _time_zone(value):
    zone = _bounded_text(value, "time_zone", 80)
    try:
        ZoneInfo(zone)
    except ZoneInfoNotFoundError as error:
        raise ValidationError("Invalid time_zone.") from error
    return zone


class ArcigyUserActivityPresence(models.Model):
    _name = "arcigy.user.activity.presence"
    _description = "Arcigy User Activity Presence"
    _rec_name = "user_external_id"
    _order = "last_seen_at desc"

    external_key = fields.Char(required=True, index=True, readonly=True)
    environment = fields.Selection(
        [("develop", "Develop"), ("main", "Main")], required=True, index=True, readonly=True
    )
    client_external_id = fields.Char(required=True, index=True, readonly=True)
    user_external_id = fields.Char(required=True, index=True, readonly=True)
    state = fields.Selection(
        [("active", "Active"), ("idle", "Idle"), ("offline", "Offline")],
        required=True,
        index=True,
        readonly=True,
    )
    last_seen_at = fields.Datetime(required=True, index=True, readonly=True)
    source_updated_at = fields.Datetime(required=True, index=True, readonly=True)
    source_updated_token = fields.Char(required=True, index=True, readonly=True)

    _sql_constraints = [
        ("external_key_unique", "unique(external_key)", "Activity presence external key must be unique."),
    ]

    @api.model
    def ingest_activity_batch(self, payload):
        if not self.env.user.has_group("arcigy_user_activity.group_user_activity_integration"):
            raise AccessError("Arcigy activity ingest requires the integration role.")
        if not isinstance(payload, dict) or set(payload) != {"environment", "source_updated_at", "items"}:
            raise ValidationError("Invalid activity batch.")
        environment = payload.get("environment")
        if environment not in {"develop", "main"}:
            raise ValidationError("Invalid activity environment.")
        _utc_datetime(payload.get("source_updated_at"), "source_updated_at")
        items = payload.get("items")
        if not isinstance(items, list) or not 1 <= len(items) <= MAX_BATCH_ITEMS:
            raise ValidationError("Activity batch must contain 1 to 500 items.")
        external_keys = []
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("external_key"), str):
                raise ValidationError("Activity batch items must be objects with external keys.")
            external_keys.append(item["external_key"])
        if len(set(external_keys)) != len(items):
            raise ValidationError("Activity batch external keys must be unique.")

        accepted = 0
        ignored = 0
        for item in items:
            outcome = self._ingest_activity_item(item, environment)
            if outcome:
                accepted += 1
            else:
                ignored += 1
        return {"ok": True, "accepted": accepted, "ignored": ignored}

    @api.model
    def _ingest_activity_item(self, item, batch_environment):
        if not isinstance(item, dict) or item.get("kind") not in KIND_KEYS:
            raise ValidationError("Invalid activity item kind.")
        kind = item["kind"]
        if set(item) != KIND_KEYS[kind]:
            raise ValidationError("Invalid activity item fields.")
        if item["environment"] != batch_environment:
            raise ValidationError("Activity item environment does not match its batch.")
        external_key = _bounded_text(item["external_key"], "external_key")
        if not external_key.startswith(f"{batch_environment}:{kind}:"):
            raise ValidationError("Activity external key does not match its kind.")
        common = {
            "external_key": external_key,
            "environment": batch_environment,
            "client_external_id": _bounded_text(item["client_external_id"], "client_external_id", 200),
            "user_external_id": _bounded_text(item["user_external_id"], "user_external_id", 200),
            "source_updated_at": _utc_datetime(item["source_updated_at"], "source_updated_at"),
            "source_updated_token": _utc_token(item["source_updated_at"], "source_updated_at"),
        }
        if kind == "presence":
            if item["state"] not in {"active", "idle", "offline"}:
                raise ValidationError("Invalid presence state.")
            model = self.sudo()
            values = {
                **common,
                "state": item["state"],
                "last_seen_at": _utc_datetime(item["last_seen_at"], "last_seen_at"),
            }
        elif kind == "daily":
            model = self.env["arcigy.user.activity.daily"].sudo()
            values = {
                **common,
                "activity_date": _activity_date(item["activity_date"]),
                "time_zone": _time_zone(item["time_zone"]),
                "first_active_at": _utc_datetime(item["first_active_at"], "first_active_at", nullable=True),
                "last_active_at": _utc_datetime(item["last_active_at"], "last_active_at", nullable=True),
                "active_seconds": _bounded_integer(item["active_seconds"], "active_seconds", MAX_ACTIVE_SECONDS),
                "session_count": _bounded_integer(item["session_count"], "session_count", 10000),
            }
        else:
            model = self.env["arcigy.user.activity.interval"].sudo()
            values = {
                **common,
                "interval_id": _bounded_text(item["interval_id"], "interval_id", 100),
                "activity_date": _activity_date(item["activity_date"]),
                "time_zone": _time_zone(item["time_zone"]),
                "started_at": _utc_datetime(item["started_at"], "started_at"),
                "ended_at": _utc_datetime(item["ended_at"], "ended_at"),
                "active_seconds": _bounded_integer(item["active_seconds"], "active_seconds", MAX_ACTIVE_SECONDS),
            }
            if values["ended_at"] < values["started_at"]:
                raise ValidationError("Activity interval ends before it starts.")

        existing = model.search([("external_key", "=", external_key)], limit=1)
        if existing and existing.source_updated_token >= values["source_updated_token"]:
            return False
        if existing:
            existing.write(values)
        else:
            model.create(values)
        return True


class ArcigyUserActivityDaily(models.Model):
    _name = "arcigy.user.activity.daily"
    _description = "Arcigy User Activity Daily Summary"
    _rec_name = "user_external_id"
    _order = "activity_date desc, user_external_id"

    external_key = fields.Char(required=True, index=True, readonly=True)
    environment = fields.Selection(
        [("develop", "Develop"), ("main", "Main")], required=True, index=True, readonly=True
    )
    client_external_id = fields.Char(required=True, index=True, readonly=True)
    user_external_id = fields.Char(required=True, index=True, readonly=True)
    activity_date = fields.Date(required=True, index=True, readonly=True)
    time_zone = fields.Char(required=True, readonly=True)
    first_active_at = fields.Datetime(readonly=True)
    last_active_at = fields.Datetime(readonly=True)
    active_seconds = fields.Integer(required=True, readonly=True)
    active_hours = fields.Float(compute="_compute_active_hours", store=True, readonly=True)
    session_count = fields.Integer(required=True, readonly=True)
    source_updated_at = fields.Datetime(required=True, index=True, readonly=True)
    source_updated_token = fields.Char(required=True, index=True, readonly=True)

    _sql_constraints = [
        ("external_key_unique", "unique(external_key)", "Daily activity external key must be unique."),
        ("user_date_unique", "unique(environment, client_external_id, user_external_id, activity_date)", "Daily user activity must be unique per environment."),
        ("seconds_nonnegative", "check(active_seconds >= 0)", "Active seconds cannot be negative."),
    ]

    @api.depends("active_seconds")
    def _compute_active_hours(self):
        for record in self:
            record.active_hours = record.active_seconds / 3600.0


class ArcigyUserActivityInterval(models.Model):
    _name = "arcigy.user.activity.interval"
    _description = "Arcigy User Activity Interval"
    _rec_name = "user_external_id"
    _order = "started_at desc"

    external_key = fields.Char(required=True, index=True, readonly=True)
    environment = fields.Selection(
        [("develop", "Develop"), ("main", "Main")], required=True, index=True, readonly=True
    )
    interval_id = fields.Char(required=True, index=True, readonly=True)
    client_external_id = fields.Char(required=True, index=True, readonly=True)
    user_external_id = fields.Char(required=True, index=True, readonly=True)
    activity_date = fields.Date(required=True, index=True, readonly=True)
    time_zone = fields.Char(required=True, readonly=True)
    started_at = fields.Datetime(required=True, index=True, readonly=True)
    ended_at = fields.Datetime(required=True, readonly=True)
    active_seconds = fields.Integer(required=True, readonly=True)
    active_hours = fields.Float(compute="_compute_active_hours", store=True, readonly=True)
    source_updated_at = fields.Datetime(required=True, index=True, readonly=True)
    source_updated_token = fields.Char(required=True, index=True, readonly=True)

    _sql_constraints = [
        ("external_key_unique", "unique(external_key)", "Activity interval external key must be unique."),
        ("interval_id_unique", "unique(environment, interval_id)", "Activity interval id must be unique per environment."),
        ("seconds_nonnegative", "check(active_seconds >= 0)", "Active seconds cannot be negative."),
        ("time_order", "check(ended_at >= started_at)", "Activity interval ends before it starts."),
    ]

    @api.depends("active_seconds")
    def _compute_active_hours(self):
        for record in self:
            record.active_hours = record.active_seconds / 3600.0
