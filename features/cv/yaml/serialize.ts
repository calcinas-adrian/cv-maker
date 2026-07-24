import { parse, stringify, YAMLParseError } from "yaml"
import { cvDataSchema, type CvData } from "@/schemas/cv.schema"

/**
 * YAML<->CvData serialization for the YAML editor view (5.3/5.4).
 *
 * `validateYaml` is the single source of truth for "is this YAML a valid
 * CvData" — both the CodeMirror inline linter (`yaml-editor.tsx`) and the
 * debounced commit path (`yaml-panel.tsx`) call it, so they can never
 * disagree about what counts as valid.
 */

export function cvDataToYaml(data: CvData): string {
  return stringify(data)
}

export type YamlValidationResult =
  | { ok: true; data: CvData }
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

  const result = cvDataSchema.safeParse(parsed ?? {})
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join(".")
    const message = path ? `${path}: ${issue.message}` : issue?.message
    return { ok: false, error: message ?? "Datos inválidos" }
  }

  return { ok: true, data: result.data }
}
