import "server-only"

import { PDFParse, InvalidPDFException, PasswordException } from "pdf-parse"
import mammoth from "mammoth"
import type { Result } from "@/lib/result"
import { UNSUPPORTED_FILE_TYPE_ERROR } from "./constants"

// Mirrors the ~8-10k char precedent from `features/github-import/octokit.ts`'s
// README truncation — generous enough for a full resume's substance without
// ballooning the AI extraction prompt.
const MAX_EXTRACTED_CHARS = 9000

// Below this, extracted text is treated as "nothing meaningful was found"
// rather than sent to the AI as if it were a real (if short) CV — the
// classic failure mode here is a scanned/image-only PDF with no text
// layer, where `getText()`/`extractRawText()` succeed but return only
// whitespace or a handful of stray characters (page numbers, watermarks).
const MIN_MEANINGFUL_CHARS = 40

function truncate(text: string): string {
  return text.length > MAX_EXTRACTED_CHARS
    ? text.slice(0, MAX_EXTRACTED_CHARS)
    : text
}

/**
 * `pdf-parse@2.4.5` gotcha check (verified against the installed package,
 * not recalled from memory — this package name has historically shipped
 * versions with debug/test code in the root `index.js` that could execute
 * unwanted logic, e.g. reading a bundled test fixture, depending on how the
 * module was required/bundled): the installed 2.4.5 is a full rewrite by a
 * different maintainer (`mehmet-kozan`) with a proper `exports` map and a
 * class-based API (`PDFParse`) — there is no top-level callable function
 * like the old v1 API, and reading the actual shipped
 * `dist/pdf-parse/cjs/index.cjs` turned up none of the historical
 * `isDebugMode`/`test/data/*.pdf` footgun (confirmed via `grep`, not
 * assumed). Importing the package root (`"pdf-parse"`) is therefore safe
 * here — no need to reach into an internal `lib/pdf-parse.js` path the way
 * the v1 footgun would have required.
 *
 * API shape (from the installed `dist/pdf-parse/cjs/index.d.cts`):
 * `new PDFParse({ data }).getText()` resolves a `TextResult` with a
 * concatenated `.text` string; `data` accepts a Node `Buffer` directly (the
 * constructor converts it to a `Uint8Array`, per its own doc comment).
 * `PasswordException` is thrown for a password-protected PDF,
 * `InvalidPDFException` for a corrupted/non-PDF payload — both exported
 * from the package root and narrowed below into actionable messages.
 */
async function extractFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

/**
 * `mammoth@1.12.0`'s `extractRawText({ buffer })` (verified against the
 * installed package's shipped `lib/index.d.ts`, not recalled from memory)
 * resolves `{ value: string, messages: Message[] }` — `value` is the raw
 * text with paragraph breaks, `messages` are non-fatal warnings (e.g.
 * "unrecognized style") that are intentionally ignored here, same as this
 * feature ignores `mammoth`'s HTML-conversion features entirely: raw text
 * is the only thing the AI extraction step in `ai-extract.ts` needs.
 *
 * Mammoth only understands the modern `.docx` OOXML format, never the
 * legacy binary `.doc` format — enforced above this function by the
 * extension/mime check in `extractTextFromFile`, not by mammoth itself
 * (mammoth would just throw a cryptic zip-parsing error on a `.doc` file).
 */
async function extractFromDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer })
  return value
}

function isPdfFile(mimeType: string, filename: string): boolean {
  return (
    mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")
  )
}

function isDocxFile(mimeType: string, filename: string): boolean {
  return (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  )
}

/**
 * Extracts plain text from an uploaded PDF or DOCX resume so
 * `features/cv-import/ai-extract.ts` has something to hand the model.
 * Never throws — every failure mode (unsupported type, corrupted/
 * password-protected file, a scanned PDF with no real text layer) resolves
 * to an actionable `Result` error instead of a raw exception/stack trace,
 * matching `translateGithubError`/`translateProviderError`'s discipline
 * elsewhere in this codebase.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<Result<string>> {
  const isPdf = isPdfFile(mimeType, filename)
  const isDocx = isDocxFile(mimeType, filename)

  if (!isPdf && !isDocx) {
    return { ok: false, error: UNSUPPORTED_FILE_TYPE_ERROR, code: "file_error" }
  }

  let rawText: string
  try {
    rawText = isPdf
      ? await extractFromPdf(buffer)
      : await extractFromDocx(buffer)
  } catch (err) {
    console.error(
      "CV document parsing failed",
      err instanceof Error ? err.message : "unknown error",
    )
    if (isPdf && err instanceof PasswordException) {
      return {
        ok: false,
        error:
          "El PDF está protegido con contraseña. Subí una versión sin contraseña.",
        code: "file_error",
      }
    }
    if (isPdf && err instanceof InvalidPDFException) {
      return {
        ok: false,
        error: "El PDF parece estar dañado o no es un PDF válido.",
        code: "file_error",
      }
    }
    return {
      ok: false,
      error: isPdf
        ? "No se pudo leer el PDF. Puede estar dañado o protegido con contraseña."
        : "No se pudo leer el DOCX. Puede estar dañado.",
      code: "file_error",
    }
  }

  const trimmed = rawText.trim()
  if (trimmed.length < MIN_MEANINGFUL_CHARS) {
    return {
      ok: false,
      error:
        "No pudimos extraer texto de este archivo — ¿es un PDF escaneado sin texto?",
      code: "file_error",
    }
  }

  return { ok: true, data: truncate(trimmed) }
}
