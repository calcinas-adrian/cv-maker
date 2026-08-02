import { parse, stringify, YAMLParseError } from "yaml"
import type { CvData } from "@/schemas/cv.schema"
import { toYamlView, yamlCvSchema, type YamlCvData } from "./projection"

/**
 * YAML<->CvData serialization for the YAML editor view (5.3/5.4).
 *
 * `validateYaml` is the single source of truth for "is this YAML a valid
 * document" — both the CodeMirror inline linter (`yaml-editor.tsx`) and the
 * debounced commit path (`yaml-panel.tsx`) call it, so they can never
 * disagree about what counts as valid. It validates against `yamlCvSchema`
 * (career-bank-restructure Decision 5), NOT `cvDataSchema`: bullets in the
 * YAML view are plain strings, so it returns `YamlCvData`. The commit path
 * is responsible for turning that into `CvData` via `fromYamlView`, which
 * needs the store's current draft to reconcile bullet provenance.
 */

export function cvDataToYaml(data: CvData): string {
  return stringify(toYamlView(data))
}

export type YamlValidationResult =
  | { ok: true; data: YamlCvData }
  // `from`/`to` are character offsets into the source when known (YAML
  // syntax errors carry a precise position); omitted for schema-validation
  // failures, where the offending value has no single source location to
  // point at without walking the YAML CST.
  | { ok: false; error: string; from?: number; to?: number }

export function validateYaml(source: string): YamlValidationResult {
  let parsed: unknown
  try {
    parsed = parse(source)
  } catch (err) {
    if (err instanceof YAMLParseError) {
      const [from, to] = err.pos
      return { ok: false, error: err.message, from, to }
    }
    return { ok: false, error: "YAML inválido" }
  }

  const result = yamlCvSchema.safeParse(parsed ?? {})
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join(".")
    const message = path ? `${path}: ${issue.message}` : issue?.message
    return { ok: false, error: message ?? "Datos inválidos" }
  }

  return { ok: true, data: result.data }
}
