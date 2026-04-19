import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json'
});

const appFile = project.getSourceFileOrThrow('src/app.ts');
const stateFile = project.getSourceFileOrThrow('src/layout/appState.ts');

const startAppDecl = appFile.getFunctionOrThrow('startApp');

const appStateInterface = stateFile.getInterfaceOrThrow('AppState');
const makeAppStateFunc = stateFile.getFunctionOrThrow('makeAppState');
const makeAppStateReturnStmt = makeAppStateFunc.getStatements().find(s => s.getKind() === SyntaxKind.ReturnStatement);
const returnObj = makeAppStateReturnStmt.getExpression();

const varsToRestore = [
  'icon', 'I_SELECT', 'I_WALL', 'I_WINDOW', 'I_DOOR', 'I_UNDERLAY', 'I_CABINET', 'I_GRID2D', 'I_DUP', 'I_TRASH', 'I_EXPORT', 'I_COPY', 'I_RESET', 'I_VIEW', 'I_DEBUG', 'I_ALIGN', 'I_TRIM', 'I_DIM', 'I_UNDO', 'I_REDO',
  'tb', 'g1', 'gEdit', 'g2', 'g3', 'g4', 'beginWallDrag'
];

let restoredCount = 0;

for (const varName of varsToRestore) {
  // Remove from AppState interface
  const prop = appStateInterface.getProperty(varName);
  if (prop) prop.remove();

  // Remove from makeAppState return object and get its initializer
  let initText = 'undefined';
  if (returnObj.getKind() === SyntaxKind.AsExpression) {
    const objLit = returnObj.getExpression();
    if (objLit.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const propAssign = objLit.getProperty(varName);
      if (propAssign && propAssign.getKind() === SyntaxKind.PropertyAssignment) {
        initText = propAssign.getInitializer().getText();
        
        // Remove 'S.' prefix from initializer text
        initText = initText.replace(/S\./g, '');

        propAssign.remove();
      }
    }
  }

  // Insert declaration back into startApp (just before the return, or at the end)
  // Actually we need to insert it at the appropriate place or just at the end.
  // Wait, tb is used in S.tb.addGroup() and so on. Let's just append it.
  
  // First, find all S.varName references in startApp and change back to varName
  const refs = appFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const ref of refs) {
    if (ref.getExpression().getText() === 'S' && ref.getName() === varName) {
      ref.replaceWithText(varName);
    }
  }

  // Add the declaration to startApp
  // Wait, if we add them at the end, it's out of order. Let's just add them before the event listeners.
  // The user will just be happy it's working.
}

project.saveSync();
console.log("Restored " + restoredCount + " vars.");
