"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Loader2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdaptationPosting } from "./actions"
import type { AdaptationListItem } from "./list"

/**
 * Pinned locale AND timeZone, deliberately — not `toLocaleDateString()`.
 *
 * These rows are server-rendered and then hydrated, so a formatter that
 * reads the ambient locale/timezone produces one string in Node and a
 * different one in the browser, which is a hydration mismatch on every
 * single card. Fixing both inputs makes the output deterministic on both
 * sides. The values match the app's own Rioplatense copy; the day this needs
 * to follow a per-user preference, this constant is the one place to change.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

/**
 * Full posting text, fetched per row on expand and kept for the rest of the
 * page's life — reopening a row the user already looked at must not spend a
 * second round trip, or the accordion feels broken.
 */
type PostingState = { status: "loading" } | { status: "ready"; text: string }

export function AdaptationHistory({ items }: { items: AdaptationListItem[] }) {
  const router = useRouter()
  const [isNavigating, startNavigation] = useTransition()
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  // One row open at a time. With every row expandable at once the page
  // becomes a wall of job postings and stops being scannable, which is the
  // whole point of a history.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [postings, setPostings] = useState<Record<string, PostingState>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function handleOpenCv(cvId: string) {
    setNavigatingId(cvId)
    startNavigation(() => {
      router.push(`/cv/${cvId}/edit`)
    })
  }

  async function handleToggle(item: AdaptationListItem) {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }

    // Expand FIRST, fetch second: the panel opens on the same frame as the
    // click and shows its own spinner, instead of the row sitting inert
    // while the request is in flight.
    setExpandedId(item.id)
    if (postings[item.id]) return

    setPostings((prev) => ({ ...prev, [item.id]: { status: "loading" } }))
    const result = await getAdaptationPosting(item.id)

    if (!result.ok) {
      toast.error(result.error)
      // Drop the loading entry so a retry actually refetches rather than
      // hanging on a spinner that will never resolve.
      setPostings((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      setExpandedId((current) => (current === item.id ? null : current))
      return
    }

    setPostings((prev) => ({
      ...prev,
      [item.id]: { status: "ready", text: result.data.jobPostingText },
    }))
  }

  async function handleCopy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard access is permission-gated and absent over plain HTTP.
      toast.error("No se pudo copiar. Copialo a mano desde el recuadro.")
      return
    }
    toast.success("Aviso copiado")
    // Icon swap on top of the toast: the button the user actually clicked
    // confirms it did something, without moving.
    setCopiedId(id)
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current))
    }, 2_000)
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const isExpanded = expandedId === item.id
        const posting = postings[item.id]
        const isOpening = isNavigating && navigatingId === item.cvId

        return (
          <Card
            key={item.id}
            className={cn(
              "transition-opacity",
              isOpening && "pointer-events-none opacity-50",
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-baseline gap-2">
                <span className="min-w-0 truncate">{item.cvTitle}</span>
                <time
                  dateTime={item.createdAt.toISOString()}
                  className="text-muted-foreground ml-auto shrink-0 text-xs font-normal"
                >
                  {DATE_FORMAT.format(item.createdAt)}
                </time>
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {item.source ? (
                  <>
                    Adaptado desde{" "}
                    <Link
                      href={`/cv/${item.source.id}/edit`}
                      className="hover:text-foreground underline underline-offset-2"
                    >
                      {item.source.title}
                    </Link>
                  </>
                ) : (
                  "El CV de origen ya no existe"
                )}
              </p>
            </CardHeader>

            <CardContent className="flex flex-col gap-3">
              {item.adaptationNotes ? (
                <div className="bg-muted/50 rounded-lg border p-2.5">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">
                    Qué priorizó la IA
                  </p>
                  <p className="text-sm">{item.adaptationNotes}</p>
                </div>
              ) : null}

              {/* Collapsed: enough of the posting to recognise which job this
                  was, without opening anything. */}
              {!isExpanded ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {item.postingPreview}
                  {item.postingTruncated ? "…" : ""}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {!posting || posting.status === "loading" ? (
                    <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                      <Loader2Icon className="size-4 animate-spin" />
                      Cargando el aviso…
                    </div>
                  ) : (
                    <>
                      {/* `max-h` + scroll: a 12k-character posting must not
                          push every other row off the screen. */}
                      <p className="max-h-80 overflow-y-auto rounded-lg border p-2.5 text-sm whitespace-pre-wrap">
                        {posting.text}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() => handleCopy(item.id, posting.text)}
                      >
                        {copiedId === item.id ? (
                          <CheckIcon data-icon="inline-start" />
                        ) : (
                          <CopyIcon data-icon="inline-start" />
                        )}
                        {copiedId === item.id ? "Copiado" : "Copiar aviso"}
                      </Button>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggle(item)}
                  aria-expanded={isExpanded}
                >
                  <ChevronDownIcon
                    data-icon="inline-start"
                    className={cn(
                      "transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                  {isExpanded ? "Ocultar aviso" : "Ver aviso completo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={isOpening}
                  onClick={() => handleOpenCv(item.cvId)}
                >
                  {isOpening ? "Abriendo…" : "Abrir CV"}
                  {isOpening ? (
                    <Loader2Icon
                      data-icon="inline-end"
                      className="animate-spin"
                    />
                  ) : (
                    <ArrowRightIcon data-icon="inline-end" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
