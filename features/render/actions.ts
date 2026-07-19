import { readFile } from "fs/promises"
import path from "path"
import { createRequire } from "node:module"
import { getCvDraft } from "@/features/cv/actions"
import type { Result } from "@/lib/result"
import type { CvData } from "@/schemas/cv.schema"
// Type-only — erased at compile time, so this alone never triggers the
// runtime ESM resolution that hits the broken `.mjs` build below.
import type { Typst as TypstRenderer } from "typst-raster"

// `typst-raster`'s ESM build (`dist/index.mjs`) references a bare
// `__dirname` to locate its bundled fonts — that's only ever defined in
// CommonJS modules, not real ESM, so `import { Typst } from "typst-raster"`
// (which resolves the package's "import" condition, i.e. the broken .mjs
// build) throws `ReferenceError: __dirname is not defined` at runtime. The
// CJS build (`dist/index.js`) has the exact same line but works, because
// Node injects a real `__dirname` there. Forcing CJS resolution via
// `createRequire` sidesteps the package's own ESM build bug entirely.
const require = createRequire(import.meta.url)
const { Typst } = require("typst-raster") as typeof import("typst-raster")

/**
 * Not marked "use server" — unlike `features/cv/actions.ts`, nothing here
 * is ever invoked directly from a Client Component (no server-action RPC
 * boundary to cross). It's called exclusively from
 * `app/api/render/[cvId]/route.ts`, a plain server-side function call in
 * the same Node process, so returning a `Buffer` is unproblematic.
 *
 * Ownership is enforced entirely by reusing `getCvDraft` (session check +
 * `findOwnedCv` scoping) from `features/cv/actions.ts` — this file never
 * re-implements or duplicates that check.
 */

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "classic.typ")

// The template is static build-time content, not per-request data — read it
// once and keep it in memory instead of hitting disk on every render.
let cachedTemplateSource: string | null = null
async function getTemplateSource(): Promise<string> {
  if (cachedTemplateSource === null) {
    cachedTemplateSource = await readFile(TEMPLATE_PATH, "utf-8")
  }
  return cachedTemplateSource
}

// `NodeCompiler.create()` (inside typst-raster) has real startup cost, so
// reuse one `Typst` instance across renders in this server process rather
// than constructing a fresh compiler per request. Render-level caching is
// disabled: every CV's content differs, so a cache buys nothing, and
// leaving it off avoids holding other users' rendered PDFs in memory
// longer than a single request needs them.
let renderer: TypstRenderer | null = null
function getRenderer(): TypstRenderer {
  if (!renderer) {
    renderer = new Typst({ cache: false })
  }
  return renderer
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
 */
function toTypstPayload(cv: CvData) {
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
      bullets: e.bullets ?? [],
    })),
    projects: (cv.projects ?? []).map((p) => ({
      name: p.name ?? "",
      description: p.description ?? "",
      url: p.url ?? "",
      bullets: p.bullets ?? [],
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
  }
}

/**
 * Builds a filesystem/HTTP-header-safe download filename from a CV's full
 * name, e.g. "María José Fernández Núñez" -> "Maria_Jose_Fernandez_Nunez_CV.pdf".
 *
 * Diacritics are stripped (rather than percent-/RFC-5987-encoding a
 * Unicode filename) so the plain `filename="..."` form in
 * `Content-Disposition` works identically across every browser, with no
 * dual-encoding fallback required. Falls back to a generic name when
 * `fullName` is empty or reduces to nothing filesystem-safe.
 */
export function buildCvFilename(fullName: string | undefined | null): string {
  const asciiName = (fullName ?? "")
    .trim()
    .normalize("NFKD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // strip combining diacritical marks
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  const base = asciiName.length > 0 ? asciiName : "cv"
  return `${base}_CV.pdf`
}

export type CvPdfRender = {
  buffer: Buffer
  filename: string
}

/**
 * Loads a CV via the existing ownership-checked read path, renders it to a
 * PDF with `classic.typ`, and returns the buffer plus a ready-to-use
 * download filename.
 */
export async function renderCvPdf(cvId: string): Promise<Result<CvPdfRender>> {
  const draft = await getCvDraft(cvId)
  if (!draft.ok) return draft

  const templateSource = await getTemplateSource()
  const payload = toTypstPayload(draft.data)

  try {
    const buffer = await getRenderer().render({
      code: templateSource,
      format: "pdf",
      // The only channel CV data travels through into Typst: a single
      // JSON-encoded string, decoded on the other side with
      // `json.decode(sys.inputs.cvData)`. This is what keeps user-controlled
      // text from ever being string-interpolated into compiled Typst
      // source — see the security note at the top of classic.typ.
      variables: { cvData: JSON.stringify(payload) },
    })

    return {
      ok: true,
      data: { buffer, filename: buildCvFilename(draft.data.fullName) },
    }
  } catch (err) {
    console.error("Failed to render CV PDF", cvId, err)
    return { ok: false, error: "No se pudo generar el PDF", code: "unknown" }
  }
}
