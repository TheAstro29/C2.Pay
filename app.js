/* C2-Pay · ระบบเบิกจ่าย C2 Tech — frontend
 * รอบที่ 1 (2 พ.ย. 2569): เข้าระบบด้วยบัญชี C2-Calendar · สิทธิ์ C2-Pay · ตั้งค่า · เลขบัญชี (ผู้ดูแลเลขบัญชีคนเดียว) · โหมดทดลองใช้
 * ข้อมูลทั้งหมดผ่าน Cloud Function "payApi" (codebase pay) ในโปรเจกต์ c2-calendar-c088f — หน้าเว็บไม่อ่าน/เขียน Firestore ตรง
 */
(() => {
'use strict';

// ===== Firebase (โปรเจกต์เดียวกับ C2-Calendar) =====
const firebaseConfig = {
  apiKey: "AIzaSyBjJLodAV1hkgaxxmgzvccMVAIW5S8hbqw",
  authDomain: "c2-calendar-c088f.firebaseapp.com",
  projectId: "c2-calendar-c088f",
  storageBucket: "c2-calendar-c088f.firebasestorage.app",
  messagingSenderId: "366484323689",
  appId: "1:366484323689:web:cce308b7968a77db3791f8"
};
firebase.initializeApp(firebaseConfig);
const FN = firebase.app().functions('asia-southeast1');
const TOKEN_KEY = 'c2pay_token';
const VERSION = 'v1.0 ทดลองใช้';

// ===== helpers =====
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (n, st = '') => `<span class="ms" ${st}>${n}</span>`;
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const dtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ROLE_LABEL = { admin: 'Admin · ดูแลเงิน', ceo: 'CEO · ดูอย่างเดียว', user: 'User · ขอเบิกของตัวเอง', none: 'ไม่มีสิทธิ์' };
const ROLE_SHORT = { admin: 'Admin', ceo: 'CEO', user: 'User', none: 'ไม่มีสิทธิ์' };
const CLEAR_PHRASE = 'ล้างข้อมูล C2-Pay';

function deviceInfo() {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : '';
  return { type: isMobile ? 'mobile' : 'desktop', label: [os, 'C2-Pay'].filter(Boolean).join(' · ') };
}
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } };

function errMsg(e) {
  const m = (e && e.message) || 'เกิดข้อผิดพลาด';
  if (/internal|INTERNAL/.test(m) && !/[ก-๙]/.test(m)) return 'เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง';
  return m;
}
async function api(action, data = {}) {
  try {
    const r = await FN.httpsCallable('payApi')({ ...data, action, token: getToken() });
    return r.data;
  } catch (e) {
    if (e && e.code === 'functions/unauthenticated') { setToken(null); showLogin(errMsg(e)); throw Object.assign(new Error(errMsg(e)), { silent: true }); }
    throw new Error(errMsg(e));
  }
}

let toastT;
function toast(msg, icon = 'check_circle') {
  const t = $('#toast'); $('#toastTxt').textContent = msg; t.querySelector('.ms').textContent = icon;
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
function fail(e) { if (e && e.silent) return; toast(errMsg(e), 'error'); }
/** ปุ่มกำลังทำงาน */
async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.html = btn.innerHTML; btn.innerHTML = `<span class="spin"></span>${btn.textContent.trim()}`; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.html; } }
}

// ===== ตรวจช่องที่ต้องกรอก =====
/** list: [[selector|element, ชื่อช่อง, test?]] · test(value, el) คืนข้อความผิด หรือ '' ถ้าผ่าน · ไม่ใส่ test = ห้ามว่าง */
function need(list) {
  document.querySelectorAll('#view .bad, #drawer .bad').forEach((x) => { x.classList.remove('bad'); x.removeAttribute('aria-invalid'); });
  document.querySelectorAll('.ferr').forEach((x) => x.remove());
  const miss = [];
  for (const [sel, label, test] of list) {
    const el = typeof sel === 'string' ? $(sel) : sel; if (!el) continue;
    const v = el.type === 'file' ? (el.files.length ? 'x' : '') : String(el.value || '').trim();
    const msg = test ? test(v, el) : v ? '' : (el.type === 'file' ? 'แนบไฟล์' : el.tagName === 'SELECT' ? 'เลือกรายการ' : 'กรอกช่องนี้');
    if (msg) miss.push([el, label, msg]);
  }
  if (!miss.length) return true;
  miss.forEach(([el, , msg]) => { el.classList.add('bad'); el.setAttribute('aria-invalid', 'true'); const sm = document.createElement('small'); sm.className = 'ferr'; sm.textContent = msg; (el.closest('.field') || el.parentNode).appendChild(sm); });
  miss[0][0].focus(); if (miss[0][0].scrollIntoView) miss[0][0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast(`กรอกข้อมูลไม่ครบ: ${miss.map((m) => m[1]).join(', ')}`, 'error');
  return false;
}
const vAcc = (v) => !v ? 'ใส่เลขบัญชี' : !/^[0-9][0-9\- ]*[0-9]$/.test(v) || v.replace(/\D/g, '').length < 10 || v.replace(/\D/g, '').length > 15 ? 'ตัวเลข 10–15 หลัก (ใส่ขีดได้)' : '';
const vMoney = (v) => !v ? 'ใส่ยอดเงิน' : !(Number(v) > 0) ? 'ยอดต้องมากกว่า 0' : '';
const vMoney0 = (v) => v === '' ? 'ใส่ยอดเงิน' : !(Number(v) >= 0) ? 'ยอดต้องไม่ติดลบ' : '';
const vFileOk = (v, el) => { const f = el.files && el.files[0]; if (!f) return ''; if (!/^image\/|application\/pdf/.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) return 'แนบได้เฉพาะรูปหรือ PDF'; if (/heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)) return 'ไฟล์ HEIC ของ iPhone เปิดไม่ได้ · ถ่ายภาพหน้าจอ หรือตั้งกล้องเป็น "เข้ากันได้มากที่สุด"'; return ''; };
const vSlip = (v, el) => !v ? 'แนบสลิป' : vFileOk(v, el);
document.addEventListener('input', (e) => { const el = e.target; if (el.classList && el.classList.contains('bad')) { el.classList.remove('bad'); el.removeAttribute('aria-invalid'); (el.closest('.field') || el.parentNode).querySelector('.ferr')?.remove(); } }, true);
document.addEventListener('change', (e) => { const el = e.target; if (el.classList && el.classList.contains('bad')) { el.classList.remove('bad'); el.removeAttribute('aria-invalid'); (el.closest('.field') || el.parentNode).querySelector('.ferr')?.remove(); } }, true);

// ===== state =====
const ST = {
  me: null, settings: null, trialMode: true, custodianName: '',
  view: 'home', setTab: 'general',
  members: null, bankLog: null, audit: null,
  bankEdit: null,        // accountId | 'company' | null
  draft: null,           // ตั้งค่าทั่วไปที่กำลังแก้
  wiz: { step: 1, scope: 'A', counts: null, dl: { json: false, xlsx: false }, phraseOk: false, pwOk: false, countdown: 0 },
};
const isAdmin = () => ST.me && ST.me.role === 'admin';
const isCeo = () => ST.me && ST.me.role === 'ceo';
const isCust = () => ST.me && ST.me.isCustodian && isAdmin();

// ===== auth screens =====
const authEl = () => $('#auth');
const AUTH_SCENE = `<svg class="lg-scene" viewBox="0 0 360 230" aria-hidden="true"><path class="lr" d="M30 200 C 90 200, 80 120, 160 130 S 250 60, 330 70" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/><g transform="translate(30 196)"><path d="M0-22c-6 0-10 4.5-10 10 0 7 10 16 10 16s10-9 10-16c0-5.5-4-10-10-10z" fill="#D2DCD8"/><circle cy="-12" r="3.6" fill="#3F654D"/></g><g transform="translate(160 126)"><path d="M0-22c-6 0-10 4.5-10 10 0 7 10 16 10 16s10-9 10-16c0-5.5-4-10-10-10z" fill="#D2DCD8"/><circle cy="-12" r="3.6" fill="#3F654D"/></g><g transform="translate(330 66)"><path d="M0-22c-6 0-10 4.5-10 10 0 7 10 16 10 16s10-9 10-16c0-5.5-4-10-10-10z" fill="#E9C46A"/><circle cy="-12" r="3.6" fill="#3F654D"/></g><g transform="translate(212 92) rotate(-18)"><g class="lt"><path d="M2 8h26v14H2z" fill="#fff"/><path d="M28 10h9l7 7v5H28z" fill="#fff"/><path d="M31 12h5l4.5 4.5H31z" fill="#7FA08C"/><circle cx="11" cy="23" r="4.6" fill="#1F3428"/><circle cx="35" cy="23" r="4.6" fill="#1F3428"/><circle cx="11" cy="23" r="1.8" fill="#D2DCD8"/><circle cx="35" cy="23" r="1.8" fill="#D2DCD8"/></g></g><image href="img/icon-512.png" x="130" y="150" width="70" height="70" class="lw"/><g transform="translate(240 170)"><g class="lc a"><circle r="13" fill="#E9C46A"/><circle r="10.0" fill="none" stroke="#C9A23F" stroke-width="1.6"/><text y="4.9" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="14.0" fill="#8A6A1E">฿</text></g></g><g transform="translate(268 192)"><g class="lc b"><circle r="10" fill="#E9C46A"/><circle r="7.7" fill="none" stroke="#C9A23F" stroke-width="1.6"/><text y="3.8" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="10.8" fill="#8A6A1E">฿</text></g></g><g transform="translate(96 98)"><g class="lc c"><circle r="11" fill="#E9C46A"/><circle r="8.5" fill="none" stroke="#C9A23F" stroke-width="1.6"/><text y="4.2" text-anchor="middle" font-family="Chakra Petch,sans-serif" font-weight="700" font-size="11.9" fill="#8A6A1E">฿</text></g></g></svg>`;
function showAuth(html) { const a = authEl(); a.hidden = false; a.className = 'auth lg3'; a.innerHTML = `<div class="lg-top">${AUTH_SCENE}<b>C2-Pay</b><small>ระบบเบิกจ่าย C2TECH</small></div><div class="card lg-sheet">${html}<img class="lg-co" src="img/logo.png" alt="C2TECH"></div>`; $('#stage').hidden = true; }

const authBrand = () => `<div class="brand"><img class="ic" src="img/icon-192.png" alt=""><div><b>C2-Pay</b><small>ระบบเบิกจ่าย · <img src="img/logo.png" alt="C2TECH"></small></div></div>`;
function showLogin(msg = '') {
  showAuth(`<h2>เข้าสู่ระบบ</h2>
    <div class="lg-chip">${ms('link')}<span>ใช้<b>ชื่อผู้ใช้และรหัสผ่านเดียวกับ C2-Calendar</b></span></div>
    <form id="loginForm" style="display:flex;flex-direction:column;gap:10px" novalidate>
      <div class="field"><label for="lg-u">ชื่อผู้ใช้</label><input class="inp" id="lg-u" autocomplete="username" autocapitalize="none" required></div>
      <div class="field"><label for="lg-p">รหัสผ่าน</label><input class="inp" id="lg-p" type="password" autocomplete="current-password" required></div>
      <div class="err" id="lg-err" role="alert">${esc(msg)}</div>
      <button class="btn pri block" id="lg-btn" style="height:44px" type="submit">${ms('login')}เข้าสู่ระบบ</button>
    </form>
    <p style="font-size:12.5px;margin:0;color:var(--sub)">ลืมรหัสผ่านหรือบัญชีถูกล็อก ติดต่อ Admin ของ C2-Calendar · เข้าระบบครั้งเดียวใช้ได้ 30 วัน</p>`);
  $('#lg-u').focus();
  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const u = $('#lg-u').value.trim(), p = $('#lg-p').value;
    if (!u || !p) { $('#lg-err').textContent = 'กรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
    await busy($('#lg-btn'), async () => {
      try {
        const r = (await FN.httpsCallable('login')({ username: u, password: p, device: deviceInfo() })).data;
        if (!r || !r.success) { $('#lg-err').textContent = (r && r.message) || 'เข้าสู่ระบบไม่สำเร็จ'; return; }
        setToken(r.token); await boot();
      } catch (e) { $('#lg-err').textContent = errMsg(e); }
    });
  });
}

async function logout() {
  const t = getToken(); setToken(null);
  try { if (t) await FN.httpsCallable('logoutSession')({ token: t }); } catch (e) { /* ไม่เป็นไร */ }
  ST.me = null; showLogin();
}

function showNoPerm() {
  showAuth(`
    <div style="width:52px;height:52px;border-radius:50%;background:var(--warn-bg);color:var(--warn);display:grid;place-items:center">${ms('lock_person')}</div>
    <h2 style="font-size:20px">ยังไม่ได้รับสิทธิ์ใช้ C2-Pay</h2>
    <p style="margin:0;color:var(--sub)">บัญชี <b>${esc(ST.me.name)}</b> เข้าสู่ระบบได้แล้ว แต่ยังไม่มีสิทธิ์ในระบบเบิกจ่าย ติดต่อ Admin ของ C2-Pay เพื่อขอสิทธิ์</p>
    <button class="btn block" data-act="logout">${ms('logout')}ออกจากระบบ</button>`);
}

function showSetup() {
  if (!ST.canSetup) {
    showAuth(`<h2 style="font-size:20px">C2-Pay ยังไม่พร้อมใช้งาน</h2>
      <p style="margin:0;color:var(--sub)">รอ admin ของ C2-Calendar ตั้งค่าเริ่มต้น C2-Pay ก่อน แล้วค่อยเข้าใหม่</p>
      <button class="btn block" data-act="logout">${ms('logout')}ออกจากระบบ</button>`);
    return;
  }
  showAuth(`<h2 style="font-size:20px">ตั้งค่าเริ่มต้น C2-Pay</h2>
    <p style="margin:0;color:var(--sub)">ยังไม่มีใครตั้งค่า C2-Pay · ถ้ากดยืนยัน <b>${esc(ST.me.name)}</b> จะเป็น <b>Admin</b> และ <b>ผู้ดูแลเลขบัญชี</b> คนแรก (ส่งต่อสิทธิ์ให้คนอื่นได้ภายหลัง)</p>
    <ul style="margin:0;padding-left:20px;color:var(--sub);font-size:13.5px"><li>เริ่มใน <b>โหมดทดลองใช้</b> (ล้างข้อมูลได้)</li><li>อัตราเริ่มต้น: เบี้ยเลี้ยง 200 · ที่พัก 600 · 10 กม./ลิตร</li><li>บัญชีบริษัท: กสิกรไทย 201-1-96656-2 · สำรองจ่าย 014-9-36362-4</li></ul>
    <div class="field"><label for="su-p">ยืนยันรหัสผ่านของคุณ</label><input class="inp" id="su-p" type="password" autocomplete="current-password"></div>
    <div class="err" id="su-err" role="alert"></div>
    <button class="btn pri block" data-act="setupInit" style="height:44px">${ms('rocket_launch')}ตั้งค่าเริ่มต้นและเข้าใช้งาน</button>
    <button class="btn ghost block" data-act="logout">ออกจากระบบ</button>`);
}

// ===== หน้าโหลด (splash) · แสดงอย่างน้อย SPLASH_MIN_MS แล้วค่อยจางหาย =====
const SPLASH_MIN_MS = Number(new URLSearchParams(location.search).get('splash')) || 2800; // ?splash=ms ใช้ทดสอบ
let splashGone = false;
const splashMsg = (t) => { const m = $('#spMsg'); if (m) m.textContent = t; };
async function splashOff() {
  if (splashGone) return; splashGone = true;
  const el = $('#splash'); if (!el) return;
  const wait = SPLASH_MIN_MS - performance.now(); // นับจากเริ่มเปิดหน้า
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  el.classList.add('out'); setTimeout(() => el.remove(), 500);
}

async function boot() {
  try { await bootInner(); } finally { splashOff(); }
}
async function bootInner() {
  if (!getToken()) { showLogin(); return; }
  if (splashGone) { authEl().hidden = false; authEl().className = 'auth'; authEl().innerHTML = `<div class="loading"><div class="spin"></div><span>กำลังโหลด…</span></div>`; }
  else splashMsg('กำลังโหลดข้อมูลของคุณ…');
  let r;
  try { r = await api('me'); } catch (e) { if (!e.silent) showLogin(errMsg(e)); return; }
  ST.me = r.me; ST.settings = r.settings; ST.trialMode = r.trialMode; ST.custodianName = r.custodianName; ST.canSetup = r.canSetup;
  if (r.setupNeeded) { showSetup(); return; }
  if (ST.me.role === 'none') { showNoPerm(); return; }
  authEl().hidden = true; $('#stage').hidden = false;
  if (!isAdmin() && ST.view === 'settings') ST.view = 'home';
  render();
}

// ===== navigation =====
const NAV_ADMIN = [
  ['home', 'dashboard', 'ภาพรวม'], ['new', 'add_circle', 'สร้างใบใหม่'], ['claims', 'receipt_long', 'ใบเบิก'], ['inbox', 'inbox', 'คำขอจากทีมงาน'], ['clear', 'fact_check', 'เคลียร์เงิน'],
  ['payq', 'approval', 'ขออนุมัติโอน'], ['pc', 'savings', 'เงินสดย่อย'], ['ledger', 'menu_book', 'สมุดค่าใช้จ่าย'], ['report', 'monitoring', 'รายงาน'],
  ['settings', 'settings', 'ตั้งค่า'], ['profile', 'person', 'โปรไฟล์'],
];
const NAV_CEO = [['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก'], ['payq', 'approval', 'ขออนุมัติโอน'], ['pc', 'savings', 'เงินสดย่อย'], ['ledger', 'menu_book', 'สมุดค่าใช้จ่าย'], ['report', 'monitoring', 'รายงาน'], ['profile', 'person', 'โปรไฟล์']];
const NAV_USER = [['home', 'luggage', 'ทริปของฉัน'], ['req', 'add_road', 'ขอเบิกค่าเดินทาง'], ['profile', 'person', 'โปรไฟล์']];
const nav = () => isAdmin() ? NAV_ADMIN : isCeo() ? NAV_CEO : NAV_USER;
const TITLES = { home: 'ภาพรวม', settings: 'ตั้งค่า', profile: 'โปรไฟล์', claims: 'ใบเบิก', inbox: 'คำขอจากทีมงาน', clear: 'เคลียร์เงิน', payq: 'ขออนุมัติโอน (ใบเสนอ CEO)', pc: 'เงินสดย่อย', req: 'ขอเบิกค่าเดินทาง', clr: 'เคลียร์เงินทริป', new: 'สร้างใบใหม่', ledger: 'สมุดค่าใช้จ่าย', adv: 'เคลียร์เงินทดรอง', more: 'เพิ่มเติม', report: 'รายงาน' };

function renderNav() {
  const L = (ST.trv && ST.trv.list) || [];
  const bd = { inbox: L.filter((d) => d.status === 'submitted' || d.status === 'clearSub' || d.status === 'pending').length, clear: L.filter((d) => d.status === 'open').length, payq: L.filter((d) => !d.batch && (d.status === 'approve' || (d.status === 'topup' && d.settleSrc === 'BANK'))).length };
  const late = L.some((d) => ['late', 'warn'].includes((clearState(d) || {}).lv));
  const badge = (k) => isAdmin() && bd[k] ? `<span class="badge ${k === 'inbox' || (k === 'clear' && late) ? 'red' : ''}">${bd[k]}</span>` : k === 'settings' && ST.trialMode && isCust() ? '<span class="badge">ทดลอง</span>' : '';
  $('#sidenav').innerHTML = nav().map(([k, i, l, soon]) => `<button class="nitem ${ST.view === k ? 'on' : ''} ${soon ? 'soon' : ''}" data-act="go" data-v="${k}" title="${l}${soon ? ' (เร็วๆ นี้)' : ''}">${ms(i)}<span class="lbl">${l}</span>${badge(k)}</button>`).join('');
  const b = isAdmin() ? [['home', 'dashboard', 'ภาพรวม'], ['inbox', 'inbox', 'คำขอ'], ['new', 'add', 'สร้าง'], ['clear', 'fact_check', 'เคลียร์'], ['more', 'more_horiz', 'เพิ่มเติม']]
    : isCeo() ? [['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก'], ['pc', 'savings', 'เงินสดย่อย'], ['profile', 'person', 'โปรไฟล์']]
    : [['home', 'luggage', 'ทริปของฉัน'], ['req', 'add', 'ขอเบิก'], ['profile', 'person', 'โปรไฟล์']];
  $('#bnav').innerHTML = b.map(([k, i, l]) => `<button class="${k === 'req' || k === 'new' ? 'plus' : ''} ${ST.view === k ? 'on' : ''}" data-act="${k === 'more' ? 'more' : 'go'}" data-v="${k}">${ms(i)}<span>${l}</span>${badge(k)}</button>`).join('');
  $('#bnav').style.gridTemplateColumns = `repeat(${b.length}, 1fr)`;
  $('#sidefoot').innerHTML = `<div style="display:flex;align-items:center;gap:8px">${ms('account_circle')}<span>${esc(ST.me.username || ST.me.name)} · ${ROLE_SHORT[ST.me.role]}</span></div><div style="margin-top:4px">${VERSION}</div>`;
}

function render() {
  if (!ST.me) return;
  renderNav();
  $('#ttl').textContent = TITLES[ST.view] || '';
  $('#acts').innerHTML = `${IN_FRAME ? `<button class="btn sm ghost" data-act="openTab" title="เปิด C2-Pay ในแท็บใหม่ (พิมพ์และดาวน์โหลดไฟล์ได้เต็มที่)">${ms('open_in_new')}<span class="pc-only">เปิดในแท็บใหม่</span></button>` : ''}<button class="btn sm ghost" data-act="refresh" title="โหลดข้อมูลใหม่">${ms('refresh')}<span class="pc-only">โหลดใหม่</span></button>`;
  if (!isAdmin() && !isCeo()) $('#ttl').textContent = ST.view === 'home' ? 'ทริปของฉัน' : $('#ttl').textContent;
  const V = { settings: vSettings, profile: vProfile, claims: vClaims, inbox: vInbox, clear: vClearList, payq: vPayq, pc: vPc, req: vReq, clr: vClr, more: vMore, new: vNew, ledger: vLedger, adv: vAdv, report: vReport };
  const v = (V[ST.view] || (isAdmin() || isCeo() ? vDash : vMyTrips))();
  if (ST.view === 'req') $('#ttl').textContent = ST.form && ST.form.extNo ? `ต่อทริป ${ST.form.extNo}` : ST.form && ST.form.editNo ? `แก้ไข ${ST.form.editNo}` : 'ขอเบิกค่าเดินทาง';
  $('#view').innerHTML = v;
  afterRender();
}

function trialBanner() {
  if (!ST.trialMode) return '';
  return `<div class="pwbox warn">${ms('science')}<span><b>ช่วงทดลองใช้</b> · ข้อมูลในช่วงนี้อาจถูกล้างก่อนเริ่มใช้งานจริง</span></div>`;
}

// ===== views =====
function vMore() {
  const items = nav().filter(([k]) => !['home', 'inbox', 'clear', 'new'].includes(k));
  return `<div class="stack">${items.map(([k, i, l, soon]) => `<button class="card kpi" style="flex-direction:row;align-items:center;gap:12px" data-act="go" data-v="${k}">${ms(i)}<b style="font-weight:600">${l}</b>${soon ? '<span class="pill p-mute" style="margin-left:auto">เร็วๆ นี้</span>' : ''}</button>`).join('')}</div>`;
}
function vProfile() {
  const me = ST.me;
  return `<div class="grid g2"><div class="card"><h3>${ms('person')}ข้อมูลของฉัน</h3>
      <dl class="kv"><dt>ชื่อ</dt><dd>${esc(me.name)}</dd><dt>ชื่อผู้ใช้</dt><dd class="num">${esc(me.username)}</dd>
      <dt>สิทธิ์ C2-Pay</dt><dd>${ROLE_LABEL[me.role]}${me.isCustodian ? ' · ผู้ดูแลเลขบัญชี' : ''}</dd><dt>C2-Calendar</dt><dd>${esc(me.calRole)}</dd>
      <dt>บัญชีรับเงิน</dt><dd>${me.bank ? `${esc(me.bank.bank)} <span class="num">${esc(me.bank.no)}</span><br><span style="color:var(--sub);font-size:12.5px">ชื่อบัญชี ${esc(me.bank.name)} · แก้ล่าสุด ${dtTime(me.bank.changedAt)}</span>` : 'ยังไม่มี'}</dd></dl>
      <p class="formula" style="margin:10px 0 0">${ms('lock', 'style="font-size:15px;vertical-align:-3px"')} เลขบัญชีเพิ่ม/แก้ได้โดยผู้ดูแลเลขบัญชีเท่านั้น (${esc(ST.custodianName)}) · เปลี่ยนรหัสผ่านที่ C2-Calendar</p></div>
    <div class="card"><h3>${ms('logout')}ออกจากระบบ</h3><p style="margin:0 0 10px;color:var(--sub)">ออกจาก C2-Pay บนอุปกรณ์นี้ (C2-Calendar ไม่ถูกออกจากระบบ)</p><button class="btn" data-act="logout">${ms('logout')}ออกจากระบบ</button></div></div>`;
}

// ---------- settings ----------
function vSettings() {
  const tabs = [['general', 'tune', 'ค่าทั่วไป'], ['users', 'group', 'ผู้ใช้และเลขบัญชี'], ['history', 'history', 'ประวัติ']];
  if (ST.trialMode && isCust()) tabs.push(['trial', 'science', 'โหมดทดลองใช้']);
  if (!tabs.some((t) => t[0] === ST.setTab)) ST.setTab = 'general';
  const t = `<div class="tabs" role="tablist">${tabs.map(([k, i, l]) => `<button role="tab" class="${ST.setTab === k ? 'on' : ''}" data-act="setTab" data-v="${k}" ${k === 'trial' ? 'style="color:var(--bad)"' : ''}>${ms(i)}${l}</button>`).join('')}</div>`;
  if (ST.setTab === 'users') return t + vUsers();
  if (ST.setTab === 'history') return t + vHistory();
  if (ST.setTab === 'trial') return t + vTrial();
  return t + vGeneral();
}

