const fs = require('fs');
const content = fs.readFileSync('js/app-part3.js', 'utf8');
const lines = content.split('\n');

let braceCount = 0;
let braceStack = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') {
            braceCount++;
            braceStack.push({line: i + 1, pos: j, type: 'open'});
        }
        if (line[j] === '}') {
            braceCount--;
            braceStack.push({line: i + 1, pos: j, type: 'close'});
        }
    }
}

console.log('=== FINAL ANALYSIS ===');
console.log('Final brace balance:', braceCount);
console.log('Missing closing braces: ' + braceCount);
console.log('\n=== LAST 50 LINES OF FILE ===');
for (let i = Math.max(0, lines.length - 50); i < lines.length; i++) {
    console.log((i + 1) + ': ' + lines[i]);
}
