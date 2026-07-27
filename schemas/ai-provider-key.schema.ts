import { z } from "zod"
import { AI_PROVIDERS } from "@/lib/ai/catalog"

/**
 * Input contract for `saveProviderKey` (features/ai-providers/actions.ts).
 *
 * `id` is present only when updating an existing row — absent, it's a
 * create. `baseURL` is required for the "compatible" provider (a custom
 * OpenAI-compatible endpoint) and meaningless for the named providers,
 * enforced by the first `.refine` below.
 *
 * `apiKey` is OPTIONAL, which is a Phase 6 change with a specific reason:
 * it used to be required even on update, and since the app never shows a
 * stored key back (it is encrypted, and that is correct), changing only the
 * model meant retyping a secret the user did not have at hand — so they
 * went and minted a new one at the provider instead. On update, omitting it
 * now means "keep the stored key". On create it is still mandatory, which
 * the second `.refine` enforces, because there is nothing stored yet.
 *
 * `modelId` is the model registered alongside the credential. On create it
 * seeds the first `ai_provider_model` row; a credential with zero models is
 * useless, and validation needs a concrete model to call.
 */
export const providerKeyInputSchema = z
  .object({
    id: z.string().optional(),
    provider: z.enum(AI_PROVIDERS),
    // No `.min(1)` and no `.transform` here on purpose. The edit form keeps
    // this input mounted and controlled, so it submits `""` rather than
    // omitting the field, and `""` must be a legal "leave the stored key
    // alone" signal. A `.transform` that mapped `""` to `undefined` would
    // split `z.input` from `z.output` and make `useForm<ProviderKeyInput>`
    // fight `zodResolver` over which side it is typed against. The refine
    // below covers the create case, and the action trims and treats blank
    // as absent.
    apiKey: z.string().optional(),
    baseURL: z.string().url("URL inválida").optional(),
    modelId: z.string().min(1, "Elegí un modelo"),
  })
  .refine((data) => data.provider !== "compatible" || !!data.baseURL, {
    message: "La base URL es obligatoria para el proveedor compatible",
    path: ["baseURL"],
  })
  .refine((data) => !!data.id || !!data.apiKey?.trim(), {
    message: "La API key es obligatoria",
    path: ["apiKey"],
  })

export type ProviderKeyInput = z.infer<typeof providerKeyInputSchema>

/**
 * Input for `addProviderModel` — registering an ADDITIONAL model against a
 * credential that already exists.
 *
 * There is deliberately no `apiKey` field. This flow's entire purpose is to
 * reuse the stored, already-encrypted key: re-sending the plaintext would
 * defeat it, and copying the ciphertext into a second credential row would
 * duplicate the secret and turn key rotation into an N-row operation.
 */
export const providerModelInputSchema = z.object({
  providerKeyId: z.string().min(1),
  modelId: z.string().min(1, "Elegí un modelo"),
})

export type ProviderModelInput = z.infer<typeof providerModelInputSchema>
