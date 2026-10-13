// カードの生成と照合は、同じ安全な欄の変換を使う。
import { SITE, escapeHtml, onlineReference } from './book.mjs';
import { renderInline } from './inline.mjs';

export function ankiFields(section, entry, sections) {
  const render = value => renderInline(value, href => onlineReference(href, section.path, sections));
  return [
    `第${section.section}章 ${escapeHtml(section.title)} ／ 第${entry.n}項`, escapeHtml(entry.title),
    render(entry.fields.要点), render(entry.fields.費用), render(entry.fields.効果),
    escapeHtml(entry.fields['根拠の区分']), render(entry.fields.補足), render(entry.fields.出典),
    `<a href="${SITE}#e-${section.section}-${entry.n}">オンラインで本文と出典を読む</a>`,
  ];
}
