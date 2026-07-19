import "server-only"

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { RequestError } from "octokit"
import { extract } from "tar"
import { mergeConfigs, pack } from "repomix"
import type { Result } from "@/lib/result"
import {
  codeForGithubError,
  downloadRepoTarball,
  translateGithubError,
} from "./octokit"

/**
 * Hard ceiling on the repo's reported size (KB, from `repos.get`, see
 * `RepoDetails.sizeKb`) before we even attempt a tarball download — checked
 * BEFORE any network call for the tarball itself, not after. ~200MB is
 * comfortably past what any real source-code repo needs for a CV-project
 * digest (large repos are almost always dominated by binary assets/vendored
 * dependencies that get filtered out anyway) and keeps a single import from
 * ever downloading something that could stall a server request or blow past
 * a serverless function's memory limits.
 */
const MAX_REPO_SIZE_KB = 200 * 1024

/**
 * Ceiling on the final digest text handed to `ai-extract.ts`. Bigger than
 * `octokit.ts`'s `README_MAX_CHARS` (9000) since this covers a whole
 * repo's compressed source rather than one file, but still bounded — after
 * Repomix's tree-sitter `compress` pass strips function bodies down to
 * signatures/structure, 60k characters comfortably covers a small-to-medium
 * real-world project's worth of *compressed* source (compressed code is
 * denser than English prose, so a straight char-count comparison undersells
 * how much source it represents) while keeping the eventual
 * `generateObject` prompt's input tokens bounded across every configured
 * BYOK provider.
 */
const CODE_DIGEST_MAX_CHARS = 60_000

/**
 * Extra ignore patterns on top of Repomix's own extensive default list
 * (`node_modules`, `dist`/`build`/`out`, every common lockfile, `.git`,
 * caches, IDE folders, …, verified by reading the installed package's
 * `defaultIgnoreList` rather than assumed) and the repo's own `.gitignore`
 * (respected by default via `ignore.useGitignore`). Binary files (images
 * included) are ALSO already excluded automatically — Repomix skips them
 * both by extension (`is-binary-path`) and by sniffing content
 * (`isbinaryfile`, including a null-byte probe), verified by reading
 * `core/file/fileRead.js`. The one gap: SVGs are XML text, not binary, so
 * they slip past both of those checks and can be large, useless noise for
 * code understanding — hence the explicit pattern below. Minified/
 * source-mapped output is pure noise for this feature's purposes too.
 */
const EXTRA_IGNORE_PATTERNS = [
  "**/*.svg",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
]

/**
 * Builds a condensed, AI-friendly text digest of a GitHub repo's actual
 * source code (not just its README) for the "full code" import depth.
 *
 * Pipeline: size guard -> authenticated tarball download (reuses
 * `octokit.ts`'s client, works for private repos, no `git` binary needed at
 * runtime) -> extract to a real temp directory -> Repomix `pack()` with
 * compression enabled -> read the produced digest back into memory ->
 * truncate to budget. The temp directory is ALWAYS removed in `finally`,
 * success or failure — this runs in a shared server process, so leaking
 * another user's extracted repo contents on disk between requests is a
 * real problem, not just tidiness.
 *
 * SECURITY NOTE: this deliberately never calls Repomix's own
 * `loadFileConfig` (which would `jiti`-import a `repomix.config.{js,ts,…}`
 * file if the cloned repo shipped one) — the config passed to `pack()` is
 * built entirely from the literal object below via `mergeConfigs(cwd, {},
 * cliConfig)`, so a malicious repo can never get arbitrary code executed
 * through its own Repomix config.
 */
export async function buildCodeDigest(
  owner: string,
  repo: string,
  sizeKb: number,
): Promise<Result<string>> {
  if (sizeKb > MAX_REPO_SIZE_KB) {
    return {
      ok: false,
      error:
        'El repositorio es demasiado grande para analizar el código completo. Probá con "Solo README".',
      code: "repo_too_large",
    }
  }

  let tarballBuffer: ArrayBuffer
  try {
    tarballBuffer = await downloadRepoTarball(owner, repo)
  } catch (err) {
    // A 404 here (as opposed to earlier, when `getRepoDetails` already
    // proved the repo exists and this token can read it) almost always
    // means the repo has no default branch / no commits — GitHub can't
    // tar an empty repo. That is a distinct, more specific situation than
    // "GitHub rejected access", so it gets its own message under the same
    // `digest_failed` bucket rather than the generic GitHub-auth
    // translation below.
    if (err instanceof RequestError && err.status === 404) {
      return {
        ok: false,
        error:
          "El repositorio parece estar vacío: no hay código para analizar.",
        code: "digest_failed",
      }
    }
    return {
      ok: false,
      error: translateGithubError(err),
      code: codeForGithubError(err),
    }
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "cv-ai-github-import-"))
  const archivePath = path.join(tempRoot, "archive.tar.gz")
  const extractDir = path.join(tempRoot, "extracted")
  const outputPath = path.join(tempRoot, "digest.xml")

  try {
    await writeFile(archivePath, Buffer.from(tarballBuffer))
    await mkdir(extractDir, { recursive: true })

    // GitHub's tarball archives always contain a single top-level folder
    // (`owner-repo-<sha>/`) — `strip: 1` drops it so `extractDir` itself
    // becomes the repo root, verified against a real downloaded tarball.
    await extract({ file: archivePath, cwd: extractDir, strip: 1 })

    const cliConfig = {
      output: {
        filePath: outputPath,
        style: "xml" as const,
        compress: true,
        fileSummary: false,
        directoryStructure: true,
        showLineNumbers: false,
        // The extracted tarball is never a git repository (GitHub's
        // archive doesn't include `.git/`), so there's no history to sort
        // by. `pack()` would otherwise try (and gracefully no-op) on every
        // call — set false explicitly instead of relying on that fallback.
        git: { sortByChanges: false },
      },
      ignore: {
        customPatterns: EXTRA_IGNORE_PATTERNS,
      },
    }
    const mergedConfig = mergeConfigs(tempRoot, {}, cliConfig)

    const packResult = await pack([extractDir], mergedConfig)
    if (packResult.totalFiles === 0) {
      return {
        ok: false,
        error: "No se encontró código analizable en el repositorio.",
        code: "digest_failed",
      }
    }

    const digest = (await readFile(outputPath, "utf-8")).trim()
    if (!digest) {
      return {
        ok: false,
        error: "No se encontró código analizable en el repositorio.",
        code: "digest_failed",
      }
    }

    return {
      ok: true,
      data:
        digest.length > CODE_DIGEST_MAX_CHARS
          ? digest.slice(0, CODE_DIGEST_MAX_CHARS)
          : digest,
    }
  } catch (err) {
    console.error(
      "Code digest extraction failed",
      err instanceof Error ? err.message : "unknown error",
    )
    return {
      ok: false,
      error:
        'No se pudo analizar el código del repositorio. Probá con "Solo README".',
      code: "digest_failed",
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
