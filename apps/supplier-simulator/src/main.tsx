import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const scenarios = [
  "logged-in-session", "expired-session", "exact-single-result", "multiple-results", "no-result",
  "product-without-price", "board-price-per-sheet", "price-per-m2", "package-price", "net-price",
  "gross-price", "delayed-price-rendering", "spa-navigation", "selector-missing", "product-unavailable", "backend-timeout"
] as const;
type Scenario = typeof scenarios[number];
type SimulatorLanguage = "sk" | "cs" | "en";

type ProductData = {
  id: string; code: string; name: string; manufacturer: string; decor: string; surface: string; productType: string;
  colorHex: string; thickness: number; width: number; length: number; available: boolean; price: string | null; unit: string;
};

function query(): URLSearchParams { return new URLSearchParams(window.location.search); }
function languageFromUrl(): SimulatorLanguage {
  const value = query().get("lang");
  return value === "cs" || value === "en" ? value : "sk";
}
function copy(language: SimulatorLanguage, sk: string, cs: string, en: string): string {
  return language === "cs" ? cs : language === "en" ? en : sk;
}
function scenarioFromUrl(): Scenario {
  const value = query().get("scenario");
  return scenarios.includes(value as Scenario) ? value as Scenario : "exact-single-result";
}
function path(): string { return window.location.pathname; }
function navigate(next: string): void { history.pushState({}, "", next); window.dispatchEvent(new PopStateEvent("popstate")); }

function fixture(index = 0): ProductData {
  const params = query();
  const decor = params.get("decor") || "W980 SM";
  const manufacturer = params.get("manufacturer") || "Ficta Boards";
  const surface = params.get("surface") || "SM";
  const productType = params.get("productType") || "laminated-board";
  const requestedColor = params.get("color") || "#B31B34";
  const colorHex = /^#[0-9a-fA-F]{6}$/.test(requestedColor) ? requestedColor.toUpperCase() : "#B31B34";
  const parsedThickness = Number(params.get("thickness") || "18");
  return {
    id: `board-${index + 1}`,
    code: `SIM-${decor.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}-${index + 1}`,
    name: `${manufacturer} ${decor}${index ? ` variant ${index + 1}` : ""}`,
    manufacturer,
    decor: index ? `${decor}-${index + 1}` : decor,
    surface,
    productType,
    colorHex,
    thickness: Number.isFinite(parsedThickness) ? parsedThickness : 18,
    width: 2070,
    length: 2800,
    available: scenarioFromUrl() !== "product-unavailable",
    price: "52.80 EUR gross",
    unit: "per sheet"
  };
}

function priced(product: ProductData, scenario: Scenario): ProductData {
  if (scenario === "product-without-price") return { ...product, price: null };
  if (scenario === "price-per-m2") return { ...product, price: "11.90 EUR gross", unit: "per m2" };
  if (scenario === "package-price") return { ...product, price: "96.00 EUR gross", unit: "per package" };
  if (scenario === "net-price") return { ...product, price: "44.00 EUR net", unit: "per sheet excl VAT" };
  if (scenario === "gross-price") return { ...product, price: "52.80 EUR gross", unit: "per sheet incl VAT" };
  return product;
}

function Product({ data, language, delayed = false, brokenSelector = false }: { data: ProductData; language: SimulatorLanguage; delayed?: boolean; brokenSelector?: boolean }): React.JSX.Element {
  const [showPrice, setShowPrice] = useState(!delayed);
  useEffect(() => { if (!delayed) return; const timer = window.setTimeout(() => setShowPrice(true), 850); return () => window.clearTimeout(timer); }, [delayed]);
  const attrs = brokenSelector ? {} : { "data-supplier-product": "true" };
  return <article className="product" {...attrs}
    data-product-code={data.code} data-display-name={data.name} data-manufacturer={data.manufacturer}
    data-decor-code={data.decor} data-surface-code={data.surface} data-product-type={data.productType}
    data-preview-color-hex={data.colorHex}
    data-thickness-mm={data.thickness} data-width-mm={data.width} data-length-mm={data.length}
    data-availability={data.available ? "available" : "unavailable"}>
    <div className="board" aria-hidden="true" style={{ backgroundColor: data.colorHex }}><span>{data.decor}</span></div>
    <div className="product__body"><div className="brand">{data.manufacturer}</div><h2 data-diagnostic-product-name>{data.name}</h2>
      <p className="code" data-diagnostic-product-code>{data.code}</p><p>{data.productType} · {data.thickness} mm · {data.width} × {data.length} mm</p>
      <p data-diagnostic-availability className={data.available ? "available" : "unavailable"}>{data.available ? copy(language, "Skladom", "Skladem", "Available") : copy(language, "Nedostupné", "Nedostupné", "Unavailable")}</p>
      {showPrice && data.price ? <div className="price"><strong data-supplier-price data-diagnostic-price>{data.price}</strong><span data-supplier-unit data-diagnostic-unit>{data.unit}</span></div> : <div className="price price--loading">{delayed && !showPrice ? copy(language, "Načítavam cenu…", "Načítám cenu…", "Loading price…") : copy(language, "Cena na vyžiadanie", "Cena na vyžádání", "Price on request")}</div>}
      <button onClick={() => navigate(`/product/${data.id}${window.location.search}`)}>{copy(language, "Detail produktu", "Detail produktu", "Product details")}</button>
    </div>
  </article>;
}

