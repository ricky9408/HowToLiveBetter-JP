// 使い方：node tools/check-links.mjs [--limit 件数]
// 確実な失効は失敗として扱い、接続できない場合は別に報告する。
import { appendFileSync } from 'node:fs';
import { loadSections, read, unique, REPO, SITE, extractSourceUrls } from './lib/book.mjs';
const { sections, docFiles } = loadSections();
const where = new Map();
for (const section of sections) for (const entry of section.entries) for (const url of entry.sources) if (!where.has(url)) where.set(url, `${section.path}：第${entry.n}項`);
for (const path of [...docFiles, 'README.md']) {
  const text = read(path);
  const urls = extractSourceUrls(text);
  for (const url of urls) {
    if (url.startsWith(REPO) || url.startsWith(SITE) || /^https?:\/\/github\.com\/eternity4719\/HowToLiveBetter(?:\/|$)/.test(url)) continue;
    if (!where.has(url)) where.set(url, path);
  }
}
const position = process.argv.indexOf('--limit');
const limit = position < 0 ? Infinity : Number(process.argv[position + 1]);
if (!(limit > 0)) throw new Error('--limitには正の件数を指定してください。');
const urls = unique([...where.keys()]).slice(0, limit);
const dead = [], uncertain = [];
let next = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    try {
      const doi = /^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i.exec(url);
      const target = doi ? `https://doi.org/api/handles/${encodeURIComponent(decodeURIComponent(doi[1]))}` : url;
      const response = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'HowToLiveBetter-JP link checker', Accept: 'text/html,application/json,*/*' } });
      let invalid = [404, 410].includes(response.status);
      if (doi && response.ok) invalid = (await response.json()).responseCode === 100;
      else await response.body?.cancel();
      if (invalid) dead.push({ url, reason: doi ? 'DOIの登録がありません' : `HTTP ${response.status}` });
      else if (!response.ok) uncertain.push({ url, reason: `HTTP ${response.status}` });
    } catch (error) { uncertain.push({ url, reason: error.cause?.code ?? error.name }); }
  }
}
await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
const rows = items => items.sort((a, b) => a.url.localeCompare(b.url)).map(item => `- ${where.get(item.url)}：${item.reason} <${item.url}>`);
const summary = [
  '## 出典リンクの確認', '',
  `${urls.length}件を確認しました。失効${dead.length}件、接続を確認できなかったリンク${uncertain.length}件です。`, '',
  '### 失効が確認されたリンク', '', ...(dead.length ? rows(dead) : ['該当なし']), '',
  '### 接続を確認できなかったリンク', '', ...(uncertain.length ? rows(uncertain) : ['該当なし']), '',
  '接続失敗には時間切れ、アクセス制限、証明書の問題も含まれます。元のページを別の方法で確認してください。', '',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exitCode = dead.length ? 1 : 0;
