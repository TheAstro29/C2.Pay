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
  ['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก'], ['inbox', 'inbox', 'คำขอจากทีมงาน'], ['clear', 'fact_check', 'เคลียร์เงิน'],
  ['payq', 'account_balance', 'รอโอน'], ['pc', 'savings', 'เงินสดย่อย'], ['ledger', 'menu_book', 'สมุดค่าใช้จ่าย', 'soon'], ['report', 'monitoring', 'รายงาน', 'soon'],
  ['settings', 'settings', 'ตั้งค่า'], ['profile', 'person', 'โปรไฟล์'],
];
const NAV_CEO = [['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก'], ['payq', 'account_balance', 'รอโอน'], ['pc', 'savings', 'เงินสดย่อย'], ['report', 'monitoring', 'รายงาน', 'soon'], ['profile', 'person', 'โปรไฟล์']];
const NAV_USER = [['home', 'luggage', 'ทริปของฉัน'], ['req', 'add_road', 'ขอเบิกค่าเดินทาง'], ['profile', 'person', 'โปรไฟล์']];
const nav = () => isAdmin() ? NAV_ADMIN : isCeo() ? NAV_CEO : NAV_USER;
const TITLES = { home: 'ภาพรวม', settings: 'ตั้งค่า', profile: 'โปรไฟล์', claims: 'ใบเบิก', inbox: 'คำขอจากทีมงาน', clear: 'เคลียร์เงิน', payq: 'รายการรอโอน', pc: 'เงินสดย่อย', req: 'ขอเบิกค่าเดินทาง', clr: 'เคลียร์เงินทริป' };

function renderNav() {
  const L = (ST.trv && ST.trv.list) || [];
  const bd = { inbox: L.filter((d) => d.status === 'submitted' || d.status === 'clearSub').length, clear: L.filter((d) => d.status === 'open').length, payq: L.filter((d) => d.status === 'approve' || (d.status === 'topup' && d.settleSrc === 'BANK')).length };
  const late = L.some((d) => ['late', 'warn'].includes((clearState(d) || {}).lv));
  const badge = (k) => isAdmin() && bd[k] ? `<span class="badge ${k === 'inbox' || (k === 'clear' && late) ? 'red' : ''}">${bd[k]}</span>` : k === 'settings' && ST.trialMode && isCust() ? '<span class="badge">ทดลอง</span>' : '';
  $('#sidenav').innerHTML = nav().map(([k, i, l, soon]) => `<button class="nitem ${ST.view === k ? 'on' : ''} ${soon ? 'soon' : ''}" data-act="go" data-v="${k}" title="${l}${soon ? ' (เร็วๆ นี้)' : ''}">${ms(i)}<span class="lbl">${l}</span>${badge(k)}</button>`).join('');
  const b = isAdmin() ? [['home', 'dashboard', 'ภาพรวม'], ['inbox', 'inbox', 'คำขอ'], ['req', 'add', 'ขอเบิก'], ['clear', 'fact_check', 'เคลียร์'], ['more', 'more_horiz', 'เพิ่มเติม']]
    : isCeo() ? [['home', 'dashboard', 'ภาพรวม'], ['claims', 'receipt_long', 'ใบเบิก'], ['pc', 'savings', 'เงินสดย่อย'], ['profile', 'person', 'โปรไฟล์']]
    : [['home', 'luggage', 'ทริปของฉัน'], ['req', 'add', 'ขอเบิก'], ['profile', 'person', 'โปรไฟล์']];
  $('#bnav').innerHTML = b.map(([k, i, l]) => `<button class="${k === 'req' ? 'plus' : ''} ${ST.view === k ? 'on' : ''}" data-act="${k === 'more' ? 'more' : 'go'}" data-v="${k}">${ms(i)}<span>${l}</span>${badge(k)}</button>`).join('');
  $('#bnav').style.gridTemplateColumns = `repeat(${b.length}, 1fr)`;
  $('#sidefoot').innerHTML = `<div style="display:flex;align-items:center;gap:8px">${ms('account_circle')}<span>${esc(ST.me.username || ST.me.name)} · ${ROLE_SHORT[ST.me.role]}</span></div><div style="margin-top:4px">${VERSION}</div>`;
}

function render() {
  if (!ST.me) return;
  renderNav();
  $('#ttl').textContent = TITLES[ST.view] || '';
  $('#acts').innerHTML = `<button class="btn sm ghost" data-act="refresh" title="โหลดข้อมูลใหม่">${ms('refresh')}<span class="pc-only">โหลดใหม่</span></button>`;
  if (!isAdmin() && !isCeo()) $('#ttl').textContent = ST.view === 'home' ? 'ทริปของฉัน' : $('#ttl').textContent;
  const V = { settings: vSettings, profile: vProfile, claims: vClaims, inbox: vInbox, clear: vClearList, payq: vPayq, pc: vPc, req: vReq, clr: vClr, more: vMore };
  const v = (V[ST.view] || (isAdmin() || isCeo() ? vDash : vMyTrips))();
  if (ST.view === 'req') $('#ttl').textContent = ST.form && ST.form.editNo ? `แก้ไข ${ST.form.editNo}` : 'ขอเบิกค่าเดินทาง';
  $('#view').innerHTML = v;
  afterRender();
}

function trialBanner() {
  if (!ST.trialMode) return '';
  return `<div class="pwbox warn">${ms('science')}<span><b>ช่วงทดลองใช้</b> · ข้อมูลในช่วงนี้อาจถูกล้างก่อนเริ่มใช้งานจริง</span></div>`;
}

