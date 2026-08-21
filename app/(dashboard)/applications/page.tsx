import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { ApplicationManager } from "@/features/cv-adapt/application-manager"
import { listApplicationsPage } from "@/features/cv-adapt/list"

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const requestedPage = Number((await searchParams).page ?? "1")
  const { items, page, totalPages } = await listApplicationsPage(
    session.user.id,
    requestedPage,
  )
  return (
    <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-lg font-medium">Postulaciones</h1>
        <p className="text-muted-foreground text-sm">
          {
            "Gestion\u00e1 el seguimiento de cada postulaci\u00f3n: estado, contacto, entrevistas, oferta y pr\u00f3ximas fechas."
          }
        </p>
      </div>
      <nav
        aria-label="Acciones relacionadas"
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
      >
        <Link className="underline" href="/dashboard">
          Ver tus CVs
        </Link>
        <Link className="underline" href="/bank">
          Ir al banco de carrera
        </Link>
      </nav>
      <ApplicationManager items={items} />
      {totalPages > 1 ? (
        <nav
          aria-label="Paginación de postulaciones"
          className="flex items-center justify-between gap-3 border-t pt-4 text-sm"
        >
          {page > 1 ? (
            <Link className="underline" href={`/applications?page=${page - 1}`}>
              Anterior
            </Link>
          ) : (
            <span className="text-muted-foreground">Anterior</span>
          )}
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="underline" href={`/applications?page=${page + 1}`}>
              Siguiente
            </Link>
          ) : (
            <span className="text-muted-foreground">Siguiente</span>
          )}
        </nav>
      ) : null}
    </div>
  )
}
