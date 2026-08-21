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
  { href: "/bank", label: "Tu banco" },
  { href: "/ai-providers", label: "Proveedores de IA" },
]

export function DashboardNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  // `/dashboard` is the root of the guided flow — every other route under
  // `(dashboard)` (AI providers, the CV editor) gets an explicit "Volver" back
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
    <header className="border-border bg-background sticky top-0 z-10 flex w-full flex-col border-b sm:h-[52px] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
      <div className="flex h-[52px] w-full shrink-0 items-center justify-between gap-3 px-4 sm:w-auto sm:px-0">
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
      </div>

      <nav
        aria-label="Navegación principal"
        className="flex w-full [scrollbar-width:none] items-center gap-2 overflow-x-auto border-t px-4 py-2 sm:w-auto sm:border-0 sm:px-0 sm:py-0"
      >
        {NAV_LINKS.map((link) => (
          <Button
            key={link.href}
            type="button"
            variant={pathname === link.href ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            asChild
          >
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden shrink-0 sm:inline-flex"
          disabled={isSigningOut}
          onClick={handleSignOut}
        >
          <LogOutIcon data-icon="inline-start" />
          Cerrar sesión
        </Button>
        <span className="ml-auto shrink-0 sm:ml-0">
          <ThemeToggle />
        </span>
      </nav>
    </header>
  )
}
