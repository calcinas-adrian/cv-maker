import { z } from "zod"
import { AI_PROVIDERS } from "@/lib/ai/catalog"

/**
 * Input contract for `saveProviderKey` (features/ai-providers/actions.ts).
 *
 * `id` is present only when updating an existing row — absent, it's a
 * create. `baseURL` is required for the "compatible" provider (a custom
 * OpenAI-compatible endpoint) and meaningless for the named providers,
 * enforced by the `.refine` below.
 */
export const providerKeyInputSchema = z
  .object({
    id: z.string().optional(),
    provider: z.enum(AI_PROVIDERS),
    apiKey: z.string().min(1, "La API key es obligatoria"),
    baseURL: z.string().url("URL inválida").optional(),
    defaultModel: z.string().min(1, "Elegí un modelo"),
  })
  .refine((data) => data.provider !== "compatible" || !!data.baseURL, {
    message: "La base URL es obligatoria para el proveedor compatible",
    path: ["baseURL"],
  })

export type ProviderKeyInput = z.infer<typeof providerKeyInputSchema>
