import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { getEntryState } from "@/features/entry/entry-state"
import { DashboardCvList } from "@/features/cv/dashboard-cv-list"
import { ImportFromFileDialog } from "@/features/cv-import/import-from-file-dialog"
import { BuildCvFromBankDialog } from "@/features/cv-from-bank/build-cv-dialog"
import { AdaptFromBankDialog } from "@/features/cv-adapt/adapt-from-bank-dialog"
import { AddPasskeyButton } from "./add-passkey-button"
import { CreateCvButton } from "./create-cv-button"

/**
 * The landing screen, as a router of EMPHASIS rather than of routes — see
 * `features/entry/entry-state.ts` for the three stages and for why this is
 * one page instead of three redirects.
 *
 * The nav stays complete at every stage; only the hero changes. A first-time
 * user is led to fill the bank, a user with a full bank is led to produce a
 * CV from it, and a user with CVs gets their list back with both bank-origin
 * actions one click away.
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/login")
  }

  // Ownership is implicit: every query inside scopes by the session's userId.
  // This call also GUARANTEES the personal bank exists — see its docstring
  // for the importer gap that closes.
  const { stage, cvs, bankItemCount } = await getEntryState(session.user.id)

  if (stage === "empty-bank") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 rounded-xl border p-6">
          <h1 className="text-lg font-medium">Empezá por traer tu material</h1>
          <p className="text-muted-foreground text-sm">
            Subí un CV que ya tengas y lo desarmamos en tu banco: trayectoria,
            viñetas, educación, habilidades. Desde ahí, cada CV nuevo sale de un
            clic — y siempre con tus palabras.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ImportFromFileDialog />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/bank">Cargarlo a mano</Link>
            </Button>
          </div>
        </div>

        {/*
          TODO — Construcción del banco guiada por IA. Pedido explícito del
          dueño; documentado acá, deliberadamente SIN implementar.

          La idea: que este paso no sea "subí un PDF o llená siete
          formularios", sino una entrevista corta conducida por la IA. A
          partir de lo poco que ya se sabe (un repo de GitHub, un PDF a
          medio parsear, el rol que la persona declara) genera preguntas y
          va armando `bank_engagement` + `bank_material` con las respuestas,
          de a una por vez.

          Por qué vale la pena: la precisión de TODO lo que viene después
          depende del banco. Una viñeta dictada respondiendo "¿qué cambió
          gracias a eso?" es mejor material que una arrancada de un PDF, y
          preguntar sale más barato que corregir.

          Qué hay que decidir ANTES de escribir código:

          1. Dónde vive el estado. Una entrevista es un proceso con estado
             intermedio y el banco hoy no tiene dónde guardar uno a medio
             terminar. Ojo con `answer_prompt`/`answer_variant`: quedaron
             FUERA de la reestructuración por no tener lector (resolución 4,
             "nada de tablas muertas"). Esta feature podría ser su lector
             legítimo — o podría necesitar otra cosa. Decidirlo, no asumirlo.
          2. Es BYOK. Un usuario nuevo todavía no configuró proveedor de IA,
             así que este camino NO puede ser el único de la primera vez: o
             se ofrece después de Ajustes, o convive con el import como
             alternativa. Por eso la ruta determinística
             (`features/cv-from-bank`) existe y no toca ningún proveedor.
          3. Cada respuesta debería crear un `bank_material` con su variante
             por defecto vía `buildBankMaterialQueries`, igual que los
             importadores, para heredar promoción y provenance en vez de
             abrir un tercer camino de escritura al banco.

          Cuando se implemente, el lugar es este bloque: es la alternativa
          al import para llenar un banco vacío.
        */}
      </div>
    )
  }

  if (stage === "bank-ready") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 rounded-xl border p-6">
          <h1 className="text-lg font-medium">Tu banco ya tiene material</h1>
          <p className="text-muted-foreground text-sm">
            {bankItemCount} {bankItemCount === 1 ? "ítem" : "ítems"} guardados.
            Armá un CV base eligiendo qué entra, o pegá un aviso y que la IA
            elija por vos.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <BuildCvFromBankDialog />
            <AdaptFromBankDialog triggerVariant="outline" />
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/bank">Revisar el banco</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Tus CVs</h1>
        <div className="flex items-center gap-2">
          <AddPasskeyButton />
          <ImportFromFileDialog />
          <CreateCvButton />
        </div>
      </div>

      {/* The two bank-origin actions travel together and are labelled by
          where they read from. That label is what makes them legible next
          to "Nuevo CV", which starts from nothing. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <span className="text-muted-foreground mr-1 text-xs font-medium">
          Desde tu banco
        </span>
        <BuildCvFromBankDialog triggerVariant="outline" />
        <AdaptFromBankDialog triggerVariant="outline" />
      </div>

      <DashboardCvList cvs={cvs} />
    </div>
  )
}
