"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { signOut } from "@/lib/auth-client"

const NAV_LINKS = [
  { href: "/dashboard", label: "Tus CVs" },
  { href: "/settings", label: "Proveedores de IA" },
]

export function DashboardNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between p-4">
        <Link href="/dashboard" className="font-semibold">
          CV·AI
        </Link>
        <nav className="flex items-center gap-1">
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
            onClick={handleSignOut}
          >
            <LogOutIcon />
            Cerrar sesión
          </Button>
        </nav>
      </div>
    </header>
  )
}
