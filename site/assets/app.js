/* Siopa Ceoil — 店頭ページの表示。データは data/*.json を読むだけで、どこにも書き込まない。 */
(function () {
  'use strict';
  var R = window.SiopaRules;
  var TYPES = R.TYPES, COND = R.COND, STATUS = R.STATUS, CHECK_LABEL = R.CHECK_LABEL;
  var state = R.withDefaults(null);
  var listings = [];
  var view = { type: 'all', key: 'all', hideSold: true, rentOnly: false, sort: 'new' };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }
  function fee(p) { if (!(p > 0)) return 0; return Math.min(p, Math.max(Math.round(p * state.feeRate / 100), state.feeMin)); }
  function rentFee(p) { if (!(p > 0)) return state.rentMin; return Math.max(Math.round(p * state.rentRate / 1000) * 10, state.rentMin); }
  function extLink(href, cls, text) {
    var a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }

  /* ---------- タブ ---------- */
  var TABS = ['shelf', 'consign', 'clean', 'terms'];
  function showTab(name, push) {
    if (TABS.indexOf(name) < 0) name = 'shelf';
    TABS.forEach(function (t) {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('tab-' + t).tabIndex = t === name ? 0 : -1;
      $('panel-' + t).hidden = t !== name;
    });
    if (push) { try { history.replaceState(null, '', name === 'shelf' ? location.pathname : '#' + name); } catch (e) {} }
  }
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab, true); });
    b.addEventListener('keydown', function (e) {
      var i = TABS.indexOf(b.dataset.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        showTab(n, true); $('tab-' + n).focus();
      }
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-goto]');
    if (a) { e.preventDefault(); showTab(a.dataset.goto, true); $('tab-' + a.dataset.goto).scrollIntoView({ block: 'start' }); }
  });
  window.addEventListener('hashchange', function () { showTab(location.hash.slice(1)); });

  /* ---------- 設定の反映 ---------- */
  function renderSettings() {
    var h = R.handle(state.contact) || 'hiuchi2025';
    document.querySelectorAll('[data-contact]').forEach(function (n) { n.textContent = '@' + h; });
    document.querySelectorAll('[data-contact-link]').forEach(function (n) { n.href = 'https://x.com/' + h; });
    var map = { rate: state.feeRate, min: yen(state.feeMin), period: state.period, rrate: state.rentRate, rmin: yen(state.rentMin),
      rmonths: state.rentMonths, credit: state.credit, window: state.creditWindow, share: state.ownerShare, deposit: state.deposit };
    Object.keys(map).forEach(function (k) { document.querySelectorAll('[data-' + k + ']').forEach(function (n) { n.textContent = map[k]; }); });
    if (state.license.trim()) $('license-line').textContent = state.license.trim();
    var open = state.accepting === true;
    document.querySelectorAll('[data-when-open]').forEach(function (n) { n.hidden = !open; });
    document.querySelectorAll('[data-when-closed]').forEach(function (n) { n.hidden = open; });
    renderCalc();
  }
  function renderCalc() {
    var p = Math.max(0, Math.min(10000000, Number($('c-price').value) || 0)), f = fee(p);
    $('c-out-price').textContent = yen(p);
    $('c-out-fee').textContent = '−' + yen(f);
    $('c-out-net').textContent = yen(p - f);
    var m = rentFee(p), paid = m * state.rentMonths;
    var own = Math.round(paid * state.ownerShare / 100), credit = Math.min(p, Math.round(paid * state.credit / 100));
    var price2 = p - credit, sale2 = price2 - fee(price2);
    $('r-month').textContent = yen(m);
    $('r-monthly').textContent = yen(Math.round(m * state.ownerShare / 100));
    $('r-own').textContent = yen(own);
    $('r-credit').textContent = '−' + yen(credit);
    $('r-sale').textContent = yen(sale2);
    $('r-total').textContent = yen(own + sale2);
    $('r-compare').textContent = yen(p - f);
  }

  /* ---------- 棚 ---------- */
  function renderChips() {
    var box = $('type-chips'); box.textContent = '';
    [['all', 'すべて']].concat(Object.keys(TYPES).map(function (k) { return [k, TYPES[k]]; })).forEach(function (p) {
      var b = el('button', 'b chip', p[1]); b.type = 'button';
      b.setAttribute('aria-pressed', String(view.type === p[0]));
      b.addEventListener('click', function () { view.type = p[0]; renderChips(); renderCards(); });
      box.appendChild(b);
    });
  }
  function renderKeyFilter() {
    var sel = $('key-filter'), cur = view.key;
    var keys = Array.from(new Set(listings.map(function (l) { return l.key; }).filter(Boolean))).sort();
    sel.textContent = '';
    var o = el('option', null, 'すべて'); o.value = 'all'; sel.appendChild(o);
    keys.forEach(function (k) { var op = el('option', null, k); op.value = k; sel.appendChild(op); });
    sel.value = keys.indexOf(cur) >= 0 ? cur : 'all'; view.key = sel.value;
  }

  function card(l) {
    var c = el('article', 'card' + (l.status === 'sold' ? ' sold' : ''));
    var top = el('div', 'card-top');
    var info = el('div', 'info');
    var prow = el('div', 'pillrow');
    prow.appendChild(el('span', 'pill ' + l.status, STATUS[l.status]));
    if (l.rent && l.status !== 'sold') prow.appendChild(el('span', 'rentchip', 'レンタル可'));
    info.appendChild(prow);
    if (l.lot) info.appendChild(el('span', 'lot', '受付 ' + l.lot));
    top.appendChild(info);
    var tag = el('div', 'tag');
    tag.appendChild(el('span', 'p', typeof l.price === 'number' ? yen(l.price) : '価格調整中'));
    tag.appendChild(el('span', 'k', l.key || '–'));
    tag.appendChild(el('span', 't', R.TYPES_SHORT[l.type] || 'OTHER'));
    top.appendChild(tag);
    c.appendChild(top);
    c.appendChild(el('h3', 'title', [l.maker, l.model].filter(Boolean).join(' ') || TYPES[l.type]));

    var b = el('div', 'body');
    var dl = el('dl', 'meta');
    function add(k, v) { if (!v) return; dl.appendChild(el('dt', null, k)); var dd = el('dd'); if (v.nodeType) dd.appendChild(v); else dd.textContent = v; dl.appendChild(dd); }
    add('種類', TYPES[l.type]);
    add('素材', l.material);
    var f = document.createDocumentFragment(); f.appendChild(el('span', 'grade', l.cond)); f.appendChild(document.createTextNode(COND[l.cond])); add('状態', f);
    if (l.rent && l.status !== 'sold') add('レンタル', '月' + yen(rentFee(l.price)) + '・最低' + state.rentMonths + 'か月・カード登録制');
    if (l.rent && l.status !== 'sold' && l.rentcond) add('貸出条件', l.rentcond + '（持ち主の指定）');
    if (l.rentals > 0) add('貸出', l.rentals + '回（返却ごとに全工程を清掃）');
    b.appendChild(dl);
    if (l.note) b.appendChild(el('p', 'desc', l.note));

    var checks = Array.isArray(l.checks) ? l.checks.filter(function (k) { return CHECK_LABEL[k]; }) : [];
    if (checks.length || l.cleaned) b.appendChild(el('span', 'stamp', '清掃済' + (l.cleaned ? ' ' + l.cleaned.replace(/-/g, '.') : '')));
    if (checks.length || l.pitch) {
      var d = el('details', 'clean');
      d.appendChild(el('summary', null, '清掃記録を見る'));
      if (checks.length) { var ul = el('ul'); checks.forEach(function (k) { ul.appendChild(el('li', null, CHECK_LABEL[k])); }); d.appendChild(ul); }
      if (l.pitch) d.appendChild(el('p', null, '試奏：' + l.pitch));
      var lk = el('a', null, '清掃基準を見る'); lk.href = '#clean'; lk.dataset.goto = 'clean'; d.appendChild(lk);
      b.appendChild(d);
    }

    var links = el('div', 'links');
    var open = state.accepting === true;
    var pay = R.payUrl(l.pay), rp = R.payUrl(l.rentpay), ph = R.safeUrl(l.photo);
    if (!open && l.status === 'open') links.appendChild(el('span', 'note', '開店準備中のため、まだ購入できません'));
    if (open && l.status === 'open') {
      if (pay) links.appendChild(extLink(pay, 'btn primary', '購入する'));
      else links.appendChild(el('span', 'note', '購入は X @' + (R.handle(state.contact) || 'hiuchi2025') + ' へDMで'));
      if (l.rent) {
        if (rp) links.appendChild(extLink(rp, 'btn rent', '月' + yen(rentFee(l.price)) + 'で借りる'));
        else links.appendChild(el('span', 'note', 'レンタルはDMで'));
      }
    }
    if (ph) links.appendChild(extLink(ph, null, '写真を見る'));
    if (links.childNodes.length) b.appendChild(links);
    c.appendChild(b);
    return c;
  }

  function renderCards() {
    var list = listings.filter(function (l) {
      if (view.type !== 'all' && l.type !== view.type) return false;
      if (view.key !== 'all' && l.key !== view.key) return false;
      if (view.hideSold && l.status === 'sold') return false;
      if (view.rentOnly && !(l.rent && l.status === 'open')) return false;
      return true;
    });
    function pr(l) { return typeof l.price === 'number' ? l.price : null; }
    list.sort(function (a, b) {
      var pa = pr(a), pb = pr(b);
      if (view.sort === 'low') return (pa == null ? Infinity : pa) - (pb == null ? Infinity : pb);
      if (view.sort === 'high') return (pb == null ? -1 : pb) - (pa == null ? -1 : pa);
      return String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id));
    });
    var box = $('cards'); box.textContent = '';
    list.forEach(function (l) { box.appendChild(card(l)); });

    var notSold = listings.filter(function (l) { return l.status !== 'sold'; }).length;
    var sale = listings.filter(function (l) { return l.status === 'open'; }).length;
    var cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    var fresh = listings.filter(function (l) { return l.status !== 'sold' && String(l.date || '') >= cutoff; }).length;
    $('board-open').textContent = sale; $('board-new').textContent = fresh;
    $('board-rent').textContent = listings.filter(function (l) { return l.rent && l.status === 'open'; }).length;
    $('count').textContent = listings.length ? ('取引中を含め ' + notSold + ' 点　これまでの掲載 ' + listings.length + ' 点') : '新入荷は掲載から14日以内の楽器です';

    var empty = $('empty'), s = empty.querySelector('strong'), p = empty.querySelector('p');
    empty.hidden = list.length > 0;
    if (!list.length && listings.length) {
      s.textContent = '条件に合う楽器がありません';
      p.textContent = '種類やキーの絞り込みか、「売約済を隠す」を外してみてください。';
    } else if (!listings.length) {
      s.textContent = 'いまは棚が空です';
      p.textContent = '預かった楽器は清掃と試奏を終えてから並びます。手放したい楽器があれば「楽器を預ける」から。';
    }
  }

  function render() { renderSettings(); renderChips(); renderKeyFilter(); renderCards(); }

  /* ---------- 操作 ---------- */
  $('key-filter').addEventListener('change', function (e) { view.key = e.target.value; renderCards(); });
  $('sort').addEventListener('change', function (e) { view.sort = e.target.value; renderCards(); });
  $('hide-sold').addEventListener('change', function (e) { view.hideSold = e.target.checked; renderCards(); });
  $('rent-only').addEventListener('change', function (e) { view.rentOnly = e.target.checked; renderCards(); });
  $('c-price').addEventListener('input', renderCalc);
  $('copy-tpl').addEventListener('click', function () {
    var text = $('tpl-text').textContent, note = $('copy-note');
    function selectIt() { var r = document.createRange(); r.selectNodeContents($('tpl-text')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); note.textContent = '選択しました。コピーしてください'; note.hidden = false; }
    try { navigator.clipboard.writeText(text).then(function () { note.textContent = 'コピーしました'; note.hidden = false; setTimeout(function () { note.hidden = true; }, 2500); }, selectIt); }
    catch (e) { selectIt(); }
  });

  /* ---------- データ読み込み ---------- */
  function getJSON(path) {
    return fetch(path, { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }
  showTab(location.hash.slice(1));
  render();
  Promise.all([getJSON('data/settings.json'), getJSON('data/listings.json')]).then(function (res) {
    var s = res[0], l = res[1];
    /* 公開前チェックをすり抜けたデータがあっても、表示しない（念のため二重に検査する） */
    if (R.validateSettings(s).length === 0) state = R.withDefaults(s);
    else { state = R.withDefaults(null); console.warn('settings.json に問題があるため、既定の設定で表示しています', R.validateSettings(s)); }
    listings = Array.isArray(l) ? l.filter(function (x) { return R.validateListing(x).length === 0; }) : [];
    if (Array.isArray(l) && listings.length !== l.length) console.warn('問題のある掲載を表示から外しました');
    render();
  }).catch(function () {
    var s = $('empty'); s.hidden = false;
    s.querySelector('strong').textContent = '棚の情報を読み込めませんでした';
    s.querySelector('p').textContent = '時間をおいてページを再読み込みしてください。';
  });
})();
