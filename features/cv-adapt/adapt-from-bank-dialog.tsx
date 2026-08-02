"use client"

import { AdaptDialogShell, type AdaptOrigin } from "./adapt-dialog-shell"
import { adaptBankForPosting, createCvFromBankAdaptation } from "./actions"

/**
 * Adapt a job posting straight from the BANK, with no source CV — the AI
 * half of `architecture/bank-produces-cv`.
 *
 * Deliberately a peer of `features/cv-from-bank`'s deterministic picker, not
 * a later stage of it: a user with a populated bank can go straight to a
 * posting-tailored CV without building a base CV first, and can equally
 * build the base CV without ever touching a provider. Two doors, both open.
 *
 * The corpus here has no cap-exempt block, which is why `capNote` says
 * something different from the CV origin's: when the cap bites, what
 * survives is decided entirely by the order of the bank itself.
 */
export function AdaptFromBankDialog({
  triggerVariant = "default",
}: {
  triggerVariant?: "default" | "outline"
}) {
  const origin: AdaptOrigin = {
    triggerLabel: "Adaptar a un aviso",
    triggerVariant,
    title: "Adaptar tu banco a un aviso de trabajo",
    description:
      "Pegá el aviso completo — la IA arma un CV nuevo eligiendo de tu banco lo que mejor responde a ese puesto. Lo revisás acá antes de crear nada.",
    materialLabel: "Todo tu banco de material de carrera",
    capNote:
      "Se alcanzó el límite de material; entró lo primero según el orden de tu banco.",
    run: (posting, providerModelId) =>
      adaptBankForPosting(posting, providerModelId).then((result) =>
        result.ok
          ? {
              ok: true as const,
              data: {
                adapted: result.data.adapted,
                corpus: result.data.corpus,
                education: result.data.bankEducation,
              },
            }
          : result,
      ),
    create: createCvFromBankAdaptation,
  }

  return <AdaptDialogShell origin={origin} />
}
