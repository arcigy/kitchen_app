const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('window.onerror')) {
  html = html.replace('<head>', '<head><script>window.onerror = function(m, s, l, c, e) { alert("ERR: " + m + " at " + l + ":" + c); };</script>');
  fs.writeFileSync('index.html', html);
}
