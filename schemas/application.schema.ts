import { z } from "zod"

export const applicationStatuses = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const
export type ApplicationStatus = (typeof applicationStatuses)[number]

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null)
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null)

export const applicationFieldsSchema = z.object({
  status: z.enum(applicationStatuses),
  company: optionalText(200),
  role: optionalText(200),
  jobUrl: z
    .string()
    .trim()
    .url("URL inválida")
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  contactName: optionalText(200),
  contactEmail: z
    .string()
    .trim()
    .email("Email inválido")
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  contactPhone: optionalText(80),
  appliedAt: optionalDate,
  followUpAt: optionalDate,
  notes: optionalText(10_000),
})
export const createManualApplicationSchema = applicationFieldsSchema.extend({
  jobPostingText: optionalText(20_000),
})
export const updateApplicationSchema = applicationFieldsSchema.extend({
  id: z.string().min(1),
})
export const createInterviewSchema = z.object({
  applicationId: z.string().min(1),
  scheduledAt: z.string().min(1).max(40),
  kind: optionalText(100).transform((value) => value ?? "interview"),
  interviewer: optionalText(200),
  location: optionalText(500),
  notes: optionalText(10_000),
})
export const updateInterviewSchema = createInterviewSchema
  .omit({ applicationId: true })
  .extend({ id: z.string().min(1) })
export const offerSchema = z.object({
  applicationId: z.string().min(1),
  receivedAt: z.string().min(1).max(40),
  compensation: optionalText(100),
  currency: optionalText(20),
  employmentType: optionalText(100),
  responseDueAt: optionalDate,
  notes: optionalText(10_000),
})
