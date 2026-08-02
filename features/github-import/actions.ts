"use server"

import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { APICallError } from "ai"
import { z } from "zod"
import type { BatchItem } from "drizzle-orm/batch"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { cv } from "@/db/schema"
import { getConfiguredModelForUser } from "@/lib/ai/get-user-model"
import { inferCvLanguage } from "@/lib/ai/infer-language"
import { translateAiError, unwrapRetryError } from "@/lib/ai/errors"
import { getCvDraft } from "@/features/cv/actions"
import {
  findPersonalBank,
  resolveCvAndBank,
} from "@/features/career-bank/ownership"
import {
  buildBankMaterialQueries,
  flattenBankImportBatch,
  type BankEngagementSeed,
} from "@/features/career-bank/build-bank-queries"
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
    return {
      ok: false,
      error: translateAiError(err, {
        logLabel: "AI project extraction failed",
        fallback: "No se pudo generar el proyecto con IA. Probá de nuevo.",
      }),
      code: "provider_error",
    }
  }
}

// ---------------------------------------------------------------------------
// Bank destination (Decision 8) — GitHub import never touches the database
// on its own (the confirm handlers below only call client-side zustand
// actions), so promoting a reviewed draft to the bank needs its OWN server
// action, called BEFORE `addExperience`/`addProject` in `import-dialog.tsx`.
// It writes the bank rows and returns the minted ids so the caller can stamp
// `sourceMaterialId` onto the draft items before its single tracked `set()`
// — stamping provenance after that call is impossible without a second
// reconciliation pass.
// ---------------------------------------------------------------------------

const promoteImportedBulletInputSchema = z.object({
  clientKey: z.string(),
  content: z.string().trim().min(1),
})

const promoteImportedItemInputSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("experience"),
    company: z.string().trim().min(1),
    role: z.string().trim().min(1),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    bullets: z.array(promoteImportedBulletInputSchema),
    label: z.string().max(200),
  }),
  z.object({
    target: z.literal("project"),
    name: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    bullets: z.array(promoteImportedBulletInputSchema),
    label: z.string().max(200),
  }),
])

export type PromoteImportedItemInput = z.infer<
  typeof promoteImportedItemInputSchema
>

/**
 * Writes the bank side of a GitHub-imported experience/project: reuses (or
 * mints) a `bank_engagement` for the company/project, then one
 * `bank_material` + default `bank_material_variant` per bullet, each variant
 * labeled `importado: github:{owner}/{repo}` (the weaker provenance of an
 * AI-extracted bullet is handled by LABELING, not by skipping the bank).
 * Stamps `cv.bank_id` onto the target CV so later reads (e.g. adaptation
 * forwarding a source CV's bank) see the link.
 *
 * The destination bank is ALWAYS the caller's own live personal bank,
 * resolved server-side via `findPersonalBank` + `resolveCvAndBank` — never
 * trusted from the request payload, per the ownership invariant. The picker
 * in `import-dialog.tsx` only offers "Banco" once this same check confirms a
 * bank exists (`hasPersonalBank`), so reaching this function with no
 * personal bank is a race condition, not the expected path — handled as an
 * ordinary failure result, not a silent bank creation (a GitHub import must
 * not mint a bank behind the user's back any more than a file upload may).
 */
export async function promoteImportedItemToBank(
  cvId: string,
  input: unknown,
): Promise<
  Result<{
    engagementId: string | null
    bullets: { clientKey: string; materialId: string }[]
  }>
> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = promoteImportedItemInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de importación inválidos",
      code: "invalid_input",
    }
  }

  const personalBank = await findPersonalBank(userId)
  if (!personalBank) {
    return {
      ok: false,
      error: "No hay un banco disponible para este usuario",
      code: "not_found",
    }
  }

  const resolved = await resolveCvAndBank(cvId, personalBank.id, userId)
  if (!resolved || !resolved.bank) {
    return { ok: false, error: "No encontrado", code: "not_found" }
  }

  const data = parsed.data
  const engagement: BankEngagementSeed =
    data.target === "experience"
      ? {
          kind: "job",
          organization: data.company,
          role: data.role,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
        }
      : {
          kind: "project",
          name: data.name,
          url: data.url ?? null,
          description: data.description ?? null,
        }

  const { batch, engagementId, materialIds } = await buildBankMaterialQueries({
    bankId: resolved.bank.id,
    engagement,
    bullets: data.bullets.map((bullet) => ({
      content: bullet.content,
      label: data.label,
    })),
  })

  const queries: BatchItem<"pg">[] = [
    ...flattenBankImportBatch(batch),
    db.update(cv).set({ bankId: resolved.bank.id }).where(eq(cv.id, cvId)),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return {
    ok: true,
    data: {
      engagementId,
      bullets: data.bullets.map((bullet, index) => ({
        clientKey: bullet.clientKey,
        materialId: materialIds[index],
      })),
    },
  }
}