function vGeneral() {
  const S = ST.settings; if (!ST.draft) ST.draft = JSON.parse(JSON.stringify({ settings: S.settings, cats: S.cats, customers: S.customers, home: S.home, defaults: S.defaults }));
  const D = ST.draft, s = D.settings;
  const f = (k, lab, hint) => `<div class="field"><label for="s-${k}">${lab}</label><input class="inp num" type="number" inputmode="decimal" id="s-${k}" data-set="${k}" value="${esc(s[k])}">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const roleSel = (k) => `<select class="sel" id="df-${k}" data-def="${k}">${['user', 'ceo', 'none'].map((r) => `<option value="${r}" ${D.defaults[k] === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>`;
  const company = `<div class="card"><h3>${ms('account_balance')}บัญชีบริษัท<span class="r">${isCust() ? '' : ms('lock', 'style="font-size:16px"') + ' ผู้ดูแลเลขบัญชีแก้ได้คนเดียว'}</span></h3>
      <div class="lines"><div><span>ธนาคาร</span><b>${esc(S.settings.bankName)}</b></div><div><span>บัญชีบริษัท (ใช้ในใบรับเงิน)</span><b class="num">${esc(S.settings.accCo)}</b></div><div><span>บัญชีเงินสำรองจ่าย</span><b class="num">${esc(S.settings.accAdv)}</b></div></div>
      ${isCust() ? (ST.bankEdit === 'company' ? bankForm('company') : `<button class="btn sm" style="margin-top:10px" data-act="bankEdit" data-v="company">${ms('edit')}แก้บัญชีบริษัท</button>`) : ''}</div>`;
  const cust = D.customers.map((c, i) => `<div class="custrow"><input class="inp ll" aria-label="ชื่อลูกค้า" data-cust="${i}" data-k="name" value="${esc(c.name)}">
      <span style="display:flex;gap:6px"><input class="inp num" style="width:96px" aria-label="ละติจูด" placeholder="lat" data-cust="${i}" data-k="lat" value="${c.lat ?? ''}"><input class="inp num" style="width:96px" aria-label="ลองจิจูด" placeholder="lng" data-cust="${i}" data-k="lng" value="${c.lng ?? ''}"></span>
      <button class="btn sm ghost" data-act="custDel" data-v="${i}" aria-label="ลบ ${esc(c.name)}">${ms('delete')}</button></div>`).join('');
  return `<div class="grid g2"><div class="stack">
      <div class="card"><h3>${ms('local_gas_station')}อัตราค่าเดินทาง</h3><div class="fgrid">
        ${f('kmPerL', 'อัตราสิ้นเปลือง (กม./ลิตร)')}${f('fuelPrice', 'ราคาน้ำมันตั้งต้น (บาท/ลิตร)', 'แก้ได้ในแต่ละใบ')}
        ${f('allowance', 'เบี้ยเลี้ยง (บาท/คน/วัน)')}${f('hotel', 'ที่พัก (บาท/ห้อง/คืน)', 'ขอเกินได้รายทริป · Admin อนุมัติ')}
        ${f('hotelWarn', 'เตือนที่พักเกิน (บาท/ห้อง/คืน)', 'เกินยอดนี้ขึ้นสีแดง')}${f('lowAlert', 'เตือนเงินสดย่อยต่ำกว่า (บาท)')}</div></div>
      <div class="card"><h3>${ms('alarm')}กำหนดเคลียร์เงิน (นับจากวันจบทริป)</h3><div class="fgrid">
        ${f('clearDue', 'ครบกำหนด (วัน)', 'เตือนผู้เดินทาง')}${f('clearWarn', 'เตือนซ้ำ (วัน)', 'ขึ้นในรายการใกล้เกินกำหนด')}${f('clearMax', 'เกินกำหนด (วัน)', 'ป้ายแดง · แจ้ง Admin')}</div></div>
      <div class="card"><h3>${ms('category')}หมวดค่าใช้จ่าย<span class="r">${D.cats.length}</span></h3>
        <div class="chips">${D.cats.map((c, i) => `<span class="chip">${esc(c)}<button class="btn sm ghost" style="height:20px;padding:0 2px" data-act="catDel" data-v="${i}" aria-label="ลบหมวด ${esc(c)}">${ms('close', 'style="font-size:16px"')}</button></span>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:10px"><input class="inp" id="cat-new" placeholder="เพิ่มหมวดใหม่" style="flex:1"><button class="btn sm" data-act="catAdd">${ms('add')}เพิ่ม</button></div></div>
      <div class="card"><h3>${ms('store')}ลูกค้า / สถานที่<span class="r">${D.customers.length}</span></h3>
        ${S.hasGmaps ? `<div class="field" style="margin-bottom:10px;position:relative"><label for="cust-q">เพิ่มลูกค้าจาก Google Maps (ได้พิกัดอัตโนมัติ)</label><input class="inp" id="cust-q" placeholder="พิมพ์ชื่อโรงสี / สถานที่" autocomplete="off" role="combobox" aria-controls="ta-cust" aria-expanded="false"><div class="ta" id="ta-cust" role="listbox" hidden></div></div>` : ''}
        <p class="formula" style="margin:0 0 8px">พิกัด (lat, lng) ใช้คำนวณระยะทาง · คัดลอกจาก Google Maps (คลิกขวาที่จุด → ตัวเลขแรก) · เว้นว่างได้ แล้วกรอกระยะทางเองในใบเบิก</p>
        <div class="custrow"><input class="inp ll" aria-label="จุดเริ่มต้น" data-home="name" value="${esc(D.home.name)}"><span style="display:flex;gap:6px"><input class="inp num" style="width:96px" aria-label="ละติจูดจุดเริ่มต้น" placeholder="lat" data-home="lat" value="${D.home.lat ?? ''}"><input class="inp num" style="width:96px" aria-label="ลองจิจูดจุดเริ่มต้น" placeholder="lng" data-home="lng" value="${D.home.lng ?? ''}"></span><span class="pill p-closed">จุดเริ่มต้น</span></div>
        ${cust}
        <button class="btn sm" style="margin-top:10px" data-act="custAdd">${ms('add')}เพิ่มลูกค้า</button></div>
    </div><div class="stack">
      ${company}
      <div class="card"><h3>${ms('map')}Google Maps API<span class="r">${S.hasGmaps ? '<span class="pill p-closed">ตั้งคีย์แล้ว</span>' : '<span class="pill p-pending">ยังไม่ตั้ง</span>'}</span></h3>
        <div class="field"><label for="s-gm">API key (Places API New + Routes API)</label><input class="inp" id="s-gm" type="password" autocomplete="off" data-gm="1" value="${esc(D.gmapsKey || '')}" placeholder="${S.hasGmaps ? 'ตั้งไว้แล้ว · ใส่ใหม่เพื่อเปลี่ยน' : 'วางคีย์จาก Google Cloud'}"></div>
        ${S.hasGmaps ? (ST.gmu ? `<div class="lines" style="margin-top:8px"><div><span>ค้นหาสถานที่ เดือนนี้</span><b class="num">${fmtN(ST.gmu.ac)} / ${fmtN(ST.gmu.cap)}</b></div><div><span>ดึงพิกัด เดือนนี้</span><b class="num">${fmtN(ST.gmu.details)} / ${fmtN(ST.gmu.cap)}</b></div><div><span>คำนวณเส้นทาง เดือนนี้</span><b class="num">${fmtN(ST.gmu.routes)} / ${fmtN(ST.gmu.cap)}</b></div><div><span>จัดลำดับเส้นทาง เดือนนี้</span><b class="num">${fmtN(ST.gmu.opt)} / ${fmtN(ST.gmu.optCap)}</b></div></div>` : (loadGmu(), '<div class="loading" style="padding:10px"><div class="spin"></div></div>')) : ''}
        <p class="formula" style="margin:8px 0 0">ระบบหยุดเรียก Google เมื่อถึง 9,000 ครั้ง/เดือน/บริการ (ฟรี 10,000) แล้วใช้ OSRM หรือกรอกระยะเองแทน · ไม่มีคีย์ = ใช้ OSRM</p>
        <details style="margin-top:8px"><summary style="cursor:pointer;color:var(--sub);font-size:13px">คีย์ OpenRouteService (ไม่ต้องใส่)</summary><div class="field" style="margin-top:6px"><label for="s-ors">API key</label><input class="inp" id="s-ors" type="password" autocomplete="off" data-ors="1" value="${esc(D.orsKey || '')}" placeholder="${S.hasOrs ? 'ตั้งไว้แล้ว' : 'ไม่บังคับ'}"></div></details></div>
      <div class="card"><h3>${ms('person_add')}สิทธิ์เริ่มต้นของบัญชีใหม่</h3><p class="formula" style="margin:0 0 8px">คนใหม่ใน C2-Calendar ได้สิทธิ์ตามนี้ทันที · Admin ของ C2-Pay ต้องตั้งเองรายคนเสมอ</p>
        <div class="fgrid" style="grid-template-columns:1fr"><div class="field"><label for="df-staff">staff ใน C2-Calendar</label>${roleSel('staff')}</div><div class="field"><label for="df-ceo">ceo ใน C2-Calendar</label>${roleSel('ceo')}</div><div class="field"><label for="df-admin">admin ใน C2-Calendar</label>${roleSel('admin')}</div></div></div>
      <div class="card" style="position:sticky;top:0"><button class="btn pri block" data-act="saveSettings">${ms('save')}บันทึกค่าทั่วไป</button><button class="btn ghost block" data-act="resetDraft" style="margin-top:6px">ยกเลิกการแก้</button></div>
    </div></div>`;
}

function bankForm(target, m) {
  const S = ST.settings, isCo = target === 'company';
  const cur = isCo ? null : (m && m.bank) || null;
  const bankSel = (id, v) => `<select class="sel" id="${id}">${S.banks.map((b) => `<option ${b === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  return `<div class="bankform"><b style="display:flex;gap:6px;align-items:center">${ms('account_balance')}${isCo ? 'แก้บัญชีบริษัท' : `${cur ? 'แก้' : 'เพิ่ม'}เลขบัญชีรับโอน · ${esc(m.name)}`}</b>
    <div class="fgrid" style="margin-top:10px">
      ${isCo ? `<div class="field"><label for="bk-bank">ธนาคาร</label>${bankSel('bk-bank', S.settings.bankName)}</div>
        <div class="field"><label for="bk-co">บัญชีบริษัท</label><input class="inp num" id="bk-co" inputmode="numeric" value="${esc(S.settings.accCo)}"></div>
        <div class="field"><label for="bk-adv">บัญชีเงินสำรองจ่าย</label><input class="inp num" id="bk-adv" inputmode="numeric" value="${esc(S.settings.accAdv)}"></div>`
      : `<div class="field"><label for="bk-bank">ธนาคาร</label>${bankSel('bk-bank', cur ? cur.bank : 'กสิกรไทย')}</div>
        <div class="field"><label for="bk-no">เลขที่บัญชี</label><input class="inp num" id="bk-no" inputmode="numeric" autocomplete="off" value="${esc(cur ? cur.no : '')}" placeholder="xxx-x-xxxxx-x"></div>
        <div class="field"><label for="bk-name">ชื่อบัญชี (ต้องตรงกับชื่อพนักงาน)</label><input class="inp" id="bk-name" value="${esc(cur ? cur.name : m.name)}"></div>
        <div class="field"><label for="bk-file">แนบสำเนาหน้าสมุดบัญชี (แนะนำ)</label><input class="inp" id="bk-file" type="file" accept="image/*,application/pdf" style="padding-top:6px"></div>`}
      <div class="field"><label for="bk-why">เหตุผล</label><input class="inp" id="bk-why" placeholder="${isCo ? 'เช่น ตรวจเลขบัญชีกับสมุดบัญชีแล้ว' : 'เช่น พนักงานแจ้งเปลี่ยนธนาคาร'}"></div>
      <div class="field"><label for="bk-pw">ยืนยันรหัสผ่านของคุณ</label><input class="inp" id="bk-pw" type="password" autocomplete="current-password"></div>
    </div>
    <p class="formula" style="margin:10px 0 0">หลังบันทึก: ${isCo ? 'บันทึกประวัติที่ลบไม่ได้' : 'แจ้งเจ้าของบัญชีทันที · บันทึกประวัติที่ลบไม่ได้ · การโอนครั้งแรกหลังเปลี่ยนต้องยืนยันกับเจ้าตัว และพิมพ์หมายเหตุในใบเสนอ CEO'}</p>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn pri sm" data-act="bankSave" data-v="${esc(target)}">${ms('check')}บันทึกเลขบัญชี</button><button class="btn ghost sm" data-act="bankCancel">ยกเลิก</button></div></div>`;
}

function vUsers() {
  if (!ST.members) { loadMembers(); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const admins = ST.members.filter((m) => m.role === 'admin');
  const sel = (m) => `<select class="sel" aria-label="สิทธิ์ C2-Pay ของ ${esc(m.name)}" data-role="${m.id}" style="min-width:170px">${['admin', 'ceo', 'user', 'none'].map((r) => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>`;
  const bankLine = (m) => {
    if (m.role !== 'user' && m.role !== 'admin' && !m.bank) return '';
    if (!m.bank) return `${m.role === 'user' ? '<span class="pill p-over">ยังไม่มีบัญชีรับโอน</span>' : ''}${isCust() ? `<button class="btn sm" data-act="bankEdit" data-v="${m.id}">${ms('add')}เพิ่มเลขบัญชี</button>` : ''}`;
    return `<span class="meta">${ms('account_balance', 'style="font-size:16px;vertical-align:-3px"')} ${esc(m.bank.bank)} <span class="num">${esc(m.bank.no)}</span></span>${m.bank.changedAt ? `<span class="pill p-pending">แก้ล่าสุด ${dtTime(m.bank.changedAt).split(' ').slice(0, 3).join(' ')}</span>` : ''}${isCust() ? `<button class="btn sm" data-act="bankEdit" data-v="${m.id}">${ms('edit')}แก้เลขบัญชี</button>${m.bank.file ? `<button class="btn sm ghost" data-act="fileView" data-v="${esc(m.bank.file.path)}">${ms('image')}สำเนา</button>` : ''}` : `<span class="meta">${ms('lock', 'style="font-size:15px;vertical-align:-3px"')}แก้ได้เฉพาะผู้ดูแลเลขบัญชี</span>`}`;
  };
  const row = (m) => `<div class="urow" style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center">
      <span class="av">${esc((m.name || '?').slice(0, 1))}</span>
      <span class="who" style="min-width:0"><b>${esc(m.name)}${m.id === ST.me.id ? ' (คุณ)' : ''}</b><small class="num">${esc(m.username)} · C2-Calendar: ${esc(m.calRole)}</small>
        <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;align-items:center">${m.isCustodian ? `<span class="pill p-closed">${ms('key', 'style="font-size:15px"')}ผู้ดูแลเลขบัญชี</span>` : ''}${m.isNew ? '<span class="pill p-open">ใหม่จาก C2-Calendar</span>' : ''}<span class="meta" style="min-width:0">${m.set ? 'ตั้งเอง' : 'สิทธิ์ตามค่าเริ่มต้น'}</span>${bankLine(m)}</span></span>
      ${sel(m)}</div>${ST.bankEdit === m.id ? bankForm(m.id, m) : ''}`;
  const custCard = `<div class="card"><h3>${ms('key')}ผู้ดูแลเลขบัญชี</h3><div class="lines"><div><span>ผู้ดูแลตอนนี้</span><b>${esc(ST.custodianName)}</b></div><div><span>มีได้</span><b>1 คนเท่านั้น</b></div></div>
      ${isCust() ? `<div class="fgrid" style="grid-template-columns:1fr;margin-top:10px"><div class="field"><label for="ho-to">ส่งต่อสิทธิ์ให้ (ต้องเป็น Admin ของ C2-Pay)</label><select class="sel" id="ho-to"><option value="">— เลือก —</option>${admins.filter((a) => a.id !== ST.me.id).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ho-pw">ยืนยันรหัสผ่านของคุณ</label><input class="inp" id="ho-pw" type="password" autocomplete="current-password"></div></div>
        <button class="btn sm" style="margin-top:10px" data-act="handover">${ms('swap_horiz')}ส่งต่อสิทธิ์</button><p class="formula" style="margin:6px 0 0">ส่งต่อแล้วคุณจะแก้เลขบัญชีไม่ได้อีก</p>` : ''}</div>`;
  return `<div class="pwbox soft">${ms(isCust() ? 'key' : 'link')}<span>บัญชีผู้ใช้และรหัสผ่านใช้ร่วมกับ <b>C2-Calendar</b> · เพิ่มคน รีเซ็ตรหัส หรือปิดบัญชี ทำที่ C2-Calendar${isCust() ? ' · คุณคือ <b>ผู้ดูแลเลขบัญชี</b>' : ' · เลขบัญชีแสดงแบบปิดบางส่วน'}</span></div>
    <div class="grid g2" style="margin-top:12px"><div class="card"><h3>${ms('group')}สิทธิ์ใน C2-Pay<span class="r">${ST.members.filter((m) => m.role !== 'none').length} จาก ${ST.members.length} บัญชี</span></h3><div class="ulist">${ST.members.map(row).join('')}</div></div>
    <div class="stack">${custCard}
      <div class="card"><h3>${ms('shield_person')}สิทธิ์ใน C2-Pay</h3><div class="lines">
        <div><span><b>Admin</b><br><span class="f">สร้าง/อนุมัติ/จ่าย/เคลียร์ เงินสดย่อย ตั้งค่า และตั้งสิทธิ์</span></span></div>
        <div><span><b>CEO</b><br><span class="f">ดูได้ทุกหน้า ค้นหา ส่งออก · ไม่ทำรายการเงิน</span></span></div>
        <div><span><b>User</b><br><span class="f">ขอเบิกและเคลียร์ทริปของตัวเอง · ต้องมีบัญชีรับโอน</span></span></div>
        <div><span><b>ไม่มีสิทธิ์</b><br><span class="f">เข้าระบบได้ แต่เห็นข้อความให้ติดต่อ Admin</span></span></div></div></div></div></div>`;
}

function vHistory() {
  if (!ST.bankLog) { loadHistory(); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const T = { setup: 'ตั้งค่าเริ่มต้น C2-Pay', role: 'เปลี่ยนสิทธิ์', handover: 'ส่งต่อสิทธิ์ผู้ดูแลเลขบัญชี', trialClear: 'ล้างข้อมูลช่วงทดลอง', trialEnd: 'ปิดโหมดทดลอง · เริ่มใช้งานจริง', trvDelete: 'ลบใบเบิก (โหมดทดลอง)' };
  const ad = (x) => x.type === 'role' ? `${esc(x.detail.name)} → ${ROLE_SHORT[x.detail.role] || ''}` : x.type === 'handover' ? `ให้ ${esc(x.detail.toName)}` : x.type === 'trialClear' ? `แบบ ${esc(x.detail.scope)}` : x.type === 'trvDelete' ? `${esc(x.detail.no)} · ${esc(x.detail.title)} · ${esc(x.detail.staffName)}` : '';
  return `<div class="grid g2"><div class="card"><h3>${ms('history')}ประวัติการแก้เลขบัญชี<span class="r">ลบไม่ได้</span></h3><div class="lines">
      ${ST.bankLog.length ? ST.bankLog.map((x) => `<div><span><b>${esc(x.targetName)}</b>${x.self ? ' <span class="pill p-pending">แก้บัญชีตัวเอง</span>' : ''}<br><span class="f">${x.from ? `${esc(x.from)} → ` : 'เพิ่มครั้งแรก '}${esc(x.to)}<br>โดย ${esc(x.byName)} · ${dtTime(x.at)} · "${esc(x.reason)}"</span></span>${x.file ? `<button class="btn sm ghost" data-act="fileView" data-v="${esc(x.file)}">${ms('image')}</button>` : ''}</div>`).join('') : '<div class="empty">ยังไม่มีประวัติ</div>'}</div></div>
    <div class="card"><h3>${ms('manage_history')}ประวัติระบบ</h3><div class="lines">
      ${ST.audit.length ? ST.audit.map((x) => `<div><span><b>${esc(T[x.type] || x.type)}</b> ${ad(x)}<br><span class="f">โดย ${esc(x.byName)} · ${dtTime(x.at)}</span></span></div>`).join('') : '<div class="empty">ยังไม่มีประวัติ</div>'}</div></div></div>`;
}

// ---------- trial ----------
const COUNT_LABELS = [['pay_docs', 'ใบเบิก (TRV/ADV/RMB)'], ['pay_expenses', 'ค่าใช้จ่ายบริษัท (EXP)'], ['pay_pc', 'สมุดเงินสดย่อย'], ['pay_payq', 'รายการรอจ่าย/รอโอน'], ['pay_batches', 'ใบเสนอ CEO'], ['pay_vouchers', 'ใบสำคัญ RV/PV/CL'], ['storageFiles', 'ไฟล์แนบ (ใบเสร็จ สลิป สแกน)']];
function vTrial() {
  const W = ST.wiz;
  if (!W.counts) { loadCounts(); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const c = W.counts;
  const money = COUNT_LABELS.reduce((t, [k]) => t + (k === 'storageFiles' ? 0 : c[k] || 0), 0);
  const steps = ['เลือกสิ่งที่จะลบ', 'ดาวน์โหลดสำรอง', 'ยืนยันและลบ'];
  const stepper = `<div class="wsteps">${steps.map((t, i) => `<span class="pill ${i + 1 === W.step ? 'now' : i + 1 < W.step ? 'done' : ''}">${i + 1 < W.step ? ms('check', 'style="font-size:15px"') : (i + 1) + '.'} ${t}</span>`).join('')}</div>`;
  const top = `<div class="pwbox warn">${ms('science')}<span><b>ช่วงทดลองใช้</b> · เมนูนี้เห็นเฉพาะผู้ดูแลเลขบัญชี · เมื่อเริ่มใช้งานจริง กด "ปิดโหมดทดลอง" แล้วเมนูนี้จะหายไปถาวร</span></div>`;
  const keepA = ['ตั้งค่าทั่วไป (อัตรา บัญชีบริษัท หมวด ลูกค้า)', 'สิทธิ์ผู้ใช้ C2-Pay', 'เลขบัญชีรับโอนของทุกคน และประวัติการแก้'];
  let body;
  if (W.step === 1) {
    body = `<div class="grid g2"><label class="card scope ${W.scope === 'A' ? 'on' : ''}"><h3><input type="radio" name="scope" value="A" data-scope="A" ${W.scope === 'A' ? 'checked' : ''}> แบบ A · ลบเฉพาะรายการเงิน</h3>
        <div class="lines">${COUNT_LABELS.map(([k, t]) => `<div><span>${t}</span><b class="num" style="color:${c[k] ? 'var(--bad)' : 'var(--sub)'}">ลบ ${c[k] || 0}</b></div>`).join('')}</div>
        <p class="formula" style="margin:10px 0 4px">เก็บไว้</p><div class="lines">${keepA.map((t) => `<div><span>${t}</span><b style="color:var(--good)">เก็บไว้</b></div>`).join('')}</div>
        <p class="formula" style="margin:8px 0 0">เลขเอกสารเริ่มนับใหม่จาก 001</p></label>
      <label class="card scope ${W.scope === 'B' ? 'on' : ''}"><h3><input type="radio" name="scope" value="B" data-scope="B" ${W.scope === 'B' ? 'checked' : ''}> แบบ B · ล้างทุกอย่างของ C2-Pay</h3>
        <div class="lines"><div><span>ทุกอย่างในแบบ A</span><b style="color:var(--bad)">ลบ</b></div>${keepA.map((t) => `<div><span>${t}</span><b style="color:var(--bad)">ลบ / กลับค่าเริ่มต้น</b></div>`).join('')}<div><span>ประวัติระบบ (ใครลบ เมื่อไร)</span><b style="color:var(--good)">เก็บไว้</b></div></div>
        <p class="formula" style="margin:10px 0 0">บัญชี login ของ C2-Calendar <b>ไม่ถูกลบ</b> · คุณยังเป็น Admin และผู้ดูแลเลขบัญชีต่อ · คนอื่นกลับเป็นสิทธิ์ตามค่าเริ่มต้น</p></label></div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn pri" data-act="wizStep" data-v="2">ถัดไป ${ms('arrow_forward')}</button></div>
      <div class="card" style="margin-top:14px"><h3>${ms('rocket_launch')}เริ่มใช้งานจริง</h3><p style="margin:0 0 10px;color:var(--sub)">ปิดโหมดทดลอง: เมนูล้างข้อมูลจะหายไปถาวร เปิดกลับได้โดยผู้พัฒนาเท่านั้น</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><div class="field" style="min-width:200px"><label for="te-pw">ยืนยันรหัสผ่านของคุณ</label><input class="inp" id="te-pw" type="password" autocomplete="current-password"></div><button class="btn" data-act="trialEnd">${ms('lock')}ปิดโหมดทดลอง</button></div></div>`;
  } else if (W.step === 2) {
    const d = (k, name) => `<div><span class="num">${name}</span>${W.dl[k] ? `<span class="pill p-closed">${ms('check', 'style="font-size:15px"')}ดาวน์โหลดแล้ว</span>` : `<button class="btn sm" data-act="dl" data-v="${k}">${ms('download')}ดาวน์โหลด</button>`}</div>`;
    const day = new Date().toISOString().slice(0, 10);
    body = `<div class="card" style="max-width:660px"><h3>${ms('download')}ดาวน์โหลดไฟล์สำรองก่อนลบ</h3>
        <p style="margin:0 0 10px;color:var(--sub)">Excel ไว้เปิดดู และไฟล์ JSON ไว้กู้คืน ถ้าลบผิดส่งไฟล์ JSON ให้ผู้พัฒนากู้คืนได้ · ไฟล์มีเลขบัญชีเต็ม เก็บให้ปลอดภัย</p>
        <div class="lines">${d('xlsx', `C2-Pay-backup-${day}.xlsx`)}${d('json', `C2-Pay-backup-${day}.json`)}</div>
        <p class="formula" style="margin:10px 0 0">ไปขั้นถัดไปได้เมื่อดาวน์โหลดครบทั้ง 2 ไฟล์ · ต้องลบภายใน 30 นาทีหลังสำรอง · รูปใบเสร็จไม่รวมในไฟล์สำรอง</p>
        <div style="display:flex;justify-content:space-between;margin-top:12px"><button class="btn ghost" data-act="wizStep" data-v="1">${ms('arrow_back')}ย้อนกลับ</button><button class="btn pri" data-act="wizStep" data-v="3" ${W.dl.json && W.dl.xlsx ? '' : 'disabled'}>ถัดไป ${ms('arrow_forward')}</button></div></div>`;
  } else {
    const what = W.scope === 'A' ? `รายการเงิน <b>${money} รายการ</b> และไฟล์แนบ <b>${c.storageFiles || 0} ไฟล์</b>` : `รายการเงิน <b>${money} รายการ</b> ไฟล์แนบ <b>${c.storageFiles || 0} ไฟล์</b> ตั้งค่า สิทธิ์ และเลขบัญชีทั้งหมด`;
    body = `<div class="card" style="max-width:660px;border:2px solid var(--bad)"><h3 style="color:var(--bad)">${ms('delete_forever')}ยืนยันการล้างข้อมูล · แบบ ${W.scope}</h3>
        <div class="pwbox bad">${ms('warning')}<span>จะลบ${what} ถาวร · ทุกคนที่เปิดแอปอยู่จะเห็นข้อมูลว่างเมื่อโหลดใหม่</span></div>
        <div class="field" style="margin-top:12px"><label for="cf-t">พิมพ์ <b>${CLEAR_PHRASE}</b> เพื่อยืนยัน</label><input class="inp" id="cf-t" autocomplete="off"></div>
        <div class="field" style="margin-top:10px"><label for="cf-p">รหัสผ่านของคุณ</label><input class="inp" id="cf-p" type="password" autocomplete="current-password"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:10px;flex-wrap:wrap"><button class="btn ghost" data-act="wizStep" data-v="2">${ms('arrow_back')}ย้อนกลับ</button>
          <button class="btn danger" id="cf-go" data-act="trialClear" disabled>${ms('timer')}พิมพ์ข้อความและรหัสผ่านก่อน</button></div>
        <p class="formula" style="margin:12px 0 0">หลังลบ: บันทึกในประวัติระบบว่าใครลบ เมื่อไร แบบไหน (ประวัตินี้ไม่ถูกลบ)</p></div>`;
  }
  return top + stepper + body;
}

// =====================================================================
// รอบที่ 2: ใบเบิกค่าเดินทาง
// =====================================================================
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const dt = (s) => { if (!s) return ''; const [, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]}`; };
const dRange = (a, b) => a === b ? dt(a) : `${dt(a)}–${dt(b)}`;
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const addDays = (s, n) => new Date(Date.parse(s) + n * 864e5).toISOString().slice(0, 10);
const todayTH = () => (ST.trv && ST.trv.today) || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const place = (s) => esc(String(s).split(' · ')[1] || s);
const set = () => ST.settings.settings;
const doc = (no) => ST.trv && ST.trv.list.find((d) => d.no === no);
const avs = (list) => `<span class="avs">${(list || []).map((t) => `<span class="av" title="${esc(t.name)}">${esc((t.name || '?').slice(0, 1))}</span>`).join('')}</span>`;

/** สถานะเคลียร์ตามกฎ 3/5/7 วัน (นับจากวันจบทริป) */
function clearState(d) {
  if (d.status !== 'open') return null;
  const s = set(), n = dayDiff(d.back, todayTH());
  const due = addDays(d.back, s.clearDue);
  if (n > s.clearMax) return { lv: 'late', txt: `เกินกำหนดเคลียร์ ${n - s.clearMax} วัน`, cls: 'p-over', due };
  if (n >= s.clearWarn) return { lv: 'warn', txt: `ใกล้เกินกำหนด (วันที่ ${n} จาก ${s.clearMax})`, cls: 'p-over', due };
  if (n >= s.clearDue) return { lv: 'due', txt: 'ครบกำหนดเคลียร์', cls: 'p-pending', due };
  if (n < 0) return { lv: 'trip', txt: 'อยู่ระหว่างทริป', cls: 'p-open', due };
  return { lv: 'ok', txt: `เคลียร์ภายใน ${dt(due)}`, cls: 'p-open', due };
}
const ST_LABEL = {
  submitted: ['p-pending', 'รออนุมัติ'], returned: ['p-refund', 'ส่งกลับให้แก้ไข'], rejected: ['p-mute', 'ไม่อนุมัติ'], approve: ['p-pending', 'อนุมัติแล้ว · รอโอน'],
  open: ['p-open', 'ได้รับเงิน · รอเคลียร์'], clearSub: ['p-open', 'ส่งเคลียร์แล้ว · รอตรวจ'], refund: ['p-refund', 'รอคืนเงิน'], topup: ['p-topup', 'รอจ่ายส่วนต่าง'], closed: ['p-closed', 'ปิดแล้ว'],
};
function statusPill(d) {
  const cs = clearState(d); if (cs && cs.lv !== 'ok' && cs.lv !== 'trip') return `<span class="pill ${cs.cls}">${cs.txt}</span>`;
  if (d.status === 'rejected' && d.cancelled) return '<span class="pill p-mute">ยกเลิก</span>';
  const m = ST_LABEL[d.status] || ['p-mute', d.status]; return `<span class="pill ${m[0]}">${m[1]}</span>`;
}
function docCard(d, act = 'openDoc') {
  const cs = clearState(d), mine = d.staffId === ST.me.id;
  const hint = mine && d.status === 'returned' ? 'แก้ไขแล้วส่งใหม่' : mine && d.status === 'open' ? (d.clearReturn ? 'admin ส่งเคลียร์กลับให้แก้' : cs ? cs.txt : '') : mine && d.status === 'refund' ? `นำเงินคืน ${fmt(-d.diff)} บาทให้ admin` : '';
  return `<div class="card ccard tcard" role="button" tabindex="0" data-act="${act}" data-v="${d.no}"><div class="row">${statusPill(d)}${!mine && !isAdmin() && !isCeo() ? '<span class="pill p-mute">ร่วมเดินทาง</span>' : ''}<span class="sp amt">${fmt(d.status === 'closed' && d.actual ? d.actual.total : d.requested)}</span></div>
    <b style="font-weight:600">${d.type && d.type !== 'TRV' ? tpill(d.type) + ' ' : ''}${esc(d.title)}</b><span class="route-s">${isAdmin() || isCeo() ? esc(whoOf(d)) + ' · ' : ''}${subLine(d)}</span>
    <div class="row">${avs(d.travelers || [])}<small class="num">${d.no}</small>${hint ? `<span class="sp todo-hint" style="color:var(--warn);font-size:12.5px">${esc(hint)}</span>` : ''}</div></div>`;
}
const listOr = (arr, empty, act) => arr.length ? `<div class="stack">${arr.map((d) => docCard(d, act)).join('')}</div>` : `<div class="card empty">${empty}</div>`;

async function loadTrv() {
  try { ST.trv = await api('trvList'); } catch (e) { fail(e); ST.trv = ST.trv || { list: [], people: [], today: todayTH() }; }
  render();
}
const needTrv = () => { if (!ST.trv) { loadTrv(); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; } return null; };

// ---------- หน้าหลัก ----------
function vDash() {
  const w = needTrv(); if (w) return w;
  const L = ST.trv.list, s = set();
  const sub = L.filter((d) => d.status === 'submitted'), clr = L.filter((d) => d.status === 'clearSub');
  const open = L.filter((d) => d.status === 'open'), late = open.filter((d) => ['late', 'warn'].includes((clearState(d) || {}).lv));
  const payq = L.filter((d) => d.status === 'approve' || (d.status === 'topup' && d.settleSrc === 'BANK'));
  const payAmt = payq.reduce((t, d) => t + (d.status === 'approve' ? d.requested : d.diff), 0);
  const kpi = (v, i, lab, val, meta, tone) => `<button class="card kpi" data-act="go" data-v="${v}"><span class="lab">${ms(i, 'style="font-size:18px"')}${lab}</span><span class="val" ${tone ? `style="color:var(--${tone})"` : ''}>${val}</span><span class="meta">${meta}</span></button>`;
  const lowPc = ST.trv.pcBalance < s.lowAlert;
  return `${trialBanner()}${vHomeNotice()}
    <div class="grid kpis" style="margin-top:12px">
      ${kpi('inbox', 'inbox', 'คำขอรอตรวจ', sub.length + clr.length, `ขอเบิก ${sub.length} · ส่งเคลียร์ ${clr.length}`, sub.length + clr.length ? 'warn' : '')}
      ${kpi('payq', 'approval', 'รอโอน (ผ่านใบเสนอ CEO)', fmt(payAmt), `${payq.length} รายการ${payq.some((d) => !d.batch) ? ` · รอเข้าใบเสนอ ${payq.filter((d) => !d.batch).length}` : ''}`, '')}
      ${kpi('clear', 'fact_check', 'ค้างเคลียร์', open.length, late.length ? `ใกล้/เกินกำหนด ${late.length} ใบ` : 'ไม่มีใบเกินกำหนด', late.length ? 'bad' : '')}
      ${kpi('pc', 'savings', 'เงินสดย่อยคงเหลือ', fmt(ST.trv.pcBalance), lowPc ? `ต่ำกว่า ${fmt(s.lowAlert)} · ควรเติม` : 'ปกติ', lowPc ? 'bad' : '')}</div>
    <div class="grid g2" style="margin-top:14px"><div><h3 style="font-size:14px;color:var(--sub);margin:0 0 8px">ใบเบิกล่าสุด</h3>${listOr(L.slice(0, 6), 'ยังไม่มีใบเบิก · กด "ขอเบิกค่าเดินทาง" เพื่อเริ่ม')}</div>
      <div class="stack">${isAdmin() ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn pri block" data-act="newReq" style="height:44px">${ms('route')}ขอเบิกค่าเดินทาง</button><button class="btn block" data-act="go" data-v="new" style="height:44px">${ms('add')}ใบอื่น (ADV/RMB/EXP)</button></div>` : ''}
      ${(() => { const pen = L.filter((d) => d.status === 'pending'); return pen.length ? `<button class="card kpi" data-act="go" data-v="inbox" style="flex-direction:row;align-items:center;gap:12px">${ms('receipt')}<span style="flex:1;text-align:left">เบิกคืนรอจ่าย ${pen.length} ใบ</span><b class="num">${fmt(pen.reduce((t, d) => t + d.requested, 0))}</b></button>` : ''; })()}
      <button class="card kpi" data-act="go" data-v="report" style="flex-direction:row;align-items:center;gap:12px">${ms('monitoring')}<span style="flex:1;text-align:left">รายงานค่าใช้จ่ายเดือนนี้</span>${ms('chevron_right')}</button></div></div>`;
}
function vHomeNotice() {
  const me = ST.me;
  return me.bankNotice ? `<div class="pwbox bad" style="margin-top:10px">${ms('account_balance')}<span>บัญชีรับโอนของคุณถูกเปลี่ยนเป็น <b>${esc(me.bankNotice.to)}</b> เมื่อ ${dtTime(me.bankNotice.at)} โดย ${esc(me.bankNotice.byName)} · ถ้าคุณไม่ได้แจ้งเปลี่ยน ติดต่อ Admin ทันที</span><button class="btn sm" data-act="ackNotice" style="margin-left:auto">รับทราบ</button></div>` : '';
}

function vMyTrips() {
  const w = needTrv(); if (w) return w;
  const me = ST.me.id, mine = ST.trv.list.filter((d) => (d.travelerIds || []).includes(me)).sort((a, b) => b.go.localeCompare(a.go));
  const todo = mine.filter((d) => d.staffId === me && ['returned', 'open', 'refund'].includes(d.status));
  const done = mine.filter((d) => ['closed', 'rejected'].includes(d.status)), wait = mine.filter((d) => !todo.includes(d) && !done.includes(d));
  const grp = (t, i, l) => l.length ? `<div class="tgrp"><h3>${ms(i, 'style="font-size:18px"')}${t} · ${l.length}</h3>${l.map((d) => docCard(d)).join('')}</div>` : '';
  const bankWarn = !ST.me.bank ? `<div class="pwbox warn" style="margin-bottom:12px">${ms('account_balance')}<span>ยังไม่มีบัญชีรับโอน · แจ้งผู้ดูแลเลขบัญชี (${esc(ST.custodianName)}) เพื่อรับเงินแบบโอน</span></div>` : '';
  return `${trialBanner()}${vHomeNotice()}<div class="hello" style="margin-top:12px"><span class="av">${esc(ST.me.name.slice(0, 1))}</span><div><b>สวัสดี ${esc(ST.me.name)}</b><small>เห็นเฉพาะทริปที่คุณร่วมเดินทาง</small></div><button class="btn pri" data-act="newReq">${ms('add')}ขอเบิกค่าเดินทาง</button></div>${bankWarn}
    <div class="grid g2e" style="align-items:start"><div>${grp('ต้องทำ', 'priority_high', todo)}${grp('รอดำเนินการ', 'hourglass_top', wait)}${mine.length ? '' : '<div class="card empty">ยังไม่มีทริป · กด "ขอเบิกค่าเดินทาง" เพื่อเริ่ม</div>'}</div><div>${grp('ปิดแล้ว', 'task_alt', done)}</div></div>`;
}

function vClaims() {
  const w = needTrv(); if (w) return w;
  const F = ST.claimF || 'all';
  const tabs = [['all', 'ทั้งหมด'], ['submitted', 'รออนุมัติ'], ['pending', 'รอจ่ายคืน'], ['approve', 'รอโอน'], ['open', 'รอเคลียร์'], ['clearSub', 'รอตรวจเคลียร์'], ['refund', 'รอคืนเงิน'], ['topup', 'รอจ่ายส่วนต่าง'], ['closed', 'ปิดแล้ว'], ['rejected', 'ไม่อนุมัติ/ยกเลิก']];
  const q = (ST.claimQ || '').toLowerCase();
  const T = ST.claimT || 'all';
  const L = ST.trv.list.filter((d) => (F === 'all' || d.status === F) && (T === 'all' || (d.type || 'TRV') === T) && (!q || [d.no, d.title, d.staffName, d.payee, d.customer, ...(d.stops || [])].join(' ').toLowerCase().includes(q)));
  return `<div class="toolbar"><input class="inp" id="cq" placeholder="ค้นหาเลขที่ งาน ชื่อ สถานที่" value="${esc(ST.claimQ || '')}" style="min-width:220px;flex:1"><select class="sel" id="cf" aria-label="สถานะ">${tabs.map(([k, l]) => `<option value="${k}" ${F === k ? 'selected' : ''}>${l} (${k === 'all' ? ST.trv.list.length : ST.trv.list.filter((d) => d.status === k).length})</option>`).join('')}</select><select class="sel" id="ct" aria-label="ประเภท">${opts([['all', 'ทุกประเภท'], ...Object.entries(TYPE_LABEL).map(([k, l]) => [k, `${k} · ${l}`])], T)}</select>${isAdmin() ? `<button class="btn pri" data-act="go" data-v="new">${ms('add')}สร้างใบใหม่</button>` : ''}</div>${listOr(L, 'ไม่พบใบเบิก')}`;
}
function vInbox() {
  const w = needTrv(); if (w) return w;
  const sub = ST.trv.list.filter((d) => d.status === 'submitted'), clr = ST.trv.list.filter((d) => d.status === 'clearSub'), ret = ST.trv.list.filter((d) => d.status === 'returned');
  return `<div class="grid g2e" style="align-items:start"><div><div class="tgrp"><h3>${ms('add_road', 'style="font-size:18px"')}ขอเบิกค่าเดินทาง · ${sub.length}</h3>${sub.length ? sub.map((d) => docCard(d)).join('') : '<div class="card empty">ไม่มีคำขอรออนุมัติ</div>'}</div>
    <div class="tgrp"><h3>${ms('fact_check', 'style="font-size:18px"')}ส่งเคลียร์ รอตรวจ · ${clr.length}</h3>${clr.length ? clr.map((d) => docCard(d, 'openClr')).join('') : '<div class="card empty">ไม่มีใบส่งเคลียร์</div>'}</div></div>
    <div>${(() => { const pen = ST.trv.list.filter((d) => d.status === 'pending'); return pen.length ? `<div class="tgrp"><h3>${ms('receipt', 'style="font-size:18px"')}เบิกคืน รอจ่าย · ${pen.length}</h3>${pen.map((d) => docCard(d)).join('')}</div>` : ''; })()}${ret.length ? `<div class="tgrp"><h3>${ms('edit_note', 'style="font-size:18px"')}ส่งกลับให้แก้ · รอส่งใหม่ · ${ret.length}</h3>${ret.map((d) => docCard(d)).join('')}</div>` : ''}</div></div>`;
}
function vClearList() {
  const w = needTrv(); if (w) return w;
  const rank = { late: 0, warn: 1, due: 2, ok: 3, trip: 4 };
  const open = ST.trv.list.filter((d) => d.status === 'open').sort((a, b) => rank[clearState(a).lv] - rank[clearState(b).lv] || a.back.localeCompare(b.back));
  const clr = ST.trv.list.filter((d) => d.status === 'clearSub'), money = ST.trv.list.filter((d) => d.status === 'refund' || (d.status === 'topup' && d.settleSrc !== 'BANK'));
  const s = set();
  return `<p style="margin:0 0 12px;color:var(--sub)">กฎ: เคลียร์ภายใน ${s.clearDue} วันหลังจบทริป · เตือนซ้ำวันที่ ${s.clearWarn} · เกิน ${s.clearMax} วัน = เกินกำหนด</p>
    <div class="grid g2e" style="align-items:start"><div><div class="tgrp"><h3>${ms('pending_actions', 'style="font-size:18px"')}ยังไม่เคลียร์ · ${open.length}</h3>${open.length ? open.map((d) => docCard(d)).join('') : '<div class="card empty">ไม่มีใบค้างเคลียร์</div>'}</div></div>
    <div><div class="tgrp"><h3>${ms('fact_check', 'style="font-size:18px"')}ส่งเคลียร์ รอตรวจ · ${clr.length}</h3>${clr.length ? clr.map((d) => docCard(d, 'openClr')).join('') : '<div class="card empty">ไม่มี</div>'}</div>
      ${money.length ? `<div class="tgrp"><h3>${ms('currency_exchange', 'style="font-size:18px"')}รอรับคืน / รอจ่ายส่วนต่าง · ${money.length}</h3>${money.map((d) => docCard(d)).join('')}</div>` : ''}</div></div>`;
}

// ---------- ฟอร์มขอเบิก ----------
function newForm(d) {
  const s = set();
  if (d) return { editNo: d.no, staffId: d.staffId, travelerIds: d.travelers.map((t) => t.id).filter((x) => x !== d.staffId), title: d.title, go: d.go, back: d.back, stops: [...d.stops], geo: [...(d.geo || d.stops.map(() => null))], kmManual: !!d.kmReason || d.kmCalc == null, km: d.plan.km, kmReason: d.kmReason || '', kmCalc: d.kmCalc, kmWhy: '', rooms: d.plan.rooms, hotelOver: !!d.plan.hotelOver, hotelRate: d.plan.hotelRate || '', hotelReason: d.plan.hotelReason || '', extras: (d.plan.extras || []).map((e) => ({ ...e })), price: d.plan.price };
  const t = todayTH();
  return { staffId: ST.me.id, travelerIds: [], title: '', go: addDays(t, 1), back: addDays(t, 2), stops: [''], geo: [null], kmManual: false, km: '', kmReason: '', kmCalc: null, kmWhy: '', rooms: 1, hotelOver: false, hotelRate: '', hotelReason: '', extras: [], price: s.fuelPrice };
}
function calcForm(f) {
  const s = set(), ddays = f.go && f.back && f.back >= f.go ? dayDiff(f.go, f.back) + 1 : 1, nights = Math.max(0, ddays - 1), people = 1 + f.travelerIds.filter((x) => x !== f.staffId).length;
  const km = f.extNo && f.baseManual && !f.kmManual ? Math.round((f.baseKm + (f.kmCalc != null && f.baseCalc != null ? f.kmCalc - f.baseCalc : 0)) * 10) / 10 : f.kmManual || f.kmCalc == null ? Number(f.km) || 0 : f.kmCalc, rate = f.hotelOver && nights ? Number(f.hotelRate) || 0 : s.hotel, rooms = Math.max(1, Number(f.rooms) || 1);
  const fuel = Math.ceil(km / s.kmPerL * (Number(f.price) || s.fuelPrice)), allowance = people * ddays * s.allowance, hotel = nights * rooms * rate;
  const extras = f.extras.filter((e) => e.desc && Number(e.amount) > 0).reduce((t, e) => t + Number(e.amount), 0);
  return { ddays, nights, people, km, rate, rooms, fuel, allowance, hotel, extras, total: fuel + allowance + hotel + extras };
}
let routeT = null, routeSeq = 0;
function refreshRoute() {
  const f = ST.form; if (!f) return; clearTimeout(routeT);
  const idx = f.stops.map((x, i) => (x.trim() ? i : -1)).filter((i) => i >= 0); const stops = idx.map((i) => f.stops[i].trim()), geo = idx.map((i) => f.geo[i] || null);
  if (!stops.length) { f.kmCalc = null; f.kmWhy = ''; return; }
  const my = ++routeSeq; f.kmLoading = true;
  routeT = setTimeout(async () => {
    const ks = $('#kmStatus'); if (ks && my === routeSeq) ks.innerHTML = '<span class="spin"></span><span>กำลังคำนวณระยะทาง…</span>';
    try { const r = await api('route', { stops, geo }); if (my !== routeSeq || !ST.form) return; f.kmCalc = r.km; f.kmSrc = r.src || null; f.kmWhy = r.why || ''; f.legs = r.legs || null; f.pts = r.pts || null; if (r.src === 'est' && (!f.kmManual || f.kmAuto)) { f.kmManual = true; f.kmAuto = true; f.km = r.km; } else if (r.src !== 'est' && f.kmAuto) { f.kmManual = false; f.kmAuto = false; } }
    catch (e) { if (my === routeSeq && ST.form) { f.kmCalc = null; f.kmWhy = errMsg(e); } }
    if (my === routeSeq && ST.form) { f.kmLoading = false; if (ST.view === 'req') setTimeout(() => { updReq(['#kmField', '.leg']); updCalc(); }, 0); }
    if (my === routeSeq && ST.form) checkOpt(stops, geo, my);
  }, 450);
}
/** แนะนำลำดับเส้นทางที่สั้นกว่า (ไม่สลับเองจนกว่าจะกดปุ่ม) */
async function checkOpt(stops, geo, my) {
  const f = ST.form; f.opt = null;
  if (stops.length < 2 || f.kmCalc == null) { updReq(['#optBar']); return; }
  try { const r = await api('routeOpt', { stops, geo }); if (my !== routeSeq || ST.form !== f) return; f.opt = r.save > 0 ? { ...r, stops, geo } : null; }
  catch (e) { f.opt = null; }
  if (ST.view === 'req') setTimeout(() => updReq(['#optBar']), 0);
}
function optBar(f) {
  const src = (x) => x === 'google' ? 'Google Maps' : x === 'osrm' ? 'OSRM' : 'ค่าประมาณ';
  if (f.optApplied) return `<div id="optBar" class="optbar done">${ms('check_circle', 'style="color:var(--brand)"')}<span class="ob-t"><b>จัดลำดับแล้ว · ประหยัด ${fmt(f.optApplied.save)} กม.</b><small>คำนวณโดย ${src(f.optApplied.src)}</small></span><button class="btn sm" data-act="optUndo">${ms('undo')}ใช้ลำดับเดิม</button></div>`;
  if (!f.opt) return '<div id="optBar" hidden></div>';
  const names = f.opt.order.map((i) => place(f.opt.stops[i])).join(' → ');
  return `<div id="optBar" class="optbar">${ms('alt_route')}<span class="ob-t"><b>สลับลำดับแล้วสั้นลง ${fmt(f.opt.save)} กม.</b><small>${names} · ${fmt(f.opt.km)} กม. แทน ${fmt(f.opt.cur)} กม.</small></span><button class="btn sm pri" data-act="optApply">${ms('swap_vert')}จัดลำดับให้สั้นที่สุด</button></div>`;
}
/** ฟอร์มต่อทริป: ใช้ฟอร์มขอเบิกเดิม แต่ล็อกของเดิมไว้ (สถานที่ ผู้เดินทาง ค่าใช้จ่ายอื่น วันไป) */
function extForm(d) {
  const f = newForm(d); f.editNo = null; f.extNo = d.no; f.lockN = d.stops.length; f.lockEx = (d.plan.extras || []).length; f.lockTrav = d.travelers.map((t) => t.id);
  f.backMin = d.back; f.prevTotal = d.requested; f.note = ''; f.kmManual = false; f.kmAuto = true;
  // ระยะเดิมแก้เอง (ต่างจากที่ระบบคำนวณ) → ใช้ระยะเดิม + ระยะที่ระบบคำนวณเพิ่มจากสถานที่ใหม่
  f.baseKm = d.plan.km; f.baseCalc = d.kmCalc; f.baseManual = d.kmCalc != null && Math.abs(d.plan.km - d.kmCalc) >= 0.5; f.baseReason = d.kmReason || '';
  return f;
}
function vReq() {
  if (!ST.trv) return needTrv();
  const f = ST.form || (ST.form = newForm()); const s = set(), k = calcForm(f), people = ST.trv.people || [];
  const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || (id === ST.me.id ? ST.me.name : id);
  const cur = f.editNo && doc(f.editNo);
  const X = !!f.extNo, lockT = f.lockTrav || [];
  const staffSel = isAdmin() && !X ? `<div class="field full"><label for="f-staff">ผู้รับเงิน (รับเงินและรับผิดชอบเคลียร์)</label><select class="sel" id="f-staff" data-f="staffId" ${f.editNo ? 'disabled' : ''}>${people.filter((p) => p.role === 'user' || p.role === 'admin').map((p) => `<option value="${p.id}" ${p.id === f.staffId ? 'selected' : ''}>${esc(p.name)}${p.hasBank ? '' : ' (ยังไม่มีบัญชีรับโอน)'}</option>`).join('')}</select></div>` : '';
  const others = people.filter((p) => p.id !== f.staffId);
  const trav = `<div class="field full"><label>ผู้เดินทาง <span class="num">${k.people}</span> คน <span style="font-weight:400">· เบี้ยเลี้ยงคิดตามจำนวนคน</span></label>
    <div class="chips"><span class="chip" style="border-color:var(--brand)">${ms('person', 'style="font-size:16px"')}${esc(nameOf(f.staffId))} · ผู้รับเงิน</span>${f.travelerIds.filter((x) => x !== f.staffId).map((id) => `<span class="chip">${esc(nameOf(id))}${X && lockT.includes(id) ? '' : `<button class="btn sm ghost" style="height:20px;padding:0 2px" data-act="travDel" data-v="${id}" aria-label="เอา ${esc(nameOf(id))} ออก">${ms('close', 'style="font-size:16px"')}</button>`}</span>`).join('')}</div>
    ${others.filter((p) => !f.travelerIds.includes(p.id)).length ? `<select class="sel" id="f-addtrav" style="margin-top:6px;max-width:280px"><option value="">+ เพิ่มผู้เดินทาง</option>${others.filter((p) => !f.travelerIds.includes(p.id)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>` : ''}</div>`;
  const custs = ST.settings.customers || [];
  const stops = `<div class="field full"><label>สถานที่ (ตามลำดับที่ไป)</label><div class="route">
      <div class="stop ro"><span class="pin home">${ms('home', 'style="font-size:15px"')}</span><span>${esc(ST.settings.home.name)}</span><span></span></div>
      ${f.stops.map((x, i) => X && i < f.lockN ? `<div class="stop ro"><span class="pin">${i + 1}</span><span>${esc(x)} <span class="pill p-mute" style="margin-left:4px">เดิม</span></span><span class="leg" id="leg-${i}">${f.legs && f.legs[i] != null && f.kmCalc != null ? fmt(f.legs[i]) + ' กม.' : ''}</span></div>` : `<div class="stop"><span class="pin">${i + 1}</span><input class="inp" id="f-stop-${i}" data-stop="${i}" value="${esc(x)}" placeholder="พิมพ์ชื่อลูกค้า / สถานที่ แล้วเลือกจากรายการ" aria-label="สถานที่ที่ ${i + 1}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="ta-${i}" aria-expanded="false">${f.geo[i] ? `<span class="ta-ok" title="ได้พิกัดจาก Google Maps">${ms('location_on', 'style="font-size:16px"')}</span>` : ''}<div class="ta" id="ta-${i}" role="listbox" hidden></div>
        <span class="leg" id="leg-${i}">${f.legs && f.legs[i] != null && f.kmCalc != null ? fmt(f.legs[i]) + ' กม.' : ''}</span>${f.stops.length > 1 && !(X && i < f.lockN) ? `<button class="xbtn" data-act="stopDel" data-v="${i}" aria-label="ลบสถานที่ที่ ${i + 1}">${ms('close', 'style="font-size:18px"')}</button>` : '<span></span>'}</div>`).join('')}
      <div class="stop ro"><span class="pin home">${ms('home', 'style="font-size:15px"')}</span><span>กลับ ${esc(ST.settings.home.name)}</span><span class="leg" id="leg-back">${f.legs && f.kmCalc != null ? fmt(f.legs[f.legs.length - 1]) + ' กม.' : ''}</span></div></div>
    <datalist id="custList">${custs.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
    ${X ? '' : optBar(f)}
    <button class="btn sm" style="align-self:flex-start;margin-top:6px" data-act="stopAdd">${ms('add_location_alt')}${X ? 'เพิ่มสถานที่ต่อ' : 'เพิ่มสถานที่'}</button></div>`;
  const kmBox = `<div class="field full" id="kmField"><label>ระยะทางไป-กลับ</label><div class="kmbox">${ms('route')}
      <span id="kmStatus" style="display:contents">${f.kmLoading ? '<span class="spin"></span><span>กำลังคำนวณระยะทาง…</span>' : f.kmCalc != null ? (f.kmSrc === 'est' ? `<span>ประมาณ <b class="num">${fmt(f.kmCalc)}</b> กม. <span style="color:var(--warn)">(เส้นตรง × 1.3 · บริการแผนที่ใช้ไม่ได้ตอนนี้ ตรวจแล้วแก้ได้ ไม่ต้องใส่เหตุผล)</span></span>` : `<span>ระบบคำนวณ <b class="num">${fmt(f.kmCalc)}</b> กม. (${f.kmSrc === 'google' ? 'Google Maps' : f.kmSrc === 'osrm' ? 'OSRM · OpenStreetMap' : 'OpenRouteService'})</span>${f.pts ? `<a class="btn sm ghost" href="${gmLink(f.pts)}" target="_blank" rel="noopener">${ms('map')}ดูเส้นทาง</a>` : ''}`) : `<span style="color:var(--sub)">${esc(f.kmWhy || 'ใส่สถานที่เพื่อคำนวณ')}</span>`}</span>
      ${f.kmCalc != null ? `<label class="ckl" style="margin-left:auto"><input type="checkbox" id="f-kmman" data-fchk="kmManual" ${f.kmManual ? 'checked' : ''}> แก้ระยะเอง</label>` : ''}</div>
      ${f.extNo && f.baseManual && !f.kmManual ? `<p class="formula" style="margin:8px 0 0">ระยะเดิมแก้เองไว้ ${fmt(f.baseKm)} กม. (ระบบคำนวณเดิม ${fmt(f.baseCalc)}) · ใช้ระยะเดิม + ส่วนที่เพิ่มตามระบบ = <b>${fmt(calcForm(f).km)}</b> กม.</p>` : ''}
      ${f.kmManual || f.kmCalc == null ? `<div class="fgrid" style="margin-top:8px"><div class="field"><label for="f-km">ระยะทางไป-กลับ (กม.)</label><input class="inp num" type="number" inputmode="decimal" id="f-km" data-f="km" value="${esc(f.km)}"></div>
        <div class="field"><label for="f-kmr">เหตุผล${f.kmCalc != null && f.kmSrc !== 'est' ? ' <span style="color:var(--bad)">*</span>' : ' (ถ้ามี)'}</label><input class="inp" id="f-kmr" data-f="kmReason" value="${esc(f.kmReason)}" placeholder="${f.kmCalc != null ? 'เช่น ถนนปิด ต้องอ้อม' : 'เช่น วัดจากไมล์รถ'}"></div></div>` : ''}</div>`;
  const hotel = k.nights ? `<div class="field full" id="hotelField"><label class="ckl"><input type="checkbox" id="f-hov" data-fchk="hotelOver" ${f.hotelOver ? 'checked' : ''}> ขอที่พักเกินอัตรา (${fmt(s.hotel)} บาท/ห้อง/คืน)</label>
      ${f.hotelOver ? `<div class="hotelover"><div class="fgrid"><div class="field"><label for="f-hr">ราคาที่ขอ (บาท/ห้อง/คืน)</label><input class="inp num" type="number" id="f-hr" data-f="hotelRate" value="${esc(f.hotelRate)}">${Number(f.hotelRate) > s.hotelWarn ? `<span class="hint" style="color:var(--bad)">เกินยอดเตือน ${fmt(s.hotelWarn)}</span>` : ''}</div><div class="field"><label for="f-hre">เหตุผล</label><input class="inp" id="f-hre" data-f="hotelReason" value="${esc(f.hotelReason)}" placeholder="เช่น ใกล้หน้างาน ห้องอัตราปกติเต็ม"></div></div></div>` : ''}</div>` : '';
  const extras = `<div class="field full"><label>ค่าใช้จ่ายอื่น (ถ้ามี) · ตอนเคลียร์ต้องแนบใบเสร็จทุกรายการ</label><div class="items">${f.extras.map((e, i) => X && i < f.lockEx ? `<div class="irow"><span>${esc(e.desc)} <span class="pill p-mute">เดิม</span></span><span style="color:var(--sub)">${esc(e.cat)}</span><b class="num" style="text-align:right">${fmt(e.amount)}</b><span></span></div>` : `<div class="irow"><input class="inp" id="f-exd-${i}" data-ex="${i}:desc" value="${esc(e.desc)}" placeholder="รายการ เช่น ค่าทางด่วน"><select class="sel" id="f-exc-${i}" data-ex="${i}:cat">${ST.settings.cats.map((c) => `<option ${c === e.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><input class="inp num" type="number" id="f-exa-${i}" data-ex="${i}:amount" value="${esc(e.amount)}" placeholder="บาท"><button class="xbtn" data-act="exDel" data-v="${i}" aria-label="ลบรายการ">${ms('close', 'style="font-size:18px"')}</button></div>`).join('')}
      <button class="btn sm" style="align-self:flex-start" data-act="exAdd">${ms('add')}เพิ่มค่าใช้จ่ายอื่น</button></div></div>`;
  return `${cur && cur.returnNote && cur.status === 'returned' ? `<div class="banner warn" style="margin-bottom:12px">${ms('edit_note')}<span>admin ส่งกลับให้แก้: <b>${esc(cur.returnNote)}</b></span></div>` : ''}
    <div class="grid g2"><div class="card"><div class="fgrid">${staffSel}${trav}
      <div class="field full"><label for="f-title">งาน</label><input class="inp" id="f-title" data-f="title" placeholder="เช่น ติดตั้งเครื่องคัดสี" value="${esc(f.title)}" ${X ? 'readonly' : ''}></div>
      <div class="field"><label for="f-go">วันไป</label><input class="inp" type="date" id="f-go" data-f="go" value="${f.go}" ${X ? 'readonly' : ''}></div>
      <div class="field"><label for="f-back">วันกลับ${X ? ' (ขยายได้)' : ''}</label><input class="inp" type="date" id="f-back" data-f="back" value="${f.back}" ${X ? `min="${f.backMin}"` : ''}></div>
      ${stops}${kmBox}
      <div class="field"><label for="f-rooms">จำนวนห้องต่อคืน</label><input class="inp num" type="number" inputmode="numeric" id="f-rooms" data-f="rooms" value="${esc(f.rooms)}"></div>
      ${hotel || '<div id="hotelField" hidden></div>'}${extras}
      <div class="field full"><label>อัตราที่ใช้ ${ms('lock', 'style="font-size:15px;vertical-align:-3px"')} <span style="font-weight:400">ตั้งโดย admin</span></label><div class="lockrates"><span>อัตราสิ้นเปลือง</span><b>${s.kmPerL} กม./ลิตร</b><span>ราคาน้ำมัน</span><b>${f.price} บาท/ลิตร</b><span>เบี้ยเลี้ยง</span><b>${fmt(s.allowance)} บาท/คน/วัน</b><span>ที่พัก</span><b>${fmt(s.hotel)} บาท/ห้อง/คืน</b></div></div>
    </div></div>
    <div class="card calc"><div id="calcBody"><h3>${ms('calculate')}ยอดที่ขอเบิก<span class="r">${k.ddays} วัน ${k.nights} คืน · ${k.people} คน</span></h3><div class="lines">
      <div><span>ค่าน้ำมัน<br><span class="f">${fmt(k.km)} กม. ÷ ${s.kmPerL} × ${f.price}</span></span><b>${fmt(k.fuel)}</b></div>
      <div><span>เบี้ยเลี้ยง<br><span class="f">${k.people} คน × ${k.ddays} วัน × ${fmt(s.allowance)}</span></span><b>${fmt(k.allowance)}</b></div>
      <div><span>ที่พัก<br><span class="f">${k.nights} คืน × ${k.rooms} ห้อง × ${fmt(k.rate)}${f.hotelOver && k.nights ? ' <span class="overpill">เกินอัตรา</span>' : ''}</span></span><b>${fmt(k.hotel)}</b></div>
      ${k.extras ? `<div><span>ค่าใช้จ่ายอื่น</span><b>${fmt(k.extras)}</b></div>` : ''}</div>
      ${X ? `<div class="lines" style="margin-top:8px"><div><span>ยอดใหม่ทั้งทริป</span><b>${fmt(k.total)}</b></div><div><span>หัก ยอดที่ได้รับแล้ว</span><b>−${fmt(f.prevTotal)}</b></div></div><div class="diffbox ${k.total - f.prevTotal > 0 ? 'topup' : 'even'}" style="margin:12px 0 14px"><span>ขอเงินเพิ่ม (ต่อทริป)</span><b>${fmt(Math.max(0, k.total - f.prevTotal))} บาท</b></div>${k.total < f.prevTotal ? '<p class="formula" style="color:var(--bad);margin:0 0 10px">ยอดใหม่น้อยกว่าเดิม · ต่อทริปใช้เพิ่มรายการเท่านั้น</p>' : ''}</div>
      <div class="field" style="margin-bottom:10px"><label for="f-note">เหตุผลที่ต่อทริป</label><input class="inp" id="f-note" data-f="note" value="${esc(f.note || '')}" placeholder="เช่น ลูกค้าขอให้แวะอีกโรงสี"></div>` : `<div style="display:flex;justify-content:space-between;align-items:baseline;margin:12px 0 14px"><span>รวม</span><span class="big">${fmt(k.total)}</span></div></div>`}
      <button class="btn pri block" data-act="submitReq">${ms('send')}${X ? 'ส่งคำขอต่อทริป' : f.editNo ? (isAdmin() && f.staffId !== ST.me.id ? 'บันทึกการแก้ไข' : 'ส่งใหม่ให้ admin') : 'ส่งคำขอให้ admin'}</button>
      <button class="btn ghost block" data-act="cancelForm" style="margin-top:6px">ยกเลิก</button>
      <p class="formula" style="margin:10px 0 0">${X ? 'admin อนุมัติแล้วจ่ายส่วนเพิ่มจากเงินสดย่อย หรือโอนผ่านใบเสนอ CEO · ระหว่างรอ ยังส่งเคลียร์ไม่ได้' : 'admin ตรวจและอนุมัติ แล้วจ่ายเงินสดย่อยหรือโอนเข้าบัญชีผู้รับเงิน'}</p></div></div>`;
}

// ---------- รายละเอียดใบ (drawer) ----------
function openDrawer(html) { $('#drawer').innerHTML = html; $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); }
function closeDrawer() { $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); ST.openNo = null; }
const fileBtn = (f, label) => f ? `<button class="btn sm" data-act="fileView" data-v="${esc(f.path)}">${ms(f.type === 'application/pdf' ? 'picture_as_pdf' : 'image')}${esc(label || f.name || 'ไฟล์')}</button>` : '';
function drawDoc(no) {
  const d = doc(no); if (!d) { closeDrawer(); return; }
  if (d.type && d.type !== 'TRV') { ST.openNo = no; drawOther(d); return; }
  ST.openNo = no; const p = d.plan, me = ST.me.id, lead = d.staffId === me, s = set();
  const lines = `<div class="lines"><div><span>ค่าน้ำมัน<br><span class="f">${fmt(p.km)} กม. ÷ ${s.kmPerL} × ${p.price}</span></span><b>${fmt(p.fuel)}</b></div>
      <div><span>เบี้ยเลี้ยง<br><span class="f">${p.people} คน × ${p.days} วัน</span></span><b>${fmt(p.allowance)}</b></div>
      <div><span>ที่พัก<br><span class="f">${p.nights} คืน × ${p.rooms} ห้อง × ${fmt(p.rate)}${p.hotelOver ? ` <span class="overpill">เกินอัตรา</span><br>เหตุผล: ${esc(p.hotelReason)}` : ''}</span></span><b>${fmt(p.hotel)}</b></div>
      ${(p.extras || []).map((e) => `<div><span>${esc(e.desc)}<br><span class="f">${esc(e.cat)}</span></span><b>${fmt(e.amount)}</b></div>`).join('')}
      <div class="tot"><span>ยอดเบิก</span><b>${fmt(d.requested)}</b></div></div>`;
  const km = d.kmCalc != null && d.kmSrc === 'est' ? `<div class="banner warn">${ms('route')}<span>ระยะทางประมาณจากเส้นตรง ${fmt(d.kmCalc)} กม. (บริการแผนที่ใช้ไม่ได้ตอนส่ง) · ขอ <b>${fmt(p.km)}</b> กม.${d.kmReason ? ` · ${esc(d.kmReason)}` : ''} · ตรวจก่อนอนุมัติ</span></div>` : d.kmCalc != null ? (d.kmReason ? `<div class="banner warn">${ms('route')}<span>ระบบคำนวณ <b>${fmt(d.kmCalc)}</b> กม. · ขอ <b>${fmt(p.km)}</b> กม. · เหตุผล: ${esc(d.kmReason)}</span></div>` : '') : `<div class="banner info">${ms('route')}<span>ระยะทางกรอกเอง ${fmt(p.km)} กม.${d.kmReason ? ` · ${esc(d.kmReason)}` : ''}</span></div>`;
  const act = actionsFor(d, lead) + (isCust() && ST.trialMode ? `<div style="border-top:1px dashed var(--line);padding-top:10px"><button class="btn block" style="color:var(--bad);border-color:var(--bad)" data-act="delAsk">${ms('delete_forever')}ลบใบนี้ (โหมดทดลอง)</button><div id="delBox"></div></div>` : '');
  const mapBtn = d.routePts ? `<a class="btn sm" href="${gmLink(d.routePts)}" target="_blank" rel="noopener">${ms('map')}เปิดเส้นทางใน Google Maps</a>` : '';
  const actual = d.actual ? `<div class="card"><h3>${ms('fact_check')}ผลเคลียร์</h3><div class="lines"><div><span>น้ำมันจริง</span><b>${fmt(d.actual.fuel)}</b></div><div><span>เบี้ยเลี้ยง ${d.actual.people} คน × ${d.actual.days} วัน</span><b>${fmt(d.actual.allowance)}</b></div><div><span>ที่พัก ${d.actual.nights} คืน${d.actual.hotelExcess > 0 ? `<br><span class="f">เกินที่อนุมัติ ${fmt(d.actual.hotelExcess)} · ${d.actual.hotelExApproved ? 'อนุมัติแล้ว' : 'ไม่คืนส่วนนี้'}</span>` : ''}</span><b>${fmt(d.actual.hotel)}</b></div>${(d.actual.extras || []).map((e) => `<div><span>${esc(e.desc)}${e.why ? `<br><span class="f">ไม่มีใบเสร็จ: ${esc(e.why)}</span>` : ''}</span><b>${fmt(e.counted)}</b></div>`).join('')}<div class="tot"><span>ใช้จริง</span><b>${fmt(d.actual.total)}</b></div></div>
      <div class="diffbox ${d.diff < 0 ? 'refund' : d.diff > 0 ? 'topup' : 'even'}" style="margin-top:10px"><span>${d.diff < 0 ? 'ทีมงานคืนเงิน' : d.diff > 0 ? 'บริษัทจ่ายเพิ่ม' : 'พอดี'}</span><b>${fmt(Math.abs(d.diff))} บาท</b></div>
      ${(d.actual.files || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${d.actual.files.map((f, i) => fileBtn(f, `ใบเสร็จ ${i + 1}`)).join('')}</div>` : ''}</div>` : '';
  const pay = d.payment ? `<div class="lines" style="margin-top:6px"><div><span>โอนเมื่อ ${dt(d.payment.date)} · ${esc(d.payment.bank)}${d.payment.batch ? ` · ${esc(d.payment.batch)}` : ''}${d.payment.bankChanged ? ' <span class="pill p-pending">บัญชีเพิ่งเปลี่ยน · ยืนยันแล้ว</span>' : ''}</span>${fileBtn(d.payment.slip, 'สลิป')}</div></div>` : '';
  openDrawer(`<div class="dh"><div><div style="display:flex;gap:8px;align-items:center"><span class="tpill t-TRV">TRV</span>${statusPill(d)}</div><h2 class="num">${d.no}</h2></div><button class="btn sm ghost x" data-act="closeDrawer" aria-label="ปิด">${ms('close')}</button></div>
    <div class="db">${d.batch ? `<div class="banner info">${ms('approval')}<span>อยู่ในใบเสนอ CEO <b class="num">${esc(d.batch)}</b> · รอขั้นตอนโอน</span></div>` : ''}${d.ceoNote && !d.batch && ['approve', 'topup'].includes(d.status) ? `<div class="banner warn">${ms('edit_note')}<span>CEO: <b>${esc(d.ceoNote)}</b> · กลับมารอเข้าใบเสนอใหม่</span></div>` : ''}
      ${d.returnNote && d.status === 'returned' ? `<div class="banner warn">${ms('edit_note')}<span>ส่งกลับให้แก้: <b>${esc(d.returnNote)}</b></span></div>` : ''}
      ${d.rejectNote && d.status === 'rejected' ? `<div class="banner bad">${ms('block')}<span>${d.cancelled ? 'ยกเลิก' : 'ไม่อนุมัติ'}: <b>${esc(d.rejectNote)}</b></span></div>` : ''}
      ${d.clearReturn && d.status === 'open' ? `<div class="banner warn">${ms('edit_note')}<span>ส่งเคลียร์กลับให้แก้: <b>${esc(d.clearReturn)}</b></span></div>` : ''}
      <div class="card"><b style="font-size:16px">${esc(d.title)}</b><dl class="kv" style="margin-top:8px"><dt>ผู้รับเงิน</dt><dd>${esc(d.staffName)}</dd><dt>ผู้เดินทาง</dt><dd>${d.travelers.map((t) => esc(t.name)).join(', ')}</dd><dt>วันที่</dt><dd>${dRange(d.go, d.back)} (${p.days} วัน ${p.nights} คืน)</dd><dt>สถานที่</dt><dd>${d.stops.length} แห่ง · ${fmt(p.km)} กม. ไป-กลับ</dd><dt>จ่ายโดย</dt><dd>${d.paidFrom === 'PC' ? 'เงินสดย่อย' : d.paidFrom === 'BANK' ? 'โอนเข้าบัญชี' : '—'}</dd></dl>${pay}</div>
      ${extCards(d)}${voucherBtn(d)}
      ${routeCard(d, mapBtn)}${km}<div class="card"><h3>${ms('calculate')}ยอดที่ขอเบิก</h3>${lines}</div>${actual}
      <div class="card"><h3>${ms('history')}ความเคลื่อนไหว</h3><ul class="tl">${d.timeline.map((t) => `<li>${esc(t.text)}${t.amt != null ? ` · <b class="num">${fmt(t.amt)}</b>` : ''}<small>${dtTime(t.at)} · ${esc(t.byName)}</small></li>`).join('')}</ul></div>
    </div>${act ? `<div class="df">${act}</div>` : ''}`);
}
function actionsFor(d, lead) {
  const pc = ST.trv.pcBalance, pp = (ST.trv.people || []).find((x) => x.id === d.staffId) || {};
  if (isAdmin()) {
    if (d.status === 'submitted') return `<div class="srcpick"><label><input type="radio" name="src" value="PC" ${pc >= d.requested ? '' : 'disabled'}> เงินสดย่อย<br><small style="color:var(--sub)">เหลือ ${fmt(pc)}</small></label><label><input type="radio" name="src" value="BANK" ${pc >= d.requested ? '' : 'checked'} ${pp.hasBank ? '' : 'disabled'}> โอนเข้าบัญชี<br><small style="color:var(--sub)">${pp.hasBank ? (pp.bankPending ? 'บัญชีเพิ่งเปลี่ยน' : 'มีบัญชีรับโอน') : 'ยังไม่มีบัญชี'}</small></label></div>
      <button class="btn pri block" data-act="decide" data-v="approve">${ms('check')}อนุมัติ</button>
      <div style="display:flex;gap:8px"><button class="btn" style="flex:1" data-act="editReq">${ms('edit')}แก้ไข</button><button class="btn" style="flex:1" data-act="decideAsk" data-v="return">${ms('undo')}ส่งกลับแก้</button><button class="btn" style="flex:1" data-act="decideAsk" data-v="reject">${ms('block')}ไม่อนุมัติ</button></div>
      <div id="noteBox"></div>`;
    if (d.status === 'approve') return `<button class="btn pri block" data-act="go" data-v="payq">${ms('approval')}ไปที่ขออนุมัติโอน</button><button class="btn block" data-act="decideAsk" data-v="cancel">${ms('block')}ยกเลิกใบนี้</button><div id="noteBox"></div>`;
    if (d.status === 'open' && d.extReq) return `<div class="srcpick"><label><input type="radio" name="xsrc" value="PC" ${pc >= d.extReq.amount ? 'checked' : 'disabled'}> จ่ายเงินสดย่อย<br><small style="color:var(--sub)">เหลือ ${fmt(pc)}</small></label><label><input type="radio" name="xsrc" value="BANK" ${pc >= d.extReq.amount ? '' : 'checked'} ${pp.hasBank ? '' : 'disabled'}> โอนผ่านใบเสนอ CEO<br><small style="color:var(--sub)">${pp.hasBank ? 'เข้ารายการขออนุมัติโอน' : 'ยังไม่มีบัญชี'}</small></label></div>
      <button class="btn pri block" data-act="extOk">${ms('check')}อนุมัติต่อทริป (+${fmt(d.extReq.amount)})</button><button class="btn block" data-act="extNoAsk">${ms('block')}ไม่อนุมัติ</button><div id="noteBox"></div>`;
    if (d.status === 'open' && d.extPay) return d.extPay.batch ? `<button class="btn block" data-act="go" data-v="payq">${ms('approval')}เงินต่อทริปอยู่ในใบเสนอ ${esc(d.extPay.batch)}</button>` : `<button class="btn pri block" data-act="go" data-v="payq">${ms('approval')}ไปที่ขออนุมัติโอน (ต่อทริป ${fmt(d.extPay.amount)})</button><button class="btn block" data-act="extCancel">${ms('undo')}ยกเลิกการต่อทริป (กลับเป็นแผนเดิม)</button>`;
    if (d.status === 'open') return `<button class="btn block" data-act="openExt" data-v="${d.no}">${ms('add_location_alt')}ต่อทริป / เพิ่มสถานที่</button><button class="btn block" data-act="openClr" data-v="${d.no}">${ms('fact_check')}เคลียร์แทนทีมงาน</button>`;
    if (d.status === 'clearSub') return `<button class="btn pri block" data-act="openClr" data-v="${d.no}">${ms('fact_check')}ตรวจผลเคลียร์</button>`;
    if (d.status === 'refund') return `<p class="formula" style="margin:0">รอ ${esc(d.staffName)} คืนเงิน <b>${fmt(-d.diff)}</b> บาท</p><div class="srcpick"><label><input type="radio" name="rhow" value="PC" checked> รับเงินสด (เข้าเงินสดย่อย)</label><label><input type="radio" name="rhow" value="BANK"> โอนคืนเข้าบัญชี</label></div>
      <div class="field" id="rslipBox" hidden><label for="r-slip">สลิปที่ทีมงานโอนคืน</label><input class="inp" type="file" id="r-slip" accept="image/*,application/pdf" style="padding-top:6px"></div><button class="btn pri block" data-act="refundOk">${ms('task_alt')}รับเงินคืนแล้ว · ปิดใบ</button>`;
    if (d.status === 'topup' && d.settleSrc === 'BANK') return `<button class="btn pri block" data-act="go" data-v="payq">${ms('approval')}ไปที่ขออนุมัติโอน (ส่วนต่าง ${fmt(d.diff)})</button>`;
    return '';
  }
  if (!lead) return isCeo() ? '' : `<p class="formula" style="margin:0">${ms('visibility', 'style="font-size:16px;vertical-align:-3px"')} คุณร่วมเดินทางในทริปนี้ · ผู้รับเงินคือ ${esc(d.staffName)}</p>`;
  if (d.status === 'returned' || d.status === 'submitted') return `<button class="btn pri block" data-act="editReq">${ms('edit')}${d.status === 'returned' ? 'แก้ไขและส่งใหม่' : 'แก้ไขคำขอ'}</button><button class="btn block" data-act="decideAsk" data-v="cancel">${ms('block')}ยกเลิกคำขอ</button><div id="noteBox"></div>`;
  if (d.status === 'open' && d.extReq) return `<p class="formula" style="margin:0">ส่งคำขอต่อทริปแล้ว (+${fmt(d.extReq.amount)} บาท) · รอ admin อนุมัติ</p>`;
  if (d.status === 'open' && d.extPay) return `<p class="formula" style="margin:0">อนุมัติต่อทริปแล้ว · รอโอนเงินเพิ่ม ${fmt(d.extPay.amount)} บาท · หลังได้รับเงินจึงส่งเคลียร์ได้</p>`;
  if (d.status === 'open') return `<button class="btn pri block" data-act="openClr" data-v="${d.no}">${ms('fact_check')}ส่งเคลียร์ (หลังจบทริป)</button><button class="btn block" data-act="openExt" data-v="${d.no}">${ms('add_location_alt')}ต่อทริป / เพิ่มสถานที่</button>`;
  const t = { approve: 'อนุมัติแล้ว รอโอนเงินเข้าบัญชี', clearSub: 'ส่งเคลียร์แล้ว รอ admin ตรวจ', refund: `นำเงินคืน ${fmt(-d.diff)} บาทให้ admin แล้ว admin จะปิดใบให้`, topup: `จะได้รับเงินเพิ่ม ${fmt(d.diff)} บาท`, closed: 'ทริปนี้ปิดแล้ว', rejected: 'คำขอนี้ไม่ได้รับอนุมัติ' }[d.status];
  return t ? `<p class="formula" style="margin:0">${t}</p>` : '';
}

// ---------- เคลียร์ ----------
function newClr(d) {
  if (d.clearSub) return JSON.parse(JSON.stringify({ fuel: d.clearSub.fuel, people: d.clearSub.people, days: d.clearSub.days, stays: d.clearSub.stays || [], ex: d.clearSub.ex || [], files: d.clearSub.files || [], note: d.clearSub.note || '', hotelEx: false, exOver: false, src: 'PC' }));
  return { fuel: '', people: d.plan.people, days: d.plan.days, stays: d.plan.nights ? [{ from: d.go, to: addDays(d.back, -1), rate: '' }] : [], ex: (d.plan.extras || []).map(() => ({ amount: '', file: null, noRcpt: false, why: '' })), files: [], note: '', hotelEx: false, exOver: false, src: 'PC' };
}
function clrCalc(d, k) {
  const s = set(), p = d.plan, allowance = (Number(k.people) || 0) * (Number(k.days) || 0) * s.allowance, cap = (p.rooms || 1) * (p.rate || s.hotel);
  const m = new Map(); let err = '';
  k.stays.forEach((st) => { if (!st.from || !st.to || st.to < st.from) { err = 'วันที่ที่พักไม่ถูกต้อง'; return; } if (st.from < d.go || st.to > d.back) { err = 'วันที่ที่พักต้องอยู่ในช่วงทริป'; return; } if (st.rate === '' || st.rate == null) { err = 'ใส่ราคาที่พักให้ครบทุกช่วง'; return; } for (let i = 0; i <= dayDiff(st.from, st.to); i++) { const x = addDays(st.from, i); if (m.has(x)) err = 'ช่วงวันที่ที่พักซ้ำกัน'; m.set(x, Number(st.rate) || 0); } });
  const nights = [...m.values()], hotelClaim = nights.reduce((t, a) => t + a, 0), hotelCap = nights.reduce((t, a) => t + Math.min(a, cap), 0), hotelExcess = hotelClaim - hotelCap;
  const hotel = k.hotelEx ? hotelClaim : hotelCap;
  const ex = (p.extras || []).map((e, i) => { const r = k.ex[i] || {}, act = Number(r.amount) || 0; return { ...e, actual: act, counted: k.exOver ? act : Math.min(act, e.amount), filled: r.amount !== '' && r.amount != null, ok: !!r.file || (r.noRcpt && String(r.why || '').trim()) }; });
  const extras = ex.reduce((t, e) => t + e.counted, 0), exOver = ex.reduce((t, e) => t + Math.max(0, e.actual - e.amount), 0);
  if (!err && ex.some((e) => !e.filled)) err = 'ใส่ยอดจริงของค่าใช้จ่ายอื่นให้ครบ';
  if (!err && ex.some((e) => !e.ok)) err = 'ค่าใช้จ่ายอื่นทุกรายการต้องแนบใบเสร็จ หรือติ๊กไม่มีใบเสร็จพร้อมเหตุผล';
  if (k.fuel === '' || k.fuel == null) err = err || 'ใส่ค่าน้ำมันจริง';
  const total = (Number(k.fuel) || 0) + allowance + hotel + extras;
  return { allowance, nights: nights.length, hotelClaim, hotelExcess, hotel, cap, ex, extras, exOver, total, err };
}
function vClr() {
  const d = doc(ST.clrNo); if (!d || !(d.status === 'open' || (isAdmin() && d.status === 'clearSub')) || (!isAdmin() && d.staffId !== ST.me.id)) { ST.view = isAdmin() ? 'clear' : 'home'; return isAdmin() ? vClearList() : vMyTrips(); }
  const k = ST.clr || (ST.clr = newClr(d)); const r = clrCalc(d, k), diff = r.total - d.requested, s = set();
  const adminRev = isAdmin();
  const stays = `<div class="field full"><label>ที่พัก (ตามจริง · กรอกเป็นช่วงวันที่) · อนุมัติไว้ ${fmt(d.plan.rate)} × ${d.plan.rooms} ห้อง/คืน</label><div class="items">${k.stays.map((st, i) => `<div class="stay"><div class="sd"><input class="inp" type="date" id="st-f-${i}" data-st="${i}:from" value="${st.from}" min="${d.go}" max="${d.back}" aria-label="ตั้งแต่"><span>ถึง</span><input class="inp" type="date" id="st-t-${i}" data-st="${i}:to" value="${st.to}" min="${d.go}" max="${d.back}" aria-label="ถึง"></div><div class="sr"><input class="inp num" type="number" id="st-r-${i}" data-st="${i}:rate" value="${esc(st.rate)}" placeholder="บาท/คืน" aria-label="ราคาต่อคืน"><button class="xbtn" data-act="stayDel" data-v="${i}" aria-label="ลบช่วง">${ms('close', 'style="font-size:18px"')}</button></div></div>`).join('')}
      <button class="btn sm" style="align-self:flex-start" data-act="stayAdd">${ms('add')}เพิ่มช่วงที่พัก</button></div>
      ${r.hotelExcess > 0 ? (adminRev ? `<label class="ckl excheck"><input type="checkbox" id="c-hex" data-cchk="hotelEx" ${k.hotelEx ? 'checked' : ''}> อนุมัติส่วนเกินที่พัก <b>${fmt(r.hotelExcess)}</b> บาท (ไม่ติ๊ก = ไม่คืนส่วนนี้)</label>` : `<div class="banner warn" style="margin-top:8px">${ms('hotel')}<span>ที่พักเกินที่อนุมัติ <b>${fmt(r.hotelExcess)}</b> บาท · รอ admin พิจารณา</span></div>`) : ''}</div>`;
  const ex = r.ex.length ? `<div class="field full"><label>ค่าใช้จ่ายอื่นที่ขอไว้ · ใส่ยอดจริงและแนบใบเสร็จทุกรายการ</label><div class="items">${r.ex.map((e, i) => { const x = k.ex[i];
      return `<div class="exrow clr"><div class="exh"><b>${esc(e.desc)}</b><span>${esc(e.cat)} · ขอไว้ ${fmt(e.amount)}</span></div><div class="exl"><input class="inp num" type="number" id="xc-a-${i}" data-xc="${i}:amount" value="${esc(x.amount)}" placeholder="ยอดจริง (บาท)"><input class="inp" type="file" id="xc-f-${i}" data-xcf="${i}" accept="image/*,application/pdf" style="padding-top:6px" aria-label="ใบเสร็จ ${esc(e.desc)}"></div>
        ${x.file ? `<span class="hint">${ms('check_circle', 'style="font-size:15px;vertical-align:-3px;color:var(--good)"')} แนบแล้ว ${fileBtn(x.file, 'ดู')}</span>` : `<label class="ckl"><input type="checkbox" id="xc-n-${i}" data-xcn="${i}" ${x.noRcpt ? 'checked' : ''}> ไม่มีใบเสร็จ</label>${x.noRcpt ? `<input class="inp" id="xc-w-${i}" data-xc="${i}:why" value="${esc(x.why)}" placeholder="เหตุผลที่ไม่มีใบเสร็จ * (admin ยืนยัน)">` : ''}`}
        ${e.actual > e.amount ? `<span class="overtag bad">ใช้เกินที่ขอ ${fmt(e.actual - e.amount)} บาท</span>` : ''}</div>`; }).join('')}</div>
      ${r.exOver > 0 && adminRev ? `<label class="ckl excheck"><input type="checkbox" id="c-exo" data-cchk="exOver" ${k.exOver ? 'checked' : ''}> อนุมัติค่าใช้จ่ายอื่นที่เกินที่ขอ <b>${fmt(r.exOver)}</b> บาท</label>` : ''}</div>` : '';
  const files = `<div class="field full"><label for="c-files">รูปใบเสร็จ (น้ำมัน ที่พัก ฯลฯ)</label><input class="inp" type="file" id="c-files" accept="image/*,application/pdf" multiple style="padding-top:6px"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${k.files.map((f, i) => `<span class="chip">${fileBtn(f, `ใบเสร็จ ${i + 1}`)}<button class="btn sm ghost" style="height:20px;padding:0 2px" data-act="fileDel" data-v="${i}" aria-label="เอาไฟล์ออก">${ms('close', 'style="font-size:16px"')}</button></span>`).join('') || '<span class="hint">ยังไม่แนบ</span>'}</div></div>`;
  const topSrc = adminRev && diff > 0 && !r.err ? `<div class="srcpick" style="margin-bottom:8px"><label><input type="radio" name="tsrc" value="PC" ${k.src === 'PC' ? 'checked' : ''}> จ่ายส่วนต่างเงินสดย่อย<br><small style="color:var(--sub)">เหลือ ${fmt(ST.trv.pcBalance)}</small></label><label><input type="radio" name="tsrc" value="BANK" ${k.src === 'BANK' ? 'checked' : ''}> โอนส่วนต่าง</label></div>` : '';
  return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><button class="btn sm ghost" data-act="go" data-v="${isAdmin() ? 'clear' : 'home'}">${ms('arrow_back')}${isAdmin() ? 'เคลียร์เงิน' : 'ทริปของฉัน'}</button><span class="tpill t-TRV">TRV</span><b class="num">${d.no}</b><span style="color:var(--sub)">${esc(d.staffName)} · ${esc(d.title)} · ${dRange(d.go, d.back)}</span></div>
    ${adminRev && d.status === 'clearSub' ? `<div class="banner info" style="margin-bottom:12px">${ms('inbox')}<span><b>${esc(d.clearSub.byName)}</b> ส่งเคลียร์เมื่อ ${dtTime(d.clearSub.at)} · ตรวจตัวเลขกับใบเสร็จ แก้ได้ แล้วกดยืนยัน${d.clearSub.note ? `<br>หมายเหตุ: ${esc(d.clearSub.note)}` : ''}</span></div>` : ''}
    ${!adminRev && d.clearReturn ? `<div class="banner warn" style="margin-bottom:12px">${ms('edit_note')}<span>admin ส่งกลับให้แก้: <b>${esc(d.clearReturn)}</b></span></div>` : ''}
    <div class="grid g2"><div class="card"><div class="fgrid">
      <div class="field"><label for="c-people">จำนวนคน</label><input class="inp num" type="number" id="c-people" data-c="people" value="${esc(k.people)}"></div>
      <div class="field"><label for="c-days">จำนวนวันจริง</label><input class="inp num" type="number" id="c-days" data-c="days" value="${esc(k.days)}"></div>
      <div class="field full"><label for="c-fuel">ค่าน้ำมันตามจริง (บาท)</label><input class="inp num" type="number" id="c-fuel" data-c="fuel" value="${esc(k.fuel)}" placeholder="รวมทุกใบเสร็จน้ำมัน"></div>
      ${stays}${ex}${files}
      ${!adminRev ? `<div class="field full"><label for="c-note">หมายเหตุถึง admin (ถ้ามี)</label><input class="inp" id="c-note" data-c="note" value="${esc(k.note)}"></div>` : ''}</div></div>
    <div class="card calc"><div id="calcBody"><h3>${ms('compare_arrows')}เทียบยอด</h3><div class="lines">
      <div><span>ยอดเบิก</span><b>${fmt(d.requested)}</b></div><div><span>น้ำมันจริง</span><b>${k.fuel === '' ? '—' : fmt(k.fuel)}</b></div>
      <div><span>เบี้ยเลี้ยง<br><span class="f">${esc(k.people)} คน × ${esc(k.days)} วัน × ${fmt(s.allowance)}</span></span><b>${fmt(r.allowance)}</b></div>
      <div><span>ที่พัก ${r.nights} คืน${r.hotelExcess > 0 && !k.hotelEx ? `<br><span class="f">คืนไม่เกิน ${fmt(r.cap)}/คืน</span>` : ''}</span><b>${fmt(r.hotel)}</b></div>
      ${r.ex.length ? `<div><span>ค่าใช้จ่ายอื่น</span><b>${fmt(r.extras)}</b></div>` : ''}
      <div class="tot"><span>ใช้จริง</span><b>${r.err ? '—' : fmt(r.total)}</b></div></div>
      ${r.err ? `<p class="formula" style="margin:12px 0;color:var(--warn)">${esc(r.err)}</p>` : `<div class="diffbox ${diff < 0 ? 'refund' : diff > 0 ? 'topup' : 'even'}" style="margin:12px 0"><span>${diff < 0 ? 'ทีมงานต้องคืนเงิน' : diff > 0 ? 'บริษัทต้องจ่ายเพิ่ม' : 'พอดี ปิดใบได้ทันที'}</span><b>${fmt(Math.abs(diff))} บาท</b></div>`}
      ${topSrc}</div>
      ${adminRev ? `<button class="btn pri block" data-act="clrConfirm">${ms('task_alt')}ยืนยันผลเคลียร์</button>${d.status === 'clearSub' ? `<div class="field" style="margin-top:10px"><label for="c-ret">เหตุผล (ถ้าส่งกลับให้แก้)</label><input class="inp" id="c-ret" placeholder="เช่น ใบเสร็จน้ำมันไม่ชัด"></div><button class="btn block" style="margin-top:6px" data-act="clrReturn">${ms('undo')}ส่งกลับให้แก้</button>` : ''}`
        : `<button class="btn pri block" data-act="clrSubmit">${ms('send')}ส่งเคลียร์ให้ admin ตรวจ</button>`}
    </div></div>`;
}

// ---------- ขออนุมัติโอน (ใบเสนอ CEO · APV) ----------
const STAGE = { ceo: 'รอ CEO เซ็น', ceoOk: 'CEO อนุมัติ · รอส่งเรื่องเข้าระบบ', coo: 'รอ COO อนุมัติ', paid: 'โอนแล้ว', cancelled: 'ยกเลิก' };
const STAGE_I = { ceo: 0, ceoOk: 1, coo: 2, paid: 4 };
const KIND = { advance: 'เงินเบิก', topup: 'จ่ายส่วนต่างหลังเคลียร์', rmb: 'เบิกคืน', exp: 'ค่าใช้จ่ายบริษัท', pcr: 'เบิกชดเชยเงินสดย่อย', ext: 'เงินต่อทริป' };
const kindLabel = (x) => x.kind === 'advance' ? (x.type === 'ADV' ? 'เงินทดรอง' : 'เงินเบิกค่าเดินทาง') : KIND[x.kind] || '';
const stepper = (st) => { const i = STAGE_I[st] ?? 0; return `<div class="steps">${['เสนอ CEO เซ็น', 'ส่งเรื่องเข้าระบบ', 'COO อนุมัติ', 'โอนแล้ว'].map((t, k) => `<div class="step ${k < i ? 'done' : k === i ? 'cur' : ''}"><i>${k < i ? '✓' : k + 1}</i>${t}</div>`).join('')}</div>`; };
const bankLine = (x) => x.external ? 'ตามใบแจ้งหนี้' : x.bank ? `${esc(x.bank.bank)} <span class="num">${esc(x.bank.no)}</span>` : '<span style="color:var(--bad)">ยังไม่มีบัญชี</span>';
function bahtText(n) {
  const N = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'], P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const grp = (s) => { let o = ''; const L = s.length; for (let i = 0; i < L; i++) { const d = +s[i], p = L - i - 1; if (!d) continue; if (p === 1 && d === 1) o += 'สิบ'; else if (p === 1 && d === 2) o += 'ยี่สิบ'; else if (p === 0 && d === 1 && L > 1) o += 'เอ็ด'; else o += N[d] + P[p]; } return o; };
  const txt = (s) => { s = s.replace(/^0+/, ''); if (!s) return ''; if (s.length > 6) return txt(s.slice(0, -6)) + 'ล้าน' + grp(s.slice(-6).replace(/^0+/, '')); return grp(s); };
  const v = Math.round(Math.abs(Number(n) || 0) * 100), b = String(Math.floor(v / 100)), st = v % 100;
  return `${b === '0' ? 'ศูนย์' : txt(b)}บาท${st ? txt(String(st)) + 'สตางค์' : 'ถ้วน'}`;
}
async function loadApv() { try { ST.apv = await api('apvQueue'); } catch (e) { fail(e); ST.apv = { wait: [], batches: [] }; } render(); }
function vPayq() {
  if (!ST.apv) { loadApv(); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const W = ST.apv.wait, un = ST.unsel || (ST.unsel = new Set()), bc = ST.bconf || (ST.bconf = new Set());
  const sel = W.filter((x) => !un.has(x.id)), sum = sel.reduce((t, x) => t + x.amount, 0);
  const active = ST.apv.batches.filter((b) => !['paid', 'cancelled'].includes(b.status)), done = ST.apv.batches.filter((b) => b.status === 'paid').slice(0, 12), canc = ST.apv.batches.filter((b) => b.status === 'cancelled').slice(0, 6);
  const bcard = (b) => `<div class="card bcard" role="button" tabindex="0" data-act="openBatch" data-v="${b.no}"><div class="row"><b class="num">${b.no}</b><span class="pill ${b.status === 'paid' ? 'p-closed' : b.status === 'cancelled' ? 'p-mute' : 'p-pending'}">${STAGE[b.status]}</span><span class="sp num" style="font-weight:700;font-size:16px">${fmt(b.total)}</span></div>${b.status === 'cancelled' ? '' : stepper(b.status)}<small style="color:var(--sub)">${b.items.length} รายการ · สร้าง ${dt(b.date)}${b.paidAt ? ` · โอน ${dt(b.paidAt)}` : ''}</small>${b.status === 'cancelled' ? '' : `<button class="btn sm pbtn" data-act="apvPrint" data-v="${b.no}">${ms('print')}พิมพ์ใบเสนอ CEO (A4)</button>`}</div>`;
  const row = (x) => `<tr><td>${isAdmin() ? `<input type="checkbox" class="chk" data-sel="${esc(x.id)}" ${un.has(x.id) ? '' : 'checked'} aria-label="เลือก ${esc(x.title)}">` : ''}</td>
    <td>${x.ceoNote ? `<span class="pill p-refund" style="display:inline-block;margin-bottom:4px">${ms('edit_note', 'style="font-size:15px;vertical-align:-3px"')} ${esc(x.ceoNote)}</span><br>` : ''}${x.type !== 'PC' ? tpill(x.type) : ''}<span class="kind">${kindLabel(x)}</span> ${x.ref ? `<button class="btn sm ghost" style="height:auto;padding:0 4px" data-act="openDoc" data-v="${esc(x.ref)}"><span class="num">${esc(x.ref)}</span></button>` : ''}<span class="sub" style="display:block;color:var(--sub);font-size:12.5px">${esc(x.title)}</span></td>
    <td>${esc(x.payee)}<span style="display:block;color:var(--sub);font-size:12.5px">${bankLine(x)}</span>${x.bankPending ? `<label class="ckl" style="color:var(--bad);font-size:12.5px;margin-top:4px"><input type="checkbox" data-bconf="${esc(x.id)}" ${bc.has(x.id) ? 'checked' : ''}> บัญชีเพิ่งเปลี่ยน · ตรวจกับเจ้าตัวแล้ว</label>` : ''}</td><td class="r num">${fmt(x.amount)}</td></tr>`;
  return `<p style="margin:0 0 14px;color:var(--sub)">รวมรายการที่ต้องโอนเป็นใบเดียว → พิมพ์เสนอ <b style="color:var(--ink)">CEO</b> เซ็น → <b style="color:var(--ink)">ส่งเรื่องเข้าระบบ</b> ธนาคาร → <b style="color:var(--ink)">COO</b> อนุมัติ → แนบสลิป · รายการที่จ่ายจากเงินสดย่อยไม่ต้องผ่านขั้นนี้</p>
  <div class="grid g2" style="align-items:start"><div class="card"><h3>${ms('pending_actions')}รายการรอเข้าใบเสนอ CEO<span class="r">${W.length} รายการ</span></h3>
    ${W.length ? `<div class="tablewrap"><table><thead><tr><th style="width:36px">${isAdmin() ? `<input type="checkbox" class="chk" id="selAll" aria-label="เลือกทั้งหมด" ${sel.length === W.length ? 'checked' : ''}>` : ''}</th><th>รายการ</th><th>ผู้รับเงิน</th><th class="r">ยอด</th></tr></thead><tbody>${W.map(row).join('')}</tbody>
      <tfoot><tr><td></td><td colspan="2">เลือก ${sel.length} รายการ</td><td class="r num">${fmt(sum)}</td></tr></tfoot></table></div>
      ${isAdmin() ? `<button class="btn pri block" style="margin-top:12px" data-act="apvCreate" ${sel.length ? '' : 'disabled'}>${ms('note_add')}สร้างใบเสนอ CEO ${sel.length} รายการ · ${fmt(sum)} บาท</button>` : ''}`
    : '<div class="empty">ไม่มีรายการรอ · รายการที่เลือก "โอนจากบัญชี" จะมาอยู่ที่นี่</div>'}</div>
    <div class="stack"><h3 style="font-size:15px;margin:0">ใบเสนอที่กำลังดำเนินการ</h3>${active.map(bcard).join('') || '<div class="card empty">ยังไม่มี</div>'}
      ${done.length ? `<h3 style="font-size:15px;margin:6px 0 0">โอนแล้ว</h3>${done.map(bcard).join('')}` : ''}${canc.length ? `<details><summary style="cursor:pointer;color:var(--sub)">ใบที่ยกเลิก (${canc.length})</summary><div class="stack" style="margin-top:8px">${canc.map(bcard).join('')}</div></details>` : ''}</div></div>`;
}
function drawBatch(no) {
  const b = ST.apv && ST.apv.batches.find((x) => x.no === no); if (!b) return;
  ST.openBatch = no; const ad = isAdmin();
  const list = b.items.map((x) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line)">${b.status === 'ceo' && ad ? `<input type="checkbox" class="chk" data-keep="${esc(x.id)}" checked aria-label="CEO อนุมัติ ${esc(x.title)}">` : ''}<span style="flex:1;min-width:0"><span class="kind">${kindLabel(x)}</span> ${x.ref ? `<span class="num" style="font-size:12.5px">${esc(x.ref)}</span>` : ''}<br>${esc(x.title)}<br><small style="color:var(--sub)">${esc(x.payee)} · ${bankLine(x)}</small>${b.status === 'ceo' && ad ? `<div class="field" data-noteof="${esc(x.id)}" hidden style="margin-top:6px"><input class="inp" id="kn-${esc(x.id)}" placeholder="สิ่งที่ CEO ให้แก้ (ถ้ามี)"></div>` : ''}</span><b class="num">${fmt(x.amount)}</b></div>`).join('');
  const dropped = (b.dropped || []).length ? `<div class="card"><h3>${ms('undo')}CEO ไม่อนุมัติ (กลับไปรอ)</h3>${b.dropped.map((x) => `<div style="padding:6px 0;border-top:1px solid var(--line)"><span class="kind">${kindLabel(x)}</span> ${esc(x.ref || '')} · ${esc(x.title)} · <b class="num">${fmt(x.amount)}</b>${x.ceoNote ? `<br><small style="color:var(--warn)">ให้แก้: ${esc(x.ceoNote)}</small>` : ''}</div>`).join('')}</div>` : '';
  let act = '';
  const cancel = `<button class="btn ghost block" data-act="apvCancelAsk">${ms('block')}ยกเลิกใบเสนอ (รายการกลับไปรอ)</button><div id="noteBox"></div>`;
  if (ad && b.status === 'ceo') act = `<div class="field"><label for="b-scan">แนบรูปหรือสแกนใบที่ CEO เซ็นแล้ว</label><input class="inp" type="file" id="b-scan" accept="image/*,application/pdf" style="padding-top:6px"></div><p class="formula" style="margin:0">ติ๊กออกรายการที่ CEO ไม่อนุมัติ แล้วใส่สิ่งที่ให้แก้ (ถ้ามี) · รายการนั้นจะกลับไปรอเข้าใบเสนอใหม่</p><button class="btn pri block" data-act="apvCeo">${ms('verified')}CEO เซ็นอนุมัติแล้ว</button>${cancel}`;
  if (ad && b.status === 'ceoOk') act = `<div class="field"><label for="b-ref">เลขอ้างอิงในระบบธนาคาร (ถ้ามี)</label><input class="inp" id="b-ref"></div><button class="btn pri block" data-act="apvSent">${ms('send')}ส่งเรื่องเข้าระบบแล้ว · รอ COO</button>${cancel}`;
  if (ad && b.status === 'coo') act = `<div class="fgrid"><div class="field"><label for="b-date">วันที่โอน</label><input class="inp" type="date" id="b-date" value="${todayTH()}"></div><div class="field"><label for="b-slip">สลิปการโอน</label><input class="inp" type="file" id="b-slip" accept="image/*,application/pdf" style="padding-top:6px"></div></div><button class="btn pri block" data-act="apvPaid">${ms('task_alt')}COO อนุมัติแล้ว · โอนสำเร็จ</button>${cancel}`;
  openDrawer(`<div class="dh"><div><div style="display:flex;gap:8px;align-items:center"><span class="tpill t-PC">APV</span><span class="pill ${b.status === 'paid' ? 'p-closed' : b.status === 'cancelled' ? 'p-mute' : 'p-pending'}">${STAGE[b.status]}</span></div><h2 class="num">${b.no}</h2></div><button class="btn sm ghost x" data-act="closeDrawer" aria-label="ปิด">${ms('close')}</button></div>
    <div class="db">${b.status === 'cancelled' ? (b.cancelNote ? `<div class="banner bad">${ms('block')}<span>ยกเลิก: ${esc(b.cancelNote)}</span></div>` : '') : stepper(b.status)}
      <div class="money3" style="grid-template-columns:1fr"><div class="hl"><small>ยอดรวม ${b.items.length} รายการ</small><b>${fmt(b.total)}</b><small>(${bahtText(b.total)})</small></div></div>
      ${b.status === 'cancelled' ? '' : `<button class="btn ${b.status === 'ceo' ? 'pri' : ''} block" data-act="apvPrint" data-v="${b.no}">${ms('print')}พิมพ์ใบเสนอ CEO (A4)</button>`}
      <div class="card"><h3>${ms('list_alt')}รายการ</h3>${list}</div>${dropped}
      ${b.scan || b.slip ? `<div class="card"><h3>${ms('attach_file')}หลักฐาน</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${fileBtn(b.scan, 'ใบที่ CEO เซ็น')}${fileBtn(b.slip, 'สลิปการโอน')}</div>${b.bankRef ? `<p class="formula" style="margin:8px 0 0">อ้างอิงธนาคาร: ${esc(b.bankRef)}</p>` : ''}</div>` : ''}
      <div class="card"><h3>${ms('history')}ความเคลื่อนไหว</h3><ul class="tl">${b.timeline.map((t) => `<li>${esc(t.text)}${t.amt != null ? ` · <b class="num">${fmt(t.amt)}</b>` : ''}<small>${dtTime(t.at)} · ${esc(t.byName)}</small></li>`).join('')}</ul></div>
    </div>${act ? `<div class="df">${act}</div>` : ''}`);
}
// ----- พิมพ์ A4 -----
const thDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]} ${y + 543}`; };
function a4Head(title, sub, right) { return `<div class="ph"><img src="img/logo.png" alt="C2TECH"><div class="co"><b>${title}</b><br>${sub}</div><div class="docno">${right}</div></div>`; }
function detailOf(x, d, pcr, idx) {
  const n = idx != null ? `${idx + 1}. ` : '';
  const head = () => `<h4>${n}${esc(kindLabel(x))}${x.ref ? ` · ${esc(x.ref)}` : ''}</h4>`;
  const row = (k, v, amt, why) => `<div class="xrow"><span>${k ? `<span class="k">${k} :</span> ` : ''}${v}${why ? `<span class="why">${why}</span>` : ''}</span><b>${fmt(amt)}</b></div>`;
  const kv = (pairs) => `<div class="kv2">${pairs.filter(Boolean).map(([k, v]) => `<span class="k">${k} :</span><span>${v}</span>`).join('')}</div>`;
  const sum = (amt) => `<div class="sumrow"><span><b class="sl">รวมเป็นเงิน</b><span class="w">(${bahtText(amt)})</span></span><b class="sv">${fmt(amt)} บาท</b></div>`;
  const place = (v) => { const p = String(v).split(' · '); return p.length > 1 ? `${esc(p.slice(0, -1).join(' · '))} <small>· ${esc(p[p.length - 1])}</small>` : esc(v); };
  const route = (stops) => `<span class="route"><span><i class="h">⌂</i>${esc(ST.settings.home.name.split(' · ')[0])} (ออกเดินทาง)</span>${stops.map((v, i) => `<span><i>${i + 1}</i>${place(v)}</span>`).join('')}<span><i class="h">↩</i>กลับ ${esc(ST.settings.home.name.split(' · ')[0])}</span></span>`;
  const people = (dd) => `${dd.travelers.length} คน · ${dd.travelers.map((t, i) => `${i + 1}) ${esc(t.name)}${t.id === dd.staffId ? ' (ผู้รับเงิน)' : ''}`).join(' ')}`;
  if (x.kind === 'pcr') return `<div class="item">${head()}<div class="xnote">ใช้ไปตั้งแต่เติมครั้งก่อน · โอนเข้า${esc(x.bank ? `${x.bank.bank} ${x.bank.no}` : '')} (บัญชีเงินสำรองจ่าย)</div>${(pcr || []).map((e) => row('', `${thDate(e.date)} · ${esc(e.note)}${e.ref ? ` <span class="cat">${esc(e.ref)}</span>` : ''}`, e.kind === 'in' ? -e.amount : e.amount)).join('')}${sum(x.amount)}</div>`;
  if (!d) return `<div class="item">${head()}<div class="xnote">${esc(x.title)}</div>${sum(x.amount)}</div>`;
  const pay = `<div class="xnote">โอนให้: ${esc(x.payee)}${x.external ? ' · ตามใบแจ้งหนี้' : x.bank ? ` · ${esc(x.bank.bank)} ${esc(x.bank.no)}` : ''}</div>`;
  if (x.kind === 'ext') { const e = (d.ext || [])[d.ext.length - 1] || {}, df = e.diff || {};
    return `<div class="item">${head()}${pay}${kv([['ชื่องาน', `<b>${esc(d.title)}</b>`], ['วันที่ (ทริปใหม่)', `${thDate(d.go)}${d.back !== d.go ? ' – ' + thDate(d.back) : ''}${df.newBack !== df.oldBack ? ` <small>(เดิมกลับ ${thDate(df.oldBack)})</small>` : ''}`], ['เส้นทางการเดินทาง', route(d.stops)], ['ชื่อผู้เดินทาง', people(d)], (df.added || []).length ? ['สถานที่ที่เพิ่ม', df.added.map(esc).join(', ')] : null, e.note ? ['เหตุผลที่ต่อทริป', esc(e.note)] : null])}
      ${df.fuel ? row('ค่าน้ำมันเพิ่ม', `${fmt(df.km)} กม.`, df.fuel) : ''}${df.allowance ? row('ค่าเบี้ยเลี้ยงเพิ่ม', '', df.allowance) : ''}${df.hotel ? row('ค่าที่พักเพิ่ม', '', df.hotel) : ''}${(df.extras || []).map((z) => row(esc(z.cat), esc(z.desc), z.amount)).join('')}${sum(x.amount)}</div>`; }
  if (x.kind === 'topup') return `<div class="item">${head()}${pay}${kv([['ชื่องาน', `<b>${esc(d.title)}</b>`], d.type === 'TRV' ? ['วันที่', `${thDate(d.go)}${d.back !== d.go ? ' – ' + thDate(d.back) : ''}`] : null])}${row('', 'ใช้จริงตามใบเสร็จ', d.actual ? d.actual.total : 0)}${row('', 'หัก เงินที่จ่ายไปแล้ว', -d.requested)}${sum(x.amount)}</div>`;
  if (d.type === 'TRV') { const p = d.plan, s = set();
    return `<div class="item">${head()}${pay}${kv([['ชื่องาน', `<b>${esc(d.title)}</b>`], ['วันที่', `${thDate(d.go)}${d.back !== d.go ? ' – ' + thDate(d.back) : ''} (${p.days} วัน ${p.nights} คืน)`], ['เส้นทางการเดินทาง', route(d.stops)], ['ชื่อผู้เดินทาง', people(d)], d.kmReason ? ['หมายเหตุระยะทาง', esc(d.kmReason)] : null])}
      ${row('ค่าน้ำมัน', `${fmt(p.km)} กม. ÷ ${s.kmPerL} × ${p.price}`, p.fuel)}${row('ค่าเบี้ยเลี้ยง', `${p.people} คน × ${p.days} วัน × ${fmt(s.allowance)}`, p.allowance)}
      ${p.nights ? row('ค่าที่พัก', `${p.nights} คืน × ${p.rooms} ห้อง × ${fmt(p.rate)}${p.hotelOver ? ` <span class="cat">(เกินอัตรา ${fmt(s.hotel)})</span>` : ''}`, p.hotel, p.hotelOver && p.hotelReason ? `เหตุผล: ${esc(p.hotelReason)}` : '') : ''}
      ${(p.extras || []).map((e) => row(esc(e.cat), esc(e.desc), e.amount)).join('')}${sum(x.amount)}</div>`; }
  if (d.type === 'ADV') return `<div class="item">${head()}${pay}${kv([['เรื่อง', `<b>${esc(d.title)}</b>`], d.customer ? ['ลูกค้า', esc(d.customer)] : null, ['วันที่', thDate(d.go)]])}${d.items.map((i) => row('', esc(i.desc), i.amount)).join('')}${sum(x.amount)}<div class="xnote" style="margin:6px 0 0">หลังใช้จริง ทีมงานต้องเคลียร์ด้วยใบเสร็จภายใน ${set().clearDue} วัน</div></div>`;
  return `<div class="item">${head()}${pay}${kv([['รายการ', `<b>${esc(d.title)}</b>`], d.cat ? ['หมวด', esc(d.cat)] : null, ['วันที่', thDate(d.go)], ['หลักฐาน', d.file ? 'แนบใบเสร็จ/ใบแจ้งหนี้ในระบบแล้ว' : 'ไม่มีไฟล์แนบในระบบ']])}${row('', esc(d.title), d.requested)}${sum(x.amount)}</div>`;
}
async function apvPrint(no) {
  const r = await api('apvGet', { no }); const b = r.batch;
  const rows = b.items.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(kindLabel(x))}${x.ref ? ` · ${esc(x.ref)}` : ''}<br><small>${esc(x.title)}</small></td><td>${esc(x.payee)}<br><small>${x.external ? 'ตามใบแจ้งหนี้' : x.bank ? `${esc(x.bank.bank)} ${esc(x.bank.no)}` : ''}</small>${x.bankPending ? `<br><span style="font-size:11.5px;color:#9A3B30">* บัญชีเพิ่งเปลี่ยน ${x.bank && x.bank.changedAt ? thDate(x.bank.changedAt.slice(0, 10)) : ''} · ยืนยันกับเจ้าตัวแล้ว</span>` : ''}</td><td style="text-align:right">${fmt(x.amount)}</td><td style="text-align:center"><span class="box"></span></td></tr>`).join('');
  const p1 = `<div class="a4">${a4Head('บริษัท ซีทูเทค จำกัด', '99/3 หมู่ 9 ต.วังไก่เถื่อน อ.หันคา จ.ชัยนาท 17130', `<b>ใบเสนออนุมัติเบิกจ่าย</b>เลขที่ ${b.no}<br>วันที่ ${thDate(b.date)}`)}
    <p style="margin:0 0 12px;line-height:1.7">เรียน ประธานเจ้าหน้าที่บริหาร (CEO)<br>ขออนุมัติเบิกจ่ายตามรายการด้านล่าง โดยโอนเงินจากบัญชีบริษัท</p>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="width:26px">ที่</th><th style="text-align:left">รายการ</th><th style="text-align:left">ผู้รับเงิน / บัญชี</th><th style="text-align:right">จำนวนเงิน</th><th style="width:52px">CEO<br>อนุมัติ</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td></td><td colspan="2"><b>รวม ${b.items.length} รายการ</b></td><td style="text-align:right"><b>${fmt(b.total)}</b></td><td></td></tr></tfoot></table>
    <div class="words">(${bahtText(b.total)})</div>
    <div style="font-size:12px;color:#4a4a48">เอกสารแนบ: รายละเอียดแต่ละรายการ (หน้าถัดไป) · รายการที่จ่ายจากเงินสดย่อยไม่อยู่ในใบนี้${r.fullBank ? '' : ' · เลขบัญชีแสดงบางส่วน (ให้ผู้ดูแลเลขบัญชีพิมพ์เพื่อแสดงเต็ม)'}</div>
    <div style="font-size:12.5px;margin-top:14px">หมายเหตุ CEO: ...........................................................................................................................</div>
    <div class="signs"><div class="sign"><b>ผู้จัดทำ</b><div class="ln">( ${esc(b.createdByName)} )</div><small>วันที่ ......../......../........</small></div><div class="sign"><b>CEO อนุมัติ</b><div class="ln">( .............................................. )</div><small>วันที่ ......../......../........</small></div></div>
    <div class="pfoot"><span>C2-Pay · ${b.no}</span><span>หน้า 1</span></div></div>`;
  const p2 = `<div class="a4">${a4Head('รายละเอียดประกอบใบเสนอ', `${b.no} · ${b.items.length} รายการ · รวม ${fmt(b.total)} บาท`, '<b>รายละเอียด</b>')}${b.items.map((x, i) => detailOf(x, r.docs[x.ref], r.pcr, i)).join('')}<div class="pfoot"><span>C2-Pay · ${b.no}</span><span>หน้า 2</span></div></div>`;
  let pv = $('#printv'); if (!pv) { pv = document.createElement('div'); pv.id = 'printv'; pv.className = 'printv'; document.body.appendChild(pv); }
  pv.innerHTML = `<div class="pbar"><b>${b.no}</b><small>ใบเสนอ CEO · A4 2 หน้า</small><span style="margin-left:auto;display:flex;gap:8px"><button class="btn pri sm" data-act="doPrint">${ms('print')}พิมพ์ / บันทึก PDF</button><button class="btn sm" data-act="closePrint">${ms('close')}ปิด</button></span></div><div class="pages">${p1}${p2}</div>`;
  pv.classList.add('on');
}

// ======================================================================
// รอบ 3: สร้างใบใหม่ (ADV / RMB / EXP) · เคลียร์เงินทดรอง · สมุดค่าใช้จ่าย · เงินสดย่อยเต็ม
// ======================================================================
const TYPE_LABEL = { TRV: 'ค่าเดินทาง', ADV: 'เงินทดรอง', RMB: 'เบิกคืน', EXP: 'ค่าใช้จ่ายบริษัท' };
const tpill = (t) => `<span class="tpill t-${t || 'TRV'}">${t || 'TRV'}</span>`;
const SRC_LABEL = { PC: 'เงินสดย่อย', BANK: 'โอนจากบัญชี' };
const cats = () => ST.settings.cats || [];
const opts = (list, cur) => list.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const srcPick = (name, cur, note) => `<div class="srcpick"><label><input type="radio" name="${name}" value="PC" ${cur === 'PC' ? 'checked' : ''}> เงินสดย่อย<br><small style="color:var(--sub)">เหลือ ${fmt(ST.trv.pcBalance)}</small></label><label><input type="radio" name="${name}" value="BANK" ${cur === 'BANK' ? 'checked' : ''}> โอนจากบัญชี<br><small style="color:var(--sub)">${note || 'เข้ารายการรอโอน'}</small></label></div>`;
/** บรรทัดรองของการ์ดใบ (ไม่ใช่ TRV ไม่มีเส้นทาง) */
const subLine = (d) => !d.type || d.type === 'TRV' ? `${dRange(d.go, d.back)} · ${(d.stops || []).map(place).join(' → ')}` : `${dt(d.go)} · ${esc(TYPE_LABEL[d.type])}${d.customer ? ' · ' + esc(d.customer) : ''}${d.cat ? ' · ' + esc(d.cat) : ''}`;
const whoOf = (d) => d.type === 'EXP' ? (d.payee || 'ค่าใช้จ่ายบริษัท') : d.staffName;

// ---------- สร้างใบใหม่ ----------
function newNf(t) {
  const people = ST.trv.people || [];
  const firstStaff = (people.find((p) => p.id !== ST.me.id) || people[0] || {}).id || '';
  return { type: t, staffId: firstStaff, customer: '', title: '', date: todayTH(), items: [{ desc: '', amount: '' }], cat: t === 'EXP' ? (cats().find((c) => /สำนักงาน|ค่าไฟ|สาธารณูปโภค/.test(c)) || cats()[0]) : cats()[0], amount: '', payee: '', src: 'PC', file: null };
}
function vNew() {
  const w = needTrv(); if (w) return w;
  if (!isAdmin()) { ST.view = 'home'; return vMyTrips(); }
  const t = ST.nfType || 'ADV'; const f = ST.nf && ST.nf.type === t ? ST.nf : (ST.nf = newNf(t));
  const tiles = [['TRV', 'route', 'ค่าเดินทาง', 'คำนวณน้ำมัน เบี้ยเลี้ยง ที่พักให้'], ['ADV', 'request_quote', 'เงินทดรอง', 'ใส่รายการและยอดประมาณ แล้วเคลียร์ด้วยใบเสร็จ'], ['RMB', 'receipt', 'เบิกคืน', 'ทีมงานสำรองจ่ายไปก่อน'], ['EXP', 'storefront', 'ค่าใช้จ่ายบริษัท', 'บริษัทจ่ายตรง ลงสมุดค่าใช้จ่าย'], ['PC', 'savings', 'เติมเงินสดย่อย', 'เพิ่มยอดกองทุน / ตรวจนับ']];
  const types = `<div class="types">${tiles.map(([k, i, l, sm]) => `<button class="type ${t === k ? 'on' : ''}" data-act="nfType" data-v="${k}">${ms(i)}<b>${l}</b><small>${sm}</small></button>`).join('')}</div>`;
  const people = ST.trv.people || [];
  const staff = `<div class="field"><label for="n-staff">${t === 'RMB' ? 'ทีมงานที่สำรองจ่าย' : 'ทีมงานที่รับเงิน'}</label><select class="sel" id="n-staff" data-nf="staffId"><option value="">— เลือก —</option>${opts(people.map((p) => [p.id, p.name + (p.hasBank ? '' : ' (ยังไม่มีบัญชี)')]), f.staffId)}</select></div>`;
  const fileF = (lab) => `<div class="field"><label for="n-file">${lab}</label><input class="inp" type="file" id="n-file" accept="image/*,application/pdf" style="padding-top:6px"></div>`;
  let form = '', side = '';
  if (t === 'ADV') {
    const tot = f.items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
    form = `<div class="fgrid">${staff}
      <div class="field"><label for="n-cust">ลูกค้า / หน้างาน (ถ้ามี)</label><input class="inp" id="n-cust" data-nf="customer" list="n-custs" value="${esc(f.customer)}"><datalist id="n-custs">${(ST.settings.customers || []).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></div>
      <div class="field full"><label for="n-title">เบิกไปทำอะไร</label><input class="inp" id="n-title" data-nf="title" placeholder="เช่น ซื้ออะไหล่ซ่อมเครื่องหน้างาน" value="${esc(f.title)}"></div>
      <div class="field"><label for="n-date">วันที่</label><input class="inp" type="date" id="n-date" data-nf="date" value="${f.date}"></div>
      <div class="field full"><label>รายการและยอดประมาณ</label><div class="items">${f.items.map((i, n) => `<div class="irow two"><input class="inp" id="ni-d-${n}" data-nfi="${n}:desc" placeholder="รายการ" value="${esc(i.desc)}"><input class="inp num" id="ni-a-${n}" type="number" inputmode="decimal" data-nfi="${n}:amount" placeholder="บาท" value="${esc(i.amount)}"><button class="xbtn" data-act="nfItemDel" data-v="${n}" aria-label="ลบรายการ" ${f.items.length < 2 ? 'disabled' : ''}>${ms('close', 'style="font-size:18px"')}</button></div>`).join('')}
        <button class="btn sm" style="align-self:flex-start" data-act="nfItemAdd">${ms('add')}เพิ่มรายการ</button></div></div>
      <div class="field full"><label>จ่ายเงินจาก</label>${srcPick('n-src', f.src, 'ต้องมีบัญชีรับโอน')}</div></div>`;
    side = `<h3>${ms('calculate')}ยอดเงินทดรอง</h3><div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 6px"><span id="nfCnt">${f.items.filter((i) => i.desc && Number(i.amount) > 0).length} รายการ</span><span class="big" id="nfTot">${fmt(tot)}</span></div><p class="formula">ทีมงานใช้จริงแล้วส่งใบเสร็จ · admin เคลียร์ → คืนส่วนที่เหลือ หรือจ่ายเพิ่มส่วนที่เกิน</p>`;
  }
  if (t === 'RMB') {
    form = `<div class="fgrid">${staff}
      <div class="field"><label for="n-date">วันที่ในใบเสร็จ</label><input class="inp" type="date" id="n-date" data-nf="date" value="${f.date}"></div>
      <div class="field full"><label for="n-title">จ่ายค่าอะไร</label><input class="inp" id="n-title" data-nf="title" placeholder="เช่น ค่าส่งอะไหล่" value="${esc(f.title)}"></div>
      <div class="field"><label for="n-cat">หมวด</label><select class="sel" id="n-cat" data-nf="cat">${opts(cats(), f.cat)}</select></div>
      <div class="field"><label for="n-amt">ยอดเงิน (บาท)</label><input class="inp num" type="number" inputmode="decimal" id="n-amt" data-nf="amount" value="${esc(f.amount)}"></div>
      ${fileF('รูปใบเสร็จ')}</div>`;
    side = `<h3>${ms('receipt')}ใบเบิกคืน</h3><div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 6px"><span>ยอดคืนทีมงาน</span><span class="big" id="nfTot">${fmt(Number(f.amount) || 0)}</span></div><p class="formula">บันทึกเป็น "รอจ่ายคืน" · กดจ่ายคืนภายหลังได้ทั้งเงินสดย่อยหรือโอน · ลงสมุดค่าใช้จ่ายเมื่อจ่ายแล้ว</p>`;
  }
  if (t === 'EXP') {
    form = `<div class="fgrid">
      <div class="field full"><label for="n-title">รายการ</label><input class="inp" id="n-title" data-nf="title" placeholder="เช่น ค่าไฟสำนักงาน ต.ค." value="${esc(f.title)}"></div>
      <div class="field full"><label for="n-payee">จ่ายให้ (ร้านค้า / บริษัท)</label><input class="inp" id="n-payee" data-nf="payee" placeholder="เช่น การไฟฟ้าส่วนภูมิภาค" value="${esc(f.payee)}"></div>
      <div class="field"><label for="n-cat">หมวด</label><select class="sel" id="n-cat" data-nf="cat">${opts(cats(), f.cat)}</select></div>
      <div class="field"><label for="n-date">วันที่จ่าย</label><input class="inp" type="date" id="n-date" data-nf="date" value="${f.date}"></div>
      <div class="field"><label for="n-amt">ยอดเงิน (บาท)</label><input class="inp num" type="number" inputmode="decimal" id="n-amt" data-nf="amount" value="${esc(f.amount)}"></div>
      ${fileF('รูปใบเสร็จ / ใบแจ้งหนี้')}
      <div class="field full"><label>จ่ายจาก</label>${srcPick('n-src', f.src, 'ลงสมุดเมื่อแนบสลิปแล้ว')}</div></div>`;
    side = `<h3>${ms('storefront')}ค่าใช้จ่ายบริษัท</h3><div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 6px"><span>ยอดเงิน</span><span class="big" id="nfTot">${fmt(Number(f.amount) || 0)}</span></div><p class="formula">เงินสดย่อย: ตัดเงินและลงสมุดทันที · โอน: เข้ารายการรอโอน ลงสมุดเมื่อบันทึกโอนพร้อมสลิป</p>`;
  }
  const btn = { ADV: 'สร้างใบเงินทดรอง', RMB: 'บันทึกใบเบิกคืน', EXP: 'บันทึกค่าใช้จ่าย' }[t];
  return `${types}<div class="grid g2"><div class="card">${form}</div><div class="card calc">${side}<button class="btn pri block" style="margin-top:12px" data-act="nfSave">${ms('check')}${btn}</button><button class="btn ghost block" style="margin-top:6px" data-act="nfReset">ล้างฟอร์ม</button></div></div>`;
}
async function nfSave(b) {
  const f = ST.nf, t = f.type;
  const chk = [];
  if (t !== 'EXP') chk.push(['#n-staff', 'ทีมงาน']);
  chk.push(['#n-title', t === 'EXP' ? 'รายการ' : 'เรื่องที่เบิก'], ['#n-date', 'วันที่']);
  if (t === 'ADV') {
    const filled = f.items.filter((i) => i.desc.trim() || i.amount !== '');
    if (!filled.length) chk.push(['#ni-d-0', 'รายการ'], ['#ni-a-0', 'ยอดประมาณ', vMoney]);
    f.items.forEach((i, n) => { if (i.desc.trim() || i.amount !== '') chk.push([`#ni-d-${n}`, `รายการที่ ${n + 1}`], [`#ni-a-${n}`, `ยอดรายการที่ ${n + 1}`, vMoney]); });
  } else chk.push(['#n-amt', 'ยอดเงิน', vMoney], ['#n-file', 'ไฟล์ใบเสร็จ', vFileOk]);
  if (t === 'EXP' && f.src === 'BANK') chk.push(['#n-payee', 'จ่ายให้ (ผู้รับโอน)']);
  if (!need(chk)) return;
  await busy(b, async () => {
    const file = t === 'ADV' ? null : await fileOf($('#n-file'));
    const form = { staffId: f.staffId, customer: f.customer, title: f.title, date: f.date, items: f.items, cat: f.cat, amount: f.amount, payee: f.payee, src: f.src };
    const r = await api('docCreate', { type: t, form, file });
    ST.nf = null; await reloadTrv(); ST.pc = null; ST.ledger = null; ST.payq = null;
    ST.view = 'claims'; render(); drawDoc(r.no);
    toast({ ADV: f.src === 'PC' ? `สร้าง ${r.no} · จ่ายเงินสดย่อยแล้ว` : `สร้าง ${r.no} · เข้ารายการรอโอน`, RMB: `บันทึก ${r.no} · รอจ่ายคืน`, EXP: f.src === 'PC' ? `บันทึก ${r.no} · ลงสมุดแล้ว` : `บันทึก ${r.no} · เข้ารายการรอโอน` }[t]);
  });
}

// ---------- รายละเอียดใบที่ไม่ใช่ TRV ----------
/** เส้นทางแบบไทม์ไลน์: จุดเริ่ม → สถานที่ (ชื่อ + จังหวัด) → กลับ · ระยะแต่ละช่วงถ้ามี */
function routeCard(d, mapBtn) {
  const home = esc(ST.settings.home.name.split(' · ')[0]);
  const legs = Array.isArray(d.kmLegs) && d.kmLegs.length === d.stops.length + 1 ? d.kmLegs : null;
  const nm = (x) => { const p = String(x).split(' · '); return p.length > 1 ? { n: p.slice(0, -1).join(' · '), a: p[p.length - 1] } : { n: String(x), a: '' }; };
  const leg = (i) => legs ? `<span class="rt-leg">${fmt(legs[i])} กม.</span>` : '';
  const src = d.kmSrc === 'google' ? 'Google Maps' : d.kmSrc === 'osrm' ? 'OSRM' : d.kmSrc === 'ors' ? 'OpenRouteService' : d.kmSrc === 'est' ? 'ค่าประมาณ' : 'กรอกเอง';
  return `<div class="card"><h3>${ms('route')}เส้นทาง<span class="r">${d.stops.length} แห่ง · ${fmt(d.plan.km)} กม.</span></h3><ol class="rtl">
    <li class="rt-home">${ms('home', 'class="rt-dot"')}<div><b>${home}</b><small>ออกเดินทาง · ${dt(d.go)}</small></div></li>
    ${d.stops.map((x, i) => { const v = nm(x); return `<li>${leg(i)}<span class="rt-dot rt-n">${i + 1}</span><div><b>${esc(v.n)}</b>${v.a ? `<small>${ms('location_on', 'style="font-size:13px;vertical-align:-2px"')}${esc(v.a)}</small>` : ''}</div></li>`; }).join('')}
    <li class="rt-home">${leg(d.stops.length)}${ms('keyboard_return', 'class="rt-dot"')}<div><b>กลับ ${home}</b><small>${dt(d.back)}</small></div></li></ol>
    <div class="rt-foot"><span class="formula">ระยะจาก ${src}${d.kmReason ? ` · แก้เอง: ${esc(d.kmReason)}` : ''}</span>${mapBtn || ''}</div></div>`;
}
/** การ์ดต่อทริปในรายละเอียดใบ */
function extCards(d) {
  const dl = (x) => { const p = []; if (x.added && x.added.length) p.push(`เพิ่มสถานที่: ${x.added.map(esc).join(', ')}`); if (x.newBack !== x.oldBack) p.push(`กลับ ${dt(x.oldBack)} → ${dt(x.newBack)}`); if (x.addPeople && x.addPeople.length) p.push(`เพิ่มคน: ${x.addPeople.map(esc).join(', ')}`); if (x.km) p.push(`${x.km > 0 ? '+' : ''}${fmt(x.km)} กม.`); (x.extras || []).forEach((e) => p.push(`${esc(e.desc)} ${fmt(e.amount)}`)); return p.join(' · '); };
  const brk = (x) => `<div class="lines" style="margin-top:6px">${x.fuel ? `<div><span>ค่าน้ำมันเพิ่ม</span><b>${fmt(x.fuel)}</b></div>` : ''}${x.allowance ? `<div><span>เบี้ยเลี้ยงเพิ่ม</span><b>${fmt(x.allowance)}</b></div>` : ''}${x.hotel ? `<div><span>ที่พักเพิ่ม</span><b>${fmt(x.hotel)}</b></div>` : ''}${(x.extras || []).length ? `<div><span>ค่าใช้จ่ายอื่นเพิ่ม</span><b>${fmt(x.extras.reduce((t, e) => t + e.amount, 0))}</b></div>` : ''}</div>`;
  let h = '';
  if (d.extReject && !d.extReq) h += `<div class="banner warn">${ms('block')}<span>ไม่อนุมัติต่อทริป: <b>${esc(d.extReject)}</b></span></div>`;
  if (d.extReq) h += `<div class="card" style="border-color:var(--warn)"><h3>${ms('add_location_alt')}คำขอต่อทริป · รออนุมัติ<span class="r">+${fmt(d.extReq.amount)} บาท</span></h3><p style="margin:0">${dl(d.extReq.diff)}</p>${brk(d.extReq.diff)}<p class="formula" style="margin:6px 0 0">ขอโดย ${esc(d.extReq.byName)} · ${dtTime(d.extReq.at)}${d.extReq.note ? ` · ${esc(d.extReq.note)}` : ''}</p></div>`;
  if (d.extPay) h += `<div class="banner info">${ms('approval')}<span>ต่อทริปอนุมัติแล้ว · รอโอนเพิ่ม <b class="num">${fmt(d.extPay.amount)}</b> บาท${d.extPay.batch ? ` · อยู่ในใบเสนอ ${esc(d.extPay.batch)}` : ''}${d.extPay.ceoNote ? ` · CEO: ${esc(d.extPay.ceoNote)}` : ''}</span></div>`;
  if ((d.ext || []).length) h += `<div class="card"><h3>${ms('history_edu')}ต่อทริปแล้ว ${d.ext.length} ครั้ง</h3><div class="lines">${d.ext.map((e, i) => `<div><span>ครั้งที่ ${i + 1} · ${dl(e.diff)}<br><span class="f">${e.src === 'PC' ? 'จ่ายเงินสดย่อย' : e.src === 'BANK' ? (e.paid ? `โอนแล้ว ${e.paid.batch || ''}` : 'รอโอน') : 'ไม่มีเงินเพิ่ม'} · อนุมัติโดย ${esc(e.approvedByName)}</span></span><b>+${fmt(e.amount)}</b></div>`).join('')}</div></div>`;
  return h;
}
const VK_LABEL = { RV: 'ใบรับเงิน', PV: 'ใบสำคัญจ่าย', CL: 'ใบสรุปการเคลียร์' };
const voucherBtn = (d) => d.actual && ['TRV', 'ADV'].includes(d.type || 'TRV') && ['refund', 'topup', 'closed'].includes(d.status) && (isAdmin() || (isCeo() && d.vno)) ? `<button class="btn block" data-act="voucher" data-v="${d.no}">${ms('receipt_long')}พิมพ์${VK_LABEL[d.vkind || (d.diff < 0 ? 'RV' : d.diff > 0 ? 'PV' : 'CL')]}${d.vno ? ` ${esc(d.vno)}` : ' (A4)'}</button>` : '';
function drawOther(d) {
  const lead = d.staffId === ST.me.id;
  const act = actionsOther(d, lead) + (isCust() && ST.trialMode ? `<div style="border-top:1px dashed var(--line);padding-top:10px"><button class="btn block" style="color:var(--bad);border-color:var(--bad)" data-act="delAsk">${ms('delete_forever')}ลบใบนี้ (โหมดทดลอง)</button><div id="delBox"></div></div>` : '');
  const kv = [d.type === 'EXP' ? ['จ่ายให้', esc(d.payee || '—')] : [d.type === 'RMB' ? 'ทีมงานที่สำรองจ่าย' : 'ผู้รับเงิน', esc(d.staffName)], d.customer ? ['ลูกค้า', esc(d.customer)] : null, d.cat ? ['หมวด', esc(d.cat)] : null, ['วันที่', dt(d.go)], ['จ่ายโดย', d.paidFrom ? SRC_LABEL[d.paidFrom] : d.status === 'pending' ? 'รอจ่ายคืน' : '—'], ['บันทึกโดย', esc(d.createdByName || '')]].filter(Boolean);
  const items = d.type === 'ADV' ? `<div class="card"><h3>${ms('list_alt')}รายการที่ขอ</h3><div class="lines">${d.items.map((i) => `<div><span>${esc(i.desc)}</span><b>${fmt(i.amount)}</b></div>`).join('')}<div class="tot"><span>ยอดเงินทดรอง</span><b>${fmt(d.requested)}</b></div></div></div>` : `<div class="card"><div class="lines"><div class="tot" style="border:0;margin:0;padding:0"><span>ยอดเงิน</span><b>${fmt(d.requested)}</b></div></div>${d.file ? `<div style="margin-top:10px">${fileBtn(d.file, 'ใบเสร็จ')}</div>` : ''}</div>`;
  const vbtn = voucherBtn(d);
  const actual = d.type === 'ADV' && d.actual ? `${vbtn}<div class="card"><h3>${ms('fact_check')}ผลเคลียร์ (${d.actual.receipts.length} ใบเสร็จ)</h3><div class="lines">${d.actual.receipts.map((r) => `<div><span>${esc(r.desc)}<br><span class="f">${esc(r.cat)}${r.why ? ` · ไม่มีใบเสร็จ: ${esc(r.why)}` : ''}</span></span><span style="display:flex;gap:6px;align-items:center">${r.file ? fileBtn(r.file, 'ดู') : ''}<b>${fmt(r.amount)}</b></span></div>`).join('')}<div class="tot"><span>ใช้จริง</span><b>${fmt(d.actual.total)}</b></div></div>
      <div class="diffbox ${d.diff < 0 ? 'refund' : d.diff > 0 ? 'topup' : 'even'}" style="margin-top:10px"><span>${d.diff < 0 ? 'ทีมงานคืนเงิน' : d.diff > 0 ? 'บริษัทจ่ายเพิ่ม' : 'พอดี'}</span><b>${fmt(Math.abs(d.diff))} บาท</b></div></div>` : '';
  const pay = d.payment ? `<div class="lines" style="margin-top:6px"><div><span>โอนเมื่อ ${dt(d.payment.date)} · ${esc(d.payment.bank)}</span>${fileBtn(d.payment.slip, 'สลิป')}</div></div>` : '';
  openDrawer(`<div class="dh"><div><div style="display:flex;gap:8px;align-items:center">${tpill(d.type)}${statusPill(d)}</div><h2 class="num">${d.no}</h2></div><button class="btn sm ghost x" data-act="closeDrawer" aria-label="ปิด">${ms('close')}</button></div>
    <div class="db">${d.batch ? `<div class="banner info">${ms('approval')}<span>อยู่ในใบเสนอ CEO <b class="num">${esc(d.batch)}</b> · รอขั้นตอนโอน</span></div>` : ''}${d.ceoNote && !d.batch && ['approve', 'topup'].includes(d.status) ? `<div class="banner warn">${ms('edit_note')}<span>CEO: <b>${esc(d.ceoNote)}</b> · กลับมารอเข้าใบเสนอใหม่</span></div>` : ''}
      ${d.rejectNote && d.status === 'rejected' ? `<div class="banner bad">${ms('block')}<span>${d.cancelled ? 'ยกเลิก' : 'ไม่อนุมัติ'}: <b>${esc(d.rejectNote)}</b></span></div>` : ''}
      <div class="card"><span class="kind">${TYPE_LABEL[d.type]}</span><b style="font-size:16px;display:block;margin-top:6px">${esc(d.title)}</b><dl class="kv" style="margin-top:8px">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${pay}</div>
      ${items}${actual}
      <div class="card"><h3>${ms('history')}ความเคลื่อนไหว</h3><ul class="tl">${d.timeline.map((t) => `<li>${esc(t.text)}${t.amt != null ? ` · <b class="num">${fmt(t.amt)}</b>` : ''}<small>${dtTime(t.at)} · ${esc(t.byName)}</small></li>`).join('')}</ul></div>
    </div>${act ? `<div class="df">${act}</div>` : ''}`);
}
function actionsOther(d, lead) {
  const pc = ST.trv.pcBalance, pp = (ST.trv.people || []).find((x) => x.id === d.staffId) || {};
  if (isAdmin()) {
    if (d.status === 'pending') return `<div class="srcpick"><label><input type="radio" name="rsrc" value="PC" ${pc >= d.requested ? 'checked' : 'disabled'}> จ่ายเงินสดย่อย<br><small style="color:var(--sub)">เหลือ ${fmt(pc)}</small></label><label><input type="radio" name="rsrc" value="BANK" ${pc >= d.requested ? '' : 'checked'} ${pp.hasBank ? '' : 'disabled'}> โอนคืน<br><small style="color:var(--sub)">${pp.hasBank ? 'เข้ารายการรอโอน' : 'ยังไม่มีบัญชี'}</small></label></div>
      <button class="btn pri block" data-act="rmbPay">${ms('payments')}จ่ายคืน ${fmt(d.requested)} บาท</button><button class="btn block" data-act="decideAsk" data-v="cancel">${ms('block')}ยกเลิกใบนี้</button><div id="noteBox"></div>`;
    if (d.status === 'approve') return `<button class="btn pri block" data-act="go" data-v="payq">${ms('approval')}ไปที่ขออนุมัติโอน</button><button class="btn block" data-act="decideAsk" data-v="cancel">${ms('block')}ยกเลิกใบนี้</button><div id="noteBox"></div>`;
    if (d.type === 'ADV' && d.status === 'open') return `<button class="btn pri block" data-act="openAdv" data-v="${d.no}">${ms('fact_check')}เคลียร์ด้วยใบเสร็จ</button>`;
    if (d.status === 'refund' || (d.status === 'topup' && d.settleSrc === 'BANK')) return actionsFor(d, lead);
    return '';
  }
  if (!lead) return '';
  const t = { pending: 'รอ admin จ่ายคืน', approve: 'อนุมัติแล้ว รอโอนเข้าบัญชี', open: 'ใช้จ่ายแล้วส่งใบเสร็จให้ admin เคลียร์', refund: `นำเงินคืน ${fmt(-d.diff)} บาทให้ admin`, topup: `จะได้รับเงินเพิ่ม ${fmt(d.diff)} บาท`, closed: 'ใบนี้ปิดแล้ว', rejected: 'ใบนี้ถูกยกเลิก' }[d.status];
  return t ? `<p class="formula" style="margin:0">${t}</p>` : '';
}

// ---------- เคลียร์เงินทดรอง ----------
function vAdv() {
  const d = doc(ST.advNo); if (!d || d.type !== 'ADV' || d.status !== 'open' || !isAdmin()) { ST.view = 'clear'; return vClearList(); }
  const k = ST.ac || (ST.ac = { receipts: d.items.map((i) => ({ desc: i.desc, cat: cats()[0], amount: '', file: null, noRcpt: false, why: '' })), src: 'PC' });
  return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><button class="btn sm ghost" data-act="go" data-v="clear">${ms('arrow_back')}เคลียร์เงิน</button>${tpill('ADV')}<b class="num">${d.no}</b><span style="color:var(--sub)">${esc(d.staffName)} · ${esc(d.title)} · ${dt(d.go)}</span></div>
    <div class="grid g2"><div class="card"><h3>${ms('receipt_long')}ใบเสร็จที่ใช้จริง</h3><div class="items">${k.receipts.map((r, i) => `<div class="exrow clr">
        <div class="irow"><input class="inp" id="ac-d-${i}" data-ac="${i}:desc" placeholder="รายการ" value="${esc(r.desc)}"><select class="sel cat" id="ac-c-${i}" data-ac="${i}:cat" aria-label="หมวด">${opts(cats(), r.cat)}</select><input class="inp num" type="number" inputmode="decimal" id="ac-a-${i}" data-ac="${i}:amount" placeholder="บาท" value="${esc(r.amount)}"><button class="xbtn" data-act="acDel" data-v="${i}" aria-label="ลบใบเสร็จ" ${k.receipts.length < 2 ? 'disabled' : ''}>${ms('close', 'style="font-size:18px"')}</button></div>
        ${r.file ? `<span class="hint">${ms('check_circle', 'style="font-size:15px;vertical-align:-3px;color:var(--good)"')} แนบแล้ว ${fileBtn(r.file, 'ดู')}</span>` : `${r.noRcpt ? '' : `<div class="field"><input class="inp" type="file" id="ac-f-${i}" data-acf="${i}" accept="image/*,application/pdf" style="padding-top:6px" aria-label="รูปใบเสร็จ ${i + 1}"></div>`}<label class="ckl"><input type="checkbox" data-acn="${i}" ${r.noRcpt ? 'checked' : ''}> ไม่มีใบเสร็จ</label>${r.noRcpt ? `<div class="field"><input class="inp" id="ac-w-${i}" data-ac="${i}:why" value="${esc(r.why)}" placeholder="เหตุผลที่ไม่มีใบเสร็จ *"></div>` : ''}`}</div>`).join('')}
      <button class="btn sm" style="align-self:flex-start" data-act="acAdd">${ms('add')}เพิ่มใบเสร็จ</button></div></div>
    <div class="card calc"><div id="acCalc">${advCalcHtml(d, k)}</div><button class="btn pri block" style="margin-top:12px" data-act="acSave">${ms('task_alt')}ยืนยันผลเคลียร์</button></div></div>`;
}
function advCalcHtml(d, k) {
  const total = k.receipts.reduce((t, r) => t + (Number(r.amount) || 0), 0), diff = Math.round((total - d.requested) * 100) / 100;
  return `<h3>${ms('compare_arrows')}เทียบยอด</h3><div class="lines"><div><span>เงินทดรองที่จ่ายไป</span><b>${fmt(d.requested)}</b></div><div><span>ใบเสร็จรวม ${k.receipts.length} ใบ</span><b>${fmt(total)}</b></div></div>
    <div class="diffbox ${diff < 0 ? 'refund' : diff > 0 ? 'topup' : 'even'}" style="margin:12px 0"><span>${diff < 0 ? 'ทีมงานต้องคืนเงิน' : diff > 0 ? 'บริษัทต้องจ่ายเพิ่ม' : 'พอดี ปิดใบได้ทันที'}</span><b>${fmt(Math.abs(diff))} บาท</b></div>
    ${diff > 0 ? `<div class="srcpick"><label><input type="radio" name="asrc" value="PC" ${k.src === 'PC' ? 'checked' : ''}> จ่ายส่วนต่างเงินสดย่อย<br><small style="color:var(--sub)">เหลือ ${fmt(ST.trv.pcBalance)}</small></label><label><input type="radio" name="asrc" value="BANK" ${k.src === 'BANK' ? 'checked' : ''}> โอนส่วนต่าง</label></div>` : ''}`;
}
async function acSave(b) {
  const d = doc(ST.advNo), k = ST.ac, chk = [];
  k.receipts.forEach((r, i) => { chk.push([`#ac-d-${i}`, `รายการใบที่ ${i + 1}`], [`#ac-a-${i}`, `ยอดใบที่ ${i + 1}`, vMoney]); if (!r.file) chk.push(r.noRcpt ? [`#ac-w-${i}`, `เหตุผลไม่มีใบเสร็จ ใบที่ ${i + 1}`] : [`#ac-f-${i}`, `รูปใบเสร็จ ใบที่ ${i + 1}`, () => 'แนบรูป หรือติ๊ก "ไม่มีใบเสร็จ"']); });
  if (!need(chk)) return;
  await busy(b, async () => {
    const res = await api('advClear', { no: d.no, receipts: k.receipts.map((r) => ({ desc: r.desc, cat: r.cat, amount: r.amount, file: r.file, why: r.noRcpt ? r.why : '' })), src: k.src });
    ST.ac = null; await reloadTrv(); ST.view = 'clear'; ST.pc = null; ST.ledger = null; render(); drawDoc(d.no);
    toast(res.note || ({ closed: `${d.no} ปิดใบแล้ว`, refund: `${d.no} รอรับเงินคืน`, topup: `${d.no} รอโอนส่วนต่าง` }[res.status] || 'เคลียร์แล้ว'));
  });
}

// ---------- สมุดค่าใช้จ่าย ----------
const monKey = (s) => String(s || '').slice(0, 7);
const monTH = (k) => { const [y, m] = k.split('-').map(Number); return `${MON[m - 1]} ${y + 543}`; };
function ledgerRows() {
  const L = ST.ledger || [], F = ST.lf || (ST.lf = { mon: monKey(todayTH()), cat: 'all', src: 'all' });
  return L.filter((e) => (F.mon === 'all' || monKey(e.date) === F.mon) && (F.cat === 'all' || e.cat === F.cat) && (F.src === 'all' || e.src === F.src));
}
function vLedger() {
  if (!ST.ledger) { api('ledger').then((r) => { ST.ledger = r.list; render(); }).catch((e) => { fail(e); ST.ledger = []; render(); }); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const F = ST.lf || (ST.lf = { mon: monKey(todayTH()), cat: 'all', src: 'all' });
  const mons = [...new Set([monKey(todayTH()), ...ST.ledger.map((e) => monKey(e.date))])].sort().reverse();
  const list = ledgerRows(), tot = list.reduce((t, e) => t + e.amount, 0);
  const by = {}; list.forEach((e) => { by[e.cat] = (by[e.cat] || 0) + e.amount; }); const byC = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const refPill = (r) => r ? `${tpill(r.slice(0, 3))} <span class="num">${esc(r)}</span>` : '—';
  return `<div class="toolbar"><select class="sel" id="lf-mon" aria-label="เดือน">${opts([...mons.map((m) => [m, monTH(m)]), ['all', 'ทุกเดือน']], F.mon)}</select>
    <select class="sel" id="lf-cat" aria-label="หมวด">${opts([['all', 'ทุกหมวด'], ...[...new Set([...cats(), ...ST.ledger.map((e) => e.cat)])]], F.cat)}</select>
    <select class="sel" id="lf-src" aria-label="ที่มาเงิน">${opts([['all', 'ทุกที่มาเงิน'], ['PC', 'เงินสดย่อย'], ['BANK', 'โอนจากบัญชี']], F.src)}</select>
    <span class="sp"></span><button class="btn" data-act="ledgerXlsx" ${list.length ? '' : 'disabled'}>${ms('download')}ส่งออก Excel</button></div>
    ${byC.length ? `<div class="card" style="margin-bottom:12px"><h3>${ms('category')}ตามหมวด<span class="r">รวม <b class="num">${fmt(tot)}</b> บาท</span></h3><div class="hbars">${byC.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><span class="tr"><i style="width:${(v / byC[0][1] * 100).toFixed(1)}%"></i></span><span class="v">${fmt(v)}</span></div>`).join('')}</div></div>` : ''}
    <div class="tablewrap cards-on-mobile"><table><thead><tr><th>วันที่</th><th>เลขที่</th><th>หมวด</th><th>รายการ</th><th>อ้างอิงใบ</th><th>ที่มาเงิน</th><th class="r">ยอด</th></tr></thead><tbody>
      ${list.map((e) => `<tr ${e.ref && doc(e.ref) ? `class="click" data-act="openDoc" data-v="${esc(e.ref)}"` : ''}><td>${dt(e.date)}</td><td class="num">${esc(e.no)}</td><td>${esc(e.cat)}</td><td>${esc(e.desc)}</td><td>${refPill(e.ref)}</td><td>${SRC_LABEL[e.src] || '—'}</td><td class="r num">${fmt(e.amount)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">ไม่มีรายการในตัวกรองนี้</td></tr>'}
    </tbody><tfoot><tr><td colspan="6">รวม ${list.length} รายการ</td><td class="r num">${fmt(tot)}</td></tr></tfoot></table></div>
    <div class="clist">${list.map((e) => `<div class="ccard" ${e.ref && doc(e.ref) ? `role="button" data-act="openDoc" data-v="${esc(e.ref)}"` : ''}><div class="row"><b style="font-weight:600;min-width:0">${esc(e.desc)}</b><span class="sp amt">${fmt(e.amount)}</span></div><div class="row"><small>${dt(e.date)} · ${esc(e.cat)} · ${SRC_LABEL[e.src] || ''}</small>${e.ref ? `<span class="sp">${tpill(e.ref.slice(0, 3))}</span>` : ''}</div></div>`).join('') || '<div class="card empty">ไม่มีรายการในตัวกรองนี้</div>'}<div class="ccard" style="background:var(--soft)"><div class="row"><b>รวม ${list.length} รายการ</b><span class="sp amt">${fmt(tot)}</span></div></div></div>
    <p class="formula" style="margin-top:10px">ลงสมุดอัตโนมัติเมื่อปิดใบ (TRV / ADV หลังเคลียร์) · เมื่อจ่ายเบิกคืน (RMB) · เมื่อจ่ายค่าใช้จ่ายบริษัท (EXP)</p>`;
}
async function loadExcelJS() { if (!window.ExcelJS) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); return window.ExcelJS; }
async function saveWb(wb, name) { const buf = await wb.xlsx.writeBuffer(); saveBlob(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); }
async function ledgerXlsx() {
  const EX = await loadExcelJS(), F = ST.lf, rows = ledgerRows();
  const period = F.mon === 'all' ? 'ทุกเดือน' : monTH(F.mon);
  const filters = `${F.mon === 'all' ? 'ทุกเดือน' : `เดือน ${monTH(F.mon)}`} · ${F.cat === 'all' ? 'ทุกหมวด' : `หมวด ${F.cat}`} · ${F.src === 'all' ? 'ทุกที่มาเงิน' : SRC_LABEL[F.src]}`;
  await saveWb(buildLedgerWb(EX, { period, filters, by: ST.me.name, rows }), `C2-Pay-Ledger-${F.mon === 'all' ? 'all' : F.mon}.xlsx`);
}

// ---------- เงินสดย่อย (เต็ม) ----------
function vPc() {
  if (!ST.pc) { api('pcList').then((r) => { ST.pc = r; render(); }).catch((e) => { fail(e); ST.pc = { list: [], balance: 0, lowAlert: 0 }; render(); }); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const P = ST.pc, low = P.balance < P.lowAlert;
  const asc = [...P.list].sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.no).localeCompare(String(b.no)));
  let run = 0; const rows = asc.map((e) => { run += e.kind === 'in' ? e.amount : -e.amount; return { ...e, after: Math.round(run * 100) / 100 }; }).reverse();
  const lastTopI = asc.map((e) => !!e.topup).lastIndexOf(true), lastTop = lastTopI >= 0 ? asc[lastTopI] : null;
  const since = asc.slice(lastTopI + 1).filter((e) => !e.topup), used = Math.round(since.reduce((t, e) => t + (e.kind === 'out' ? e.amount : -e.amount), 0) * 100) / 100;
  const F = ST.pcForm || '';
  const forms = !isAdmin() ? '' : F === 'count' ? `<div class="inline-form"><div class="field"><label for="pc-count">เงินที่นับได้จริง (บาท)</label><input class="inp num" type="number" inputmode="decimal" id="pc-count" placeholder="${fmt(P.balance)}"></div><div class="field"><label for="pc-cnote">เหตุผล (ถ้ายอดไม่ตรง)</label><input class="inp" id="pc-cnote" placeholder="เช่น ทอนเงินผิด"></div><span id="countRes" style="font-size:13px;color:var(--sub);flex:1;min-width:150px">ใส่ยอดที่นับได้ ระบบบอกส่วนต่างให้</span><button class="btn pri" data-act="pcCount">${ms('check')}บันทึกตรวจนับ</button><button class="btn ghost" data-act="pcForm" data-v="">ปิด</button></div>`
    : F === 'topup' ? `<div class="inline-form"><div class="field"><label for="pc-amt">จำนวนเงิน (บาท)</label><input class="inp num" type="number" inputmode="decimal" id="pc-amt" value="${used > 0 ? used : ''}"></div><div class="field"><label for="pc-note">หมายเหตุ</label><input class="inp" id="pc-note" value="${used > 0 ? 'เบิกชดเชยเงินสดย่อย' : ''}" placeholder="เช่น ยอดยกมา / เติมกองทุน"></div><button class="btn pri" data-act="pcTopup">${ms('add')}บันทึกเติมเงิน</button><button class="btn ghost" data-act="pcForm" data-v="">ปิด</button></div>`
    : F === 'rep' ? `<div class="inline-form" style="display:block"><b style="display:block;margin-bottom:8px">ใช้ไปตั้งแต่เติมครั้งก่อน${lastTop ? ` (${dt(lastTop.date)})` : ''}</b><div class="lines">${since.map((e) => `<div><span>${dt(e.date)} · ${esc(e.note)}${e.ref ? ` <span class="f num">${esc(e.ref)}</span>` : ''}</span><b>${e.kind === 'in' ? '−' : ''}${fmt(e.amount)}</b></div>`).join('') || '<div class="empty">ยังไม่มีรายจ่าย</div>'}<div class="tot"><span>รวมที่ควรเบิกชดเชย (จ่ายออก − รับคืน)</span><b>${fmt(used)}</b></div></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${P.pcr ? '' : `<button class="btn pri" data-act="pcrRequest" ${used > 0 ? '' : 'disabled'}>${ms('approval')}ส่งเบิกชดเชยเข้าใบเสนอ CEO (${fmt(used)})</button>`}<button class="btn" data-act="pcForm" data-v="topup" ${used > 0 ? '' : 'disabled'}>${ms('add')}บันทึกเติมเงินเอง</button><button class="btn ghost" data-act="pcForm" data-v="">ปิด</button></div><p class="formula" style="margin:8px 0 0">ส่งเข้าใบเสนอ CEO → โอนเข้าบัญชีเงินสำรองจ่าย → ระบบเติมเงินสดย่อยให้อัตโนมัติเมื่อแนบสลิป</p></div>` : '';
  const ref = (r) => r ? (doc(r) ? `<span class="num">${esc(r)}</span>` : `<span class="num" style="color:var(--sub)">${esc(r)}</span>`) : '—';
  return `<div class="card"><div class="pchero"><div><div style="color:var(--sub);font-size:13px">คงเหลือในกองทุน</div><div class="big" style="${low ? 'color:var(--bad)' : ''}">${fmt(P.balance)} <span style="font-size:15px;color:var(--sub);font-weight:600">บาท</span></div>
      <div style="font-size:13px;color:var(--sub)">ใช้ไปตั้งแต่เติมครั้งก่อน${lastTop ? ` (${dt(lastTop.date)})` : ''} <b class="num" style="color:var(--ink)">${fmt(used)}</b> บาท</div>
      <div style="font-size:12.5px;margin-top:6px;color:${low ? 'var(--bad)' : 'var(--sub)'};font-weight:${low ? 600 : 400}">${low ? `ต่ำกว่า ${fmt(P.lowAlert)} บาท · ควรเติม` : `เตือนเมื่อคงเหลือต่ำกว่า ${fmt(P.lowAlert)} บาท`}</div>
      ${P.pcr ? `<div class="banner info" style="margin-top:8px">${ms('approval')}<span>เบิกชดเชย <b class="num">${fmt(P.pcr.amount)}</b> บาท ${P.pcr.batch ? `อยู่ในใบเสนอ <b class="num">${esc(P.pcr.batch)}</b>` : 'รอเข้าใบเสนอ CEO'}</span>${isAdmin() && !P.pcr.batch ? `<button class="btn sm" data-act="pcrCancel" style="margin-left:auto">ยกเลิกคำขอ</button>` : ''}</div>` : ''}</div>
      ${isAdmin() ? `<div style="display:flex;flex-direction:column;gap:8px"><button class="btn ${low ? 'pri' : ''}" data-act="pcForm" data-v="rep">${ms('request_page')}ยอดที่ควรเบิกชดเชย</button><button class="btn" data-act="pcForm" data-v="count">${ms('calculate')}ตรวจนับเงิน</button><button class="btn" data-act="pcForm" data-v="topup">${ms('add')}เติมเงิน</button></div>` : ''}</div>${forms}</div>
    <h3 style="font-size:15px;margin:20px 0 10px">รายการเข้า-ออก</h3>
    <div class="tablewrap cards-on-mobile"><table><thead><tr><th>วันที่</th><th>เลขที่</th><th>รายการ</th><th>อ้างอิง</th><th class="r">เข้า</th><th class="r">ออก</th><th class="r">คงเหลือ</th></tr></thead><tbody>
      ${rows.map((e) => `<tr ${e.ref && doc(e.ref) ? `class="click" data-act="openDoc" data-v="${esc(e.ref)}"` : ''}><td>${dt(e.date)}</td><td class="num">${esc(e.no)}</td><td>${esc(e.note)}${e.adjust ? ' <span class="pill p-pending">ปรับยอดตรวจนับ</span>' : ''}<br><small style="color:var(--sub)">${esc(e.byName || '')}</small></td><td>${ref(e.ref)}</td><td class="r num in">${e.kind === 'in' ? fmt(e.amount) : ''}</td><td class="r num out">${e.kind === 'out' ? fmt(e.amount) : ''}</td><td class="r num">${fmt(e.after)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">ยังไม่มีรายการ</td></tr>'}
    </tbody></table></div>
    <div class="clist">${rows.map((e) => `<div class="ccard"><div class="row"><span style="min-width:0">${esc(e.note)}<br><small>${dt(e.date)}${e.ref ? ' · ' + esc(e.ref) : ''}</small></span><span class="sp" style="text-align:right"><b class="num ${e.kind}">${e.kind === 'in' ? '+' : '−'}${fmt(e.amount)}</b><br><small class="num">เหลือ ${fmt(e.after)}</small></span></div></div>`).join('') || '<div class="card empty">ยังไม่มีรายการ</div>'}</div>`;
}

// ===== ส่งออก Excel แบบจัดรูปแบบ (ExcelJS) · ใช้ได้ทั้งในเบราว์เซอร์และ Node =====
const XC = { G: 'FF3F654D', G2: 'FF63816F', T: 'FFE4ECE7', Z: 'FFF4F7F5', L: 'FFD2DCD8', INK: 'FF201E1D', SUB: 'FF5F6C65', GOLD: 'FFC9A23F', W: 'FFFFFFFF' };
const XF = 'Tahoma';
const xFill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const xLine = (c = XC.L, s = 'thin') => ({ style: s, color: { argb: c } });
const NUM = '#,##0.00;[Red]-#,##0.00', NUM0 = '#,##0', PCT = '0.0%';
function xSheet(wb, name, cols, opt = {}) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], properties: { defaultRowHeight: 20, tabColor: { argb: opt.tab || XC.G } },
    pageSetup: { paperSize: 9, orientation: opt.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .25, footer: .25 } },
    headerFooter: { oddFooter: `&L&8C2-Pay · ${name}&R&8หน้า &P / &N` } });
  ws.columns = cols.map((c) => ({ width: c.w || 14 }));
  return ws;
}
/** หัวกระดาษ 4 แถว: ชื่อรายงาน · บริษัท · ช่วง/วันที่พิมพ์ · แถบสี */
function xHead(ws, title, sub, meta, span) {
  ws.mergeCells(1, 1, 1, span); ws.mergeCells(2, 1, 2, span); ws.mergeCells(3, 1, 3, span);
  const a = ws.getCell(1, 1); a.value = title; a.font = { name: XF, size: 16, bold: true, color: { argb: XC.G } }; ws.getRow(1).height = 28;
  const b = ws.getCell(2, 1); b.value = sub; b.font = { name: XF, size: 10, color: { argb: XC.SUB } };
  const c = ws.getCell(3, 1); c.value = meta; c.font = { name: XF, size: 9, color: { argb: XC.SUB }, italic: true };
  for (let i = 1; i <= span; i++) ws.getCell(4, i).fill = xFill(XC.G); ws.getRow(4).height = 4;
  return 6;
}
function xSection(ws, r, text, span) {
  ws.mergeCells(r, 1, r, span); const c = ws.getCell(r, 1); c.value = text; c.font = { name: XF, size: 11.5, bold: true, color: { argb: XC.G } };
  c.border = { bottom: xLine(XC.G, 'medium') }; ws.getRow(r).height = 22; return r + 1;
}
/** ตาราง: หัวสีเขียว แถวสลับสี ขอบบาง แถวรวม (สูตร SUM) */
function xTable(ws, r, cols, rows, opt = {}) {
  const h = ws.getRow(r); cols.forEach((c, i) => { const x = h.getCell(i + 1); x.value = c.h; x.font = { name: XF, size: 10, bold: true, color: { argb: XC.W } }; x.fill = xFill(XC.G);
    x.alignment = { vertical: 'middle', horizontal: c.num || c.pct ? 'right' : 'left', wrapText: true }; x.border = { top: xLine(XC.G), bottom: xLine(XC.G), left: xLine(XC.G), right: xLine(XC.G) }; });
  h.height = 24; const r0 = r + 1;
  rows.forEach((row, k) => { const R = ws.getRow(r0 + k); cols.forEach((c, i) => { const x = R.getCell(i + 1); const v = typeof c.v === 'function' ? c.v(row, r0 + k) : row[c.k];
    x.value = v == null ? '' : v; x.font = { name: XF, size: 10, color: { argb: XC.INK }, ...(c.font || {}) };
    if (c.num) x.numFmt = c.int ? NUM0 : NUM; if (c.pct) x.numFmt = PCT; if (c.date) x.numFmt = '[$-1070000]dd/mm/yyyy';
    x.alignment = { vertical: 'top', horizontal: c.num || c.pct ? 'right' : c.center ? 'center' : 'left', wrapText: !!c.wrap };
    x.border = { bottom: xLine(), left: xLine(), right: xLine() }; if (k % 2) x.fill = xFill(XC.Z); }); });
  const rN = r0 + rows.length - 1;
  if (opt.total && rows.length) {
    const T = ws.getRow(rN + 1); cols.forEach((c, i) => { const x = T.getCell(i + 1); const L = colL(i + 1);
      x.value = i === 0 ? (opt.totalLabel || `รวม ${rows.length} รายการ`) : c.sum ? { formula: `SUM(${L}${r0}:${L}${rN})` } : c.pctOf ? { formula: `SUM(${L}${r0}:${L}${rN})` } : '';
      x.font = { name: XF, size: 10.5, bold: true, color: { argb: XC.INK } }; x.fill = xFill(XC.T); if (c.num) x.numFmt = c.int ? NUM0 : NUM; if (c.pctOf) x.numFmt = PCT;
      x.alignment = { horizontal: c.num || c.pctOf ? 'right' : 'left' }; x.border = { top: xLine(XC.G, 'medium'), bottom: xLine(XC.G, 'medium') }; });
    T.height = 22;
  }
  if (opt.bar && rows.length) { const L = colL(opt.bar); ws.addConditionalFormatting({ ref: `${L}${r0}:${L}${rN}`, rules: [{ type: 'dataBar', minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF9DB8A9' } }] }); }
  if (opt.filter && rows.length) ws.autoFilter = { from: { row: r, column: 1 }, to: { row: rN, column: cols.length } };
  if (opt.freeze) ws.views = [{ state: 'frozen', ySplit: r, showGridLines: false }];
  if (opt.printTitle) ws.pageSetup.printTitlesRow = `${r}:${r}`;
  return { r0, rN, next: rN + (opt.total ? 3 : 2) };
}
const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
/** การ์ดตัวเลขสรุป: 2 คอลัมน์ต่อการ์ด */
function xKpis(ws, r, items) {
  items.forEach((it, i) => { const c0 = 1 + i * 2; ws.mergeCells(r, c0, r, c0 + 1); ws.mergeCells(r + 1, c0, r + 1, c0 + 1); ws.mergeCells(r + 2, c0, r + 2, c0 + 1);
    const a = ws.getCell(r, c0), b = ws.getCell(r + 1, c0), m = ws.getCell(r + 2, c0);
    a.value = it.l; a.font = { name: XF, size: 9, color: { argb: XC.SUB } };
    b.value = it.v; b.font = { name: XF, size: 18, bold: true, color: { argb: it.tone || XC.G } }; b.numFmt = it.int ? NUM0 : '#,##0';
    m.value = it.m || ''; m.font = { name: XF, size: 8.5, color: { argb: XC.SUB } };
    [a, b, m].forEach((x, k) => { x.fill = xFill(XC.Z); x.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      x.border = { left: xLine(XC.G, 'thick'), top: k === 0 ? xLine() : undefined, bottom: k === 2 ? xLine() : undefined, right: xLine() }; }); });
  ws.getRow(r).height = 18; ws.getRow(r + 1).height = 30; ws.getRow(r + 2).height = 16;
  return r + 4;
}
const thaiNow = () => { const d = new Date(); const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const toDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const CO = 'บริษัท ซีทูเทค จำกัด · 99/3 หมู่ 9 ต.วังไก่เถื่อน อ.หันคา จ.ชัยนาท 17130';

/** รายงาน: D = { period, by, total, kpis[], byCat[[k,v]], byType[[k,v]], byStaff[{name,n,trips,days,amt}], byCust[[k,{n,amt}]], trend[[label,v]]|null, rows[{date,no,cat,desc,ref,src,amount}] } */
function buildReportWb(ExcelJS, D) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'C2-Pay'; wb.created = new Date();
  const meta = `ช่วง ${D.period} · พิมพ์เมื่อ ${thaiNow()}${D.by ? ` โดย ${D.by}` : ''} · ข้อมูลจากสมุดค่าใช้จ่าย (ลงเมื่อปิดใบ/จ่ายแล้ว)`;
  // สรุป
  let ws = xSheet(wb, 'สรุป', [{ w: 16 }, { w: 14 }, { w: 16 }, { w: 14 }, { w: 16 }, { w: 14 }, { w: 16 }, { w: 14 }]);
  let r = xHead(ws, `C2-Pay · รายงานค่าใช้จ่าย ${D.period}`, CO, meta, 8);
  r = xKpis(ws, r, D.kpis);
  r = xSection(ws, r, 'ค่าใช้จ่ายตามหมวด', 8);
  const tot = D.total || 1;
  ws.mergeCells; // (ตารางหมวดใช้คอลัมน์ A–D)
  let t = xTable(ws, r, [{ h: 'หมวด', k: 0 }, { h: 'ยอด (บาท)', k: 1, num: 1, sum: 1 }, { h: 'สัดส่วน', v: (x, rr) => ({ formula: `B${rr}/${D.total || 1}` }), pct: 1, pctOf: 1 }, { h: '', v: () => '' }], D.byCat, { total: 1, totalLabel: 'รวมทั้งหมด', bar: 2 });
  r = xSection(ws, t.next, 'ตามประเภทใบ', 8);
  t = xTable(ws, r, [{ h: 'ประเภท', k: 0 }, { h: 'ยอด (บาท)', k: 1, num: 1, sum: 1 }, { h: 'สัดส่วน', v: (x, rr) => ({ formula: `B${rr}/${D.total || 1}` }), pct: 1, pctOf: 1 }], D.byType, { total: 1, totalLabel: 'รวม', bar: 2 });
  if (D.trend) { r = xSection(ws, t.next, 'รายเดือน', 8); t = xTable(ws, r, [{ h: 'เดือน', k: 0 }, { h: 'ยอด (บาท)', k: 1, num: 1, sum: 1 }], D.trend, { total: 1, totalLabel: 'รวมทั้งปี', bar: 2 }); }
  ws.getColumn(1).width = 22;
  // ทีมงาน
  ws = xSheet(wb, 'ตามทีมงาน', [{ w: 28 }, { w: 10 }, { w: 10 }, { w: 14 }, { w: 16 }, { w: 22 }]);
  r = xHead(ws, 'ค่าใช้จ่ายตามทีมงาน', CO, meta, 6);
  xTable(ws, r, [{ h: 'ทีมงาน', k: 'name' }, { h: 'ใบ', k: 'n', num: 1, int: 1, sum: 1 }, { h: 'ทริป', k: 'trips', num: 1, int: 1, sum: 1 }, { h: 'วันเดินทาง', k: 'days', num: 1, int: 1, sum: 1 }, { h: 'ค่าใช้จ่าย (บาท)', k: 'amt', num: 1, sum: 1 }, { h: '', v: () => '' }], D.byStaff, { total: 1, bar: 5, printTitle: 1 });
  // ลูกค้า
  ws = xSheet(wb, 'ตามลูกค้า', [{ w: 34 }, { w: 10 }, { w: 16 }, { w: 22 }]);
  r = xHead(ws, 'ค่าใช้จ่ายตามลูกค้า / สถานที่', CO, `${meta} · ทริปหลายที่หารเท่ากันตามจำนวนสถานที่`, 4);
  xTable(ws, r, [{ h: 'ลูกค้า / สถานที่', k: 0 }, { h: 'ครั้ง', v: (x) => x[1].n, num: 1, int: 1, sum: 1 }, { h: 'ค่าใช้จ่าย (บาท)', v: (x) => Math.round(x[1].amt * 100) / 100, num: 1, sum: 1 }], D.byCust, { total: 1, bar: 3, printTitle: 1 });
  // รายการ
  ws = xSheet(wb, 'รายการ', [{ w: 13 }, { w: 15 }, { w: 18 }, { w: 46 }, { w: 15 }, { w: 14 }, { w: 15 }], { landscape: 1, tab: XC.G2 });
  r = xHead(ws, `รายการค่าใช้จ่าย ${D.period}`, CO, meta, 7);
  xTable(ws, r, [{ h: 'วันที่', v: (e) => toDate(e.date), date: 1 }, { h: 'เลขที่', k: 'no' }, { h: 'หมวด', k: 'cat' }, { h: 'รายการ', k: 'desc', wrap: 1 }, { h: 'อ้างอิงใบ', k: 'ref' }, { h: 'ที่มาเงิน', v: (e) => e.src === 'BANK' ? 'โอนจากบัญชี' : 'เงินสดย่อย' }, { h: 'ยอด (บาท)', k: 'amount', num: 1, sum: 1 }], D.rows, { total: 1, filter: 1, freeze: 1, printTitle: 1 });
  return wb;
}
/** สมุดค่าใช้จ่าย: L = { period, filters, by, rows } */
function buildLedgerWb(ExcelJS, L) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'C2-Pay'; wb.created = new Date();
  const meta = `${L.filters} · พิมพ์เมื่อ ${thaiNow()}${L.by ? ` โดย ${L.by}` : ''}`;
  let ws = xSheet(wb, 'สมุดค่าใช้จ่าย', [{ w: 13 }, { w: 15 }, { w: 18 }, { w: 46 }, { w: 15 }, { w: 14 }, { w: 15 }], { landscape: 1 });
  let r = xHead(ws, `สมุดค่าใช้จ่าย ${L.period}`, CO, meta, 7);
  xTable(ws, r, [{ h: 'วันที่', v: (e) => toDate(e.date), date: 1 }, { h: 'เลขที่', k: 'no' }, { h: 'หมวด', k: 'cat' }, { h: 'รายการ', k: 'desc', wrap: 1 }, { h: 'อ้างอิงใบ', k: 'ref' }, { h: 'ที่มาเงิน', v: (e) => e.src === 'BANK' ? 'โอนจากบัญชี' : 'เงินสดย่อย' }, { h: 'ยอด (บาท)', k: 'amount', num: 1, sum: 1 }], L.rows, { total: 1, filter: 1, freeze: 1, printTitle: 1 });
  const by = {}; L.rows.forEach((e) => { by[e.cat] = (by[e.cat] || 0) + e.amount; }); const tot = L.rows.reduce((t, e) => t + e.amount, 0) || 1;
  ws = xSheet(wb, 'สรุปตามหมวด', [{ w: 26 }, { w: 16 }, { w: 12 }, { w: 24 }]);
  r = xHead(ws, `สรุปตามหมวด ${L.period}`, CO, meta, 4);
  xTable(ws, r, [{ h: 'หมวด', k: 0 }, { h: 'ยอด (บาท)', k: 1, num: 1, sum: 1 }, { h: 'สัดส่วน', v: (x, rr) => ({ formula: `B${rr}/${tot}` }), pct: 1, pctOf: 1 }], Object.entries(by).sort((a, b) => b[1] - a[1]), { total: 1, totalLabel: 'รวมทั้งหมด', bar: 2 });
  return wb;
}

// ---------- ใบสำคัญหลังเคลียร์ (RV / PV / CL) ----------
const MONTH_F = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const dFull = (s) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTH_F[m - 1]} ${y + 543}`; };
const dRangeF = (a, b) => { if (!b || a === b) return dFull(a); const [ya, ma, da] = a.split('-').map(Number), [yb, mb, db] = b.split('-').map(Number); return ya === yb && ma === mb ? `${da}–${db} ${MONTH_F[mb - 1]} ${yb + 543}` : `${dFull(a)} – ${dFull(b)}`; };
const fmt2 = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function voucherPrint(no) {
  const r = await api('voucherNo', { no }); await reloadTrv(); const d = doc(no); if (!d) return;
  const kind = r.vkind, vno = r.vno, st = set(), co = ST.settings.settings || {};
  const adv = d.requested, used = d.actual.total, amt = Math.abs(d.diff || 0);
  const date = (d.settle && (d.settle.date || (d.settle.at || '').slice(0, 10))) || (d.closedAt || d.clearedAt || '').slice(0, 10) || todayTH();
  const batch = (d.payment && d.payment.batch) || (d.settle && d.settle.batch) || '';
  const refs = [d.no, batch].filter(Boolean).join(' · ');
  const trv = (d.type || 'TRV') === 'TRV';
  const trip = trv ? `เดินทางปฏิบัติงาน ${esc(d.title)} (${d.stops.map(esc).join(', ')})` : `ใช้เงินทดรอง ${esc(d.title)}`;
  const range = trv ? `ระหว่างวันที่ ${dRangeF(d.go, d.back)}` : `วันที่ ${dFull(d.go)}`;
  const extAmt = (d.ext || []).reduce((t, e) => t + (e.amount || 0), 0), extNote = extAmt ? ` (รวมต่อทริป ${fmt(extAmt)} บาท)` : '';
  const ck = (on) => `<span class="vbox">${on ? '✓' : ''}</span>`;
  const how = d.settle ? d.settle.how || d.settle.src || (d.settle.bank ? 'BANK' : '') : '';
  const T = {
    RV: { title: 'ใบรับเงิน', en: 'Receipt Voucher', who: 'ได้รับเงินจาก (Payer)', by: 'รับโดย (Received By)', purpose: `รับเงินคืนเงินเบิกคงเหลือ จากการ${trip} ${range} (อ้างอิง ${refs})`,
      lines: [`ยอดเงินเบิกล่วงหน้า เป็นเงิน ${fmt(adv)} บาท${extNote}`, `หัก ยอดใช้จ่ายจริงตามใบเสร็จ เป็นเงิน ${fmt(used)} บาท`, `ยอดเงินคงเหลือส่งคืนบริษัท เป็นเงิน ${fmt(amt)} บาท`],
      total: 'รวมรับเงินทั้งสิ้น (Total Amount Received)', signL: 'ผู้จ่ายเงิน', signR: 'ผู้รับเงิน',
      opts: `<span class="vopt">${ck(how === 'PC')} เงินสด (เข้าเงินสดย่อย)</span><span class="vopt">${ck(how === 'BANK')} โอนเข้าบัญชีบริษัท${co.bankName ? ` ธนาคาร${esc(co.bankName)}` : ''}<span class="vacc">เลขที่บัญชี <u>${esc(co.accCo || '........................')}</u></span></span>` },
    PV: { title: 'ใบสำคัญจ่าย', en: 'Payment Voucher', who: 'จ่ายให้ (Payee)', by: 'จ่ายโดย (Paid By)', purpose: `จ่ายเงินส่วนต่างที่ใช้จริงเกินยอดเบิก จากการ${trip} ${range} (อ้างอิง ${refs})`,
      lines: [`ยอดใช้จ่ายจริงตามใบเสร็จ เป็นเงิน ${fmt(used)} บาท`, `หัก ยอดเงินเบิกล่วงหน้า เป็นเงิน ${fmt(adv)} บาท${extNote}`, `ยอดที่บริษัทจ่ายเพิ่มให้ผู้เบิก เป็นเงิน ${fmt(amt)} บาท`],
      total: 'รวมจ่ายเงินทั้งสิ้น (Total Amount Paid)', signL: 'ผู้จ่ายเงิน', signR: 'ผู้รับเงิน',
      opts: `<span class="vopt">${ck(how === 'PC')} เงินสด (เงินสดย่อย)</span><span class="vopt">${ck(how !== 'PC' && !!how)} โอนเข้าบัญชีผู้รับเงิน<span class="vacc">${esc((d.settle && d.settle.bank) || '........................')}${batch ? ` · ${esc(batch)}` : ''}</span></span>` },
    CL: { title: 'ใบสรุปการเคลียร์เงิน', en: 'Clearing Summary', who: 'ผู้เคลียร์เงิน', by: '', purpose: `สรุปการเคลียร์เงินเบิก จากการ${trip} ${range} (อ้างอิง ${refs})`,
      lines: [`ยอดเงินเบิกล่วงหน้า เป็นเงิน ${fmt(adv)} บาท${extNote}`, `หัก ยอดใช้จ่ายจริงตามใบเสร็จ เป็นเงิน ${fmt(used)} บาท`, 'ยอดคงเหลือ 0 บาท (พอดี ไม่มีรับ/จ่ายเพิ่ม)'],
      total: 'ยอดคงเหลือสุทธิ', signL: 'ผู้เคลียร์เงิน', signR: 'ผู้ตรวจสอบ', opts: '' } }[kind];
  const dot = (v) => `<span class="vfill">${v}</span>`;
  const sign = (role) => `<div class="vsign"><div><span>ลงชื่อ</span><span class="vfill"></span><span>${role}</span></div><div><span>วันที่</span><span class="vfill"></span></div></div>`;
  const a = d.actual, ln = (k, v) => `<div class="ln2"><span>${k}</span><b>${fmt(v)}</b></div>`;
  const att = trv ? ln('ค่าน้ำมันตามจริง', a.fuel) + ln(`ค่าเบี้ยเลี้ยง ${a.people} คน × ${a.days} วัน × ${fmt(st.allowance)}`, a.allowance) + ln(`ค่าที่พัก ${a.nights} คืน`, a.hotel)
      + (a.hotelExcess > 0 ? `<div class="ln2"><span>ส่วนเกินที่พัก ${fmt(a.hotelExcess)} ${a.hotelExApproved ? '(admin อนุมัติ)' : '(ไม่อนุมัติ · ไม่รวม)'}</span><b></b></div>` : '')
      + (a.extras || []).map((e, i) => ln(`ค่าใช้จ่ายอื่น ${i + 1}. ${esc(e.desc)} (${esc(e.cat)})${e.why ? ' · ไม่มีใบเสร็จ: ' + esc(e.why) : ''}`, e.counted)).join('')
    : (a.receipts || []).map((x) => ln(`${esc(x.desc)} (${esc(x.cat)})${x.why ? ' · ไม่มีใบเสร็จ: ' + esc(x.why) : ''}`, x.amount)).join('');
  const head = (t) => a4Head('บริษัท ซีทูเทค จำกัด', '99/3 หมู่ 9 ต.วังไก่เถื่อน อ.หันคา จ.ชัยนาท 17130', `<b>${t}</b>เลขที่ ${vno}<br>วันที่ ${thDate(date)}`);
  const p1 = `<div class="a4 vch">${head(`${T.title}<small>(${T.en})</small>`)}
    <div class="vrow"><span class="vk">${T.who}</span>${dot(esc(d.staffName))}<span class="vk">วันที่ (Date)</span>${dot(thDate(date))}</div>
    ${T.by ? `<div class="vrow vtop"><span class="vk">${T.by}</span><div class="vopts">${T.opts}</div></div>` : ''}
    <div class="vrow vtop"><span class="vk">วัตถุประสงค์</span><span class="vp">${T.purpose}</span></div>
    <table class="vt"><thead><tr><th style="width:52px">ลำดับ</th><th>รายการ/รายละเอียด</th><th style="width:140px">เอกสารอ้างอิง</th><th style="width:110px" class="r">จำนวนเงิน</th></tr></thead>
      <tbody><tr><td class="c">1</td><td>${{ RV: 'รับคืนเงินเบิกคงเหลือ', PV: 'จ่ายเพิ่มส่วนต่างค่าใช้จ่าย', CL: 'เคลียร์เงินเบิก' }[kind]} - ${trv ? `ค่าเดินทางปฏิบัติงาน ${esc(d.title)}` : `เงินทดรอง ${esc(d.title)}`} ${range}</td><td class="c">${refs.replace(' · ', '<br>')}</td><td class="r num">${fmt(amt)}.-</td></tr>
      ${T.lines.map((l) => `<tr class="vsub"><td></td><td colspan="3">- ${l}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="r"><b>${T.total}</b></td><td class="r num"><b>${fmt2(amt)}</b></td></tr></tfoot></table>
    <div class="words">(${amt ? bahtText(amt) : 'ศูนย์บาทถ้วน'})</div>
    <div class="vsigns">${sign(T.signL)}${sign(T.signR)}</div>
    <div class="pfoot"><span>พิมพ์จากระบบ C2-Pay · ${d.no}</span><span>หน้า 1/2</span></div></div>`;
  const p2 = `<div class="a4">${head('รายละเอียดค่าใช้จ่ายจริง')}<div class="item"><h4>${d.no} · ${esc(d.title)}<span>${fmt(used)} บาท</span></h4>${trv ? `<div class="jobh"><span><span class="k">ชื่องาน :</span> <b>${esc(d.title)}</b></span><span><span class="k">ระหว่างวันที่</span> <b>${dRangeF(d.go, d.back)}</b></span></div>` : ''}${att}<div class="xtot"><span>รวมใช้จริง</span><b>${fmt(used)} บาท</b></div><div class="xwords">(${bahtText(used)})</div></div><div class="pfoot" style="margin-top:auto"><span>${vno} · เอกสารแนบ</span><span>หน้า 2/2</span></div></div>`;
  let pv = $('#printv'); if (!pv) { pv = document.createElement('div'); pv.id = 'printv'; pv.className = 'printv'; document.body.appendChild(pv); }
  pv.innerHTML = `<div class="pbar"><b>${vno}</b><small>${T.title} · A4 2 หน้า</small><span style="margin-left:auto;display:flex;gap:8px"><button class="btn pri sm" data-act="doPrint">${ms('print')}พิมพ์ / บันทึก PDF</button><button class="btn sm" data-act="closePrint">${ms('close')}ปิด</button></span></div><div class="pages">${p1}${p2}</div>`;
  pv.classList.add('on'); drawDoc(no);
}

// ---------- รายงาน ----------
function vReport() {
  if (!ST.trv) return needTrv();
  if (!ST.ledger) { api('ledger').then((r) => { ST.ledger = r.list; render(); }).catch((e) => { fail(e); ST.ledger = []; render(); }); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const R = rptData(), F = ST.rf;
  const years = [...new Set([todayTH().slice(0, 4), ...ST.ledger.map((e) => String(e.date).slice(0, 4))])].sort().reverse();
  const mons = [...new Set([monKey(todayTH()), ...ST.ledger.map((e) => monKey(e.date))])].sort().reverse();
  const hb = (arr) => arr.length ? `<div class="hbars">${arr.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><span class="tr"><i style="width:${(v / arr[0][1] * 100).toFixed(1)}%"></i></span><span class="v">${fmt(v)}</span></div>`).join('')}</div>` : '<div class="empty">ไม่มีข้อมูล</div>';
  const kpi = (l, v, m) => `<div class="card kpi"><span class="lab">${l}</span><span class="val">${v}</span><span class="meta">${m}</span></div>`;
  const trend = R.trend ? `<div class="card" style="margin-top:14px"><h3>${ms('bar_chart')}รายเดือน ปี ${Number(F.y) + 543}</h3><div class="mbars">${R.trend.map(([m, v]) => `<div class="mb"><span class="bv">${v ? fmt(v) : ''}</span><i style="height:${R.tmax ? Math.max(2, v / R.tmax * 100) : 2}%"></i><span>${MON[m]}</span></div>`).join('')}</div></div>` : '';
  return `<div class="toolbar"><div class="seg" role="tablist">${[['m', 'รายเดือน'], ['y', 'รายปี']].map(([k, l]) => `<button class="${F.p === k ? 'on' : ''}" data-act="rfP" data-v="${k}">${l}</button>`).join('')}</div>
    ${F.p === 'm' ? `<select class="sel" id="rf-m" aria-label="เดือน">${opts(mons.map((m) => [m, monTH(m)]), F.m)}</select>` : `<select class="sel" id="rf-y" aria-label="ปี">${opts(years.map((y) => [y, `ปี ${Number(y) + 543}`]), F.y)}</select>`}
    <span class="sp"></span><button class="btn" data-act="rptXlsx">${ms('download')}ส่งออก Excel</button></div>
    <div class="grid kpis">${kpi('ค่าใช้จ่ายรวม', fmt(R.total), `${R.rows.length} รายการในสมุด`)}${kpi('ค่าเดินทาง (TRV)', fmt(R.byType.TRV || 0), `${R.trips} ทริป · ${fmt(R.km)} กม.`)}${kpi('จ่ายจากเงินสดย่อย', fmt(R.bySrc.PC || 0), `โอน ${fmt(R.bySrc.BANK || 0)}`)}${kpi('ใบที่ยังไม่ปิด', R.openN, R.openAmt ? `ยอดเบิกค้าง ${fmt(R.openAmt)}` : 'ไม่มีค้าง')}</div>
    ${trend}
    <div class="grid g2e" style="margin-top:14px;align-items:start">
      <div class="card"><h3>${ms('category')}ตามหมวด<span class="r">รวม ${fmt(R.total)} บาท</span></h3>${hb(R.byCat)}</div>
      <div class="card"><h3>${ms('receipt_long')}ตามประเภทใบ</h3>${hb(Object.entries(R.byType).filter(([, v]) => v).map(([k, v]) => [`${k} · ${TYPE_LABEL[k] || 'อื่นๆ'}`, v]).sort((a, b) => b[1] - a[1]))}</div>
      <div class="tablewrap"><table><thead><tr><th>ทีมงาน</th><th class="r">ใบ</th><th class="r">ทริป</th><th class="r">วันเดินทาง</th><th class="r">ค่าใช้จ่าย</th></tr></thead><tbody>${R.byStaff.map((o) => `<tr><td>${esc(o.name)}</td><td class="r num">${o.n}</td><td class="r num">${o.trips}</td><td class="r num">${o.days}</td><td class="r num">${fmt(o.amt)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">ไม่มีข้อมูล</td></tr>'}</tbody></table></div>
      <div class="tablewrap"><table><thead><tr><th>ลูกค้า / สถานที่</th><th class="r">ครั้ง</th><th class="r">ค่าใช้จ่าย</th></tr></thead><tbody>${R.byCust.map(([k, o]) => `<tr><td>${esc(k)}</td><td class="r num">${o.n}</td><td class="r num">${fmt(o.amt)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">ไม่มีข้อมูล</td></tr>'}</tbody></table></div>
    </div>
    <p class="formula" style="margin-top:10px">ตัวเลขมาจากสมุดค่าใช้จ่าย (ลงเมื่อปิดใบ/จ่ายแล้ว) · ค่าใช้จ่ายต่อลูกค้า: ทริปที่ไปหลายที่หารเท่ากันตามจำนวนสถานที่ · ใบที่ยังไม่ปิดยังไม่นับในยอด</p>`;
}
function rptData() {
  const F = ST.rf || (ST.rf = { p: 'm', m: monKey(todayTH()), y: todayTH().slice(0, 4) });
  const inP = (date) => F.p === 'm' ? monKey(date) === F.m : String(date).slice(0, 4) === F.y;
  const rows = (ST.ledger || []).filter((e) => inP(e.date)); const total = rows.reduce((t, e) => t + e.amount, 0);
  const sum = (key) => { const o = {}; rows.forEach((e) => { const k = key(e); o[k] = (o[k] || 0) + e.amount; }); return o; };
  const docs = {}; ST.trv.list.forEach((d) => { docs[d.no] = d; });
  const byCat = Object.entries(sum((e) => e.cat)).sort((a, b) => b[1] - a[1]);
  const byType = sum((e) => (docs[e.ref] && (docs[e.ref].type || 'TRV')) || (e.ref ? e.ref.slice(0, 3) : 'EXP'));
  const bySrc = sum((e) => e.src || 'PC');
  const st = {}, cu = {};
  rows.forEach((e) => { const d = docs[e.ref]; if (!d) return;
    if (d.type !== 'EXP') { const o = st[d.staffId] || (st[d.staffId] = { name: d.staffName, n: new Set(), trips: new Set(), days: 0, amt: 0 }); o.amt += e.amount; o.n.add(d.no); if ((d.type || 'TRV') === 'TRV' && !o.trips.has(d.no)) { o.trips.add(d.no); o.days += dayDiff(d.go, d.back) + 1; } }
    const places = (d.type || 'TRV') === 'TRV' ? d.stops : d.customer ? [d.customer] : [];
    places.forEach((p) => { const o = cu[p] || (cu[p] = { n: new Set(), amt: 0 }); o.amt += e.amount / places.length; o.n.add(d.no); }); });
  const byStaff = Object.values(st).map((o) => ({ ...o, n: o.n.size, trips: o.trips.size })).sort((a, b) => b.amt - a.amt);
  const byCust = Object.entries(cu).map(([k, o]) => [k, { n: o.n.size, amt: o.amt }]).sort((a, b) => b[1].amt - a[1].amt).slice(0, 20);
  const tripDocs = ST.trv.list.filter((d) => (d.type || 'TRV') === 'TRV' && d.status === 'closed' && inP(d.back));
  const km = tripDocs.reduce((t, d) => t + ((d.plan && d.plan.km) || 0), 0);
  const openD = ST.trv.list.filter((d) => !['closed', 'rejected'].includes(d.status) && inP(d.go));
  let trend = null, tmax = 0;
  if (F.p === 'y') { const m = Array(12).fill(0); (ST.ledger || []).forEach((e) => { if (String(e.date).slice(0, 4) === F.y) m[Number(String(e.date).slice(5, 7)) - 1] += e.amount; }); trend = m.map((v, i) => [i, v]); tmax = Math.max(...m); }
  return { rows, total, byCat, byType, bySrc, byStaff, byCust, trips: tripDocs.length, km, openN: openD.length, openAmt: openD.reduce((t, d) => t + (d.requested || 0), 0), trend, tmax };
}
async function rptXlsx() {
  const EX = await loadExcelJS(), R = rptData(), F = ST.rf;
  const period = F.p === 'm' ? monTH(F.m) : `ปี ${Number(F.y) + 543}`;
  const D = { period, by: ST.me.name, total: R.total, rows: R.rows,
    kpis: [{ l: 'ค่าใช้จ่ายรวม', v: R.total, m: `${R.rows.length} รายการในสมุด` }, { l: 'ค่าเดินทาง (TRV)', v: R.byType.TRV || 0, m: `${R.trips} ทริป · ${fmt(R.km)} กม.` }, { l: 'จ่ายจากเงินสดย่อย', v: R.bySrc.PC || 0, m: `โอน ${fmt(R.bySrc.BANK || 0)}` }, { l: 'ใบที่ยังไม่ปิด', v: R.openN, int: 1, m: R.openAmt ? `ยอดเบิกค้าง ${fmt(R.openAmt)}` : 'ไม่มีค้าง', tone: R.openN ? 'FFB83A30' : undefined }],
    byCat: R.byCat, byType: Object.entries(R.byType).filter(([, v]) => v).map(([k, v]) => [`${k} · ${TYPE_LABEL[k] || 'อื่นๆ'}`, v]).sort((a, b) => b[1] - a[1]),
    byStaff: R.byStaff.map((o) => ({ ...o, amt: Math.round(o.amt * 100) / 100 })), byCust: R.byCust, trend: R.trend ? R.trend.map(([m, v]) => [MON[m], v]) : null };
  await saveWb(buildReportWb(EX, D), `C2-Pay-Report-${F.p === 'm' ? F.m : F.y}.xlsx`);
}

const fmtN = (n) => Number(n || 0).toLocaleString('th-TH');
async function loadGmu() { if (ST.gmuLoading) return; ST.gmuLoading = true; try { ST.gmu = await api('mapsUsage'); } catch (e) { ST.gmu = { ac: 0, details: 0, routes: 0, cap: 9000 }; } ST.gmuLoading = false; if (ST.view === 'settings') render(); }
// ===== loaders =====
async function loadMembers() { try { ST.members = (await api('listMembers')).list; } catch (e) { fail(e); ST.members = []; } if (ST.view === 'settings') render(); }
async function loadHistory() {
  try { const [b, a] = await Promise.all([api('bankLog'), api('auditLog')]); ST.bankLog = b.list; ST.audit = a.list; } catch (e) { fail(e); ST.bankLog = []; ST.audit = []; }
  if (ST.view === 'settings') render();
}
async function loadCounts() { try { ST.wiz.counts = (await api('trialCounts')).counts; } catch (e) { fail(e); ST.wiz.counts = {}; } if (ST.view === 'settings') render(); }
async function reloadMe() { const r = await api('me'); ST.me = r.me; ST.settings = r.settings; ST.trialMode = r.trialMode; ST.custodianName = r.custodianName; if (ST.me.role === 'none') { showNoPerm(); return false; } return true; }

// ===== files =====
function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.type === 'application/pdf') {
      if (file.size > 1.5 * 1024 * 1024) return reject(new Error('PDF ใหญ่เกิน 1.5 MB'));
      const fr = new FileReader(); fr.onload = () => resolve({ name: file.name, type: file.type, data: fr.result }); fr.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้')); fr.readAsDataURL(file); return;
    }
    if (!/^image\//.test(file.type)) return reject(new Error('แนบได้เฉพาะรูปหรือ PDF'));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { // ย่อรูปให้ด้านยาวไม่เกิน 1600px และบีบเป็น JPEG
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.82) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(/heic|heif/i.test(file.type + file.name) ? 'ไฟล์ HEIC ของ iPhone เปิดไม่ได้ · ถ่ายภาพหน้าจอรูปนั้นแล้วแนบใหม่' : 'เปิดรูปไม่ได้ · ลองแนบเป็น JPG/PNG')); }; img.src = url;
  });
}
// ===== เปิดอยู่ใน Google Sites (iframe) · window.print() และการดาวน์โหลดถูกบล็อก → พิมพ์ผ่านหน้าต่างใหม่ =====
const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
function printNow() {
  if (!IN_FRAME) { window.print(); return; }
  const pages = $('#printv .pages'); if (!pages) return;
  const w = window.open('', '_blank');
  if (!w) { framePrintHelp(); return; }
  const base = location.href.split('#')[0].replace(/[^/]*$/, '');
  // ฝัง CSS ของแอปและรูปลงในหน้าต่างพิมพ์เลย (ไม่ต้องโหลดซ้ำ) · ฟอนต์ Google ใช้ลิงก์เดิม
  let css = '';
  [...document.styleSheets].forEach((sh) => { try { if (sh.href && /fonts\.googleapis/.test(sh.href)) css += `<link rel="stylesheet" href="${sh.href}">`; else css += `<style>${[...sh.cssRules].map((r) => r.cssText).join('\n')}</style>`; } catch (e) { if (sh.href) css += `<link rel="stylesheet" href="${sh.href}">`; } });
  const imgs = {}; pages.querySelectorAll('img').forEach((im) => { const k = im.getAttribute('src'); if (imgs[k] || !im.naturalWidth) return; try { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0); imgs[k] = cv.toDataURL('image/png'); } catch (e) { /* ใช้ลิงก์เดิม */ } });
  let html = pages.innerHTML; Object.entries(imgs).forEach(([k, v]) => { html = html.split(`src="${k}"`).join(`src="${v}"`); });
  const title = ($('#printv .pbar b') || {}).textContent || 'C2-Pay';
  w.document.open();
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>${esc(title)} · พิมพ์</title><script>(function(){var t0=Date.now(),done=false;function go(){if(done)return;if(document.readyState==='complete'||Date.now()-t0>4000){done=true;setTimeout(function(){window.print();},250);}else setTimeout(go,200);}setTimeout(go,300);})();<\/script>${css}
    <style>body{background:#E8EDEA;display:block}#printv{position:static!important;display:block!important;background:transparent}#printv .pbar{position:sticky;top:0;z-index:5}@media print{#printv .pbar{display:none!important}}</style></head>
    <body><div id="printv" class="printv on"><div class="pbar"><b>${esc(title)}</b><small>หน้าต่างพิมพ์ · ถ้าหน้าต่างพิมพ์ไม่ขึ้น กดปุ่มนี้</small><span style="margin-left:auto;display:flex;gap:8px"><button class="btn pri sm" onclick="window.print()">พิมพ์ / บันทึก PDF</button><button class="btn sm" onclick="window.close()">ปิด</button></span></div><div class="pages">${html}</div></div></body></html>`);
  w.document.close();
}
function framePrintHelp() {
  toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ · กด "เปิดในแท็บใหม่" แล้วพิมพ์จากแท็บนั้น', 'error');
  const bar = $('#printv .pbar'); if (bar && !bar.querySelector('[data-act="openTab"]')) bar.insertAdjacentHTML('beforeend', `<button class="btn sm" data-act="openTab">${ms('open_in_new')}เปิดในแท็บใหม่</button>`);
}
function saveBlob(name, blob) {
  if (IN_FRAME) { // Google Sites บล็อกการดาวน์โหลดใน iframe → ดาวน์โหลดผ่านหน้าต่างใหม่
    const w = window.open('', '_blank');
    if (w) { let url; try { url = w.URL.createObjectURL(blob); } catch (e) { url = URL.createObjectURL(blob); } w.document.open(); w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(name)}</title></head><body style="font-family:Tahoma,sans-serif;padding:32px;color:#201E1D"><p>กำลังดาวน์โหลด <b>${esc(name)}</b> …</p><p><a id="dl" href="${url}" download="${esc(name)}" style="color:#3F654D">ถ้าไฟล์ไม่เริ่มดาวน์โหลด กดที่นี่</a></p><p style="color:#5F6C65;font-size:13px">ดาวน์โหลดเสร็จแล้วปิดแท็บนี้ได้เลย</p><script>setTimeout(function(){document.getElementById('dl').click();},200);<\/script></body></html>`); w.document.close(); return; }
    toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ · กด "เปิดในแท็บใหม่" ที่มุมขวาบน แล้วส่งออกอีกครั้ง', 'error');
  } const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดตัวสร้าง Excel ไม่ได้')); document.head.appendChild(s); }); }

let backupCache = null;
async function doDownload(kind) {
  if (!backupCache || Date.now() - backupCache.t > 20 * 60 * 1000) backupCache = { t: Date.now(), data: await api('trialBackup') };
  const day = new Date().toISOString().slice(0, 10); const bk = backupCache.data;
  if (kind === 'json') saveBlob(`C2-Pay-backup-${day}.json`, new Blob([JSON.stringify(bk, null, 2)], { type: 'application/json' }));
  else {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    Object.entries(bk.data).forEach(([k, rows]) => {
      const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, b && typeof b === 'object' ? JSON.stringify(b) : b])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat.length ? flat : [{ ว่าง: '' }]), k.replace('pay_', '').slice(0, 31));
    });
    XLSX.writeFile(wb, `C2-Pay-backup-${day}.xlsx`);
  }
  ST.wiz.dl[kind] = true;
}

