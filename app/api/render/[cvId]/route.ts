import { NextResponse } from "next/server"
import { renderCvPdf } from "@/features/render/actions"

// typst-raster compiles Typst via a native Rust binary
// (`@myriaddreamin/typst-ts-node-compiler`) — it cannot run on the Edge
// runtime, which has no native-addon support. This route must stay on
// Node.js.
export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cvId: string }> },
) {
  const { cvId } = await params

  // Auth + ownership are both enforced inside `renderCvPdf`, which calls
  // `getCvDraft` (session check, then `findOwnedCv` scoping) — the same
  // path every other CV action goes through. Nothing is re-implemented
  // here; this handler only translates the `Result` into an HTTP response.
  const result = await renderCvPdf(cvId)

  if (!result.ok) {
    // Branch on the stable `code`, never the (Spanish, freely reworded)
    // `error` message text — see `lib/result.ts`.
    if (result.code === "unauthenticated") {
      return new NextResponse("No autorizado", { status: 401 })
    }
    if (result.code === "not_found") {
      // `findOwnedCv` folds "no such cv" and "exists but belongs to
      // someone else" into a single null row, so both cases surface here
      // as one 404 — a 403 would leak that a given cvId exists at all.
      return new NextResponse("No encontrado", { status: 404 })
    }
    return new NextResponse("No se pudo generar el PDF", { status: 500 })
  }

  const { buffer, filename } = result.data

  // `Buffer`'s TS type isn't structurally assignable to the DOM `BodyInit`
  // union NextResponse expects, even though it's a `Uint8Array` at runtime
  // — wrap it so the type checker sees a plain `Uint8Array`.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  })
}
