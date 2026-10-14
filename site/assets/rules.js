/*
 * Siopa Ceoil — 掲載データの定義と検証ルール
 * ブラウザ（サイト・掲載エディタ）と、公開前の自動チェック（scripts/validate.mjs）の両方がこのファイルを使う。
 * ルールを変えるときはここだけを直す。
 */
(function (root) {
  'use strict';

  var TYPES = {
    whistle: 'ティンホイッスル', low: 'ローホイッスル', flute: 'アイリッシュフルート',
    concertina: 'コンサーティーナ', melodeon: 'メロディオン', other: 'その他'
  };
  var TYPES_SHORT = { whistle: 'WHISTLE', low: 'LOW', flute: 'FLUTE', concertina: 'CONCERTINA', melodeon: 'MELODEON', other: 'OTHER' };
  var WIND = ['whistle', 'low', 'flute'];
  var COND = { S: '未使用に近い', A: '目立つ傷なし', B: '使用感あり・演奏に支障なし', C: '要調整・修理前提' };
  var STATUS = { open: '販売中', hold: '取引中', rented: '貸出中', sold: '売約済' };
  var CHECKS = [
    ['disassemble', '分解（外せる部品のみ）'], ['wash', '中性洗剤で洗浄'], ['bore', '管内ブラッシング・スワブ'],
    ['holes', '音孔・トーンホール清掃'], ['windway', 'ウィンドウェイ清掃'], ['ethanol', '歌口のエタノール消毒'],
    ['dry', '24時間以上の自然乾燥'], ['wipe', '木部の拭き取り（水洗いなし）'], ['oil', 'ボアオイル'],
    ['tenon', 'テノン（糸・コルク）点検'], ['pads', 'キー・パッド点検'], ['play', '全音域の試奏'],
    ['tune', 'チューナーでピッチ確認'], ['reethanol', '試奏後の再消毒'], ['seal', '個別に密封して保管'],
    ['handles', 'ボタン・持ち手の消毒'], ['straps', 'ストラップ清掃・交換'], ['interior', '内部の埃除去'],
    ['bellows', '蛇腹の穴・空気漏れ点検'], ['buttons', 'ボタン・パッド・バルブ点検'], ['reeds', '全リード確認（押し引き両方向）'],
    ['airing', '換気・臭いの確認']
  ];
  var CHECK_LABEL = {};
  CHECKS.forEach(function (c) { CHECK_LABEL[c[0]] = c[1]; });
  var WOOD = /木|ウッド|ブラックウッド|グラナディラ|ツゲ|ボックスウッド|ココボロ|エボニー|黒檀|竹/;

  var DEFAULT_SETTINGS = {
    accepting: false, contact: '@hiuchi2025',
    feeRate: 20, feeMin: 1500, period: 90,
    rentRate: 5, rentMin: 1500, rentMonths: 3, credit: 50, creditWindow: 6, ownerShare: 60, deposit: 20,
    license: '',
    tokusho: { seller: '', manager: '', address: '', phone: '', email: '', disclosureOnRequest: true }
  };

  /* ---------- 小さな検査関数 ---------- */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isStr(v, max) { return typeof v === 'string' && v.length <= max; }
  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function isNum(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
  function isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')); }
  function handle(h) { h = String(h || '').trim().replace(/^@/, ''); return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : ''; }
  /* 写真などの外部リンク：https のみ、引用符や空白や山括弧を含まない */
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!/^https:\/\/[^\s"'<>`\\]+$/.test(u) || u.length > 500) return '';
    try { var x = new URL(u); return x.protocol === 'https:' && x.hostname.indexOf('.') > 0 && !x.username && !x.password ? x.href : ''; } catch (e) { return ''; }
  }
  /* 決済リンク：Stripe の支払いリンクだけを通す（なりすましの支払いページへの誘導を防ぐ） */
  function payUrl(u) {
    u = String(u || '').trim();
    return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_\-]{6,120}$/.test(u) ? u : '';
  }
  /* 個人情報らしきもの（メール・電話・郵便番号）を検出：公開データに出品者の情報が紛れ込むのを防ぐ */
  var PII = [
    [/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/, 'メールアドレス'],
    [/(?:\+81[\s\-]?|0)\d{1,4}[\s\-ー－]?\d{1,4}[\s\-ー－]?\d{3,4}(?!\d)/, '電話番号'],
    [/〒?\s?\d{3}[\-ー－]\d{4}(?!\d)/, '郵便番号']
  ];
  function findPII(text) {
    text = String(text || '');
    for (var i = 0; i < PII.length; i++) { if (PII[i][0].test(text)) return PII[i][1]; }
    return '';
  }

  var LISTING_KEYS = ['id', 'lot', 'type', 'key', 'maker', 'model', 'material', 'cond', 'price', 'status', 'pay',
    'rent', 'rentpay', 'rentals', 'consent', 'rentcond', 'cleaned', 'pitch', 'photo', 'note', 'checks', 'date'];
  var FREE_TEXT = ['lot', 'key', 'maker', 'model', 'material', 'rentcond', 'pitch', 'note'];

  /* 1件分の検査。エラーメッセージの配列を返す（空なら合格） */
  function validateListing(l, where) {
    var e = [], w = where || '掲載';
    function bad(msg) { e.push(w + '：' + msg); }
    if (!isObj(l)) { bad('形式が正しくありません'); return e; }
    Object.keys(l).forEach(function (k) { if (LISTING_KEYS.indexOf(k) < 0) bad('知らない項目「' + k + '」があります'); });
    if (!isStr(l.id, 40) || !/^[a-z0-9\-]{1,40}$/.test(l.id)) bad('id は英小文字・数字・ハイフンで40文字以内');
    if (!isStr(l.lot || '', 20)) bad('受付番号は20文字以内');
    if (!TYPES[l.type]) bad('種類が正しくありません');
    if (!isStr(l.key, 20) || !String(l.key).trim()) bad('キーを入れてください（20文字以内）');
    if (!isStr(l.maker || '', 60) || !isStr(l.model || '', 60)) bad('メーカー・モデルは60文字以内');
    if (!isStr(l.material || '', 40)) bad('素材は40文字以内');
    if (!COND[l.cond]) bad('状態は S / A / B / C のどれか');
    if (!(l.price === null || l.price === undefined || isInt(l.price, 0, 10000000))) bad('価格は0〜1000万円の整数か null');
    if (!STATUS[l.status]) bad('掲載状態が正しくありません');
    if (l.pay && !payUrl(l.pay)) bad('支払いリンクは https://buy.stripe.com/ で始まるものだけ使えます');
    if (l.rentpay && !payUrl(l.rentpay)) bad('レンタル用リンクは https://buy.stripe.com/ で始まるものだけ使えます');
    if (l.photo && !safeUrl(l.photo)) bad('写真のURLは https:// で始まるものだけ使えます');
    if (l.rent !== undefined && typeof l.rent !== 'boolean') bad('rent は true か false');
    if (l.rent) {
      if (!isDate(l.consent)) bad('レンタル可にするには、持ち主の同意日（consent）が必要です');
      if (WIND.indexOf(l.type) >= 0 && WOOD.test(l.material || '')) bad('木製の笛はレンタルできません（清掃基準 11）');
    } else if (l.rentpay) bad('レンタル可でない品にレンタル用リンクがあります');
    if (l.rentals !== undefined && !isInt(l.rentals, 0, 999)) bad('貸出回数は0以上の整数');
    if (l.consent && !isDate(l.consent)) bad('同意日は YYYY-MM-DD');
    if (!isStr(l.rentcond || '', 120)) bad('レンタル条件は120文字以内');
    if (l.cleaned && !isDate(l.cleaned)) bad('清掃日は YYYY-MM-DD');
    if (!isDate(l.date)) bad('掲載日（date）は YYYY-MM-DD');
    if (!isStr(l.pitch || '', 160)) bad('試奏の記録は160文字以内');
    if (!isStr(l.note || '', 600)) bad('説明は600文字以内');
    if (l.checks !== undefined) {
      if (!Array.isArray(l.checks) || l.checks.length > CHECKS.length) bad('清掃のチェックが正しくありません');
      else l.checks.forEach(function (c) { if (!CHECK_LABEL[c]) bad('知らない清掃項目「' + c + '」'); });
    }
    FREE_TEXT.forEach(function (k) {
      var hit = findPII(l[k]);
      if (hit) bad('「' + k + '」に' + hit + 'らしきものがあります。出品者の個人情報は公開データに入れないでください');
    });
    return e;
  }

  function validateListings(list) {
    var e = [];
    if (!Array.isArray(list)) return ['listings.json は配列（[ ... ]）にしてください'];
    if (list.length > 500) e.push('掲載は500件までです');
    var seen = {};
    list.forEach(function (l, i) {
      var w = (l && l.lot ? l.lot : (i + 1) + '件目');
      e = e.concat(validateListing(l, w));
      if (l && l.id) { if (seen[l.id]) e.push(w + '：id「' + l.id + '」が重複しています'); seen[l.id] = 1; }
    });
    return e;
  }

  function validateSettings(s) {
    var e = [];
    function bad(msg) { e.push('settings.json：' + msg); }
    if (!isObj(s)) return ['settings.json の形式が正しくありません'];
    var known = Object.keys(DEFAULT_SETTINGS);
    Object.keys(s).forEach(function (k) { if (known.indexOf(k) < 0) bad('知らない項目「' + k + '」があります'); });
    if (typeof s.accepting !== 'boolean') bad('accepting は true か false');
    if (!handle(s.contact)) bad('contact はXのアカウント（@英数字）');
    if (!isNum(s.feeRate, 0, 100) || !isInt(s.feeMin, 0, 1000000) || !isInt(s.period, 1, 3650)) bad('手数料・掲載期間の値が範囲外です');
    if (!isNum(s.rentRate, 0, 100) || !isInt(s.rentMin, 0, 1000000) || !isInt(s.rentMonths, 1, 60)) bad('レンタル料の値が範囲外です');
    if (!isNum(s.credit, 0, 100) || !isInt(s.creditWindow, 1, 60) || !isNum(s.ownerShare, 0, 100) || !isNum(s.deposit, 0, 100)) bad('レンタルの配分・保証金の値が範囲外です');
    if (!isStr(s.license, 200)) bad('license は200文字以内');
    var t = s.tokusho;
    if (!isObj(t)) bad('tokusho（特定商取引法の表記）がありません');
    else {
      ['seller', 'manager', 'address', 'phone', 'email'].forEach(function (k) { if (!isStr(t[k], 200)) bad('tokusho.' + k + ' は200文字以内の文字列'); });
      if (typeof t.disclosureOnRequest !== 'boolean') bad('tokusho.disclosureOnRequest は true か false');
      Object.keys(t).forEach(function (k) { if (['seller', 'manager', 'address', 'phone', 'email', 'disclosureOnRequest'].indexOf(k) < 0) bad('tokusho に知らない項目「' + k + '」があります'); });
    }
    /* 開店（受付・販売の開始）の条件：許可番号と特定商取引法の表記がそろっていること */
    if (s.accepting === true) {
      if (!s.license || !/許可/.test(s.license) || !/\d{6,}/.test(s.license)) bad('開店（accepting: true）するには、古物商許可の番号を license に入れてください');
      if (isObj(t)) {
        if (!String(t.seller || '').trim() || !String(t.manager || '').trim()) bad('開店するには tokusho.seller（販売業者）と tokusho.manager（運営責任者）が必要です');
        if (!String(t.email || '').trim()) bad('開店するには tokusho.email（連絡先メール）が必要です');
        if (!t.disclosureOnRequest && (!String(t.address || '').trim() || !String(t.phone || '').trim())) bad('住所と電話番号を載せない場合は disclosureOnRequest を true にしてください');
      }
    }
    return e;
  }

  function withDefaults(s) {
    var out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (isObj(s)) Object.keys(out).forEach(function (k) {
      if (k === 'tokusho') { if (isObj(s.tokusho)) Object.keys(out.tokusho).forEach(function (t) { if (s.tokusho[t] !== undefined) out.tokusho[t] = s.tokusho[t]; }); }
      else if (s[k] !== undefined && typeof s[k] === typeof out[k]) out[k] = s[k];
    });
    return out;
  }

  root.SiopaRules = {
    TYPES: TYPES, TYPES_SHORT: TYPES_SHORT, WIND: WIND, COND: COND, STATUS: STATUS, CHECKS: CHECKS, CHECK_LABEL: CHECK_LABEL,
    WOOD: WOOD, DEFAULT_SETTINGS: DEFAULT_SETTINGS, LISTING_KEYS: LISTING_KEYS,
    handle: handle, safeUrl: safeUrl, payUrl: payUrl, findPII: findPII, isDate: isDate,
    validateListing: validateListing, validateListings: validateListings, validateSettings: validateSettings, withDefaults: withDefaults
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
