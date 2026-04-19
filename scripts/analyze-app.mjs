import fs from 'fs';
const content = fs.readFileSync('src/app.ts', 'utf8');

// Find startApp function body
const startMatch = content.match(/export function startApp\(args: AppArgs\)\s*\{/);
if (!startMatch) throw new Error('startApp not found');
let startIdx = startMatch.index + startMatch[0].length;

// Find matching closing brace
let braceCount = 1;
let i = startIdx;
while (i < content.length && braceCount > 0) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    i++;
}
const endIdx = i; // exclusive
const body = content.substring(startIdx, endIdx - 1);

// Parse body for top-level variable declarations
const lines = body.split('\n');
const vars = [];
let depth = 0;
let inFunction = 0;
for (let line of lines) {
    const trimmed = line.trim();
    // Update depth based on braces in line (crude but works)
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    depth += openBraces - closeBraces;
    // Detect function declaration (excluding arrow functions)
    if (trimmed.startsWith('function ') || (trimmed.startsWith('const ') && trimmed.includes('=>'))) {
        inFunction++;
    }
    if (depth === 0 && inFunction === 0) {
        // Check for let/const declarations
        const letMatch = trimmed.match(/^let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*([^=]+))?/);
        const constMatch = trimmed.match(/^const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*([^=]+))?/);
        if (letMatch) {
            const [, name, type] = letMatch;
            vars.push({ name, type: type ? type.trim() : 'any', kind: 'let' });
        } else if (constMatch) {
            const [, name, type] = constMatch;
            vars.push({ name, type: type ? type.trim() : 'any', kind: 'const' });
        }
    }
    // Reduce inFunction when we exit a function? Not needed for simple detection.
}

console.log('Total line count:', content.split('\n').length);
console.log('\nTop-level state variables in startApp():');
for (const v of vars) {
    console.log(`- ${v.name}: ${v.type} (${v.kind})`);
}
console.log(`\nCount: ${vars.length}`);

// Also find functions defined inside startApp
console.log('\nFunctions defined inside startApp():');
const funcs = [];
let funcDepth = 0;
let inFunc = false;
let funcName = '';
let funcStartLine = 0;
for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    // Update depth
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    funcDepth += openBraces - closeBraces;
    // Detect function declaration (function name(params) {)
    const funcMatch = trimmed.match(/^function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (funcMatch && funcDepth === 0) {
        funcName = funcMatch[1];
        funcStartLine = idx + 1; // 1-indexed within body
        inFunc = true;
    }
    // If we entered a function, we could track its end but skip for now.
    // For simplicity, just collect names.
    if (funcMatch && funcDepth === 0) {
        funcs.push({ name: funcName, startLine: funcStartLine });
    }
}
for (const f of funcs) {
    console.log(`- ${f.name} (starts at line ${f.startLine})`);
}
console.log(`\nCount: ${funcs.length}`);

// Event handlers: look for addEventListener calls or assignment of on* properties
console.log('\nEvent handlers (approximate):');
const handlers = [];
for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.includes('.addEventListener(') || line.includes('.on')) {
        handlers.push({ line: idx + 1, content: line.trim() });
    }
}
for (const h of handlers.slice(0, 20)) {
    console.log(`Line ${h.line}: ${h.content}`);
}
console.log(`\nTotal event handlers found: ${handlers.length}`);