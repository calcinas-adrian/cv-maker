import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { listUserCvs } from "@/features/cv/list"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { ImportFromFileDialog } from "@/features/cv-import/import-from-file-dialog"
import { AddPasskeyButton } from "./add-passkey-button"
import { CreateCvButton } from "./create-cv-button"

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/login")
  }

  // Ownership is implicit here: `listUserCvs` scopes by the session's
  // userId. Shared with the `/cv/*` sidebar — see `features/cv/list.ts`.
  const cvs = await listUserCvs(session.user.id)

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

      {cvs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no tenés CVs — creá el primero.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {cvs.map((item) => (
            <Link key={item.id} href={`/cv/${item.id}/edit`}>
              <Card className="hover:bg-muted/50 transition-colors">
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
