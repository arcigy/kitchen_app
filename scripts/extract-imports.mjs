import fs from 'fs';

const content = fs.readFileSync('src/app.ts', 'utf8');
const lines = content.split('\n');

const imports = [];
let inImport = false;
let currentImport = null;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ')) {
        // Single-line import
        imports.push(line);
    } else if (line.startsWith('import {')) {
        // Multi-line import may continue across lines
        let importBlock = line;
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('} from')) {
            importBlock += ' ' + lines[j].trim();
            j++;
        }
        if (j < lines.length) {
            importBlock += ' ' + lines[j].trim();
            imports.push(importBlock);
            i = j;
        } else {
            imports.push(line);
        }
    }
}

console.log('Imports grouped by source:');
const grouped = {};
for (const imp of imports) {
    // Extract module specifier (after 'from')
    const match = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (match) {
        const module = match[1];
        if (!grouped[module]) grouped[module] = [];
        grouped[module].push(imp);
    } else {
        // default import like import * as THREE from "three"
        const match2 = imp.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (match2) {
            const module = match2[1];
            if (!grouped[module]) grouped[module] = [];
            grouped[module].push(imp);
        } else {
            // side-effect import
            if (!grouped['side-effect']) grouped['side-effect'] = [];
            grouped['side-effect'].push(imp);
        }
    }
}

for (const [module, list] of Object.entries(grouped)) {
    console.log(`\nFrom "${module}":`);
    for (const imp of list) {
        console.log(`  ${imp}`);
    }
}
console.log(`\nTotal import statements: ${imports.length}`);