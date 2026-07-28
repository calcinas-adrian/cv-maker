import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { listUserAdaptations } from "@/features/cv-adapt/list"
import { AdaptationHistory } from "@/features/cv-adapt/adaptation-history"

/**
 * Application history — one entry per CV adapted to a job posting.
 *
 * Reads `cv_adaptation`, which `createCvFromAdaptation` had been writing
 * since Phase 5 with nothing on the other end: the posting and the lineage
 * were stored on every adaptation and never surfaced anywhere in the UI.
 * This page is that missing read side.
 */
export default async function ApplicationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // Ownership is implicit, same as `/dashboard`: the query scopes every row
  // to the session's userId through the adapted CV it produced.
  const items = await listUserAdaptations(session.user.id)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium">Postulaciones</h1>
        <p className="text-muted-foreground text-sm">
          Cada vez que adaptás un CV a un aviso queda registrado acá: el aviso
          completo, de qué CV salió y qué priorizó la IA al adaptarlo.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no adaptaste ningún CV. Abrí uno de{" "}
          <Link
            href="/dashboard"
            className="hover:text-foreground underline underline-offset-2"
          >
            tus CVs
          </Link>{" "}
          y usá &ldquo;Adaptar a un aviso&rdquo;.
        </p>
      ) : (
        <AdaptationHistory items={items} />
      )}
    </div>
  )
}
