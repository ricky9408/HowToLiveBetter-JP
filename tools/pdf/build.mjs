// 使い方：node tools/pdf/build.mjs [出力先]
// pandocとtypstで日本語本文をPDFにする。PANDOC、TYPSTで実行ファイルを指定できる。
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, REPO, SITE, TITLE, ARTIFACT, read, loadSections, gitCommit, buildStamp, stripBackLink, headingId, publishedPageHref } from '../lib/book.mjs';

const out = resolve(ROOT, process.argv[2] ?? `dist/${ARTIFACT}.pdf`);
const pandoc = process.env.PANDOC ?? 'pandoc';
const typst = process.env.TYPST ?? 'typst';
const book = loadSections();
const commit = gitCommit();
const pages = [
  { src: 'README.md', anchor: 'front', md: `# はじめに\n\n${book.frontMd}` },
  { src: 'README.md', anchor: 'contents', md: book.contentsMd },
  ...book.bookFiles.map((src, index) => ({ src, anchor: `sec-${index + 1}`, md: stripBackLink(read(src)) })),
  ...book.docFiles.map((src, index) => ({ src, anchor: `doc-${index + 1}`, md: read(src) })),
  { src: 'README.md', anchor: 'about', md: `# 版と利用条件\n\n生成日時：${buildStamp()}（日本時間）。\n\n本文の版：${commit || '不明'}。\n\n[オンライン版](${SITE}) ／ [リポジトリ](${REPO})\n\n本文はCC BY 4.0で提供します。原著者はeternity4719です。日本向けの改編はricky9408のリポジトリで管理します。利用時には出典と改変を明示してください。[利用条件](${REPO}/blob/main/LICENSE)と[原著](https://github.com/eternity4719/HowToLiveBetter)も確認してください。` },
];
const pageByPath = new Map(pages.map(page => [page.src, page.anchor]));
pageByPath.set('README.md', 'front');
const anchors = new Map();
for (const page of pages) {
  const duplicates = new Map();
  page.md = page.md.replace(/^(#{1,6}) (.+)$/gm, (_, level, title) => {
    const slug = headingId(title);
    const times = duplicates.get(slug) ?? 0;
    duplicates.set(slug, times + 1);
    const id = times ? `${slug}-${times}` : slug;
    const anchor = level === '#' ? page.anchor : `${page.anchor}-${id}`;
    anchors.set(`${page.src}#${id}`, anchor);
    return `${level} ${title} {#${anchor}}`;
  });
}
function rewriteLinks(md, src) {
  return md.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (all, href, title = '') => {
    if (/^(?:https?:|mailto:|tel:)/.test(href)) return all;
    const [path, hash] = href.split('#');
    const target = path ? posix.normalize(posix.join(posix.dirname(src), decodeURIComponent(path))) : src;
    const anchor = hash ? anchors.get(`${target}#${decodeURIComponent(hash)}`) : pageByPath.get(target);
    if (anchor) return `](#${anchor}${title})`;
    const screen = publishedPageHref(target, hash);
    if (screen) return `](${screen}${title})`;
    return `](${REPO}/blob/main/${encodeURI(target)}${hash ? '#' + hash : ''}${title})`;
  });
}
mkdirSync(dirname(out), { recursive: true });
const markdownPath = resolve(ROOT, 'dist/pdf-build.md');
const typstPath = resolve(ROOT, 'dist/pdf-build.typ');
writeFileSync(markdownPath, pages.map(page => rewriteLinks(page.md, page.src).replace(/<!--[\s\S]*?-->/g, '').trim()).join('\n\n'));
const run = (command, args) => {
  try { return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${command}が見つかりません。実行ファイルをインストールするか環境変数で指定してください。`);
    throw new Error(`${command}の実行に失敗しました。\n${error.stderr || error.message}`);
  }
};
run(pandoc, ['--from=gfm+attributes', '--to=typst', '--wrap=none', `--template=${resolve(ROOT, 'tools/pdf/template.typ')}`, '-V', `booktitle=${TITLE}`, '-V', `builddate=${buildStamp()}`, '-V', `commit=${commit || '不明'}`, '-V', `site=${SITE}`, '-V', `repo=${REPO}`, '-o', typstPath, markdownPath]);
const log = run(typst, ['compile', typstPath, out, '--root', ROOT]);
if (log.trim()) console.log(log.trim());
console.log(`${out}を生成しました。本文${book.bookFiles.length}章、長文${book.docFiles.length}本、${(statSync(out).size / 1048576).toFixed(1)}MBです。`);
