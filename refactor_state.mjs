import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json'
});

const appFile = project.getSourceFile('src/app.ts');
if (!appFile) throw new Error('src/app.ts not found');

const startAppDecl = appFile.getFunction('startApp');
if (!startAppDecl) throw new Error('startApp not found');

const stateVars = [];

// Find all top-level let/const declarations inside startApp
for (const stmt of startAppDecl.getStatements()) {
  if (stmt.getKind() === SyntaxKind.VariableStatement) {
    const declList = stmt.getDeclarationList();
    for (const decl of declList.getDeclarations()) {
      const name = decl.getName();
      // Skip ENABLE_SSGI, ENABLE_PHOTO, copyM16, matrixChanged, hiddenParts, cam, ctl and other functions/constants
      if (['ENABLE_SSGI', 'ENABLE_PHOTO', 'cam', 'ctl', 'copyM16', 'matrixChanged', 'hiddenParts'].includes(name)) continue;
      
      const initializer = decl.getInitializer();
      if (initializer && (initializer.getKind() === SyntaxKind.ArrowFunction || initializer.getKind() === SyntaxKind.FunctionExpression)) continue;
      
      const typeNode = decl.getTypeNode();
      const typeStr = typeNode ? typeNode.getText() : decl.getType().getText(decl);
      
      // Attempt to capture initialization text
      const initText = initializer ? initializer.getText() : 'undefined';
      
      stateVars.push({ name, typeStr, initText, stmt, decl });
    }
  }
}

// Generate src/layout/appState.ts
let appStateContent = `import * as THREE from "three";
import type { ModuleParams } from "../model/cabinetTypes";
import type { SsgiPipeline } from "../rendering/ssgiPipeline";
import type { PhotoPathTracer } from "../rendering/photoPathTracer";
import type { LayoutTool, AppMode, RenderMode, SelectedKind, WallId, WindowParams, WindowInstance, WallParams, WallInstance, DimensionRef, DimensionParams, DimensionInstance, LayoutInstance } from "./types"; // Adjust imports later

export interface AppState {
`;

for (const v of stateVars) {
  let safeType = v.typeStr;
  if (safeType.includes("typeof ")) {
     safeType = "any"; // Fallback for inferred complex types
  }
  appStateContent += `  ${v.name}: ${safeType};\n`;
}
appStateContent += `}\n\n`;

appStateContent += `export function makeAppState(args: AppArgs): AppState {\n  return {\n`;
for (const v of stateVars) {
  appStateContent += `    ${v.name}: ${v.initText},\n`;
}
appStateContent += `  };\n}\n`;

fs.writeFileSync('src/layout/appState.ts', appStateContent);

// Now rewrite references in src/app.ts
for (const v of stateVars) {
  // Find all references to v.decl
  const refs = v.decl.findReferencesAsNodes();
  for (const ref of refs) {
    // Only replace if it's an Identifier
    if (ref.getKind() === SyntaxKind.Identifier) {
       // Avoid renaming the declaration itself or object property assignments like { mode }
       const parent = ref.getParent();
       if (parent.getKind() !== SyntaxKind.VariableDeclaration && parent.getKind() !== SyntaxKind.PropertyAssignment) {
         ref.replaceWithText(`S.${v.name}`);
       }
    }
  }
  // Remove original declaration
  v.decl.remove();
}

appFile.saveSync();
console.log('Refactoring complete');
