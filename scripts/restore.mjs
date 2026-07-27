/**
 * Manual recovery for soft-deleted rows.
 *
 * Nothing in the app hard-deletes user content: "Eliminar" stamps a
 * `deleted_at` and every read path filters on it (see `db/schema.ts` and
 * `features/cv/ownership.ts`). This script is the other half of that
 * decision — the out-of-band path that clears the stamp when the owner asks
 * for something back. There is deliberately no trash UI and no automatic
 * purge; recovery is a person running this.
 *
 * Usage:
 *   node --env-file=.env scripts/restore.mjs list cv
 *   node --env-file=.env scripts/restore.mjs list cv --user <userId>
 *   node --env-file=.env scripts/restore.mjs restore cv <id>
 *
 * Written as plain ESM rather than TypeScript on purpose: the repo has no
 * TS runner (no tsx/ts-node), and `db/index.ts` resolves the `@/` alias
 * through Next's tsconfig paths, which plain `node` does not honour. This
 * talks to Neon directly with the same driver the app uses.
 */

import { neon } from "@neondatabase/serverless"

/**
 * The only tables that carry `deleted_at`. Restricting to an allowlist keeps
 * the identifier out of reach of interpolation concerns — table names cannot
 * be parameterized in SQL, so the value put into the query string is only
 * ever one of these literals, never argv.
 */
const TABLES = {
  cv: { label: "CV", title: "title", owner: "user_id" },
  career_material: {
    label: "Material de carrera",
    title: "content",
    owner: "user_id",
  },
  ai_provider_key: {
    label: "Clave de proveedor",
    title: "provider",
    owner: "user_id",
  },
  ai_provider_model: {
    label: "Modelo de proveedor",
    title: "model_id",
    // Reached through its credential — this table has no `user_id`.
    owner: null,
  },
}

function usage(message) {
  if (message) console.error(`\n${message}`)
  console.error(`
Uso:
  node --env-file=.env scripts/restore.mjs list <tabla> [--user <userId>]
  node --env-file=.env scripts/restore.mjs restore <tabla> <id>

Tablas: ${Object.keys(TABLES).join(", ")}
`)
  process.exit(1)
}

const [command, table, ...rest] = process.argv.slice(2)

if (!command) usage()
if (!table || !(table in TABLES)) {
  usage(`Tabla desconocida: ${table ?? "(ninguna)"}`)
}

if (!process.env.DATABASE_URL) {
  console.error(
    "\nFalta DATABASE_URL. Corré con: node --env-file=.env scripts/restore.mjs ...",
  )
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)
const meta = TABLES[table]

if (command === "list") {
  const userFlagIndex = rest.indexOf("--user")
  const userId = userFlagIndex === -1 ? null : rest[userFlagIndex + 1]

  if (userFlagIndex !== -1 && !userId) usage("--user necesita un userId.")
  if (userId && !meta.owner) {
    usage(`${table} no tiene user_id propio; listá sin --user.`)
  }

  // `sql.query` sends the statement with real bind parameters ($1), so the
  // userId is never concatenated into SQL. The table/column names come from
  // the TABLES allowlist above, never from argv.
  const rows = userId
    ? await sql.query(
        `select id, ${meta.title} as label, deleted_at
           from ${table}
          where deleted_at is not null and ${meta.owner} = $1
          order by deleted_at desc`,
        [userId],
      )
    : await sql.query(
        `select id, ${meta.title} as label, deleted_at
           from ${table}
          where deleted_at is not null
          order by deleted_at desc`,
      )

  if (rows.length === 0) {
    console.log(`\nNo hay filas eliminadas en ${table}.\n`)
    process.exit(0)
  }

  console.log(`\n${meta.label} — ${rows.length} eliminada(s):\n`)
  for (const row of rows) {
    const label = String(row.label ?? "").slice(0, 60)
    console.log(`  ${row.id}  ${row.deleted_at.toISOString()}  ${label}`)
  }
  console.log()
  process.exit(0)
}

if (command === "restore") {
  const [id] = rest
  if (!id) usage("Falta el id a restaurar.")

  const rows = await sql.query(
    `update ${table}
        set deleted_at = null
      where id = $1 and deleted_at is not null
      returning id, ${meta.title} as label`,
    [id],
  )

  if (rows.length === 0) {
    // Two causes, and the distinction matters to whoever is running this:
    // a typo'd id, or a row that was never deleted in the first place.
    console.error(
      `\nNo se restauró nada: ${id} no existe en ${table} o no estaba eliminado.\n`,
    )
    process.exit(1)
  }

  console.log(`\nRestaurado en ${table}: ${rows[0].id} — ${rows[0].label}\n`)

  if (table === "cv") {
    console.log(
      "Sus secciones, versiones y adaptaciones vuelven con él: nunca se borraron.\n",
    )
  }
  if (table === "ai_provider_key") {
    console.log("Sus modelos vuelven con la clave: nunca se borraron.\n")
  }

  process.exit(0)
}

usage(`Comando desconocido: ${command}`)
