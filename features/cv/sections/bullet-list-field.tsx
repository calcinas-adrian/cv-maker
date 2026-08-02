"use client"

import { useState } from "react"
import { BookmarkCheckIcon, BookmarkPlusIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormLabel } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { promoteBulletToBank } from "@/features/career-bank/actions"
import { RowActions } from "./item-row"

export type BulletDraft = {
  id: string
  content: string
  sourceMaterialId: string | null
}

function newBullet(): BulletDraft {
  return { id: crypto.randomUUID(), content: "", sourceMaterialId: null }
}

/**
 * The inline editable bullet-row list for `ExperienceForm`/`ProjectForm` —
 * `sdd/career-bank-restructure/design` Decision 6. One row per bullet:
 * a single-row `Textarea` (the bullet is edited IN PLACE, no separate
 * dialog) + `RowActions` (reorder/duplicate/remove, no "Editar" — see
 * `item-row.tsx`'s docstring) + a "Guardar en el banco" toggle button that
 * promotes the bullet via `promoteBulletToBank`.
 *
 * Deliberately rejected: `ItemRow` + a nested `Dialog` per bullet — three
 * modal levels to change one line, and this repo has already been bitten by
 * Radix nested-portal focus/propagation bugs once (`architecture/deletion-
 * policy` learning 4).
 *
 * Shared by BOTH `experience-form.tsx` and `project-form.tsx` (and, through
 * them, the GitHub-import review step) rather than duplicated — the row
 * shape and the promotion call are identical regardless of which CV section
 * the bullet belongs to.
 */
export function BulletListField({
  bullets,
  onChange,
}: {
  bullets: BulletDraft[]
  onChange: (next: BulletDraft[]) => void
}) {
  // Tracks the bullet currently mid-`promoteBulletToBank` call so its
  // button can show a busy state and every other row's button stays
  // clickable — a save-to-bank call never blocks editing the rest of the
  // list.
  const [savingId, setSavingId] = useState<string | null>(null)

  function updateContent(index: number, content: string) {
    onChange(bullets.map((b, i) => (i === index ? { ...b, content } : b)))
  }

  function moveBullet(index: number, direction: "up" | "down") {
    const swapWith = direction === "up" ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= bullets.length) return
    const next = [...bullets]
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    onChange(next)
  }

  function removeBullet(index: number) {
    onChange(bullets.filter((_, i) => i !== index))
  }

  function duplicateBullet(index: number) {
    // A duplicate is a NEW claim in the bank's eyes, not a restatement of
    // the same one — it starts unlinked (`sourceMaterialId: null`), same as
    // any other fresh bullet, rather than inheriting the source's link.
    const copy: BulletDraft = {
      ...bullets[index],
      id: crypto.randomUUID(),
      sourceMaterialId: null,
    }
    const next = [...bullets]
    next.splice(index + 1, 0, copy)
    onChange(next)
  }

  function addBullet() {
    onChange([...bullets, newBullet()])
  }

  async function handleSaveToBank(index: number) {
    const bullet = bullets[index]
    setSavingId(bullet.id)
    const result = await promoteBulletToBank({
      content: bullet.content,
      sourceMaterialId: bullet.sourceMaterialId,
    })
    setSavingId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    onChange(
      bullets.map((b, i) =>
        i === index ? { ...b, sourceMaterialId: result.data.materialId } : b,
      ),
    )
    toast.success(
      bullet.sourceMaterialId
        ? "Nueva variante guardada en el banco"
        : "Viñeta guardada en el banco",
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <FormLabel>Viñetas</FormLabel>
      {bullets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no agregaste viñetas.
        </p>
      ) : (
        bullets.map((bullet, index) => (
          <div
            key={bullet.id}
            className="flex items-start gap-2 rounded-lg border p-2"
          >
            <Textarea
              rows={1}
              value={bullet.content}
              onChange={(e) => updateContent(index, e.target.value)}
              className="min-h-9 flex-1 resize-y"
              placeholder="Describí un logro o responsabilidad concreta…"
            />
            <div className="flex shrink-0 items-center gap-1">
              <RowActions
                onClone={() => duplicateBullet(index)}
                onRemove={() => removeBullet(index)}
                onMoveUp={() => moveBullet(index, "up")}
                onMoveDown={() => moveBullet(index, "down")}
                canMoveUp={index > 0}
                canMoveDown={index < bullets.length - 1}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  bullet.sourceMaterialId
                    ? "Guardar como nueva variante en el banco"
                    : "Guardar en el banco"
                }
                title={
                  bullet.sourceMaterialId
                    ? "Ya está en tu banco — guardar esta redacción como nueva variante"
                    : "Guardar en el banco"
                }
                disabled={
                  bullet.content.trim().length < 3 || savingId === bullet.id
                }
                onClick={() => void handleSaveToBank(index)}
              >
                {bullet.sourceMaterialId ? (
                  <BookmarkCheckIcon />
                ) : (
                  <BookmarkPlusIcon />
                )}
              </Button>
            </div>
          </div>
        ))
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={addBullet}
      >
        <PlusIcon /> Agregar viñeta
      </Button>
    </div>
  )
}
