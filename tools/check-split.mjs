// 書き出し時に欄の内容が失われないことを確認する。
import { loadSections } from './lib/book.mjs';
import { splitGain, splitSrc, splitLongItems } from './lib/split-items.mjs';
const { sections } = loadSections();
let count = 0;
for (const section of sections) for (const entry of section.entries) {
  for (const [name, value] of Object.entries(entry.fields)) {
    const chunks = name === '出典' ? splitSrc(value) : splitGain(value);
    if (chunks.join('') !== value || splitLongItems(value) !== value) throw new Error(`${section.path}：第${entry.n}項の${name}欄が書き出し時に変わります。`);
    count++;
  }
}
console.log(`書き出し用の${count}欄を確認しました。本文の欠落はありません。`);
