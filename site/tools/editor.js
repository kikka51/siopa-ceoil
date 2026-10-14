/*
 * 掲載エディタ：listings.json の中身をフォームで作るための道具。
 * このページは何も保存・送信しない。できあがったJSONをコピーして、GitHub上の listings.json に貼り付けて保存する。
 */
(function () {
  'use strict';
  var R = window.SiopaRules;
  var REPO_EDIT = 'https://github.com/kikka51/siopa-ceoil/edit/main/site/data/listings.json';
  var DRAFT_KEY = 'siopa-editor-draft-v1';
  var list = [], editingId = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(list)); } catch (e) {} }
  function loadDraft() { try { var v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  /* 種類と状態の選択肢、清掃チェックを組み立てる */
  Object.keys(R.TYPES).forEach(function (k) { var o = el('option', null, R.TYPES[k]); o.value = k; $('f-type').appendChild(o); });
  Object.keys(R.COND).forEach(function (k) { var o = el('option', null, k + ' ' + R.COND[k]); o.value = k; $('f-cond').appendChild(o); });
  Object.keys(R.STATUS).forEach(function (k) { var o = el('option', null, R.STATUS[k]); o.value = k; $('f-status').appendChild(o); });
  R.CHECKS.forEach(function (c) {
    var lb = el('label'); var cb = el('input'); cb.type = 'checkbox'; cb.value = c[0]; cb.id = 'chk-' + c[0];
    lb.appendChild(cb); lb.appendChild(document.createTextNode(c[1])); $('f-checks').appendChild(lb);
  });

  var TEXT = ['lot', 'type', 'key', 'maker', 'model', 'material', 'cond', 'price', 'status', 'pay', 'rentpay', 'rentals', 'consent', 'rentcond', 'cleaned', 'pitch', 'photo', 'note'];
  var DEF = { type: 'whistle', cond: 'A', status: 'open' };

  function nextLot() {
    var n = 0; list.forEach(function (l) { var m = /(\d+)$/.exec(l.lot || ''); if (m) n = Math.max(n, +m[1]); });
    return 'YZ-' + String(n + 1).padStart(4, '0');
  }
  function fill(l) {
    TEXT.forEach(function (k) { $('f-' + k).value = l && l[k] != null ? l[k] : (DEF[k] || ''); });
    $('f-rent').checked = !!(l && l.rent);
    var on = l && Array.isArray(l.checks) ? l.checks : [];
    $('f-checks').querySelectorAll('input').forEach(function (cb) { cb.checked = on.indexOf(cb.value) >= 0; });
    if (!l) $('f-lot').value = nextLot();
    $('form-title').textContent = l ? '掲載を編集する（' + (l.lot || l.id) + '）' : '楽器を掲載する';
    $('f-submit').textContent = l ? 'この内容で更新' : '一覧に追加';
    $('f-cancel').hidden = !l;
    $('f-error').textContent = '';
  }
  function readForm() {
    var pr = $('f-price').value.trim();
    var rent = $('f-rent').checked;
    var item = {
      lot: $('f-lot').value.trim(), type: $('f-type').value, key: $('f-key').value.trim(),
      maker: $('f-maker').value.trim(), model: $('f-model').value.trim(), material: $('f-material').value.trim(),
      cond: $('f-cond').value, price: pr === '' ? null : Math.round(Number(pr)), status: $('f-status').value,
      pay: $('f-pay').value.trim(), rent: rent,
      rentpay: rent ? $('f-rentpay').value.trim() : '', rentals: Math.max(0, parseInt($('f-rentals').value, 10) || 0),
      consent: rent ? $('f-consent').value : '', rentcond: rent ? $('f-rentcond').value.trim() : '',
      cleaned: $('f-cleaned').value, pitch: $('f-pitch').value.trim(), photo: $('f-photo').value.trim(), note: $('f-note').value.trim(),
      checks: Array.from($('f-checks').querySelectorAll('input:checked')).map(function (cb) { return cb.value; })
    };
    /* 空の項目は出力から省く */
    Object.keys(item).forEach(function (k) { if (item[k] === '' || (Array.isArray(item[k]) && !item[k].length)) delete item[k]; });
    if (!item.rent) delete item.rent;
    if (!item.rentals) delete item.rentals;
    return item;
  }

  function renderList() {
    var box = $('list'); box.textContent = '';
    if (!list.length) box.appendChild(el('p', 'note', 'まだ掲載がありません。下のフォームから追加してください。'));
    list.forEach(function (l) {
      var row = el('div', 'erow');
      var name = [l.maker, l.model].filter(Boolean).join(' ') || R.TYPES[l.type];
      row.appendChild(el('span', 'mono', l.lot || l.id));
      row.appendChild(el('span', 'ename', name + '（' + (l.key || '') + '）'));
      row.appendChild(el('span', 'pill ' + l.status, R.STATUS[l.status] || l.status));
      var errs = R.validateListing(l, l.lot || l.id);
      if (errs.length) row.appendChild(el('span', 'warnline', '要修正 ' + errs.length + '件'));
      var eb = el('button', 'b', '編集'); eb.type = 'button'; eb.addEventListener('click', function () { editingId = l.id; fill(l); $('form').scrollIntoView({ block: 'start' }); });
      var db = el('button', 'b danger', '削除'); db.type = 'button';
      var t;
      db.addEventListener('click', function () {
        if (!db.classList.contains('armed')) { db.classList.add('armed'); db.textContent = 'もう一度押すと削除'; t = setTimeout(function () { db.classList.remove('armed'); db.textContent = '削除'; }, 3500); return; }
        clearTimeout(t); list = list.filter(function (x) { return x.id !== l.id; }); if (editingId === l.id) { editingId = null; fill(null); } changed();
      });
      row.appendChild(eb); row.appendChild(db);
      box.appendChild(row);
    });
  }
  function renderOutput() {
    var errs = R.validateListings(list);
    $('out').value = JSON.stringify(list, null, 2) + '\n';
    var st = $('out-status'); st.textContent = '';
    if (errs.length) {
      st.className = 'ng';
      st.appendChild(el('h4', null, 'このままでは公開されません（' + errs.length + '件）'));
      var ul = el('ul'); errs.slice(0, 20).forEach(function (m) { ul.appendChild(el('li', null, m)); }); st.appendChild(ul);
    } else {
      st.className = 'ok';
      st.appendChild(el('h4', null, '公開前チェックに通る内容です'));
      st.appendChild(el('p', null, '下のJSONをコピーして、GitHubの listings.json の中身と丸ごと入れ替えて保存してください。1〜2分でサイトに反映されます。'));
    }
  }
  function changed() { saveDraft(); renderList(); renderOutput(); }

  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var item = readForm();
    if (editingId) {
      var old = list.find(function (x) { return x.id === editingId; });
      item.id = old.id; item.date = old.date;
    } else {
      var base = String(item.lot || '').toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      item.id = base && !list.some(function (x) { return x.id === base; }) ? base : 'i' + Date.now().toString(36);
      item.date = today();
    }
    var errs = R.validateListing(item, item.lot || '入力内容');
    if (errs.length) { $('f-error').textContent = errs.join(' ／ '); return; }
    /* 項目の並びをそろえて出力を読みやすくする */
    var ordered = {}; R.LISTING_KEYS.forEach(function (k) { if (item[k] !== undefined) ordered[k] = item[k]; });
    if (editingId) list = list.map(function (x) { return x.id === editingId ? ordered : x; });
    else list.push(ordered);
    editingId = null; fill(null); changed();
  });
  $('f-cancel').addEventListener('click', function () { editingId = null; fill(null); });
  $('copy-out').addEventListener('click', function () {
    var t = $('out'), note = $('copy-note');
    function sel() { t.focus(); t.select(); note.textContent = '選択しました。コピーしてください'; note.hidden = false; }
    try { navigator.clipboard.writeText(t.value).then(function () { note.textContent = 'コピーしました'; note.hidden = false; }, sel); } catch (e) { sel(); }
  });
  $('reset').addEventListener('click', function () {
    var b = $('reset');
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'もう一度押すと、公開中の内容に戻します'; setTimeout(function () { b.classList.remove('armed'); b.textContent = '下書きを捨てて公開中の内容に戻す'; }, 3500); return; }
    clearDraft(); load(true);
  });
  $('gh-link').href = REPO_EDIT;

  function load(ignoreDraft) {
    fetch('../data/listings.json', { cache: 'no-cache', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (pub) {
        var d = ignoreDraft ? null : loadDraft();
        list = d || (Array.isArray(pub) ? pub : []);
        $('draft-note').hidden = !d;
        editingId = null; fill(null); renderList(); renderOutput();
      })
      .catch(function () { list = loadDraft() || []; fill(null); renderList(); renderOutput(); });
  }
  load(false);
})();
