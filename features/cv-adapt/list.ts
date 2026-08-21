import "server-only"
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/db"
import {
  adaptation,
  application,
  applicationInterview,
  applicationOffer,
  bank,
  cv,
} from "@/db/schema"
import type { ApplicationStatus } from "@/schemas/application.schema"

export type ApplicationListItem = {
  id: string
  createdAt: Date
  status: ApplicationStatus
  company: string | null
  role: string | null
  jobUrl: string | null
  jobPostingText: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  appliedAt: string | null
  followUpAt: string | null
  notes: string | null
  adaptation: {
    id: string
    cvId: string
    cvTitle: string
    sourceName: string | null
    adaptationNotes: string | null
  } | null
  interviews: {
    id: string
    scheduledAt: string
    kind: string
    interviewer: string | null
    location: string | null
    notes: string | null
  }[]
  offer: {
    receivedAt: string
    compensation: string | null
    currency: string | null
    employmentType: string | null
    responseDueAt: string | null
    notes: string | null
  } | null
}

export const APPLICATIONS_PER_PAGE = 25

export async function listApplicationsPage(userId: string, page = 1) {
  const safePage = Math.max(1, Math.floor(page))
  const [{ total }] = await db
    .select({ total: count() })
    .from(application)
    .where(and(eq(application.userId, userId), isNull(application.deletedAt)))
  const rows = await db
    .select({
      id: application.id,
      createdAt: application.createdAt,
      status: application.status,
      company: application.company,
      role: application.role,
      jobUrl: application.jobUrl,
      manualPosting: application.jobPostingText,
      contactName: application.contactName,
      contactEmail: application.contactEmail,
      contactPhone: application.contactPhone,
      appliedAt: application.appliedAt,
      followUpAt: application.followUpAt,
      notes: application.notes,
      adaptationId: adaptation.id,
      adaptationPosting: adaptation.jobPostingText,
      adaptationNotes: adaptation.adaptationNotes,
      cvId: cv.id,
      cvTitle: cv.title,
      sourceName: bank.name,
    })
    .from(application)
    .leftJoin(adaptation, eq(adaptation.id, application.adaptationId))
    .leftJoin(cv, and(eq(cv.id, adaptation.cvId), isNull(cv.deletedAt)))
    .leftJoin(bank, and(eq(bank.id, adaptation.bankId), isNull(bank.deletedAt)))
    .where(and(eq(application.userId, userId), isNull(application.deletedAt)))
    .orderBy(desc(application.createdAt))
    .limit(APPLICATIONS_PER_PAGE)
    .offset((safePage - 1) * APPLICATIONS_PER_PAGE)
  const ids = rows.map((row) => row.id)
  const [interviews, offers] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(applicationInterview)
          .where(inArray(applicationInterview.applicationId, ids))
          .orderBy(asc(applicationInterview.scheduledAt)),
        db
          .select()
          .from(applicationOffer)
          .where(inArray(applicationOffer.applicationId, ids)),
      ])
    : [[], []]
  const interviewMap = new Map<string, typeof interviews>()
  for (const interview of interviews)
    interviewMap.set(interview.applicationId, [
      ...(interviewMap.get(interview.applicationId) ?? []),
      interview,
    ])
  const offerMap = new Map(offers.map((offer) => [offer.applicationId, offer]))
  const items: ApplicationListItem[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    status: row.status as ApplicationStatus,
    company: row.company,
    role: row.role,
    jobUrl: row.jobUrl,
    jobPostingText: row.adaptationPosting ?? row.manualPosting,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    appliedAt: row.appliedAt,
    followUpAt: row.followUpAt,
    notes: row.notes,
    adaptation:
      row.adaptationId && row.cvId && row.cvTitle
        ? {
            id: row.adaptationId,
            cvId: row.cvId,
            cvTitle: row.cvTitle,
            sourceName: row.sourceName,
            adaptationNotes: row.adaptationNotes,
          }
        : null,
    interviews: interviewMap.get(row.id) ?? [],
    offer: offerMap.get(row.id) ?? null,
  }))
  return {
    items,
    page: safePage,
    total,
    totalPages: Math.max(1, Math.ceil(total / APPLICATIONS_PER_PAGE)),
  }
}

export async function listApplications(
  userId: string,
): Promise<ApplicationListItem[]> {
  const { items } = await listApplicationsPage(userId)
  return items
}

/** Compatibility alias for the page while application tracking replaces adaptation history. */
export const listUserAdaptations = listApplications
export type AdaptationListItem = ApplicationListItem
