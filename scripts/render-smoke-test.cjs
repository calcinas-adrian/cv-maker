// Standalone smoke test for the Typst render pipeline — run OUTSIDE the
// Next.js request cycle to confirm classic.typ + typst-raster actually
// produce a correct PDF before wiring the route handler.
//
// Usage: node scripts/render-smoke-test.cjs
//
// Not part of the app's runtime — safe to delete once you trust the
// pipeline, or keep as a quick manual regression check after template edits.

const fs = require("fs")
const path = require("path")
const { Typst } = require("typst-raster")

const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "classic.typ")
const OUT_DIR = __dirname

// Realistic sample CvData, including Spanish accented text and one
// intentionally empty array section (projects) to verify clean omission.
const sampleCv = {
  fullName: "María José Fernández Núñez",
  email: "maria.fernandez@example.com",
  phone: "+54 9 11 5555-1234",
  location: "Buenos Aires, Argentina",
  summary:
    "Ingeniera de software con más de 8 años de experiencia diseñando " +
    "sistemas backend escalables. Apasionada por la arquitectura limpia, " +
    "el testing y la mentoría técnica. Cómoda liderando equipos pequeños " +
    "y trabajando codo a codo con producto.",
  experiences: [
    {
      id: "e1",
      company: "Tecnología Ñandú S.A.",
      role: "Ingeniera de Software Senior",
      startDate: "2021-03",
      endDate: "Presente",
      bullets: [
        "Diseñé e implementé una API de pagos que procesa más de 2M de transacciones diarias.",
        "Lideré la migración de un monolito a microservicios, reduciendo el tiempo de deploy en un 60%.",
        "Mentoreé a 4 desarrolladores junior en buenas prácticas de arquitectura y testing.",
      ],
    },
    {
      id: "e2",
      company: "Startup Innovación",
      role: "Desarrolladora Full Stack",
      startDate: "2018-01",
      endDate: "2021-02",
      bullets: [
        "Construí el frontend en React y el backend en Node.js desde cero.",
        "Implementé pipelines de CI/CD con GitHub Actions.",
      ],
    },
  ],
  // Intentionally empty — verifies the "Projects" section header, and any
  // divider, is omitted entirely rather than rendered with no content.
  projects: [],
  education: [
    {
      id: "ed1",
      institution: "Universidad de Buenos Aires (UBA)",
      degree: "Ingeniería en Informática",
      startDate: "2012",
      endDate: "2017",
    },
  ],
  skills: [
    { id: "s1", name: "TypeScript", category: "Lenguajes" },
    { id: "s2", name: "PostgreSQL", category: "Bases de datos" },
    { id: "s3", name: "Docker", category: null },
    { id: "s4", name: "Diseño de APIs", category: null },
  ],
  // `credentials`/`languages` — mirrors `features/render/typst-payload.ts`'s
  // `toTypstPayload` field set (career-bank-restructure Phase 9): the old
  // flat `achievements` shape (`title`/`date`) was replaced with the full
  // `kind`/`issuedAt`/`expiresAt`/`credentialId`/`credentialUrl` set, and a
  // sibling `languages` section was added.
  credentials: [
    {
      id: "a1",
      kind: "award",
      name: "Primer puesto — Hackathon interno de plataforma",
      issuer: "Tecnología Ñandú S.A.",
      issuedAt: "Mar 2023",
      expiresAt: null,
      credentialId: null,
      credentialUrl: null,
      description:
        "Prototipo de observabilidad adoptado luego por tres equipos.",
    },
    // Certification with credentialId/credentialUrl — exercises the gray
    // meta line's full "kind · id · url" join.
    {
      id: "a2",
      kind: "certification",
      name: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      issuedAt: "2022",
      expiresAt: "2025",
      credentialId: "ABC-123",
      credentialUrl: "https://example.com/verify/abc-123",
      description: null,
    },
    // No issuer/dates/description — verifies the header degrades cleanly to
    // just a name, with no stray separators.
    {
      id: "a3",
      kind: "award",
      name: "Ponente en NerdearLA",
      issuer: null,
      issuedAt: null,
      expiresAt: null,
      credentialId: null,
      credentialUrl: null,
      description: null,
    },
  ],
  languages: [
    { id: "l1", name: "Español", level: "Nativo" },
    { id: "l2", name: "Inglés", level: "Avanzado" },
  ],
  references: [
    {
      id: "r1",
      name: "Carla Giménez",
      role: "Directora de Ingeniería",
      company: "Tecnología Ñandú S.A.",
      email: "carla.gimenez@example.com",
      phone: "+54 9 11 4444-9876",
    },
    // Role but no company, and no phone — exercises both fallback branches
    // of `ref-affiliation` and the contact-line filter.
    {
      id: "r2",
      name: "Diego Álvarez",
      role: "Tech Lead",
      company: null,
      email: "diego.alvarez@example.com",
      phone: null,
    },
  ],
}

