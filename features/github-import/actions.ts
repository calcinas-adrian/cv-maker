"use server"

import { headers } from "next/headers"
import { APICallError, NoObjectGeneratedError, RetryError } from "ai"
import { auth } from "@/lib/auth"
import { getConfiguredModelForUser } from "@/lib/ai/get-user-model"
import { inferCvLanguage } from "@/lib/ai/infer-language"
import { getCvDraft } from "@/features/cv/actions"
import type { Result } from "@/lib/result"
import type {
  ExperienceExtract,
  ProjectExtract,
} from "@/schemas/github-import.schema"
import { buildCodeDigest } from "./code-digest"
import { extractFromRepoData } from "./ai-extract"
import {
  codeForGithubError,
  getGithubConnectionStatus,
  getRepoDetails,
  listUserRepos as octokitListUserRepos,
  translateGithubError,
  type GithubConnectionStatus,
  type RepoDetails,
  type RepoSummary,
} from "./octokit"

async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/**
 * `generateObject`'s `maxRetries` wraps the real provider failure in a
 * `RetryError` once retries are exhausted, exactly like `generateText` (see
 * `features/ai-providers/actions.ts`'s `unwrapRetryError` — this was fixed
 * there after retried provider errors were getting masked by the generic
 * fallback message below; unwrapping here too instead of reintroducing the
 * same bug for the `generateObject` call in `ai-extract.ts`).
 */
function unwrapRetryError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err
}

function translateAiError(err: unknown): string {
  const cause = unwrapRetryError(err)
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 401 || cause.statusCode === 403) {
      return "El proveedor de IA rechazó la clave configurada: revisala en Ajustes."
    }
    if (cause.statusCode === 429) {
      return "El proveedor de IA devolvió un límite de uso (429). Probá de nuevo en un momento."
    }
    return `El proveedor de IA devolvió un error${cause.statusCode ? ` (${cause.statusCode})` : ""}.`
  }
  if (NoObjectGeneratedError.isInstance(cause)) {
    return "El modelo no devolvió un resultado válido. Probá de nuevo."
  }
  console.error(
    "AI project extraction failed",
    cause instanceof Error ? cause.message : "unknown error",
  )
  return "No se pudo generar el proyecto con IA. Probá de nuevo."
}

export async function checkGithubConnection(): Promise<
  Result<GithubConnectionStatus>
> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  try {
    const status = await getGithubConnectionStatus()
    return { ok: true, data: status }
  } catch (err) {
    console.error(
      "GitHub connection check failed",
      err instanceof Error ? err.message : "unknown error",
    )
    return {
      ok: false,
      error: "No se pudo verificar la conexión con GitHub.",
      code: "unknown",
    }
  }
}

export async function listUserRepos(
  includeForks = false,
): Promise<Result<RepoSummary[]>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  try {
    const repos = await octokitListUserRepos(includeForks)
    return { ok: true, data: repos }
  } catch (err) {
    return {
      ok: false,
      error: translateGithubError(err),
      code: codeForGithubError(err),
    }
  }
}

export type GithubImportTarget = "project" | "experience"
export type GithubImportDepth = "full_code" | "readme_only"

/**
 * Metadata shared by both extraction targets, describing how the draft was
 * produced — surfaced to `import-dialog.tsx` so it can show the right
 * warning banners without the caller needing to inspect `mode` itself.
 */
export type ExtractResultMeta = {
  hadReadme: boolean
  usedCodeDigest: boolean
  // Non-null only when `mode: "full_code"` was requested but the code
  // digest pipeline failed and the import fell back to metadata + README —
  // see the fallback-vs-hard-fail decision documented below.
  codeDigestWarning: string | null
}

export type ProjectExtractResult = ProjectExtract & ExtractResultMeta
export type ExperienceExtractResult = ExperienceExtract & ExtractResultMeta

type ExtractFromRepoParams = {
  cvId: string
  owner: string
  repo: string
  mode: GithubImportDepth
}

