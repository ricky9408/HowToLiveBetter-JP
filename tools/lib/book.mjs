// 日本語版の本文解析と書き出しに共通する定義。
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO = 'https://github.com/ricky9408/HowToLiveBetter-JP';
export const SITE = 'https://ricky9408.github.io/HowToLiveBetter-JP/';
export const TITLE = '日本でよりよく暮らすためのガイド';
export const RELEASE = `${REPO}/releases/download/epub-latest`;
export const ARTIFACT = 'HowToLiveBetter-JP';
export const read = (path, root = ROOT) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
export const unique = values => [...new Set(values)];
export const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const headingId = value => value.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');

// HTMLの画面へ案内するリンクは、ソース表示ではなく公開ページを使う。
export function publishedPageHref(path, hash = '') {
  let suffix;
  try { suffix = hash ? `#${encodeURIComponent(decodeURIComponent(hash))}` : ''; }
  catch { return null; }
  if (path === 'index.html') return SITE + suffix;
  if (path === 'selfcheck.html') return `${SITE}selfcheck.html${suffix}`;
  return null;
}

// 復習カードの参照先は公開サイトへ変換する。実行可能なURIは受け付けない。
export function onlineReference(href, sourcePath, sections = []) {
  if (/[\u0000-\u0020\\]/u.test(href) || href.startsWith('//')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    try { const url = new URL(href); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }
  const [path, hash = ''] = href.split('#');
  let target, decodedHash;
  try {
    target = path ? posix.normalize(posix.join(posix.dirname(sourcePath), decodeURIComponent(path))) : sourcePath;
    decodedHash = decodeURIComponent(hash);
  }
  catch { return null; }
  if (target.startsWith('../') || posix.isAbsolute(target)) return null;
  const screen = publishedPageHref(target, hash);
  if (screen) return screen;
  const chapter = /^book\/(\d{2})-[^/]+\.md$/.exec(target);
  if (chapter) {
    const number = Number(chapter[1]);
    const section = sections.find(section => section.section === number);
    let anchor = '';
    if (hash) {
      const id = decodedHash;
      const entry = section?.entries.find(entry => headingId(`${entry.n}. ${entry.title}`) === id);
      anchor = entry ? `#e-${number}-${entry.n}` : /^e-\d+-\d+$/.test(id) ? `#${id}` : `#sec-${number}`;
    }
    return `${SITE}?chapter=${number}${anchor}`;
  }
  if (target === 'README.md') return SITE;
  return `${REPO}/blob/main/${encodeURI(target)}${hash ? '#' + encodeURIComponent(decodedHash) : ''}`;
}

// Markdownリンクの括弧をたどり、DOIに含まれる括弧も保持する。
export function extractSourceUrls(text) {
  const urls = [...text.matchAll(/<(https?:\/\/[^>\s]+)>/g)].map(match => match[1]);
  for (const match of text.matchAll(/\]\((https?:\/\/)/g)) {
    const start = match.index + 2;
    let end = start, depth = 0;
    while (end < text.length) {
      const char = text[end];
      if (/\s/.test(char)) break;
      if (char === '(') depth++;
      if (char === ')') { if (!depth) break; depth--; }
      end++;
    }
    if (!depth && end > start) urls.push(text.slice(start, end));
  }
  return unique(urls);
}

export function gitCommit() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `未コミット変更あり（基準：${commit.slice(0, 7)}）` : commit;
  }
  catch { return process.env.GITHUB_SHA ?? ''; }
}
export function buildStamp() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
}
export function stripBackLink(md) {
  return md.replace(/^\[← 総目次に戻る\]\(\.\.\/README\.md\)\n\n/, '');
}