// Mirrors the serialization `features/render/actions.ts` performs: every
// optional field gets a concrete default so `JSON.stringify` never drops a
// key (it silently omits `undefined` values), which would break the
// template's `.at("key", default: ...)` lookups.
function toTypstPayload(cv) {
  return {
    fullName: cv.fullName ?? "",
    email: cv.email ?? "",
    phone: cv.phone ?? "",
    location: cv.location ?? "",
    summary: cv.summary ?? "",
    experiences: (cv.experiences ?? []).map((e) => ({
      company: e.company ?? "",
      role: e.role ?? "",
      startDate: e.startDate ?? "",
      endDate: e.endDate ?? "",
      bullets: e.bullets ?? [],
    })),
    projects: (cv.projects ?? []).map((p) => ({
      name: p.name ?? "",
      description: p.description ?? "",
      url: p.url ?? "",
      bullets: p.bullets ?? [],
    })),
    education: (cv.education ?? []).map((ed) => ({
      institution: ed.institution ?? "",
      degree: ed.degree ?? "",
      startDate: ed.startDate ?? "",
      endDate: ed.endDate ?? "",
    })),
    skills: (cv.skills ?? []).map((s) => ({
      name: s.name ?? "",
      category: s.category ?? "",
    })),
    credentials: (cv.credentials ?? []).map((c) => ({
      kind: c.kind ?? "",
      name: c.name ?? "",
      issuer: c.issuer ?? "",
      issuedAt: c.issuedAt ?? "",
      expiresAt: c.expiresAt ?? "",
      credentialId: c.credentialId ?? "",
      credentialUrl: c.credentialUrl ?? "",
      description: c.description ?? "",
    })),
    languages: (cv.languages ?? []).map((l) => ({
      name: l.name ?? "",
      level: l.level ?? "",
    })),
    references: (cv.references ?? []).map((r) => ({
      name: r.name ?? "",
      role: r.role ?? "",
      company: r.company ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
    })),
  }
}

async function main() {
  const templateSource = fs.readFileSync(TEMPLATE_PATH, "utf-8")
  const payload = toTypstPayload(sampleCv)
  const cvDataJson = JSON.stringify(payload)

  const renderer = new Typst({ cache: false })

  console.log("Rendering PDF...")
  const pdfBuffer = await renderer.render({
    code: templateSource,
    format: "pdf",
    variables: { cvData: cvDataJson },
  })
  const pdfPath = path.join(OUT_DIR, "smoke-test-output.pdf")
  fs.writeFileSync(pdfPath, pdfBuffer)
  console.log(`PDF written: ${pdfPath} (${pdfBuffer.length} bytes)`)

  console.log("Rendering PNG (for visual unicode/layout check)...")
  const pngBuffer = await renderer.render({
    code: templateSource,
    format: "png",
    ppi: 200,
    variables: { cvData: cvDataJson },
  })
  const pngPath = path.join(OUT_DIR, "smoke-test-output.png")
  fs.writeFileSync(pngPath, pngBuffer)
  console.log(`PNG written: ${pngPath} (${pngBuffer.length} bytes)`)

  console.log("OK")
}

main().catch((err) => {
  console.error("Smoke test FAILED")
  console.error(err)
  process.exit(1)
})
