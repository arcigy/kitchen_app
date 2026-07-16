import { createHmac, randomBytes } from "node:crypto";
import type http from "node:http";
import { parseClientSessionCookie } from "../core/client/session-cookie";

type AuditOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (message: string) => void;
};

const processFallbackSecret = randomBytes(32).toString("hex");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function auditSecret(env: NodeJS.ProcessEnv): string {
  return env.ARCIGY_AUDIT_HASH_SECRET?.trim() || env.AUTH_SESSION_SECRET?.trim() || processFallbackSecret;
}

function ref(secret: string, kind: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  return `${kind}_${createHmac("sha256", secret).update(`${kind}\u0000${value}`).digest("hex").slice(0, 16)}`;
}

function mutationAction(method: string, pathname: string): string | undefined {
  if (SAFE_METHODS.has(method)) return undefined;
  if (pathname === "/api/auth/login") return "auth.login";
  if (pathname === "/api/auth/logout") return "auth.logout";
  if (pathname === "/api/projects") return "project.create";
  if (pathname === "/api/projects/import") return "project.import";
  if (/^\/api\/projects\/[^/]+\/save$/.test(pathname)) return "project.save";
  if (/^\/api\/projects\/[^/]+\/versions\/\d+\/restore$/.test(pathname)) return "project.version.restore";
  if (/^\/api\/projects\/[^/]+\/materials$/.test(pathname)) return "project.materials.update";
  if (/^\/api\/projects\/[^/]+\/materials\/validate$/.test(pathname)) return "project.materials.validate";
  if (/^\/api\/projects\/[^/]+\/supplier-sync-sessions/.test(pathname)) return "supplier.web.mutate";
  if (/^\/api\/projects\/[^/]+$/.test(pathname) && method === "DELETE") return "project.delete";
  if (pathname === "/api/modules/import") return "module.import";
  if (/^\/api\/modules\/[^/]+\/parameter-presets$/.test(pathname)) return "module.preset.create";
  if (pathname === "/api/assistant/rag/reindex") return "assistant.rag.reindex";
  if (pathname === "/api/assistant/turn") return "assistant.turn";
  if (pathname === "/api/assistant/continue") return "assistant.continue";
  if (/^\/api\/supplier-bridge\/sessions\//.test(pathname)) return "supplier.extension.mutate";
  if (pathname === "/api/blender/export") return "blender.export";
  if (pathname === "/api/blender/open-output") return "blender.open-output";
  if (pathname === "/api/material-proof/color-cache") return "material-proof.cache.update";
  return pathname.startsWith("/api/") ? "api.mutation" : undefined;
}

function resourceRefs(pathname: string, secret: string): Record<string, string> | undefined {
  const segments = pathname.split("/").filter(Boolean);
  const refs: Record<string, string> = {};
  if (segments[0] === "api" && segments[1] === "projects" && segments[2] && segments[2] !== "import") {
    refs.projectRef = ref(secret, "project", segments[2])!;
  }
  if (segments[0] === "api" && segments[1] === "modules" && segments[2] && segments[2] !== "import") {
    refs.moduleRef = ref(secret, "module", segments[2])!;
  }
  const sessionsIndex = segments.indexOf("sessions");
  if (sessionsIndex >= 0 && segments[sessionsIndex + 1]) {
    refs.sessionRef = ref(secret, "session", segments[sessionsIndex + 1])!;
  }
  return Object.keys(refs).length > 0 ? refs : undefined;
}

export function registerMutationAudit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  requestId: string,
  options: AuditOptions = {}
): void {
  const method = (req.method ?? "UNKNOWN").toUpperCase();
  const action = mutationAction(method, url.pathname);
  if (!action) return;

  const env = options.env ?? process.env;
  const secret = auditSecret(env);
  let session: ReturnType<typeof parseClientSessionCookie> = null;
  try {
    session = parseClientSessionCookie(req.headers.cookie);
  } catch {
    session = null;
  }
  const source = session ? "session" : req.headers.authorization ? "token" : "anonymous";
  const log = options.log ?? (env.NODE_ENV === "test" ? () => undefined : console.info);
  const now = options.now ?? Date.now;
  let recorded = false;
  const record = (aborted: boolean) => {
    if (recorded) return;
    recorded = true;
    const status = res.statusCode || 0;
    const event = {
      event: "mutation_audit",
      timestamp: new Date(now()).toISOString(),
      requestId,
      action,
      source,
      status,
      outcome: aborted ? "aborted" : status >= 500 ? "error" : status >= 400 ? "rejected" : "success",
      ...(session ? {
        tenantRef: ref(secret, "tenant", session.clientId),
        actorRef: ref(secret, "actor", session.userId),
        actorRole: session.role
      } : {}),
      ...(resourceRefs(url.pathname, secret) ? { resources: resourceRefs(url.pathname, secret) } : {})
    };
    log(JSON.stringify(event));
  };
  res.once("finish", () => record(false));
  res.once("close", () => record(!res.writableEnded));
}
