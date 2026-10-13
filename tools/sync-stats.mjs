// 使い方：node tools/sync-stats.mjs [--check | --no-screenshot]
// 日本語の統計ブロックと参照対照表を更新する。検査時はファイルを変更しない。
import { writeFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, read, loadSections, collectStats } from './lib/book.mjs';
const check = process.argv.includes('--check');
const stats = collectStats(loadSections().sections);
const readmeBlock = [
  '<!-- stats:start -->',
  '| 収録内容 | 数 |', '| --- | ---: |',
  `| 章 | ${stats.chapters} |`, `| 助言 | ${stats.entries} |`,
  `| 根拠A | ${stats.grade.A} |`, `| 根拠B | ${stats.grade.B} |`, `| 根拠C | ${stats.grade.C} |`,
  `| 出典URL（重複を除く） | ${stats.sources} |`, `| 外国籍の方に固有の助言 | ${stats.foreigners} |`,
  '<!-- stats:end -->',
].join('\n');
const ogBlock = [
  '<!-- stats:start -->',
  `<p class="numbers"><strong>${stats.chapters}</strong>章 <span>／</span> <strong>${stats.entries}</strong>の助言</p>`,
  `<p class="sources">公的な制度と一次資料を確認 · 出典${stats.sources}件</p>`,
  '<!-- stats:end -->',
].join('\n');
const updated = new Map();
const pattern = /<!-- stats:start -->[\s\S]*?<!-- stats:end -->/;
for (const [path, block] of [['README.md', readmeBlock], ['tools/og.html', ogBlock]]) {
  const text = read(path);
  if (!pattern.test(text)) throw new Error(`${path}に統計ブロックの目印がありません。`);
  const next = text.replace(pattern, () => block);
  if (next !== text) updated.set(path, next);
}
console.log(`本文${stats.chapters}章、${stats.entries}項目。根拠A：${stats.grade.A}、B：${stats.grade.B}、C：${stats.grade.C}。`);
if (check) {
  if (updated.size) { console.error(`統計の更新が必要です：${[...updated.keys()].join('、')}`); process.exit(1); }
  console.log('統計は本文と一致しています。');
  process.exit(0);
}
const run = (file, args = []) => {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'tools', file), ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${file}の確認に失敗しました。`);
};
run('check-plain.mjs');
run('check-refs.mjs');
for (const [path, text] of updated) writeFileSync(resolve(ROOT, path), text);
if (process.argv.includes('--no-screenshot')) process.exit(0);
const candidates = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const chrome = candidates.find(path => path && existsSync(path));
if (!chrome) throw new Error('Chromeが見つかりません。CHROMEを指定するか、--no-screenshotを使ってください。');
const profile = mkdtempSync(join(tmpdir(), 'handbook-jp-cover-'));
const output = resolve(ROOT, 'og.png');
const started = Date.now();
// 表紙だけを一時的に配信する。外部のインターフェイスや任意のファイルは公開しない。
const cover = read('tools/og.html');
const server = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/og.html') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ページがありません。');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(cover);
});
try {
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const url = `http://127.0.0.1:${server.address().port}/og.html`;
  const result = await new Promise((accept, reject) => {
    const child = spawn(chrome, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--user-data-dir=${profile}`, `--screenshot=${output}`, url], { stdio: 'ignore' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', status => { clearTimeout(timer); accept({ status, timedOut }); });
  });
  if (result.timedOut) throw new Error('表紙の生成が30秒以内に完了しませんでした。--no-screenshotで本文の統計だけを更新し、表紙は別に生成してください。');
  if (result.status !== 0 || !existsSync(output) || statSync(output).mtimeMs < started - 1000) throw new Error('表紙の画像を生成できませんでした。CHROMEを確認するか、--no-screenshotで統計だけを更新してください。');
} finally {
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  rmSync(profile, { recursive: true, force: true });
}
console.log('日本語の表紙画像 og.png を生成しました。');
