import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json'
});

const appFile = project.getSourceFileOrThrow('src/app.ts');
const startAppDecl = appFile.getFunctionOrThrow('startApp');

// Types to remove from app.ts because they are in appState.ts
const typesToRemove = [
  "AppMode", "LayoutTool", "RenderMode", "SelectedKind", "WallId", 
  "WindowParams", "WindowInstance", "WallParams", "WallInstance", 
  "AlignWallLine", "DimensionRef", "DimensionParams", "DimensionInstance", 
  "LayoutInstance", "AlignPickedLine"
];

for (const typeName of typesToRemove) {
  let found = false;
  for (const stmt of startAppDecl.getStatements()) {
    if (stmt.getKind() === SyntaxKind.TypeAliasDeclaration) {
      if (stmt.getName() === typeName) {
        stmt.remove();
        found = true;
        break;
      }
    }
  }
}

appFile.addImportDeclaration({
  namedImports: typesToRemove,
  moduleSpecifier: "./layout/appState",
  isTypeOnly: true
});

project.saveSync();
console.log('Types cleaned up');
