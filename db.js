'use strict';
/*
 * طبقة تخزين بسيطة بملف JSON (بدون أي مكتبات خارجية).
 * كل البيانات تُحمّل في الذاكرة عند التشغيل، وتُحفظ على القرص بكتابة ذرّية (atomic)
 * عند أي تعديل لتجنّب تلف الملف.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let state = { adminToken: null, staff: [], shifts: [] };

function newToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}
function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE); // كتابة ذرّية
}

function load() {
  try {
    if (fs.existsSync(DB_FILE)) state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('⚠️  קריאת מסד הנתונים נכשלה, מתחילים עם מסד חדש:', e.message);
    state = { adminToken: null, staff: [], shifts: [] };
  }
  let changed = false;
  // السماح بتحديد توكن الإدارة عبر متغيّر بيئة (مفيد عند النشر على سيرفر)
  if (process.env.ADMIN_TOKEN) {
    if (state.adminToken !== process.env.ADMIN_TOKEN) { state.adminToken = process.env.ADMIN_TOKEN; changed = true; }
  } else if (!state.adminToken) { state.adminToken = newToken(24); changed = true; }
  if (!Array.isArray(state.staff)) { state.staff = []; changed = true; }
  if (!Array.isArray(state.shifts)) { state.shifts = []; changed = true; }
  // بيانات تجريبية للعرض (تُفعّل بـ SEED_DEMO=1) لتظهر اللوحة معبّأة عند أول نشر
  if (process.env.SEED_DEMO && state.staff.length === 0) { seedDemo(); changed = true; }
  if (changed) save();
  return state;
}

function seedDemo() {
  const d = new Date();
  const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const mk = (name, role, days) => {
    const s = { id: newId(), name, role, phone: '', token: newToken(12), createdAt: new Date().toISOString() };
    state.staff.push(s);
    for (const day of days) state.shifts.push({ staffId: s.id, date: ym + '-' + String(day).padStart(2, '0') });
  };
  mk('ד״ר דוגמה', 'doctor', [2, 3, 9, 10, 16, 17, 23, 24]);
  mk('אחות דוגמה', 'nurse', [4, 5, 11, 12, 18, 19, 25, 26]);
}

function getState() { return state; }

/* ===== الموظفون ===== */
function findStaffByToken(token) {
  if (!token) return null;
  return state.staff.find(s => s.token === token) || null;
}
function findStaff(id) {
  return state.staff.find(s => s.id === id) || null;
}
function cleanPhone(p) {
  return (p == null ? '' : String(p)).replace(/[^\d]/g, '').slice(0, 20);
}
function addStaff({ name, role, phone }) {
  const s = {
    id: newId(),
    name: String(name || '').trim().slice(0, 80),
    role: role === 'nurse' ? 'nurse' : 'doctor',
    phone: cleanPhone(phone),
    token: newToken(12),
    createdAt: new Date().toISOString(),
  };
  state.staff.push(s);
  save();
  return s;
}
function updateStaff(id, patch) {
  const s = findStaff(id);
  if (!s) return null;
  if (patch.name != null) s.name = String(patch.name).trim().slice(0, 80);
  if (patch.role != null) s.role = patch.role === 'nurse' ? 'nurse' : 'doctor';
  if (patch.phone != null) s.phone = cleanPhone(patch.phone);
  save();
  return s;
}
function removeStaff(id) {
  const i = state.staff.findIndex(s => s.id === id);
  if (i === -1) return false;
  state.staff.splice(i, 1);
  state.shifts = state.shifts.filter(sh => sh.staffId !== id);
  save();
  return true;
}

/* ===== الورديات (يوم لكل موظف) ===== */
function monthOf(date) { return date.slice(0, 7); } // "YYYY-MM-DD" -> "YYYY-MM"

function toggleShift(staffId, date) {
  const i = state.shifts.findIndex(sh => sh.staffId === staffId && sh.date === date);
  if (i === -1) { state.shifts.push({ staffId, date }); save(); return true; }
  state.shifts.splice(i, 1);
  save();
  return false;
}
function setMonthShifts(staffId, month, dates) {
  // استبدال كل ورديات هذا الموظف ضمن هذا الشهر بالقائمة الجديدة
  state.shifts = state.shifts.filter(sh => !(sh.staffId === staffId && monthOf(sh.date) === month));
  const uniq = Array.from(new Set(dates)).filter(d => monthOf(d) === month);
  for (const d of uniq) state.shifts.push({ staffId, date: d });
  save();
  return uniq.length;
}
function staffShifts(staffId, month) {
  return state.shifts
    .filter(sh => sh.staffId === staffId && monthOf(sh.date) === month)
    .map(sh => sh.date)
    .sort();
}

module.exports = {
  load, save, getState,
  findStaffByToken, findStaff, addStaff, updateStaff, removeStaff,
  toggleShift, setMonthShifts, staffShifts,
};
