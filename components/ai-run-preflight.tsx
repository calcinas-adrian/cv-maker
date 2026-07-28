import type { ReactNode } from "react"

export type PreflightRow = {
  label: string
  value: ReactNode
}

/**
 * The "here is exactly what is about to run" panel shown before every paid
 * AI call (file import, GitHub analysis, adapt-to-posting).
 *
 * Deliberately NOT a "¿Estás seguro?" dialog. A yes/no prompt in front of a
 * button the user just pressed on purpose earns nothing: by the third time
 * it is dismissed reflexively, and from then on it protects nothing while
 * costing a click forever. What actually prevents the mistake is showing
 * the facts the user could NOT see when they clicked — which file, which
 * repo, which model, how deep the analysis goes. Those are worth reading
 * because they are new information, and a wrong one is visible at a glance.
 *
 * The real cancel affordance is structural rather than a button on a
 * running request: Server Actions cannot be aborted from the client (there
 * is no way to pass an `AbortSignal` into the call, so the provider request
 * completes and is billed regardless). Since the run cannot be stopped once
 * started, the only honest place to stop it is BEFORE it starts — which is
 * this panel. Every host renders a real way back from here.
 *
 * Renders the summary only; each dialog owns its own footer buttons so the
 * back/confirm labels can name that specific action.
 */
export function AiRunPreflight({
  rows,
  children,
}: {
  rows: PreflightRow[]
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2 rounded-lg border p-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 text-sm">
            <dt className="text-muted-foreground w-28 shrink-0 text-xs">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      {children}
      <p className="text-muted-foreground text-xs">
        Esto consume una llamada a tu proveedor de IA. Una vez que empieza no se
        puede cancelar.
      </p>
    </div>
  )
}
