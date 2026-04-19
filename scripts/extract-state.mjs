import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json'
});

const appFile = project.getSourceFileOrThrow('src/app.ts');
const stateFile = project.getSourceFileOrThrow('src/layout/appState.ts');

const startAppDecl = appFile.getFunctionOrThrow('startApp');

const varsToExtract = [
  'mode', 'viewMode', 'renderMode', 'ssgi', 'ssgiCameraUuid', 'photo', 'photoCameraUuid', 'photoLastLightingRevision',
  'walls', 'wallCounter', 'wallPlanUnionMesh', 'wallDebugEnabled', 'wallSolvedJoinPolys', 'wallUnionPolys',
  'instances', 'instanceCounter', 'params',
  'layoutTool', 'selectedKind', 'selectedInstanceId', 'selectedWallId', 'selectedDimensionId', 'windowInst', 'selectedMesh', 'selectedBox', 'overlapBoxes', 'cabinetGroup', 'grainArrow',
  'dimensions', 'dimensionCounter',
  'undoBtnEl', 'redoBtnEl', 'underlayStatusEl', 'underlayScaleEl', 'underlayOffXEl', 'underlayOffZEl', 'underlayRotEl', 'underlayOpacityEl'
];

let extractedCount = 0;

for (const varName of varsToExtract) {
  let foundDecl = null;

  for (const stmt of startAppDecl.getStatements()) {
    if (stmt.getKind() === SyntaxKind.VariableStatement) {
      for (const decl of stmt.getDeclarationList().getDeclarations()) {
        if (decl.getName() === varName) {
          foundDecl = decl;
          break;
        }
      }
    }
    if (foundDecl) break;
  }

  if (!foundDecl) {
    console.log("Could not find var: " + varName);
    continue;
  }

  // Replace references
  const refs = foundDecl.findReferencesAsNodes();
  for (const ref of refs) {
    if (ref.getSourceFile() !== appFile) continue;
    if (ref.getKind() !== SyntaxKind.Identifier) continue;
    
    const parent = ref.getParent();
    if (parent.getKind() === SyntaxKind.VariableDeclaration) continue;
    if (parent.getKind() === SyntaxKind.PropertyAssignment) {
      const propAssign = parent;
      if (propAssign.getName() === varName && propAssign.getInitializer() === ref) {
         ref.replaceWithText(`S.${varName}`);
         continue;
      }
      if (propAssign.getName() === varName && !propAssign.hasInitializer()) {
         propAssign.replaceWithText(`${varName}: S.${varName}`);
         continue;
      }
    }
    if (parent.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
       parent.replaceWithText(`${varName}: S.${varName}`);
       continue;
    }
    
    // Normal replace
    ref.replaceWithText(`S.${varName}`);
  }

  // Remove original declaration
  const varStmt = foundDecl.getParent().getParent();
  if (varStmt.getDeclarations().length === 1) {
    varStmt.remove();
  } else {
    foundDecl.remove();
  }
  
  extractedCount++;
}

appFile.addImportDeclaration({
  namedImports: ["makeAppState"],
  moduleSpecifier: "./layout/appState",
});

project.saveSync();
console.log("Extracted " + extractedCount + " vars.");
