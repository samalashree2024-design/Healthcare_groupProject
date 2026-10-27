'use strict';
// One-time, idempotent code integration for the existing local demo.
// Run only from the Healthcare_groupProject-git repository root.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const serverPath = path.join(root, 'server.js');
const authPath = path.join(root, 'demo_auth.js');
const routePath = path.join(root, 'medication_history_routes.js');
function fail(message) { console.error('ACTIVATION STOPPED:',message); process.exit(1); }
for (const file of [serverPath, authPath, routePath]) {
  if (!fs.existsSync(file)) fail(`Missing ${path.relative(root,file)}. Open the Git repository and extract the ZIP into it.`);
}
const server = fs.readFileSync(serverPath, 'utf8');
const auth = fs.readFileSync(authPath, 'utf8');
const routeLine = `require('./medication_history_routes')(app);`;
let updatedServer = server;
if (!/require\(['"]\.\/medication_history_routes['"]\)\(app\)/.test(server)) {
  const marker = /^(\s*require\(['"]\.\/clinical_demo_routes['"]\)\(app\);[^\S\r\n]*)(\r?\n)/m;
  if (!marker.test(server)) fail("Couldn't find the existing clinical_demo_routes registration in server.js. No files changed.");
  updatedServer = server.replace(marker, `$1$2${routeLine}$2`);
}
let updatedAuth = auth;
if (!auth.includes("path === '/medication-history/check'")) {
  const anchor = /^(\s*if \(path\.startsWith\('\/research\/'\) && role === 'doctor'\) return next\(\);)(\r?\n)/m;
  if (!anchor.test(auth)) fail("Couldn't find the existing doctor research permission in demo_auth.js. No files changed.");
  const insert = [
    `    // Doctor-only, fictional Oracle / de-identified MIMIC timeline checker.`,
    `    if (role === 'doctor' && ((method === 'POST' && path === '/medication-history/check') ||`,
    `        (method === 'GET' && /^\\/medication-history\\/(?:oracle|mimic)\\/[^/]+$/.test(path)))) return next();`
  ].join(auth.includes('\r\n')?'\r\n':'\n');
  updatedAuth = auth.replace(anchor, `$1$2${insert}$2`);
}
// Preflight validates BOTH files before writing either.
if (!/require\(['"]\.\/demo_auth['"]\)\(app\)/.test(updatedServer)) {
  fail('server.js must register demo_auth before the medication routes. No files changed.');
}
if (!/app\.use\('\/api'/.test(updatedAuth)) fail('demo_auth.js API permission middleware not found. No files changed.');
if (updatedServer !== server) fs.writeFileSync(serverPath, updatedServer);
if (updatedAuth !== auth) fs.writeFileSync(authPath, updatedAuth);
console.log('Medication-history routes registered and doctor-only API authorization applied.');
console.log('Files:',updatedServer===server?'server.js already active':'server.js updated',',',updatedAuth===auth?'demo_auth.js already active':'demo_auth.js updated');
console.log('Next: node --test tests/medication_history*.test.js');
