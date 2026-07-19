import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // `typst-raster` (via `@myriaddreamin/typst-ts-node-compiler`) loads a
  // native Rust/NAPI binary through a dynamic `.node` require. Turbopack
  // can't statically bundle that asset into an ESM chunk ("asset is not
  // placeable in ESM chunks") — marking it external makes Next leave the
  // import as a plain runtime `require()` instead of bundling it. Only
  // ever reached from `app/api/render/[cvId]/route.ts`, which forces
  // `runtime = "nodejs"`.
  //
  // `pdf-parse@2.4.5` wraps `pdfjs-dist`, which — when no real Worker is
  // available (true for a Next.js server request) — falls back to a "fake
  // worker" that does `await import("./pdf.worker.mjs")`, a path resolved
  // RELATIVE TO ITS OWN BUNDLED LOCATION. Turbopack moves pdfjs-dist's code
  // into `.next/dev/server/chunks/ssr/...`, where no `pdf.worker.mjs` sits
  // alongside it, so that dynamic import 404s at runtime with "Setting up
  // fake worker failed: Cannot find module '...chunks/ssr/pdf.worker.mjs'".
  // This only fires when a PDF is actually parsed at request time — a
  // passing `pnpm build` says nothing about it (an earlier version of this
  // comment claimed build parity meant no fix was needed; that was testing
  // the wrong signal). Externalizing both packages makes Node load them
  // from their real `node_modules` location, where the relative worker
  // path genuinely resolves.
  //
  // `repomix` (the GitHub-import full-code digest pipeline,
  // `features/github-import/code-digest.ts`) resolves its tree-sitter
  // grammars at runtime via `require.resolve(`@repomix/tree-sitter-wasms/
  // out/tree-sitter-${langName}.wasm`)` (a template-literal require
  // Turbopack can't fully statically resolve, so it conservatively bundles
  // the WHOLE `@repomix/tree-sitter-wasms` directory) and loads them
  // through `web-tree-sitter`'s `Language.load()`. Turbopack then tries to
  // wrap every one of those `.wasm` files in its own ESM loader shim, which
  // imports from a synthetic `"env"` module (the WASI-style import object
  // real WASM instantiation expects to receive at runtime, not resolve at
  // bundle time) — failing the build with "Can't resolve 'env'" for every
  // bundled grammar. Externalizing all three packages makes Next leave
  // their `require`s as plain runtime `require()` calls resolved against
  // the real `node_modules`, where `web-tree-sitter` loads the `.wasm`
  // files itself via `fs`/`WebAssembly.instantiate`, exactly like it does
  // in a plain Node CLI.
  serverExternalPackages: [
    "typst-raster",
    "@myriaddreamin/typst-ts-node-compiler",
    "pdf-parse",
    "pdfjs-dist",
    "repomix",
    "@repomix/tree-sitter-wasms",
    "web-tree-sitter",
  ],
  experimental: {
    // Server Actions default to a 1MB request body limit
    // (`next/dist/server/app-render/action-handler.js`'s
    // `defaultBodySizeLimit`, verified against the installed
    // `next@16.2.10` rather than assumed) — far too small for a resume
    // PDF/DOCX upload. `features/cv-import/actions.ts`'s own
    // `MAX_FILE_SIZE_BYTES` (8MB) is the real, user-facing cap; this just
    // needs enough headroom above it that Next's own limit never fires
    // first with a confusing generic 413.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
}

export default nextConfig
