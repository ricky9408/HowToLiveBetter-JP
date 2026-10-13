// 見出しだけ残った書籍や、形式名だけを偽装したPDFを配布しないための回帰試験。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEpubChapter, checkEpubDocument, checkDocumentText, extractPdfText } from '../lib/export-checks.mjs';
import { renderInline } from '../lib/inline.mjs';
import { onlineReference, publishedPageHref } from '../lib/book.mjs';
import { ankiFields } from '../lib/anki-fields.mjs';

const entry = { section: 1, n: 1, title: '申請前に対象を確かめる', fields: {
  費用: '窓口で確認する時間。', 要点: '所得の条件を先に確認します。', 効果: '対象の手続きを選べます。',
  根拠の区分: 'B', 出典: '<https://example.org/guide>', 補足: '地域の窓口へ相談します。',
}, sources: ['https://example.org/guide'] };
const section = { section: 1, title: '制度の確認', path: 'book/01-制度の確認.md', entries: [entry] };
const html = `<section><h1>1. 制度の確認</h1><h3>1. 申請前に対象を確かめる</h3>
<ul><li>費用：窓口で確認する時間。</li><li>要点：所得の条件を先に確認します。</li>
<li>効果：対象の手続きを選べます。</li><li>根拠の区分：B</li>
<li>出典：<a href="https://example.org/guide">https://example.org/guide</a></li>
<li>補足：地域の窓口へ相談します。</li></ul></section>`;

test('EPUBの見出しが残っていても必須欄の削除や改変を検出する', () => {
  checkEpubChapter(html, section);
  assert.throws(() => checkEpubChapter(html.replace(/<ul>[\s\S]*?<\/ul>/, ''), section), /必須欄/);
  assert.throws(() => checkEpubChapter(html.replace('所得の条件を先に確認します。', '条件はありません。'), section), /要点欄/);
  assert.throws(() => checkEpubChapter(html.replace('href="https://example.org/guide"', 'href="https://example.org/other"'), section), /出典リンク/);
});
test('長文は見出しだけでなく条件の段落と出典も検査する', () => {
  const markdown = '# 申請\n\n所得と居住地の条件を両方確認します。\n\n[資料](https://example.org/guide)';
  const document = '<h1>申請</h1><p>所得と居住地の条件を両方確認します。</p><p><a href="https://example.org/guide">資料</a></p>';
  checkEpubDocument(document, markdown, '検証用の長文');
  assert.throws(() => checkEpubDocument(document.replace(/<p>所得[\s\S]*?<\/p>/, ''), markdown, '検証用の長文'), /本文がありません/);
});
test('EPUBの章見出しと導入文を削除した場合も拒否する', () => {
  const markdown = '# 1. 制度の確認\n\n申請の条件は自治体へ確認します。\n\n### 1. 申請前に対象を確かめる';
  const document = '<section><h1>1. 制度の確認</h1><p>申請の条件は自治体へ確認します。</p><h3>1. 申請前に対象を確かめる</h3></section>';
  checkEpubDocument(document, markdown, 'EPUBの章');
  assert.throws(() => checkEpubDocument(document.replace(/<h1>[\s\S]*?<\/h1>/, ''), markdown, 'EPUBの章'), /本文がありません/);
  assert.throws(() => checkEpubDocument(document.replace(/<p>[\s\S]*?<\/p>/, ''), markdown, 'EPUBの章'), /本文がありません/);
});
test('繰り返す欄は別項目や別章から借りずに本文の順で照合する', () => {
  const markdown = '# 章\n\n### 1. 項目甲\n- 根拠の区分：B\n\n### 2. 項目乙\n- 根拠の区分：B';
  checkDocumentText('章\n1. 項目甲\n根拠の区分：B\n2. 項目乙\n根拠の区分：B', markdown, 'PDF');
  assert.throws(() => checkDocumentText('章\n1. 項目甲\n2. 項目乙\n根拠の区分：B', markdown, 'PDF'), /本文がありません/);
  const cursor = { position: 0 };
  checkDocumentText('同じ段落。', '同じ段落。', '第1章', cursor);
  assert.throws(() => checkDocumentText('同じ段落。', '同じ段落。', '第2章', cursor), /本文がありません/);
});
test('電子書籍の画面リンクはHTMLソースではなく公開ページを開く', () => {
  assert.equal(publishedPageHref('index.html'), 'https://ricky9408.github.io/HowToLiveBetter-JP/');
  assert.equal(publishedPageHref('selfcheck.html'), 'https://ricky9408.github.io/HowToLiveBetter-JP/selfcheck.html');
});
test('カードでは日本語の相対参照と括弧を含む出典をクリックできる', () => {
  const resolve = href => onlineReference(href, section.path, [section]);
  assert.equal(renderInline('[制度](01-制度の確認.md#1-申請前に対象を確かめる)', resolve), '<a href="https://ricky9408.github.io/HowToLiveBetter-JP/?chapter=1#e-1-1">制度</a>');
  assert.equal(renderInline('<https://doi.org/10.1016/S0140-6736(15)01225-8>'), '<a href="https://doi.org/10.1016/S0140-6736(15)01225-8">https://doi.org/10.1016/S0140-6736(15)01225-8</a>');
  const fields = ankiFields(section, entry, [section]);
  assert.equal(fields[7], '<a href="https://example.org/guide">https://example.org/guide</a>');
  assert.equal(fields[8], '<a href="https://ricky9408.github.io/HowToLiveBetter-JP/#e-1-1">オンラインで本文と出典を読む</a>');
});
test('カードに生HTMLや実行可能なURIを持ち込まない', () => {
  const resolve = href => onlineReference(href, section.path, [section]);
  const result = renderInline('<script>alert(1)</script> [危険](javascript:alert(1)) [画像](data:text/html,test) [外部](//example.org/test)', resolve);
  assert.equal(result, '&lt;script&gt;alert(1)&lt;/script&gt; 危険 画像 外部');
  assert.equal(onlineReference('index.html#%ZZ', section.path), null);
  assert.equal(onlineReference('../../private.txt', section.path), null);
});
test('注記の角括弧を後続リンクへ巻き込まず、引用したタイトルを本文に含めない', () => {
  assert.equal(renderInline('[注] 詳細は[資料](https://example.org)'), '[注] 詳細は<a href="https://example.org/">資料</a>');
  assert.equal(renderInline('[資料](https://example.org "資料名")'), '<a href="https://example.org/">資料</a>');
});

// 実際に読める小さなPDFを独立に作り、テキスト抽出器で読む。
function pdfFixture(text) {
  const stream = `BT /F1 12 Tf 50 750 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${offsets.length}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return result + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
test('PDFは接頭辞だけの偽装と、本文が失われた有効なPDFを拒否する', () => {
  const temp = mkdtempSync(join(tmpdir(), 'handbook-jp-pdf-test-'));
  try {
    const path = join(temp, 'book.pdf');
    writeFileSync(path, '%PDF-本文を失った偽のファイル');
    assert.throws(() => extractPdfText(path), /本文を読み取れません/);
    writeFileSync(path, pdfFixture('Required condition for support.'));
    checkDocumentText(extractPdfText(path), 'Required condition for support.', 'PDF');
    writeFileSync(path, pdfFixture('Title only.'));
    assert.throws(() => checkDocumentText(extractPdfText(path), 'Required condition for support.', 'PDF'), /本文がありません/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
