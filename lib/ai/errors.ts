import { APICallError, NoObjectGeneratedError, RetryError } from "ai"

/**
 * Shared AI-call error handling, extracted from three near-identical copies
 * (`features/cv-import/actions.ts`, `features/github-import/actions.ts`, and
 * a differently-shaped third one in `features/ai-providers/actions.ts` that
 * is NOT migrated here — see below).
 *
 * `generateObject`'s `maxRetries` wraps the real provider failure in a
 * `RetryError` once retries are exhausted, exactly like `generateText` (this
 * was originally fixed in `features/ai-providers/actions.ts`'s
 * `unwrapRetryError` after every real 401/403/429 was silently falling
 * through to the generic fallback message instead of the specific one).
 * Both migrated call sites need the same unwrap before checking
 * `APICallError.isInstance`.
 *
 * `features/ai-providers/actions.ts` is deliberately NOT migrated to this
 * module: its `translateProviderError` wraps `generateText` (no
 * `NoObjectGeneratedError` branch) and its user-visible copy says "El
 * proveedor" rather than "El proveedor de IA" — folding it in here would
 * change user-visible copy on a path this extraction never touches.
 */
export function unwrapRetryError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err
}

export function translateAiError(
  err: unknown,
  options: { logLabel: string; fallback: string },
): string {
  const cause = unwrapRetryError(err)
  if (APICallError.isInstance(cause)) {
    // Every branch below used to return WITHOUT logging anything, so a real
    // provider failure left no trace on the server at all — the user got a
    // translated sentence and we got nothing to debug with.
    //
    // `responseBody` is the provider's own error payload (its JSON error
    // envelope), which is exactly what distinguishes "wrong key" from "no
    // credit" from "unknown model id". It is safe to log: it is the
    // provider talking back, not our request. `requestBodyValues` is
    // deliberately NOT logged — that one carries the full prompt, which on
    // these paths contains the user's CV and a third-party job posting.
    console.error(
      options.logLabel,
      "APICallError",
      `status=${cause.statusCode ?? "none"}`,
      `url=${cause.url ?? "unknown"}`,
      `body=${cause.responseBody ? cause.responseBody.slice(0, 1000) : "(empty)"}`,
    )
    if (cause.statusCode === 401 || cause.statusCode === 403) {
      return "El proveedor de IA rechazó la clave configurada: revisala en Ajustes."
    }
    if (cause.statusCode === 429) {
      return "El proveedor de IA devolvió un límite de uso (429). Probá de nuevo en un momento."
    }
    return `El proveedor de IA devolvió un error${cause.statusCode ? ` (${cause.statusCode})` : ""}.`
  }
  if (NoObjectGeneratedError.isInstance(cause)) {
    // Log the evidence before discarding it. This branch used to return
    // immediately, which meant the ONE thing needed to diagnose a
    // schema-compliance failure — what the model actually emitted — was
    // thrown away, leaving only an unactionable "invalid result" message.
    //
    // `finishReason: "length"` is the giveaway for a truncated response.
    // NOTE: the content-generating call sites no longer set
    // `maxOutputTokens` at all, so a `length` finish here means we hit the
    // PROVIDER'S OWN default ceiling — an invisible limit we do not control
    // and that can change without notice. That is precisely why this log
    // exists: it is the only way to see a wall we deliberately stopped
    // drawing ourselves. If it shows up, the fix is to set an explicit
    // budget again at that call site, informed by the `usage` numbers below
    // rather than guessed.
    //
    // Any other finish reason means the model produced complete but
    // non-conforming output, which matters most for providers that only get
    // the schema via prompt injection rather than a native
    // `response_format: json_schema`. `@ai-sdk/deepseek` is one of those:
    // its `convertToDeepSeekChatMessages` appends the schema to a system
    // message because the provider never enables `supportsStructuredOutputs`
    // (verified in the installed 3.0.5 and in 3.0.13 — upgrading does not
    // change this), so compliance is a best-effort request rather than an
    // API guarantee.
    //
    // `text` is the raw model output and can be long; cap it so a failure
    // never dumps an unbounded blob into the server log.
    console.error(
      options.logLabel,
      "NoObjectGeneratedError",
      `finishReason=${cause.finishReason ?? "unknown"}`,
      `usage=${JSON.stringify(cause.usage ?? null)}`,
      `text=${cause.text ? cause.text.slice(0, 1500) : "(empty)"}`,
    )
    return "El modelo no devolvió un resultado válido. Probá de nuevo."
  }
  console.error(
    options.logLabel,
    cause instanceof Error ? cause.message : "unknown error",
  )
  return options.fallback
}
