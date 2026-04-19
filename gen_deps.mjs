import fs from 'fs';
import path from 'path';

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getFiles('./src');
const result = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  
  // Extract imports
  // Matches: import { A, B } from './foo' OR import A from './foo' OR import * as A from './foo'
  const importRegex = /import\s+(?:(?:\{([^}]+)\})|([^\s{]+)|\*\s+as\s+([^\s{]+))\s+from\s+['"]([^'"]+)['"]/g;
  const localImports = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    let importedItems = [];
    if (match[1]) importedItems = match[1].split(',').map(s => s.replace(/ as .*/, '').trim()).filter(Boolean);
    else if (match[2]) importedItems = [match[2].trim()];
    else if (match[3]) importedItems = [match[3].trim()];
    
    const source = match[4];
    if (source.startsWith('.')) {
      localImports.push({ source, items: importedItems });
    }
  }

  // Extract type imports (import type ...)
  const importTypeRegex = /import\s+type\s+(?:(?:\{([^}]+)\})|([^\s{]+))\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importTypeRegex.exec(content)) !== null) {
    let importedItems = [];
    if (match[1]) importedItems = match[1].split(',').map(s => s.replace(/ as .*/, '').trim()).filter(Boolean);
    else if (match[2]) importedItems = [match[2].trim()];
    
    const source = match[3];
    if (source.startsWith('.')) {
      localImports.push({ source, items: importedItems });
    }
  }

  // Extract exports
  const exportRegex = /export\s+(?:(?:const|let|var|function|class|interface|type|async\s+function)\s+([a-zA-Z0-9_]+)|\{([^}]+)\}|default\s+([a-zA-Z0-9_]+))/g;
  const exportsSet = new Set();
  while ((match = exportRegex.exec(content)) !== null) {
    if (match[1]) exportsSet.add(match[1]);
    else if (match[2]) {
        match[2].split(',').map(s => s.replace(/.* as /, '').trim()).filter(Boolean).forEach(e => exportsSet.add(e));
    }
    else if (match[3]) exportsSet.add('default');
  }

  result.push({
    filename: file.replace(/\\/g, '/'),
    exports: Array.from(exportsSet),
    imports: localImports
  });
});

let output = '';
result.forEach(r => {
    output += `\n### \`${r.filename}\`\n`;
    output += `- **Exports**: ${r.exports.length ? r.exports.join(', ') : '(none)'}\n`;
    if (r.imports.length) {
        output += `- **Local Imports**:\n`;
        r.imports.forEach(i => {
            output += `  - \`${i.source}\`: ${i.items.join(', ')}\n`;
        });
    } else {
        output += `- **Local Imports**: (none)\n`;
    }
});

fs.writeFileSync('dep_map.md', output.trim());
console.log('Done!');
