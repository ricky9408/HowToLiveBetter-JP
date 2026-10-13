// 配布ファイルの実際の本文を読み、元の欄や文書の欠落を検出する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { FIELDS, TITLE, extractSourceUrls } from './book.mjs';
import { inlineText } from './inline.mjs';

export function unzip(buffer) {
  const entries = new Map();
  let position = 0;
  while (position + 4 <= buffer.length && buffer.readUInt32LE(position) === 0x04034b50) {
    assert.ok(position + 30 <= buffer.length, 'ZIPのヘッダーが途中で切れています。');
    const method = buffer.readUInt16LE(position + 8);
    const length = buffer.readUInt32LE(position + 18);
    const nameLength = buffer.readUInt16LE(position + 26);
    const extraLength = buffer.readUInt16LE(position + 28);
    const start = position + 30 + nameLength + extraLength;
    assert.ok(start + length <= buffer.length, 'ZIPの本文が途中で切れています。');
    const name = buffer.subarray(position + 30, position + 30 + nameLength).toString('utf8');
    assert.ok(!entries.has(name), `ZIPのファイル名が重複しています：${name}`);
    assert.ok(method === 0 || method === 8, 'ZIPの圧縮形式が不正です。');
    const compressed = buffer.subarray(start, start + length);
    entries.set(name, method === 0 ? compressed : inflateRawSync(compressed));
    position = start + length;
  }
  assert.ok(entries.size, 'ZIPのファイルを読み取れません。');
  return entries;
}

export const normalizeText = value => value.normalize('NFKC').replace(/[\s\u00ad\u200b\ufeff]/gu, '');
export const decodeEntities = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, name) => {
  if (name.startsWith('#')) {
    const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return number <= 0x10ffff ? String.fromCodePoint(number) : all;
  }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name.toLowerCase()];
});
export const htmlText = html => decodeEntities(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '));

export function checkEpubChapter(html, section) {
  const items = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[1-3]\b|<\/section>)/g)];
  assert.equal(items.length, section.entries.length, `EPUBの第${section.section}章の項目数が違います。`);
  section.entries.forEach((entry, index) => {
    const [, heading, body] = items[index];
    const at = `EPUBの第${section.section}章第${entry.n}項`;
    assert.equal(normalizeText(htmlText(heading)), normalizeText(inlineText(`${entry.n}. ${entry.title}`)), `${at}の見出しが違います。`);
    const fields = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => normalizeText(htmlText(match[1])));
    assert.equal(fields.length, FIELDS.length, `${at}の必須欄が欠けています。`);
    FIELDS.forEach((name, fieldIndex) => assert.equal(fields[fieldIndex], normalizeText(`${name}：${inlineText(entry.fields[name])}`), `${at}の${name}欄が元の本文と違います。`));
    const hrefs = [...body.matchAll(/\bhref="([^"]+)"/g)].map(match => decodeEntities(match[1]));
    for (const source of entry.sources) assert.ok(hrefs.includes(source), `${at}の出典リンクがありません：${source}`);
  });
}

export function markdownTextLines(markdown) {
  let code = false;
  return markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n').flatMap(line => {
    if (/^\s*```/.test(line)) { code = !code; return []; }
    if (!line.trim() || /^\[← 総目次に戻る\]/.test(line)) return [];
    if (code) return [line];
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) return [];
    const content = line.replace(/^#{1,6}\s+/, '').replace(/^\s*(?:[-*+] |\d+\. |>[ \t]?)/, '');
    return [inlineText(content).replace(/\|/g, ' ')];
  });
}

// 同じ欄を別の項目から借りて照合しないよう、本文の順に一度ずつ消費する。
// 複数の章を含むPDFでは呼び出し側から同じcursorを渡す。
export function checkDocumentText(text, markdown, at, cursor = { position: 0 }) {
  const actual = normalizeText(text);
  for (const line of markdownTextLines(markdown)) {
    const expected = normalizeText(line);
    const index = actual.indexOf(expected, cursor.position);
    assert.ok(index >= 0, `${at}に本文がありません：${line.slice(0, 85)}`);
    cursor.position = index + expected.length;
  }
  return cursor;
}

export function checkEpubDocument(html, markdown, at) {
  checkDocumentText(htmlText(html), markdown, at);
  const hrefs = [...html.matchAll(/\bhref="([^"]+)"/g)].map(match => decodeEntities(match[1]));
  for (const source of extractSourceUrls(markdown)) assert.ok(hrefs.includes(source), `${at}の出典リンクがありません：${source}`);
}

export function extractPdfText(path, command = process.env.PDFTOTEXT ?? 'pdftotext') {
  assert.equal(readFileSync(path).subarray(0, 5).toString(), '%PDF-', 'PDFの形式が不正です。');
  try {
    // 通常の抽出は行末のURLのハイフンも消すため、文字列の原順を使う。
    const text = execFileSync(command, ['-raw', '-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    // 本文が改ページをまたぐときだけ挟まるテンプレートの柱とページ番号を除く。
    return text.split('\f').map(page => {
      const lines = page.split('\n');
      if (lines[0].startsWith(`${TITLE} `)) lines.shift();
      while (lines.length && !lines.at(-1).trim()) lines.pop();
      if (/^\d+\s*\/\s*\d+\s*$/.test(lines.at(-1) ?? '')) lines.pop();
      return lines.join('\n');
    }).join('\n');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('PDFの本文検査にはpdftotextが必要です。PopplerをインストールするかPDFTOTEXTを指定してください。');
    throw new Error(`PDFの本文を読み取れません。${error.stderr || error.message}`);
  }
}