// 見出しの文言に依存せず、READMEにある相対リンクを読み取る。
export function readBook(root = ROOT) {
  const readme = read('README.md', root);
  const links = [...readme.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)].map(match => decodeURIComponent(match[1]));
  const bookFiles = unique(links.filter(path => /^book\/\d{2}-.+\.md$/.test(path))).sort((a, b) => Number(a.slice(5, 7)) - Number(b.slice(5, 7)));
  const allDocFiles = unique(links.filter(path => /^docs\/.+\.md$/.test(path)));
  const docFiles = allDocFiles.filter(path => path !== 'docs/参照対照.md');
  if (!bookFiles.length) throw new Error('READMEの目次に本文ファイルがありません。');
  const onDisk = readdirSync(resolve(root, 'book')).filter(path => /^\d{2}-.+\.md$/.test(path)).map(path => `book/${path}`).sort();
  const missing = onDisk.filter(path => !bookFiles.includes(path));
  if (missing.length) throw new Error(`READMEの目次にない本文：${missing.join('、')}`);
  const description = readme.split('\n').slice(1).find(line => line.trim() && !/^\s*[<#\[|]/.test(line))?.trim() ?? TITLE;
  const contentsMd = `# 章の一覧\n\n${bookFiles.map((path, index) => {
    const caption = path.replace(/^book\/\d{2}-/, '').replace(/\.md$/, '');
    return `${index + 1}. [${caption}](${path})`;
  }).join('\n')}`;
  const contentsStart = readme.search(/^## 目次\s*$/m);
  const introduction = contentsStart < 0 ? readme : readme.slice(0, contentsStart);
  const frontMd = introduction.replace(/^# .+\n/, '').trim();
  return { readme, description, frontMd, contentsMd, bookFiles, docFiles, allDocFiles };
}

export const TAG_VALUES = {
  お金: ['0', '少', '多'], 時間: ['少', '中', '多'], 継続: ['不要', '少し', '必要'],
  効果: ['大', '中', '小'], 分野: ['健康', 'お金', '時間', '権利'], 対象: ['外国籍'],
};
export const FIELDS = ['費用', '要点', '効果', '根拠の区分', '出典', '補足'];
export const COST_W = {
  money: { '0': 0, 少: 1, 多: 2 }, time: { 少: 0, 中: 1, 多: 2 }, continuation: { 不要: 0, 少し: 1, 必要: 2 },
};
export function ratioOf(cost, level) {
  if (level === '大') return cost === 0 ? '非常に高い' : cost <= 2 ? '高い' : '通常';
  return level === '中' && cost === 0 ? '高い' : '通常';
}

export function parseEntries(md, { path = '本文', strict = true } = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const head = lines[2]?.match(/^# (\d+)\. (.+)$/);
  const errors = [];
  if (lines[0] !== '[← 総目次に戻る](../README.md)' || lines[1] !== '' || !head) errors.push('冒頭を戻りリンク、空行、「# N. 章名」の順にしてください。');
  const section = head ? Number(head[1]) : 0;
  const title = head?.[2] ?? '';
  const entries = [];
  let current;
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^### (\d+)\. (.+)$/);
    if (h) {
      current = { section, n: Number(h[1]), title: h[2], line: i + 1, fields: {}, meta: {} };
      entries.push(current);
      if (!/^<!-- 費用タグ: .+ -->$/.test(lines[i + 1] ?? '')) errors.push(`${i + 1}行：項目の直後に費用タグがありません。`);
      continue;
    }
    if (!current) continue;
    const tag = line.match(/^<!-- 費用タグ: (.+) -->$/);
    if (tag) {
      if (Object.keys(current.meta).length) errors.push(`${i + 1}行：費用タグが重複しています。`);
      for (const token of tag[1].split(/\s+/)) {
        const [key, value, extra] = token.split('=');
        if (extra != null || !TAG_VALUES[key]?.includes(value)) errors.push(`${i + 1}行：費用タグの値が不正です（${token}）。`);
        if (Object.hasOwn(current.meta, key)) errors.push(`${i + 1}行：費用タグのキーが重複しています（${key}）。`);
        current.meta[key] = value;
      }
      continue;
    }
    const field = line.match(/^- ([^：]+)：(.*)$/);
    if (field) {
      const [, name, value] = field;
      if (!FIELDS.includes(name)) errors.push(`${i + 1}行：未定義の欄です（${name}）。`);
      if (Object.hasOwn(current.fields, name)) errors.push(`${i + 1}行：欄が重複しています（${name}）。`);
      current.fields[name] = value.trim();
      continue;
    }
    if (line.trim()) errors.push(`${i + 1}行：項目内の未定義の行です。欄の内容は同じ行に記載してください。`);
  }
  if (!entries.length) errors.push('項目がありません。');
  entries.forEach((entry, index) => {
    const at = `${entry.line}行・第${entry.n}項`;
    if (entry.n !== index + 1) errors.push(`${at}：項目番号は1から連続させてください。`);
    for (const key of Object.keys(TAG_VALUES).filter(key => key !== '対象')) if (!entry.meta[key]) errors.push(`${at}：費用タグの${key}がありません。`);
    for (const name of FIELDS) if (!entry.fields[name]) errors.push(`${at}：${name}欄がありません。`);
    if (!/^[ABC]$/.test(entry.fields['根拠の区分'] ?? '')) errors.push(`${at}：根拠の区分はA、B、Cのいずれかです。`);
    entry.sources = [...(entry.fields.出典 ?? '').matchAll(/<(https?:\/\/[^>\s]+)>/g)].map(match => match[1]);
    if (!entry.sources.length) errors.push(`${at}：出典欄に「<https://...>」形式の出典がありません。`);
    for (const source of entry.sources) { try { new URL(source); } catch { errors.push(`${at}：出典のURLが不正です。`); } }
    entry.cost = COST_W.money[entry.meta.お金] + COST_W.time[entry.meta.時間] + COST_W.continuation[entry.meta.継続];
    entry.ratio = ratioOf(entry.cost, entry.meta.効果);
  });
  if (strict && errors.length) throw new Error(`${path}\n${errors.join('\n')}`);
  return { section, title, entries, errors };
}

export function loadSections(root = ROOT) {
  const book = readBook(root);
  const sections = book.bookFiles.map(path => ({ path, ...parseEntries(read(path, root), { path }) }));
  const numbers = new Set();
  sections.forEach((section, index) => {
    if (numbers.has(section.section) || section.section !== index + 1 || Number(section.path.slice(5, 7)) !== section.section) throw new Error(`${section.path}：章番号と目次の順序が一致しません。`);
    numbers.add(section.section);
  });
  return { ...book, sections };
}
export function collectStats(sections) {
  const entries = sections.flatMap(section => section.entries);
  const grade = { A: 0, B: 0, C: 0 };
  for (const entry of entries) grade[entry.fields['根拠の区分']]++;
  return { chapters: sections.length, entries: entries.length, grade, sources: unique(entries.flatMap(entry => entry.sources)).length, foreigners: entries.filter(entry => entry.meta.対象 === '外国籍').length };
}
