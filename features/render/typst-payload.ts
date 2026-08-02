import type { CvData, CvTheme } from "@/schemas/cv.schema"

/**
 * Shared, framework-agnostic Typst input-channel shaping.
 *
 * This module has NO side-effect imports (no "use server", no Node APIs,
 * no client-only APIs) so it can be imported by BOTH the server export path
 * (`features/render/actions.ts`) and the future lazy client compiler
 * (`features/render/typst-client.ts`, Phase 3). One payload function + one
 * template + two compile targets is the concrete mechanism behind the
 * "live preview never visually drifts from the server PDF export"
 * guarantee — see `sdd/cv-editor-panel/design` Decision 5.
 */

export type TypstCvPayload = {
  fullName: string
  email: string
  phone: string
  location: string
  summary: string
  experiences: {
    company: string
    role: string
    startDate: string
    endDate: string
    bullets: string[]
  }[]
  projects: {
    name: string
    description: string
    url: string
    bullets: string[]
  }[]
  education: {
    institution: string
    degree: string
    startDate: string
    endDate: string
  }[]
  skills: {
    name: string
    category: string
  }[]
  credentials: {
    kind: string
    name: string
    issuer: string
    issuedAt: string
    expiresAt: string
    credentialId: string
    credentialUrl: string
    description: string
  }[]
  languages: {
    name: string
    level: string
  }[]
  references: {
    name: string
    role: string
    company: string
    email: string
    phone: string
  }[]
}

/**
 * Flattens `CvData` into the plain, all-keys-guaranteed-present shape
 * `templates/classic.typ` expects.
 *
 * This step matters for more than convenience: `JSON.stringify` silently
 * *drops* keys whose value is `undefined` (which is how most optional
 * `CvData` fields end up when empty), and the template's
 * `data.at("key", default: ...)` lookups only fall back to `default` when
 * the key is missing — not when it's present with a nullish value. Every
 * field here is therefore coerced to a concrete `""` / `[]` before
 * serialization so the template's field access never has to guess.
 *
 * Moved verbatim from `features/render/actions.ts` — logic is byte-for-byte
 * unchanged, only the module it lives in changed.
 */
export function toTypstPayload(cv: CvData): TypstCvPayload {
  return {
    fullName: cv.fullName ?? "",
    email: cv.email ?? "",
    phone: cv.phone ?? "",
    location: cv.location ?? "",
    summary: cv.summary ?? "",
    experiences: (cv.experiences ?? []).map((e) => ({
      company: e.company ?? "",
      role: e.role ?? "",
      startDate: e.startDate ?? "",
      endDate: e.endDate ?? "",
      bullets: (e.bullets ?? []).map((b) => b.content),
    })),
    projects: (cv.projects ?? []).map((p) => ({
      name: p.name ?? "",
      description: p.description ?? "",
      url: p.url ?? "",
      bullets: (p.bullets ?? []).map((b) => b.content),
    })),
    education: (cv.education ?? []).map((ed) => ({
      institution: ed.institution ?? "",
      degree: ed.degree ?? "",
      startDate: ed.startDate ?? "",
      endDate: ed.endDate ?? "",
    })),
    skills: (cv.skills ?? []).map((s) => ({
      name: s.name ?? "",
      category: s.category ?? "",
    })),
    // `templates/classic.typ` reads the full credential field set directly
    // — `kind`/`issuedAt`/`expiresAt`/`credentialId`/`credentialUrl` — no
    // more best-effort `date` folding (career-bank-restructure Phase 9,
    // finishing the minimal rename fallback Phase 2's schema reshape left
    // in place).
    credentials: (cv.credentials ?? []).map((c) => ({
      kind: c.kind ?? "",
      name: c.name ?? "",
      issuer: c.issuer ?? "",
      issuedAt: c.issuedAt ?? "",
      expiresAt: c.expiresAt ?? "",
      credentialId: c.credentialId ?? "",
      credentialUrl: c.credentialUrl ?? "",
      description: c.description ?? "",
    })),
    languages: (cv.languages ?? []).map((l) => ({
      name: l.name ?? "",
      level: l.level ?? "",
    })),
    references: (cv.references ?? []).map((r) => ({
      name: r.name ?? "",
      role: r.role ?? "",
      company: r.company ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
    })),
  }
}

export type TypstThemePayload = {
  fontFamily: string
  fontSize: number
  accentColor: string
  margin: CvTheme["margin"]
  lineHeight: number
}

/**
 * Flattens `CvTheme` into the `themeJson` sys.inputs channel, symmetric
 * with `toTypstPayload`'s `cvData` channel.
 *
 * `CvTheme` is already fully concrete (every field has a zod `.default`,
 * and `DEFAULT_THEME` is derived by parsing `{}`), so this is currently a
 * straight passthrough rather than an undefined-coalescing pass like
 * `toTypstPayload`. It stays a separate named function — instead of
 * inlining `theme` directly — so the wire shape can diverge from `CvTheme`
 * later (e.g. if a field needs Typst-side remapping) without changing every
 * call site.
 *
 * NOTE: `margin` still travels as its enum tag ("compact" | "normal" |
 * "relaxed"), not a resolved cm value — the enum-to-cm mapping is Typst
 * template logic, added when `classic.typ` is parametrized (Phase 2), not
 * payload-shaping logic.
 */
export function toThemePayload(theme: CvTheme): TypstThemePayload {
  return {
    fontFamily: theme.fontFamily,
    fontSize: theme.fontSize,
    accentColor: theme.accentColor,
    margin: theme.margin,
    lineHeight: theme.lineHeight,
  }
}
