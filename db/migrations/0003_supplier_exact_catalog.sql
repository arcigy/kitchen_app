CREATE TABLE IF NOT EXISTS arcigy_supplier_catalog_items (
  client_id text NOT NULL,
  catalog_item_id text NOT NULL,
  supplier_id text NOT NULL,
  supplier_product_id text NOT NULL,
  last_verified_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, catalog_item_id),
  UNIQUE (client_id, supplier_id, supplier_product_id)
);

CREATE TABLE IF NOT EXISTS arcigy_material_supplier_assignments (
  client_id text NOT NULL,
  material_assignment_id text NOT NULL,
  supplier_catalog_item_id text NOT NULL,
  selected_price_observation_id text,
  price_locked boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, material_assignment_id),
  FOREIGN KEY (client_id, supplier_catalog_item_id)
    REFERENCES arcigy_supplier_catalog_items (client_id, catalog_item_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (client_id, selected_price_observation_id)
    REFERENCES arcigy_supplier_price_observations (client_id, observation_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS arcigy_supplier_catalog_lookup_idx
  ON arcigy_supplier_catalog_items (client_id, supplier_id, supplier_product_id);
CREATE INDEX IF NOT EXISTS arcigy_material_supplier_assignment_catalog_idx
  ON arcigy_material_supplier_assignments (client_id, supplier_catalog_item_id);
