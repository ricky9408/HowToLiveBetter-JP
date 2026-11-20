import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from '../lib/book.mjs';

test('初回のPDF生成でも任意の出力先まで変換処理を完了する', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'handbook-jp-pdf-build-'));
  try {
    const root = join(temporary, 'checkout');
    for (const path of ['tools/pdf/build.mjs', 'tools/pdf/template.typ', 'tools/lib/book.mjs']) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(ROOT, path), target);
    }
    mkdirSync(join(root, 'book'));
    writeFileSync(join(root, 'README.md'), '# 検証用の本\n\n## 目次\n\n[出典の確認](book/01-出典の確認.md)\n');
    writeFileSync(join(root, 'book/01-出典の確認.md'), `[← 総目次に戻る](../README.md)

# 1. 出典の確認

### 1. 原文を確認する
<!-- 費用タグ: お金=0 時間=少 継続=不要 効果=大 分野=権利 -->
- 費用：確認する時間。
- 要点：原文を確認してください。
- 効果：対象を確かめられます。
- 根拠の区分：B
- 出典：<https://example.org/guide>
- 補足：個別の条件を確認してください。
`);
    const converter = join(temporary, 'converter.mjs');
    const log = join(temporary, 'conversions.jsonl');
    // 変換器の導入状況に左右されず、初回生成の入出力だけを確かめる。
    writeFileSync(converter, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.PDF_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'compile') {
  readFileSync(args[1]);
  writeFileSync(args[2], '検証用の変換結果');
} else {
  const markdown = readFileSync(args.at(-1), 'utf8');
  writeFileSync(args[args.indexOf('-o') + 1], markdown);
}
`, { mode: 0o755 });
    const out = join(temporary, 'custom output', 'guide.pdf');
    assert.equal(existsSync(join(root, 'dist')), false);
    execFileSync(process.execPath, [join(root, 'tools/pdf/build.mjs'), out], {
      cwd: temporary,
      env: { ...process.env, PANDOC: converter, TYPST: converter, PDF_TEST_LOG: log },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(readFileSync(out, 'utf8'), '検証用の変換結果');
    const [pandoc, typst] = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(typst[0], 'compile');
    assert.equal(typst[1], pandoc[pandoc.indexOf('-o') + 1]);
    assert.equal(typst[2], out);
    assert.match(readFileSync(pandoc.at(-1), 'utf8'), /原文を確認してください。/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
