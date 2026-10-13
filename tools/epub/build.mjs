// 使い方：node tools/epub/build.mjs [出力先]
// 日本語本文と長文をEPUB 3にまとめる。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { Marked } from 'marked';
import { zip } from '../lib/zip.mjs';
import { ROOT, REPO, SITE, TITLE, ARTIFACT, RELEASE, read, loadSections, gitCommit, buildStamp, stripBackLink, escapeHtml as esc, headingId, publishedPageHref } from '../lib/book.mjs';

const out = resolve(ROOT, process.argv[2] ?? `dist/${ARTIFACT}.epub`);
const bookId = 'urn:uuid:302f5a48-2db0-4e7a-b506-b7bce3eb8c02';
const now = new Date();
const commit = gitCommit();
const book = loadSections();
const pages = [
  { file: 'front.xhtml', src: 'README.md', title: 'はじめに', md: `# ${TITLE}\n\n${book.frontMd}` },
  { file: 'contents.xhtml', src: 'README.md', title: '章の一覧', md: book.contentsMd },
  ...book.bookFiles.map((src, index) => ({ file: `ch${String(index + 1).padStart(2, '0')}.xhtml`, src, md: stripBackLink(read(src)) })),
  ...book.docFiles.map((src, index) => ({ file: `doc${index + 1}.xhtml`, src, md: read(src) })),
  { file: 'about.xhtml', src: 'README.md', title: '版と利用条件', md: `# 版と利用条件\n\n生成日時：${buildStamp()}（日本時間）。\n\n本文の版：${commit || '不明'}。\n\n[オンライン版](${SITE}) ／ [リポジトリ](${REPO}) ／ [生成後の配布先](${RELEASE}/${ARTIFACT}.epub)\n\n本文はCC BY 4.0で提供します。原著者はeternity4719、日本向けの改編はricky9408のリポジトリで管理します。利用時には出典と改変を明示してください。詳しくは[利用条件](${REPO}/blob/main/LICENSE)と[原著](https://github.com/eternity4719/HowToLiveBetter)を確認してください。` },
];
const pageByPath = new Map(pages.map(page => [page.src, page.file]));
pageByPath.set('README.md', 'front.xhtml');
let current;
let duplicates;
const marked = new Marked({ gfm: true });
function rewriteHref(href) {
  if (/^(https?:|mailto:|tel:)/.test(href)) return href;
  const [path, hash] = href.split('#');
  const target = path ? posix.normalize(posix.join(posix.dirname(current.src), decodeURIComponent(path))) : current.src;
  const page = pageByPath.get(target);
  if (page) return page + (hash ? `#${encodeURIComponent(decodeURIComponent(hash))}` : '');
  const screen = publishedPageHref(target, hash);
  if (screen) return screen;
  return `${REPO}/blob/main/${encodeURI(target)}${hash ? '#' + encodeURIComponent(decodeURIComponent(hash)) : ''}`;
}
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const text = html.replace(/<[^>]+>/g, '');
      const slug = headingId(text);
      const times = duplicates.get(slug) ?? 0;
      const id = times ? `${slug}-${times}` : slug;
      duplicates.set(slug, times + 1);
      current.headings.push({ id, depth, text });
      return `<h${depth} id="${esc(id)}">${html}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      return `<a href="${esc(rewriteHref(href))}"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
    },
    image: () => '',
    html: () => '',
  },
});
function wrap(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;
}
for (const page of pages) {
  current = page;
  duplicates = new Map();
  page.headings = [];
  const body = marked.parse(page.md)
    .replace(/ align="(left|center|right)"/g, ' style="text-align: $1"')
    .replace(/<(br|hr)>/g, '<$1/>')
    .replace(/<(img|input)\b([^>]*?)\s*\/?>/g, '<$1$2/>')
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  page.title ??= page.headings[0]?.text ?? page.file;
  page.xhtml = wrap(page.title, `<section epub:type="chapter">${body}</section>`);
}
const navigation = pages.map(page => ({
  href: page.file, text: page.title,
  subs: page.headings.slice(1).filter(heading => heading.depth <= 3).map(heading => ({ href: `${page.file}#${encodeURIComponent(heading.id)}`, text: heading.text })),
}));
const list = nodes => nodes.map(node => `<li><a href="${esc(node.href)}">${esc(node.text)}</a>${node.subs?.length ? `<ol>${list(node.subs)}</ol>` : ''}</li>`).join('\n');
const nav = wrap('目次', `<nav epub:type="toc" id="toc"><h1>目次</h1><ol>${list(navigation)}</ol></nav><nav epub:type="landmarks" hidden="hidden"><ol><li><a epub:type="cover" href="cover.xhtml">表紙</a></li><li><a epub:type="bodymatter" href="${pages[2].file}">本文</a></li></ol></nav>`);
let order = 0;
const navPoint = node => {
  const position = ++order;
  return `<navPoint id="np${position}" playOrder="${position}"><navLabel><text>${esc(node.text)}</text></navLabel><content src="${esc(node.href)}"/>${node.subs?.map(navPoint).join('') ?? ''}</navPoint>`;
};
const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ja"><head><meta name="dtb:uid" content="${bookId}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${esc(TITLE)}</text></docTitle><navMap>${navigation.map(navPoint).join('')}</navMap></ncx>`;
const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="ja">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">${bookId}</dc:identifier><dc:title>${esc(TITLE)}</dc:title><dc:language>ja</dc:language><dc:creator>ricky9408（日本向け改編）</dc:creator><dc:creator>eternity4719（原著）</dc:creator><dc:description>${esc(book.description)}</dc:description><dc:source>${REPO}</dc:source><dc:rights>CC BY 4.0</dc:rights><dc:date>${now.toISOString().slice(0, 10)}</dc:date><meta property="dcterms:modified">${now.toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
</metadata><manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
${pages.map(page => `<item id="${page.file.replace('.xhtml', '')}" href="${page.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest><spine toc="ncx"><itemref idref="cover"/>${pages.map(page => `<itemref idref="${page.file.replace('.xhtml', '')}"/>`).join('')}</spine></package>`;
const container = '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const entries = [
  { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
  { name: 'META-INF/container.xml', data: Buffer.from(container) },
  { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
  { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) },
  { name: 'OEBPS/toc.ncx', data: Buffer.from(ncx) },
  { name: 'OEBPS/style.css', data: readFileSync(resolve(ROOT, 'tools/epub/style.css')) },
  { name: 'OEBPS/cover.png', data: readFileSync(resolve(ROOT, 'og.png')) },
  { name: 'OEBPS/cover.xhtml', data: Buffer.from(wrap(TITLE, `<div class="cover"><img src="cover.png" alt="${esc(TITLE)}"/></div>`)) },
  ...pages.map(page => ({ name: `OEBPS/${page.file}`, data: Buffer.from(page.xhtml) })),
];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip(entries, now));
console.log(`${out}を生成しました。本文${book.bookFiles.length}章、${book.sections.flatMap(section => section.entries).length}項目、長文${book.docFiles.length}本です。`);

