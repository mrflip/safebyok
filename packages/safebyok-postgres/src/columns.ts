import type { BoxRecord, Tombstone, VaultProps } from 'safebyok'

/** How one field is stored: `text` as given, `bigint` for a whole number, `jsonb` for an opaque structured value.
 * jsonb reorders keys, which is harmless for a Ciphered, a way in or a box's sidecar: safebyok
 * rebuilds their ctx from field values, a sidecar as its JSON with keys sorted. A null jsonb value
 * goes as a SQL null, and comes back as one: a vault with no passkey.
 */
export type ColumnKind = 'text' | 'bigint' | 'jsonb'

/** One stored field: its name, the same in the record and the table, and how it is stored. */
export type Column<FieldT extends string = string> = readonly [field: FieldT, kind: ColumnKind]

/** The fields of `RecordT` that `ColumnsT` does not store. */
type Unstored<RecordT, ColumnsT extends readonly Column[]> = Exclude<keyof RecordT, ColumnsT[number][0]>

/** `columns` as given, once the compiler holds them to `RecordT`: every column a field, every field a column.
 * A field added to the record then fails to compile until it has a column.
 */
function everyFieldOf<RecordT>() {
  return <ColumnsT extends readonly Column<keyof RecordT & string>[]>(
    columns: ColumnsT & ([Unstored<RecordT, ColumnsT>] extends [never] ? unknown : { unstored: Unstored<RecordT, ColumnsT> }),
  ): ColumnsT => columns
}

/** Every field of a VaultProps, in `safebyok_vaults`'s order: the one place, beside vault-tables.sql, naming its columns. */
export const VaultPropsColumns = everyFieldOf<VaultProps>()([
  ['applabel',         'text'],
  ['user_id',          'text'],
  ['vaultlabel',       'text'],
  ['vault_tok',        'text'],
  ['format',           'text'],
  ['vault_epoch',      'bigint'],
  ['gate_epoch',       'bigint'],
  ['passphrase',       'jsonb'],
  ['passkey',          'jsonb'],
  ['registered_at',    'bigint'],
] as const)

/** Every field of a Tombstone, in `safebyok_vault_tombstones`'s order. */
export const TombstoneColumns = everyFieldOf<Tombstone>()([
  ['applabel',         'text'],
  ['user_id',          'text'],
  ['vaultlabel',       'text'],
  ['format',           'text'],
  ['vault_epoch',      'bigint'],
] as const)

/** Every field of a BoxRecord, in `safebyok_boxes`'s order after the scope and `vault_tok`, which the adapter adds. */
export const BoxColumns = everyFieldOf<BoxRecord>()([
  ['format',                 'text'],
  ['boxlabel',               'text'],
  ['revision_tok',           'text'],
  ['box_key_wrapped',        'jsonb'],
  ['whisper_ciphered',       'jsonb'],
  ['whisper_codec',          'text'],
  ['whisper_schema_version', 'bigint'],
  ['sidecar',                'jsonb'],
  ['registered_at',          'bigint'],
  ['written_at',             'bigint'],
] as const)

/** A box as a listing reads it: every column but the two ciphered ones. */
export const ListedBoxColumns = BoxColumns.filter(([field]) => field !== 'box_key_wrapped' && field !== 'whisper_ciphered')


/** The columns' names, as an INSERT or an UPDATE lists them.
 *
 * @example names([['vault_tok', 'text'], ['registered_at', 'bigint']])  // 'vault_tok, registered_at'
 */
export const names = (columns: readonly Column[]): string => columns.map(([field]) => field).join(', ')

/** Numbered parameters for the columns from `$first`, each cast to its column's type.
 *
 * @param instead - SQL to put in place of a field's parameter, by field: for a value the statement decides, not the client.
 *
 * @example placeholders([['vault_tok', 'text'], ['registered_at', 'bigint']], 4)  // '$4::text, $5::bigint'
 * @example placeholders([['vault_tok', 'text'], ['vault_epoch', 'bigint']], 4, { vault_epoch: 'vault_epoch + 1' })  // '$4::text, vault_epoch + 1'
 */
