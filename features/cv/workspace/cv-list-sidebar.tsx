"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { PencilIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import type { CvListItem } from "@/features/cv/list"
import { useInlineCvRename } from "@/features/cv/use-inline-cv-rename"

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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const {
    titleFor,
    editingId,
    saving,
    startEditing,
    cancelEditing,
    handleBlur,
  } = useInlineCvRename()

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
        cvs.map((item) =>
          editingId === item.id ? (
            <div
              key={item.id}
              className={cn(
                "truncate rounded-lg px-2 py-1.5 text-sm",
                activeId === item.id && "bg-muted font-medium",
              )}
            >
              <Input
                autoFocus
                defaultValue={titleFor(item)}
                disabled={saving}
                className="h-6 px-1 py-0 text-sm"
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => handleBlur(item.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur()
                  } else if (e.key === "Escape") {
                    cancelEditing()
                  }
                }}
              />
            </div>
          ) : (
            <Link
              key={item.id}
              href={`/cv/${item.id}/edit`}
              onClick={(e) => {
                // Second click of a double-click: enter edit mode instead
                // of navigating (`e.detail` is the browser's native click
                // count on this event).
                if (e.detail > 1) {
                  e.preventDefault()
                  startEditing(item)
                  return
                }
                // Clicking the CV that's already open must be a true
                // no-op — no preventDefault, no pending state, no
                // transition/navigation. The user explicitly does not
                // want an implicit reload of the CV being edited (see
                // the "Recargar" button in `CvEditor` for the deliberate
                // alternative).
                if (item.id === activeId) {
                  return
                }
                // Intercept the plain single-click so we can show pending
                // feedback on this row while the navigation resolves —
                // `Link` stays in place (unchanged) for prefetch,
                // right-click/open-in-new-tab, and accessibility.
                e.preventDefault()
                setPendingId(item.id)
                startTransition(() => {
                  router.push(`/cv/${item.id}/edit`)
                })
              }}
              className={cn(
                "hover:bg-muted group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors",
                activeId === item.id && "bg-muted font-medium",
                isPending &&
                  pendingId === item.id &&
                  "pointer-events-none opacity-50",
              )}
            >
              <span className="min-w-0 truncate">{titleFor(item)}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Renombrar CV"
                className="text-muted-foreground hover:text-foreground ml-auto hidden shrink-0 group-hover:block"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  startEditing(item)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    e.stopPropagation()
                    startEditing(item)
                  }
                }}
              >
                <PencilIcon className="size-3.5" />
              </span>
            </Link>
          ),
        )
      )}
    </nav>
  )
}
