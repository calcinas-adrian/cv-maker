// Classic one-page-friendly CV template.
//
// SECURITY: the entire CV payload arrives as a single JSON-encoded string
// via `sys.inputs.cvData` (see `features/render/actions.ts`), decoded here
// with `json.decode`. Theme tokens travel the same way through a second,
// symmetric `sys.inputs.themeJson` channel. User-controlled text (name,
// bullets, summaries, etc.) therefore only ever exists as Typst *data*
// (str/array/dictionary values). Interpolating a `str` value with `#value`
// always inserts literal text — Typst never re-parses it as markup or
// source — so this file must NEVER string-interpolate raw CV text into
// template source. Do not change this. `md-inline` (below) parses a
// LIMITED bold/italic markdown subset out of bullet text, but it does so
// entirely by slicing the `str` value with string methods (`.position()`
// / `.slice()`) and re-inserting the resulting fragments via `[#frag]` —
// never by feeding user text back into Typst's own markup parser. A
// crafted bullet like `#set text(size: 999pt)` or containing `#`/`\`/`"`
// is therefore always inert plain-text data, never executed Typst code.

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
#let achievements = data.at("achievements", default: ())
#let references = data.at("references", default: ())

// -- Theme ---------------------------------------------------------------
//
// `themeJson` is decoded the same way as `cvData` above — every value that
// reaches the template is Typst *data*, never source. Defaults here match
// `schemas/cv.schema.ts`'s `DEFAULT_THEME` (and, before this file was
// parametrized, this template's own hardcoded literals) so a caller that
// omits `themeJson` entirely, or a caller that only sends a partial theme
// dictionary, still renders byte-identically to today's fixed look.
#let theme = json.decode(sys.inputs.at("themeJson", default: "{}"))
#let theme-font = theme.at("fontFamily", default: "New Computer Modern")
#let theme-font-size = theme.at("fontSize", default: 10)
#let theme-accent = rgb(theme.at("accentColor", default: "#000000"))
#let theme-margin-key = theme.at("margin", default: "normal")
#let theme-line-height = theme.at("lineHeight", default: 0.55)

// `margin` travels as its enum tag ("compact" | "normal" | "relaxed"), not
// a resolved length — this map is the one place that tag is turned into
// actual cm values. `normal` MUST stay exactly `(x: 1.6cm, y: 1.4cm)`: that
// is today's hardcoded margin, and `DEFAULT_THEME.margin` is `"normal"`.
#let margin-map = (
  compact: (x: 1.2cm, y: 1.0cm),
  normal: (x: 1.6cm, y: 1.4cm),
  relaxed: (x: 2.2cm, y: 2.0cm),
)

#set document(title: if full-name != "" { full-name } else { "CV" })
#set page(paper: "a4", margin: margin-map.at(theme-margin-key, default: margin-map.normal))
#set text(font: theme-font, size: theme-font-size * 1pt)
#set par(justify: false, leading: theme-line-height * 1em)

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

// Data-only inline markdown: turns a plain `str` into Typst *content* by
// locating **bold** and _italic_ delimiter pairs with string search
// (`.position()` / `.slice()`), never by re-feeding the string into
// Typst's own markup parser. Every fragment — matched or not — reaches
// the page only via `[#frag]`, where `frag` is a runtime `str` value;
// Typst always inserts that as literal text, so a bullet containing `#`,
// `\`, `"`, or Typst-like syntax (e.g. `#set text(size: 999pt)`) can never
// execute — it can only ever end up as inert characters on the page. See
// the SECURITY note at the top of this file.
//
// Deliberately simple (no nesting, no escaping `\*`/`\_`): matches the
// design's documented algorithm. One known, non-security quirk: a single
// pair of underscores around a `snake_case_identifier` will be read as
// italic markup, same as most minimal markdown parsers.
#let md-inline(input) = {
  let remaining = input
  let out = ()
  while remaining.len() > 0 {
    let bold-pos = remaining.position("**")
    let italic-pos = remaining.position("_")

    let next-marker = if bold-pos != none and (italic-pos == none or bold-pos <= italic-pos) {
      "bold"
    } else if italic-pos != none {
      "italic"
    } else {
      none
    }

    if next-marker == none {
      out.push([#remaining])
      remaining = ""
    } else if next-marker == "bold" {
      let before = remaining.slice(0, bold-pos)
      let after-open = remaining.slice(bold-pos + 2)
      let close-pos = after-open.position("**")
      if close-pos == none {
        // Unterminated "**" — keep the rest as literal text, do not
        // silently swallow the marker.
        out.push([#remaining])
        remaining = ""
      } else {
        let inner = after-open.slice(0, close-pos)
        if before.len() > 0 { out.push([#before]) }
        out.push(strong[#inner])
        remaining = after-open.slice(close-pos + 2)
      }
    } else {
      let before = remaining.slice(0, italic-pos)
      let after-open = remaining.slice(italic-pos + 1)
      let close-pos = after-open.position("_")
      if close-pos == none {
        out.push([#remaining])
        remaining = ""
      } else {
        let inner = after-open.slice(0, close-pos)
        if before.len() > 0 { out.push([#before]) }
        out.push(emph[#inner])
        remaining = after-open.slice(close-pos + 1)
      }
    }
  }
  if out.len() > 0 { out.join() } else { [] }
}

#let bullet-list(bullets) = {
  if bullets.len() > 0 {
    list(..bullets.map(b => md-inline(b)), indent: 0.4em, spacing: 0.4em)
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
  #text(size: 20pt, weight: "bold", fill: theme-accent)[
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

// -- Achievements ----------------------------------------------------------

#if achievements.len() > 0 [
  #section-title("Achievements")
  #for item in achievements [
    #entry-header(
      nz(item.at("title", default: "")),
      nz(item.at("issuer", default: "")),
      nz(item.at("date", default: "")),
    )
    #let achievement-description = nz(item.at("description", default: ""))
    #if achievement-description != "" [
      #text(size: 9.5pt)[#achievement-description]
    ]
    #v(0.35em)
  ]
]

// -- References ------------------------------------------------------------

#if references.len() > 0 [
  #section-title("References")
  #for item in references [
    #let ref-role = nz(item.at("role", default: ""))
    #let ref-company = nz(item.at("company", default: ""))
    // `entry-header` takes a single subtitle slot, so role and company are
    // folded into one string here rather than adding a fourth parameter
    // that only this one section would ever use.
    #let ref-affiliation = if ref-role != "" and ref-company != "" {
      ref-role + " --- " + ref-company
    } else if ref-role != "" {
      ref-role
    } else {
      ref-company
    }
    #entry-header(
      nz(item.at("name", default: "")),
      ref-affiliation,
      "",
    )
    // Shadows nothing: the header's `contact-parts` is a separate top-level
    // binding, deliberately named differently to keep the two readable.
    #let ref-contact = (
      nz(item.at("email", default: "")),
      nz(item.at("phone", default: "")),
    ).filter(p => p != "")
    #if ref-contact.len() > 0 [
      #text(size: 9pt, fill: gray)[#ref-contact.join("  ·  ")]
    ]
    #v(0.35em)
  ]
]