// ===== views =====
function vMore() {
  const items = nav().filter(([k]) => !['home', 'inbox', 'clear'].includes(k));
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
        ${S.hasGmaps ? (ST.gmu ? `<div class="lines" style="margin-top:8px"><div><span>ค้นหาสถานที่ เดือนนี้</span><b class="num">${fmtN(ST.gmu.ac)} / ${fmtN(ST.gmu.cap)}</b></div><div><span>ดึงพิกัด เดือนนี้</span><b class="num">${fmtN(ST.gmu.details)} / ${fmtN(ST.gmu.cap)}</b></div><div><span>คำนวณเส้นทาง เดือนนี้</span><b class="num">${fmtN(ST.gmu.routes)} / ${fmtN(ST.gmu.cap)}</b></div></div>` : (loadGmu(), '<div class="loading" style="padding:10px"><div class="spin"></div></div>')) : ''}
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
    <b style="font-weight:600">${esc(d.title)}</b><span class="route-s">${isAdmin() || isCeo() ? esc(d.staffName) + ' · ' : ''}${dRange(d.go, d.back)} · ${d.stops.map(place).join(' → ')}</span>
    <div class="row">${avs(d.travelers)}<small class="num">${d.no}</small>${hint ? `<span class="sp todo-hint" style="color:var(--warn);font-size:12.5px">${esc(hint)}</span>` : ''}</div></div>`;
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
      ${kpi('payq', 'account_balance', 'รอโอน', fmt(payAmt), `${payq.length} รายการ`, '')}
      ${kpi('clear', 'fact_check', 'ค้างเคลียร์', open.length, late.length ? `ใกล้/เกินกำหนด ${late.length} ใบ` : 'ไม่มีใบเกินกำหนด', late.length ? 'bad' : '')}
      ${kpi('pc', 'savings', 'เงินสดย่อยคงเหลือ', fmt(ST.trv.pcBalance), lowPc ? `ต่ำกว่า ${fmt(s.lowAlert)} · ควรเติม` : 'ปกติ', lowPc ? 'bad' : '')}</div>
    <div class="grid g2" style="margin-top:14px"><div><h3 style="font-size:14px;color:var(--sub);margin:0 0 8px">ใบเบิกล่าสุด</h3>${listOr(L.slice(0, 6), 'ยังไม่มีใบเบิก · กด "ขอเบิกค่าเดินทาง" เพื่อเริ่ม')}</div>
      <div class="stack">${isAdmin() ? `<button class="btn pri block" data-act="newReq" style="height:44px">${ms('add')}ขอเบิกค่าเดินทาง</button>` : ''}
      <div class="card"><h3>${ms('upcoming')}เปิดใช้รอบถัดไป</h3><div class="lines"><div><span>เงินทดรอง · เบิกคืน · ค่าใช้จ่ายบริษัท · สมุดเงินสดย่อยเต็ม</span><span class="pill p-mute">รอบ 3</span></div><div><span>ใบเสนอ CEO (พิมพ์) · ใบสำคัญ · รายงาน · ต่อทริป</span><span class="pill p-mute">รอบ 4</span></div></div></div></div></div>`;
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
  const tabs = [['all', 'ทั้งหมด'], ['submitted', 'รออนุมัติ'], ['approve', 'รอโอน'], ['open', 'รอเคลียร์'], ['clearSub', 'รอตรวจเคลียร์'], ['refund', 'รอคืนเงิน'], ['topup', 'รอจ่ายส่วนต่าง'], ['closed', 'ปิดแล้ว'], ['rejected', 'ไม่อนุมัติ/ยกเลิก']];
  const q = (ST.claimQ || '').toLowerCase();
  const L = ST.trv.list.filter((d) => (F === 'all' || d.status === F) && (!q || [d.no, d.title, d.staffName, ...d.stops].join(' ').toLowerCase().includes(q)));
  return `<div class="toolbar"><input class="inp" id="cq" placeholder="ค้นหาเลขที่ งาน ชื่อ สถานที่" value="${esc(ST.claimQ || '')}" style="min-width:220px;flex:1"><select class="sel" id="cf" aria-label="สถานะ">${tabs.map(([k, l]) => `<option value="${k}" ${F === k ? 'selected' : ''}>${l} (${k === 'all' ? ST.trv.list.length : ST.trv.list.filter((d) => d.status === k).length})</option>`).join('')}</select>${isAdmin() ? `<button class="btn pri" data-act="newReq">${ms('add')}ขอเบิกค่าเดินทาง</button>` : ''}</div>${listOr(L, 'ไม่พบใบเบิก')}`;
}
function vInbox() {
  const w = needTrv(); if (w) return w;
  const sub = ST.trv.list.filter((d) => d.status === 'submitted'), clr = ST.trv.list.filter((d) => d.status === 'clearSub'), ret = ST.trv.list.filter((d) => d.status === 'returned');
  return `<div class="grid g2e" style="align-items:start"><div><div class="tgrp"><h3>${ms('add_road', 'style="font-size:18px"')}ขอเบิกค่าเดินทาง · ${sub.length}</h3>${sub.length ? sub.map((d) => docCard(d)).join('') : '<div class="card empty">ไม่มีคำขอรออนุมัติ</div>'}</div>
    <div class="tgrp"><h3>${ms('fact_check', 'style="font-size:18px"')}ส่งเคลียร์ รอตรวจ · ${clr.length}</h3>${clr.length ? clr.map((d) => docCard(d, 'openClr')).join('') : '<div class="card empty">ไม่มีใบส่งเคลียร์</div>'}</div></div>
    <div>${ret.length ? `<div class="tgrp"><h3>${ms('edit_note', 'style="font-size:18px"')}ส่งกลับให้แก้ · รอส่งใหม่ · ${ret.length}</h3>${ret.map((d) => docCard(d)).join('')}</div>` : ''}</div></div>`;
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
  const km = f.kmManual || f.kmCalc == null ? Number(f.km) || 0 : f.kmCalc, rate = f.hotelOver && nights ? Number(f.hotelRate) || 0 : s.hotel, rooms = Math.max(1, Number(f.rooms) || 1);
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
  }, 450);
}
function vReq() {
  if (!ST.trv) return needTrv();
  const f = ST.form || (ST.form = newForm()); const s = set(), k = calcForm(f), people = ST.trv.people || [];
  const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || (id === ST.me.id ? ST.me.name : id);
  const cur = f.editNo && doc(f.editNo);
  const staffSel = isAdmin() ? `<div class="field full"><label for="f-staff">ผู้รับเงิน (รับเงินและรับผิดชอบเคลียร์)</label><select class="sel" id="f-staff" data-f="staffId" ${f.editNo ? 'disabled' : ''}>${people.filter((p) => p.role === 'user' || p.role === 'admin').map((p) => `<option value="${p.id}" ${p.id === f.staffId ? 'selected' : ''}>${esc(p.name)}${p.hasBank ? '' : ' (ยังไม่มีบัญชีรับโอน)'}</option>`).join('')}</select></div>` : '';
  const others = people.filter((p) => p.id !== f.staffId);
  const trav = `<div class="field full"><label>ผู้เดินทาง <span class="num">${k.people}</span> คน <span style="font-weight:400">· เบี้ยเลี้ยงคิดตามจำนวนคน</span></label>
    <div class="chips"><span class="chip" style="border-color:var(--brand)">${ms('person', 'style="font-size:16px"')}${esc(nameOf(f.staffId))} · ผู้รับเงิน</span>${f.travelerIds.filter((x) => x !== f.staffId).map((id) => `<span class="chip">${esc(nameOf(id))}<button class="btn sm ghost" style="height:20px;padding:0 2px" data-act="travDel" data-v="${id}" aria-label="เอา ${esc(nameOf(id))} ออก">${ms('close', 'style="font-size:16px"')}</button></span>`).join('')}</div>
    ${others.filter((p) => !f.travelerIds.includes(p.id)).length ? `<select class="sel" id="f-addtrav" style="margin-top:6px;max-width:280px"><option value="">+ เพิ่มผู้เดินทาง</option>${others.filter((p) => !f.travelerIds.includes(p.id)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>` : ''}</div>`;
  const custs = ST.settings.customers || [];
  const stops = `<div class="field full"><label>สถานที่ (ตามลำดับที่ไป)</label><div class="route">
      <div class="stop ro"><span class="pin home">${ms('home', 'style="font-size:15px"')}</span><span>${esc(ST.settings.home.name)}</span><span></span></div>
      ${f.stops.map((x, i) => `<div class="stop"><span class="pin">${i + 1}</span><input class="inp" id="f-stop-${i}" data-stop="${i}" value="${esc(x)}" placeholder="พิมพ์ชื่อลูกค้า / สถานที่ แล้วเลือกจากรายการ" aria-label="สถานที่ที่ ${i + 1}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="ta-${i}" aria-expanded="false">${f.geo[i] ? `<span class="ta-ok" title="ได้พิกัดจาก Google Maps">${ms('location_on', 'style="font-size:16px"')}</span>` : ''}<div class="ta" id="ta-${i}" role="listbox" hidden></div>
        <span class="leg" id="leg-${i}">${f.legs && f.legs[i] != null && f.kmCalc != null ? fmt(f.legs[i]) + ' กม.' : ''}</span>${f.stops.length > 1 ? `<button class="xbtn" data-act="stopDel" data-v="${i}" aria-label="ลบสถานที่ที่ ${i + 1}">${ms('close', 'style="font-size:18px"')}</button>` : '<span></span>'}</div>`).join('')}
      <div class="stop ro"><span class="pin home">${ms('home', 'style="font-size:15px"')}</span><span>กลับ ${esc(ST.settings.home.name)}</span><span class="leg" id="leg-back">${f.legs && f.kmCalc != null ? fmt(f.legs[f.legs.length - 1]) + ' กม.' : ''}</span></div></div>
    <datalist id="custList">${custs.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <button class="btn sm" style="align-self:flex-start;margin-top:6px" data-act="stopAdd">${ms('add_location_alt')}เพิ่มสถานที่</button></div>`;
  const kmBox = `<div class="field full" id="kmField"><label>ระยะทางไป-กลับ</label><div class="kmbox">${ms('route')}
      <span id="kmStatus" style="display:contents">${f.kmLoading ? '<span class="spin"></span><span>กำลังคำนวณระยะทาง…</span>' : f.kmCalc != null ? (f.kmSrc === 'est' ? `<span>ประมาณ <b class="num">${fmt(f.kmCalc)}</b> กม. <span style="color:var(--warn)">(เส้นตรง × 1.3 · บริการแผนที่ใช้ไม่ได้ตอนนี้ ตรวจแล้วแก้ได้ ไม่ต้องใส่เหตุผล)</span></span>` : `<span>ระบบคำนวณ <b class="num">${fmt(f.kmCalc)}</b> กม. (${f.kmSrc === 'google' ? 'Google Maps' : f.kmSrc === 'osrm' ? 'OSRM · OpenStreetMap' : 'OpenRouteService'})</span>${f.pts ? `<a class="btn sm ghost" href="${gmLink(f.pts)}" target="_blank" rel="noopener">${ms('map')}ดูเส้นทาง</a>` : ''}`) : `<span style="color:var(--sub)">${esc(f.kmWhy || 'ใส่สถานที่เพื่อคำนวณ')}</span>`}</span>
      ${f.kmCalc != null ? `<label class="ckl" style="margin-left:auto"><input type="checkbox" id="f-kmman" data-fchk="kmManual" ${f.kmManual ? 'checked' : ''}> แก้ระยะเอง</label>` : ''}</div>
      ${f.kmManual || f.kmCalc == null ? `<div class="fgrid" style="margin-top:8px"><div class="field"><label for="f-km">ระยะทางไป-กลับ (กม.)</label><input class="inp num" type="number" inputmode="decimal" id="f-km" data-f="km" value="${esc(f.km)}"></div>
        <div class="field"><label for="f-kmr">เหตุผล${f.kmCalc != null && f.kmSrc !== 'est' ? ' <span style="color:var(--bad)">*</span>' : ' (ถ้ามี)'}</label><input class="inp" id="f-kmr" data-f="kmReason" value="${esc(f.kmReason)}" placeholder="${f.kmCalc != null ? 'เช่น ถนนปิด ต้องอ้อม' : 'เช่น วัดจากไมล์รถ'}"></div></div>` : ''}</div>`;
  const hotel = k.nights ? `<div class="field full" id="hotelField"><label class="ckl"><input type="checkbox" id="f-hov" data-fchk="hotelOver" ${f.hotelOver ? 'checked' : ''}> ขอที่พักเกินอัตรา (${fmt(s.hotel)} บาท/ห้อง/คืน)</label>
      ${f.hotelOver ? `<div class="hotelover"><div class="fgrid"><div class="field"><label for="f-hr">ราคาที่ขอ (บาท/ห้อง/คืน)</label><input class="inp num" type="number" id="f-hr" data-f="hotelRate" value="${esc(f.hotelRate)}">${Number(f.hotelRate) > s.hotelWarn ? `<span class="hint" style="color:var(--bad)">เกินยอดเตือน ${fmt(s.hotelWarn)}</span>` : ''}</div><div class="field"><label for="f-hre">เหตุผล</label><input class="inp" id="f-hre" data-f="hotelReason" value="${esc(f.hotelReason)}" placeholder="เช่น ใกล้หน้างาน ห้องอัตราปกติเต็ม"></div></div></div>` : ''}</div>` : '';
  const extras = `<div class="field full"><label>ค่าใช้จ่ายอื่น (ถ้ามี) · ตอนเคลียร์ต้องแนบใบเสร็จทุกรายการ</label><div class="items">${f.extras.map((e, i) => `<div class="irow"><input class="inp" id="f-exd-${i}" data-ex="${i}:desc" value="${esc(e.desc)}" placeholder="รายการ เช่น ค่าทางด่วน"><select class="sel" id="f-exc-${i}" data-ex="${i}:cat">${ST.settings.cats.map((c) => `<option ${c === e.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><input class="inp num" type="number" id="f-exa-${i}" data-ex="${i}:amount" value="${esc(e.amount)}" placeholder="บาท"><button class="xbtn" data-act="exDel" data-v="${i}" aria-label="ลบรายการ">${ms('close', 'style="font-size:18px"')}</button></div>`).join('')}
      <button class="btn sm" style="align-self:flex-start" data-act="exAdd">${ms('add')}เพิ่มค่าใช้จ่ายอื่น</button></div></div>`;
  return `${cur && cur.returnNote && cur.status === 'returned' ? `<div class="banner warn" style="margin-bottom:12px">${ms('edit_note')}<span>admin ส่งกลับให้แก้: <b>${esc(cur.returnNote)}</b></span></div>` : ''}
    <div class="grid g2"><div class="card"><div class="fgrid">${staffSel}${trav}
      <div class="field full"><label for="f-title">งาน</label><input class="inp" id="f-title" data-f="title" placeholder="เช่น ติดตั้งเครื่องคัดสี" value="${esc(f.title)}"></div>
      <div class="field"><label for="f-go">วันไป</label><input class="inp" type="date" id="f-go" data-f="go" value="${f.go}"></div>
      <div class="field"><label for="f-back">วันกลับ</label><input class="inp" type="date" id="f-back" data-f="back" value="${f.back}"></div>
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
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:12px 0 14px"><span>รวม</span><span class="big">${fmt(k.total)}</span></div></div>
      <button class="btn pri block" data-act="submitReq">${ms('send')}${f.editNo ? (isAdmin() && f.staffId !== ST.me.id ? 'บันทึกการแก้ไข' : 'ส่งใหม่ให้ admin') : 'ส่งคำขอให้ admin'}</button>
      <button class="btn ghost block" data-act="cancelForm" style="margin-top:6px">ยกเลิก</button>
      <p class="formula" style="margin:10px 0 0">admin ตรวจและอนุมัติ แล้วจ่ายเงินสดย่อยหรือโอนเข้าบัญชีผู้รับเงิน</p></div></div>`;
}

// ---------- รายละเอียดใบ (drawer) ----------
function openDrawer(html) { $('#drawer').innerHTML = html; $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); }
function closeDrawer() { $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); ST.openNo = null; }
const fileBtn = (f, label) => f ? `<button class="btn sm" data-act="fileView" data-v="${esc(f.path)}">${ms(f.type === 'application/pdf' ? 'picture_as_pdf' : 'image')}${esc(label || f.name || 'ไฟล์')}</button>` : '';
function drawDoc(no) {
  const d = doc(no); if (!d) { closeDrawer(); return; }
  ST.openNo = no; const p = d.plan, me = ST.me.id, lead = d.staffId === me, s = set();
  const lines = `<div class="lines"><div><span>ค่าน้ำมัน<br><span class="f">${fmt(p.km)} กม. ÷ ${s.kmPerL} × ${p.price}</span></span><b>${fmt(p.fuel)}</b></div>
      <div><span>เบี้ยเลี้ยง<br><span class="f">${p.people} คน × ${p.days} วัน</span></span><b>${fmt(p.allowance)}</b></div>
      <div><span>ที่พัก<br><span class="f">${p.nights} คืน × ${p.rooms} ห้อง × ${fmt(p.rate)}${p.hotelOver ? ` <span class="overpill">เกินอัตรา</span><br>เหตุผล: ${esc(p.hotelReason)}` : ''}</span></span><b>${fmt(p.hotel)}</b></div>
      ${(p.extras || []).map((e) => `<div><span>${esc(e.desc)}<br><span class="f">${esc(e.cat)}</span></span><b>${fmt(e.amount)}</b></div>`).join('')}
      <div class="tot"><span>ยอดเบิก</span><b>${fmt(d.requested)}</b></div></div>`;
  const km = d.kmCalc != null && d.kmSrc === 'est' ? `<div class="banner warn">${ms('route')}<span>ระยะทางประมาณจากเส้นตรง ${fmt(d.kmCalc)} กม. (บริการแผนที่ใช้ไม่ได้ตอนส่ง) · ขอ <b>${fmt(p.km)}</b> กม.${d.kmReason ? ` · ${esc(d.kmReason)}` : ''} · ตรวจก่อนอนุมัติ</span></div>` : d.kmCalc != null ? (d.kmReason ? `<div class="banner warn">${ms('route')}<span>ระบบคำนวณ <b>${fmt(d.kmCalc)}</b> กม. · ขอ <b>${fmt(p.km)}</b> กม. · เหตุผล: ${esc(d.kmReason)}</span></div>` : '') : `<div class="banner info">${ms('route')}<span>ระยะทางกรอกเอง ${fmt(p.km)} กม.${d.kmReason ? ` · ${esc(d.kmReason)}` : ''}</span></div>`;
  const act = actionsFor(d, lead);
  const mapBtn = d.routePts ? `<a class="btn sm" href="${gmLink(d.routePts)}" target="_blank" rel="noopener">${ms('map')}เปิดเส้นทางใน Google Maps</a>` : '';
  const actual = d.actual ? `<div class="card"><h3>${ms('fact_check')}ผลเคลียร์</h3><div class="lines"><div><span>น้ำมันจริง</span><b>${fmt(d.actual.fuel)}</b></div><div><span>เบี้ยเลี้ยง ${d.actual.people} คน × ${d.actual.days} วัน</span><b>${fmt(d.actual.allowance)}</b></div><div><span>ที่พัก ${d.actual.nights} คืน${d.actual.hotelExcess > 0 ? `<br><span class="f">เกินที่อนุมัติ ${fmt(d.actual.hotelExcess)} · ${d.actual.hotelExApproved ? 'อนุมัติแล้ว' : 'ไม่คืนส่วนนี้'}</span>` : ''}</span><b>${fmt(d.actual.hotel)}</b></div>${(d.actual.extras || []).map((e) => `<div><span>${esc(e.desc)}${e.why ? `<br><span class="f">ไม่มีใบเสร็จ: ${esc(e.why)}</span>` : ''}</span><b>${fmt(e.counted)}</b></div>`).join('')}<div class="tot"><span>ใช้จริง</span><b>${fmt(d.actual.total)}</b></div></div>
      <div class="diffbox ${d.diff < 0 ? 'refund' : d.diff > 0 ? 'topup' : 'even'}" style="margin-top:10px"><span>${d.diff < 0 ? 'ทีมงานคืนเงิน' : d.diff > 0 ? 'บริษัทจ่ายเพิ่ม' : 'พอดี'}</span><b>${fmt(Math.abs(d.diff))} บาท</b></div>
      ${(d.actual.files || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${d.actual.files.map((f, i) => fileBtn(f, `ใบเสร็จ ${i + 1}`)).join('')}</div>` : ''}</div>` : '';
  const pay = d.payment ? `<div class="lines" style="margin-top:6px"><div><span>โอนเมื่อ ${dt(d.payment.date)} · ${esc(d.payment.bank)}${d.payment.bankChanged ? ' <span class="pill p-pending">บัญชีเพิ่งเปลี่ยน · ยืนยันแล้ว</span>' : ''}</span>${fileBtn(d.payment.slip, 'สลิป')}</div></div>` : '';
  openDrawer(`<div class="dh"><div><div style="display:flex;gap:8px;align-items:center"><span class="tpill t-TRV">TRV</span>${statusPill(d)}</div><h2 class="num">${d.no}</h2></div><button class="btn sm ghost x" data-act="closeDrawer" aria-label="ปิด">${ms('close')}</button></div>
    <div class="db">
      ${d.returnNote && d.status === 'returned' ? `<div class="banner warn">${ms('edit_note')}<span>ส่งกลับให้แก้: <b>${esc(d.returnNote)}</b></span></div>` : ''}
      ${d.rejectNote && d.status === 'rejected' ? `<div class="banner bad">${ms('block')}<span>${d.cancelled ? 'ยกเลิก' : 'ไม่อนุมัติ'}: <b>${esc(d.rejectNote)}</b></span></div>` : ''}
      ${d.clearReturn && d.status === 'open' ? `<div class="banner warn">${ms('edit_note')}<span>ส่งเคลียร์กลับให้แก้: <b>${esc(d.clearReturn)}</b></span></div>` : ''}
      <div class="card"><b style="font-size:16px">${esc(d.title)}</b><dl class="kv" style="margin-top:8px"><dt>ผู้รับเงิน</dt><dd>${esc(d.staffName)}</dd><dt>ผู้เดินทาง</dt><dd>${d.travelers.map((t) => esc(t.name)).join(', ')}</dd><dt>วันที่</dt><dd>${dRange(d.go, d.back)} (${p.days} วัน ${p.nights} คืน)</dd><dt>เส้นทาง</dt><dd>${esc(ST.settings.home.name.split(' · ')[0])} → ${d.stops.map(esc).join(' → ')} → กลับ</dd><dt>จ่ายโดย</dt><dd>${d.paidFrom === 'PC' ? 'เงินสดย่อย' : d.paidFrom === 'BANK' ? 'โอนเข้าบัญชี' : '—'}</dd></dl>${pay}</div>
      ${km}${mapBtn ? `<div>${mapBtn}${d.kmSrc ? ` <span class="formula">ระยะจาก ${d.kmSrc === 'google' ? 'Google Maps' : d.kmSrc === 'osrm' ? 'OSRM' : d.kmSrc === 'ors' ? 'OpenRouteService' : 'ค่าประมาณ'}</span>` : ''}</div>` : ''}<div class="card"><h3>${ms('calculate')}ยอดที่ขอเบิก</h3>${lines}</div>${actual}
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
    if (d.status === 'approve') return `<button class="btn pri block" data-act="go" data-v="payq">${ms('account_balance')}ไปที่รายการรอโอน</button><button class="btn block" data-act="decideAsk" data-v="cancel">${ms('block')}ยกเลิกใบนี้</button><div id="noteBox"></div>`;
    if (d.status === 'open') return `<button class="btn block" data-act="openClr" data-v="${d.no}">${ms('fact_check')}เคลียร์แทนทีมงาน</button>`;
    if (d.status === 'clearSub') return `<button class="btn pri block" data-act="openClr" data-v="${d.no}">${ms('fact_check')}ตรวจผลเคลียร์</button>`;
    if (d.status === 'refund') return `<p class="formula" style="margin:0">รอ ${esc(d.staffName)} คืนเงิน <b>${fmt(-d.diff)}</b> บาท</p><div class="srcpick"><label><input type="radio" name="rhow" value="PC" checked> รับเงินสด (เข้าเงินสดย่อย)</label><label><input type="radio" name="rhow" value="BANK"> โอนคืนเข้าบัญชี</label></div>
      <div class="field" id="rslipBox" hidden><label for="r-slip">สลิปที่ทีมงานโอนคืน</label><input class="inp" type="file" id="r-slip" accept="image/*,application/pdf" style="padding-top:6px"></div><button class="btn pri block" data-act="refundOk">${ms('task_alt')}รับเงินคืนแล้ว · ปิดใบ</button>`;
    if (d.status === 'topup' && d.settleSrc === 'BANK') return `<button class="btn pri block" data-act="go" data-v="payq">${ms('account_balance')}ไปที่รายการรอโอน (ส่วนต่าง ${fmt(d.diff)})</button>`;
    return '';
  }
  if (!lead) return isCeo() ? '' : `<p class="formula" style="margin:0">${ms('visibility', 'style="font-size:16px;vertical-align:-3px"')} คุณร่วมเดินทางในทริปนี้ · ผู้รับเงินคือ ${esc(d.staffName)}</p>`;
  if (d.status === 'returned' || d.status === 'submitted') return `<button class="btn pri block" data-act="editReq">${ms('edit')}${d.status === 'returned' ? 'แก้ไขและส่งใหม่' : 'แก้ไขคำขอ'}</button><button class="btn block" data-act="decideAsk" data-v="cancel">${ms('block')}ยกเลิกคำขอ</button><div id="noteBox"></div>`;
  if (d.status === 'open') return `<button class="btn pri block" data-act="openClr" data-v="${d.no}">${ms('fact_check')}ส่งเคลียร์ (หลังจบทริป)</button>`;
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
      ${adminRev ? `<button class="btn pri block" data-act="clrConfirm" ${r.err ? 'disabled' : ''}>${ms('task_alt')}ยืนยันผลเคลียร์</button>${d.status === 'clearSub' ? `<div class="field" style="margin-top:10px"><label for="c-ret">เหตุผล (ถ้าส่งกลับให้แก้)</label><input class="inp" id="c-ret" placeholder="เช่น ใบเสร็จน้ำมันไม่ชัด"></div><button class="btn block" style="margin-top:6px" data-act="clrReturn">${ms('undo')}ส่งกลับให้แก้</button>` : ''}`
        : `<button class="btn pri block" data-act="clrSubmit" ${r.err ? 'disabled' : ''}>${ms('send')}ส่งเคลียร์ให้ admin ตรวจ</button>`}
    </div></div>`;
}

// ---------- รอโอน ----------
function vPayq() {
  if (!ST.payq) { api('payQueue').then((r) => { ST.payq = r.list; render(); }).catch((e) => { fail(e); ST.payq = []; render(); }); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const tot = ST.payq.reduce((t, x) => t + x.amount, 0);
  return `<div class="pwbox soft">${ms('info')}<span>ช่วงทดลอง: อนุมัติแล้วเข้ารายการนี้ · โอนเองแล้วกด "บันทึกว่าโอนแล้ว" พร้อมแนบสลิป · รอบ 4 จะเพิ่มใบเสนอ CEO (กระดาษ) ก่อนขั้นนี้</span></div>
    <p style="margin:12px 0;color:var(--sub)">รอโอน <b class="num">${ST.payq.length}</b> รายการ · รวม <b class="num">${fmt(tot)}</b> บาท</p>
    <div class="stack">${ST.payq.map((x) => `<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="kind">${x.kind === 'advance' ? 'เงินเบิกล่วงหน้า' : 'ส่วนต่างหลังเคลียร์'}</span><b class="num" role="button" tabindex="0" data-act="openDoc" data-v="${x.no}" style="cursor:pointer">${x.no}</b><span style="margin-left:auto" class="big" style="font-size:22px">${fmt(x.amount)}</span></div>
        <div style="margin:6px 0">${esc(x.staffName)} · ${esc(x.title)}</div>
        <div class="lines"><div><span>${ms('account_balance', 'style="font-size:16px;vertical-align:-3px"')} โอนเข้า</span><b>${x.bank ? `${esc(x.bank.bank)} <span class="num">${esc(x.bank.no)}</span>${x.bank.name ? ` · ${esc(x.bank.name)}` : ''}` : '<span style="color:var(--bad)">ยังไม่มีบัญชี</span>'}</b></div></div>
        ${x.bankPending ? `<div class="banner bad" style="margin-top:8px">${ms('warning')}<span>บัญชีนี้เพิ่งเปลี่ยนเมื่อ ${dtTime(x.bankChangedAt)} · ตรวจกับเจ้าตัวก่อนโอน</span></div>` : ''}
        ${isAdmin() ? `<div class="fgrid" style="margin-top:10px"><div class="field"><label for="pd-${x.no}">วันที่โอน</label><input class="inp" type="date" id="pd-${x.no}" value="${todayTH()}"></div><div class="field"><label for="ps-${x.no}">สลิปการโอน</label><input class="inp" type="file" id="ps-${x.no}" accept="image/*,application/pdf" style="padding-top:6px"></div></div>
          ${x.bankPending ? `<label class="ckl" style="margin-top:8px"><input type="checkbox" id="pc-${x.no}"> ฉันตรวจเลขบัญชีที่เพิ่งเปลี่ยนกับเจ้าตัวแล้ว</label>` : ''}
          <button class="btn pri" style="margin-top:10px" data-act="markPaid" data-v="${x.no}" ${x.bank ? '' : 'disabled'}>${ms('task_alt')}บันทึกว่าโอนแล้ว</button>` : ''}</div>`).join('') || '<div class="card empty">ไม่มีรายการรอโอน</div>'}</div>`;
}

// ---------- เงินสดย่อย (ขั้นต่ำ) ----------
function vPc() {
  if (!ST.pc) { api('pcList').then((r) => { ST.pc = r; render(); }).catch((e) => { fail(e); ST.pc = { list: [], balance: 0, lowAlert: 0 }; render(); }); return `<div class="loading" style="padding:40px"><div class="spin"></div></div>`; }
  const P = ST.pc, low = P.balance < P.lowAlert;
  return `<div class="grid g2"><div class="card"><div class="pchero"><div><span style="color:var(--sub)">เงินสดย่อยคงเหลือ</span><div class="big" style="${low ? 'color:var(--bad)' : ''}">${fmt(P.balance)}</div>${low ? `<span class="pill p-over">ต่ำกว่า ${fmt(P.lowAlert)} · ควรเติม</span>` : ''}</div></div>
      <h3 style="margin-top:14px">${ms('receipt')}รายการล่าสุด</h3><div class="lines">${P.list.slice(0, 40).map((e) => `<div><span>${esc(e.note)}${e.ref ? ` · <span class="num">${esc(e.ref)}</span>` : ''}<br><span class="f">${dt(e.date)} · ${esc(e.no)} · ${esc(e.byName)}</span></span><b class="num" style="color:var(--${e.kind === 'in' ? 'good' : 'ink'})">${e.kind === 'in' ? '+' : '−'}${fmt(e.amount)}</b></div>`).join('') || '<div class="empty">ยังไม่มีรายการ</div>'}</div></div>
    ${isAdmin() ? `<div class="card"><h3>${ms('add_card')}เติมเงิน / ยอดยกมา</h3><div class="fgrid"><div class="field"><label for="pc-amt">จำนวนเงิน (บาท)</label><input class="inp num" type="number" id="pc-amt"></div><div class="field"><label for="pc-note">หมายเหตุ</label><input class="inp" id="pc-note" placeholder="เช่น ยอดยกมา / เติมกองทุน"></div></div><button class="btn pri" style="margin-top:10px" data-act="pcTopup">${ms('add')}บันทึกเติมเงิน</button><p class="formula" style="margin:10px 0 0">หน้าเงินสดย่อยเต็ม (นับเงินจริง ใบเบิกชดเชย) เปิดในรอบ 3</p></div>` : ''}</div>`;
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
      if (v === 'req' && !(ST.form && ST.view === 'req')) ST.form = null;
      if (v !== 'clr') ST.clr = null;
      ST.view = v; ST.bankEdit = null; closeDrawer(); render(); $('#view').scrollTop = 0; return;
    }
    if (a === 'goSet') { ST.view = 'settings'; ST.setTab = v; render(); return; }
    if (a === 'mini') { $('#app').classList.toggle('mini'); return; }
    if (a === 'refresh') return busy(b, async () => { if (await reloadMe()) { ST.members = null; ST.bankLog = null; ST.wiz.counts = null; ST.draft = null; ST.trv = null; ST.payq = null; ST.pc = null; render(); toast('โหลดข้อมูลใหม่แล้ว'); } });
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
async function reloadTrv() { ST.trv = await api('trvList'); ST.payq = null; ST.pc = null; }
const fileOf = async (inp) => inp && inp.files && inp.files[0] ? readFile(inp.files[0]) : null;
async function trvClick(a, v, b) {
  if (a === 'more') { ST.view = 'more'; closeDrawer(); render(); return true; }
  if (a === 'newReq') { ST.form = newForm(); ST.view = 'req'; closeDrawer(); render(); refreshRoute(); return true; }
  if (a === 'openDoc') { drawDoc(v); return true; }
  if (a === 'closeDrawer') { closeDrawer(); return true; }
  if (a === 'openClr') { const d = doc(v); ST.clrNo = v; ST.clr = null; ST.view = 'clr'; closeDrawer(); render(); $('#view').scrollTop = 0; void d; return true; }
  if (a === 'cancelForm') { ST.form = null; ST.view = 'home'; render(); return true; }
  // ฟอร์มขอเบิก
  const f = ST.form;
  if (a === 'travDel') { f.travelerIds = f.travelerIds.filter((x) => x !== v); render(); return true; }
  if (a === 'stopAdd') { f.stops.push(''); f.geo.push(null); render(); document.getElementById(`f-stop-${f.stops.length - 1}`)?.focus(); return true; }
  if (a === 'stopDel') { f.stops.splice(+v, 1); f.geo.splice(+v, 1); f.legs = null; render(); refreshRoute(); return true; }
  if (a === 'exAdd') { f.extras.push({ cat: ST.settings.cats[0] || 'อื่นๆ', desc: '', amount: '' }); render(); return true; }
  if (a === 'exDel') { f.extras.splice(+v, 1); render(); return true; }
  if (a === 'submitReq') {
    const k = calcForm(f);
    if (!f.title.trim()) { toast('ใส่ชื่องาน', 'error'); return true; }
    if (!f.stops.some((x) => x.trim())) { toast('เพิ่มสถานที่อย่างน้อย 1 แห่ง', 'error'); return true; }
    if (!(k.km > 0)) { toast('ใส่ระยะทางไป-กลับ', 'error'); return true; }
    if (f.kmManual && f.kmCalc != null && f.kmSrc !== 'est' && Math.abs(k.km - f.kmCalc) >= 0.5 && !f.kmReason.trim()) { toast('ใส่เหตุผลที่แก้ระยะทาง', 'error'); return true; }
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
    await busy(b, async () => {
      const slip = await fileOf($(`#ps-${CSS.escape(v)}`)); if (!slip) { toast('แนบสลิปการโอน', 'error'); return; }
      const cf = $(`#pc-${CSS.escape(v)}`);
      await api('markPaid', { no: v, date: $(`#pd-${CSS.escape(v)}`).value, slip, bankConfirmed: cf ? cf.checked : false });
      await reloadTrv(); render(); toast(`บันทึกโอน ${v} แล้ว`);
    });
    return true;
  }
  if (a === 'refundOk') {
    const no = ST.openNo, how = (document.querySelector('input[name="rhow"]:checked') || {}).value || 'PC';
    await busy(b, async () => { const slip = how === 'BANK' ? await fileOf($('#r-slip')) : null; if (how === 'BANK' && !slip) { toast('แนบสลิป', 'error'); return; } await api('trvRefundReceived', { no, how, slip }); await reloadTrv(); render(); drawDoc(no); toast(`${no} ปิดใบแล้ว`); });
    return true;
  }
  if (a === 'pcTopup') { await busy(b, async () => { await api('pcTopup', { amount: $('#pc-amt').value, note: $('#pc-note').value }); ST.pc = null; await reloadTrv(); render(); toast('บันทึกเติมเงินแล้ว'); }); return true; }
  // เคลียร์
  const k = ST.clr;
  if (a === 'stayAdd') { const d = doc(ST.clrNo); const last = k.stays[k.stays.length - 1]; const from = last ? addDays(last.to, 1) : d.go; k.stays.push({ from: from > d.back ? d.back : from, to: from > d.back ? d.back : from, rate: '' }); render(); return true; }
  if (a === 'stayDel') { k.stays.splice(+v, 1); render(); return true; }
  if (a === 'fileDel') { k.files.splice(+v, 1); render(); return true; }
  if (a === 'clrSubmit' || a === 'clrConfirm') {
    const d = doc(ST.clrNo), r = clrCalc(d, k); if (r.err) { toast(r.err, 'error'); return true; }
    await busy(b, async () => {
      const clr = { fuel: Number(k.fuel), people: Number(k.people), days: Number(k.days), stays: k.stays, ex: k.ex, files: k.files, note: k.note };
      if (a === 'clrSubmit') { await api('trvClearSubmit', { no: d.no, clr }); toast('ส่งเคลียร์แล้ว · รอ admin ตรวจ'); }
      else { const res = await api('trvClearConfirm', { no: d.no, clr, hotelEx: k.hotelEx, exOver: k.exOver, src: k.src }); toast(res.note || ({ closed: `${d.no} ปิดใบแล้ว`, refund: `${d.no} รอรับเงินคืน`, topup: `${d.no} รอโอนส่วนต่าง` }[res.status] || 'ยืนยันแล้ว')); }
      const no = d.no; ST.clr = null; await reloadTrv(); ST.view = isAdmin() ? 'clear' : 'home'; render(); drawDoc(no);
    });
    return true;
  }
  if (a === 'clrReturn') {
    const note = $('#c-ret').value.trim(); if (!note) { toast('ใส่เหตุผล', 'error'); return true; }
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
  if (ST.form && el.dataset.stop !== undefined) { const i = +el.dataset.stop; ST.form.stops[i] = el.value; ST.form.geo[i] = null; el.parentElement.querySelector('.ta-ok')?.remove(); taInput(el, String(i)); return; }
  if (el.id === 'cust-q') { taInput(el, 'cust'); return; }
  if (ST.form && el.dataset.ex) { const [i, key] = el.dataset.ex.split(':'); ST.form.extras[+i][key] = el.value; if (key === 'amount') updCalc(); return; }
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
