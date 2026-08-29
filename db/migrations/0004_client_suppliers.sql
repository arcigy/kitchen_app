CREATE TABLE IF NOT EXISTS arcigy_suppliers (
  supplier_id text PRIMARY KEY,
  display_name text NOT NULL,
  start_url text NOT NULL,
  adapter_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcigy_client_suppliers (
  client_id text NOT NULL,
  supplier_id text NOT NULL REFERENCES arcigy_suppliers (supplier_id),
  enabled boolean NOT NULL DEFAULT true,
  display_name_override text,
  sort_order_override integer,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS arcigy_client_suppliers_enabled_idx
  ON arcigy_client_suppliers (client_id, enabled, supplier_id);

INSERT INTO arcigy_suppliers (supplier_id, display_name, start_url, adapter_key, sort_order)
VALUES
  ('demos', 'Démos', 'https://www.demos24plus.com/', 'demos', 10),
  ('schachermayer', 'Schachermayer', 'https://webshop.schachermayer.com/cat/cs-CZ', 'schachermayer', 20),
  ('hranipex', 'Hranipex', 'https://www.hranipex.cz/cs/', 'hranipex', 30),
  ('jaf_holz', 'JAF Holz', 'https://www.jafholz.cz/', 'jaf_holz', 40)
ON CONFLICT (supplier_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  start_url = EXCLUDED.start_url,
  adapter_key = EXCLUDED.adapter_key,
  sort_order = EXCLUDED.sort_order,
  db_updated_at = now();

INSERT INTO arcigy_client_suppliers (client_id, supplier_id, enabled)
SELECT 'client_arcigy_demo', supplier_id, true
FROM arcigy_suppliers
WHERE supplier_id IN ('demos', 'schachermayer', 'hranipex', 'jaf_holz')
ON CONFLICT (client_id, supplier_id) DO NOTHING;