// ===== events =====
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, v = b.dataset.v;
  try {
    if (a === 'logout') return logout();
    if (a === 'setupInit') {
      const err = $('#su-err');
      return busy(b, async () => { try { await api('setupInit', { password: $('#su-p').value }); await boot(); } catch (x) { err.textContent = errMsg(x); } });
    }
    if (a === 'go') {
      const item = nav().find((n) => n[0] === v);
      if (item && item[3] === 'soon') { toast('ส่วนนี้จะเปิดในรอบถัดไป', 'schedule'); return; }
      if (v === 'req' && !(ST.form && ST.view === 'req')) ST.form = null;
      if (v !== 'clr') ST.clr = null; if (v !== 'adv') ST.ac = null; if (v !== 'pc') ST.pcForm = '';
      ST.view = v; ST.bankEdit = null; closeDrawer(); render(); $('#view').scrollTop = 0; return;
    }
    if (a === 'goSet') { ST.view = 'settings'; ST.setTab = v; render(); return; }
    if (a === 'mini') { $('#app').classList.toggle('mini'); return; }
    if (a === 'refresh') return busy(b, async () => { if (await reloadMe()) { ST.members = null; ST.bankLog = null; ST.wiz.counts = null; ST.draft = null; ST.trv = null; ST.payq = null; ST.pc = null; ST.ledger = null; ST.apv = null; render(); toast('โหลดข้อมูลใหม่แล้ว'); } });
    if (await trvClick(a, v, b)) return;
    if (a === 'ackNotice') return busy(b, async () => { await api('ackNotice'); ST.me.bankNotice = null; render(); });
    if (a === 'setTab') { ST.setTab = v; ST.bankEdit = null; if (v === 'trial') { ST.wiz = { step: 1, scope: 'A', counts: null, dl: { json: false, xlsx: false } }; backupCache = null; } if (v === 'history') ST.bankLog = null; render(); return; }
    // settings
    if (a === 'catAdd') { const x = $('#cat-new').value.trim(); if (x && !ST.draft.cats.includes(x)) ST.draft.cats.push(x); render(); return; }
    if (a === 'catDel') { ST.draft.cats.splice(+v, 1); render(); return; }
    if (a === 'custAdd') { ST.draft.customers.push({ name: '', lat: null, lng: null }); render(); const ins = document.querySelectorAll('[data-cust][data-k="name"]'); ins[ins.length - 1]?.focus(); return; }
    if (a === 'custDel') { ST.draft.customers.splice(+v, 1); render(); return; }
    if (a === 'resetDraft') { ST.draft = null; render(); return; }
    if (a === 'saveSettings') return busy(b, async () => {
      const D = ST.draft;
      await api('saveSettings', { settings: D.settings, cats: D.cats, customers: D.customers.filter((c) => c.name.trim()), home: D.home, defaults: D.defaults, ...(D.orsKey ? { orsKey: D.orsKey.trim() } : {}), ...(D.gmapsKey ? { gmapsKey: D.gmapsKey.trim() } : {}) });
      await reloadMe(); ST.draft = null; ST.gmu = null; render(); toast('บันทึกค่าทั่วไปแล้ว');
    });
    if (a === 'bankEdit') { ST.bankEdit = v; render(); $('#bk-no, #bk-co')?.focus(); return; }
    if (a === 'bankCancel') { ST.bankEdit = null; render(); return; }
    if (a === 'bankSave') {
      const ok = v === 'company' ? need([['#bk-bank', 'ธนาคาร'], ['#bk-co', 'บัญชีบริษัท', vAcc], ['#bk-adv', 'บัญชีเงินสำรองจ่าย', vAcc], ['#bk-why', 'เหตุผล'], ['#bk-pw', 'รหัสผ่าน']])
        : need([['#bk-bank', 'ธนาคาร'], ['#bk-no', 'เลขที่บัญชี', vAcc], ['#bk-name', 'ชื่อบัญชี'], ['#bk-file', 'ไฟล์สมุดบัญชี', vFileOk], ['#bk-why', 'เหตุผล'], ['#bk-pw', 'รหัสผ่าน']]);
      if (!ok) return;
    }
    if (a === 'bankSave') return busy(b, async () => {
      const common = { target: v, reason: $('#bk-why').value, password: $('#bk-pw').value };
      if (v === 'company') await api('setBank', { ...common, bankName: $('#bk-bank').value, accCo: $('#bk-co').value, accAdv: $('#bk-adv').value });
      else {
        const file = await readFile($('#bk-file').files[0]);
        await api('setBank', { ...common, bank: $('#bk-bank').value, no: $('#bk-no').value, name: $('#bk-name').value, file });
      }
      ST.bankEdit = null; ST.members = null; ST.bankLog = null; await reloadMe(); render(); toast('บันทึกเลขบัญชีแล้ว');
    });
    if (a === 'fileView') return busy(b, async () => {
      const r = await api('fileGet', { path: v }); const w = window.open('', '_blank');
      if (w) { w.document.title = 'สำเนาหน้าสมุดบัญชี'; w.document.body.style.margin = '0'; w.document.body.innerHTML = r.dataUrl.startsWith('data:application/pdf') ? `<iframe src="${r.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>` : `<img src="${r.dataUrl}" style="max-width:100%">`; }
      else toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ อนุญาต pop-up แล้วลองอีกครั้ง', 'error');
    });
    if (a === 'handover') return busy(b, async () => {
      if (!need([['#ho-to', 'คนที่จะส่งต่อ'], ['#ho-pw', 'รหัสผ่าน']])) return; const to = $('#ho-to').value;
      await api('handover', { toId: to, password: $('#ho-pw').value }); await reloadMe(); ST.members = null; ST.setTab = 'users'; render(); toast('ส่งต่อสิทธิ์ผู้ดูแลเลขบัญชีแล้ว');
    });
    // trial
    if (a === 'wizStep') { ST.wiz.step = +v; render(); return; }
    if (a === 'dl') return busy(b, async () => { await doDownload(v); render(); toast('ดาวน์โหลดแล้ว', 'download_done'); });
    if (a === 'trialClear' && !need([['#cf-t', 'ข้อความยืนยัน', (x) => x === CLEAR_PHRASE ? '' : `พิมพ์ "${CLEAR_PHRASE}" ให้ตรง`], ['#cf-p', 'รหัสผ่าน']])) return;
    if (a === 'trialClear') return busy(b, async () => {
      const r = await api('trialClear', { scope: ST.wiz.scope, phrase: $('#cf-t').value, password: $('#cf-p').value });
      const n = Object.values(r.deleted || {}).reduce((t, x) => t + x, 0);
      ST.wiz = { step: 1, scope: 'A', counts: null, dl: { json: false, xlsx: false } }; backupCache = null; ST.members = null; ST.bankLog = null; ST.draft = null;
      await reloadMe(); render(); toast(`ล้างข้อมูลแล้ว ${n} รายการ`, 'delete_forever');
    });
    if (a === 'trialEnd' && !need([['#te-pw', 'รหัสผ่าน']])) return;
    if (a === 'trialEnd') return busy(b, async () => {
      await api('trialEnd', { password: $('#te-pw').value }); await reloadMe(); ST.setTab = 'general'; render(); toast('ปิดโหมดทดลองแล้ว · เริ่มใช้งานจริง', 'rocket_launch');
    });
  } catch (x) { fail(x); }
});

