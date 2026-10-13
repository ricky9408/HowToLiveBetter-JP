// 使い方：node tools/offline/build.mjs [出力先]
// 本文と長文をHTMLに埋め込み、保存したファイルを通信なしで読む。
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT, REPO, SITE, ARTIFACT, read, loadSections } from '../lib/book.mjs';
const out = resolve(ROOT, process.argv[2] ?? `dist/${ARTIFACT}.html`);
const { readme, bookFiles, allDocFiles } = loadSections();
const corpus = { readme, parts: bookFiles.map(path => ({ path, md: read(path) })), docs: allDocFiles.map(path => ({ path, md: read(path) })) };
const json = JSON.stringify(corpus).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
let html = read('index.html');
const marker = '<!-- 本文を読むスクリプト -->';
if (!html.includes(marker)) throw new Error('index.htmlに本文を読むスクリプトの目印がありません。');
const externalStyle = [...html.matchAll(/<link\b[^>]*>/gi)].some(match => /rel=["']stylesheet["']/i.test(match[0]) && /href=["']https?:/i.test(match[0]));
if (/<script[^>]+src=|googletagmanager|google-analytics/i.test(html) || externalStyle) throw new Error('オフライン版に外部スクリプトや外部スタイルを含められません。');
html = html.replace(marker, `<script>window.__CORPUS__=${json};</script>\n${marker}`)
  .replaceAll('href="./"', 'href="#main"')
  .replaceAll('href="README.md"', `href="${REPO}/blob/main/README.md"`)
  .replaceAll('href="selfcheck.html"', `href="${SITE}selfcheck.html"`)
  .replaceAll('href="book/"', `href="${REPO}/tree/main/book"`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}を生成しました。本文${bookFiles.length}章、文書${allDocFiles.length}本です。`);
