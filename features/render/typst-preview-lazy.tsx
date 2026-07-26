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
import { FileCogIcon } from "lucide-react"
import type { TypstPreviewProps } from "./typst-preview"

const TypstPreview = dynamic(() => import("./typst-preview"), {
  ssr: false,
  // Deliberately NOT a `DocumentSkeleton` — `next/dynamic`'s `loading`
  // callback only receives `{ isLoading, pastDelay, error }`, never the
  // wrapped component's `data`/`theme` props, so this state genuinely
  // cannot be content-aware. It's also a different kind of wait (downloading
  // the ~12MB WASM engine, not "your content is compiling"), so it gets its
  // own "spinning up a tool" identity instead of an emptier document mockup.
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <FileCogIcon
        aria-hidden
        className="text-muted-foreground size-8 animate-pulse"
      />
      <div className="text-muted-foreground text-xs">
        Cargando motor de vista previa…
      </div>
    </div>
  ),
})

export function TypstPreviewLazy(props: TypstPreviewProps) {
  return <TypstPreview {...props} />
}
