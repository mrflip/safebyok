import type { Lockbox, VaultBundle } from 'safebyok'

/**
 * How one field is stored: `text` as given, `bigint` for a whole number (a time, an epoch), and
 * `jsonb` for an opaque structured value -- a Ciphered, a bundle's prior vaultKey, or its list of
 * wayins -- whose ctx safebyok rebuilds from field values, so jsonb's reordering of
 * keys is harmless. A lockbox's `public_json` is `text`: its exact text is what is bound.
 */
export type ColumnKind = 'text' | 'bigint' | 'jsonb'

/** One stored field: its name, the same in the record and the table, and how it is stored. */
export type Column<FieldT extends string = string> = readonly [field: FieldT, kind: ColumnKind]

/** The fields of `RecordT` that `ColumnsT` does not store. */
type Unstored<RecordT, ColumnsT extends readonly Column[]> = Exclude<keyof RecordT, ColumnsT[number][0]>

/**
 * `columns` as they are, once the compiler has held them to `RecordT`: each a field of it, and
 * every field of it among them -- so a record's new field can never be dropped on its way into
 * storage, nor a column name a field the record has not got.
 */
function everyFieldOf<RecordT>() {
  return <ColumnsT extends readonly Column<keyof RecordT & string>[]>(
    columns: ColumnsT & ([Unstored<RecordT, ColumnsT>] extends [never] ? unknown : { unstored: Unstored<RecordT, ColumnsT> }),
  ): ColumnsT => columns
}

/**
 * Every field of a VaultBundle, in `safebyok_bundles`'s order: the one place, beside
 * vault-tables.sql, that names the bundle's columns. The compiler holds it to the bundle's shape.
 */
export const BundleColumns = everyFieldOf<VaultBundle>()([
  ['applabel',         'text'],
  ['user_id',          'text'],
  ['vaultlabel',       'text'],
  ['format',           'text'],
  ['vault_id',         'text'],
  ['unlock_epoch',     'bigint'],
  ['vault_key_epoch',  'bigint'],
  ['prior_vault_key',  'jsonb'],
  ['wayins',           'jsonb'],
  ['registered_at',    'bigint'],
] as const)

/**
 * Every field of a Lockbox, in `safebyok_lockboxes`'s order after the four columns the adapter
 * adds (the vault's scope and `vault_id`, never part of the record). The compiler holds it to the
 * lockbox's shape.
 */
export const LockboxColumns = everyFieldOf<Lockbox>()([
  ['format',                 'text'],
  ['boxlabel',               'text'],
  ['revision_id',            'text'],
  ['vault_key_epoch',        'bigint'],
  ['lockbox_key_wrapped',    'jsonb'],
  ['whisper_ciphered',       'jsonb'],
  ['whisper_codec',          'text'],
  ['whisper_schema_version', 'bigint'],
  ['public_json',            'text'],
  ['registered_at',          'bigint'],
  ['written_at',             'bigint'],
] as const)

/** A lockbox as a listing reads it: every column but the two ciphered ones. */
export const ListedLockboxColumns = LockboxColumns.filter(([field]) => field !== 'lockbox_key_wrapped' && field !== 'whisper_ciphered')


/**
 * The columns' names, as an INSERT or an UPDATE lists them.
 *
 * @example names([['vault_id', 'text'], ['registered_at', 'bigint']])  // 'vault_id, registered_at'
 */
export const names = (columns: readonly Column[]): string => columns.map(([field]) => field).join(', ')

/**
 * Numbered parameters for the columns, from `$first`, each cast to its column's type: a driver
 * then sends every value as text, and Postgres reads it as the column does.
 *
 * @example placeholders([['vault_id', 'text'], ['registered_at', 'bigint']], 4)  // '$4::text, $5::bigint'
 */
export const placeholders = (columns: readonly Column[], first: number): string => (
  columns.map(([_field, kind], ii) => `$${String(first + ii)}::${kind}`).join(', ')
)

/**
 * The one parameter of `placeholders(columns, first)` that holds `field`.
 *
 * @example placeholderOf([['format', 'text'], ['vault_id', 'text']], 'vault_id', 4)  // '$5::text'
 */
export const placeholderOf = (columns: readonly Column[], field: string, first: number): string => {
  const idx = columns.findIndex(([named]) => named === field)
  // Called only as the module's SQL is built, from its own column lists: a miss is this package's
  // bug, met at import by every test, never a host's mistake to branch on, so it has no kind.
  if (idx === -1) { throw new Error(`No column holds ${field}`) }
  return `$${String(first + idx)}::${columns[idx]![1]}`
}

/**
 * The columns as a SELECT or RETURNING reads them, in forms every driver hands back alike: a
 * bigint as a double (a whole number up to 2^53, exactly, where a driver would hand a bigint
 * back as text), and a jsonb as its text, which {@link recordOf} parses.
 *
 * @example selected([['vault_id', 'text'], ['registered_at', 'bigint']])  // 'vault_id, registered_at::float8 AS registered_at'
 */
export const selected = (columns: readonly Column[]): string => columns.map(([field, kind]) => {
  if (kind === 'bigint') { return `${field}::float8 AS ${field}` }
  if (kind === 'jsonb') { return `${field}::text AS ${field}` }
  return field
}).join(', ')

/**
 * The record's values for its columns, in their order, as {@link placeholders} numbers them: a
 * jsonb value as its JSON text, and a field the record leaves out (a bundle with no prior vaultKey)
 * as null.
 *
 * @example paramsOf({ vault_id: 'v1', prior_vault_key: undefined }, [['vault_id', 'text'], ['prior_vault_key', 'jsonb']])  // ['v1', null]
 */
export const paramsOf = (record: object, columns: readonly Column[]): unknown[] => (
  columns.map(([field, kind]) => {
    const val: unknown = (record as Record<string, unknown>)[field]
    if (val === undefined || val === null) { return null }
    return kind === 'jsonb' ? JSON.stringify(val) : val
  })
)

/**
 * A row read through {@link selected}, as the record it stores: a null column as a field left
 * out, and a jsonb column's text parsed. Nothing is checked here: the VaultDB validates what it
 * reads. A row that is not an object comes back as it is, for that validation to refuse.
 *
 * @example recordOf({ vault_id: 'v1', prior_vault_key: null }, [['vault_id', 'text'], ['prior_vault_key', 'jsonb']])  // { vault_id: 'v1' }
 */
export const recordOf = (row: unknown, columns: readonly Column[]): unknown => {
  if (typeof row !== 'object' || row === null) { return row }
  const cells = row as Record<string, unknown>
  return Object.fromEntries(columns.flatMap(([field, kind]) => {
    const cell = cells[field]
    if (cell === null || cell === undefined) { return [] }
    return [[field, kind === 'jsonb' && typeof cell === 'string' ? JSON.parse(cell) as unknown : cell]]
  }))
}