/**
 * Fetches one repo's details (and, in `"full_code"` mode, a compressed
 * source-code digest) and runs the AI extraction against the user's own
 * configured provider key, drafting either a `project` or an `experience`
 * entry. Nothing is persisted here — the caller (the import dialog) only
 * applies this to the client draft after the user reviews/edits it in the
 * same form used everywhere else (`ProjectForm`/`ExperienceForm`).
 */
export async function extractFromRepo(
  params: ExtractFromRepoParams & { target: "project" },
): Promise<Result<ProjectExtractResult>>
export async function extractFromRepo(
  params: ExtractFromRepoParams & { target: "experience" },
): Promise<Result<ExperienceExtractResult>>
export async function extractFromRepo(
  params: ExtractFromRepoParams & { target: GithubImportTarget },
): Promise<Result<ProjectExtractResult | ExperienceExtractResult>> {
  const { cvId, owner, repo, target, mode } = params

  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  // Reuses `getCvDraft`'s existing ownership check (a client-supplied
  // cvId from another user's CV resolves to "No encontrado" here, same as
  // every other cv action) and, as a side benefit, gives us the CV's own
  // `summary` text as a cheap language-inference signal — no separate
  // ownership query duplicated in this file.
  const draftResult = await getCvDraft(cvId)
  if (!draftResult.ok) return draftResult

  const modelResult = await getConfiguredModelForUser(userId)
  if (!modelResult.ok) return modelResult

  let repoDetails: RepoDetails
  try {
    repoDetails = await getRepoDetails(owner, repo)
  } catch (err) {
    return {
      ok: false,
      error: translateGithubError(err),
      code: codeForGithubError(err),
    }
  }

  let codeDigest: string | null = null
  let codeDigestWarning: string | null = null

  if (mode === "full_code") {
    const digestResult = await buildCodeDigest(owner, repo, repoDetails.sizeKb)
    if (digestResult.ok) {
      codeDigest = digestResult.data
    } else {
      // Fallback-vs-hard-fail decision: fall back to README-only rather
      // than aborting the whole import. The user already waited through a
      // real download+extraction attempt; if it failed for a recoverable
      // reason (repo too large, a transient GitHub hiccup, an
      // unexpectedly-empty digest after filtering), a README-based draft
      // with a visible warning is strictly more useful than nothing — the
      // human review step downstream is the safety net either way, and the
      // user can always retry with "Solo README" explicitly if they'd
      // rather skip straight to that. Hard-failing only makes sense if
      // metadata/README fetching itself is what failed, which is handled
      // separately above (`getRepoDetails`'s own try/catch).
      codeDigestWarning = digestResult.error
    }
  }

  try {
    if (target === "project") {
      const extracted = await extractFromRepoData(
        modelResult.data.model,
        repoDetails,
        {
          cvLanguage: inferCvLanguage(draftResult.data.summary),
          codeDigest,
          target: "project",
        },
      )
      return {
        ok: true,
        data: {
          ...extracted,
          hadReadme: repoDetails.readme !== null,
          usedCodeDigest: codeDigest !== null,
          codeDigestWarning,
        },
      }
    }

    const extracted = await extractFromRepoData(
      modelResult.data.model,
      repoDetails,
      {
        cvLanguage: inferCvLanguage(draftResult.data.summary),
        codeDigest,
        target: "experience",
      },
    )
    return {
      ok: true,
      data: {
        ...extracted,
        hadReadme: repoDetails.readme !== null,
        usedCodeDigest: codeDigest !== null,
        codeDigestWarning,
      },
    }
  } catch (err) {
    // Log only a minimal, safe subset — never the raw error object (it can
    // carry `requestBodyValues`/`responseBody`) and never the api key. Same
    // discipline as `features/ai-providers/actions.ts`'s
    // `validateProviderKey`.
    const cause = unwrapRetryError(err)
    console.error(
      "AI project/experience extraction from repo failed",
      typeof modelResult.data.model === "string"
        ? modelResult.data.model
        : modelResult.data.model.provider,
      APICallError.isInstance(cause)
        ? cause.statusCode
        : cause instanceof Error
          ? cause.message
          : "unknown error",
    )
    return { ok: false, error: translateAiError(err), code: "provider_error" }
  }
}
