/* ============================================================
   MetaMask Portfolio — Landing + Connected Home
   Wallet connect → 15s loader → Homepage with 1-hour reset
   Live CoinGecko v3 prices and BNB BEP-20 balances
   ============================================================ */

const REQUIRED_ADDRESS = '0xfe46bbfb161a724d8a9b77dbaf45d0da3b7ac373';
const WALLET_ADDRESS   = REQUIRED_ADDRESS;
const NEXT_PAGE        = 'mainportfolio.html';
const LOAD_SECONDS     = 15;
const RESET_SEC        = 60 * 60;                     /* 1 hour */
const COINGECKO_API    = 'https://api.coingecko.com/api/v3';

const BNB_HOLDING  = 0.199;
const USDT_HOLDING = 25245.78;

const LS = {
  theme:      'mm-theme',
  connected:  'mm-connected',
  resetStart: 'mm-sdb-start',
  lastPrice:  'mm-ws-last-price'
};

let connectTimer   = null;
let countdownTimer = null;
let resetTicker    = null;
let priceTimer     = null;
let isConnecting   = false;
let redirected     = false;

let live = { bnb: 0, bnbChange: 0, usdt: 1, usdtChange: 0, loaded: false };

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const fmtUSD = (n, d) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 });
const fmtNum = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 4 });
const shortAddr = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const fmtHMS = (s) => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
         String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' +
         String(s % 60).padStart(2, '0');
};

function lsGet(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k)    { try { localStorage.removeItem(k); } catch (e) {} }

/* ---------- theme ---------- */
document.documentElement.setAttribute('data-theme', lsGet(LS.theme, 'dark'));

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  lsSet(LS.theme, next);
  toast(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-check"/></svg><span></span>';
  el.querySelector('span').textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-on');
    setTimeout(() => el.remove(), 280);
  }, 2600);
}

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function showLanding() {
  const landing = $('landingView');
  const home    = $('homeView');
  const cbtn    = $('connectBtn');
  const chip    = $('acctChip');
  if (landing) landing.hidden = false;
  if (home)    home.hidden = true;
  if (cbtn)    cbtn.hidden = false;
  if (chip)    chip.hidden = true;
}

function showHome() {
  const landing = $('landingView');
  const home    = $('homeView');
  const cbtn    = $('connectBtn');
  const chip    = $('acctChip');
  if (landing) landing.hidden = true;
  if (home)    home.hidden = false;
  if (cbtn)    cbtn.hidden = true;
  if (chip)    chip.hidden = false;

  const code = $('acctChipCode');
  if (code) code.textContent = shortAddr(WALLET_ADDRESS);
  const addr = $('welcomeAddress');
  if (addr) addr.textContent = WALLET_ADDRESS;

  renderTokens();
  startResetTicker();
}

/* ============================================================
   PRESERVED NAVIGATION (showPage)
   ============================================================ */
function showPage(id, evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();

  const links = document.querySelectorAll('.nav-link');
  for (let i = 0; i < links.length; i++) {
    links[i].classList.toggle('is-active', links[i].getAttribute('data-nav') === id);
  }

  const target = document.getElementById(id);
  if (target) {
    const headerH = 82;
    const top = target.getBoundingClientRect().top + window.pageYOffset - headerH;
    window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
  }

  const pages = document.querySelectorAll('.page');
  for (let j = 0; j < pages.length; j++) pages[j].classList.remove('page');
  if (target) {
    target.classList.add('page');
    void target.offsetWidth;
  }
  closeMobileNav();
  return false;
}

