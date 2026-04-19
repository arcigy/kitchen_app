const fs = require('fs');
let code = fs.readFileSync('src/app.ts', 'utf8');

code = code.replace(/addEventListener\("contextmenu", \(ev\) => {/g, 'addEventListener("contextmenu", (ev: any) => {');
code = code.replace(/addEventListener\("dblclick", \(ev\) => {/g, 'addEventListener("dblclick", (ev: any) => {');
code = code.replace(/addEventListener\("pointerup", \(ev\) => {/g, 'addEventListener("pointerup", (ev: any) => {');
code = code.replace(/root\.traverse\(\(o\) => {/g, 'root.traverse((o: any) => {');
code = code.replace(/mesh\.material = mat\.clone\(\);/g, 'mesh.material = (mat as any).clone();');

fs.writeFileSync('src/app.ts', code);
console.log('Fixed any types');
