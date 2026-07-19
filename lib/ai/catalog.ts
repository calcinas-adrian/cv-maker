/**
 * Supported BYOK provider ids. Single source of truth — imported by the
 * zod input schema, the provider registry, and the settings UI.
 */
export const AI_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "compatible",
] as const

export type AiProviderId = (typeof AI_PROVIDERS)[number]

export type ModelCatalogEntry = {
  id: string
  label: string
  /**
   * Rough guidance for the settings UI (e.g. sorting or a badge), not a
   * hard restriction — every model in the catalog can still be picked.
   * `true` marks a provider's flagship/structured-output-capable model;
   * `false` marks smaller/cheaper/older models that are known to be less
   * reliable at strict structured (JSON schema) output, which is what the
   * later CV-extraction phase relies on.
   */
  recommendedForExtraction: boolean
}

/**
 * Static, hand-curated model reference list per provider — intentionally
 * small (2-4 entries) rather than exhaustive, and easy to edit as
 * providers ship new models. Not consumed for any actual generation yet
 * (that's a later phase); today it only populates the "default model"
 * select in the provider settings form.
 *
 * Every id below was cross-checked against the literal `*ModelId` union
 * types shipped in the installed provider packages' own type definitions
 * (ai@7.0.16, @ai-sdk/anthropic@4.0.8, @ai-sdk/openai@4.0.8,
 * @ai-sdk/google@4.0.8, @ai-sdk/deepseek@3.0.5) rather than recalled from
 * memory — see `lib/ai/registry.ts`'s header comment for how those
 * packages' factory functions were verified.
 */
export const MODEL_CATALOG: Record<
  Exclude<AiProviderId, "compatible">,
  ModelCatalogEntry[]
> = {
  anthropic: [
    {
      id: "claude-opus-4-5",
      label: "Claude Opus 4.5",
      recommendedForExtraction: true,
    },
    {
      id: "claude-sonnet-4-5",
      label: "Claude Sonnet 4.5",
      recommendedForExtraction: true,
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      recommendedForExtraction: false,
    },
  ],
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2", recommendedForExtraction: true },
    { id: "gpt-4.1", label: "GPT-4.1", recommendedForExtraction: true },
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      recommendedForExtraction: false,
    },
  ],
  google: [
    {
      id: "gemini-3-pro-preview",
      label: "Gemini 3 Pro",
      recommendedForExtraction: true,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      recommendedForExtraction: true,
    },
    {
      id: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash-Lite",
      recommendedForExtraction: false,
    },
  ],
  deepseek: [
    {
      id: "deepseek-chat",
      label: "DeepSeek Chat (V3)",
      recommendedForExtraction: true,
    },
    {
      // Reasoning models spend part of the output budget on hidden
      // thinking tokens, which makes them slower/pricier and less
      // predictable for strict structured-output extraction than the
      // plain chat model above.
      id: "deepseek-reasoner",
      label: "DeepSeek Reasoner (R1)",
      recommendedForExtraction: false,
    },
  ],
}

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  compatible: "OpenAI-compatible (custom endpoint)",
}

/**
 * Returns the model catalog for a provider, or `[]` for "compatible" —
 * that provider's models live on an arbitrary self/third-party-hosted
 * endpoint, so there's nothing to statically list; the UI falls back to a
 * free-text model id field for it instead.
 */
export function getModelCatalog(provider: AiProviderId): ModelCatalogEntry[] {
  if (provider === "compatible") return []
  return MODEL_CATALOG[provider]
}
