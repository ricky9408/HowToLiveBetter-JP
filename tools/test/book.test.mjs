// 日本語の本文形式を守り、欠落や旧形式の混入を見つけるテスト。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEntries, readBook, collectStats, headingId, extractSourceUrls } from '../lib/book.mjs';

const fixture = `[← 総目次に戻る](../README.md)

# 1. 暮らしを確かめる

自治体と相談してください。

### 1. 出典の原文を確認する
<!-- 費用タグ: お金=0 時間=少 継続=不要 効果=大 分野=権利 -->
- 費用：確認する時間。
- 要点：原文を確認してください。
- 効果：制度の対象を確かめられます。
- 根拠の区分：B
- 出典：<https://www.mhlw.go.jp/>；<https://doi.org/10.1016/S0140-6736(15)01225-8>
- 補足：個別の条件を確認してください。
`;

test('日本語の必須欄と括弧を含むURLを保持する', () => {
  const result = parseEntries(fixture);
  assert.equal(result.section, 1);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].fields.要点, '原文を確認してください。');
  assert.deepEqual(result.entries[0].sources, ['https://www.mhlw.go.jp/', 'https://doi.org/10.1016/S0140-6736(15)01225-8']);
  assert.equal(parseEntries(fixture.replace(/\n/g, '\r\n')).entries.length, 1);
});
test('外国籍の方に固有のタグだけを受け付ける', () => {
  const result = parseEntries(fixture.replace('分野=権利 -->', '分野=権利 対象=外国籍 -->'));
  assert.equal(result.entries[0].meta.対象, '外国籍');
  assert.throws(() => parseEntries(fixture.replace('分野=権利 -->', '分野=権利 対象=観光客 -->')), /タグの値が不正/);
});
test('必須欄・出典・タグの欠落を検出する', () => {
  assert.throws(() => parseEntries(fixture.replace('- 補足：個別の条件を確認してください。\n', '')), /補足欄がありません/);
  assert.throws(() => parseEntries(fixture.replace(/- 出典：.*\n/, '- 出典：厚生労働省\n')), /出典欄に/);
  assert.throws(() => parseEntries(fixture.replace('継続=不要 ', '')), /継続がありません/);
  assert.throws(() => parseEntries(fixture.replace('時間=少', '時間=短い')), /値が不正/);
});
test('重複欄・重複タグ・連番の誤りを検出する', () => {
  assert.throws(() => parseEntries(fixture.replace('- 費用：', '- 要点：重複。\n- 費用：')), /欄が重複/);
  assert.throws(() => parseEntries(fixture.replace('お金=0 ', 'お金=0 お金=少 ')), /キーが重複/);
  assert.throws(() => parseEntries(fixture.replace('### 1.', '### 2.')), /番号は1から連続/);
  assert.throws(() => parseEntries(fixture.replace('根拠の区分：B', '根拠の区分：D')), /根拠の区分は/);
});
test('費用タグの位置を確認する', () => {
  assert.throws(() => parseEntries(fixture.replace('### 1. 出典の原文を確認する\n', '### 1. 出典の原文を確認する\n\n')), /直後に費用タグがありません/);
});
test('欄の次行へ追加した条件を黙って落とさず編集エラーにする', () => {
  const continued = fixture.replace('- 要点：原文を確認してください。', '- 要点：原文を確認してください。\n所得の条件も満たす必要があります。');
  assert.throws(() => parseEntries(continued), /未定義の行/);
  assert.throws(() => parseEntries(fixture + '\n- 追加の条件\n'), /未定義の行/);
});
test('統計は本文の根拠区分と出典の重複を反映する', () => {
  const section = parseEntries(fixture.replace('分野=権利 -->', '分野=権利 対象=外国籍 -->'));
  const stats = collectStats([section]);
  assert.deepEqual(stats, { chapters: 1, entries: 1, grade: { A: 0, B: 1, C: 0 }, sources: 2, foreigners: 1 });
});
test('日本語の見出しから内部参照用の名前を作る', () => {
  assert.equal(headingId('1. 日本の制度を確認する'), '1-日本の制度を確認する');
});
test('隣り合うMarkdown出典と括弧付きDOIを別々に読み取る', () => {
  assert.deepEqual(extractSourceUrls('[厚労省](https://www.mhlw.go.jp/)・[研究](https://doi.org/10.1016/S0140-6736(15)01225-8) <https://www.mhlw.go.jp/>'), [
    'https://www.mhlw.go.jp/', 'https://doi.org/10.1016/S0140-6736(15)01225-8',
  ]);
});
test('見出し名が変わっても目次を読め、掲載漏れは検出する', () => {
  const root = mkdtempSync(join(tmpdir(), 'handbook-jp-parser-'));
  try {
    mkdirSync(join(root, 'book'));
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'book/01-生活.md'), fixture);
    writeFileSync(join(root, 'docs/手続き.md'), '# 手続き\n');
    writeFileSync(join(root, 'README.md'), '# 案内\n\n日本で暮らすための案内です。\n\n[生活](book/01-生活.md)\n\n[手続き](docs/手続き.md)\n[対照表](docs/参照対照.md)\n');
    assert.deepEqual(readBook(root).bookFiles, ['book/01-生活.md']);
    assert.deepEqual(readBook(root).docFiles, ['docs/手続き.md']);
    assert.deepEqual(readBook(root).allDocFiles, ['docs/手続き.md', 'docs/参照対照.md']);
    writeFileSync(join(root, 'book/02-仕事.md'), fixture);
    assert.throws(() => readBook(root), /目次にない本文/);
    writeFileSync(join(root, 'README.md'), '# 案内\n\n読者向けの説明です。\n\n[仕事を先に読む](book/02-仕事.md)\n\n## 目次\n\n[生活](book/01-生活.md)\n[仕事](book/02-仕事.md)\n[生活](book/01-生活.md)\n\n## 開発と検査\n\n開発者向けの生成手順です。\n');
    const book = readBook(root);
    assert.deepEqual(book.bookFiles, ['book/01-生活.md', 'book/02-仕事.md']);
    assert.match(book.frontMd, /読者向けの説明/);
    assert.doesNotMatch(book.frontMd, /^# 案内|## 目次|開発と検査|開発者向け/m);
    assert.equal(book.contentsMd, '# 章の一覧\n\n1. [生活](book/01-生活.md)\n2. [仕事](book/02-仕事.md)');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
