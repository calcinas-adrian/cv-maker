// Phase 0 spike page ("cv-editor-panel" SDD change) — not linked from any
// nav, unauthenticated by design (outside the `(dashboard)` route group).
// Stays a Server Component; the `ssr: false` dynamic import lives in the
// Client Component wrapper below it (see spike-client-wrapper.tsx for why).
import TypstWasmSpike from "./spike-client-wrapper"

export default function TypstWasmSpikePage() {
  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>Typst WASM Turbopack spike (Phase 0)</h1>
      <TypstWasmSpike />
    </main>
  )
}
