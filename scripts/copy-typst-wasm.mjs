// Copies the browser Typst compiler/renderer WASM binaries into
// `public/typst/` so they're served as static files (CDN on Vercel).
//
// They used to be read at request time by `app/api/typst-assets/[file]`,
// but with pnpm `node_modules/@myriaddreamin/<pkg>` is a symlink: file
// tracing ships the real `.pnpm/...` path, not the symlink, so the route hit
// ENOENT on Vercel. Build-time copying avoids the serverless filesystem
// entirely. Runs before `dev` and `build`; the output is gitignored.
import { copyFile, mkdir, realpath } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const outDir = path.join(root, "public", "typst")

const ASSETS = [
  {
    source: [
      "@myriaddreamin",
      "typst-ts-web-compiler",
      "pkg",
      "typst_ts_web_compiler_bg.wasm",
    ],
    target: "web-compiler.wasm",
  },
  {
    source: [
      "@myriaddreamin",
      "typst-ts-renderer",
      "pkg",
      "typst_ts_renderer_bg.wasm",
    ],
    target: "renderer.wasm",
  },
]

await mkdir(outDir, { recursive: true })
for (const { source, target } of ASSETS) {
  const from = await realpath(path.join(root, "node_modules", ...source))
  await copyFile(from, path.join(outDir, target))
  console.log(`copy-typst-wasm: ${target}`)
}
