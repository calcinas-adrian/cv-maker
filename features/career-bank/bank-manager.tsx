"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { bankInputSchema, type BankInput } from "@/schemas/bank.schema"
import { getBankPage, updateBankProfile, type BankPageData } from "./actions"
import { EngagementSection } from "./sections/engagement-section"
import { MaterialSection } from "./sections/material-section"
import { EducationSection } from "./sections/education-section"
import { CredentialSection } from "./sections/credential-section"
import { LanguageSection } from "./sections/language-section"
import { SkillSection } from "./sections/skill-section"

function bankToFormValues(bank: BankPageData["bank"]): BankInput {
  return {
    name: bank.name,
    fullName: bank.fullName,
    headline: bank.headline,
    location: bank.location,
    email: bank.email,
    phone: bank.phone,
    linkedinUrl: bank.linkedinUrl,
    websiteUrl: bank.websiteUrl,
    githubUrl: bank.githubUrl,
  }
}

/**
 * The bank's own contact/identity fields — explicit Save, no autosave (same
 * convention as the rest of this feature and its predecessor,
 * `career-material-manager.tsx`'s `MaterialForm`). There is deliberately no
 * "create bank" affordance here: the row this form edits was already
 * auto-created by `getBankPage`/`getOrCreatePersonalBank` before this
 * component ever renders — see `architecture/bank-multiplicity-ui`.
 */
function BankProfileCard({
  bank,
  onSaved,
}: {
  bank: BankPageData["bank"]
  onSaved: () => void
}) {
  const form = useForm<BankInput>({
    resolver: zodResolver(bankInputSchema),
    defaultValues: bankToFormValues(bank),
  })

  async function onSubmit(values: BankInput) {
    const result = await updateBankProfile(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Banco actualizado")
    onSaved()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu banco</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del banco</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre completo</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="headline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titular</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ubicación</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="websiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sitio web</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="githubUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">Guardar</Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

/**
 * Top-level client component for `/bank` — the successor to
 * `CareerMaterialManager`. Receives the initial read from the RSC page
 * (`getBankPage` ran there with the request's session) and re-fetches
 * EVERYTHING after any mutation in any section, same "one combined refresh"
 * reasoning `CareerMaterialManager` used: the material list's variant
 * grouping and the material-form's engagement picker both depend on data
 * owned by other sections, so a partial-merge update could drift.
 */
export function BankManager({ initialData }: { initialData: BankPageData }) {
  const [data, setData] = useState(initialData)

  async function refresh() {
    const result = await getBankPage()
    if (result.ok) {
      setData(result.data)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <BankProfileCard bank={data.bank} onSaved={refresh} />
      <EngagementSection engagements={data.engagements} onChanged={refresh} />
      <MaterialSection
        materials={data.materials}
        engagements={data.engagements}
        onChanged={refresh}
      />
      <EducationSection education={data.education} onChanged={refresh} />
      <CredentialSection credentials={data.credentials} onChanged={refresh} />
      <LanguageSection languages={data.languages} onChanged={refresh} />
      <SkillSection skills={data.skills} onChanged={refresh} />
    </div>
  )
}
