// 復習カードでは本文、Markdownリンク、URLの自動リンクだけを表示する。
// 生のHTMLは文字として扱い、リンクのURIは呼び出し側で検査する。
import { escapeHtml } from './book.mjs';

export function inlineTokens(text) {
  const tokens = [];
  let plain = '', at = 0;
  const flush = () => { if (plain) tokens.push({ text: plain }); plain = ''; };
  while (at < text.length) {
    if (text[at] === '<') {
      const end = text.indexOf('>', at + 1);
      const href = end < 0 ? '' : text.slice(at + 1, end);
      if (/^https?:\/\/[^\s<>]+$/i.test(href)) {
        flush(); tokens.push({ text: href, href }); at = end + 1; continue;
      }
    }
    if (text[at] === '[') {
      const labelEnd = text.indexOf(']', at + 1);
      if (labelEnd >= 0 && text[labelEnd + 1] === '(') {
        let end = labelEnd + 2, depth = 0;
        for (; end < text.length; end++) {
          if (text[end] === '(') depth++;
          if (text[end] === ')') { if (!depth) break; depth--; }
          if (/\s/.test(text[end])) break;
        }
        const hrefEnd = end;
        // 引用符で囲まれた任意のタイトルは表示せず、リンク先だけを使う。
        if (/\s/.test(text[end] ?? '') && !depth) {
          const title = /^\s+(?:"[^"\n]*"|'[^'\n]*')\s*\)/.exec(text.slice(end));
          if (title) end += title[0].length - 1;
        }
        if (text[end] === ')' && !depth) {
          flush(); tokens.push({ text: text.slice(at + 1, labelEnd), href: text.slice(labelEnd + 2, hrefEnd) });
          at = end + 1; continue;
        }
      }
    }
    plain += text[at++];
  }
  flush();
  return tokens;
}

export function renderInline(text, resolveHref = href => {
  try { const url = new URL(href); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}) {
  return inlineTokens(text).map(token => {
    const label = escapeHtml(token.text);
    const href = token.href ? resolveHref(token.href) : null;
    return href ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
  }).join('');
}

// 書き出しの検査では装飾やリンク先を本文の文字と区別する。
export function inlineText(text) {
  return inlineTokens(text).map(token => token.text).join('')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}
