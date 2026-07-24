"use client"

// The `dynamic(..., { ssr: false })` call MUST live inside a Client
// Component — Turbopack/Next 16 rejects `ssr: false` when the call site is
// a Server Component (confirmed by this spike; see
// sdd/cv-editor-panel/apply-progress). This mirrors the real call site:
// `features/cv/cv-editor.tsx` (Phase 4.6's mount point for the real
// preview) is already `"use client"`, so the real
// `typst-preview.tsx` lazy-import will naturally happen from client-side
// code, same as here.
import dynamic from "next/dynamic"

const TypstWasmSpike = dynamic(() => import("./spike-client"), {
  ssr: false,
  loading: () => <p>Loading WASM engine…</p>,
})

export default function TypstWasmSpikeWrapper() {
  return <TypstWasmSpike />
}
