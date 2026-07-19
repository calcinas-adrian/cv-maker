import "server-only"

import { headers } from "next/headers"
import { Octokit, RequestError } from "octokit"
import { APIError } from "better-auth"
import { auth } from "@/lib/auth"
import type { ResultErrorCode } from "@/lib/result"

/**
 * The scope requested via incremental OAuth linking (see
 * `features/github-import/connect-github-button.tsx`). Everything here
 * assumes the current session's GitHub account either has it or doesn't —
 * there is no partial-scope handling beyond that binary.
 */
const REQUIRED_SCOPE = "repo"

/**
 * Thrown whenever the current user can't be given a working, sufficiently-
 * scoped GitHub client — no linked account, insufficient scope, or GitHub
 * itself rejecting the stored token (revoked/expired refresh). Callers
 * (features/github-import/actions.ts) turn this into an actionable
 * "(re)connect your GitHub account" Result error, never a raw exception.
 */
export class GithubAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GithubAuthError"
  }
}

export type GithubConnectionStatus = "not_connected" | "missing_scope" | "ready"

/**
 * Resolves the current session's stored GitHub access token via Better
 * Auth's `/get-access-token` endpoint.
 *
 * Verified against the installed `better-auth@1.6.23` source (not
 * recalled from memory): `auth.api.getAccessToken({ body: { providerId },
 * headers })` resolves the calling user from the session in `headers`
 * (ignoring any client-supplied `userId`, since the account route's
 * `resolveUserId` prefers the session's id when one exists), looks up that
 * user's `github` `account` row, transparently refreshes the token if it's
 * within 5s of expiry (persisting the refresh), and returns
 * `{ accessToken, accessTokenExpiresAt, scopes, idToken }` where `scopes`
 * is `account.scope.split(",")`. It throws a `better-auth` `APIError`
 * (`BAD_REQUEST`/`ACCOUNT_NOT_FOUND`) if no GitHub account is linked at
 * all, and `UNAUTHORIZED` if there's no session — both are treated
 * identically here as "not connected".
 */
async function getGithubTokens(): Promise<{
  accessToken: string
  scopes: string[]
}> {
  try {
    const { accessToken, scopes } = await auth.api.getAccessToken({
      body: { providerId: "github" },
      headers: await headers(),
    })
    return { accessToken, scopes }
  } catch (err) {
    if (err instanceof APIError) {
      throw new GithubAuthError(
        "No hay una cuenta de GitHub conectada. Conectala para importar un repo.",
      )
    }
    throw err
  }
}

/**
 * Cheap connection probe for the import UI — reads (and silently
 * refreshes) the stored token without making any GitHub API call, so the
 * dialog can decide between "connect", "reconnect for more permissions",
 * or "show the repo list" before spending a real GitHub request.
 */
export async function getGithubConnectionStatus(): Promise<GithubConnectionStatus> {
  try {
    const { scopes } = await getGithubTokens()
    return scopes.includes(REQUIRED_SCOPE) ? "ready" : "missing_scope"
  } catch (err) {
    if (err instanceof GithubAuthError) return "not_connected"
    throw err
  }
}

async function getOctokitForUser(): Promise<Octokit> {
  const { accessToken, scopes } = await getGithubTokens()

  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw new GithubAuthError(
      "Tu conexión con GitHub no tiene permiso para leer tus repos. Reconectá tu cuenta.",
    )
  }

  return new Octokit({ auth: accessToken })
}

/**
 * Narrows a raw Octokit failure into the same actionable `GithubAuthError`
 * used above for a revoked/insufficient token (a 401/403 from GitHub
 * itself, as opposed to a missing/under-scoped token detected locally) —
 * any other error is rethrown as-is and translated by the caller.
 */
function rethrowGithubError(err: unknown): never {
  if (
    err instanceof RequestError &&
    (err.status === 401 || err.status === 403)
  ) {
    throw new GithubAuthError(
      "GitHub rechazó el acceso (permisos revocados o insuficientes). Reconectá tu cuenta.",
    )
  }
  throw err
}

/**
 * Never a raw exception/stack trace to the client — mirrors
 * `features/ai-providers/actions.ts`'s `translateProviderError`.
 *
 * Lives here (rather than in `features/github-import/actions.ts`, which is
 * where it originally lived in Phase 5) so `code-digest.ts` can reuse the
 * exact same translation for tarball-download failures without importing
 * from `actions.ts` — that would create `actions.ts` -> `code-digest.ts` ->
 * `actions.ts` circular imports, since `actions.ts` also imports from
 * `code-digest.ts` to wire the full-code import path together.
 */
export function translateGithubError(err: unknown): string {
  if (err instanceof GithubAuthError) return err.message
  console.error(
    "GitHub import failed",
    err instanceof Error ? err.message : "unknown error",
  )
  return "No se pudo acceder a GitHub. Probá de nuevo."
}

/**
 * Mirrors `translateGithubError`'s branching so the `Result`'s `code` always
 * matches the message it was derived from: a revoked/insufficient/expired
 * GitHub token is the one case actionable enough to earn its own code
 * (`import-dialog.tsx` could use it to prompt a reconnect); anything else
 * (rate limit, network error, GitHub outage, …) is a genuinely unpredictable
 * failure with no more specific bucket to put it in.
 */
export function codeForGithubError(err: unknown): ResultErrorCode {
  return err instanceof GithubAuthError ? "github_reauth_required" : "unknown"
}

export type RepoSummary = {
  owner: string
  name: string
  fullName: string
  description: string | null
  fork: boolean
  updatedAt: string
}

