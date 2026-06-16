'use strict';
/*
 * نظام إدارة ورديات الدكاتره والممرضين
 * خادم HTTP بسيط بدون أي مكتبات خارجية (Node.js فقط).
 *
 * التشغيل:  node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

db.load();

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.woff2': 'font/woff2',
};
const TEXT_EXT = new Set(['.html', '.css', '.js', '.json', '.svg']);

const reMonth = /^\d{4}-(0[1-9]|1[0-2])$/;
const reDate = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function serveFile(res, name) {
  const file = path.join(PUBLIC_DIR, name);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    const type = (MIME[ext] || 'application/octet-stream') + (TEXT_EXT.has(ext) ? '; charset=utf-8' : '');
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function serveStatic(res, pathname) {
  const safe = path.normalize(pathname).replace(/^([\\/]|\.\.)+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    const type = (MIME[ext] || 'application/octet-stream') + (TEXT_EXT.has(ext) ? '; charset=utf-8' : '');
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new Error('too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || ('localhost:' + PORT);
  return proto + '://' + host;
}

function staffLink(req, token) { return baseUrl(req) + '/s/' + token; }

async function handleApi(req, res, pathname, query) {
  const method = req.method;
  let body = {};
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    try { body = await readBody(req); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
  }
  const token = query.token || body.token;

  /* ===== واجهة الموظف ===== */
  if (pathname === '/api/me' && method === 'GET') {
    const s = db.findStaffByToken(token);
    if (!s) return send(res, 404, { error: 'invalid_link' });
    if (!reMonth.test(query.month)) return send(res, 400, { error: 'month' });
    return send(res, 200, {
      staff: { name: s.name, role: s.role },
      month: query.month,
      selected: db.staffShifts(s.id, query.month),
    });
  }
  if (pathname === '/api/me/shifts' && method === 'POST') {
    const s = db.findStaffByToken(token);
    if (!s) return send(res, 404, { error: 'invalid_link' });
    if (!reMonth.test(body.month)) return send(res, 400, { error: 'month' });
    const dates = Array.isArray(body.dates) ? body.dates.filter(d => reDate.test(d)) : [];
    const count = db.setMonthShifts(s.id, body.month, dates);
    return send(res, 200, { ok: true, count });
  }

  /* ===== واجهة المدير ===== */
  if (pathname.startsWith('/api/admin/')) {
    if (token !== db.getState().adminToken) return send(res, 403, { error: 'forbidden' });
    const sub = pathname.slice('/api/admin/'.length);

    if (sub === 'overview' && method === 'GET') {
      if (!reMonth.test(query.month)) return send(res, 400, { error: 'month' });
      const staff = db.getState().staff.map(s => ({
        id: s.id, name: s.name, role: s.role, phone: s.phone || '',
        token: s.token, link: staffLink(req, s.token),
        days: db.staffShifts(s.id, query.month),
      }));
      return send(res, 200, { month: query.month, staff });
    }
    if (sub === 'staff' && method === 'POST') {
      if (!body.name || !String(body.name).trim()) return send(res, 400, { error: 'name' });
      const s = db.addStaff({ name: body.name, role: body.role, phone: body.phone });
      return send(res, 200, {
        staff: { id: s.id, name: s.name, role: s.role, phone: s.phone, token: s.token, link: staffLink(req, s.token), days: [] },
      });
    }
    if (sub === 'staff' && method === 'PUT') {
      const s = db.updateStaff(body.id, { name: body.name, role: body.role, phone: body.phone });
      if (!s) return send(res, 404, { error: 'not_found' });
      return send(res, 200, { ok: true });
    }
    if (sub === 'staff' && method === 'DELETE') {
      const ok = db.removeStaff(body.id);
      return send(res, ok ? 200 : 404, { ok });
    }
    if (sub === 'toggle' && method === 'POST') {
      if (!db.findStaff(body.staffId)) return send(res, 404, { error: 'staff' });
      if (!reDate.test(body.date)) return send(res, 400, { error: 'date' });
      const active = db.toggleShift(body.staffId, body.date);
      return send(res, 200, { ok: true, active });
    }
  }

  return send(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname;
  try { pathname = decodeURIComponent(parsed.pathname); } catch { pathname = parsed.pathname; }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, parsed.query).catch((e) => {
      console.error(e);
      send(res, 500, { error: 'server_error' });
    });
    return;
  }

  if (req.method === 'GET') {
    if (pathname === '/') return serveFile(res, 'index.html');
    if (pathname.startsWith('/s/')) return serveFile(res, 'staff.html');
    if (pathname.startsWith('/admin/')) return serveFile(res, 'admin.html');
    return serveStatic(res, pathname);
  }
  res.writeHead(405); res.end('Method not allowed');
});

server.listen(PORT, () => printStartup(db.getState().adminToken));

function lanIps() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function printStartup(adminToken) {
  const line = '─'.repeat(64);
  console.log('\n' + line);
  console.log('  ✅  מערכת ניהול המשמרות פועלת כעת');
  console.log(line);
  console.log('\n  🔗  לוח ניהול (מנהל) — פתח ושמור את הקישור הזה:\n');
  console.log('      http://localhost:' + PORT + '/admin/' + adminToken);
  const ips = lanIps();
  if (ips.length) {
    console.log('\n  📱  לכניסה ממכשיר אחר באותה רשת Wi-Fi:\n');
    for (const ip of ips) console.log('      http://' + ip + ':' + PORT + '/admin/' + adminToken);
  }
  console.log('\n  ⚠️   הקישור הזה סודי — כל מי שיש לו אותו יכול לנהל את התוכנה. אל תשתף אותו.');
  console.log('\n  (לעצירת השרת: הקש Ctrl + C)');
  console.log(line + '\n');
}
