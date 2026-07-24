// Standalone runtime verification for Phase 0 of the "cv-editor-panel" SDD
// change — confirms @myriaddreamin/typst-ts-web-compiler + -ts-renderer's
// generated wasm-bindgen glue code (the exact same code Turbopack bundles
// for the browser) can load its .wasm binary via
// `WebAssembly.instantiateStreaming` against a real HTTP response (served
// here with the correct `application/wasm` MIME type) and successfully
// compile + render a trivial, font-free Typst document.
//
// This runs OUTSIDE Next.js/Turbopack — it isolates the WASM *runtime*
// mechanics from bundler concerns. The companion check for whether
// Turbopack itself can bundle this import graph for a `next/dynamic({ssr:
// false})` client component lives in app/typst-wasm-spike/.
//
// Usage: node scripts/typst-wasm-browser-spike.mjs
//
// Not part of the app's runtime — safe to delete once the spike's outcome
// is trusted, or keep as a quick manual regression check (mirrors
// scripts/render-smoke-test.cjs for the server-side render pipeline).

import { createServer } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createTypstCompiler, createTypstRenderer } from "@myriaddreamin/typst.ts/main"
import { CompileFormatEnum } from "@myriaddreamin/typst.ts/compiler"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const WASM_FILES = {
  "/web-compiler.wasm": path.join(
    root,
    "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
  ),
  "/renderer.wasm": path.join(
    root,
    "node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
  ),
}

async function main() {
  const server = createServer(async (req, res) => {
    const filePath = WASM_FILES[req.url]
    if (!filePath) {
      res.writeHead(404)
      res.end()
      return
    }
    const buffer = await readFile(filePath)
    res.writeHead(200, {
      "Content-Type": "application/wasm",
      "Content-Length": buffer.length,
    })
    res.end(buffer)
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  console.log(`Serving WASM binaries from ${base}`)

  // Wrap instantiateStreaming to prove which code path actually ran —
  // wasm-bindgen's generated glue silently falls back to the slower
  // buffer-based WebAssembly.instantiate if the streaming path throws (e.g.
  // wrong MIME type), which would hide a real "Turbopack doesn't serve
  // application/wasm correctly" problem behind an otherwise-passing test.
  let streamingCalls = 0
  const originalInstantiateStreaming = WebAssembly.instantiateStreaming
  WebAssembly.instantiateStreaming = async (...args) => {
    streamingCalls++
    return originalInstantiateStreaming(...args)
  }

  try {
    console.log("Initializing compiler...")
    const compiler = createTypstCompiler()
    await compiler.init({
      getModule: () => fetch(`${base}/web-compiler.wasm`),
    })

    // Font-free by design: Phase 0 verifies the WASM/Turbopack loading
    // mechanics only. Font sourcing is explicitly Phase 2.3
    // (features/render/font-manifest.ts) scope — out of scope here.
    const testDoc = `
#set page(width: 120pt, height: 80pt, fill: rgb("#1d4ed8"))
#place(center + horizon, rect(width: 60pt, height: 40pt, fill: white, radius: 4pt))
`.trim()

    compiler.addSource("/main.typ", testDoc)
    const compileResult = await compiler.compile({
      mainFilePath: "/main.typ",
      format: CompileFormatEnum.vector,
      diagnostics: "full",
    })

    if (!compileResult.result) {
      console.error("Compile diagnostics:", compileResult.diagnostics)
      throw new Error("Compile produced no result")
    }
    console.log(`Compiled OK — vector artifact: ${compileResult.result.length} bytes`)

    console.log("Initializing renderer...")
    const renderer = createTypstRenderer()
    await renderer.init({
      getModule: () => fetch(`${base}/renderer.wasm`),
    })

    const svg = await renderer.renderSvg({
      format: "vector",
      artifactContent: compileResult.result,
    })

    if (typeof svg !== "string" || !svg.includes("<svg")) {
      throw new Error("Renderer did not produce SVG output")
    }
    console.log(`Rendered OK — SVG output: ${svg.length} chars`)

    const outPath = path.join(__dirname, "typst-wasm-spike-output.svg")
    await writeFile(outPath, svg)
    console.log(`SVG written: ${outPath}`)

    if (streamingCalls < 1) {
      throw new Error(
        "WebAssembly.instantiateStreaming was never invoked — the wasm-bindgen glue silently fell back to a different path",
      )
    }
    console.log(
      `WebAssembly.instantiateStreaming was invoked ${streamingCalls} time(s) for correctly-MIME-typed responses — confirmed streaming path, not the slower buffer-based fallback.`,
    )

    console.log("OK")
  } finally {
    server.close()
  }
}

main().catch((err) => {
  console.error("Typst WASM browser spike FAILED")
  console.error(err)
  process.exitCode = 1
})