function DebugPanel({ scenario, language }: { scenario: Scenario; language: SimulatorLanguage }): React.JSX.Element {
  return <aside className="debug"><strong>{copy(language, "Scenár simulátora", "Scénář simulátoru", "Simulator scenario")}</strong><select value={scenario} onChange={(event) => {
    const params = query(); params.set("scenario", event.target.value); navigate(`${path()}?${params.toString()}`);
  }}>{scenarios.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select><small>{copy(language, "Fiktívne dáta · iba lokálny debug", "Fiktivní data · pouze lokální ladění", "Fictional data · local debug only")}</small></aside>;
}

function App(): React.JSX.Element {
  const [locationKey, setLocationKey] = useState(() => `${path()}${window.location.search}`);
  useEffect(() => { const update = () => setLocationKey(`${path()}${window.location.search}`); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update); }, []);
  void locationKey;
  const scenario = scenarioFromUrl();
  const language = languageFromUrl();
  const currentPath = path();
  const base = priced(fixture(), scenario);
  const products = scenario === "multiple-results" ? [base, priced(fixture(1), scenario), priced(fixture(2), scenario)] : [base];
  const expired = scenario === "expired-session" || currentPath === "/login";
  useEffect(() => { document.documentElement.lang = language === "cs" ? "cs-CZ" : language === "en" ? "en-GB" : "sk-SK"; }, [language]);
  return <><header><a onClick={() => navigate(`/search${window.location.search}`)}>FICTA SUPPLY</a><nav><button onClick={() => navigate(`/search${window.location.search}`)}>{copy(language, "Hľadať", "Hledat", "Search")}</button><button onClick={() => navigate(`/cart${window.location.search}`)}>{copy(language, "Košík", "Košík", "Basket")}</button></nav></header><DebugPanel scenario={scenario} language={language}/><main>
    {expired ? <section className="login"><h1>{copy(language, "Prihlásenie vypršalo", "Přihlášení vypršelo", "Sign-in expired")}</h1><p>{copy(language, "Simulovaná relácia dodávateľa vyžaduje nové prihlásenie.", "Simulovaná relace dodavatele vyžaduje nové přihlášení.", "The simulated supplier session requires a new sign-in.")}</p><button onClick={() => { const params = query(); params.set("scenario", "logged-in-session"); navigate(`/search?${params.toString()}`); }}>{copy(language, "Simulovať prihlásenie", "Simulovat přihlášení", "Simulate sign-in")}</button></section>
      : scenario === "backend-timeout" ? <section className="state"><div className="spinner"/><h1>{copy(language, "Dodávateľ neodpovedá", "Dodavatel neodpovídá", "Supplier is not responding")}</h1><p>{copy(language, "Simulovaný časový limit backendu. Stránka neposkytne produktové údaje.", "Simulovaný časový limit backendu. Stránka neposkytne produktové údaje.", "Simulated backend timeout. The page will not provide product data.")}</p></section>
      : currentPath === "/cart" ? <section><h1>{copy(language, "Košík", "Košík", "Basket")}</h1><Product data={base} language={language}/></section>
      : currentPath.startsWith("/product/") ? <section><h1>{copy(language, "Detail produktu", "Detail produktu", "Product details")}</h1><Product data={base} language={language} delayed={scenario === "delayed-price-rendering"} brokenSelector={scenario === "selector-missing"}/></section>
      : <section><div className="search"><input readOnly value={query().get("query") ?? ""}/><button>{copy(language, "Hľadať", "Hledat", "Search")}</button></div><h1>{copy(language, "Výsledky vyhľadávania", "Výsledky vyhledávání", "Search results")}</h1>
        {scenario === "no-result" ? <div className="state"><h2>{copy(language, "Žiadny výsledok", "Žádný výsledek", "No results")}</h2><p>{copy(language, "Skúste upraviť vyhľadávanie.", "Zkuste upravit vyhledávání.", "Try adjusting the search.")}</p></div> : products.map((product) => <Product key={product.id} data={product} language={language} delayed={scenario === "delayed-price-rendering"} brokenSelector={scenario === "selector-missing"}/>)}</section>}
  </main><footer>{copy(language, "Supplier Simulator 0.1 · bez reálnych údajov dodávateľa", "Supplier Simulator 0.1 · bez skutečných údajů dodavatele", "Supplier Simulator 0.1 · no real supplier data")}</footer></>;
}

document.body.dataset.supplierAccountId = "sim-account-local";
const root = document.getElementById("root"); if (!root) throw new Error("Simulator root is missing."); createRoot(root).render(<App/>);
