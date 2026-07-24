"use client"

import { useEffect, useRef } from "react"
import { debounce } from "es-toolkit"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEditorStore } from "@/features/cv/editor-store"
import {
  THEME_FONT_SIZE_MAX,
  THEME_FONT_SIZE_MIN,
  THEME_LINE_HEIGHT_MAX,
  THEME_LINE_HEIGHT_MIN,
  type CvTheme,
} from "@/schemas/cv.schema"
import { saveTheme } from "./actions"

const SAVE_DELAY_MS = 500

const MARGIN_LABELS: Record<CvTheme["margin"], string> = {
  compact: "Compacto",
  normal: "Normal",
  relaxed: "Amplio",
}

/**
 * Font size / accent color / margin preset / line height — the presentation
 * knobs exposed by `themeSchema`. Lives OUTSIDE the form/YAML toggle
 * (`CvEditor`) so it stays visible and editable regardless of which content
 * view is active, since theme is orthogonal to content (design Decision 2).
 */
export function ThemePicker({ cvId }: { cvId: string }) {
  const theme = useEditorStore((s) => s.theme)
  const setTheme = useEditorStore((s) => s.setTheme)

  // Debounced save persists to `cv.theme` without touching `updatedAt` —
  // ref'd (not re-created) so rapid input changes share one debounce timer.
  // Local state already updated optimistically via `setTheme` above, so a
  // failed save must be surfaced — otherwise the user believes their choice
  // persisted when it silently didn't (e.g. session expiry, network blip).
  const debouncedSaveRef = useRef(
    debounce((id: string, next: CvTheme) => {
      void saveTheme(id, next).then((result) => {
        if (!result.ok) toast.error(result.error)
      })
    }, SAVE_DELAY_MS),
  )

  useEffect(() => {
    const debouncedSave = debouncedSaveRef.current
    return () => debouncedSave.cancel()
  }, [])

  function updateTheme(patch: Partial<CvTheme>) {
    const next = { ...theme, ...patch }
    setTheme(next)
    debouncedSaveRef.current(cvId, next)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-font-size">Tamaño de fuente</Label>
        <Input
          id="theme-font-size"
          type="number"
          min={THEME_FONT_SIZE_MIN}
          max={THEME_FONT_SIZE_MAX}
          step={0.5}
          value={theme.fontSize}
          onChange={(e) => updateTheme({ fontSize: Number(e.target.value) })}
          className="w-20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-accent-color">Color de acento</Label>
        <Input
          id="theme-accent-color"
          type="color"
          value={theme.accentColor}
          onChange={(e) => updateTheme({ accentColor: e.target.value })}
          className="h-8 w-14 p-1"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-margin">Margen</Label>
        <Select
          value={theme.margin}
          onValueChange={(value) =>
            updateTheme({ margin: value as CvTheme["margin"] })
          }
        >
          <SelectTrigger id="theme-margin" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MARGIN_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-line-height">Interlineado</Label>
        <Input
          id="theme-line-height"
          type="number"
          min={THEME_LINE_HEIGHT_MIN}
          max={THEME_LINE_HEIGHT_MAX}
          step={0.05}
          value={theme.lineHeight}
          onChange={(e) => updateTheme({ lineHeight: Number(e.target.value) })}
          className="w-20"
        />
      </div>
    </div>
  )
}
