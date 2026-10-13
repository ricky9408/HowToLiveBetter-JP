// 読者が単独で読む要点欄の長さと統計用語を確認する。
import { loadSections } from './lib/book.mjs';
const { sections } = loadSections();
const errors = [];
let count = 0;
for (const section of sections) for (const entry of section.entries) {
  count++;
  const text = entry.fields.要点;
  const length = [...text.replace(/\s/g, '')].length;
  const at = `${section.path}：第${entry.n}項`;
  if (length > 160) errors.push(`${at}：要点が${length}文字です。160文字以内にしてください。`);
  if (/\b(?:HR|RR|OR|CI|RCT)\b/.test(text)) errors.push(`${at}：統計の略語を要点欄で使わないでください。`);
}
for (const error of errors) console.error(error);
console.log(`要点${count}項目を確認しました。問題は${errors.length}件です。`);
process.exitCode = errors.length ? 1 : 0;
