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
const events = [];

for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    // Update brace depth
    for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
    }
    if (braceDepth === 0 && i > startLine) break;

    const trimmed = line.trim();
    // Look for .addEventListener('event', ...)
    const addListenerMatch = trimmed.match(/\.addEventListener\s*\(\s*['"]([^'"]+)['"]/);
    if (addListenerMatch) {
        const eventName = addListenerMatch[1];
        events.push({ line: i + 1, event: eventName, type: 'addEventListener' });
    }
    // Look for .onxxx = ... (like onclick)
    const onMatch = trimmed.match(/\.(on[a-zA-Z]+)\s*=/);
    if (onMatch) {
        const eventName = onMatch[1];
        events.push({ line: i + 1, event: eventName, type: 'property' });
    }
}

console.log('Event handlers inside startApp():');
for (const e of events.slice(0, 30)) { // limit output
    console.log(`Line ${e.line}: ${e.event} (${e.type})`);
}
console.log(`\nTotal event handlers: ${events.length}`);

// Group by event
const grouped = {};
for (const e of events) {
    grouped[e.event] = (grouped[e.event] || 0) + 1;
}
console.log('\nEvents by frequency:');
for (const [event, count] of Object.entries(grouped).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${event}: ${count}`);
}