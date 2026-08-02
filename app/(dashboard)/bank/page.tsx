import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getBankPage } from "@/features/career-bank/actions"
import { BankManager } from "@/features/career-bank/bank-manager"
import { ImportFromFileDialog } from "@/features/cv-import/import-from-file-dialog"
import { BuildCvFromBankDialog } from "@/features/cv-from-bank/build-cv-dialog"
import { AdaptFromBankDialog } from "@/features/cv-adapt/adapt-from-bank-dialog"

export default async function BankPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const result = await getBankPage()
  if (!result.ok) {
    redirect("/login")
  }

  // Same question the landing hero asks, answered from data already loaded
  // here — no extra query. An empty bank gets the import affordance this
  // screen was missing entirely (both importers lived elsewhere, so the one
  // page dedicated to filling the bank offered no way to fill it in bulk);
  // a bank with material gets the actions that turn it into a CV, right
  // where the user finishes curating.
  const hasMaterial =
    result.data.materials.length > 0 || result.data.engagements.length > 0

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-medium">Tu banco</h1>
          <p className="text-muted-foreground text-sm">
            Guardá tu trayectoria, viñetas, educación, credenciales, idiomas y
            habilidades para poder reutilizarlos al adaptar un CV a un aviso —
            este banco es lo único que la IA puede usar para completar una
            adaptación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasMaterial ? (
            <>
              <BuildCvFromBankDialog triggerVariant="outline" />
              <AdaptFromBankDialog triggerVariant="outline" />
            </>
          ) : (
            <ImportFromFileDialog />
          )}
        </div>
      </div>
      <BankManager initialData={result.data} />
    </div>
  )
}