// ===== ค้นหาสถานที่ (ลูกค้าในระบบ + Google Maps) =====
const gmLink = (pts) => { if (!pts || pts.length < 2) return ''; const p = (x) => `${x.lat},${x.lng}`; const mid = pts.slice(1, -1).map(p).join('|'); return `https://www.google.com/maps/dir/?api=1&origin=${p(pts[0])}&destination=${p(pts[pts.length - 1])}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ''}&travelmode=driving`; };
const areaOf = (addr) => { let x = String(addr || '').replace(/[,\s]*(ประเทศไทย|Thailand)\s*$/i, '').trim(); if (x.includes(',')) { const p = x.split(',').map((y) => y.trim()).filter(Boolean); x = (p[p.length - 1] || '').replace(/\s*\d{5}\s*$/, '').trim(); } else { const m = x.match(/([^\s]+)\s*\d{5}\s*$/); if (m) x = m[1]; } return x.replace(/^(จังหวัด|จ\.)\s*/, '').trim(); };
const TA = { key: null, q: '', local: [], g: [], hi: 0, session: '', loading: false, off: '', t: null, seq: 0, picking: false };
const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
function taInput(el, key) {
  if (TA.key !== key) { TA.key = key; TA.session = newSession(); }
  TA.q = el.value.trim(); TA.hi = 0; clearTimeout(TA.t);
  const ql = TA.q.toLowerCase();
  TA.local = key === 'cust' || !ql ? [] : (ST.settings.customers || []).filter((c) => c.name.toLowerCase().includes(ql)).slice(0, 5);
  TA.g = []; TA.off = '';
  if (key !== 'cust' && (ST.settings.customers || []).some((c) => c.name === TA.q)) { taClose(); return; } // ตรงกับลูกค้าในระบบแล้ว ไม่ต้องค้นต่อ
  TA.loading = !!(ST.settings.hasGmaps && TA.q.length >= 2);
  taDraw();
  if (!TA.loading) return;
  const my = ++TA.seq;
  TA.t = setTimeout(async () => {
    try { const r = await api('placeSearch', { q: TA.q, session: TA.session }); if (my !== TA.seq) return; TA.g = r.list || []; TA.off = r.off || ''; }
    catch (e) { if (my === TA.seq) TA.off = 'error'; }
    if (my === TA.seq) { TA.loading = false; taDraw(); }
  }, 300);
}
const taBox = () => TA.key === null ? null : document.getElementById(`ta-${TA.key}`);
const taItems = () => [...TA.local.map((c) => ({ t: 'local', c })), ...TA.g.map((g) => ({ t: 'g', g }))];
function taDraw() {
  const box = taBox(); if (!box) return;
  const items = taItems(); const inp = TA.key === 'cust' ? $('#cust-q') : document.getElementById(`f-stop-${TA.key}`);
  if (!TA.q || (!items.length && !TA.loading && !TA.off && TA.key !== 'cust' && !ST.settings.hasGmaps)) { box.hidden = true; inp && inp.setAttribute('aria-expanded', 'false'); return; }
  let k = -1; const row = (ic, a, b, tag, cls) => { k++; return `<div class="ta-i ${k === TA.hi ? 'on' : ''}" role="option" data-ta="${k}">${ms(ic, 'style="color:var(--brand)"')}<span class="ta-t"><b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}</span>${tag ? `<span class="pill ${cls}">${tag}</span>` : ''}</div>`; };
  let h = '';
  if (TA.local.length) h += `<small class="ta-h">ลูกค้าในระบบ</small>` + TA.local.map((c) => row('storefront', c.name, c.lat != null ? 'มีพิกัดแล้ว' : 'ยังไม่มีพิกัด · กรอกระยะทางเอง', 'ลูกค้า', 'p-closed')).join('');
  if (ST.settings.hasGmaps) {
    h += `<small class="ta-h">จาก Google Maps</small>`;
    if (TA.loading) h += `<div class="ta-i"><span class="spin"></span><span>กำลังค้นหา…</span></div>`;
    else if (TA.g.length) h += TA.g.map((g) => row('location_on', g.main, g.sub, 'Google', 'p-open')).join('');
    else h += `<div class="ta-i" style="color:var(--sub)">${TA.off === 'cap' ? 'ใช้ Google ครบโควตาเดือนนี้แล้ว · กรอกระยะทางเอง' : TA.off === 'user' ? 'ค้นหาครบจำนวนต่อวันแล้ว' : TA.off === 'badkey' ? 'คีย์ Google Maps ใช้ไม่ได้ · แจ้ง Admin' : TA.off === 'error' ? 'ค้นหาไม่ได้ตอนนี้' : TA.q.length < 2 ? 'พิมพ์อย่างน้อย 2 ตัวอักษร' : 'ไม่พบสถานที่'}</div>`;
    h += `<div class="ta-pw">powered by Google</div>`;
  } else if (!TA.local.length) h += `<div class="ta-i" style="color:var(--sub)">${TA.key === 'cust' ? 'ยังไม่ได้ตั้งคีย์ Google Maps' : 'ไม่อยู่ในรายชื่อลูกค้า · กรอกระยะทางเอง'}</div>`;
  box.innerHTML = h; box.hidden = false; inp && inp.setAttribute('aria-expanded', 'true');
}
function taClose() { const box = taBox(); if (box) box.hidden = true; TA.key = null; TA.q = ''; TA.seq++; }
async function taPick(k) {
  const it = taItems()[k]; if (!it) return; const key = TA.key, session = TA.session;
  TA.picking = true;
  try {
    if (it.t === 'local') { const f = ST.form; f.stops[+key] = it.c.name; f.geo[+key] = null; taClose(); render(); refreshRoute(); return; }
    const box = taBox(); if (box) box.innerHTML = `<div class="ta-i"><span class="spin"></span><span>กำลังดึงพิกัด…</span></div>`;
    const p = await api('placePick', { placeId: it.g.placeId, session });
    const area = areaOf(p.address); const name = area && !p.name.includes(area) ? `${p.name} · ${area}` : p.name;
    taClose();
    if (key === 'cust') {
      if (ST.draft.customers.some((c) => c.name === name)) { toast('มีลูกค้าชื่อนี้แล้ว', 'info'); return; }
      ST.draft.customers.push({ name, lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }); render(); toast(`เพิ่ม ${name} แล้ว · กดบันทึกค่าทั่วไป`); return;
    }
    const f = ST.form; f.stops[+key] = name; f.geo[+key] = { lat: p.lat, lng: p.lng }; render(); refreshRoute();
  } catch (e) { fail(e); } finally { TA.picking = false; }
}
document.addEventListener('mousedown', (e) => { const it = e.target.closest('.ta-i[data-ta]'); if (it) { e.preventDefault(); taPick(+it.dataset.ta); } });
document.addEventListener('focusout', (e) => { if (e.target.matches('[data-stop], #cust-q')) setTimeout(() => { if (!TA.picking && document.activeElement !== e.target) taClose(); }, 120); });
document.addEventListener('keydown', (e) => {
  if (TA.key === null || !e.target.matches('[data-stop], #cust-q')) return; const n = taItems().length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); TA.hi = (TA.hi + 1) % n; taDraw(); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); TA.hi = (TA.hi - 1 + n) % n; taDraw(); }
  else if (e.key === 'Enter' && n && !taBox().hidden) { e.preventDefault(); taPick(TA.hi); }
  else if (e.key === 'Escape' || e.key === 'Tab') taClose();
});

