/**
 * Generic server-action result envelope, shared across every feature that
 * returns a success/failure outcome from a `"use server"` action (cv,
 * ai-providers, github-import, cv-import, render, …). Lives here rather than
 * inside any single feature's actions file because it's a cross-cutting
 * utility type, not a CV-domain concept.
 *
 * `code` is a coarse, stable, machine-readable failure category — callers
 * (route handlers, client components) MUST branch on `code`, never on the
 * human-readable, Spanish `error` message text. The message can be reworded
 * freely (translation passes, copy tweaks) without breaking any consumer, as
 * long as the `code` for that failure stays the same.
 */
export type ResultErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "provider_not_configured"
  | "provider_error"
  | "file_error"
  | "github_reauth_required"
  | "repo_too_large"
  | "digest_failed"
  | "unknown"

export type Result<T> =
  { ok: true; data: T } | { ok: false; error: string; code: ResultErrorCode }
