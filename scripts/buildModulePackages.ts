import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { packModulePackage, buildModulePackageFromSourceTemplate } from "../src/core/module-package/module-file-codec";
import { systemModulePackageTemplates } from "../src/system/module-packages";

const outputDir = path.resolve(process.cwd(), process.argv[2] ?? "dist/module-packages");

await mkdir(outputDir, { recursive: true });

for (const modulePackage of systemModulePackageTemplates) {
  const fileName = `${modulePackage.module.modulePackageId}.fqm`;
  const payload = buildModulePackageFromSourceTemplate(modulePackage);
  await writeFile(path.join(outputDir, fileName), packModulePackage(payload), "utf-8");
}

console.log(`Built ${systemModulePackageTemplates.length} .fqm packages in ${outputDir}`);
