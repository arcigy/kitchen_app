import fs from 'fs';

const content = fs.readFileSync('src/app.ts', 'utf8');
const lines = content.split('\n');

// Find startApp line
let startLine = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export function startApp(args: AppArgs)')) {
        startLine = i;
        break;
    }
}
if (startLine === -1) throw new Error('startApp not found');

let braceDepth = 0;
let inFunctionDepth = 0;
const variables = [];

for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    // Update brace depth
    for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
    }
    // If we exit startApp (braceDepth becomes 0 after the opening brace), stop
    if (braceDepth === 0 && i > startLine) {
        // We've reached the closing brace of startApp
        break;
    }
    // Only consider top-level inside startApp (braceDepth == 1)
    if (braceDepth === 1) {
        const trimmed = line.trim();
        // Detect function declarations (including arrow functions) to skip
        if (trimmed.startsWith('function ') || (trimmed.includes('=>') && trimmed.includes('='))) {
            // skip
            continue;
        }
        // Match let/const declarations
        const letMatch = trimmed.match(/^\s*let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*([^=]+))?/);
        const constMatch = trimmed.match(/^\s*const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*([^=]+))?/);
        if (letMatch) {
            const [, name, type] = letMatch;
            variables.push({ line: i + 1, name, type: type ? type.trim() : 'any', kind: 'let' });
        } else if (constMatch) {
            const [, name, type] = constMatch;
            variables.push({ line: i + 1, name, type: type ? type.trim() : 'any', kind: 'const' });
        }
    }
}

console.log('Top-level state variables in startApp():');
for (const v of variables) {
    console.log(`- ${v.name}: ${v.type} (${v.kind})`);
}
console.log(`\nTotal: ${variables.length}`);