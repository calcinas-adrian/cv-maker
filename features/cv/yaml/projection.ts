import { normalizeMaterial } from "@/lib/normalize-material"
import {
  cvDataSchema,
  experienceItemSchema,
  projectItemSchema,
  type CvBullet,
  type CvData,
} from "@/schemas/cv.schema"
import { z } from "zod"

/**
 * The YAML boundary for `CvData` (career-bank-restructure Decision 5).
 *
 * `cvDataSchema` itself is no longer the YAML contract: its `bullets` field
 * is `CvBullet[]` (`{ id, content, sourceMaterialId }`), and `id` (React
 * identity) / `sourceMaterialId` (bank provenance) neither belong in a
 * document a person hand-types nor survive a human rewording it. This
 * module is the ONLY place that translates between the two shapes.
 *
 * `toYamlView` projects a bullet down to its plain string content.
 * `fromYamlView` re-attaches identity/provenance by matching each YAML
 * bullet's NORMALIZED content back against `previous`'s bullets, scoped per
 * parent (experience/project) — never by array position. Positional
 * matching is explicitly rejected: inserting one line would silently
 * transplant provenance onto a different bullet, which is worse than
 * dropping it and is invisible to the user. Reordering, deleting, and
 * inserting bullets is therefore lossless; rewording one is honest — a
 * reworded line is no longer that material's claim, so it becomes a fresh,
 * unlinked bullet, mirroring the "new wording -> new variant" semantics
 * `promoteBulletToBank` already gives manual promotion.
 *
 * `normalizeMaterial` (`lib/normalize-material.ts`) is shared verbatim with
 * `features/cv-adapt/build-material-corpus.ts`'s dedup rule, so the YAML
 * "same claim" rule and the corpus "same claim" rule cannot drift apart.
 */
export const yamlCvSchema = cvDataSchema.extend({
  experiences: z
    .array(
      experienceItemSchema.extend({
        bullets: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
  projects: z
    .array(
      projectItemSchema.extend({
        bullets: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
})

export type YamlCvData = z.infer<typeof yamlCvSchema>

export function toYamlView(data: CvData): YamlCvData {
  return {
    ...data,
    experiences: data.experiences.map((experience) => ({
      ...experience,
      bullets: experience.bullets.map((bullet) => bullet.content),
    })),
    projects: data.projects.map((project) => ({
      ...project,
      bullets: project.bullets.map((bullet) => bullet.content),
    })),
  }
}

/**
 * Reconciles one parent's (an experience's or a project's) plain-string YAML
 * bullets against that SAME parent's previous `CvBullet[]`.
 *
 * Matching is by `normalizeMaterial(content)`, first-match-wins on both
 * sides: each previous bullet can donate its id/provenance to at most one
 * YAML bullet, so a duplicated line in the YAML doesn't silently clone one
 * bullet's provenance onto two rows (which would then collide as two
 * `cv_bullet` rows sharing one client-minted primary key).
 */
function reconcileBullets(
  bulletTexts: string[],
  previousBullets: CvBullet[],
): CvBullet[] {
  const byNormalizedContent = new Map<string, CvBullet>()
  for (const bullet of previousBullets) {
    const key = normalizeMaterial(bullet.content)
    if (!byNormalizedContent.has(key)) byNormalizedContent.set(key, bullet)
  }

  const consumed = new Set<string>()
  return bulletTexts.map((content) => {
    const key = normalizeMaterial(content)
    const match = consumed.has(key) ? undefined : byNormalizedContent.get(key)
    if (match) {
      consumed.add(key)
      return { id: match.id, content, sourceMaterialId: match.sourceMaterialId }
    }
    return { id: crypto.randomUUID(), content, sourceMaterialId: null }
  })
}

export function fromYamlView(view: YamlCvData, previous: CvData): CvData {
  const previousExperienceById = new Map(
    previous.experiences.map((experience) => [experience.id, experience]),
  )
  const previousProjectById = new Map(
    previous.projects.map((project) => [project.id, project]),
  )

  return {
    ...view,
    experiences: view.experiences.map((experience) => ({
      ...experience,
      bullets: reconcileBullets(
        experience.bullets,
        previousExperienceById.get(experience.id)?.bullets ?? [],
      ),
    })),
    projects: view.projects.map((project) => ({
      ...project,
      bullets: reconcileBullets(
        project.bullets,
        previousProjectById.get(project.id)?.bullets ?? [],
      ),
    })),
  }
}
