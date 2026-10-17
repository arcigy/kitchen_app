export type CrmExportConfig = {
  environment: string;
  clientKeys: string[];
  odooUrl: string;
  odooDatabase: string | null;
  odooApiKey: string;
  alertUrl: string | null;
};

const CLIENT_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function normalizedOdooUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("ARCIGY_CRM_ODOO_URL must use HTTPS, except for loopback development.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * The daily export is opt-in and only sends explicitly listed clients, so test tenants and their
 * users never leave the app. Returns null when the export is disabled.
 */
export function resolveCrmExportConfig(env: NodeJS.ProcessEnv = process.env): CrmExportConfig | null {
  if (env.ARCIGY_CRM_EXPORT_ENABLED !== "true") return null;
  const clientKeys = (env.ARCIGY_CRM_EXPORT_CLIENT_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  if (clientKeys.length === 0) throw new Error("ARCIGY_CRM_EXPORT_CLIENT_KEYS must list at least one client.");
  const invalid = clientKeys.find((key) => !CLIENT_KEY_RE.test(key));
  if (invalid) throw new Error(`ARCIGY_CRM_EXPORT_CLIENT_KEYS contains an invalid client key: ${invalid}`);
  const odooUrl = env.ARCIGY_CRM_ODOO_URL?.trim() || env.ARCIGY_ODOO_URL?.trim();
  const odooApiKey = env.ARCIGY_CRM_ODOO_API_KEY?.trim();
  if (!odooUrl) throw new Error("ARCIGY_CRM_ODOO_URL is required.");
  if (!odooApiKey) throw new Error("ARCIGY_CRM_ODOO_API_KEY is required.");
  const appEnv = env.APP_ENV?.trim();
  const environment = env.ARCIGY_CRM_EXPORT_ENVIRONMENT?.trim() || (appEnv === "prod" || appEnv === "production" ? "prod" : "dev");
  return {
    environment,
    clientKeys,
    odooUrl: normalizedOdooUrl(odooUrl),
    odooDatabase: env.ARCIGY_CRM_ODOO_DATABASE?.trim() || env.ARCIGY_ODOO_DATABASE?.trim() || null,
    odooApiKey,
    alertUrl: env.ARCIGY_CRM_EXPORT_ALERT_URL?.trim() || null
  };
}
