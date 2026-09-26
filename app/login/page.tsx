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

export default function LoginPage() {
  const router = useRouter()
  const [isGithubLoading, setIsGithubLoading] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
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

      // Errors here stay silent: they fire whenever the button below starts
      // its own ceremony (which aborts this one) or the user never engages
      // the autofill dropdown at all.
      const { data } = await authClient.signIn.passkey({ autoFill: true })
      if (data && !unmountedRef.current) {
        router.push("/dashboard")
        router.refresh()
      }
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
    setIsPasskeyLoading(true)
    try {
      const { data, error } = await authClient.signIn.passkey()
      if (data) {
        router.push("/dashboard")
        router.refresh()
        return
      }
      const mapped = mapPasskeyError(error, { flow: "sign-in" })
      if (mapped) toast.error(mapped.message)
    } finally {
      setIsPasskeyLoading(false)
    }
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
            disabled={isPasskeyLoading}
            onClick={handlePasskeySignIn}
          >
            {isPasskeyLoading
              ? "Iniciando sesión…"
              : "Iniciar sesión con una passkey"}
          </Button>

          <div className="text-muted-foreground relative text-center text-xs">
            <span className="bg-card relative z-10 px-2">o</span>
            <div className="bg-border absolute top-1/2 right-0 left-0 h-px" />
          </div>

          <Button
            type="button"
            disabled={isGithubLoading}
            onClick={handleGithubSignIn}
          >
            {isGithubLoading ? "Redirigiendo…" : "Iniciar sesión con GitHub"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
