import { readFile } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"

// Production asset delivery for the client-side Typst preview compiler
// (`features/render/typst-client.ts`, Phase 3 of the "cv-editor-panel" SDD
// change). Serves the two WASM binaries the browser compiler/renderer need
// plus a runtime-fetched copy of the canonical `templates/classic.typ` —
// the exact mechanism the Phase 0 spike proved works under
// `next dev/build --turbopack` (see `app/api/typst-wasm-spike/[file]/route.ts`
// and `sdd/cv-editor-panel/apply-progress`). This route supersedes the spike
// route for real usage; the spike route is kept only as a historical
// reference and is never imported from here.
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

// Same literal-switch-per-file shape as the spike route: Turbopack's Node
// File Trace (NFT) can only statically resolve a LITERAL
// `path.join(process.cwd(), "a", "b")` call per branch. Building the path
// from an indirected/dynamic segment made NFT fall back to tracing the
// entire project as a "might be required" set, which then hard-failed the
// build on `templates/classic.typ` — see the spike route's own comment and
// `sdd/cv-editor-panel/apply-progress` for the full repro.
async function readAllowedFile(
  file: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  switch (file) {
    case "web-compiler.wasm": {
      const buffer = await readFile(
        path.join(
          process.cwd(),
          "node_modules",
          "@myriaddreamin",
          "typst-ts-web-compiler",
          "pkg",
          "typst_ts_web_compiler_bg.wasm",
        ),
      )
      return { buffer, contentType: "application/wasm" }
    }
    case "renderer.wasm": {
      const buffer = await readFile(
        path.join(
          process.cwd(),
          "node_modules",
          "@myriaddreamin",
          "typst-ts-renderer",
          "pkg",
          "typst_ts_renderer_bg.wasm",
        ),
      )
      return { buffer, contentType: "application/wasm" }
    }
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
      // `immutable` directive would risk serving a stale WASM binary
      // across a deploy that bumps the exact-pinned typst.ts version.
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  })
}
