"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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

export default function LoginPage() {
  const router = useRouter()
  const [isGithubLoading, setIsGithubLoading] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)

  // Conditional UI (autofill): browsers that support it will silently offer
  // saved passkeys in this input's autofill dropdown without any click.
  useEffect(() => {
    authClient.signIn.passkey({ autoFill: true })
  }, [])

  async function handleGithubSignIn() {
    setIsGithubLoading(true)
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    })
    setIsGithubLoading(false)
  }

  async function handlePasskeySignIn() {
    setIsPasskeyLoading(true)
    const { data } = await authClient.signIn.passkey()
    setIsPasskeyLoading(false)
    if (data) {
      router.push("/dashboard")
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
