import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listProviderKeys } from "@/features/ai-providers/actions"
import { ProviderSettings } from "@/features/ai-providers/provider-settings"

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const result = await listProviderKeys()
  const initialProviders = result.ok ? result.data : []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium">Proveedores de IA</h1>
        <p className="text-muted-foreground text-sm">
          Configurá tu propia API key por proveedor. Cada clave se valida contra
          el proveedor antes de guardarse y se almacena encriptada — nunca se
          vuelve a mostrar en texto plano.
        </p>
      </div>
      <ProviderSettings initialProviders={initialProviders} />
    </div>
  )
}
