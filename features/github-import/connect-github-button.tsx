"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

const IMPORT_SCOPE = "repo"

/**
 * Requests incremental GitHub OAuth scope (`repo`) via Better Auth's
 * account-linking flow. The GitHub social provider was originally
 * connected at sign-up with no extra scopes (see `lib/auth.ts`), so this
 * is what upgrades that same linked account to be able to read repos.
 *
 * `authClient.linkSocial({ provider, scopes, callbackURL })` — verified
 * against the installed `better-auth@1.6.23` source, not recalled from
 * memory:
 * - The client method name is inferred from the server's `/link-social`
 *   route path (better-auth's client auto-generates camelCase method
 *   names from kebab-case paths — the same mechanism already relied on
 *   for `authClient.signIn.social(...)` in `app/login/page.tsx`), and its
 *   body schema includes an optional `scopes: string[]`.
 * - The server endpoint (`linkSocialAccount` in
 *   `better-auth/dist/api/routes/account.mjs`) builds the GitHub
 *   authorization URL with those scopes and responds
 *   `{ url, redirect: true }`; the client's bundled `redirectPlugin`
 *   auto-navigates the browser to that URL (same mechanism as
 *   `signIn.social`), so no manual `window.location` handling is needed
 *   here.
 * - Critically, because an `account` row for this user+GitHub already
 *   exists, the OAuth callback handler (`callback.mjs`) finds that
 *   existing row and calls `updateAccount` on it with the new
 *   scope/tokens — it does NOT create a duplicate account row. So
 *   re-running this after already being connected genuinely upgrades the
 *   same linked account's stored scope in place, which is what lets
 *   `getGithubConnectionStatus` (features/github-import/octokit.ts) see
 *   `repo` on the next check.
 */
export function ConnectGithubButton({
  callbackURL,
  children,
}: {
  callbackURL: string
  children?: React.ReactNode
}) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleConnect() {
    setIsLoading(true)
    try {
      await authClient.linkSocial({
        provider: "github",
        scopes: [IMPORT_SCOPE],
        callbackURL,
      })
    } catch {
      toast.error("No se pudo conectar con GitHub")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button type="button" disabled={isLoading} onClick={handleConnect}>
      {isLoading ? "Redirigiendo…" : (children ?? "Conectar GitHub")}
    </Button>
  )
}
