"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeftIcon, LogOutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { signOut } from "@/lib/auth-client"

const NAV_LINKS = [
  { href: "/dashboard", label: "Tus CVs" },
  { href: "/applications", label: "Postulaciones" },
  { href: "/career-material", label: "Tu material" },
  { href: "/settings", label: "Proveedores de IA" },
]

export function DashboardNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  // `/dashboard` is the root of the guided flow — every other route under
  // `(dashboard)` (settings, the CV editor) gets an explicit "Volver" back
  // to it instead of the brand mark, so navigating back never depends on
  // browser history.
  const isRoot = pathname === "/dashboard"

  async function handleSignOut() {
    setIsSigningOut(true)
    await signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="border-border bg-background sticky top-0 z-10 flex h-[52px] w-full items-center justify-between gap-4 border-b px-4 sm:px-6">
      {isRoot ? (
        <Link
          href="/dashboard"
          className="text-base font-semibold tracking-tight"
        >
          CV·AI
        </Link>
      ) : (
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeftIcon data-icon="inline-start" />
            Volver
          </Link>
        </Button>
      )}

      <nav className="flex items-center gap-2">
        {NAV_LINKS.map((link) => (
          <Button
            key={link.href}
            type="button"
            variant={pathname === link.href ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSigningOut}
          onClick={handleSignOut}
        >
          <LogOutIcon data-icon="inline-start" />
          Cerrar sesión
        </Button>
        <ThemeToggle />
      </nav>
    </header>
  )
}
