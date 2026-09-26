"use client"

import { toast } from "sonner"
import { TrashIcon } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDeleteButton } from "@/components/ui/confirm-dialog"
import { MemoryCaptureSheet } from "@/features/career-bank/memory-capture-sheet"
import {
  deleteMemory,
  type BankMaterialWithVariants,
  type BankMemoryRow,
} from "@/features/career-bank/actions"

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/**
 * "Memorias" — the AI-assisted capture flow's own section card, styled after
 * `MaterialSection` since a memory ultimately points at a `bank_material`
 * bullet. Looks up the produced material from the ALREADY-FETCHED `materials`
 * prop (same data `getBankPage` returns for `MaterialSection`) instead of a
 * second query — `bank_memory.materialId` has no foreign key (see `db/
 * schema.ts`), so a memory whose material was since deleted renders with a
 * "material eliminado" note rather than a broken join.
 */
export function MemorySection({
  memories,
  materials,
  onChanged,
}: {
  memories: BankMemoryRow[]
  materials: BankMaterialWithVariants[]
  onChanged: () => void
}) {
  async function handleRemove(id: string) {
    const result = await deleteMemory(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memorias</CardTitle>
        <CardAction>
          <MemoryCaptureSheet onCaptured={onChanged} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {memories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no capturaste ninguna memoria. Contá un logro o una
            experiencia con tus palabras y dejá que la IA te ayude a convertirla
            en una viñeta.
          </p>
        ) : (
          memories.map((memory) => {
            const material = memory.materialId
              ? materials.find((m) => m.id === memory.materialId)
              : undefined
            const defaultVariant = material
              ? (material.variants.find((v) => v.isDefault) ??
                material.variants[0])
              : undefined

            return (
              <div
                key={memory.id}
                className="flex flex-col gap-2 rounded-lg border p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {defaultVariant ? (
                      <p className="text-sm font-medium break-words">
                        {defaultVariant.content}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm italic">
                        El material generado a partir de esta memoria ya no
                        existe.
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {truncate(memory.rawText, 160)}
                    </p>
                  </div>
                  <ConfirmDeleteButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar memoria"
                    title="¿Eliminar esta memoria?"
                    description="Se elimina el registro de esta memoria (el texto original y las preguntas respondidas). La viñeta que ya se guardó en el banco no se elimina."
                    onConfirm={() => handleRemove(memory.id)}
                  >
                    <TrashIcon />
                  </ConfirmDeleteButton>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
