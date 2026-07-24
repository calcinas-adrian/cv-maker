import type { CvTheme } from "@/schemas/cv.schema"

/**
 * Single source of truth for which font families — and which weight/style
 * files — are GUARANTEED available on BOTH Typst compile paths:
 *
 * - server (`typst-raster`, used by `features/render/actions.ts`): bundles
 *   New Computer Modern out of the box, zero extra config (see that
 *   package's README: "Zero-config font setup (New Computer Modern Book
 *   included)").
 * - client (Phase 3, `@myriaddreamin/typst-ts-web-compiler` in the
 *   browser): registers fonts at runtime from files served out of
 *   `public/fonts/typst/` via typst.ts's font-loading hooks. Not consumed
 *   yet — this module only exists so Phase 3 has a single place to read
 *   "which fonts, which files" from, instead of hardcoding file paths.
 *
 * Invariant (enforced by convention/code review, not a runtime check):
 *   `themeSchema.fontFamily` enum values ⊆ `FONT_MANIFEST` family keys ⊆
 *   fonts actually present on BOTH sides.
 *
 * Adding a font requires, in this order:
 *   1. Add the weight file(s) under `public/fonts/typst/`.
 *   2. Add a manifest entry here.
 *   3. Verify server-side bundling — does `typst-raster` already ship it,
 *      or does `features/render/actions.ts` need a `fontPath` pointed at
 *      an extra directory?
 *   4. Only THEN add the family name to `schemas/cv.schema.ts`'s
 *      `themeSchema.fontFamily` enum.
 *
 * First cut ships ONLY "New Computer Modern" — exactly what `typst-raster`
 * already bundles server-side — for zero drift on day one. The four files
 * referenced below were copied from `typst-raster`'s own bundled font
 * assets (same New Computer Modern build the server renderer already
 * uses), so the client (once Phase 3 wires it up) renders from the
 * byte-identical font files the server renders from today.
 */

export type FontStyle = "normal" | "italic"
export type FontWeight = "regular" | "bold"

export type FontWeightFile = {
  style: FontStyle
  weight: FontWeight
  /** Path under `public/`, fetchable at runtime by the client compiler. */
  publicPath: string
}

export type FontManifestEntry = {
  /** MUST match a `themeSchema.fontFamily` enum value exactly. */
  family: CvTheme["fontFamily"]
  files: FontWeightFile[]
}

export const FONT_MANIFEST: readonly FontManifestEntry[] = [
  {
    family: "New Computer Modern",
    files: [
      {
        style: "normal",
        weight: "regular",
        publicPath: "/fonts/typst/NewCM10-Regular.otf",
      },
      {
        style: "normal",
        weight: "bold",
        publicPath: "/fonts/typst/NewCM10-Bold.otf",
      },
      {
        style: "italic",
        weight: "regular",
        publicPath: "/fonts/typst/NewCM10-Italic.otf",
      },
      {
        style: "italic",
        weight: "bold",
        publicPath: "/fonts/typst/NewCM10-BoldItalic.otf",
      },
    ],
  },
] as const

export const SUPPORTED_FONT_FAMILIES: readonly string[] = FONT_MANIFEST.map(
  (entry) => entry.family,
)

export function getFontManifestEntry(
  family: string,
): FontManifestEntry | undefined {
  return FONT_MANIFEST.find((entry) => entry.family === family)
}