export const placeholders = (columns: readonly Column[], first: number, instead: Readonly<Record<string, string>> = {}): string => (
  columns.map(([field, kind], ii) => instead[field] ?? `$${String(first + ii)}::${kind}`).join(', ')
)

/** The one parameter of `placeholders(columns, first)` that holds `field`.
 *
 * @example placeholderOf([['format', 'text'], ['vault_tok', 'text']], 'vault_tok', 4)  // '$5::text'
 */
export const placeholderOf = (columns: readonly Column[], field: string, first: number): string => {
  const idx = columns.findIndex(([named]) => named === field)
  // Called only as the module's SQL is built, from its own column lists: a miss is this package's
  // bug, met at import by every test, never a host's mistake to branch on, so it has no kind.
  if (idx === -1) { throw new Error(`No column holds ${field}`) }
  return `$${String(first + idx)}::${columns[idx]![1]}`
}

/** The columns as a SELECT or RETURNING reads them, in forms every driver hands back alike.
 * A bigint comes back as a double, exact up to 2^53, where some drivers hand back text. A jsonb
 * comes back as its text, which {@link recordOf} parses.
 *
 * @example selected([['vault_tok', 'text'], ['registered_at', 'bigint']])  // 'vault_tok, registered_at::float8 AS registered_at'
 */
export const selected = (columns: readonly Column[]): string => columns.map(([field, kind]) => {
  if (kind === 'bigint') { return `${field}::float8 AS ${field}` }
  if (kind === 'jsonb') { return `${field}::text AS ${field}` }
  return field
}).join(', ')

/** The columns as a subquery hands them to `json_agg`, in forms every driver hands back alike once the JSON is text.
 * A bigint stays a bigint, which JSON carries as an exact whole number. A jsonb goes as its text,
 * which {@link recordOf} parses, as for {@link selected}.
 *
 * @example jsonSelected([['vault_tok', 'text'], ['sidecar', 'jsonb']])  // 'vault_tok, sidecar::text AS sidecar'
 */
export const jsonSelected = (columns: readonly Column[]): string => columns.map(([field, kind]) => (
  kind === 'jsonb' ? `${field}::text AS ${field}` : field
)).join(', ')

/** The record's values for its columns, in the order {@link placeholders} numbers them.
 * A jsonb value goes as its JSON text, and a null or missing field as null.
 *
 * @example paramsOf({ vault_tok: 'v1', passkey: null }, [['vault_tok', 'text'], ['passkey', 'jsonb']])  // ['v1', null]
 */
export const paramsOf = (record: object, columns: readonly Column[]): unknown[] => (
  columns.map(([field, kind]) => {
    const val: unknown = (record as Record<string, unknown>)[field]
    if (val === undefined || val === null) { return null }
    return kind === 'jsonb' ? JSON.stringify(val) : val
  })
)

/** A row read through {@link selected}, as the record it stores, unchecked: the VaultDB validates what it reads.
 * A null column is a null field (`passkey`, for a vault without one), and a column the row lacks
 * is a field left out. A row that is not an object comes back as it is, for that validation to refuse.
 *
 * @example recordOf({ vault_tok: 'v1', passkey: null }, [['vault_tok', 'text'], ['passkey', 'jsonb']])  // { vault_tok: 'v1', passkey: null }
 */
export const recordOf = (row: unknown, columns: readonly Column[]): unknown => {
  if (typeof row !== 'object' || row === null) { return row }
  const cells = row as Record<string, unknown>
  return Object.fromEntries(columns.flatMap(([field, kind]) => {
    const cell = cells[field]
    if (cell === undefined) { return [] }
    return [[field, kind === 'jsonb' && typeof cell === 'string' ? JSON.parse(cell) as unknown : cell]]
  }))
}
