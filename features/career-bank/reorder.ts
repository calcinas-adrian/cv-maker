/**
 * Pure, table-agnostic reorder math shared by every `bank_*` satellite
 * section's `moveX` server action (`features/career-bank/actions.ts`). Kept
 * free of any Drizzle table type so it never needs a table-generic (which
 * Drizzle's column typing does not support cleanly) — callers pass in the
 * already-loaded sibling rows and get back the two `{ id, sortOrder }` pairs
 * to write.
 */
export function computeSortOrderSwap<
  T extends { id: string; sortOrder: number },
>(
  siblings: T[],
  id: string,
  direction: "up" | "down",
):
  | [{ id: string; sortOrder: number }, { id: string; sortOrder: number }]
  | null {
  const ordered = [...siblings].sort((a, b) => a.sortOrder - b.sortOrder)
  const index = ordered.findIndex((row) => row.id === id)
  if (index === -1) return null

  const neighborIndex = direction === "up" ? index - 1 : index + 1
  if (neighborIndex < 0 || neighborIndex >= ordered.length) return null

  const current = ordered[index]
  const neighbor = ordered[neighborIndex]
  return [
    { id: current.id, sortOrder: neighbor.sortOrder },
    { id: neighbor.id, sortOrder: current.sortOrder },
  ]
}
