import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listProviderKeys } from "@/features/ai-providers/actions"
import { ProviderSettings } from "@/features/ai-providers/provider-settings"

export default async function AiProvidersPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const result = await listProviderKeys()
  const initialProviders = result.ok ? result.data : []

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-medium">Proveedores de IA</h1>
        <p className="text-muted-foreground text-sm">
          Se usa para importar un CV desde un archivo o desde GitHub, adaptar un
          CV (propio o armado desde tu banco) a un aviso de trabajo, y traducir
          cuando la traducción gratuita del navegador no está disponible.
        </p>
        <p className="text-muted-foreground text-sm">
          Configurá tu propia API key por proveedor: la pagás vos directamente
          con el proveedor elegido, la app nunca cobra por su uso. Cada clave se
          valida contra el proveedor antes de guardarse y se almacena encriptada
          — nunca se vuelve a mostrar en texto plano.
        </p>
        <p className="text-muted-foreground text-sm">
          ¿No tenés una clave todavía? Conseguila en la consola del proveedor:{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Anthropic
          </a>
          ,{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            OpenAI
          </a>
          ,{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Google
          </a>{" "}
          o{" "}
          <a
            href="https://platform.deepseek.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            DeepSeek
          </a>
          . Si usás un proveedor compatible con OpenAI (un endpoint propio o de
          terceros), conseguí la clave y la URL base en ese mismo servicio.
        </p>
      </div>
      <ProviderSettings initialProviders={initialProviders} />
    </div>
  )
}
