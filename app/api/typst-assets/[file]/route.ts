import { readFile } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"

// Serves a runtime-fetched copy of the canonical `templates/classic.typ` to
// the client-side Typst preview compiler (`features/render/typst-client.ts`).
// The two WASM binaries it also needs are static files in `public/typst/`
// (copied by `scripts/copy-typst-wasm.mjs`): reading them from
// `node_modules` here broke on Vercel, where pnpm's package symlinks aren't
// shipped with the function.
//
// Deliberately reads `templates/classic.typ` at request time instead of a
// duplicated `public/templates/classic.typ` copy, per
// `sdd/cv-editor-panel/design`'s Decision 5 recommendation — one canonical
// file, zero risk of the client/server templates drifting apart.
export const runtime = "nodejs"

const CLASSIC_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "classic.typ",
)

// Literal switch per file on purpose: Turbopack's Node
// File Trace (NFT) can only statically resolve a LITERAL
// `path.join(process.cwd(), "a", "b")` call per branch. Building the path
// from an indirected/dynamic segment made NFT fall back to tracing the
// entire project as a "might be required" set, which then hard-failed the
// build on `templates/classic.typ` — see
// `sdd/cv-editor-panel/apply-progress` for the full repro.
async function readAllowedFile(
  file: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  switch (file) {
    case "classic-template.typ": {
      const buffer = await readFile(CLASSIC_TEMPLATE_PATH)
      return { buffer, contentType: "text/plain; charset=utf-8" }
    }
    default:
      return null
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params
  const entry = await readAllowedFile(file)
  if (!entry) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(entry.buffer), {
    status: 200,
    headers: {
      "Content-Type": entry.contentType,
      "Content-Length": String(entry.buffer.length),
      // Moderate caching only: the URL has no content hash, so an
      // `immutable` directive would risk serving a stale template across a
      // deploy that changes `templates/classic.typ`.
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}
