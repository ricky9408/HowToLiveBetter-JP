// 相対リンク、章番号、必須欄とタグを確認し、参照先の一覧を保存する。
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import { ROOT, loadSections, read, headingId } from './lib/book.mjs';
const check = process.argv.includes('--check');
const { sections, docFiles } = loadSections();
const files = ['README.md', ...sections.map(section => section.path), ...docFiles];
const errors = [], rows = [];
const headings = path => {
  const md = read(path);
  const ids = new Set();
  const duplicates = new Map();
  for (const match of md.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = headingId(match[1]);
    const times = duplicates.get(slug) ?? 0;
    ids.add(times ? `${slug}-${times}` : slug);
    duplicates.set(slug, times + 1);
  }
  for (const match of md.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
};
for (const file of files) {
  const md = read(file);
  md.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const [, label, href] = match;
      if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
      const [path, hash] = href.split('#');
      let target;
      try { target = path ? posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(path))) : file; }
      catch { errors.push(`${file}:${index + 1}：リンクの文字コードが不正です。`); continue; }
      const generatedTarget = !check && target === 'docs/参照対照.md' && !hash;
      if (target.startsWith('../') || (!generatedTarget && !existsSync(resolve(ROOT, target)))) { errors.push(`${file}:${index + 1}：参照先がありません（${href}）。`); continue; }
      if (hash && target.endsWith('.md') && !headings(target).has(decodeURIComponent(hash))) errors.push(`${file}:${index + 1}：参照先の見出しがありません（${href}）。`);
      rows.push([file, index + 1, label || 'リンク', href]);
    }
    for (const match of line.matchAll(/第\s*(\d+)\s*章(?:の)?第\s*(\d+)\s*項/g)) {
      const section = sections.find(section => section.section === Number(match[1]));
      const entry = section?.entries.find(entry => entry.n === Number(match[2]));
      if (!entry) errors.push(`${file}:${index + 1}：参照する章・項目がありません（${match[0]}）。`);
      else rows.push([file, index + 1, match[0], `${section.path}：${entry.title}`]);
    }
  });
}
for (const error of errors) console.error(error);
if (errors.length) process.exit(1);
const safe = value => String(value).replace(/\|/g, '／').replace(/\n/g, ' ');
const output = [
  '# 参照先の対照表', '',
  'この表は tools/check-refs.mjs で生成します。章や項目の並べ替え後に参照先を確認してください。', '',
  '| ファイル | 行 | リンクの表示 | 参照先 |', '| --- | ---: | --- | --- |',
  ...rows.map(row => `| ${row.map(safe).join(' | ')} |`), '',
].join('\n');
const target = resolve(ROOT, 'docs/参照対照.md');
if (check) {
  if (!existsSync(target) || read('docs/参照対照.md') !== output) {
    console.error('参照対照表が古い状態です。node tools/check-refs.mjs を実行してください。');
    process.exit(1);
  }
} else writeFileSync(target, output);
console.log(`${sections.length}章と${rows.length}件の内部参照を確認しました。`);
