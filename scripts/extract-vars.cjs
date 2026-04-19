const fs = require('fs');
const content = fs.readFileSync('src/app.ts', 'utf8');

// Find start of startApp
const startMatch = content.match(/export function startApp\(args: AppArgs\)\s*\{/);
if (!startMatch) {
    console.error('startApp not found');
    process.exit(1);
}
const startIndex = startMatch.index + startMatch[0].length;
// Find matching closing brace for startApp (simplistic: count braces)
let braceCount = 1;
let i = startIndex;
while (i < content.length && braceCount > 0) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    i++;
}
const endIndex = i; // exclusive

const functionBody = content.substring(startIndex, endIndex - 1); // exclude final '}'

// Extract top-level variable declarations (let/const) that are not inside nested blocks
// Simple approach: split by lines and track indentation? We'll just look for lines that start with let/const after removing leading spaces
const lines = functionBody.split('\n');
const vars = [];
let inBlock = 0;
let inFunction = 0;
for (let line of lines) {
    const trimmed = line.trim();
    // Adjust block level based on braces in line (crude)
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    inBlock += openBraces - closeBraces;
    // Check for function declarations (excluding arrow functions?)
    if (trimmed.startsWith('function ') || trimmed.startsWith('const ') && trimmed.includes('=>')) {
        inFunction++;
    }
    // If we are at top-level (inBlock === 0 and not inside a function), capture let/const
    if (inBlock === 0 && inFunction === 0 && (trimmed.startsWith('let ') || trimmed.startsWith('const '))) {
        // Extract variable name and type (if any)
        const match = trimmed.match(/^(let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*([^=]+))?/);
        if (match) {
            const [, kind, name, type] = match;
            vars.push({ name, type: type ? type.trim() : 'any', kind });
        }
    }
    // Reduce function count when we see a closing brace that matches a function? Not reliable.
}

console.log('Top-level state variables:');
vars.forEach(v => console.log(`- ${v.name}: ${v.type}`));
console.log(`Total: ${vars.length}`);