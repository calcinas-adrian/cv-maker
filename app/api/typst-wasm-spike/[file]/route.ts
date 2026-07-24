import { readFile } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"

// Spike-only route (Phase 0, "cv-editor-panel" SDD change). Serves the raw
// WASM binaries for @myriaddreamin/typst-ts-web-compiler / -ts-renderer,
// plus a read-only copy of templates/classic.typ, straight from disk with
// the correct MIME types so the client spike component
// (app/typst-wasm-spike/spike-client.tsx) can exercise a real
// `WebAssembly.instantiateStreaming` fetch and a real runtime template-fetch
// under `next dev/build --turbopack`.
//
// Not meant to ship as-is: Phase 3/4 will decide the production delivery
// mechanism for both the WASM binaries and the template once the client
// compiler is actually wired up. Kept only as a working reference for the
// Turbopack browser-WASM spike outcome — see
// sdd/cv-editor-panel/design (Open Questions) and
// sdd/cv-editor-panel/apply-progress.
export const runtime = "nodejs"

const CLASSIC_TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "classic.typ",
)

// Turbopack's Node File Trace (NFT) can statically resolve a LITERAL
// `path.join(process.cwd(), "a", "b")` call per branch (same pattern
// `features/render/actions.ts` already uses for `templates/classic.typ`).
// An earlier version of this route instead built the path from an
// object-indirected array (`path.join(process.cwd(), ...entry.relPath)`) —
// NFT couldn't prove which of the finite keys would be used, so it fell
// back to tracing the ENTIRE project as a "might be required" set, which
// then hard-failed the build on `templates/classic.typ` ("Unknown module
// type" — NFT tried to treat it as an importable module). Splitting into a
// literal switch per file avoids that fallback entirely. This is a real
// Turbopack finding from the Phase 0 spike, unrelated to the WASM packages
// themselves — see sdd/cv-editor-panel/apply-progress.
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
    },
  })
}
