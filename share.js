'use strict';
/*
 * ينشئ رابطاً عاماً مؤقتاً (cloudflared) ويطبع الروابط الكاملة جاهزة للنسخ.
 * يُستدعى من demo-link.bat بعد تشغيل الخادم.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const DB = path.join(__dirname, 'data', 'db.json');

function buildLinks(base) {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const L = [];
  L.push('');
  L.push('================  PUBLIC LINKS (copy & send)  ================');
  L.push('');
  L.push('[ DASHBOARD ] manager only - do NOT share with staff:');
  L.push('   ' + base + '/admin/' + db.adminToken);
  L.push('');
  L.push('[ STAFF LINKS ] send each person their own link:');
  for (const s of db.staff) {
    const role = s.role === 'nurse' ? 'nurse' : 'doctor';
    L.push('   - ' + s.name + ' (' + role + '):');
    L.push('     ' + base + '/s/' + s.token);
  }
  L.push('');
  L.push('=============================================================');
  L.push('Keep THIS window and the SERVER window open during the demo.');
  L.push('To end: close both windows.');
  L.push('');
  return L.join('\n');
}

console.log('Creating public link... (first run downloads a small tool, please wait)');

const cf = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', 'http://localhost:3000'], { shell: true });
let printed = false;

function scan(buf) {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !printed) {
    printed = true;
    try { console.log(buildLinks(m[0])); }
    catch (e) { console.log('\nPublic address: ' + m[0] + '\n(open the SERVER window to see the admin token)'); }
  }
}

cf.stdout.on('data', scan);
cf.stderr.on('data', scan);
cf.on('close', () => console.log('\n(public link closed)'));
process.on('SIGINT', () => { cf.kill(); process.exit(0); });
