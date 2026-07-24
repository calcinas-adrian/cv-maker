"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { renameCv } from "@/features/cv/actions"
import type { CvListItem } from "@/features/cv/list"

/**
 * Shared inline-rename state machine for CV titles — used by both the
 * persistent `/cv/*` sidebar and the `/dashboard` CV list, so the
 * override/editing/saving state and the `renameCv` call + toasts live in
 * one place instead of being duplicated across markup-only components.
 */
export function useInlineCvRename() {
  // Local overrides on top of the caller's list, so a rename shows up
  // immediately without a `router.refresh()`.
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(
    {},
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const previousTitleRef = useRef("")
  const skipBlurRef = useRef(false)

  function titleFor(item: CvListItem) {
    return titleOverrides[item.id] ?? item.title
  }

  function startEditing(item: CvListItem) {
    previousTitleRef.current = titleFor(item)
    setEditingId(item.id)
  }

  function cancelEditing() {
    skipBlurRef.current = true
    setEditingId(null)
  }

  async function commitRename(cvId: string, value: string) {
    const trimmed = value.trim()
    setEditingId(null)

    if (!trimmed || trimmed === previousTitleRef.current) return

    setTitleOverrides((prev) => ({ ...prev, [cvId]: trimmed }))
    setSaving(true)
    const result = await renameCv(cvId, trimmed)
    setSaving(false)

    if (!result.ok) {
      setTitleOverrides((prev) => ({
        ...prev,
        [cvId]: previousTitleRef.current,
      }))
      toast.error(result.error)
      return
    }

    toast.success("Título actualizado")
  }

  function handleBlur(cvId: string, value: string) {
    if (skipBlurRef.current) {
      skipBlurRef.current = false
      return
    }
    void commitRename(cvId, value)
  }

  return {
    titleFor,
    editingId,
    saving,
    startEditing,
    cancelEditing,
    handleBlur,
  }
}
