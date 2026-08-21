"use server"
import { createId } from "@paralleldrive/cuid2"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import {
  application,
  applicationInterview,
  applicationOffer,
} from "@/db/schema"
import { getSessionUserId } from "@/features/cv/ownership"
import type { Result } from "@/lib/result"
import {
  createInterviewSchema,
  createManualApplicationSchema,
  offerSchema,
  updateApplicationSchema,
} from "@/schemas/application.schema"

async function ownedId(id: string): Promise<Result<{ userId: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }
  const [row] = await db
    .select({ id: application.id })
    .from(application)
    .where(
      and(
        eq(application.id, id),
        eq(application.userId, userId),
        isNull(application.deletedAt),
      ),
    )
    .limit(1)
  return row
    ? { ok: true, data: { userId } }
    : { ok: false, error: "No encontrado", code: "not_found" }
}
const invalid = (): Result<never> => ({
  ok: false,
  error: "Datos de postulación inválidos",
  code: "invalid_input",
})
const refresh = () => revalidatePath("/applications")
export async function createManualApplication(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = createManualApplicationSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }
  const id = createId()
  await db.insert(application).values({ id, userId, ...parsed.data })
  refresh()
  return { ok: true, data: { id } }
}
export async function updateApplication(input: unknown): Promise<Result<void>> {
  const parsed = updateApplicationSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const access = await ownedId(parsed.data.id)
  if (!access.ok) return access
  const { id, ...values } = parsed.data
  await db
    .update(application)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(application.id, id))
  refresh()
  return { ok: true, data: undefined }
}
export async function deleteApplication(id: string): Promise<Result<void>> {
  const access = await ownedId(id)
  if (!access.ok) return access
  await db
    .update(application)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(application.id, id))
  refresh()
  return { ok: true, data: undefined }
}
export async function createInterview(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = createInterviewSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const access = await ownedId(parsed.data.applicationId)
  if (!access.ok) return access
  const { applicationId, ...values } = parsed.data
  const id = createId()
  await db.insert(applicationInterview).values({ id, applicationId, ...values })
  refresh()
  return { ok: true, data: { id } }
}
export async function deleteInterview(id: string): Promise<Result<void>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }
  const [row] = await db
    .select({ applicationId: applicationInterview.applicationId })
    .from(applicationInterview)
    .innerJoin(
      application,
      and(
        eq(application.id, applicationInterview.applicationId),
        eq(application.userId, userId),
        isNull(application.deletedAt),
      ),
    )
    .where(eq(applicationInterview.id, id))
    .limit(1)
  if (!row) return { ok: false, error: "No encontrado", code: "not_found" }
  await db.delete(applicationInterview).where(eq(applicationInterview.id, id))
  refresh()
  return { ok: true, data: undefined }
}
export async function saveOffer(input: unknown): Promise<Result<void>> {
  const parsed = offerSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const access = await ownedId(parsed.data.applicationId)
  if (!access.ok) return access
  const { applicationId, ...values } = parsed.data
  await db
    .insert(applicationOffer)
    .values({ id: createId(), applicationId, ...values })
    .onConflictDoUpdate({
      target: applicationOffer.applicationId,
      set: { ...values, updatedAt: new Date() },
    })
  refresh()
  return { ok: true, data: undefined }
}
