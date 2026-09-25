import { parse, stringify, YAMLParseError, type ErrorCode } from "yaml"
import type { ZodIssue } from "zod"
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

const YAML_GENERIC_ERROR = "Hay un error de formato en esta línea."

/**
 * Spanish messages for the `yaml` library's parse error codes. `yaml`'s own
 * `YAMLParseError.message` is English and leans on YAML-spec vocabulary
 * ("implicit key", "flow", "directive") that means nothing to a
 * non-technical user, so this maps by `code` — stable across message-text
 * changes upstream — instead of translating the message string itself.
 *
 * `Record<ErrorCode, string>` is exhaustive over yaml@2.9's `ErrorCode`
 * union, so every current code already has a real message; the `??`
 * fallback in `yamlErrorToSpanish` only matters for a future yaml upgrade
 * that adds a code this map hasn't been updated for yet.
 */
const YAML_ERROR_MESSAGES: Record<ErrorCode, string> = {
  ALIAS_PROPS: "Una referencia (alias) no puede tener propiedades adicionales.",
  BAD_ALIAS: "La referencia (alias) usada acá no es válida.",
  BAD_COLLECTION_TYPE:
    "El tipo de lista u objeto no es el esperado en este punto.",
  BAD_DIRECTIVE:
    "Hay una directiva de YAML no reconocida al principio del archivo.",
  BAD_DQ_ESCAPE:
    "Hay una secuencia de escape inválida dentro de las comillas dobles.",
  BAD_INDENT:
    "La indentación (los espacios al principio de la línea) no es válida.",
  BAD_PROP_ORDER: "El orden de las propiedades de este nodo no es válido.",
  BAD_SCALAR_START:
    "Este valor empieza con un caracter que no está permitido acá.",
  BLOCK_AS_IMPLICIT_KEY:
    "Esta línea no se puede usar como clave; puede faltar una comilla o los dos puntos (:).",
  BLOCK_IN_FLOW:
    "No se puede mezclar este formato acá; revisá los corchetes o llaves.",
  DUPLICATE_KEY: "Hay una clave repetida en este bloque.",
  IMPOSSIBLE: YAML_GENERIC_ERROR,
  KEY_OVER_1024_CHARS: "Esta clave es demasiado larga.",
  MISSING_CHAR:
    "Falta un caracter en esta línea (por ejemplo, ':' o una comilla de cierre).",
  MULTILINE_IMPLICIT_KEY: "Una clave no puede ocupar más de una línea.",
  MULTIPLE_ANCHORS: "Este nodo ya tiene una referencia (&) asignada.",
  MULTIPLE_DOCS:
    "Este editor admite un solo documento; se encontró más de uno separado por '---'.",
  MULTIPLE_TAGS: "Este nodo ya tiene un tipo (tag) asignado.",
  NON_STRING_KEY: "Las claves deben ser texto simple.",
  RESOURCE_EXHAUSTION:
    "El documento es demasiado grande o complejo para procesarlo.",
  TAB_AS_INDENT: "No se pueden usar tabs para indentar en YAML; usá espacios.",
  TAG_RESOLVE_FAILED: "No se pudo interpretar el tipo (tag) usado acá.",
  UNEXPECTED_TOKEN: "Hay un caracter inesperado en esta línea.",
}

function yamlErrorToSpanish(err: YAMLParseError): string {
  return YAML_ERROR_MESSAGES[err.code] ?? YAML_GENERIC_ERROR
}

/** `path` segments as `experiences[0].company` instead of a raw dot-join of
 * mixed string/number segments — the field names themselves stay in English
 * (they're the schema's actual property names, same as every other
 * identifier in this codebase), but the shape reads like a real path. */
function formatIssuePath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`
    return acc ? `${acc}.${String(segment)}` : String(segment)
  }, "")
}

const ZOD_TYPE_LABELS: Partial<Record<string, string>> = {
  string: "texto",
  number: "un número",
  int: "un número entero",
  boolean: "verdadero o falso",
  array: "una lista",
  object: "un objeto",
  date: "una fecha",
  null: "nulo",
  undefined: "vacío",
}

/**
 * Spanish messages for zod v4 issue codes (`ZodIssue["code"]`, verified
 * against zod@4.4's `$ZodIssue` union in `node_modules` — v4 renamed several
 * v3 codes, e.g. `invalid_string` -> `invalid_format`). None of the schemas
 * `yamlCvSchema` is built from (`cvDataSchema` and friends, in
 * `schemas/cv.schema.ts`) set a custom `.min()`/`.max()`/refine message, so
 * every issue reaching here still carries zod's own English default —
 * translating by `code` instead of relaying `issue.message` is what fixes
 * that. The `custom` case is the one exception: it exists for a future
 * `.refine()`/`.superRefine()` that DOES set its own message, so that
 * author-supplied text is kept verbatim rather than replaced.
 */
function zodIssueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type": {
      const label = ZOD_TYPE_LABELS[issue.expected] ?? issue.expected
      return `El valor debería ser ${label}.`
    }
    case "too_small": {
      const noun =
        issue.origin === "string"
          ? "caracteres"
          : issue.origin === "array"
            ? "elementos"
            : null
      return noun
        ? `Debe tener al menos ${issue.minimum} ${noun}.`
        : `El valor es menor al mínimo permitido (${issue.minimum}).`
    }
    case "too_big": {
      const noun =
        issue.origin === "string"
          ? "caracteres"
          : issue.origin === "array"
            ? "elementos"
            : null
      return noun
        ? `No puede tener más de ${issue.maximum} ${noun}.`
        : `El valor supera el máximo permitido (${issue.maximum}).`
    }
    case "invalid_format":
      if (issue.format === "email") return "El email no es válido."
      if (issue.format === "url") return "La URL no es válida."
      return `El formato no es válido (se esperaba "${issue.format}").`
    case "not_multiple_of":
      return `El valor debe ser múltiplo de ${issue.divisor}.`
    case "unrecognized_keys":
      return `Hay campos que no se reconocen: ${issue.keys.join(", ")}.`
    case "invalid_union":
      return "El valor no coincide con ninguno de los formatos permitidos."
    case "invalid_key":
      return "Hay una clave con un valor no válido."
    case "invalid_element":
      return "Hay un elemento con un valor no válido."
    case "invalid_value":
      return `El valor debe ser uno de: ${issue.values.join(", ")}.`
    case "custom":
      return issue.message || "El valor no es válido."
    default:
      return "Hay un error de validación en este campo."
  }
}

function zodIssueToSpanish(issue: ZodIssue): string {
  const path = formatIssuePath(issue.path)
  const message = zodIssueMessage(issue)
  return path ? `${path}: ${message}` : message
}

export function validateYaml(source: string): YamlValidationResult {
  let parsed: unknown
  try {
    parsed = parse(source)
  } catch (err) {
    if (err instanceof YAMLParseError) {
      const [from, to] = err.pos
      return { ok: false, error: yamlErrorToSpanish(err), from, to }
    }
    return { ok: false, error: YAML_GENERIC_ERROR }
  }

  const result = yamlCvSchema.safeParse(parsed ?? {})
  if (!result.success) {
    const issue = result.error.issues[0]
    return {
      ok: false,
      error: issue ? zodIssueToSpanish(issue) : "Datos inválidos",
    }
  }

  return { ok: true, data: result.data }
}
