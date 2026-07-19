// Classic one-page-friendly CV template.
//
// SECURITY: the entire CV payload arrives as a single JSON-encoded string
// via `sys.inputs.cvData` (see `features/render/actions.ts`), decoded here
// with `json.decode`. User-controlled text (name, bullets, summaries, etc.)
// therefore only ever exists as Typst *data* (str/array/dictionary values).
// Interpolating a `str` value with `#value` always inserts literal text —
// Typst never re-parses it as markup or source — so this file must NEVER
// string-interpolate raw CV text into template source. Do not change this.

#let data = json.decode(sys.inputs.cvData)

// `json.decode` maps a JSON `null` to Typst's `none` — that only happens
// when a key is *present* with a null value (`.at(default: ...)` only
// covers a *missing* key). The Node-side serializer already coalesces
// null/undefined to "" before encoding, but this guard makes the template
// robust on its own too, independent of that upstream guarantee.
#let nz(value) = if value == none { "" } else { value }

#let full-name = nz(data.at("fullName", default: ""))
#let email = nz(data.at("email", default: ""))
#let phone = nz(data.at("phone", default: ""))
#let location = nz(data.at("location", default: ""))
#let summary = nz(data.at("summary", default: ""))
#let experiences = data.at("experiences", default: ())
#let projects = data.at("projects", default: ())
#let education = data.at("education", default: ())
#let skills = data.at("skills", default: ())

#set document(title: if full-name != "" { full-name } else { "CV" })
#set page(paper: "a4", margin: (x: 1.6cm, y: 1.4cm))
#set text(font: "New Computer Modern", size: 10pt)
#set par(justify: false, leading: 0.55em)

// -- Helpers -----------------------------------------------------------

#let section-title(title) = [
  #v(0.55em)
  #text(size: 12pt, weight: "bold")[#title]
  #v(-0.35em)
  #line(length: 100%, stroke: 0.5pt + gray)
  #v(0.15em)
]

#let fmt-range(start, end) = {
  if start != "" and end != "" [#start -- #end]
  else if start != "" [#start]
  else if end != "" [#end]
  else []
}

#let bullet-list(bullets) = {
  if bullets.len() > 0 {
    list(..bullets.map(b => [#b]), indent: 0.4em, spacing: 0.4em)
  }
}

#let entry-header(title-content, subtitle, range-text) = [
  #grid(
    columns: (1fr, auto),
    align: (left, right),
    [#strong[#title-content] #if subtitle != "" [ --- #subtitle]],
    [#text(size: 9pt, fill: gray)[#range-text]],
  )
]

// -- Header --------------------------------------------------------------

#align(center)[
  #text(size: 20pt, weight: "bold")[
    #if full-name != "" { full-name } else { "Untitled CV" }
  ]
]

#let contact-parts = (email, phone, location).filter(p => p != "")
#if contact-parts.len() > 0 [
  #v(0.15em)
  #align(center)[
    #text(size: 9pt, fill: gray)[#contact-parts.join("  ·  ")]
  ]
]

// -- Summary ---------------------------------------------------------------

#if summary != "" [
  #v(0.7em)
  #par(summary)
]

// -- Experience --------------------------------------------------------------

#if experiences.len() > 0 [
  #section-title("Experience")
  #for item in experiences [
    #entry-header(
      nz(item.at("role", default: "")),
      nz(item.at("company", default: "")),
      fmt-range(nz(item.at("startDate", default: "")), nz(item.at("endDate", default: ""))),
    )
    #bullet-list(item.at("bullets", default: ()))
    #v(0.35em)
  ]
]

// -- Projects --------------------------------------------------------------

#if projects.len() > 0 [
  #section-title("Projects")
  #for item in projects [
    #let url = nz(item.at("url", default: ""))
    #entry-header(
      nz(item.at("name", default: "")),
      url,
      "",
    )
    #let description = nz(item.at("description", default: ""))
    #if description != "" [
      #text(size: 9.5pt)[#description]
    ]
    #bullet-list(item.at("bullets", default: ()))
    #v(0.35em)
  ]
]

// -- Education --------------------------------------------------------------

#if education.len() > 0 [
  #section-title("Education")
  #for item in education [
    #entry-header(
      nz(item.at("institution", default: "")),
      nz(item.at("degree", default: "")),
      fmt-range(nz(item.at("startDate", default: "")), nz(item.at("endDate", default: ""))),
    )
    #v(0.2em)
  ]
]

// -- Skills --------------------------------------------------------------

// NOTE: the whole chain must stay wrapped in one set of parens. Typst does
// not continue an unparenthesized `#let x = expr` onto the next line just
// because it starts with `.method(...)` — without the enclosing `(...)`,
// each `.method(...)` continuation line is parsed as a *new*, separate
// markup line (literal text starting with `.`), silently leaving
// `skill-labels` bound to the raw, un-mapped `skills` array instead.
#let skill-labels = (
  skills
    .map(s => {
      let name = nz(s.at("name", default: ""))
      let category = nz(s.at("category", default: ""))
      if name == "" { "" } else if category != "" { name + " (" + category + ")" } else { name }
    })
    .filter(s => s != "")
)

#if skill-labels.len() > 0 [
  #section-title("Skills")
  #par(skill-labels.join("  ·  "))
]
