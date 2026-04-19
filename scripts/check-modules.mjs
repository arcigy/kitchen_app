import fs from 'fs';
import path from 'path';

const modules = [
    'drawerLow',
    'nestedDrawerLow',
    'shelves',
    'cornerShelfLower',
    'fridgeTall',
    'flapShelvesLow',
    'swingShelvesLow',
    'ovenBaseLow',
    'microwaveOvenTall',
    'topDrawersDoorsLow'
];

const base = 'src/modules';
let allOk = true;
for (const mod of modules) {
    const dir = path.join(base, mod);
    const files = ['geometry.ts', 'controls.ts', 'types.ts'];
    const missing = files.filter(f => !fs.existsSync(path.join(dir, f)));
    if (missing.length === 0) {
        console.log(`✓ ${mod}: all files present`);
    } else {
        console.log(`✗ ${mod}: missing ${missing.join(', ')}`);
        allOk = false;
    }
}

process.exit(allOk ? 0 : 1);