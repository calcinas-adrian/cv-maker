"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import type { CvListItem } from "@/features/cv/list"

/**
 * Persistent CV-switcher sidebar rendered by `app/(dashboard)/cv/layout.tsx`
 * — a nested layout, so this list is fetched once and survives navigation
 * between CVs (see design Decision 1). Deliberately minimal for Phase 4;
 * polish (search, create-from-sidebar, drag reorder, etc.) is out of scope
 * here.
 */
export function CvListSidebar({ cvs }: { cvs: CvListItem[] }) {
  const params = useParams<{ id?: string }>()
  const activeId = params.id

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground px-2 py-1.5 text-xs font-medium"
      >
        ← Tus CVs
      </Link>

      {cvs.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1.5 text-xs">
          Todavía no tenés CVs.
        </p>
      ) : (
        cvs.map((item) => (
          <Link
            key={item.id}
            href={`/cv/${item.id}/edit`}
            className={cn(
              "hover:bg-muted truncate rounded-lg px-2 py-1.5 text-sm transition-colors",
              activeId === item.id && "bg-muted font-medium",
            )}
          >
            {item.title}
          </Link>
        ))
      )}
    </nav>
  )
}
