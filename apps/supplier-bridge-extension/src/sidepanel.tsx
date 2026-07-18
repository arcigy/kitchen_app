import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ProjectMaterialScopeKind, ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import type { ProjectMetadata } from "../../../src/core/project/project-types";
import type { SupplierId } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import type { ClientSupplierPortal } from "../../../src/core/supplier-configuration/supplier-configuration-types";
import {
  loadExtensionProjectMaterials,
  loadExtensionProjects,
  loadExtensionSession,
  loadExtensionSuppliers,
  loginExtension,
  logoutExtension,
  SupplierBridgeApiError
} from "./api";
import { configuredSupplierPortal, supplierBridgeBuild } from "./config";
import { runExtensionAssignment } from "./extensionAssignmentFlow";
import { BRIDGE_CHANNEL, parseBridgeRuntimeResponse, type SupplierPageCapture } from "./messages";
import {
  clearSupplierBridgeAccount,
  loadSupplierBridgeAccount,
  loadSupplierBridgePrivacyConsent,
  saveSupplierBridgeAccount,
  saveSupplierBridgePrivacyConsent,
  type SupplierBridgeAccount
} from "./storage";
import {
  extensionMaterialTargetGroups,
  extensionMaterialTargets,
  type ExtensionMaterialTarget
} from "./materialTargetModel";
import "./sidepanel.css";

function defaultOrigin(): string {
  return supplierBridgeBuild.arcigyOrigins.find((origin) => origin.includes("develop")) ?? supplierBridgeBuild.arcigyOrigins[0] ?? "";
}

async function requestSupplierPermission(supplierId: string): Promise<void> {
  const portal = configuredSupplierPortal(supplierId);
  if (!portal) throw new Error("Dodávateľ nie je podporovaný týmto rozšírením.");
  const origins = portal.origins.map((origin) => `${origin}/*`);
  if (!await chrome.permissions.contains({ origins }) && !await chrome.permissions.request({ origins })) {
    throw new Error(`Bez povolenia pre ${portal.label} nemožno načítať produkt.`);
  }
}

