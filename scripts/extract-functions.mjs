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
const functions = [];
let currentFunction = null;
let funcStartLine = 0;
let inFunction = false;

for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    // Update brace depth
    for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
    }
    // If we exit startApp (braceDepth becomes 0 after the opening brace), stop
    if (braceDepth === 0 && i > startLine) {
        break;
    }
    // Inside startApp (braceDepth >= 1)
    const trimmed = line.trim();
    // Detect function declaration (function name(...) {)
    const funcMatch = trimmed.match(/^function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (funcMatch && braceDepth === 1) {
        // Start of a new function
        if (currentFunction) {
            // End previous function
            currentFunction.lineCount = i - funcStartLine;
            functions.push(currentFunction);
        }
        currentFunction = { name: funcMatch[1], startLine: i + 1, lineCount: 0 };
        funcStartLine = i;
        inFunction = true;
    }
    // Detect arrow function assigned to const/let (const name = (...)=> {)
    const arrowMatch = trimmed.match(/^(const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{/);
    if (arrowMatch && braceDepth === 1) {
        if (currentFunction) {
            currentFunction.lineCount = i - funcStartLine;
            functions.push(currentFunction);
        }
        currentFunction = { name: arrowMatch[2], startLine: i + 1, lineCount: 0, type: 'arrow' };
        funcStartLine = i;
        inFunction = true;
    }
    // If we are inside a function and we encounter a closing brace that matches the function's opening brace?
    // We'll handle later.
}

// Add last function if any
if (currentFunction) {
    // Estimate line count as difference between startLine and the line where braceDepth goes back to 1? Too complex.
    // For now, we'll just set a placeholder.
    currentFunction.lineCount = 0;
    functions.push(currentFunction);
}

console.log('Functions defined inside startApp():');
for (const f of functions) {
    console.log(`- ${f.name} (starts at line ${f.startLine})`);
}
console.log(`Total: ${functions.length}`);