import { z } from "zod"

/**
 * AI-extraction output contracts for the "Memorias" capture flow
 * (`features/career-bank/ai-extract-memory.ts`) — mirrors `schemas/
 * cv-adapt.schema.ts`'s shape: every field required, defined separately
 * from the reviewed-input contract (`schemas/bank.schema.ts`'s
 * `memoryDraftInputSchema`) because the AI output and the user-edited draft
 * are different boundaries that happen to share most fields.
 */

export const memoryDraftExtractSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bullet: z.string().trim().min(3).max(2000),
  skillTags: z.array(z.string().trim().min(1).max(40)).max(20),
  // 0-3 short clarifying questions about concrete missing details. Empty
  // when the raw text is already solid — questions are never forced.
  questions: z.array(z.string().trim().min(1).max(500)).max(3),
})

export type MemoryDraftExtract = z.infer<typeof memoryDraftExtractSchema>

export const memoryRefineExtractSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bullet: z.string().trim().min(3).max(2000),
  skillTags: z.array(z.string().trim().min(1).max(40)).max(20),
  // Short explanation of what changed between the draft and the refined
  // version, shown to the user in the review step.
  notes: z.string().trim().max(2000),
})

export type MemoryRefineExtract = z.infer<typeof memoryRefineExtractSchema>
