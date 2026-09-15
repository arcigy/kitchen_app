# Arcigy User Activity for Odoo 19

This addon stores the current Arcigy app presence, closed activity intervals,
and per-user daily totals. It intentionally does not receive keystrokes,
pointer coordinates, screenshots, project identifiers, customer data, IP
addresses, or raw browser events.

Installation and live ingest are separate operational changes. Install the
addon on Odoo 19, give the human operations account the **Arcigy Activity
Manager** group, and give a dedicated API-key user only the **Arcigy Activity
Integration Bot** group. The public ingest method validates the complete batch
before using elevated ORM access; direct API create, write, and delete remain
denied by ACLs.

The application-side sync calls:

```text
POST /json/2/arcigy.user.activity.presence/ingest_activity_batch
```

Do not enable production collection until the privacy notice, legal basis,
retention duration, user access, subject export/deletion procedure, and worker
schedule have been approved.
