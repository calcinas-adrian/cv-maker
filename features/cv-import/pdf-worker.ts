import "server-only"

/**
 * Side-effect module: must be imported BEFORE `pdf-parse`.
 *
 * On the server pdfjs has no real Worker, so it falls back to a "fake
 * worker" loaded with `await import(workerSrc)` — a dynamic import Next's
 * file tracing can't follow, so on Vercel `pdf.worker.mjs` never reaches the
 * function bundle ("Setting up fake worker failed: Cannot find module
 * '.../pdfjs-dist/legacy/build/pdf.worker.mjs'"). Before that import, pdfjs
 * checks `globalThis.pdfjsWorker`, which this module sets when evaluated.
 * Importing it statically makes the tracer ship it and skips the dynamic
 * import entirely.
 *
 * `pdfjs-dist` is pinned to the exact version `pdf-parse` depends on, so
 * this worker matches the API that `pdf-parse` loads.
 */
import "pdfjs-dist/legacy/build/pdf.worker.mjs"
