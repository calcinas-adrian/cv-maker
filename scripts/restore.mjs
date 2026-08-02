/**
 * Manual recovery for soft-deleted rows.
 *
 * Nothing in the app hard-deletes user content: "Eliminar" stamps a
 * `deleted_at` and every read path filters on it (see `db/schema.ts` and
 * `features/cv/ownership.ts` / `features/career-bank/ownership.ts`). This
 * script is the other half of that decision — the out-of-band path that
 * clears the stamp when the owner asks for something back. There is
 * deliberately no trash UI and no automatic purge; recovery is a person
 * running this.
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
 * ever one of these literals, never argv. Same invariant for the join
 * identifiers below: every `column`/`parent` in an `ownerPath` is a literal
 * written in THIS file, never derived from user input.
 *
 * Two ways a table's owner is resolved for `--user`:
 *   - `owner`: the table has its OWN `user_id` column — filter directly.
 *   - `ownerPath`: the table has NO `user_id` of its own. An ordered list of
 *     hops (`{ column, parent }`) walked to build chained joins, each hop's
 *     `column` living on the PREVIOUS table in the chain (the base table for
 *     the first hop) and pointing at `parent.id`, terminating at a table
 *     that DOES have `user_id` (`bank`, for every `bank_*` satellite here;
 *     `ai_provider_key`, for `ai_provider_model`). `bank_material_variant`
 *     needs TWO hops (variant -> material -> bank) — a one-level
 *     `{ column, parent }` descriptor on its own cannot express that, hence
 *     an array rather than a single object.
 *   - Neither: no `--user` filtering is possible; `list --user` on that
 *     table is explicitly rejected (this only remains true for tables where
 *     no owner join exists AT ALL — every table below has at least one).
 */
const TABLES = {
  bank: { label: "Banco", title: "name", owner: "user_id", ownerPath: null },
  bank_engagement: {
    label: "Compromiso de banco",
    title: "role",
    owner: null,
    ownerPath: [{ column: "bank_id", parent: "bank" }],
  },
  bank_material: {
    label: "Material de banco",
    // Content lives on its variants, not on the material row itself.
    title: "id",
    owner: null,
    ownerPath: [{ column: "bank_id", parent: "bank" }],
  },
  bank_material_variant: {
    label: "Variante de material",
    title: "content",
    owner: null,
    ownerPath: [
      { column: "material_id", parent: "bank_material" },
      { column: "bank_id", parent: "bank" },
    ],
  },
  bank_education: {
    label: "Educación de banco",
    title: "institution",
    owner: null,
    ownerPath: [{ column: "bank_id", parent: "bank" }],
  },
  bank_credential: {
    label: "Credencial de banco",
    title: "name",
    owner: null,
    ownerPath: [{ column: "bank_id", parent: "bank" }],
  },
  bank_language: {
    label: "Idioma de banco",
    title: "name",
    owner: null,
    ownerPath: [{ column: "bank_id", parent: "bank" }],
  },
  bank_skill: {
    label: "Habilidad de banco",
    title: "name",
    owner: null,
    ownerPath: [{ column: "bank_id", parent: "bank" }],
  },
  cv: { label: "CV", title: "title", owner: "user_id", ownerPath: null },
  ai_provider_key: {
    label: "Clave de proveedor",
    title: "provider",
    owner: "user_id",
    ownerPath: null,
  },
  ai_provider_model: {
    label: "Modelo de proveedor",
    title: "model_id",
    // Reached through its credential — this table has no `user_id` of its
    // own (same satellite shape as `bank_engagement` etc.), so it gets the
    // same one-hop `ownerPath` treatment instead of the old hardcoded
    // rejection.
    owner: null,
    ownerPath: [{ column: "provider_key_id", parent: "ai_provider_key" }],
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

/**
 * Walks an `ownerPath` into a chained-join SQL fragment plus the alias whose
 * `user_id` column is the final filter target. Each parent table name is
 * used as its own alias — safe because every value here comes from the
 * hardcoded `TABLES`/`ownerPath` literals above, never from argv, and no
 * path in this file revisits the same table twice.
 */
function buildOwnerJoin(baseAlias, ownerPath) {
  const joins = []
  let currentAlias = baseAlias
  for (const hop of ownerPath) {
    joins.push(
      `join ${hop.parent} ${hop.parent} on ${currentAlias}.${hop.column} = ${hop.parent}.id`,
    )
    currentAlias = hop.parent
  }
  return { joinSql: joins.join("\n         "), ownerAlias: currentAlias }
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
  if (userId && !meta.owner && !meta.ownerPath) {
    usage(`${table} no tiene una forma de resolver su dueño; listá sin --user.`)
  }

  // `sql.query` sends the statement with real bind parameters ($1), so the
  // userId is never concatenated into SQL. Every table/column identifier
  // below comes from the TABLES allowlist above, never from argv.
  let rows
  if (userId && meta.owner) {
    rows = await sql.query(
      `select id, ${meta.title} as label, deleted_at
         from ${table}
        where deleted_at is not null and ${meta.owner} = $1
        order by deleted_at desc`,
      [userId],
    )
  } else if (userId && meta.ownerPath) {
    const { joinSql, ownerAlias } = buildOwnerJoin("t", meta.ownerPath)
    rows = await sql.query(
      `select t.id, t.${meta.title} as label, t.deleted_at
         from ${table} t
         ${joinSql}
        where t.deleted_at is not null and ${ownerAlias}.user_id = $1
        order by t.deleted_at desc`,
      [userId],
    )
  } else {
    rows = await sql.query(
      `select id, ${meta.title} as label, deleted_at
         from ${table}
        where deleted_at is not null
        order by deleted_at desc`,
    )
  }

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
  if (table === "bank") {
    // Inverted from `cv`'s hint on purpose: unlike `cv`'s children, every
    // `bank_*` satellite carries its OWN `deleted_at`, so a child soft-
    // deleted before its parent bank stays dead after this restore. Getting
    // this message wrong is exactly how an operator concludes recovery
    // worked when it silently did not.
    console.log(
      "A diferencia de un CV: sus compromisos, materiales, variantes,\n" +
        "educación, credenciales, idiomas y habilidades tienen su PROPIO\n" +
        "deleted_at. Si algo se borró ANTES que el banco, sigue borrado —\n" +
        "restaurá cada fila por separado (`list <tabla> --user <id>`).\n",
    )
  }
  if (table === "ai_provider_key") {
    console.log("Sus modelos vuelven con la clave: nunca se borraron.\n")
  }

  process.exit(0)
}

usage(`Comando desconocido: ${command}`)
