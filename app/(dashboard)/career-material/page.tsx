import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listMaterialPage } from "@/features/career-material/actions"
import { CareerMaterialManager } from "@/features/career-material/career-material-manager"

export default async function CareerMaterialPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const result = await listMaterialPage()
  const initialSaved = result.ok ? result.data.saved : []
  const initialDerived = result.ok ? result.data.derived : []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium">Tu material</h1>
        <p className="text-muted-foreground text-sm">
          Guardá viñetas, proyectos, habilidades y notas de resumen que querés
          poder reutilizar al adaptar un CV a un aviso — este material, junto
          con el contenido de tus otros CVs, es lo único que la IA puede usar
          para completar una adaptación.
        </p>
      </div>
      <CareerMaterialManager
        initialSaved={initialSaved}
        initialDerived={initialDerived}
      />
    </div>
  )
}
