"use client"

import { useEffect } from "react"
import { useEditorStore } from "./editor-store"

/**
 * Global Ctrl+Z / Ctrl+Shift+Z (Cmd on Mac) undo/redo shortcuts for the CV
 * draft. Scoped to whichever component mounts it — call this from the
 * editor page only, not the root layout, so it's only active while the
 * editor is on screen.
 */
export function useUndoRedoShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isModifierPressed = event.ctrlKey || event.metaKey
      if (!isModifierPressed || event.key.toLowerCase() !== "z") return

      event.preventDefault()
      const temporal = useEditorStore.temporal.getState()
      if (event.shiftKey) {
        temporal.redo()
      } else {
        temporal.undo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}
