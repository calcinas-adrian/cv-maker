/**
 * Shared between `actions.ts` (a `"use server"` file, so this constant
 * can't live there) and `import-from-file-dialog.tsx`.
 */
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024 // 8 MB

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const

// Belt-and-suspenders alongside the mime-type check — some browsers/OSes
// send a generic `application/octet-stream` mime type for one or both of
// these extensions, so the filename extension is checked independently
// rather than trusted to always agree with `file.type`.
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const

export const UNSUPPORTED_FILE_TYPE_ERROR =
  "Solo se admiten archivos PDF y DOCX (los .doc antiguos no son compatibles)."

export const FILE_TOO_LARGE_ERROR = `El archivo supera el límite de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
