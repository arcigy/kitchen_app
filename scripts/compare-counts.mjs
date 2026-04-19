import fs from 'fs';

// Read appState.ts
const appStateContent = fs.readFileSync('src/layout/appState.ts', 'utf8');
// Extract interface AppState block
const interfaceMatch = appStateContent.match(/export interface AppState\s*\{([^}]+)\}/s);
if (!interfaceMatch) throw new Error('AppState interface not found');
const interfaceBody = interfaceMatch[1];
// Extract field names (lines that contain a colon before a type)
const fieldNames = [];
const lines = interfaceBody.split('\n');
for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('//')) continue;
    // Match field name before colon
    const match = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
    if (match) {
        fieldNames.push(match[1]);
    }
}
console.log('AppState fields count:', fieldNames.length);
console.log('Fields:', fieldNames);

// Read app.ts and extract top-level variables inside startApp (using previous extraction logic)
const appContent = fs.readFileSync('src/app.ts', 'utf8');
const startMatch = appContent.match(/export function startApp\(args: AppArgs\)\s*\{/);
if (!startMatch) throw new Error('startApp not found');
let startIdx = startMatch.index + startMatch[0].length;
let braceCount = 1;
let i = startIdx;
while (i < appContent.length && braceCount > 0) {
    if (appContent[i] === '{') braceCount++;
    if (appContent[i] === '}') braceCount--;
    i++;
}
const endIdx = i;
const body = appContent.substring(startIdx, endIdx - 1);

// Extract let/const variable names (simplistic)
const varNames = [];
const bodyLines = body.split('\n');
let depth = 0;
for (const line of bodyLines) {
    const trimmed = line.trim();
    // Update depth based on braces
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (depth === 0) {
        const letMatch = trimmed.match(/^let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        const constMatch = trimmed.match(/^const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (letMatch) varNames.push(letMatch[1]);
        if (constMatch) varNames.push(constMatch[1]);
    }
}
console.log('App.ts top-level variables count:', varNames.length);
console.log('Variables:', varNames);

// Compute difference
const appStateSet = new Set(fieldNames);
const varSet = new Set(varNames);
const notInAppState = [...varSet].filter(v => !appStateSet.has(v));
const notInVars = [...appStateSet].filter(v => !varSet.has(v));
console.log('\nVariables in app.ts but NOT in AppState:', notInAppState.length);
console.log(notInAppState);
console.log('\nVariables in AppState but NOT in app.ts:', notInVars.length);
console.log(notInVars);