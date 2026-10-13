// 使い方：node tools/anki/build.mjs [出力先]
// 日本語版専用の識別子で問答カードを生成する。原著の復習記録とは混同しない。
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { zip } from '../lib/zip.mjs';
import { ROOT, SITE, TITLE, ARTIFACT, loadSections, buildStamp, gitCommit } from '../lib/book.mjs';
import { ankiFields } from '../lib/anki-fields.mjs';

const out = resolve(ROOT, process.argv[2] ?? `dist/${ARTIFACT}.apkg`);
const now = new Date();
const seconds = Math.floor(now.getTime() / 1000);
const modelId = 1780000000001;
const rootId = 1780000000100;
const deckId = section => rootId + section;
const noteId = (section, n) => 1780000100000 + section * 1000 + n;
const cardId = (section, n) => 1780000200000 + section * 1000 + n;
const { sections } = loadSections();
const names = ['章', '助言', '要点', '費用', '効果', '根拠の区分', '補足', '出典', 'リンク'];
const notes = [];
for (const section of sections) for (const entry of section.entries) {
  notes.push({
    section: section.section, n: entry.n,
    fields: ankiFields(section, entry, sections),
    tags: [`第${section.section}章`, `根拠${entry.fields['根拠の区分']}`, `分野_${entry.meta.分野}`, entry.meta.対象 && '対象_外国籍'].filter(Boolean),
  });
}
const css = '.card{font-family:"Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;font-size:18px;line-height:1.75;text-align:left;max-width:42em;margin:0 auto;padding:12px;color:#213547;background:#fff}.nightMode.card,.night_mode .card{color:#eee;background:#1b1b1f}.chapter,.label{font-size:13px;color:#687570}.question{font-size:22px;font-weight:600;margin:8px 0 14px}.label{margin-top:18px}a{color:#3451b2;overflow-wrap:anywhere}';
const qfmt = '<div class="chapter">{{章}}</div><div class="question">{{助言}}</div><p>どんな行動を取り、何を確認するか思い出してください。</p>';
const afmt = '<div class="chapter">{{章}}</div><div class="question">{{助言}}</div><hr id="answer">' + names.slice(2).map(name => `{{#${name}}}<div class="label">${name}</div><div>{{${name}}}</div>{{/${name}}}`).join('');
const model = {
  id: modelId, name: `${TITLE}（日本語問答）`, type: 0, mod: seconds, usn: -1, sortf: 1, did: rootId,
  tmpls: [{ name: '問答', ord: 0, qfmt, afmt, did: null, bqfmt: '', bafmt: '' }],
  flds: names.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
  css, latexPre: '', latexPost: '', latexsvg: false, req: [[0, 'any', [1]]], tags: [], vers: [],
};
const deck = (id, name, desc = '') => ({
  id, name, desc, mod: seconds, usn: -1, dyn: 0, conf: 1, collapsed: false, browserCollapsed: false,
  newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0], extendNew: 0, extendRev: 0,
});
const description = `生成日時：${buildStamp()}（日本時間）。本文の版：${gitCommit() || '不明'}。同じ日本語版の章番号・項目番号のカードは再取り込み時に更新します。項目番号を変えた版では復習内容の対応を確認してください。<a href="${SITE}">最新の本文</a>`;
const decks = {
  1: deck(1, '標準'),
  [rootId]: deck(rootId, TITLE, description),
  ...Object.fromEntries(sections.map(section => [deckId(section.section), deck(deckId(section.section), `${TITLE}::${String(section.section).padStart(2, '0')} ${section.title}`)])),
};
const dconf = { 1: {
  id: 1, name: '標準', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
  new: { delays: [1, 10], ints: [1, 4, 7], initialFactor: 2500, order: 1, perDay: 20, bury: true, separate: true },
  rev: { perDay: 200, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, bury: true },
  lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 },
} };
const conf = { activeDecks: [rootId], curDeck: rootId, newSpread: 0, collapseTime: 1200, timeLim: 0, estTimes: true, dueCounts: true, curModel: String(modelId), nextPos: notes.length + 1, sortType: 'noteFld', sortBackwards: false, addToCur: true };
const schema = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);`;
const tmp = mkdtempSync(join(tmpdir(), 'handbook-jp-anki-'));
try {
  const dbPath = join(tmp, 'collection.anki2');
  const db = new DatabaseSync(dbPath);
  db.exec(schema);
  const dayStart = Math.floor(new Date(`${buildStamp().slice(0, 10)}T00:00:00+09:00`).getTime() / 1000);
  db.prepare('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)').run(dayStart, now.getTime(), now.getTime(), JSON.stringify(conf), JSON.stringify({ [modelId]: model }), JSON.stringify(decks), JSON.stringify(dconf), '{}');
  const strip = text => text.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const checksum = text => parseInt(createHash('sha1').update(strip(text)).digest('hex').slice(0, 8), 16);
  const insertNote = db.prepare("INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')");
  const insertCard = db.prepare("INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')");
  db.exec('BEGIN');
  notes.forEach((note, index) => {
    insertNote.run(noteId(note.section, note.n), `hltb-jp-${note.section}-${note.n}`, modelId, seconds, ` ${note.tags.join(' ')} `, note.fields.join('\x1f'), strip(note.fields[1]), checksum(note.fields[1]));
    insertCard.run(cardId(note.section, note.n), noteId(note.section, note.n), deckId(note.section), seconds, index);
  });
  db.exec('COMMIT');
  db.close();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, zip([{ name: 'collection.anki2', data: readFileSync(dbPath) }, { name: 'media', data: Buffer.from('{}') }], now));
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`${out}を生成しました。日本語カード${notes.length}枚、${sections.length}章です。`);
