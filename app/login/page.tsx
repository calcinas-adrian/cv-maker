"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { mapPasskeyError } from "@/features/auth/passkey-errors"

type PasskeySignInResult = Awaited<ReturnType<typeof authClient.signIn.passkey>>
type Router = ReturnType<typeof useRouter>

/**
 * Shared by both sign-in paths below. A plain top-level function (rather
 * than one declared inside the component) so the button handler and the
 * autofill effect can both call it without pulling it into the effect's
 * `react-hooks/exhaustive-deps` dependency array.
 */
async function handlePasskeySignInResult(
  result: PasskeySignInResult,
  router: Router,
) {
  if (result.data) {
    toast.success("Sesión iniciada")
    router.push("/dashboard")
    router.refresh()
    return
  }

  const mapped = mapPasskeyError(result.error, { flow: "sign-in" })
  if (mapped) toast.error(mapped.message)
}

export default function LoginPage() {
  const router = useRouter()
  const [isGithubLoading, setIsGithubLoading] = useState(false)
  // Covers BOTH sign-in paths: from the moment the button is clicked, or
  // (for autofill) only once the user actually picked a credential — see the
  // `fetchOptions.onRequest` hook below. Owner report: "no sé si fue exitoso
  // o no" (T4, `odd/tasks/passkey-fixes.md`).
  const [isPasskeyVerifying, setIsPasskeyVerifying] = useState(false)
  // Guards the autofill effect below against setting state or navigating
  // after this page unmounts (e.g. the user clicks the button and navigates
  // away before the silent autofill ceremony settles).
  const unmountedRef = useRef(false)

  // Conditional UI (autofill): browsers that support it will silently offer
  // saved passkeys in this input's autofill dropdown without any click, and
  // resolve this call the moment the user picks one. Gated on
  // `isConditionalMediationAvailable` because calling `signIn.passkey`
  // unconditionally starts a ceremony even on browsers that don't support
  // autofill, which never resolves and would abort the button below's
  // ceremony (they share the same WebAuthn abort signal).
  useEffect(() => {
    unmountedRef.current = false

    async function trySignInFromAutofill() {
      if (
        typeof window === "undefined" ||
        !window.PublicKeyCredential?.isConditionalMediationAvailable
      ) {
        return
      }

      const isAvailable =
        await window.PublicKeyCredential.isConditionalMediationAvailable()
      if (!isAvailable || unmountedRef.current) return

      const result = await authClient.signIn.passkey({
        autoFill: true,
        fetchOptions: {
          // Fires right before the verify-authentication POST — i.e. only
          // once the browser resolved the picker and the user actually
          // picked a credential, never while merely waiting on the
          // dropdown. `client.mjs`'s `signInPasskey` spreads
          // `opts.fetchOptions` into that one fetch call only, not the
          // earlier options GET.
          onRequest: () => {
            if (!unmountedRef.current) setIsPasskeyVerifying(true)
          },
        },
      })
      if (unmountedRef.current) return
      setIsPasskeyVerifying(false)

      // A silent code here (see `mapPasskeyError`'s SILENT_CODES) covers the
      // case where the button below started its own ceremony and aborted
      // this one, or the user never engaged the autofill dropdown at all —
      // any other error is still shown. Previously this effect only read
      // `data` and dropped `error` entirely, which is exactly why a stale
      // credential picked from autofill used to fail with no feedback.
      await handlePasskeySignInResult(result, router)
    }

    void trySignInFromAutofill()

    return () => {
      unmountedRef.current = true
    }
  }, [router])

  async function handleGithubSignIn() {
    setIsGithubLoading(true)
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      })
    } catch {
      toast.error("No se pudo iniciar sesión con GitHub")
    } finally {
      setIsGithubLoading(false)
    }
  }

  async function handlePasskeySignIn() {
    setIsPasskeyVerifying(true)
    const result = await authClient.signIn.passkey()
    if (unmountedRef.current) return
    setIsPasskeyVerifying(false)
    await handlePasskeySignInResult(result, router)
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Usá GitHub o una passkey para acceder a tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-xs">
            ¿Primera vez? Iniciá sesión con GitHub. Después vas a poder agregar
            una passkey (huella digital, rostro o PIN del dispositivo) desde el
            panel principal, para entrar más rápido la próxima vez.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passkey-email">Email</Label>
            <Input
              id="passkey-email"
              name="email"
              type="email"
              autoComplete="username webauthn"
              placeholder="vos@ejemplo.com"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={isPasskeyVerifying || isGithubLoading}
            onClick={() => void handlePasskeySignIn()}
          >
            {isPasskeyVerifying
              ? "Verificando passkey…"
              : "Iniciar sesión con una passkey"}
          </Button>

          <div className="text-muted-foreground relative text-center text-xs">
            <span className="bg-card relative z-10 px-2">o</span>
            <div className="bg-border absolute top-1/2 right-0 left-0 h-px" />
          </div>

          <Button
            type="button"
            disabled={isGithubLoading || isPasskeyVerifying}
            onClick={handleGithubSignIn}
          >
            {isGithubLoading ? "Redirigiendo…" : "Iniciar sesión con GitHub"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
