"use client"

// The `dynamic(..., { ssr: false })` call MUST live inside a Client
// Component — Turbopack/Next 16 rejects `ssr: false` when the call site is
// a Server Component (confirmed by the Phase 0 spike; see
// `app/typst-wasm-spike/spike-client-wrapper.tsx` and
// `sdd/cv-editor-panel/apply-progress`). This is the real, production
// counterpart of that spike wrapper: Phase 4 mounts `TypstPreviewLazy`
// (not `./typst-preview` directly), so `typst-client.ts`'s ~12MB WASM+font
// engine only code-splits into the bundle once the preview pane mounts —
// form/YAML editing stays fully interactive while it loads.
import dynamic from "next/dynamic"
import type { TypstPreviewProps } from "./typst-preview"

const TypstPreview = dynamic(() => import("./typst-preview"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
      Cargando motor de vista previa…
    </div>
  ),
})

export function TypstPreviewLazy(props: TypstPreviewProps) {
  return <TypstPreview {...props} />
}
