"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDeleteButton } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { deleteCv } from "@/features/cv/actions"
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
  // Deleted ids are hidden locally so the card disappears on confirm without
  // waiting for the server round trip to re-render the RSC list — same
  // optimistic-override idea `useInlineCvRename` uses for titles.
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  async function handleDelete(id: string) {
    const result = await deleteCv(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setDeletedIds((prev) => [...prev, id])
    toast.success("CV eliminado")
    // Refreshes the sidebar too — it renders from the same `listUserCvs`.
    router.refresh()
  }

  const visible = cvs.filter((item) => !deletedIds.includes(item.id))

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
      {visible.map((item) =>
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
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Renombrar CV"
                      className="text-muted-foreground hover:text-foreground hidden group-hover:block"
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
                    {/* This whole subtree sits inside the card's `Link`, so
                        every click under it has to be stopped or it would
                        navigate to the editor. That includes clicks inside
                        the confirmation dialog: Radix portals the dialog out
                        of this DOM subtree, but React events still bubble
                        along the COMPONENT tree, so "Cancelar" would
                        otherwise open the CV it was cancelling. Stopping it
                        here covers the button and the dialog in one place. */}
                    <span
                      className="contents"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                    >
                      <ConfirmDeleteButton
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Eliminar CV"
                        className="text-muted-foreground hover:text-destructive hidden group-hover:inline-flex"
                        title="¿Eliminar este CV?"
                        description={
                          <>
                            <strong>{titleFor(item)}</strong> deja de aparecer
                            en tu lista. No se borra del servidor: su historial
                            de versiones y sus adaptaciones quedan guardados, y
                            podés pedir que lo restauren.
                          </>
                        }
                        onConfirm={() => handleDelete(item.id)}
                      >
                        <Trash2Icon />
                      </ConfirmDeleteButton>
                    </span>
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