// ===== events: รอบ 2 =====
async function reloadTrv() { ST.trv = await api('trvList'); ST.payq = null; ST.pc = null; ST.ledger = null; ST.apv = null; }
const fileOf = async (inp) => inp && inp.files && inp.files[0] ? readFile(inp.files[0]) : null;
async function trvClick(a, v, b) {
  if (a === 'more') { ST.view = 'more'; closeDrawer(); render(); return true; }
  if (a === 'newReq') { ST.form = newForm(); ST.view = 'req'; closeDrawer(); render(); refreshRoute(); return true; }
  if (a === 'openDoc') { drawDoc(v); return true; }
  if (a === 'closeDrawer') { closeDrawer(); return true; }
  if (a === 'openClr') { const d = doc(v); ST.clrNo = v; ST.clr = null; ST.view = 'clr'; closeDrawer(); render(); $('#view').scrollTop = 0; void d; return true; }
  if (a === 'cancelForm') { ST.form = null; ST.view = 'home'; render(); return true; }
  // รอบ 3: สร้างใบใหม่ / เคลียร์เงินทดรอง / สมุด / เงินสดย่อย
  if (a === 'nfType') { if (v === 'TRV') return trvClick('newReq', v, b); if (v === 'PC') { ST.view = 'pc'; ST.pcForm = 'topup'; render(); $('#pc-amt')?.focus(); return true; } ST.nfType = v; render(); return true; }
  if (a === 'nfItemAdd') { ST.nf.items.push({ desc: '', amount: '' }); render(); document.getElementById(`ni-d-${ST.nf.items.length - 1}`)?.focus(); return true; }
  if (a === 'nfItemDel') { ST.nf.items.splice(+v, 1); render(); return true; }
  if (a === 'nfReset') { ST.nf = null; render(); return true; }
  if (a === 'nfSave') { await nfSave(b); return true; }
  if (a === 'rmbPay') {
    const no = ST.openNo, src = (document.querySelector('input[name="rsrc"]:checked') || {}).value;
    if (!src) { toast('กรอกข้อมูลไม่ครบ: เลือกวิธีจ่ายคืน (เงินสดย่อย / โอน)', 'error'); return true; }
    await busy(b, async () => { await api('rmbPay', { no, src }); await reloadTrv(); ST.pc = null; ST.ledger = null; ST.payq = null; render(); drawDoc(no); toast(src === 'PC' ? `จ่ายคืน ${no} แล้ว · ลงสมุดแล้ว` : `${no} เข้ารายการรอโอนแล้ว`); });
    return true;
  }
  // รอบ 4: ต่อทริป · ใบสำคัญ · รายงาน
  if (a === 'openExt') { const d = doc(v); ST.form = extForm(d); ST.view = 'req'; closeDrawer(); render(); $('#view').scrollTop = 0; refreshRoute(); return true; }
  if (a === 'extOk') { const no = ST.openNo, src = (document.querySelector('input[name="xsrc"]:checked') || {}).value; if (doc(no).extReq.amount > 0 && !src) { toast('กรอกข้อมูลไม่ครบ: เลือกวิธีจ่ายเงินส่วนเพิ่ม', 'error'); return true; }
    await busy(b, async () => { await api('trvExtDecide', { no, decision: 'approve', src }); await reloadTrv(); render(); drawDoc(no); toast(src === 'BANK' ? 'อนุมัติต่อทริปแล้ว · เข้ารายการขออนุมัติโอน' : 'อนุมัติต่อทริปแล้ว'); }); return true; }
  if (a === 'extNoAsk') { $('#noteBox').innerHTML = `<div class="field"><label for="dn">เหตุผลที่ไม่อนุมัติต่อทริป</label><input class="inp" id="dn"></div><button class="btn danger block" style="margin-top:6px" data-act="extNoGo">${ms('block')}ยืนยันไม่อนุมัติ</button>`; $('#dn').focus(); return true; }
  if (a === 'extNoGo') { const no = ST.openNo; if (!need([['#dn', 'เหตุผล']])) return true; await busy(b, async () => { await api('trvExtDecide', { no, decision: 'reject', note: $('#dn').value }); await reloadTrv(); render(); drawDoc(no); toast('ไม่อนุมัติต่อทริปแล้ว'); }); return true; }
  if (a === 'extCancel') { const no = ST.openNo; await busy(b, async () => { await api('trvExtCancel', { no }); await reloadTrv(); render(); drawDoc(no); toast('ยกเลิกการต่อทริปแล้ว · กลับเป็นแผนเดิม'); }); return true; }
  if (a === 'voucher') { await busy(b, () => voucherPrint(v)); return true; }
  if (a === 'rfP') { ST.rf.p = v; render(); return true; }
  if (a === 'rptXlsx') { await busy(b, rptXlsx); return true; }
  // รอบ 4: ใบเสนอ CEO
  if (a === 'openBatch') { drawBatch(v); return true; }
  if (a === 'apvPrint') { await busy(b, () => apvPrint(v)); return true; }
  if (a === 'doPrint') { printNow(); return true; }
  if (a === 'openTab') { window.open(location.href.split('#')[0], '_blank', 'noopener'); return true; }
  if (a === 'closePrint') { $('#printv')?.classList.remove('on'); return true; }
  if (a === 'apvCreate') {
    const ids = ST.apv.wait.filter((x) => !ST.unsel.has(x.id)).map((x) => x.id);
    const pend = ST.apv.wait.filter((x) => ids.includes(x.id) && x.bankPending && !ST.bconf.has(x.id));
    if (pend.length) { pend.forEach((x, i) => { const el = document.querySelector(`[data-bconf="${CSS.escape(x.id)}"]`); if (el) { el.closest('label').classList.add('bad'); if (!i) el.focus(); } }); toast(`กรอกข้อมูลไม่ครบ: ติ๊กยืนยันบัญชีที่เพิ่งเปลี่ยนของ ${[...new Set(pend.map((x) => x.payee))].join(', ')} (${pend.length} รายการ)`, 'error'); return true; }
    await busy(b, async () => { const r = await api('apvCreate', { ids, bankConfirmed: [...ST.bconf] }); ST.unsel = new Set(); ST.bconf = new Set(); await reloadTrv(); await loadApv(); drawBatch(r.no); toast(`สร้าง ${r.no} แล้ว · พิมพ์เสนอ CEO`, 'approval'); });
    return true;
  }
  if (a === 'apvCeo') {
    const no = ST.openBatch, keep = [...document.querySelectorAll('[data-keep]')].filter((x) => x.checked).map((x) => x.dataset.keep);
    const notes = {}; document.querySelectorAll('[data-keep]').forEach((x) => { if (!x.checked) notes[x.dataset.keep] = ($(`#kn-${CSS.escape(x.dataset.keep)}`) || {}).value || ''; });
    if (!keep.length) { toast('กรอกข้อมูลไม่ครบ: ต้องมีรายการที่ CEO อนุมัติอย่างน้อย 1 รายการ (ถ้าไม่อนุมัติทั้งใบ ให้ยกเลิกใบเสนอ)', 'error'); return true; }
    if (!need([['#b-scan', 'สแกนใบที่ CEO เซ็น', vSlip]])) return true;
    await busy(b, async () => { const scan = await fileOf($('#b-scan')); const r = await api('apvCeo', { no, keep, notes, scan }); await reloadTrv(); await loadApv(); drawBatch(no); toast(`CEO อนุมัติ ${r.kept} รายการ${r.dropped ? ` · ${r.dropped} รายการกลับไปรอ` : ''}`, 'verified'); });
    return true;
  }
  if (a === 'apvSent') { const no = ST.openBatch; await busy(b, async () => { await api('apvSent', { no, ref: $('#b-ref').value }); await loadApv(); drawBatch(no); toast('ส่งเรื่องเข้าระบบแล้ว · รอ COO'); }); return true; }
  if (a === 'apvPaid') {
    const no = ST.openBatch; if (!need([['#b-date', 'วันที่โอน'], ['#b-slip', 'สลิปการโอน', vSlip]])) return true;
    await busy(b, async () => { const slip = await fileOf($('#b-slip')); await api('apvPaid', { no, slip, date: $('#b-date').value }); await reloadTrv(); await loadApv(); drawBatch(no); toast(`${no} โอนสำเร็จ · ใบเบิกเดินต่อแล้ว`, 'task_alt'); });
    return true;
  }
  if (a === 'apvCancelAsk') { $('#noteBox').innerHTML = `<div class="field"><label for="dn">เหตุผลที่ยกเลิกใบเสนอ</label><input class="inp" id="dn"></div><button class="btn danger block" style="margin-top:6px" data-act="apvCancelGo">${ms('block')}ยืนยันยกเลิกใบเสนอ</button>`; $('#dn').focus(); return true; }
  if (a === 'apvCancelGo') { const no = ST.openBatch; if (!need([['#dn', 'เหตุผล']])) return true; await busy(b, async () => { await api('apvCancel', { no, note: $('#dn').value }); await reloadTrv(); await loadApv(); closeDrawer(); toast(`ยกเลิก ${no} แล้ว · รายการกลับไปรอ`); }); return true; }
  if (a === 'pcrRequest') { await busy(b, async () => { const r = await api('pcrRequest'); ST.pc = null; ST.pcForm = ''; ST.apv = null; render(); toast(`ส่งเบิกชดเชย ${fmt(r.amount)} บาท เข้ารายการรอใบเสนอ CEO แล้ว`, 'approval'); }); return true; }
  if (a === 'pcrCancel') { await busy(b, async () => { await api('pcrCancel'); ST.pc = null; ST.apv = null; render(); toast('ยกเลิกคำขอเบิกชดเชยแล้ว'); }); return true; }
  if (a === 'openAdv') { ST.advNo = v; ST.ac = null; ST.view = 'adv'; closeDrawer(); render(); $('#view').scrollTop = 0; return true; }
  if (a === 'acAdd') { ST.ac.receipts.push({ desc: '', cat: cats()[0], amount: '', file: null, noRcpt: false, why: '' }); render(); document.getElementById(`ac-d-${ST.ac.receipts.length - 1}`)?.focus(); return true; }
  if (a === 'acDel') { ST.ac.receipts.splice(+v, 1); render(); return true; }
  if (a === 'acSave') { await acSave(b); return true; }
  if (a === 'ledgerXlsx') { await busy(b, ledgerXlsx); return true; }
  if (a === 'pcForm') { ST.pcForm = v; render(); (v === 'count' ? $('#pc-count') : v === 'topup' ? $('#pc-amt') : null)?.focus(); return true; }
  if (a === 'pcCount') {
    const P = ST.pc, cnt = $('#pc-count').value.trim(), diff = cnt === '' ? 0 : Math.round((Number(cnt) - P.balance) * 100) / 100;
    if (!need([['#pc-count', 'เงินที่นับได้', vMoney0], ...(diff !== 0 ? [['#pc-cnote', 'เหตุผลที่ยอดไม่ตรง']] : [])])) return true;
    await busy(b, async () => { const r = await api('pcCount', { counted: cnt, note: $('#pc-cnote').value }); ST.pc = null; ST.pcForm = ''; await reloadTrv(); render(); toast(r.diff === 0 ? 'ตรวจนับแล้ว ยอดตรง' : `ปรับยอด ${r.diff > 0 ? '+' : ''}${fmt(r.diff)} บาทแล้ว`); });
    return true;
  }
  // ฟอร์มขอเบิก
  const f = ST.form;
  if (a === 'travDel' && f.lockTrav && f.lockTrav.includes(v)) return true;
  if (a === 'travDel') { f.travelerIds = f.travelerIds.filter((x) => x !== v); render(); return true; }
  if (a === 'optApply' && f.opt) { f.prevOrder = { stops: [...f.stops], geo: [...f.geo] }; f.stops = f.opt.order.map((i) => f.opt.stops[i]); f.geo = f.opt.order.map((i) => f.opt.geo[i] || null); f.optApplied = { save: f.opt.save, src: f.opt.src }; f.opt = null; f.legs = null; render(); refreshRoute(); toast(`จัดลำดับแล้ว ประหยัด ${fmt(f.optApplied.save)} กม.`, 'alt_route'); return true; }
  if (a === 'optUndo' && f.prevOrder) { f.stops = f.prevOrder.stops; f.geo = f.prevOrder.geo; f.prevOrder = null; f.optApplied = null; f.legs = null; render(); refreshRoute(); return true; }
  if (a === 'stopAdd') { f.optApplied = null; f.stops.push(''); f.geo.push(null); render(); document.getElementById(`f-stop-${f.stops.length - 1}`)?.focus(); return true; }
  if (a === 'stopDel') { f.optApplied = null; f.stops.splice(+v, 1); f.geo.splice(+v, 1); f.legs = null; render(); refreshRoute(); return true; }
  if (a === 'exAdd') { f.extras.push({ cat: ST.settings.cats[0] || 'อื่นๆ', desc: '', amount: '' }); render(); return true; }
  if (a === 'exDel') { f.extras.splice(+v, 1); render(); return true; }
  if (a === 'submitReq') {
    const k = calcForm(f);
    const chk = [['#f-title', 'ชื่องาน'], ['#f-go', 'วันไป'], ['#f-back', 'วันกลับ', (x) => !x ? 'ใส่วันกลับ' : x < f.go ? 'วันกลับต้องไม่ก่อนวันไป' : ''], ['#f-stop-0', 'สถานที่', () => f.stops.some((x) => x.trim()) ? '' : 'เพิ่มสถานที่อย่างน้อย 1 แห่ง']];
    if (!(k.km > 0)) chk.push([$('#f-km') || '#f-stop-0', 'ระยะทาง', () => 'ใส่ระยะทางไป-กลับ']);
    if (f.kmManual && f.kmCalc != null && f.kmSrc !== 'est' && Math.abs(k.km - f.kmCalc) >= 0.5) chk.push(['#f-kmr', 'เหตุผลที่แก้ระยะทาง']);
    if (f.hotelOver && k.nights) chk.push(['#f-hr', 'ราคาที่พักต่อคืน', vMoney], ['#f-hre', 'เหตุผลที่พักเกินอัตรา']);
    f.extras.forEach((x, i) => { if (x.desc.trim() || x.amount !== '') chk.push([`#f-exd-${i}`, `รายการค่าใช้จ่ายอื่น ${i + 1}`], [`#f-exa-${i}`, `ยอดค่าใช้จ่ายอื่น ${i + 1}`, vMoney]); });
    if (f.extNo) { chk.splice(0, 3, ['#f-back', 'วันกลับ', (x) => !x ? 'ใส่วันกลับ' : x < f.backMin ? 'วันกลับต้องไม่ก่อนวันกลับเดิม' : '']); const lk = new Set(Array.from({ length: f.lockEx }, (_, i) => [`#f-exd-${i}`, `#f-exa-${i}`]).flat()); for (let i = chk.length - 1; i >= 0; i--) if (lk.has(chk[i][0])) chk.splice(i, 1); }
    if (!need(chk)) return true;
    if (f.extNo) {
      if (k.total <= f.prevTotal && f.stops.filter((x) => x.trim()).length === f.lockN && f.back === f.backMin) { toast('กรอกข้อมูลไม่ครบ: เพิ่มสถานที่ ขยายวันกลับ เพิ่มคน หรือเพิ่มค่าใช้จ่าย', 'error'); return true; }
      await busy(b, async () => {
        const form = { stops: f.stops.map((x) => x.trim()).filter(Boolean), geo: f.stops.map((x, i) => (x.trim() ? f.geo[i] || null : undefined)).filter((g) => g !== undefined), back: f.back, travelerIds: f.travelerIds, km: k.km, kmReason: f.kmManual || f.kmCalc == null ? f.kmReason : f.baseManual ? `${f.baseReason || 'ระยะเดิมแก้เอง'} · ต่อทริป: ระยะเดิม ${fmt(f.baseKm)} + ส่วนเพิ่มตามระบบ ${fmt(k.km - f.baseKm)} กม.` : '', extras: f.extras.slice(f.lockEx), rooms: f.rooms, hotelOver: f.hotelOver, hotelRate: f.hotelRate, hotelReason: f.hotelReason, note: f.note };
        const no = f.extNo, r = await api('trvExtend', { no, form }); ST.form = null; await reloadTrv(); ST.view = isAdmin() ? 'clear' : 'home'; render(); drawDoc(no); toast(`ส่งคำขอต่อทริป ${no} แล้ว · ขอเพิ่ม ${fmt(r.amount)} บาท`);
      });
      return true;
    }
    await busy(b, async () => {
      const form = { editNo: f.editNo, staffId: f.staffId, travelerIds: f.travelerIds, title: f.title, go: f.go, back: f.back, stops: f.stops.map((x) => x.trim()).filter(Boolean), geo: f.stops.map((x, i) => (x.trim() ? f.geo[i] || null : undefined)).filter((g) => g !== undefined), km: k.km, kmReason: f.kmManual || f.kmCalc == null ? f.kmReason : '', rooms: f.rooms, hotelOver: f.hotelOver, hotelRate: f.hotelRate, hotelReason: f.hotelReason, extras: f.extras, price: f.price };
      const r = await api('trvSubmit', { form }); ST.form = null; await reloadTrv();
      ST.view = isAdmin() ? 'inbox' : 'home'; render(); toast(form.editNo ? `บันทึก ${r.no} แล้ว` : `ส่งคำขอ ${r.no} แล้ว · รอ admin อนุมัติ`); if (isAdmin()) drawDoc(r.no);
    });
    return true;
  }
  if (a === 'editReq') { const d = doc(ST.openNo); ST.form = newForm(d); ST.view = 'req'; closeDrawer(); render(); refreshRoute(); return true; }
  // อนุมัติ / ส่งกลับ / ไม่อนุมัติ / ยกเลิก
  if (a === 'decideAsk') {
    const lab = { return: 'เหตุผลที่ส่งกลับให้แก้', reject: 'เหตุผลที่ไม่อนุมัติ', cancel: 'เหตุผลที่ยกเลิก' }[v];
    $('#noteBox').innerHTML = `<div class="field"><label for="dn">${lab}</label><input class="inp" id="dn"></div><button class="btn ${v === 'return' ? '' : 'danger'} block" style="margin-top:6px" data-act="decide" data-v="${v}">${ms(v === 'return' ? 'undo' : 'block')}ยืนยัน${v === 'return' ? 'ส่งกลับ' : v === 'reject' ? 'ไม่อนุมัติ' : 'ยกเลิก'}</button>`;
    $('#dn').focus(); return true;
  }
  if (a === 'decide') {
    const no = ST.openNo;
    if ((v === 'return' || v === 'reject') && !need([['#dn', 'เหตุผล']])) return true;
    if (v === 'approve' && !document.querySelector('input[name="src"]:checked')) { toast('กรอกข้อมูลไม่ครบ: เลือกวิธีจ่ายเงิน (เงินสดย่อย / โอน)', 'error'); return true; }
    await busy(b, async () => {
      if (v === 'cancel') await api('trvCancel', { no, note: $('#dn').value });
      else if (v === 'approve') { const src = (document.querySelector('input[name="src"]:checked') || {}).value; if (!src) { toast('เลือกวิธีจ่ายเงิน', 'error'); return; } await api('trvDecide', { no, decision: 'approve', src }); }
      else await api('trvDecide', { no, decision: v, note: $('#dn').value });
      await reloadTrv(); render(); drawDoc(no);
      toast({ approve: 'อนุมัติแล้ว', return: 'ส่งกลับให้แก้แล้ว', reject: 'ไม่อนุมัติแล้ว', cancel: 'ยกเลิกแล้ว' }[v]);
    });
    return true;
  }
  // รอโอน
  if (a === 'markPaid') {
    const cf = $(`#pc-${CSS.escape(v)}`);
    if (!need([[`#pd-${CSS.escape(v)}`, 'วันที่โอน'], [`#ps-${CSS.escape(v)}`, 'สลิปการโอน', vSlip], ...(cf ? [[cf, 'ยืนยันว่าตรวจเลขบัญชีแล้ว', () => cf.checked ? '' : 'ติ๊กยืนยันก่อน']] : [])])) return true;
    await busy(b, async () => {
      const slip = await fileOf($(`#ps-${CSS.escape(v)}`)); if (!slip) { toast('แนบสลิปการโอน', 'error'); return; }
      await api('markPaid', { no: v, date: $(`#pd-${CSS.escape(v)}`).value, slip, bankConfirmed: cf ? cf.checked : false });
      await reloadTrv(); render(); toast(`บันทึกโอน ${v} แล้ว`);
    });
    return true;
  }
  if (a === 'refundOk') {
    const no = ST.openNo, how = (document.querySelector('input[name="rhow"]:checked') || {}).value || 'PC';
    if (how === 'BANK' && !need([['#r-slip', 'สลิปที่ทีมงานโอนคืน', vSlip]])) return true;
    await busy(b, async () => { const slip = how === 'BANK' ? await fileOf($('#r-slip')) : null; if (how === 'BANK' && !slip) { toast('แนบสลิป', 'error'); return; } await api('trvRefundReceived', { no, how, slip }); await reloadTrv(); render(); drawDoc(no); toast(`${no} ปิดใบแล้ว`); });
    return true;
  }
  if (a === 'delAsk') {
    const no = ST.openNo;
    await busy(b, async () => {
      const p = await api('trvDeletePreview', { no });
      $('#delBox').innerHTML = `<div style="margin-top:8px;padding:12px;border-radius:12px;background:var(--bad-bg)"><b style="color:var(--bad)">ลบ ${esc(no)} ถาวร</b><p style="margin:4px 0 8px;font-size:13px">จะลบใบนี้ พร้อมรายการเงินสดย่อย ${p.pc} รายการ${p.pc ? ` (${p.pcNet > 0 ? '+' : ''}${fmt(p.pcNet)})` : ''} สมุดค่าใช้จ่าย ${p.ex} รายการ และไฟล์แนบ ${p.files} ไฟล์ · ยอดเงินสดย่อยคำนวณใหม่อัตโนมัติ</p>
        <div class="field"><label for="del-no">พิมพ์เลขใบ <b>${esc(no)}</b> เพื่อยืนยัน</label><input class="inp" id="del-no" autocomplete="off"></div><button class="btn danger block" style="margin-top:8px" data-act="delGo" disabled>${ms('delete_forever')}ลบถาวร</button></div>`;
      $('#del-no').addEventListener('input', (e) => { $('[data-act="delGo"]').disabled = e.target.value.trim() !== no; }); $('#del-no').focus();
    });
    return true;
  }
  if (a === 'delGo') { const no = ST.openNo; await busy(b, async () => { await api('trvDelete', { no, phrase: $('#del-no').value }); closeDrawer(); await reloadTrv(); render(); toast(`ลบ ${no} แล้ว`, 'delete_forever'); }); return true; }
  if (a === 'pcTopup' && !need([['#pc-amt', 'จำนวนเงิน', vMoney]])) return true;
  if (a === 'pcTopup') { await busy(b, async () => { await api('pcTopup', { amount: $('#pc-amt').value, note: $('#pc-note').value }); ST.pc = null; ST.pcForm = ''; await reloadTrv(); render(); toast('บันทึกเติมเงินแล้ว'); }); return true; }
  // เคลียร์
  const k = ST.clr;
  if (a === 'stayAdd') { const d = doc(ST.clrNo); const last = k.stays[k.stays.length - 1]; const from = last ? addDays(last.to, 1) : d.go; k.stays.push({ from: from > d.back ? d.back : from, to: from > d.back ? d.back : from, rate: '' }); render(); return true; }
  if (a === 'stayDel') { k.stays.splice(+v, 1); render(); return true; }
  if (a === 'fileDel') { k.files.splice(+v, 1); render(); return true; }
  if (a === 'clrSubmit' || a === 'clrConfirm') {
    const d = doc(ST.clrNo), r = clrCalc(d, k); if (r.err) { toast(`กรอกข้อมูลไม่ครบ: ${r.err}`, 'error'); if (k.fuel === '' || k.fuel == null) need([['#c-fuel', 'ค่าน้ำมันจริง']]); return true; }
    await busy(b, async () => {
      const clr = { fuel: Number(k.fuel), people: Number(k.people), days: Number(k.days), stays: k.stays, ex: k.ex, files: k.files, note: k.note };
      if (a === 'clrSubmit') { await api('trvClearSubmit', { no: d.no, clr }); toast('ส่งเคลียร์แล้ว · รอ admin ตรวจ'); }
      else { const res = await api('trvClearConfirm', { no: d.no, clr, hotelEx: k.hotelEx, exOver: k.exOver, src: k.src }); toast(res.note || ({ closed: `${d.no} ปิดใบแล้ว`, refund: `${d.no} รอรับเงินคืน`, topup: `${d.no} รอโอนส่วนต่าง` }[res.status] || 'ยืนยันแล้ว')); }
      const no = d.no; ST.clr = null; await reloadTrv(); ST.view = isAdmin() ? 'clear' : 'home'; render(); drawDoc(no);
    });
    return true;
  }
  if (a === 'clrReturn') {
    if (!need([['#c-ret', 'เหตุผลที่ส่งกลับ']])) return true; const note = $('#c-ret').value.trim();
    await busy(b, async () => { await api('trvClearConfirm', { no: ST.clrNo, decision: 'return', note }); ST.clr = null; await reloadTrv(); ST.view = 'clear'; render(); toast('ส่งกลับให้แก้แล้ว'); });
    return true;
  }
  return false;
}
// อัปโหลดไฟล์ทันทีที่เลือก (ใบเสร็จตอนเคลียร์)
async function uploadTo(no, file) { const data = await readFile(file); const r = await api('upload', { no, file: data }); return r.file; }
document.addEventListener('change', async (e) => {
  const el = e.target;
  try {
    if (el.id === 'f-addtrav' && el.value) { ST.form.travelerIds.push(el.value); render(); return; }
    if (el.id === 'f-staff') { ST.form.staffId = el.value; ST.form.travelerIds = ST.form.travelerIds.filter((x) => x !== el.value); render(); return; }
    if (el.dataset.fchk) { ST.form[el.dataset.fchk] = el.checked; if (el.dataset.fchk === 'kmManual') ST.form.kmAuto = false; if (el.dataset.fchk === 'kmManual' && el.checked && !ST.form.km) ST.form.km = ST.form.kmCalc; render(); return; }
    if (el.dataset.stop !== undefined) { if (!TA.picking) refreshRoute(); return; }
    if (el.id === 'f-go' || el.id === 'f-back') { (updReq(['#hotelField']), updCalc()); return; }
    if (el.dataset.ex) { updCalc(); return; }
    if (el.id === 'cf') { ST.claimF = el.value; render(); return; }
    if (el.id === 'ct') { ST.claimT = el.value; render(); return; }
    if (el.dataset.sel !== undefined) { if (el.checked) ST.unsel.delete(el.dataset.sel); else ST.unsel.add(el.dataset.sel); render(); return; }
    if (el.id === 'selAll') { ST.unsel = el.checked ? new Set() : new Set(ST.apv.wait.map((x) => x.id)); render(); return; }
    if (el.dataset.bconf !== undefined) { if (el.checked) ST.bconf.add(el.dataset.bconf); else ST.bconf.delete(el.dataset.bconf); el.closest('label').classList.remove('bad'); return; }
    if (el.dataset.keep !== undefined) { const f = document.querySelector(`[data-noteof="${CSS.escape(el.dataset.keep)}"]`); if (f) { f.hidden = el.checked; if (!el.checked) f.querySelector('input').focus(); } return; }
    if (el.id === 'rf-m' || el.id === 'rf-y') { ST.rf[el.id.slice(3)] = el.value; render(); return; }
    if (el.id && el.id.startsWith('lf-')) { ST.lf[el.id.slice(3)] = el.value; render(); return; }
    if (el.name === 'n-src') { ST.nf.src = el.value; return; }
    if (el.dataset.nf && el.tagName === 'SELECT') { ST.nf[el.dataset.nf] = el.value; return; }
    if (el.name === 'asrc') { ST.ac.src = el.value; return; }
    if (el.dataset.acn !== undefined) { ST.ac.receipts[+el.dataset.acn].noRcpt = el.checked; render(); if (el.checked) document.getElementById(`ac-w-${el.dataset.acn}`)?.focus(); return; }
    if (el.dataset.acf !== undefined && el.files[0]) { const i = +el.dataset.acf; if (!need([[el, `รูปใบเสร็จ ใบที่ ${i + 1}`, vFileOk]])) return; toast('กำลังอัปโหลดใบเสร็จ…', 'upload'); ST.ac.receipts[i].file = await uploadTo(ST.advNo, el.files[0]); render(); toast('แนบใบเสร็จแล้ว'); return; }
    if (el.dataset.ac && el.tagName === 'SELECT') { const [i, key] = el.dataset.ac.split(':'); ST.ac.receipts[+i][key] = el.value; return; }
    if (el.name === 'tsrc') { ST.clr.src = el.value; return; }
    if (el.name === 'rhow') { $('#rslipBox').hidden = el.value !== 'BANK'; return; }
    if (el.dataset.cchk) { ST.clr[el.dataset.cchk] = el.checked; render(); return; }
    if (el.dataset.xcn !== undefined) { ST.clr.ex[+el.dataset.xcn].noRcpt = el.checked; render(); return; }
    if (el.dataset.xcf !== undefined && el.files[0]) { toast('กำลังอัปโหลดใบเสร็จ…', 'upload'); ST.clr.ex[+el.dataset.xcf].file = await uploadTo(ST.clrNo, el.files[0]); render(); toast('แนบใบเสร็จแล้ว'); return; }
    if (el.id === 'c-files' && el.files.length) { toast('กำลังอัปโหลด…', 'upload'); for (const fl of [...el.files].slice(0, 10)) ST.clr.files.push(await uploadTo(ST.clrNo, fl)); render(); toast(`แนบแล้ว ${ST.clr.files.length} ไฟล์`); return; }
    if (el.dataset.st || el.dataset.c || el.dataset.xc) { updCalc(); return; }
  } catch (x) { fail(x); render(); }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (ST.form && el.dataset.f) { const k = el.dataset.f; ST.form[k] = el.value; if (k === 'km') ST.form.kmAuto = false; if (['km', 'rooms', 'hotelRate'].includes(k)) updCalc(); return; }
  if (ST.form && el.dataset.stop !== undefined) { const i = +el.dataset.stop; ST.form.stops[i] = el.value; ST.form.geo[i] = null; ST.form.optApplied = null; el.parentElement.querySelector('.ta-ok')?.remove(); taInput(el, String(i)); return; }
  if (el.id === 'cust-q') { taInput(el, 'cust'); return; }
  if (ST.form && el.dataset.ex) { const [i, key] = el.dataset.ex.split(':'); ST.form.extras[+i][key] = el.value; if (key === 'amount') updCalc(); return; }
  if (el.dataset.nf && ST.nf) { ST.nf[el.dataset.nf] = el.value; if (el.dataset.nf === 'amount') { const t = $('#nfTot'); if (t) t.textContent = fmt(Number(el.value) || 0); } return; }
  if (el.dataset.nfi && ST.nf) { const [i, key] = el.dataset.nfi.split(':'); ST.nf.items[+i][key] = el.value; const t = $('#nfTot'); if (t) t.textContent = fmt(ST.nf.items.reduce((x, y) => x + (Number(y.amount) || 0), 0)); const c = $('#nfCnt'); if (c) c.textContent = `${ST.nf.items.filter((y) => y.desc.trim() && Number(y.amount) > 0).length} รายการ`; return; }
  if (el.dataset.ac && ST.ac) { const [i, key] = el.dataset.ac.split(':'); ST.ac.receipts[+i][key] = el.value; if (key === 'amount') { const c = $('#acCalc'); if (c) c.innerHTML = advCalcHtml(doc(ST.advNo), ST.ac); } return; }
  if (el.id === 'pc-count') { const r = $('#countRes'); if (r) { const d = el.value === '' ? null : Math.round((Number(el.value) - ST.pc.balance) * 100) / 100; r.innerHTML = d == null ? 'ใส่ยอดที่นับได้ ระบบบอกส่วนต่างให้' : d === 0 ? `<b style="color:var(--good)">ยอดตรง</b>` : `<b style="color:var(--bad)">${d > 0 ? 'เกิน' : 'ขาด'} ${fmt(Math.abs(d))} บาท</b> · ใส่เหตุผลแล้วบันทึกเพื่อปรับยอด`; } return; }
  if (el.id === 'cq') { ST.claimQ = el.value; const pos = el.selectionStart; render(); const n = $('#cq'); n.focus(); n.setSelectionRange(pos, pos); return; }
  const k = ST.clr; if (!k) return;
  if (el.dataset.c) { k[el.dataset.c] = el.value; if (el.dataset.c !== 'note') updCalc(); return; }
  if (el.dataset.st) { const [i, key] = el.dataset.st.split(':'); k.stays[+i][key] = el.value; if (key === 'rate') updCalc(); return; }
  if (el.dataset.xc) { const [i, key] = el.dataset.xc.split(':'); k.ex[+i][key] = el.value; if (key === 'amount') updCalc(); }
});
/** อัปเดตเฉพาะบางส่วนของหน้า (กล่องคำนวณ ระยะทาง ฯลฯ) โดยไม่วาดฟอร์มใหม่ — ช่องที่กำลังพิมพ์ไม่หลุดโฟกัส */
function updReq(sels) {
  const html = ST.view === 'req' ? vReq() : ST.view === 'clr' ? vClr() : null; if (!html) return;
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  const act = document.activeElement;
  sels.forEach((sel) => { const nws = tmp.querySelectorAll(sel), olds = $('#view').querySelectorAll(sel); olds.forEach((o, i) => { if (nws[i] && !(act && o.contains(act) && act.matches('input,select,textarea'))) o.replaceWith(nws[i]); }); });
}
function updCalc() {
  const html = ST.view === 'req' ? vReq() : ST.view === 'clr' ? vClr() : null; if (!html) return;
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  const nb = tmp.querySelector('#calcBody'), ob = $('#calcBody'); if (nb && ob && nb.innerHTML !== ob.innerHTML) ob.replaceWith(nb);
  ['clrSubmit', 'clrConfirm'].forEach((a) => { const n = tmp.querySelector(`[data-act="${a}"]`), o = $(`#view [data-act="${a}"]`); if (n && o) o.disabled = n.disabled; });
}
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tcard[data-act]')) { e.preventDefault(); e.target.click(); } if (e.key === 'Escape') closeDrawer(); });

