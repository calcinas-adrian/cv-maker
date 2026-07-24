"use client"

// Phase 0 spike client component ("cv-editor-panel" SDD change). Runs two
// independent checks entirely in the browser, lazy-loaded via
// `next/dynamic({ ssr: false })` from ../typst-wasm-spike/page.tsx:
//
// 1. WASM/Turbopack check (task 0.1): does the browser bundle produced by
//    `next dev/build --turbopack` for @myriaddreamin/typst-ts-web-compiler +
//    -ts-renderer actually load and run? (The runtime WebAssembly mechanics
//    themselves are already proven in isolation by
//    scripts/typst-wasm-browser-spike.mjs — this checks the Turbopack
//    bundling path specifically.)
// 2. Template-load mechanism check (task 0.2): a static raw-string import
//    (`import classicTypRaw from "@/templates/classic.typ?raw"`) was tried
//    FIRST and FAILS `next build --turbopack` outright with "Unknown module
//    type" — this project's Turbopack config has no loader registered for
//    the `?raw` suffix on an arbitrary extension (see
//    sdd/cv-editor-panel/apply-progress for the isolated repro). That
//    import has been removed here; only the runtime-fetch mechanism (0.2b)
//    is exercised below, via the spike API route reading the canonical
//    templates/classic.typ file. Only string retrieval is checked — NOT a
//    full compile of classic.typ, which needs font loading (Phase 2.3
//    scope, out of bounds here).
import { useEffect, useState } from "react"

type StepStatus = "pending" | "ok" | "error"
type Step = { label: string; status: StepStatus; detail?: string }

const initialSteps: Step[] = [
  { label: "0.1 — compile trivial doc (font-free)", status: "pending" },
  { label: "0.1 — render compiled doc to SVG", status: "pending" },
  { label: "0.2b — runtime fetch of classic.typ", status: "pending" },
]

export default function TypstWasmSpike() {
  const [steps, setSteps] = useState<Step[]>(initialSteps)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    function update(index: number, status: StepStatus, detail?: string) {
      if (cancelled) return
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status, detail } : s)),
      )
    }

    async function run() {
      try {
        const { createTypstCompiler, createTypstRenderer } =
          await import("@myriaddreamin/typst.ts/main")
        const { CompileFormatEnum } =
          await import("@myriaddreamin/typst.ts/compiler")

        const compiler = createTypstCompiler()
        await compiler.init({
          getModule: () => fetch("/api/typst-wasm-spike/web-compiler.wasm"),
        })

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
          throw new Error(
            `compile produced no result: ${JSON.stringify(compileResult.diagnostics)}`,
          )
        }
        update(0, "ok", `${compileResult.result.length} bytes (vector)`)

        const renderer = createTypstRenderer()
        await renderer.init({
          getModule: () => fetch("/api/typst-wasm-spike/renderer.wasm"),
        })
        const svgResult = await renderer.renderSvg({
          format: "vector",
          artifactContent: compileResult.result,
        })
        if (typeof svgResult !== "string" || !svgResult.includes("<svg")) {
          throw new Error("renderer did not produce SVG output")
        }
        update(1, "ok", `${svgResult.length} chars`)
        if (!cancelled) setSvg(svgResult)

        // 0.2b — runtime fetch of the canonical template via the spike API
        // route. (0.2a, the `?raw` static import, already failed at build
        // time — see the file header comment.)
        const fetchedTemplate = await fetch(
          "/api/typst-wasm-spike/classic-template.typ",
        ).then((r) => r.text())
        if (!fetchedTemplate.includes("json.decode(sys.inputs.cvData)")) {
          throw new Error("fetched template content looks wrong")
        }
        update(
          2,
          "ok",
          `${fetchedTemplate.length} chars (fetched, content sanity-checked)`,
        )
      } catch (err) {
        console.error("Typst WASM spike failed", err)
        setSteps((prev) => {
          const firstPending = prev.findIndex((s) => s.status === "pending")
          if (firstPending === -1) return prev
          const next = [...prev]
          next[firstPending] = {
            ...next[firstPending],
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          }
          return next
        })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <ul>
        {steps.map((s) => (
          <li key={s.label} data-status={s.status}>
            [{s.status.toUpperCase()}] {s.label}
            {s.detail ? ` — ${s.detail}` : ""}
          </li>
        ))}
      </ul>
      {svg ? (
        <div
          data-testid="typst-spike-svg"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
    </div>
  )
}
