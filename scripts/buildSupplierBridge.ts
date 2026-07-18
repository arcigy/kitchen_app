import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import react from "@vitejs/plugin-react";
import { build, type InlineConfig } from "vite";
import { supplierBridgeReleaseOrigins } from "./supplierBridgeBuildConfig";

type BuildMode = "debug" | "production";

const root = process.cwd();
const extensionRoot = path.join(root, "apps", "supplier-bridge-extension");
const mode = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "debug";
if (mode !== "debug" && mode !== "production") throw new Error("Use --mode debug or --mode production.");
const buildMode: BuildMode = mode;
const debug = buildMode === "debug";
const version = "0.1.1";
const releaseOrigins = supplierBridgeReleaseOrigins();
const arcigyOrigins = debug
  ? ["http://127.0.0.1:5180", "http://localhost:5180", ...releaseOrigins]
  : releaseOrigins;
const simulatorOrigins = debug ? ["http://127.0.0.1:5192", "http://localhost:5192"] : [];
const outDir = path.join(extensionRoot, `dist-${buildMode}`);

const define = {
  __SUPPLIER_BRIDGE_DEBUG__: JSON.stringify(debug),
  __SUPPLIER_BRIDGE_VERSION__: JSON.stringify(version),
  __ARCIGY_ORIGINS__: JSON.stringify(arcigyOrigins),
  __SUPPLIER_SIMULATOR_ORIGINS__: JSON.stringify(simulatorOrigins)
};

function sourceBuild(entry: string, fileName: string, format: "es" | "iife"): InlineConfig {
  return {
    root: extensionRoot,
    configFile: false,
    define,
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: false,
      minify: buildMode === "production",
      lib: { entry: path.join(extensionRoot, entry), name: "ArcigySupplierBridge", formats: [format], fileName: () => fileName },
      rollupOptions: { output: { inlineDynamicImports: true } }
    }
  };
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await build({
  root: extensionRoot,
  configFile: false,
  plugins: [react()],
  define,
  base: "./",
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    minify: buildMode === "production",
    rollupOptions: { input: path.join(extensionRoot, "sidepanel.html") }
  }
});
await build(sourceBuild("src/serviceWorker.ts", "service-worker.js", "es"));
await build(sourceBuild("src/content/arcigyBridge.ts", "arcigy-content.js", "iife"));
await build(sourceBuild("src/content/supplierCapture.ts", "supplier-content.js", "iife"));
if (debug) {
  await build(sourceBuild("src/content/diagnosticRecorder.ts", "diagnostic-recorder.js", "iife"));
}

const manifest = {
  manifest_version: 3,
  name: debug ? "Arcigy Supplier Bridge (Debug)" : "Arcigy Supplier Bridge",
  version,
  description: "User-assisted supplier material and price capture for Arcigy.",
  minimum_chrome_version: "116",
  action: { default_title: "Open Arcigy Supplier Bridge" },
  side_panel: { default_path: "sidepanel.html" },
  background: { service_worker: "service-worker.js", type: "module" },
  permissions: debug
    ? ["storage", "sidePanel", "tabs", "activeTab", "scripting", "downloads"]
    : ["storage", "sidePanel", "tabs", "activeTab", "scripting"],
  host_permissions: debug
    ? [
        "http://127.0.0.1:5180/*",
        "http://localhost:5180/*",
        "http://127.0.0.1:5191/*",
        "http://localhost:5191/*",
        "http://127.0.0.1:5192/*",
        "http://localhost:5192/*",
        ...releaseOrigins.map((origin) => `${origin}/*`)
      ]
    : releaseOrigins.map((origin) => `${origin}/*`),
  optional_host_permissions: [
    "https://www.demos24plus.com/*",
    "https://webshop.schachermayer.com/*",
    "https://www.hranipex.cz/*",
    "https://www.jafholz.cz/*"
  ],
  content_scripts: [
    {
      matches: debug
        ? ["http://127.0.0.1:5180/*", "http://localhost:5180/*", ...releaseOrigins.map((origin) => `${origin}/*`)]
        : releaseOrigins.map((origin) => `${origin}/*`),
      js: ["arcigy-content.js"],
      run_at: "document_start"
    },
    ...(debug ? [{
      matches: ["http://127.0.0.1:5192/*", "http://localhost:5192/*"],
      js: ["supplier-content.js"],
      run_at: "document_idle"
    }] : [])
  ]
};
await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (buildMode === "production") {
  const forbidden = ["localhost", "127.0.0.1", "mock-supplier", "supplier-simulator", "exact-single-result", "diagnostic-recorder.js"];
  const files = ["manifest.json", "service-worker.js", "arcigy-content.js", "supplier-content.js", "sidepanel.html"];
  const assetsDir = path.join(outDir, "assets");
  try {
    const { readdir } = await import("node:fs/promises");
    files.push(...(await readdir(assetsDir)).map((file) => path.join("assets", file)));
  } catch {
    // Vite can emit no assets for a future minimal production panel.
  }
  for (const file of files) {
    const text = await readFile(path.join(outDir, file), "utf8");
    const match = forbidden.find((needle) => text.toLowerCase().includes(needle.toLowerCase()));
    if (match) throw new Error(`Production extension contains forbidden debug marker "${match}" in ${file}.`);
  }
}

const readme = path.join(extensionRoot, "README.md");
if (debug) {
  try { await cp(readme, path.join(outDir, "README.md")); } catch { /* README is added by the feature slice. */ }
}
console.log(JSON.stringify({ ok: true, mode: buildMode, outDir, arcigyOrigins }));
