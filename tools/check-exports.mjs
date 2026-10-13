// 生成物を本文と照合し、章・カード・オフライン本文の欠落を検出する。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { ROOT, ARTIFACT, SITE, loadSections, read } from './lib/book.mjs';
import { ankiFields } from './lib/anki-fields.mjs';
import { unzip, checkEpubChapter, checkEpubDocument, extractPdfText, checkDocumentText, normalizeText, htmlText } from './lib/export-checks.mjs';

const book = loadSections();
const expected = book.sections.flatMap(section => section.entries);
const path = extension => resolve(ROOT, `dist/${ARTIFACT}.${extension}`);
const epubBuffer = readFileSync(path('epub'));
const epub = unzip(epubBuffer);
assert.equal(epubBuffer.readUInt16LE(8), 0, 'EPUBの先頭は非圧縮にしてください。');
assert.equal([...epub.keys()][0], 'mimetype');
assert.equal(epub.get('mimetype').toString(), 'application/epub+zip');
assert.match(epub.get('OEBPS/content.opf').toString(), /<dc:language>ja<\/dc:language>/);
assert.equal([...epub.keys()].filter(name => /^OEBPS\/ch\d+\.xhtml$/.test(name)).length, book.sections.length);
for (const section of book.sections) {
  const content = epub.get(`OEBPS/ch${String(section.section).padStart(2, '0')}.xhtml`).toString();
  checkEpubChapter(content, section);
  checkEpubDocument(content, read(section.path), `EPUBの${section.path}`);
}
assert.equal([...epub.keys()].filter(name => /^OEBPS\/doc\d+\.xhtml$/.test(name)).length, book.docFiles.length, 'EPUBの文書数が違います。');
book.docFiles.forEach((file, index) => checkEpubDocument(epub.get(`OEBPS/doc${index + 1}.xhtml`).toString(), read(file), `EPUBの${file}`));
const front = epub.get('OEBPS/front.xhtml').toString();
checkEpubDocument(front, book.frontMd, 'EPUBの導入');
assert.ok(front.includes(`href="${SITE}"`) && front.includes(`href="${SITE}selfcheck.html"`), 'EPUBの画面へのリンクが公開ページを参照していません。');
const provenance = process.env.CI && process.env.GITHUB_SHA;
if (provenance) assert.ok(htmlText(epub.get('OEBPS/about.xhtml').toString()).includes(provenance), 'EPUBの生成元コミットが違います。');
const offline = readFileSync(path('html'), 'utf8');
const corpusMatch = offline.match(/<script>window\.__CORPUS__=([\s\S]*?);<\/script>/);
assert.ok(corpusMatch, 'オフライン本文がありません。');
const corpus = JSON.parse(corpusMatch[1]);
assert.ok(corpus.readme === read('README.md'), 'オフライン版のREADMEが古い状態です。再生成してください。');
assert.ok(JSON.stringify(corpus.parts) === JSON.stringify(book.bookFiles.map(path => ({ path, md: read(path) }))), 'オフライン版の本文が一致しません。再生成してください。');
assert.ok(JSON.stringify(corpus.docs) === JSON.stringify(book.allDocFiles.map(path => ({ path, md: read(path) }))), 'オフライン版の文書が一致しません。再生成してください。');
assert.ok(!offline.includes('href="./"'), 'オフライン版のホームがローカルのディレクトリーを参照しています。');

const anki = unzip(readFileSync(path('apkg')));
const temporary = mkdtempSync(join(tmpdir(), 'handbook-jp-export-'));
try {
  const dbPath = join(temporary, 'collection.anki2');
  writeFileSync(dbPath, anki.get('collection.anki2'));
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const notes = db.prepare('SELECT guid, flds FROM notes ORDER BY id').all();
  assert.equal(notes.length, expected.length);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM cards').get().total, expected.length);
  const byGuid = new Map(notes.map(note => [note.guid, note.flds.split('\x1f')]));
  for (const section of book.sections) for (const entry of section.entries) {
    const fields = byGuid.get(`hltb-jp-${entry.section}-${entry.n}`);
    assert.ok(fields, '日本語版のカード識別子がありません。');
    assert.equal(fields.length, 9);
    assert.deepEqual(fields, ankiFields(section, entry, book.sections), `Ankiの第${entry.section}章第${entry.n}項の本文・出典・参照リンクが違います。`);
  }
  if (provenance) assert.ok(db.prepare('SELECT decks FROM col').get().decks.includes(provenance), 'Ankiの生成元コミットが違います。');
  db.close();
} finally { rmSync(temporary, { recursive: true, force: true }); }

const withPdf = !process.argv.includes('--without-pdf');
if (withPdf) {
  const text = extractPdfText(path('pdf'));
  assert.ok(normalizeText(text), 'PDFの本文が空です。');
  const cursor = { position: 0 };
  checkDocumentText(text, book.frontMd, 'PDFの導入', cursor);
  checkDocumentText(text, book.contentsMd, 'PDFの章一覧', cursor);
  for (const section of book.sections) checkDocumentText(text, read(section.path), `PDFの${section.path}`, cursor);
  for (const file of book.docFiles) checkDocumentText(text, read(file), `PDFの${file}`, cursor);
  if (provenance) assert.ok(normalizeText(text).includes(provenance), 'PDFの生成元コミットが違います。');
}
console.log(`${withPdf ? 'EPUB・PDF・オフラインHTML・Anki' : 'EPUB・オフラインHTML・Anki（PDFは検査を省略）'}の${book.sections.length}章と${expected.length}項目を本文と照合しました。検査した形式に欠落はありません。`);
