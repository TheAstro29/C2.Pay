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
function showAuth(html) { authEl().hidden = false; authEl().innerHTML = `<div class="card">${html}</div>`; $('#stage').hidden = true; }

function showLogin(msg = '') {
  showAuth(`<img class="logo" src="img/logo.png" alt="C2TECH">
    <div><div style="font-size:13px;color:var(--sub)">ระบบเบิกจ่าย</div><h2>เข้าสู่ระบบ C2-Pay</h2></div>
    <div class="pwbox soft">${ms('link')}<span>ใช้ <b>ชื่อผู้ใช้และรหัสผ่านเดียวกับ C2-Calendar</b></span></div>
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
  showAuth(`<img class="logo" src="img/logo.png" alt="C2TECH">
    <div style="width:52px;height:52px;border-radius:50%;background:var(--warn-bg);color:var(--warn);display:grid;place-items:center">${ms('lock_person')}</div>
    <h2 style="font-size:20px">ยังไม่ได้รับสิทธิ์ใช้ C2-Pay</h2>
    <p style="margin:0;color:var(--sub)">บัญชี <b>${esc(ST.me.name)}</b> เข้าสู่ระบบได้แล้ว แต่ยังไม่มีสิทธิ์ในระบบเบิกจ่าย ติดต่อ Admin ของ C2-Pay เพื่อขอสิทธิ์</p>
    <button class="btn block" data-act="logout">${ms('logout')}ออกจากระบบ</button>`);
}

function showSetup() {
  if (!ST.canSetup) {
    showAuth(`<img class="logo" src="img/logo.png" alt="C2TECH"><h2 style="font-size:20px">C2-Pay ยังไม่พร้อมใช้งาน</h2>
      <p style="margin:0;color:var(--sub)">รอ admin ของ C2-Calendar ตั้งค่าเริ่มต้น C2-Pay ก่อน แล้วค่อยเข้าใหม่</p>
      <button class="btn block" data-act="logout">${ms('logout')}ออกจากระบบ</button>`);
    return;
  }
  showAuth(`<img class="logo" src="img/logo.png" alt="C2TECH"><h2 style="font-size:20px">ตั้งค่าเริ่มต้น C2-Pay</h2>
    <p style="margin:0;color:var(--sub)">ยังไม่มีใครตั้งค่า C2-Pay · ถ้ากดยืนยัน <b>${esc(ST.me.name)}</b> จะเป็น <b>Admin</b> และ <b>ผู้ดูแลเลขบัญชี</b> คนแรก (ส่งต่อสิทธิ์ให้คนอื่นได้ภายหลัง)</p>
    <ul style="margin:0;padding-left:20px;color:var(--sub);font-size:13.5px"><li>เริ่มใน <b>โหมดทดลองใช้</b> (ล้างข้อมูลได้)</li><li>อัตราเริ่มต้น: เบี้ยเลี้ยง 200 · ที่พัก 600 · 10 กม./ลิตร</li><li>บัญชีบริษัท: กสิกรไทย 201-1-96656-2 · สำรองจ่าย 014-9-36362-4</li></ul>
    <div class="field"><label for="su-p">ยืนยันรหัสผ่านของคุณ</label><input class="inp" id="su-p" type="password" autocomplete="current-password"></div>
    <div class="err" id="su-err" role="alert"></div>
    <button class="btn pri block" data-act="setupInit" style="height:44px">${ms('rocket_launch')}ตั้งค่าเริ่มต้นและเข้าใช้งาน</button>
    <button class="btn ghost block" data-act="logout">ออกจากระบบ</button>`);
}

async function boot() {
  if (!getToken()) { showLogin(); return; }
  authEl().hidden = false; authEl().innerHTML = `<div class="loading"><div class="spin"></div><span>กำลังโหลด…</span></div>`;
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
  ['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก', 'soon'], ['inbox', 'inbox', 'คำขอจากทีมงาน', 'soon'], ['clear', 'fact_check', 'เคลียร์เงิน', 'soon'],
  ['approve', 'approval', 'ขออนุมัติ', 'soon'], ['ledger', 'menu_book', 'สมุดค่าใช้จ่าย', 'soon'], ['pc', 'savings', 'เงินสดย่อย', 'soon'], ['report', 'monitoring', 'รายงาน', 'soon'],
  ['settings', 'settings', 'ตั้งค่า'], ['profile', 'person', 'โปรไฟล์'],
];
const NAV_CEO = [['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก', 'soon'], ['report', 'monitoring', 'รายงาน', 'soon'], ['profile', 'person', 'โปรไฟล์']];
const NAV_USER = [['home', 'dashboard', 'หน้าแรก'], ['mytrips', 'luggage', 'ทริปของฉัน', 'soon'], ['req', 'add_road', 'ขอเบิกค่าเดินทาง', 'soon'], ['profile', 'person', 'โปรไฟล์']];
const nav = () => isAdmin() ? NAV_ADMIN : isCeo() ? NAV_CEO : NAV_USER;
const TITLES = { home: 'ภาพรวม', settings: 'ตั้งค่า', profile: 'โปรไฟล์' };

function renderNav() {
  $('#sidenav').innerHTML = nav().map(([k, i, l, soon]) => `<button class="nitem ${ST.view === k ? 'on' : ''} ${soon ? 'soon' : ''}" data-act="go" data-v="${k}" title="${l}${soon ? ' (เร็วๆ นี้)' : ''}">${ms(i)}<span class="lbl">${l}</span>${k === 'settings' && ST.trialMode && isCust() ? '<span class="badge">ทดลอง</span>' : ''}</button>`).join('');
  const b = isAdmin() ? [['home', 'dashboard', 'ภาพรวม'], ['settings', 'settings', 'ตั้งค่า'], ['profile', 'person', 'โปรไฟล์']] : [['home', 'dashboard', 'หน้าแรก'], ['profile', 'person', 'โปรไฟล์']];
  $('#bnav').innerHTML = b.map(([k, i, l]) => `<button class="${ST.view === k ? 'on' : ''}" data-act="go" data-v="${k}">${ms(i)}<span>${l}</span></button>`).join('');
  $('#bnav').style.gridTemplateColumns = `repeat(${b.length}, 1fr)`;
  $('#sidefoot').innerHTML = `<div style="display:flex;align-items:center;gap:8px">${ms('account_circle')}<span>${esc(ST.me.username || ST.me.name)} · ${ROLE_SHORT[ST.me.role]}</span></div><div style="margin-top:4px">${VERSION}</div>`;
}

function render() {
  if (!ST.me) return;
  renderNav();
  $('#ttl').textContent = TITLES[ST.view] || '';
  $('#acts').innerHTML = `<button class="btn sm ghost" data-act="refresh" title="โหลดข้อมูลใหม่">${ms('refresh')}<span class="pc-only">โหลดใหม่</span></button>`;
  const v = ST.view === 'settings' ? vSettings() : ST.view === 'profile' ? vProfile() : vHome();
  $('#view').innerHTML = v;
  afterRender();
}

function trialBanner() {
  if (!ST.trialMode) return '';
  return `<div class="pwbox warn">${ms('science')}<span><b>ช่วงทดลองใช้</b> · ข้อมูลในช่วงนี้อาจถูกล้างก่อนเริ่มใช้งานจริง</span></div>`;
}

// ===== views =====
function vHome() {
  const me = ST.me;
  const notice = me.bankNotice ? `<div class="pwbox bad">${ms('account_balance')}<span>บัญชีรับโอนของคุณถูกเปลี่ยนเป็น <b>${esc(me.bankNotice.to)}</b> เมื่อ ${dtTime(me.bankNotice.at)} โดย ${esc(me.bankNotice.byName)} · ถ้าคุณไม่ได้แจ้งเปลี่ยน ติดต่อ Admin ทันที</span><button class="btn sm" data-act="ackNotice" style="margin-left:auto">รับทราบ</button></div>` : '';
  const bankLine = me.bank ? `${esc(me.bank.bank)} ${esc(me.bank.no)}` : '<span style="color:var(--bad)">ยังไม่มี · แจ้งผู้ดูแลเลขบัญชีเพื่อเพิ่ม</span>';
  const next = isAdmin()
    ? ['ใบเบิกค่าเดินทาง: ขอเบิก → อนุมัติ → จ่าย/โอน → เคลียร์', 'เงินทดรอง · เบิกคืน · ค่าใช้จ่ายบริษัท · เงินสดย่อย', 'ใบเสนอ CEO (พิมพ์) · ใบสำคัญ RV/PV/CL · รายงาน']
    : isCeo() ? ['ดูใบเบิกและรายงานค่าใช้จ่ายทั้งหมด', 'ใบเสนอ CEO ยังเป็นกระดาษเหมือนเดิม'] : ['ขอเบิกค่าเดินทางและติดตามทริปของคุณ', 'ส่งเคลียร์พร้อมแนบใบเสร็จ (ภายใน 3 วันหลังกลับ)'];
  const setupTodo = isAdmin() ? `<div class="card"><h3>${ms('checklist')}เตรียมระบบ</h3><div class="lines">
      <div><span>ตั้งสิทธิ์ผู้ใช้ C2-Pay</span><button class="btn sm" data-act="goSet" data-v="users">${ms('group')}ผู้ใช้</button></div>
      <div><span>ตรวจอัตราค่าเดินทาง หมวด และรายชื่อลูกค้า</span><button class="btn sm" data-act="goSet" data-v="general">${ms('tune')}ค่าทั่วไป</button></div>
      <div><span>เพิ่มเลขบัญชีรับโอนของทีมงาน${isCust() ? '' : ' (ผู้ดูแลเลขบัญชี)'}</span>${isCust() ? `<button class="btn sm" data-act="goSet" data-v="users">${ms('account_balance')}เลขบัญชี</button>` : `<b>${esc(ST.custodianName)}</b>`}</div></div></div>` : '';
  return `${trialBanner()}${notice}
    <div class="grid g2" style="margin-top:12px"><div class="stack">
      <div class="card"><h3>${ms('waving_hand')}สวัสดี ${esc(me.name)}</h3><div class="lines">
        <div><span>สิทธิ์ใน C2-Pay</span><b>${ROLE_LABEL[me.role]}</b></div>
        ${me.isCustodian ? `<div><span>หน้าที่พิเศษ</span><b>${ms('key')} ผู้ดูแลเลขบัญชี</b></div>` : ''}
        <div><span>บัญชีรับโอน</span><span>${bankLine}</span></div></div></div>
      ${setupTodo}</div>
      <div class="card"><h3>${ms('upcoming')}กำลังจะเปิดใช้</h3><div class="lines">${next.map((t) => `<div><span>${esc(t)}</span><span class="pill" style="background:var(--soft);color:var(--sub)">เร็วๆ นี้</span></div>`).join('')}</div>
        <p class="formula" style="margin:10px 0 0">รอบนี้เปิดเฉพาะการเข้าระบบ สิทธิ์ ตั้งค่า และเลขบัญชี</p></div></div>`;
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
        <p class="formula" style="margin:0 0 8px">พิกัด (lat, lng) ใช้คำนวณระยะทาง · คัดลอกจาก Google Maps (คลิกขวาที่จุด → ตัวเลขแรก) · เว้นว่างได้ แล้วกรอกระยะทางเองในใบเบิก</p>
        <div class="custrow"><input class="inp ll" aria-label="จุดเริ่มต้น" data-home="name" value="${esc(D.home.name)}"><span style="display:flex;gap:6px"><input class="inp num" style="width:96px" aria-label="ละติจูดจุดเริ่มต้น" placeholder="lat" data-home="lat" value="${D.home.lat ?? ''}"><input class="inp num" style="width:96px" aria-label="ลองจิจูดจุดเริ่มต้น" placeholder="lng" data-home="lng" value="${D.home.lng ?? ''}"></span><span class="pill p-closed">จุดเริ่มต้น</span></div>
        ${cust}
        <button class="btn sm" style="margin-top:10px" data-act="custAdd">${ms('add')}เพิ่มลูกค้า</button></div>
    </div><div class="stack">
      ${company}
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
  const T = { setup: 'ตั้งค่าเริ่มต้น C2-Pay', role: 'เปลี่ยนสิทธิ์', handover: 'ส่งต่อสิทธิ์ผู้ดูแลเลขบัญชี', trialClear: 'ล้างข้อมูลช่วงทดลอง', trialEnd: 'ปิดโหมดทดลอง · เริ่มใช้งานจริง' };
  const ad = (x) => x.type === 'role' ? `${esc(x.detail.name)} → ${ROLE_SHORT[x.detail.role] || ''}` : x.type === 'handover' ? `ให้ ${esc(x.detail.toName)}` : x.type === 'trialClear' ? `แบบ ${esc(x.detail.scope)}` : '';
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปไม่ได้')); }; img.src = url;
  });
}
function saveBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
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
      ST.view = v; ST.bankEdit = null; render(); $('#view').scrollTop = 0; return;
    }
    if (a === 'goSet') { ST.view = 'settings'; ST.setTab = v; render(); return; }
    if (a === 'mini') { $('#app').classList.toggle('mini'); return; }
    if (a === 'refresh') return busy(b, async () => { if (await reloadMe()) { ST.members = null; ST.bankLog = null; ST.wiz.counts = null; ST.draft = null; render(); toast('โหลดข้อมูลใหม่แล้ว'); } });
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
      await api('saveSettings', { settings: D.settings, cats: D.cats, customers: D.customers.filter((c) => c.name.trim()), home: D.home, defaults: D.defaults });
      await reloadMe(); ST.draft = null; render(); toast('บันทึกค่าทั่วไปแล้ว');
    });
    if (a === 'bankEdit') { ST.bankEdit = v; render(); $('#bk-no, #bk-co')?.focus(); return; }
    if (a === 'bankCancel') { ST.bankEdit = null; render(); return; }
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
      const to = $('#ho-to').value; if (!to) { toast('เลือกคนที่จะส่งต่อ', 'error'); return; }
      await api('handover', { toId: to, password: $('#ho-pw').value }); await reloadMe(); ST.members = null; ST.setTab = 'users'; render(); toast('ส่งต่อสิทธิ์ผู้ดูแลเลขบัญชีแล้ว');
    });
    // trial
    if (a === 'wizStep') { ST.wiz.step = +v; render(); return; }
    if (a === 'dl') return busy(b, async () => { await doDownload(v); render(); toast('ดาวน์โหลดแล้ว', 'download_done'); });
    if (a === 'trialClear') return busy(b, async () => {
      const r = await api('trialClear', { scope: ST.wiz.scope, phrase: $('#cf-t').value, password: $('#cf-p').value });
      const n = Object.values(r.deleted || {}).reduce((t, x) => t + x, 0);
      ST.wiz = { step: 1, scope: 'A', counts: null, dl: { json: false, xlsx: false } }; backupCache = null; ST.members = null; ST.bankLog = null; ST.draft = null;
      await reloadMe(); render(); toast(`ล้างข้อมูลแล้ว ${n} รายการ`, 'delete_forever');
    });
    if (a === 'trialEnd') return busy(b, async () => {
      await api('trialEnd', { password: $('#te-pw').value }); await reloadMe(); ST.setTab = 'general'; render(); toast('ปิดโหมดทดลองแล้ว · เริ่มใช้งานจริง', 'rocket_launch');
    });
  } catch (x) { fail(x); }
});

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
});
document.addEventListener('change', (e) => { const el = e.target; if (el.dataset.def && ST.draft) ST.draft.defaults[el.dataset.def] = el.value; });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'cat-new') { e.preventDefault(); $('[data-act="catAdd"]').click(); } });

boot();
})();