let cdTimer = null;
function afterRender() {
  // ช่องยืนยันขั้น 3: ปุ่มลบกดได้หลังพิมพ์ข้อความ + รหัสผ่าน แล้วรอ 5 วินาที
  const t = $('#cf-t'), p = $('#cf-p'), go = $('#cf-go');
  if (t && p && go) {
    const check = () => {
      const ready = t.value.trim() === CLEAR_PHRASE && p.value.length > 0;
      clearInterval(cdTimer);
      if (!ready) { go.disabled = true; go.innerHTML = `${ms('timer')}พิมพ์ข้อความและรหัสผ่านก่อน`; return; }
      let n = 5; go.disabled = true; go.innerHTML = `${ms('timer')}ลบถาวร (รอ ${n} วินาที)`;
      cdTimer = setInterval(() => { n--; if (n > 0) { go.innerHTML = `${ms('timer')}ลบถาวร (รอ ${n} วินาที)`; } else { clearInterval(cdTimer); go.disabled = false; go.innerHTML = `${ms('delete_forever')}ลบถาวร`; } }, 1000);
    };
    t.addEventListener('input', check); p.addEventListener('input', check);
  }
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.scope) { ST.wiz.scope = el.dataset.scope; render(); return; }
  if (el.dataset.role) {
    const id = el.dataset.role, role = el.value, m = ST.members.find((x) => x.id === id);
    api('setRole', { accountId: id, role }).then(async () => { m.role = role; m.set = true; m.isNew = false; if (id === ST.me.id) { if (!(await reloadMe())) return; } toast(`ตั้งสิทธิ์ ${m.name} เป็น ${ROLE_SHORT[role]} แล้ว`); render(); })
      .catch((x) => { fail(x); render(); });
  }
});
document.addEventListener('input', (e) => {
  const el = e.target; if (!ST.draft) return;
  if (el.dataset.set) ST.draft.settings[el.dataset.set] = el.value === '' ? '' : Number(el.value);
  else if (el.dataset.cust !== undefined && el.dataset.k) { const c = ST.draft.customers[+el.dataset.cust]; c[el.dataset.k] = el.dataset.k === 'name' ? el.value : (el.value === '' ? null : Number(el.value)); }
  else if (el.dataset.home) ST.draft.home[el.dataset.home] = el.dataset.home === 'name' ? el.value : (el.value === '' ? null : Number(el.value));
  else if (el.dataset.def) ST.draft.defaults[el.dataset.def] = el.value;
  else if (el.dataset.ors) ST.draft.orsKey = el.value;
  else if (el.dataset.gm) ST.draft.gmapsKey = el.value;
});
document.addEventListener('change', (e) => { const el = e.target; if (el.dataset.def && ST.draft) ST.draft.defaults[el.dataset.def] = el.value; });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'cat-new') { e.preventDefault(); $('[data-act="catAdd"]').click(); } });

boot();
})();
