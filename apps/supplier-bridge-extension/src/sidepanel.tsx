import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupplierSourcePageType, SupplierSyncItem, SupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import { configuredSupplierPortal, supplierBridgeBuild } from "./config";
import { createDiagnosticExport } from "./diagnosticSanitizer";
import {
  BRIDGE_CHANNEL,
  parseBridgeRuntimeResponse,
  type BridgeRuntimeRequest,
  type BridgeRuntimeResponse,
  type DiagnosticField,
  type DiagnosticFieldCapture,
  type DiagnosticPageAnalysis
} from "./messages";
import { parseSupplierBridgeProgress } from "./storage";
import "./sidepanel.css";

const diagnosticFields: Array<{ field: DiagnosticField; label: string }> = [
  { field: "productName", label: "Názov produktu" },
  { field: "productCode", label: "Kód produktu" },
  { field: "price", label: "Cena" },
  { field: "unit", label: "Jednotka" },
  { field: "thickness", label: "Hrúbka" },
  { field: "availability", label: "Dostupnosť" }
];

async function send(message: BridgeRuntimeRequest): Promise<BridgeRuntimeResponse> {
  const raw: unknown = await chrome.runtime.sendMessage(message);
  return parseBridgeRuntimeResponse(raw) ?? { ok: false, errorCode: "INVALID_EXTENSION_RESPONSE", message: "Extension returned an invalid response." };
}

function command(commandName: Extract<BridgeRuntimeRequest, { type: "SIDE_PANEL_COMMAND" }>["command"], extras: { candidateId?: string; syncItemId?: string } = {}): Promise<BridgeRuntimeResponse> {
  return send({ channel: BRIDGE_CHANNEL, type: "SIDE_PANEL_COMMAND", command: commandName, ...extras });
}

async function requestCurrentSupplierPermission(view: SupplierSyncSessionView | null): Promise<BridgeRuntimeResponse | null> {
  const supplierId = view?.session.supplierId;
  if (!supplierId) return null;
  if (__SUPPLIER_BRIDGE_DEBUG__ && supplierId === "mock-supplier") return null;
  const portal = configuredSupplierPortal(supplierId);
  if (!portal) return { ok: false, errorCode: "SUPPLIER_ORIGIN_NOT_CONFIGURED", message: "Dodávateľ nemá nakonfigurovanú českú doménu." };
  const origins = portal.origins.map((origin) => `${origin}/*`);
  if (await chrome.permissions.contains({ origins })) return null;
  const granted = await chrome.permissions.request({ origins });
  return granted ? null : {
    ok: false,
    errorCode: "SUPPLIER_ORIGIN_PERMISSION_DENIED",
    message: `Bez povolenia iba pre ${portal.label} nemožno stránku bezpečne čítať.`
  };
}

function StatusBadge({ value }: { value: string }): React.JSX.Element {
  return <span className={`badge badge--${value.replaceAll("_", "-")}`}>{value.replaceAll("_", " ")}</span>;
}

