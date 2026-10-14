/* 特定商取引法に基づく表記：data/settings.json の tokusho を表示する */
(function () {
  'use strict';
  var R = window.SiopaRules;
  function $(id) { return document.getElementById(id); }
  function set(id, v, fallback) { $(id).textContent = String(v || '').trim() || fallback; }
  fetch('data/settings.json', { cache: 'no-cache', credentials: 'omit' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (raw) {
      var s = R.validateSettings(raw).length === 0 ? R.withDefaults(raw) : R.withDefaults(null);
      var t = s.tokusho, onReq = 'ご請求があれば遅滞なく開示します';
      set('t-seller', t.seller, '準備中');
      set('t-manager', t.manager, '準備中');
      set('t-address', t.address, t.disclosureOnRequest ? onReq : '準備中');
      set('t-phone', t.phone, t.disclosureOnRequest ? onReq : '準備中');
      set('t-email', t.email, '準備中');
      set('t-license', s.license, '申請準備中');
      document.querySelectorAll('[data-rmonths]').forEach(function (n) { n.textContent = s.rentMonths; });
      document.querySelectorAll('[data-when-closed]').forEach(function (n) { n.hidden = s.accepting === true; });
    })
    .catch(function () {});
})();
