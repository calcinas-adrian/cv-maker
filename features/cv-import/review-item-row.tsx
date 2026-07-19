"use client"

/**
 * The actual review/confirmation control for one extracted list item
 * (per the plan: "the actual review control... is a checkbox to include/
 * exclude that item, not full field-by-field editing in the dialog").
 * Deliberately has no edit/remove/reorder affordances — those already
 * exist on the full editor page (`ExperienceSection`/`ProjectSection`/etc.)
 * once the user lands there after confirming the import.
 */
export function ReviewItemRow({
  title,
  subtitle,
  included,
  onToggle,
}: {
  title: string
  subtitle?: string
  included: boolean
  onToggle: () => void
}) {
  return (
    <label className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors">
      <input
        type="checkbox"
        checked={included}
        onChange={onToggle}
        className="accent-primary mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0">
        <p
          className={`truncate text-sm font-medium ${
            included ? "" : "text-muted-foreground line-through"
          }`}
        >
          {title || "(sin título)"}
        </p>
        {subtitle ? (
          <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
        ) : null}
      </div>
    </label>
  )
}