function App(): React.JSX.Element {
  const [account, setAccount] = useState<SupplierBridgeAccount | null>(null);
  const [origin, setOrigin] = useState(defaultOrigin());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [projectId, setProjectId] = useState("");
  const [materials, setMaterials] = useState<ProjectMaterialsView | null>(null);
  const [suppliers, setSuppliers] = useState<ClientSupplierPortal[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [capture, setCapture] = useState<SupplierPageCapture | null>(null);
  const [scope, setScope] = useState<"general" | ProjectMaterialScopeKind>("general");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDebug, setLastDebug] = useState<Record<string, unknown>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const assigningRef = useRef(false);
  const targets = useMemo(() => extensionMaterialTargets(materials), [materials]);
  const scopedTargets = useMemo(() => targets.filter((target) => target.scope === scope), [scope, targets]);
  const targetGroups = useMemo(
    () => scope === "general" ? [] : extensionMaterialTargetGroups(targets, scope),
    [scope, targets]
  );
  const selectedProject = projects.find((project) => project.projectId === projectId) ?? null;
  const selectedCandidate = capture?.candidates[0] ?? null;

  const resetAccountState = useCallback(() => {
    setAccount(null);
    setProjects([]);
    setProjectId("");
    setMaterials(null);
    setSuppliers([]);
    setSupplierId("");
    setCapture(null);
    setExpandedGroups(new Set());
  }, []);

  const expireAccount = useCallback(async () => {
    await clearSupplierBridgeAccount();
    resetAccountState();
    setError("Prihlásenie vypršalo. Prihláste sa znova; heslo sa v rozšírení neukladá.");
  }, [resetAccountState]);

  const loadWorkspace = async (nextAccount: SupplierBridgeAccount) => {
    const [nextProjects, nextSuppliers] = await Promise.all([
      loadExtensionProjects(nextAccount.baseUrl, nextAccount.accessToken),
      loadExtensionSuppliers(nextAccount.baseUrl, nextAccount.accessToken)
    ]);
    setProjects(nextProjects);
    setSuppliers(nextSuppliers);
    setProjectId((current) => nextProjects.some((project) => project.projectId === current) ? current : (nextProjects[0]?.projectId ?? ""));
    setSupplierId((current) => nextSuppliers.some((supplier) => supplier.supplierId === current) ? current : (nextSuppliers[0]?.supplierId ?? ""));
  };

  useEffect(() => {
    void loadSupplierBridgeAccount().then(async (stored) => {
      if (!stored) return;
      try {
        await loadExtensionSession(stored.baseUrl, stored.accessToken);
        setAccount(stored);
        setOrigin(stored.baseUrl);
        await loadWorkspace(stored);
      } catch {
        await clearSupplierBridgeAccount();
      }
    });
  }, []);

  useEffect(() => {
    if (!account || !projectId) return;
    let cancelled = false;
    void loadExtensionProjectMaterials(account.baseUrl, account.accessToken, projectId)
      .then((view) => { if (!cancelled) setMaterials(view); })
      .catch(async (cause) => {
        if (cancelled) return;
        if (cause instanceof SupplierBridgeApiError && cause.status === 401) {
          await expireAccount();
          return;
        }
        setError(cause instanceof Error ? cause.message : "Projekt sa nepodarilo načítať.");
      })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [account, expireAccount, projectId]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy("login"); setError(null); setMessage(null);
    try {
      const result = await loginExtension(origin, username, password);
      const next: SupplierBridgeAccount = { version: 1, baseUrl: origin, accessToken: result.accessToken, ...result.session };
      await saveSupplierBridgeAccount(next);
      setPassword(""); setAccount(next);
      await loadWorkspace(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prihlásenie zlyhalo.");
    } finally { setBusy(null); }
  };

  const logout = async () => {
    if (account) await logoutExtension(account.baseUrl, account.accessToken).catch(() => undefined);
    await clearSupplierBridgeAccount();
    resetAccountState();
  };

  const openSupplier = async () => {
    setBusy("supplier"); setError(null);
    try {
      await requestSupplierPermission(supplierId);
      const portal = configuredSupplierPortal(supplierId);
      if (!portal) throw new Error("Dodávateľ nie je podporovaný.");
      await chrome.tabs.create({ url: portal.startUrl, active: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dodávateľa sa nepodarilo otvoriť."); }
    finally { setBusy(null); }
  };

  const captureProduct = async () => {
    setBusy("capture"); setError(null); setMessage(null);
    try {
      if (!await loadSupplierBridgePrivacyConsent()) await saveSupplierBridgePrivacyConsent();
      await requestSupplierPermission(supplierId);
      const raw: unknown = await chrome.runtime.sendMessage({ channel: BRIDGE_CHANNEL, type: "CAPTURE_ACTIVE_SUPPLIER_PRODUCT" });
      const response = parseBridgeRuntimeResponse(raw);
      if (!response?.ok || !response.capture) throw new Error(response?.message ?? response?.errorCode ?? "Produkt sa nepodarilo načítať.");
      if (response.capture.candidates.length !== 1) throw new Error("Rozšírenie nerozpoznalo presne jeden produkt. Otvorte detail konkrétneho produktu a skúste to znova.");
      if (!suppliers.some((supplier) => supplier.supplierId === response.capture!.supplierId)) throw new Error("Tento dodávateľ nie je povolený pre klienta.");
      setSupplierId(response.capture.supplierId);
      setCapture(response.capture);
      setMessage("Produkt načítaný. Teraz vyberte, kam ho chcete priradiť.");
      setLastDebug({ stage: "capture", supplierId: response.capture.supplierId, productCode: response.capture.candidates[0]?.supplierProductCode });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Produkt sa nepodarilo načítať.");
      setLastDebug({ stage: "capture", error: cause instanceof Error ? cause.message : String(cause) });
    } finally { setBusy(null); }
  };

  const assign = async (target: ExtensionMaterialTarget) => {
    if (!account || !selectedCandidate || !selectedProject || assigningRef.current) return;
    if (target.assignedProductCode === selectedCandidate.supplierProductCode) {
      setError(null);
      setMessage(`${target.assignedText} je už priradený k tejto časti.`);
      return;
    }
    assigningRef.current = true;
    const context = { account, candidate: selectedCandidate, project: selectedProject, supplierId: supplierId as SupplierId };
    setBusy(target.id); setError(null); setMessage(null);
    const startedAt = new Date().toISOString();
    try {
      const result = await runExtensionAssignment({
        baseUrl: context.account.baseUrl,
        accessToken: context.account.accessToken,
        projectId: context.project.projectId,
        supplierId: context.supplierId,
        candidate: context.candidate,
        target
      });
      if (result.materials) setMaterials(result.materials);
      setMessage(result.refreshError
        ? `${context.candidate.normalizedProduct.displayName} bol uložený. Zoznam sa teraz nepodarilo obnoviť; po opätovnom načítaní projektu sa zobrazí zeleno.`
        : `${context.candidate.normalizedProduct.displayName} bol priradený: ${target.group} · ${target.label}.`);
      setLastDebug({
        stage: result.refreshError ? "assigned_refresh_pending" : "assigned",
        startedAt,
        projectId: context.project.projectId,
        targetId: target.id,
        supplierId: context.supplierId,
        productCode: context.candidate.supplierProductCode,
        sessionId: result.sessionId,
        ...(result.refreshError ? { refreshError: result.refreshError instanceof Error ? result.refreshError.message : String(result.refreshError) } : {})
      });
    } catch (cause) {
      if (cause instanceof SupplierBridgeApiError && cause.status === 401) {
        await expireAccount();
        setLastDebug({ stage: "assign_auth_expired", startedAt, projectId: context.project.projectId, targetId: target.id });
        return;
      }
      const api = cause instanceof SupplierBridgeApiError ? { status: cause.status, requestId: cause.requestId, code: cause.code } : {};
      setError(cause instanceof Error ? cause.message : "Priradenie materiálu zlyhalo.");
      setLastDebug({ stage: "assign", startedAt, projectId: context.project.projectId, targetId: target.id, supplierId: context.supplierId, productCode: context.candidate.supplierProductCode, ...api, error: cause instanceof Error ? cause.message : String(cause) });
      await loadExtensionProjectMaterials(context.account.baseUrl, context.account.accessToken, context.project.projectId)
        .then(setMaterials)
        .catch(() => undefined);
    } finally {
      assigningRef.current = false;
      setBusy(null);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderTarget = (target: ExtensionMaterialTarget): React.JSX.Element => {
    const sameProduct = target.assignedProductCode === selectedCandidate?.supplierProductCode;
    return <button
      key={target.id}
      type="button"
      className={`target${target.assigned ? " target--assigned" : ""}`}
      data-material-target={target.id}
      data-target-assigned={target.assigned ? "true" : "false"}
      data-target-source={target.inherited ? "general" : "direct"}
      disabled={busy !== null || account?.role === "viewer" || sameProduct}
      onClick={() => void assign(target)}
    >
      <span className="target__heading">
        <strong>{target.label}</strong>
        {target.assigned && <span className="target__check">✓ {target.inherited ? "Zdedené" : "Priradené"}</span>}
      </span>
      <span className={target.assigned ? "target__material" : "target__empty"}>
        {busy === target.id ? "Ukladám…" : target.assignedText}
      </span>
      {target.inherited && <small>Z celého projektu; môžete nastaviť vlastný materiál pre túto časť.</small>}
      {sameProduct && <small>Aktuálny produkt je už na tejto časti.</small>}
    </button>;
  };

  const copyDebug = async () => {
    await navigator.clipboard.writeText([
      "Arcigy Supplier Bridge diagnostics",
      `extension_version=${supplierBridgeBuild.version}`,
      `environment=${account?.baseUrl ?? origin}`,
      `user=${account?.userId ?? "logged_out"}`,
      `client=${account?.clientId ?? "unknown"}`,
      `project=${projectId || "none"}`,
      `supplier=${supplierId || "none"}`,
      `capture=${selectedCandidate?.supplierProductCode ?? "none"}`,
      `visible_error=${error ?? "none"}`,
      `details=${JSON.stringify(lastDebug)}`
    ].join("\n"));
    setMessage("Diagnostika bola skopírovaná.");
  };

  if (!account) return <main className="shell">
    <header className="topbar"><div className="logo">A</div><div><strong>Arcigy Supplier Bridge</strong><small>v{supplierBridgeBuild.version}</small></div></header>
    <form className="card" onSubmit={(event) => void login(event)}>
      <h1>Prihlásenie do Arcigy</h1>
      <p className="muted">Použite rovnaké meno a heslo ako v aplikácii. Heslo sa neukladá.</p>
      <label className="field">Prostredie<select value={origin} onChange={(event) => setOrigin(event.target.value)}>{supplierBridgeBuild.arcigyOrigins.map((value) => <option key={value} value={value}>{value.includes("develop") ? "Develop" : "Produkcia"}</option>)}</select></label>
      <label className="field">Používateľ<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label className="field">Heslo<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <button className="button button--primary" disabled={busy !== null || !username || !password}>{busy === "login" ? "Prihlasujem…" : "Prihlásiť"}</button>
    </form>
  </main>;

  return <main className="shell">
    <header className="topbar"><div className="logo">A</div><div><strong>Arcigy Supplier Bridge</strong><small>{account.displayName} · v{supplierBridgeBuild.version}</small></div><button type="button" className="button button--ghost" disabled={busy !== null} onClick={() => void logout()}>Odhlásiť</button></header>
    <section className="card">
      <div className="eyebrow">1. Projekt</div>
      <label className="field">Projekt<select disabled={busy !== null} value={projectId} onChange={(event) => { setBusy("project"); setError(null); setMessage(null); setMaterials(null); setProjectId(event.target.value); setCapture(null); setExpandedGroups(new Set()); }}>{projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.name}</option>)}</select></label>
      {selectedProject && <p className="muted">{selectedProject.projectId}</p>}
    </section>
    <section className="card">
      <div className="eyebrow">2. Dodávateľ a produkt</div>
      <label className="field">Dodávateľ<select disabled={busy !== null} value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setCapture(null); setMessage(null); setError(null); }}>{suppliers.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.displayName}</option>)}</select></label>
      <div className="privacy-disclosure__actions"><button type="button" className="button button--secondary" disabled={busy !== null || !supplierId} onClick={() => void openSupplier()}>Otvoriť dodávateľa</button><button type="button" className="button button--primary" disabled={busy !== null || !supplierId} onClick={() => void captureProduct()}>{busy === "capture" ? "Načítavam…" : "Načítať otvorený produkt"}</button></div>
      {selectedCandidate && <div className="notice notice--success"><strong>{selectedCandidate.normalizedProduct.displayName}</strong><br /><span>{selectedCandidate.supplierProductCode}</span></div>}
    </section>
    {selectedCandidate && <section className="card">
      <div className="eyebrow">3. Kam materiál priradiť?</div>
      <nav className="scope-tabs">{(["general", "module", "addition"] as const).map((value) => <button type="button" key={value} className={scope === value ? "active" : ""} disabled={busy !== null} onClick={() => setScope(value)}>{value === "general" ? "Celý projekt" : value === "module" ? "Moduly" : "Doplnky"}</button>)}</nav>
      {scope === "general"
        ? <div className="target-list">{scopedTargets.map(renderTarget)}</div>
        : <div className="target-groups">{targetGroups.map((group) => {
          const expanded = expandedGroups.has(group.id);
          return <section className="target-group" key={group.id} data-target-group={group.id}>
            <button type="button" className="target-group__toggle" aria-expanded={expanded} disabled={busy !== null} onClick={() => toggleGroup(group.id)}>
              <span><strong>{group.label}</strong><small>{group.assignedCount}/{group.targets.length} priradené</small></span>
              <span className="target-group__icon" aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
            {expanded && <div className="target-list target-list--nested">{group.targets.map(renderTarget)}</div>}
          </section>;
        })}</div>}
      {scopedTargets.length === 0 && <p className="muted target-empty">V tomto projekte nie sú dostupné žiadne ciele.</p>}
      {account.role === "viewer" && <p className="notice notice--error">Máte rolu iba na čítanie. Materiály nemožno meniť.</p>}
    </section>}
    {message && <p className="notice notice--success" role="status">{message}</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <button type="button" className="button button--ghost" onClick={() => void copyDebug()}>Kopírovať diagnostiku</button>
    <footer>Arcigy Supplier Bridge · {supplierBridgeBuild.version}</footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
