import "server-only"

import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas"

/**
 * Side-effect module: must be imported BEFORE `pdf-parse`.
 *
 * `pdf-parse@2.4.5` bundles pdfjs, which evaluates `new DOMMatrix` at module
 * load. In Node it first tries to polyfill `DOMMatrix`/`ImageData`/`Path2D`
 * from `@napi-rs/canvas` via a dynamic `createRequire(...)("@napi-rs/canvas")`
 * — a call Next's file tracing can't follow, so on Vercel the package (and
 * its `linux-x64-gnu` native binary) never reaches the function bundle, the
 * polyfill silently fails, and loading `pdf-parse` throws
 * `ReferenceError: DOMMatrix is not defined`. Locally it works only because
 * the dev machine has the native binary installed.
 *
 * This static import makes the tracer ship `@napi-rs/canvas`, and assigning
 * the globals here guarantees they exist before pdfjs evaluates. ES modules
 * evaluate imports in order, so this must stay a separate module imported
 * first — inline assignments in `parse-document.ts` would run too late.
 */
const globals = globalThis as Record<string, unknown>
globals.DOMMatrix ??= DOMMatrix
globals.ImageData ??= ImageData
globals.Path2D ??= Path2D
