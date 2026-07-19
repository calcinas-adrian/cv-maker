import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"
import type { AiProviderId } from "@/lib/ai/catalog"

/**
 * Provider factory exports below were verified by reading each installed
 * package's shipped `dist/index.d.ts` (not recalled from memory — package
 * APIs move fast between AI SDK major versions):
 *
 *   ai@7.0.16                        — `LanguageModel` is a union that
 *                                       includes `LanguageModelV4`, so a
 *                                       provider-call result is directly
 *                                       assignable to it.
 *   @ai-sdk/anthropic@4.0.8          — `createAnthropic(settings?) =>
 *                                       AnthropicProvider`; the provider
 *                                       instance is callable as
 *                                       `provider(modelId)`.
 *   @ai-sdk/openai@4.0.8             — `createOpenAI(settings?) =>
 *                                       OpenAIProvider`, same call shape.
 *                                       Its default call signature resolves
 *                                       against the Responses API model id
 *                                       union (not Chat Completions).
 *   @ai-sdk/google@4.0.8             — the factory is actually named
 *                                       `createGoogle`; `createGoogleGenerativeAI`
 *                                       is a re-exported alias for it
 *                                       (`createGoogle as createGoogleGenerativeAI`
 *                                       in the package's own `export {}`),
 *                                       so importing it under that name is
 *                                       correct and not a guess.
 *   @ai-sdk/deepseek@3.0.5           — `createDeepSeek(settings?) =>
 *                                       DeepSeekProvider`, same call shape.
 *   @ai-sdk/openai-compatible@3.0.5  — `createOpenAICompatible(settings) =>
 *                                       OpenAICompatibleProvider`; unlike
 *                                       the others, `settings` (specifically
 *                                       `baseURL` and `name`) is REQUIRED,
 *                                       not optional.
 */

export type ModelConfig = {
  provider: AiProviderId
  apiKey: string
  modelId: string
  /** Required for `provider: "compatible"`; ignored otherwise. */
  baseURL?: string
}

export function getModel({
  provider,
  apiKey,
  modelId,
  baseURL,
}: ModelConfig): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId)
    case "openai":
      return createOpenAI({ apiKey })(modelId)
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId)
    case "deepseek":
      return createDeepSeek({ apiKey })(modelId)
    case "compatible":
      if (!baseURL) {
        throw new Error("baseURL is required for the 'compatible' provider")
      }
      return createOpenAICompatible({ name: "custom", apiKey, baseURL })(
        modelId,
      )
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