function closeMobileNav() {
  const nav = $('mainNav');
  const burger = $('hamburger');
  if (nav) nav.classList.remove('is-open');
  if (burger) { burger.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
}

function toggleMobileNav() {
  const nav = $('mainNav');
  const burger = $('hamburger');
  if (!nav || !burger) return;
  const open = nav.classList.toggle('is-open');
  burger.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* ============================================================
   WALLET CONNECT MODAL
   ============================================================ */
function openWallet() {
  const modal = $('walletModal');
  if (!modal) return;

  resetModal();
  modal.hidden = false;
  document.body.classList.add('no-scroll');

  const input = $('walletAddress');
  if (input) setTimeout(() => input.focus(), 120);
}

function closeWallet() {
  if (isConnecting) return;
  const modal = $('walletModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('no-scroll');
}

function resetModal() {
  const form = $('stageForm');
  const load = $('stageLoading');
  if (form) form.hidden = false;
  if (load) load.hidden = true;

  const input = $('walletAddress');
  if (input) input.value = '';

  const field = $('fieldWrap');
  if (field) field.classList.remove('is-error', 'is-valid');

  const hint = $('fieldHint');
  if (hint) {
    hint.classList.remove('is-error', 'is-ok');
    hint.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-shield"/></svg>' +
      '<span>Only BNB Smart Chain (BEP-20) addresses are accepted in this demo.</span>';
  }

  const btn = $('submitWallet');
  if (btn) btn.disabled = true;

  const pct = $('loaderPct'); if (pct) pct.textContent = '0%';
  const sec = $('loaderSec'); if (sec) sec.textContent = LOAD_SECONDS + 's';
  const ring = $('ringProgress'); if (ring) ring.style.strokeDashoffset = '327';
  const fill = $('barFill'); if (fill) fill.style.width = '0%';
  const step = $('loaderStep'); if (step) step.textContent = 'Establishing secure channel';

  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  isConnecting = false;
}

function normalise(v) { return String(v || '').trim().toLowerCase(); }
function isAddressShape(v) { return /^0x[a-f0-9]{40}$/.test(normalise(v)); }
function isRequired(v) { return normalise(v) === REQUIRED_ADDRESS; }

function onAddressInput() {
  const input = $('walletAddress');
  const field = $('fieldWrap');
  const hint  = $('fieldHint');
  const btn   = $('submitWallet');
  if (!input || !field || !hint || !btn) return;

  const value = normalise(input.value);
  field.classList.remove('is-error', 'is-valid');
  hint.classList.remove('is-error', 'is-ok');

  if (value.length === 0) {
    hint.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-shield"/></svg>' +
      '<span>Only BNB Smart Chain (BEP-20) addresses are accepted in this demo.</span>';
    btn.disabled = true;
    return;
  }

  if (!isAddressShape(value)) {
    field.classList.add('is-error');
    hint.classList.add('is-error');
    hint.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-close"/></svg>' +
      '<span>That doesn\u2019t look like a valid address. It must start with 0x and be 42 characters long.</span>';
    btn.disabled = true;
    return;
  }

  if (!isRequired(value)) {
    field.classList.add('is-error');
    hint.classList.add('is-error');
    hint.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-close"/></svg>' +
      '<span>This wallet is not authorised for this demo. Use the BNB Smart Chain address provided.</span>';
    btn.disabled = true;
    return;
  }

  field.classList.add('is-valid');
  hint.classList.add('is-ok');
  hint.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-check"/></svg>' +
    '<span>BNB Smart Chain address verified. You can connect now.</span>';
  btn.disabled = false;
}

function pasteAddress() {
  const input = $('walletAddress');
  if (!input) return;
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then((text) => {
      input.value = (text || '').trim();
      onAddressInput();
    }).catch(() => { input.focus(); toast('Paste with Ctrl/Cmd + V'); });
  } else {
    input.focus();
    toast('Paste with Ctrl/Cmd + V');
  }
}

/* ---------- 15-second loader ---------- */
const LOADER_STEPS = [
  'Establishing secure channel',
  'Requesting account permissions',
  'Reading BNB Smart Chain balances',
  'Indexing tokens and positions',
  'Syncing transaction history',
  'Preparing your portfolio'
];

function connectWallet() {
  const input = $('walletAddress');
  if (!input) return;
  if (!isRequired(input.value)) { onAddressInput(); return; }
  if (isConnecting) return;

  isConnecting = true;

  const form = $('stageForm');
  const load = $('stageLoading');
  if (form) form.hidden = true;
  if (load) load.hidden = false;

  const ring  = $('ringProgress');
  const pctEl = $('loaderPct');
  const secEl = $('loaderSec');
  const fill  = $('barFill');
  const step  = $('loaderStep');
  const CIRC  = 327;

  let left  = LOAD_SECONDS;
  const total = LOAD_SECONDS;

  function render() {
    const done = total - left;
    const pct  = Math.min(100, Math.round((done / total) * 100));
    if (pctEl) pctEl.textContent = pct + '%';
    if (secEl) secEl.textContent = left + 's';
    if (fill)  fill.style.width = pct + '%';
    if (ring)  ring.style.strokeDashoffset = String(CIRC - (CIRC * pct) / 100);
    if (step) {
      const idx = Math.min(LOADER_STEPS.length - 1, Math.floor((done / total) * LOADER_STEPS.length));
      step.textContent = LOADER_STEPS[idx];
    }
  }
  render();

  countdownTimer = setInterval(() => {
    left -= 1;
    if (left < 0) left = 0;
    render();
  }, 1000);

  connectTimer = setTimeout(() => {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (pctEl) pctEl.textContent = '100%';
    if (secEl) secEl.textContent = '0s';
    if (fill)  fill.style.width = '100%';
    if (ring)  ring.style.strokeDashoffset = '0';
    if (step)  step.textContent = 'Wallet connected';

    setTimeout(finishConnect, 400);
  }, total * 1000);
}

function finishConnect() {
  lsSet(LS.connected, '1');
  if (!lsGet(LS.resetStart, null)) lsSet(LS.resetStart, String(Date.now()));
  isConnecting = false;
  closeWallet();
  showHome();
  loadLivePrices();
  if (!priceTimer) priceTimer = setInterval(loadLivePrices, 60000);
}

/* ============================================================
   1-HOUR RESET COUNTDOWN
   ============================================================ */
function getResetStart() {
  const v = lsGet(LS.resetStart, null);
  if (!v) { lsSet(LS.resetStart, String(Date.now())); return Date.now(); }
  return parseInt(v, 10) || Date.now();
}

function resetRemaining() {
  return Math.max(0, RESET_SEC - Math.floor((Date.now() - getResetStart()) / 1000));
}

function tickReset() {
  const rem  = resetRemaining();
  const done = RESET_SEC - rem;

  const digits = $('resetDigits');
  if (digits) digits.textContent = fmtHMS(rem);

  const pct = $('resetPct');
  if (pct) pct.textContent = Math.round((done / RESET_SEC) * 100) + '%';

  const bar = $('resetBar');
  if (bar) bar.style.width = ((done / RESET_SEC) * 100).toFixed(2) + '%';

  const ring = $('resetRing');
  if (ring) {
    const C = 2 * Math.PI * 88;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = (C * (1 - rem / RESET_SEC)).toFixed(2);
  }

  const status = $('resetStatus');
  if (status) status.textContent = rem > 0 ? 'Counting down…' : 'Reset complete — opening portfolio';

  if (rem <= 0 && !redirected) {
    redirected = true;
    window.location.href = NEXT_PAGE;
  }
}

function startResetTicker() {
  if (resetTicker) clearInterval(resetTicker);
  tickReset();
  resetTicker = setInterval(tickReset, 1000);
}

/* ============================================================
   LIVE COINGECKO PRICES + BNB BEP-20 HOLDINGS
   ============================================================ */
async function loadLivePrices() {
  try {
    const url = COINGECKO_API + '/simple/price?ids=binancecoin,tether&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    live.bnb        = data?.binancecoin?.usd ?? 0;
    live.bnbChange  = data?.binancecoin?.usd_24h_change ?? 0;
    live.usdt       = data?.tether?.usd ?? 1;
    live.usdtChange = data?.tether?.usd_24h_change ?? 0;
    live.loaded     = true;

    lsSet(LS.lastPrice, JSON.stringify(live));

    const updated = $('welcomeUpdated');
    if (updated) {
      updated.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  } catch (err) {
    const cached = lsGet(LS.lastPrice, null);
    if (cached) {
      try {
        const c = JSON.parse(cached);
        live.bnb = c.bnb || 0;
        live.bnbChange = c.bnbChange || 0;
        live.usdt = c.usdt || 1;
        live.usdtChange = c.usdtChange || 0;
        live.loaded = true;
      } catch (e) {}
    }
    const updated = $('welcomeUpdated');
    if (updated) updated.textContent = 'Cached prices — CoinGecko unavailable';
  }
  renderTokens();
}

function refreshBalances() {
  loadLivePrices();
  toast('Refreshing balances…');
}

/* ---------- coin logos ---------- */
const LOGO_CACHE = {};
async function fetchLogo(coinId) {
  if (LOGO_CACHE[coinId]) return LOGO_CACHE[coinId];
  try {
    const res = await fetch(COINGECKO_API + '/coins/' + coinId +
      '?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false');
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    const url = data?.image?.large || data?.image?.small || data?.image?.thumb || '';
    LOGO_CACHE[coinId] = url;
    return url;
  } catch (e) { return ''; }
}

/* ---------- tokens ---------- */
const TOKENS = [
  { id: 'binancecoin', sym: 'BNB',  name: 'BNB',        holding: BNB_HOLDING,  decimals: 4, color: '#f6851b' },
  { id: 'tether',      sym: 'USDT', name: 'Tether USD', holding: USDT_HOLDING, decimals: 2, color: '#26A17B' }
];

function priceOf(id)  { return id === 'binancecoin' ? (live.bnb || 0) : (id === 'tether' ? (live.usdt || 1) : 0); }
function changeOf(id) { return id === 'binancecoin' ? (live.bnbChange || 0) : (id === 'tether' ? (live.usdtChange || 0) : 0); }

function renderTokens() {
  const list = $('tokenList');
  if (!list) return;

  const rows = TOKENS.map(t => {
    const price = priceOf(t.id);
    const usd   = t.holding * price;
    return Object.assign({}, t, { price, usd, change: changeOf(t.id) });
  });

  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
  const totalEl = $('walletTotal');
  if (totalEl) totalEl.textContent = fmtUSD(totalUsd > 0 ? totalUsd : USDT_HOLDING);

  list.innerHTML = rows.map(r => `
    <div class="token-row">
      <div class="token-logo" style="background:${r.color}22" data-logo="${r.id}">
        <span style="color:${r.color};font-size:11px;font-weight:900">${r.sym.slice(0,3)}</span>
      </div>
      <div class="token-info">
        <div class="token-name">${r.name}</div>
        <div class="token-sym">${fmtNum(r.holding, r.decimals)} ${r.sym} · BNB Smart Chain (BEP-20)</div>
      </div>
      <div class="token-val">
        <b>${fmtUSD(r.usd)}</b>
        <span class="${r.change >= 0 ? 'up' : 'down'}">${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)}%</span>
      </div>
    </div>
  `).join('');

  rows.forEach(r => {
    fetchLogo(r.id).then(url => {
      if (!url) return;
      document.querySelectorAll('[data-logo="' + r.id + '"]').forEach(node => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = r.sym;
        img.loading = 'lazy';
        img.onerror = function () {
          node.innerHTML = '<span style="color:' + r.color + ';font-size:11px;font-weight:900">' + r.sym.slice(0,3) + '</span>';
        };
        node.innerHTML = '';
        node.appendChild(img);
      });
    });
  });
}

/* ---------- account + copy ---------- */
function openAccount() {
  const bal = $('walletTotal') ? $('walletTotal').textContent : '$25,245.78';
  const modal = $('walletModal');
  if (!modal) return;

  resetModal();
  const form = $('stageForm');
  if (form) {
    form.innerHTML =
      '<div class="modal-head">' +
        '<div class="modal-fox"><svg viewBox="0 0 32 32"><use href="#ico-fox"/></svg></div>' +
        '<h2>Connected wallet</h2>' +
        '<p>BNB Smart Chain · BEP-20</p>' +
      '</div>' +
      '<div class="detail-row" style="display:flex;justify-content:space-between;gap:16px;padding:13px 0;border-bottom:1px solid var(--border);font-size:13.5px">' +
        '<span style="font-weight:700;color:var(--text-3)">Address</span>' +
        '<span style="font-family:var(--mono);font-size:12px;font-weight:800;word-break:break-all;text-align:right">' + WALLET_ADDRESS + '</span>' +
      '</div>' +
      '<div class="detail-row" style="display:flex;justify-content:space-between;gap:16px;padding:13px 0;border-bottom:1px solid var(--border);font-size:13.5px">' +
        '<span style="font-weight:700;color:var(--text-3)">Balance</span>' +
        '<span style="font-weight:800">' + bal + '</span>' +
      '</div>' +
      '<button class="btn btn-outline btn-block" style="margin-top:18px" onclick="copyAddress()">' +
        '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-copy"/></svg> Copy address' +
      '</button>' +
      '<button class="btn btn-primary btn-block" style="margin-top:10px" onclick="closeWallet()">Done</button>';
  }
  modal.hidden = false;
  document.body.classList.add('no-scroll');
}

function copyAddress() {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(WALLET_ADDRESS)
      .then(() => toast('Address copied'))
      .catch(() => toast(WALLET_ADDRESS));
  } else {
    toast(WALLET_ADDRESS);
  }
}

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const themeBtn = $('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const burger = $('hamburger');
  if (burger) burger.addEventListener('click', toggleMobileNav);

  const addr = $('walletAddress');
  if (addr) {
    addr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const btn = $('submitWallet');
        if (btn && !btn.disabled) connectWallet();
      }
    });
  }

  const backdrop = $('walletModal');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeWallet();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = $('walletModal');
      if (m && !m.hidden) closeWallet();
      closeMobileNav();
    }
  });

  function onScroll() {
    const header = $('siteHeader');
    if (header) header.classList.toggle('is-stuck', window.scrollY > 12);
    animateCounters();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (window.location.hash) {
    const id = window.location.hash.replace('#', '');
    if (document.getElementById(id)) showPage(id);
  }

  /* If already connected, open the homepage directly */
  if (lsGet(LS.connected, '') === '1') {
    showHome();
    loadLivePrices();
    if (!priceTimer) priceTimer = setInterval(loadLivePrices, 60000);
  } else {
    showLanding();
  }
});

/* ---------- counters ---------- */
function animateCounters() {
  const nodes = document.querySelectorAll('.stat-num');
  for (let i = 0; i < nodes.length; i++) {
    (function (node) {
      if (node.dataset.done === '1') return;
      const rect = node.getBoundingClientRect();
      if (rect.top > window.innerHeight - 60) return;
      node.dataset.done = '1';
      const target = parseFloat(node.getAttribute('data-count')) || 0;
      const suffix = node.getAttribute('data-suffix') || '';
      let start = null;
      const duration = 1400;
      function step(ts) {
        if (start === null) start = ts;
        const p = Math.min(1, (ts - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const value = Math.round(target * eased);
        if (target >= 10000) {
          node.textContent = (value / 1000000).toFixed(2) + 'M' + suffix;
        } else {
          node.textContent = value.toLocaleString() + suffix;
        }
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    })(nodes[i]);
  }
}
