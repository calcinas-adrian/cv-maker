"use client"

import type { CvData, CvTheme } from "@/schemas/cv.schema"
import { FONT_MANIFEST } from "@/features/render/font-manifest"
import { toTypstPayload, toThemePayload } from "@/features/render/typst-payload"

/**
 * Lazy, client-side Typst compiler for the live preview pane.
 *
 * This module is the browser counterpart of `features/render/actions.ts`'s
 * `renderCvPdf` — it compiles the SAME `templates/classic.typ` through the
 * SAME `toTypstPayload`/`toThemePayload` functions, so the live preview and
 * the server PDF export can never structurally drift (see
 * `sdd/cv-editor-panel/design` Decision 5, "no-drift" spec requirement).
 *
 * Only ever imported from `"use client"` code, and in practice only ever
 * reached via the lazy `next/dynamic({ ssr: false })` boundary in
 * `features/render/typst-preview-lazy.tsx` — importing `@myriaddreamin/
 * typst-ts-web-compiler`/`-ts-renderer` eagerly would put ~12MB of WASM in
 * the initial editor bundle.
 */

const ASSET_BASE = "/api/typst-assets"
const MAIN_FILE_PATH = "/main.typ"

type TypstEngine = {
  compiler: Awaited<
    ReturnType<
      typeof import("@myriaddreamin/typst.ts/main").createTypstCompiler
    >
  >
  renderer: Awaited<
    ReturnType<
      typeof import("@myriaddreamin/typst.ts/main").createTypstRenderer
    >
  >
}

let enginePromise: Promise<TypstEngine> | null = null

/**
 * Creates and initializes the compiler + renderer exactly once per page
 * load (module-scoped singleton — repeated `compilePreview` calls reuse
 * it), registers the font manifest's files with the compiler, and loads
 * `classic.typ` as the compiler's single source file.
 *
 * `loadFonts` accepts plain public URL strings and fetches them itself
 * (see `options.init.d.mts`), so `FONT_MANIFEST`'s `publicPath` entries —
 * already served statically from `public/fonts/typst/` — can be passed
 * through unchanged.
 */
async function getEngine(): Promise<TypstEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [
        { createTypstCompiler, createTypstRenderer, loadFonts },
        templateSource,
      ] = await Promise.all([
        import("@myriaddreamin/typst.ts/main"),
        fetchTemplateSource(),
      ])

      const fontUrls = FONT_MANIFEST.flatMap((entry) =>
        entry.files.map((file) => file.publicPath),
      )

      const compiler = createTypstCompiler()
      await compiler.init({
        getModule: () => fetch(`${ASSET_BASE}/web-compiler.wasm`),
        beforeBuild: [loadFonts(fontUrls)],
      })
      compiler.addSource(MAIN_FILE_PATH, templateSource)

      const renderer = createTypstRenderer()
      await renderer.init({
        getModule: () => fetch(`${ASSET_BASE}/renderer.wasm`),
      })

      return { compiler, renderer }
    })().catch((err) => {
      // A failed init must not permanently wedge the module: clear the
      // cached promise so the next `compilePreview` call retries instead
      // of forever awaiting/rejecting the same broken singleton.
      enginePromise = null
      throw err
    })
  }
  return enginePromise
}

async function fetchTemplateSource(): Promise<string> {
  const response = await fetch(`${ASSET_BASE}/classic-template.typ`)
  if (!response.ok) {
    throw new Error(
      `No se pudo cargar templates/classic.typ (HTTP ${response.status})`,
    )
  }
  return response.text()
}

export type CompilePreviewResult =
  { ok: true; svg: string } | { ok: false; error: string }

/**
 * Compiles `data` + `theme` through `classic.typ` and renders the result to
 * an SVG string — the browser-appropriate output format for a live preview
 * (vs. the server export's PDF; see `renderCvPdf`). Never throws: every
 * failure path (engine init, compile diagnostics, render, or an unexpected
 * exception) resolves to `{ ok: false, error }` so a malformed input can
 * only ever produce an error-state result, never crash the caller.
 */
export async function compilePreview(
  cv: CvData,
  theme: CvTheme,
): Promise<CompilePreviewResult> {
  try {
    const { compiler, renderer } = await getEngine()

    const { CompileFormatEnum } =
      await import("@myriaddreamin/typst.ts/compiler")

    const payload = toTypstPayload(cv)
    const themeJson = JSON.stringify(toThemePayload(theme))

    const compileResult = await compiler.compile({
      mainFilePath: MAIN_FILE_PATH,
      format: CompileFormatEnum.vector,
      diagnostics: "full",
      inputs: { cvData: JSON.stringify(payload), themeJson },
    })

    if (!compileResult.result) {
      const firstDiagnostic = compileResult.diagnostics?.[0]
      const message =
        firstDiagnostic &&
        typeof firstDiagnostic === "object" &&
        "message" in firstDiagnostic
          ? String(firstDiagnostic.message)
          : "Error de compilación desconocido"
      return { ok: false, error: message }
    }

    const svg = await renderer.renderSvg({
      format: "vector",
      artifactContent: compileResult.result,
    })

    if (typeof svg !== "string" || !svg.includes("<svg")) {
      return { ok: false, error: "El motor no generó una vista previa válida" }
    }

    return { ok: true, svg }
  } catch (err) {
    console.error("Typst preview compile failed", err)
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error desconocido al compilar la vista previa",
    }
  }
}
