import type { CvData } from "@/schemas/cv.schema"
import { TranslationError } from "./errors"

/**
 * Every place a distinct piece of translatable text can live. Deliberately
 * a closed union: fields absent here (contact, company, dates, url,
 * skill.name, education, achievements, references) are structurally
 * unreachable by `applyCvSegments` — a guarantee, not a prompt instruction
 * (adapt's D11/D14 discipline).
 */
export type SegmentPath =
  | { kind: "title" }
  | { kind: "summary" }
  | { kind: "experience.role"; index: number }
  | { kind: "experience.bullet"; index: number; bulletIndex: number }
  | { kind: "project.name"; index: number }
  | { kind: "project.description"; index: number }
  | { kind: "project.bullet"; index: number; bulletIndex: number }
  | { kind: "skill.category"; index: number }

/** One distinct string, plus EVERY place it must be written back to. */
export type TranslatableSegment = { text: string; targets: SegmentPath[] }

/**
 * Collects every in-scope, non-empty string out of `title` + `cv` into a
 * deduplicated, ordered list. Identical strings collapse into ONE segment
 * carrying several targets — this is what makes a skill `category` repeated
 * across ten skills cost one translation slot and come back identical
 * everywhere it appears.
 *
 * Empty/whitespace-only values are excluded here — never sent to a
 * provider, never overwritten on the way back.
 */
export function collectCvSegments(
  title: string,
  cv: CvData,
): TranslatableSegment[] {
  const byText = new Map<string, SegmentPath[]>()

  function add(path: SegmentPath, value: string | null | undefined) {
    if (!value) return
    const text = value.trim()
    if (!text) return
    const existing = byText.get(text)
    if (existing) {
      existing.push(path)
    } else {
      byText.set(text, [path])
    }
  }

  add({ kind: "title" }, title)
  add({ kind: "summary" }, cv.summary)

  cv.experiences.forEach((experience, index) => {
    add({ kind: "experience.role", index }, experience.role)
    ;(experience.bullets ?? []).forEach((bullet, bulletIndex) => {
      add({ kind: "experience.bullet", index, bulletIndex }, bullet)
    })
  })

  cv.projects.forEach((project, index) => {
    add({ kind: "project.name", index }, project.name)
    add({ kind: "project.description", index }, project.description)
    ;(project.bullets ?? []).forEach((bullet, bulletIndex) => {
      add({ kind: "project.bullet", index, bulletIndex }, bullet)
    })
  })

  cv.skills.forEach((skill, index) => {
    add({ kind: "skill.category", index }, skill.category)
  })

  return Array.from(byText.entries()).map(([text, targets]) => ({
    text,
    targets,
  }))
}

/**
 * Throws `TranslationError("invalid_result")` if
 * `translated.length !== segments.length`. Never mutates `cv`. Writes
 * PURELY by path — it never re-walks the CV to infer order, so extraction
 * and reassembly cannot drift relative to each other.
 */
export function applyCvSegments(
  title: string,
  cv: CvData,
  segments: TranslatableSegment[],
  translated: readonly string[],
): { title: string; data: CvData } {
  if (translated.length !== segments.length) {
    throw new TranslationError(
      "invalid_result",
      "La traducción no devolvió la cantidad esperada de textos.",
    )
  }

  let newTitle = title
  let newSummary = cv.summary
  const experiences = cv.experiences.map((experience) => ({
    ...experience,
    bullets: experience.bullets ? [...experience.bullets] : experience.bullets,
  }))
  const projects = cv.projects.map((project) => ({
    ...project,
    bullets: project.bullets ? [...project.bullets] : project.bullets,
  }))
  const skills = cv.skills.map((skill) => ({ ...skill }))

  segments.forEach((segment, i) => {
    const text = translated[i]

    for (const target of segment.targets) {
      switch (target.kind) {
        case "title":
          newTitle = text
          break
        case "summary":
          newSummary = text
          break
        case "experience.role": {
          const item = experiences[target.index]
          if (item) item.role = text
          break
        }
        case "experience.bullet": {
          const item = experiences[target.index]
          if (item?.bullets && target.bulletIndex in item.bullets) {
            item.bullets[target.bulletIndex] = text
          }
          break
        }
        case "project.name": {
          const item = projects[target.index]
          if (item) item.name = text
          break
        }
        case "project.description": {
          const item = projects[target.index]
          if (item) item.description = text
          break
        }
        case "project.bullet": {
          const item = projects[target.index]
          if (item?.bullets && target.bulletIndex in item.bullets) {
            item.bullets[target.bulletIndex] = text
          }
          break
        }
        case "skill.category": {
          const item = skills[target.index]
          if (item) item.category = text
          break
        }
      }
    }
  })

  return {
    title: newTitle,
    data: {
      ...cv,
      summary: newSummary,
      experiences,
      projects,
      skills,
    },
  }
}