function DiagnosticPanel(): React.JSX.Element | null {
  const [pageType, setPageType] = useState<SupplierSourcePageType>("product");
  const [fields, setFields] = useState<Partial<Record<DiagnosticField, DiagnosticFieldCapture>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DiagnosticField | null>(null);
  const [analysis, setAnalysis] = useState<DiagnosticPageAnalysis | null>(null);
  const preview = useMemo(() => createDiagnosticExport({
    pageType,
    extensionVersion: supplierBridgeBuild.version,
    fields,
    ...(analysis ? { page: { supplierId: analysis.supplierId, origin: analysis.origin, pathname: analysis.pathname, sessionStatus: analysis.sessionStatus } } : {})
  }), [analysis, fields, pageType]);
  if (!__SUPPLIER_BRIDGE_DEBUG__) return null;

  const pick = async (field: DiagnosticField) => {
    setBusy(field);
    setError(null);
    try {
      const result = await send({ channel: BRIDGE_CHANNEL, type: "START_DIAGNOSTIC_PICK", field, pageType });
      if (!result.ok || !result.diagnostic) throw new Error(result.message ?? result.errorCode ?? "Výber elementu zlyhal.");
      setFields((current) => ({ ...current, [field]: result.diagnostic }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Výber elementu zlyhal.");
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(preview.json)}`;
    await chrome.downloads.download({ url, filename: `arcigy-supplier-diagnostic-${Date.now()}.json`, saveAs: true });
  };
  const analyze = async () => {
    setError(null);
    try {
      const result = await command("analyze");
      if (!result.ok || !result.analysis) throw new Error(result.message ?? result.errorCode ?? "Analýza stránky zlyhala.");
      setAnalysis(result.analysis);
      setPageType(result.analysis.pageType);
      setFields(result.analysis.fields);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analýza stránky zlyhala.");
    }
  };

  return <details className="card diagnostic">
    <summary>Diagnostický záznam</summary>
    <p className="muted">Iba ručný výber. Súbor sa nikam neodosiela.</p>
    <button className="button button--secondary" onClick={() => void analyze()}>Bezpečne analyzovať kartu dodávateľa</button>
    {analysis && <p className="muted">{analysis.origin}{analysis.pathname} · {analysis.sessionStatus} · chýba polí: {analysis.missingFields.length}</p>}
    <label className="field">Typ stránky
      <select value={pageType} onChange={(event) => setPageType(event.target.value as SupplierSourcePageType)}>
        <option value="login">Login</option><option value="search_results">Výsledky</option><option value="product">Produkt</option><option value="cart">Košík</option><option value="diagnostic">Iné</option>
      </select>
    </label>
    <div className="diagnostic__fields">
      {diagnosticFields.map(({ field, label }) => <button key={field} className="button button--ghost" disabled={busy !== null} onClick={() => void pick(field)}>
        {fields[field] ? "✓ " : ""}{busy === field ? "Vyberte element…" : label}
      </button>)}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <label className="field">Presný JSON náhľad ({preview.bytes} B)
      <textarea readOnly value={preview.json} rows={12} />
    </label>
    <button className="button button--secondary" disabled={Object.keys(fields).length === 0} onClick={() => void download()}>Stiahnuť JSON lokálne</button>
  </details>;
}

const targetLabels: Record<string, string> = {
  corpus: "Korpus",
  front: "Fronty",
  worktop: "Pracovná doska",
  plinth: "Sokel",
  back: "Chrbát",
  drawer_bottom: "Dná zásuviek",
  edge_front: "Hrany frontov",
  edge_other: "Hrany korpusu",
  handle: "Úchytky",
  hinge: "Pánty",
  runner: "Zásuvkové výsuvy",
  lift_up: "Výklopy",
  leg: "Nožičky",
  fastener: "Spojovací materiál",
  other_component: "Ostatné komponenty"
};

function targetFor(item: SupplierSyncItem): { item: SupplierSyncItem; label: string } | null {
  const prefix = "material-assignment:";
  if (!item.materialAssignmentId.startsWith(prefix)) return null;
  const parts = item.materialAssignmentId.slice(prefix.length).split(":");
  const category = parts.find((part) => part in targetLabels);
  const label = item.targetLabel ?? (category ? targetLabels[category] : null);
  return label ? { item, label } : null;
}

function currentTargetText(view: SupplierSyncSessionView, item: SupplierSyncItem): string {
  const candidate = item.selectedCandidateId ? view.candidates.find((entry) => entry.id === item.selectedCandidateId) : null;
  if (!candidate) return item.targetLabel?.includes("nepriradené") ? "Nepriradené" : "Aktuálne priradenie";
  const product = candidate.normalizedProduct;
  const dimensions = product.widthMm != null || product.thicknessMm != null ? ` · ${product.widthMm ?? "—"} × ${product.thicknessMm ?? "—"} mm` : "";
  const price = view.priceObservations.find((entry) => entry.candidateId === candidate.id);
  return `${product.displayName} · ${candidate.supplierProductCode}${dimensions}${price?.normalizedAmount != null ? ` · ${price.normalizedAmount} ${price.currency}` : ""}`;
}

function App(): React.JSX.Element {
  const [view, setView] = useState<SupplierSyncSessionView | null>(null);
  const [projectLabel, setProjectLabel] = useState("");
  const [choosingTarget, setChoosingTarget] = useState(false);
  const [targetScope, setTargetScope] = useState<"general" | "module" | "addition">("general");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const result = await command("status");
    if (result.view) setView(result.view);
    if (!result.ok) throw new Error(result.message ?? result.errorCode ?? "Session sa nepodarila načítať.");
  };
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Supplier Bridge nie je pripojený.")), 0);
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes.arcigySupplierBridgeProgress) return;
      const progress = parseSupplierBridgeProgress(changes.arcigySupplierBridgeProgress.newValue);
      if (progress) { setView(progress.view); setProjectLabel(progress.projectLabel); }
    };
    void chrome.storage.local.get("arcigySupplierBridgeProgress").then((stored) => {
      const progress = parseSupplierBridgeProgress(stored.arcigySupplierBridgeProgress);
      if (progress) { setView(progress.view); setProjectLabel(progress.projectLabel); }
    });
    chrome.storage.onChanged.addListener(listener);
    return () => { window.clearTimeout(initial); chrome.storage.onChanged.removeListener(listener); };
  }, []);

  const targets = (view?.items.flatMap((item) => targetFor(item) ?? []) ?? [])
    .filter((target) => (target.item.targetScope ?? "general") === targetScope);
  const targetGroups = [...targets.reduce((groups, target) => {
    const group = target.item.targetLabel?.split(" · ")[0] ?? target.label;
    groups.set(group, [...(groups.get(group) ?? []), target]);
    return groups;
  }, new Map<string, Array<{ item: SupplierSyncItem; label: string }>>())];
  const run = async (name: string, action: () => Promise<BridgeRuntimeResponse>, success: string): Promise<boolean> => {
    setBusy(name); setError(null); setMessage(null);
    try {
      const result = await action();
      if (result.view) setView(result.view);
      if (!result.ok) throw new Error(result.message ?? result.errorCode ?? "Operácia zlyhala.");
      setMessage(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operácia zlyhala.");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const assignTo = async (target: { item: SupplierSyncItem; label: string }): Promise<void> => {
    const assigned = await run(`assign:${target.item.id}`, async () => {
      const permissionError = await requestCurrentSupplierPermission(view);
      return permissionError ?? command("assign_current", { syncItemId: target.item.id });
    }, `Produkt bol priradený do skupiny ${target.label}.`);
    if (assigned) setChoosingTarget(false);
  };

  return <main className="shell">
    <header className="topbar"><div className="logo">A</div><div><strong>Arcigy Supplier Bridge</strong><small>Priradenie z otvoreného produktu</small></div><StatusBadge value={view?.session.status ?? "disconnected"} /></header>
    {!view ? <section className="card empty"><h1>Čakám na projekt</h1><p>V Arcigy otvorte Materiály a kliknite na jedného dodávateľa.</p></section> : <>
      <section className="card project-context">
        <div><div className="eyebrow">Aktuálny projekt</div><h1>{projectLabel || view.session.projectId}</h1>{projectLabel && <small>{view.session.projectId}</small>}</div>
        <div className="project-context__count"><strong>{view.counts.completed}</strong><span>priradené</span></div>
      </section>
      <section className="card capture-flow">
        <div className="eyebrow">Otvorený produkt dodávateľa</div>
        <h2>Pridať materiál do projektu</h2>
        <p className="muted">Otvorte detail produktu. Arcigy prečíta iba jeho názov, kód, rozmery, dostupnosť a cenu.</p>
        <button className="button button--primary" data-sidepanel-action="choose-target" disabled={busy !== null} onClick={() => setChoosingTarget((current) => !current)}>{choosingTarget ? "Zavrieť výber" : "Pridať aktuálny produkt"}</button>
      </section>
      <nav className="scope-tabs" aria-label="Nastavenia materiálov">
        {(["general", "module", "addition"] as const).map((scope) => <button key={scope} className={targetScope === scope ? "scope-tab scope-tab--active" : "scope-tab"} onClick={() => setTargetScope(scope)}>{scope === "general" ? "General settings" : scope === "module" ? "Module settings" : "Additions"}</button>)}
      </nav>
      {choosingTarget && <section className="card targets">
        <h2>Kam produkt priradiť?</h2>
        {targets.length === 0 ? <p className="muted">V tejto časti zatiaľ nie je položka projektu.</p> : targetGroups.map(([group, entries]) => <section className="target-group" key={group}><h3>{group}</h3><div className="targets__grid">{entries.map((target) => <button key={target.item.id} className="target" data-material-target={target.item.materialAssignmentId.replace("material-assignment:", "")} disabled={busy !== null} onClick={() => void assignTo(target)}><strong>{target.item.targetLabel ?? target.label}</strong><small>{view ? currentTargetText(view, target.item) : "Nepriradené"}</small></button>)}</div></section>)}
      </section>}
      {(message || error) && <p className={error ? "notice notice--error" : "notice"} role={error ? "alert" : "status"}>{error ?? message}</p>}
      <button className="link" disabled={busy !== null || view.session.status === "cancelled"} onClick={() => void run("cancel", () => command("cancel"), "Prepojenie projektu bolo ukončené.")}>Ukončiť prepojenie projektu</button>
    </>}
    {__SUPPLIER_BRIDGE_DEBUG__ ? <DiagnosticPanel /> : null}
    <footer>Arcigy Supplier Bridge · {supplierBridgeBuild.version}{__SUPPLIER_BRIDGE_DEBUG__ ? " · DEBUG" : ""}</footer>
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Supplier Bridge root is missing.");
createRoot(root).render(<App />);
