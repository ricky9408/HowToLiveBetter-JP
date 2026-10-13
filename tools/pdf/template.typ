$-- 日本語版のpandoc用typstテンプレート。
#set terms(hanging-indent: 1.5em)
#set table(inset: 6pt, stroke: none)
// 一つの表セルをページ途中で分割せず、本文の順を読み取りやすくする。
#show table.cell: it => block(breakable: false, align(left, it))
#let horizontalRule = line(start: (25%, 0%), end: (75%, 0%))
#let divider = if "divider" in std { divider } else { horizontalRule }
#show figure.where(kind: table): set figure.caption(position: top)
#show figure.where(kind: image): set figure.caption(position: bottom)
#show figure: set block(breakable: true)
#set smartquote(enabled: false)

// 日本語フォントを優先し、利用できるフォントに順に切り替える。
#set document(title: "$booktitle$", author: "ricky9408（日本向け改編）")
#set text(font: ("Noto Serif CJK JP", "Noto Serif JP", "Source Han Serif", "Hiragino Mincho ProN", "Yu Mincho", "Libertinus Serif"), size: 10.5pt, lang: "ja", region: "jp")
#set par(justify: false, leading: 0.78em, spacing: 0.9em)
#set list(indent: 0.6em, spacing: 0.75em)
#show raw: set text(font: ("DejaVu Sans Mono", "Noto Sans Mono CJK JP"), size: 9pt)
#show link: set text(fill: rgb("#1a4fb4"))
#show heading: set block(sticky: true, above: 1.5em, below: 0.65em)
#show heading.where(level: 1): set text(19pt)
#show heading.where(level: 2): set text(14pt)
#show heading.where(level: 3): set text(11.5pt)
// 章の開始時に改ページする。
#show heading.where(level: 1): it => { pagebreak(weak: true); it }

#let running-head = context {
  let next = query(selector(heading.where(level: 1)).after(here())).at(0, default: none)
  if next != none and next.location().page() == here().page() { return }
  let seen = query(selector(heading.where(level: 1)).before(here()))
  if seen.len() == 0 { return }
  set text(8.5pt, fill: luma(120))
  grid(columns: (1fr, auto), align(left)[$booktitle$], align(right)[#seen.last().body])
  v(-7pt)
  line(length: 100%, stroke: 0.4pt + luma(215))
}

#set page(paper: "a4", margin: (x: 2.2cm, top: 2.2cm, bottom: 2cm), header: none, footer: none)
#align(center + horizon)[
  #image("/og.png", width: 100%)
  #v(2cm)
  #text(10pt, fill: luma(90))[
    生成日時 $builddate$（日本時間） · 本文の版 $commit$ \
    最新の本文と出典はオンライン版を確認してください。 \
    $site$ \
    $repo$
  ]
]
#pagebreak()
#outline(title: [目次], depth: 1, indent: 1em)
#pagebreak(weak: true)
#set page(header: running-head, footer: context align(center, text(8.5pt, fill: luma(120))[#counter(page).at(here()).first() / #counter(page).final().first()]))
#counter(page).update(1)
$body$
