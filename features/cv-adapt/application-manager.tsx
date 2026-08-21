"use client"
import { useState, useTransition } from "react"
import Link from "next/link"
import {
  CalendarPlusIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDeleteButton } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  applicationStatuses,
  type ApplicationStatus,
} from "@/schemas/application.schema"
import {
  createInterview,
  createManualApplication,
  deleteApplication,
  deleteInterview,
  saveOffer,
  updateApplication,
} from "./application-actions"
import type { ApplicationListItem } from "./list"

const labels: Record<ApplicationStatus, string> = {
  saved: "Guardada",
  applied: "Postulada",
  screening: "Screening",
  interviewing: "Entrevistas",
  offer: "Oferta",
  accepted: "Aceptada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
}
const empty = {
  status: "saved" as ApplicationStatus,
  company: "",
  role: "",
  jobUrl: "",
  jobPostingText: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  appliedAt: "",
  followUpAt: "",
  notes: "",
}
type Draft = typeof empty
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
function statusClass(status: ApplicationStatus) {
  return status === "accepted"
    ? "bg-emerald-500/10 text-emerald-700"
    : status === "rejected" || status === "withdrawn"
      ? "bg-muted text-muted-foreground"
      : "bg-primary/10 text-primary"
}

export function ApplicationManager({
  items,
}: {
  items: ApplicationListItem[]
}) {
  const [creating, setCreating] = useState(false)
  const [visibleItems, setVisibleItems] = useState(items)
  function removeOptimistically(id: string) {
    const removed = visibleItems.find((item) => item.id === id)
    setVisibleItems((current) => current.filter((item) => item.id !== id))
    return () => {
      if (removed)
        setVisibleItems((current) =>
          [...current, removed].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          ),
        )
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {visibleItems.length
            ? `${visibleItems.length} ${visibleItems.length === 1 ? "postulación" : "postulaciones"} en seguimiento`
            : "Llevá el registro de cada oportunidad en un solo lugar."}
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon data-icon="inline-start" />
          Nueva postulación
        </Button>
      </div>
      {visibleItems.length ? (
        <div className="flex flex-col gap-3">
          {visibleItems.map((item) => (
            <ApplicationCard
              key={item.id}
              item={item}
              onRemove={() => removeOptimistically(item.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <FileTextIcon className="text-muted-foreground size-5" />
            <div>
              <p className="font-medium">
                Todavía no registraste postulaciones
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Podés crear una manual o adaptar un CV desde tu banco.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              Crear postulación
            </Button>
          </CardContent>
        </Card>
      )}
      <ApplicationDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={(draft) => {
          const optimistic: ApplicationListItem = {
            id: `optimistic-${crypto.randomUUID()}`,
            createdAt: new Date(),
            status: draft.status,
            company: draft.company || null,
            role: draft.role || null,
            jobUrl: draft.jobUrl || null,
            jobPostingText: draft.jobPostingText || null,
            contactName: draft.contactName || null,
            contactEmail: draft.contactEmail || null,
            contactPhone: draft.contactPhone || null,
            appliedAt: draft.appliedAt || null,
            followUpAt: draft.followUpAt || null,
            notes: draft.notes || null,
            adaptation: null,
            interviews: [],
            offer: null,
          }
          setVisibleItems((current) => [optimistic, ...current])
          return {
            replace: (id: string) =>
              setVisibleItems((current) =>
                current.map((item) =>
                  item.id === optimistic.id ? { ...optimistic, id } : item,
                ),
              ),
            rollback: () =>
              setVisibleItems((current) =>
                current.filter((item) => item.id !== optimistic.id),
              ),
          }
        }}
      />
    </div>
  )
}

function ApplicationCard({
  item,
  onRemove,
}: {
  item: ApplicationListItem
  onRemove: () => () => void
}) {
  const [open, setOpen] = useState(false)
  const [displayItem, setDisplayItem] = useState(item)
  return (
    <Card>
      <CardHeader className="py-4">
        <button
          className="flex w-full items-start gap-3 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {displayItem.role || "Puesto sin registrar"}
            </CardTitle>
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {displayItem.company || "Empresa sin registrar"}
              {item.adaptation ? (
                <> · CV adaptado: {item.adaptation.cvTitle}</>
              ) : (
                " · Registro manual"
              )}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClass(displayItem.status)}`}
          >
            {labels[displayItem.status]}
          </span>
          <ChevronDownIcon
            className={`text-muted-foreground mt-1 size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CardHeader>
      {open ? (
        <CardContent className="border-t pt-5">
          <ApplicationEditor
            item={displayItem}
            onRemove={onRemove}
            onUpdate={setDisplayItem}
          />
        </CardContent>
      ) : null}
    </Card>
  )
}

function ApplicationDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (draft: Draft) => {
    replace: (id: string) => void
    rollback: () => void
  }
}) {
  const [draft, setDraft] = useState<Draft>(empty)
  const [pending, start] = useTransition()
  const set = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))
  function submit() {
    const optimistic = onCreate(draft)
    setDraft(empty)
    onOpenChange(false)
    start(async () => {
      const result = await createManualApplication(draft)
      if (!result.ok) {
        optimistic.rollback()
        toast.error(result.error)
        return
      }
      toast.success("Postulación creada")
      optimistic.replace(result.data.id)
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nueva postulación</DialogTitle>
          <DialogDescription>
            Registrá lo esencial ahora. Podés completar el seguimiento después.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fields draft={draft} set={set} includePosting />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            disabled={pending || (!draft.company.trim() && !draft.role.trim())}
            onClick={submit}
          >
            {pending ? "Creando…" : "Crear postulación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Fields({
  draft,
  set,
  includePosting = false,
}: {
  draft: Draft
  set: (key: keyof Draft, value: string) => void
  includePosting?: boolean
}) {
  return (
    <>
      <Field label="Empresa">
        <Input
          value={draft.company}
          onChange={(e) => set("company", e.target.value)}
        />
      </Field>
      <Field label="Puesto">
        <Input
          value={draft.role}
          onChange={(e) => set("role", e.target.value)}
        />
      </Field>
      <Field label="Estado">
        <select
          className="h-8 rounded-sm border bg-transparent px-2 text-sm"
          value={draft.status}
          onChange={(e) => set("status", e.target.value)}
        >
          {applicationStatuses.map((status) => (
            <option key={status} value={status}>
              {labels[status]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="URL del aviso">
        <Input
          type="url"
          value={draft.jobUrl}
          onChange={(e) => set("jobUrl", e.target.value)}
        />
      </Field>
      <Field label="Fecha de postulación">
        <Input
          type="date"
          value={draft.appliedAt}
          onChange={(e) => set("appliedAt", e.target.value)}
        />
      </Field>
      <Field label="Próximo seguimiento">
        <Input
          type="date"
          value={draft.followUpAt}
          onChange={(e) => set("followUpAt", e.target.value)}
        />
      </Field>
      <Field label="Contacto">
        <Input
          value={draft.contactName}
          onChange={(e) => set("contactName", e.target.value)}
        />
      </Field>
      <Field label="Email de contacto">
        <Input
          type="email"
          value={draft.contactEmail}
          onChange={(e) => set("contactEmail", e.target.value)}
        />
      </Field>
      <Field label="Teléfono">
        <Input
          value={draft.contactPhone}
          onChange={(e) => set("contactPhone", e.target.value)}
        />
      </Field>
      {includePosting ? (
        <Field label="Texto del aviso">
          <Textarea
            className="min-h-28"
            value={draft.jobPostingText}
            onChange={(e) => set("jobPostingText", e.target.value)}
          />
        </Field>
      ) : null}
      <Field label="Notas">
        <Textarea
          className="min-h-24"
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
    </>
  )
}

function ApplicationEditor({
  item,
  onRemove,
  onUpdate,
}: {
  item: ApplicationListItem
  onRemove: () => () => void
  onUpdate: (item: ApplicationListItem) => void
}) {
  const [draft, setDraft] = useState<Draft>({
    status: item.status,
    company: item.company ?? "",
    role: item.role ?? "",
    jobUrl: item.jobUrl ?? "",
    jobPostingText: item.jobPostingText ?? "",
    contactName: item.contactName ?? "",
    contactEmail: item.contactEmail ?? "",
    contactPhone: item.contactPhone ?? "",
    appliedAt: item.appliedAt ?? "",
    followUpAt: item.followUpAt ?? "",
    notes: item.notes ?? "",
  })
  const [interview, setInterview] = useState({
    scheduledAt: "",
    kind: "Entrevista",
    interviewer: "",
    location: "",
    notes: "",
  })
  const [offer, setOffer] = useState({
    receivedAt: item.offer?.receivedAt ?? "",
    compensation: item.offer?.compensation ?? "",
    currency: item.offer?.currency ?? "",
    employmentType: item.offer?.employmentType ?? "",
    responseDueAt: item.offer?.responseDueAt ?? "",
    notes: item.offer?.notes ?? "",
  })
  const [pending, start] = useTransition()
  const set = (key: keyof Draft, value: string) =>
    setDraft((v) => ({ ...v, [key]: value }))
  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) =>
    start(async () => {
      const result = await action()
      if (result.ok) toast.success(success)
      else toast.error(result.error ?? "No se pudo guardar")
    })
  function saveDetails() {
    const previous = item
    const next = {
      ...item,
      ...draft,
      company: draft.company || null,
      role: draft.role || null,
      jobUrl: draft.jobUrl || null,
      jobPostingText: draft.jobPostingText || null,
      contactName: draft.contactName || null,
      contactEmail: draft.contactEmail || null,
      contactPhone: draft.contactPhone || null,
      appliedAt: draft.appliedAt || null,
      followUpAt: draft.followUpAt || null,
      notes: draft.notes || null,
    }
    onUpdate(next)
    start(async () => {
      const result = await updateApplication({ id: item.id, ...draft })
      if (!result.ok) {
        onUpdate(previous)
        toast.error(result.error ?? "No se pudo guardar")
        return
      }
      toast.success("Cambios guardados")
    })
  }
  function addInterview() {
    const previous = item
    const optimistic = {
      id: `optimistic-${crypto.randomUUID()}`,
      scheduledAt: interview.scheduledAt,
      kind: interview.kind,
      interviewer: interview.interviewer || null,
      location: interview.location || null,
      notes: interview.notes || null,
    }
    onUpdate({ ...item, interviews: [...item.interviews, optimistic] })
    setInterview({
      scheduledAt: "",
      kind: "Entrevista",
      interviewer: "",
      location: "",
      notes: "",
    })
    start(async () => {
      const result = await createInterview({
        applicationId: item.id,
        ...interview,
      })
      if (!result.ok) {
        onUpdate(previous)
        toast.error(result.error ?? "No se pudo guardar")
        return
      }
      onUpdate({
        ...item,
        interviews: [...item.interviews, { ...optimistic, id: result.data.id }],
      })
      toast.success("Entrevista registrada")
    })
  }
  function saveCurrentOffer() {
    const previous = item
    const next = {
      receivedAt: offer.receivedAt,
      compensation: offer.compensation || null,
      currency: offer.currency || null,
      employmentType: offer.employmentType || null,
      responseDueAt: offer.responseDueAt || null,
      notes: offer.notes || null,
    }
    onUpdate({ ...item, offer: next })
    start(async () => {
      const result = await saveOffer({ applicationId: item.id, ...offer })
      if (!result.ok) {
        onUpdate(previous)
        toast.error(result.error ?? "No se pudo guardar")
        return
      }
      toast.success("Oferta guardada")
    })
  }
  return (
    <div className="flex flex-col gap-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Fields draft={draft} set={set} />
      </div>
      {item.adaptation ? (
        <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-md p-3 text-sm">
          <span>
            CV adaptado: <strong>{item.adaptation.cvTitle}</strong>
          </span>
          <Link
            className="ml-auto inline-flex items-center gap-1 underline"
            href={`/cv/${item.adaptation.cvId}/edit`}
          >
            Abrir CV <ExternalLinkIcon className="size-3" />
          </Link>
        </div>
      ) : null}
      <Button className="self-start" disabled={pending} onClick={saveDetails}>
        Guardar cambios
      </Button>
      <section className="border-t pt-5">
        <h3 className="font-medium">Entrevistas</h3>
        <div className="mt-3 flex flex-col gap-2">
          {item.interviews.map((entry) => (
            <div
              key={entry.id}
              className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md p-3 text-sm"
            >
              <CalendarPlusIcon className="size-4" />
              <span className="font-medium">{entry.kind}</span>
              <span>{entry.scheduledAt}</span>
              {entry.interviewer ? (
                <span className="text-muted-foreground">
                  con {entry.interviewer}
                </span>
              ) : null}
              <Button
                className="ml-auto"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => deleteInterview(entry.id), "Entrevista eliminada")
                }
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Fecha y hora"
            value={interview.scheduledAt}
            onChange={(e) =>
              setInterview({ ...interview, scheduledAt: e.target.value })
            }
          />
          <Input
            placeholder="Tipo de instancia"
            value={interview.kind}
            onChange={(e) =>
              setInterview({ ...interview, kind: e.target.value })
            }
          />
          <Input
            placeholder="Entrevistador/a"
            value={interview.interviewer}
            onChange={(e) =>
              setInterview({ ...interview, interviewer: e.target.value })
            }
          />
          <Input
            placeholder="Enlace o lugar"
            value={interview.location}
            onChange={(e) =>
              setInterview({ ...interview, location: e.target.value })
            }
          />
        </div>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={pending || !interview.scheduledAt}
          onClick={addInterview}
        >
          Agregar entrevista
        </Button>
      </section>
      <section className="border-t pt-5">
        <h3 className="font-medium">Oferta</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Fecha recibida"
            value={offer.receivedAt}
            onChange={(e) => setOffer({ ...offer, receivedAt: e.target.value })}
          />
          <Input
            placeholder="Compensación"
            value={offer.compensation}
            onChange={(e) =>
              setOffer({ ...offer, compensation: e.target.value })
            }
          />
          <Input
            placeholder="Moneda"
            value={offer.currency}
            onChange={(e) => setOffer({ ...offer, currency: e.target.value })}
          />
          <Input
            placeholder="Modalidad / contrato"
            value={offer.employmentType}
            onChange={(e) =>
              setOffer({ ...offer, employmentType: e.target.value })
            }
          />
          <Input
            type="date"
            value={offer.responseDueAt}
            onChange={(e) =>
              setOffer({ ...offer, responseDueAt: e.target.value })
            }
          />
        </div>
        <Textarea
          className="mt-3"
          placeholder="Notas de la oferta"
          value={offer.notes}
          onChange={(e) => setOffer({ ...offer, notes: e.target.value })}
        />
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={pending || !offer.receivedAt}
          onClick={saveCurrentOffer}
        >
          Guardar oferta
        </Button>
      </section>
      <ConfirmDeleteButton
        title="¿Eliminar postulación?"
        description="Se ocultará el seguimiento. El CV adaptado y su historial se conservarán."
        onConfirm={async () => {
          const rollback = onRemove()
          const result = await deleteApplication(item.id)
          if (result.ok) toast.success("Postulación eliminada")
          else {
            rollback()
            toast.error(result.error)
          }
        }}
      >
        Eliminar postulación
      </ConfirmDeleteButton>
    </div>
  )
}
