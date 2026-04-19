const fs = require('fs');
const content = fs.readFileSync('src/app.ts', 'utf8');
const lines = content.split('\n');

const totalLines = lines.length;

let result = 'Total line count: ' + totalLines + '\n\n';

result += 'Top-level imports:\n';
const imports = {};
let currentImport = [];
let isImport = false;
for (const line of lines) {
  if (line.startsWith('import ')) {
    isImport = true;
    currentImport = [line];
  } else if (isImport) {
    currentImport.push(line);
  }
  
  if (isImport && line.includes(';')) {
    isImport = false;
    const fullImport = currentImport.join('\n');
    const m = fullImport.match(/from\s+["']([^"']+)["']/);
    if (m) {
      const from = m[1];
      if (!imports[from]) imports[from] = [];
      imports[from].push(fullImport.trim());
    }
  }
}
for (const [from, stmts] of Object.entries(imports)) {
  result += '- from "' + from + '":\n';
  for (const s of stmts) {
    result += '  ' + s.split('\n').join('\n  ') + '\n';
  }
}
result += '\n';

const startAppIdx = lines.findIndex(l => l.includes('export function startApp('));

result += 'State variables at top level of startApp():\n';
let i = startAppIdx + 1;
let braceCount = 1;
while (i < lines.length && braceCount > 0) {
  const line = lines[i].trim();
  
  if (line.includes('{')) braceCount += (line.match(/\{/g) || []).length;
  if (line.includes('}')) braceCount -= (line.match(/\}/g) || []).length;
  
  if (braceCount === 1) {
    let m = line.match(/^(?:let|const)\s+([a-zA-Z0-9_]+)(?:\s*:\s*([^=]+))?\s*=/);
    if (m) {
       result += m[1] + ' : ' + (m[2] ? m[2].trim() : '(inferred)') + '\n';
    }
  }
  i++;
}

result += '\nFunctions defined inside startApp():\n';
i = startAppIdx + 1;
braceCount = 1;
let functions = [];
while (i < lines.length && braceCount > 0) {
  const line = lines[i];
  const tLine = line.trim();
  
  let beforeBraceCount = braceCount;
  if (line.includes('{')) braceCount += (line.match(/\{/g) || []).length;
  if (line.includes('}')) braceCount -= (line.match(/\}/g) || []).length;
  
  if (beforeBraceCount === 1) {
    // try to find const foo = (args) => { or function foo() {
    let m = line.match(/^\s*(?:const|let)\s+([a-zA-Z0-9_]+)\s*=\s*(?:\(.*?\)|[a-zA-Z0-9_]+)\s*=>/);
    let m2 = line.match(/^\s*function\s+([a-zA-Z0-9_]+)\s*\(/);
    
    if (m || m2) {
       const name = m ? m[1] : m2[1];
       functions.push({ name, start: i, end: -1, startBrace: braceCount, beforeStartBrace: beforeBraceCount });
    }
  }
  
  for (const fn of functions) {
    if (fn.end === -1 && braceCount === fn.beforeStartBrace) {
      fn.end = i;
    }
  }
  
  i++;
}

for (const fn of functions) {
  if (fn.end === -1) fn.end = lines.length;
  result += fn.name + ' (~' + (fn.end - fn.start + 1) + ' lines)\n';
}

result += '\nEvent handlers:\n';
i = startAppIdx + 1;
braceCount = 1;
let events = [];
while (i < lines.length && braceCount > 0) {
  const line = lines[i];
  
  let beforeBraceCount = braceCount;
  if (line.includes('{')) braceCount += (line.match(/\{/g) || []).length;
  if (line.includes('}')) braceCount -= (line.match(/\}/g) || []).length;
  
  let m = line.match(/\.addEventListener\s*\(\s*["']([^"']+)["']/);
  if (m) {
    events.push({ event: m[1], start: i, end: -1, startBrace: braceCount, beforeStartBrace: beforeBraceCount });
  }
  
  for (const ev of events) {
    if (ev.end === -1 && braceCount < ev.startBrace) {
      ev.end = i;
    }
  }
  i++;
}

for (const ev of events) {
  if (ev.end === -1) ev.end = lines.length;
  result += 'Event "' + ev.event + '" (~' + (ev.end - ev.start + 1) + ' lines)\n';
}

fs.writeFileSync('app-info-output.txt', result);
console.log('done');
