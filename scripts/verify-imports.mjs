import fs from 'fs';
import path from 'path';

const appTs = fs.readFileSync('src/app.ts', 'utf8');
const importRegex = /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
const imports = [];
let match;
while ((match = importRegex.exec(appTs)) !== null) {
    imports.push(match[1]);
}

console.log('Found imports:', imports);

const baseDir = '.';
let allExist = true;
for (const imp of imports) {
    if (imp.startsWith('.')) {
        // relative import
        const ext = path.extname(imp);
        let tryPath = imp;
        if (!ext) {
            // try with .ts extension
            if (fs.existsSync(path.join(baseDir, imp + '.ts'))) {
                tryPath = imp + '.ts';
            } else if (fs.existsSync(path.join(baseDir, imp + '/index.ts'))) {
                tryPath = imp + '/index.ts';
            } else {
                // maybe it's a directory with package.json? ignore
            }
        }
        const fullPath = path.join(baseDir, tryPath);
        if (fs.existsSync(fullPath) || fs.existsSync(fullPath + '.ts')) {
            console.log(`✓ ${imp} -> ${fullPath}`);
        } else {
            console.log(`✗ ${imp} -> NOT FOUND`);
            allExist = false;
        }
    } else {
        // external package, assume exists
        console.log(`✓ ${imp} (external)`);
    }
}

process.exit(allExist ? 0 : 1);