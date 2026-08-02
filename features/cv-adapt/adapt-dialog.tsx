"use client"

import { AdaptDialogShell, type AdaptOrigin } from "./adapt-dialog-shell"
import { adaptCvForPosting, createCvFromAdaptation } from "./actions"

/**
 * Adapt an EXISTING CV to a job posting. Launched from the CV editor, where
 * the CV in question is the one on screen.
 *
 * The whole flow — paste, pre-flight, review, create — lives in
 * `AdaptDialogShell`, shared with `AdaptFromBankDialog`. This file is only
 * the origin: which two server actions run, and the copy that tells the user
 * what the model will read. Here the corpus is this CV's own content
 * (complete and cap-exempt) plus the bank on top; see `buildMaterialCorpus`.
 */
export function AdaptCvDialog({ cvId }: { cvId: string }) {
  const origin: AdaptOrigin = {
    triggerLabel: "Adaptar a un aviso",
    triggerVariant: "outline",
    title: "Adaptar CV a un aviso de trabajo",
    description:
      "Pegá el aviso completo — la IA arma un CV adaptado a partir de este CV y de tu banco, que revisás acá antes de crear nada.",
    materialLabel: "Este CV completo, más tu banco de material de carrera",
    capNote:
      "Se alcanzó el límite de material; el CV de origen siempre se incluye completo.",
    run: (posting, providerModelId) =>
      adaptCvForPosting(cvId, posting, providerModelId).then((result) =>
        result.ok
          ? {
              ok: true as const,
              data: {
                adapted: result.data.adapted,
                corpus: result.data.corpus,
                education: result.data.sourceEducation,
              },
            }
          : result,
      ),
    create: (payload) =>
      createCvFromAdaptation({ sourceCvId: cvId, ...payload }),
  }

  return <AdaptDialogShell origin={origin} />
}