/**
 * Lists the authenticated user's own repos (`affiliation: "owner"` — this
 * is a personal CV-import feature, not an org repo browser). Forks are
 * excluded by default since a fork rarely represents the user's own work;
 * pass `includeForks: true` to include them.
 */
export async function listUserRepos(
  includeForks = false,
): Promise<RepoSummary[]> {
  const octokit = await getOctokitForUser()

  try {
    const repos = await octokit.paginate(
      octokit.rest.repos.listForAuthenticatedUser,
      {
        per_page: 100,
        sort: "updated",
        affiliation: "owner",
      },
    )

    return repos
      .filter((repo) => includeForks || !repo.fork)
      .map((repo) => ({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        fork: repo.fork,
        updatedAt: repo.pushed_at ?? repo.updated_at ?? "",
      }))
  } catch (err) {
    return rethrowGithubError(err)
  }
}

export type RepoDetails = {
  name: string
  fullName: string
  description: string | null
  topics: string[]
  languages: string[]
  createdAt: string | null
  pushedAt: string | null
  readme: string | null
  // The repo's size in KB, straight from `repos.get`'s `size` field ("The
  // size of the repository, in kilobytes" — verified against the installed
  // `@octokit/openapi-types@27.0.0` schema for `full-repository`, not
  // recalled from memory). Exposed here — rather than requiring a second
  // `repos.get` call in `code-digest.ts` — so the full-code import path can
  // apply its pre-download size guard using data already fetched for the
  // metadata step.
  sizeKb: number
}

// ~8-10k chars per the plan — generous enough for a README's substance
// without ballooning the AI prompt.
const README_MAX_CHARS = 9000

/**
 * Strips Markdown badge/image syntax and raw HTML tags from a README
 * BEFORE truncating it, so the `README_MAX_CHARS` cutoff below can never
 * land mid-tag (badges in particular are extremely common at the top of a
 * README and are pure noise for CV-project extraction anyway).
 */
function sanitizeReadme(raw: string): string {
  const cleaned = raw
    // Markdown image/badge syntax: ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Raw HTML tags, e.g. <div align="center">, <img .../>, <br/>
    .replace(/<[^>]+>/g, "")

  return cleaned.length > README_MAX_CHARS
    ? cleaned.slice(0, README_MAX_CHARS)
    : cleaned
}

/**
 * Fetches everything `ai-extract.ts` needs about one repo. A missing
 * README is a normal, expected case (plenty of repos don't have one) — it
 * resolves `readme: null` rather than throwing, so the import flow can
 * still proceed with metadata only (see the plan's edge cases).
 */
export async function getRepoDetails(
  owner: string,
  repo: string,
): Promise<RepoDetails> {
  const octokit = await getOctokitForUser()

  try {
    const [{ data: repoData }, languagesResponse, readmeResponse] =
      await Promise.all([
        octokit.rest.repos.get({ owner, repo }),
        octokit.rest.repos.listLanguages({ owner, repo }),
        octokit.rest.repos.getReadme({ owner, repo }).catch((err) => {
          if (err instanceof RequestError && err.status === 404) return null
          throw err
        }),
      ])

    const readme = readmeResponse
      ? sanitizeReadme(
          Buffer.from(readmeResponse.data.content, "base64").toString("utf-8"),
        )
      : null

    return {
      name: repoData.name,
      fullName: repoData.full_name,
      description: repoData.description,
      topics: repoData.topics ?? [],
      languages: Object.keys(languagesResponse.data),
      createdAt: repoData.created_at,
      pushedAt: repoData.pushed_at,
      readme,
      sizeKb: repoData.size,
    }
  } catch (err) {
    return rethrowGithubError(err)
  }
}

/**
 * Downloads a repo's default-branch tarball through the SAME authenticated
 * Octokit client `getRepoDetails` uses — works for private repos exactly
 * like the rest of this module, via the user's own OAuth token, unlike
 * Repomix's own built-in `remote` git-clone option (which needs a `git`
 * binary at runtime; deliberately avoided here since it may not be
 * available in a future serverless deploy, e.g. Vercel).
 *
 * `ref: "HEAD"` (rather than an empty string — the SDK's `ref` parameter is
 * typed as a required, non-empty `string`) resolves to the repository's
 * default branch tip, verified against GitHub's public tarball endpoint
 * directly (`GET /repos/{owner}/{repo}/tarball/HEAD` against a real public
 * repo returned a valid gzip tarball).
 *
 * The return type is genuinely `ArrayBuffer` at runtime, verified by
 * reading `@octokit/request@10.0.11`'s shipped `fetch-wrapper.js`: GitHub's
 * OpenAPI spec models this endpoint as a bare 302 redirect (`content:
 * never`), which is why the SDK's generated `response.data` type resolves
 * to `unknown` (confirmed via a throwaway `tsc --strict` probe against the
 * installed types) rather than any binary type — but `fetch`'s default
 * `redirect: "follow"` transparently follows the redirect to
 * codeload.github.com, and since that response's `content-type` is neither
 * JSON nor text, `getResponseData` resolves it via `response.arrayBuffer()`.
 * The cast below reflects that verified runtime behavior, not the
 * (misleading) generated type.
 */
export async function downloadRepoTarball(
  owner: string,
  repo: string,
): Promise<ArrayBuffer> {
  const octokit = await getOctokitForUser()

  try {
    const response = await octokit.rest.repos.downloadTarballArchive({
      owner,
      repo,
      ref: "HEAD",
    })
    return response.data as ArrayBuffer
  } catch (err) {
    return rethrowGithubError(err)
  }
}
