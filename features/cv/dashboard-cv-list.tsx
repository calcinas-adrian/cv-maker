"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { PencilIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { CvListItem } from "@/features/cv/list"
import { useInlineCvRename } from "@/features/cv/use-inline-cv-rename"

/**
 * `/dashboard` CV list — same double-click/pencil inline-rename affordance
 * as the `/cv/*` sidebar (see `use-inline-cv-rename`), on top of the
 * existing Card/Link-to-edit rendering. Only the title itself is editable;
 * clicking anywhere else on the card still navigates to `/cv/[id]/edit`.
 */
export function DashboardCvList({ cvs }: { cvs: CvListItem[] }) {
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
    <div className="flex flex-col gap-2">
      {cvs.map((item) =>
        editingId === item.id ? (
          <Card key={item.id}>
            <CardHeader>
              <Input
                autoFocus
                defaultValue={titleFor(item)}
                disabled={saving}
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
            </CardHeader>
          </Card>
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
              // Intercept the plain single-click so we can show pending
              // feedback on this card while the navigation resolves —
              // `Link` stays in place (unchanged) for prefetch,
              // right-click/open-in-new-tab, and accessibility.
              e.preventDefault()
              setPendingId(item.id)
              startTransition(() => {
                router.push(`/cv/${item.id}/edit`)
              })
            }}
          >
            <Card
              className={cn(
                "hover:bg-muted/50 group transition-colors",
                isPending &&
                  pendingId === item.id &&
                  "pointer-events-none opacity-50",
              )}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-1">
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
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ),
      )}
    </div>
  )
}
