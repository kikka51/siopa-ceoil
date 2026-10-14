#!/usr/bin/env node
/*
 * 公開前チェック。GitHub Actions が公開の前に必ず実行し、1つでも問題があれば公開を止める。
 * 手元で試すとき： node scripts/validate.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = join(ROOT, 'site');
const errors = [];
const fail = (msg) => errors.push(msg);

/* ルールはサイトと同じ rules.js を使う */
const ctx = { URL };
ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(join(SITE, 'assets/rules.js'), 'utf8'), ctx, { filename: 'rules.js' });
const R = ctx.SiopaRules;

function readJSON(rel) {
  try { return JSON.parse(readFileSync(join(SITE, rel), 'utf8')); }
  catch (e) { fail(`${rel} を読めません（JSONの書き方を確認してください）：${e.message}`); return undefined; }
}

/* 1. 掲載データと設定 */
const settings = readJSON('data/settings.json');
const listings = readJSON('data/listings.json');
if (settings !== undefined) R.validateSettings(settings).forEach(fail);
if (listings !== undefined) R.validateListings(listings).forEach(fail);
if (settings && settings.accepting !== true && Array.isArray(listings)) {
  /* 開店前はリンクがあっても表示しないが、念のため知らせる（エラーにはしない） */
  const withPay = listings.filter((l) => l && (l.pay || l.rentpay)).length;
  if (withPay) console.log(`メモ：開店準備中のため、支払いリンクのある ${withPay} 件はボタンを表示しません`);
}

/* 2. 公開ファイルの種類：想定外のファイル（設定ファイルや下書き）を公開しない */
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.json', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '']);
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(SITE);
for (const f of files) {
  const rel = relative(SITE, f);
  const base = rel.split('/').pop();
  if (!ALLOWED_EXT.has(extname(f).toLowerCase())) fail(`公開しない種類のファイルがあります：site/${rel}`);
  if (base.startsWith('.') && base !== '.nojekyll') fail(`隠しファイルは公開しません：site/${rel}`);
  if (statSync(f).size > 2 * 1024 * 1024) fail(`2MBを超えるファイルがあります：site/${rel}`);
}

/* 3. HTMLの安全確認：CSP、インラインスクリプト、イベント属性、外部リンク */
for (const f of files.filter((p) => p.endsWith('.html'))) {
  const rel = 'site/' + relative(SITE, f);
  const html = readFileSync(f, 'utf8');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  if (!csp) fail(`${rel}：Content-Security-Policy がありません`);
  else {
    const c = csp[1];
    if (!/script-src 'self'(;|$)/.test(c)) fail(`${rel}：script-src は 'self' だけにしてください`);
    if (/unsafe-inline|unsafe-eval|\*/.test(c)) fail(`${rel}：CSP に unsafe-inline / unsafe-eval / * は使えません`);
    if (!/object-src 'none'/.test(c) || !/base-uri 'none'/.test(c)) fail(`${rel}：CSP に object-src 'none' と base-uri 'none' が必要です`);
  }
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc="[^"]+"/.test(m[1])) fail(`${rel}：インラインスクリプトは使えません`);
    else if (/\bsrc="(https?:)?\/\//.test(m[1])) fail(`${rel}：外部のスクリプトは読み込まない方針です`);
  }
  if (/\son[a-z]+\s*=/i.test(html)) fail(`${rel}：onclick などのイベント属性は使えません`);
  if (/\sstyle="/i.test(html)) fail(`${rel}：style 属性は使えません（CSPで止まります）`);
  if (/(?:href|src)="http:\/\//i.test(html)) fail(`${rel}：http:// のリンクがあります（https:// にしてください）`);
  if (/href="javascript:/i.test(html)) fail(`${rel}：javascript: のリンクは使えません`);
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    if (!/rel="[^"]*noopener[^"]*noreferrer|rel="[^"]*noreferrer[^"]*noopener/.test(m[0])) fail(`${rel}：新しいタブで開くリンクには rel="noopener noreferrer" が必要です`);
  }
}

/* 4. 秘密情報の混入：Stripeの秘密鍵などをリポジトリに置かない */
const SECRET = /(sk|rk)_(live|test)_[0-9A-Za-z]{10,}|whsec_[0-9A-Za-z]{10,}|ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
function walkRepo(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === '.git' || name === 'node_modules') return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walkRepo(p) : [p];
  });
}
for (const f of walkRepo(ROOT)) {
  if (statSync(f).size > 2 * 1024 * 1024) continue;
  const text = readFileSync(f, 'utf8');
  if (SECRET.test(text)) fail(`${relative(ROOT, f)}：秘密鍵やトークンらしき文字列があります。すぐに削除し、Stripe／GitHub側で無効化してください`);
}

if (errors.length) {
  console.error(`公開前チェックで ${errors.length} 件の問題が見つかったため、公開を止めました：\n`);
  errors.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`公開前チェック OK（掲載 ${Array.isArray(listings) ? listings.length : 0} 件／${settings && settings.accepting ? '営業中' : '開店準備中'}）`);
