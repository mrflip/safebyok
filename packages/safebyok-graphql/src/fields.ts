import type { Lockbox, VaultProps, VaultScope } from 'safebyok'

/**
 * How one field crosses the wire: `plain`, as it is -- text, a number, or the vault props' prior
 * vaultKey and their list of wayins, each one opaque JSON -- or `ciphered`, a Ciphered sent as its
 * own two fields, `cipher_iv_b64` and `ciphertext_b64`.
 */
export type FieldKind = 'plain' | 'ciphered'

/** One field of a record: its name, the same in the record and the schema, and how it crosses. */
export type Field<FieldT extends string = string> = readonly [field: FieldT, kind: FieldKind]

/** The fields of `RecordT` that `FieldsT` does not carry. */
type Uncarried<RecordT, FieldsT extends readonly Field[]> = Exclude<keyof RecordT, FieldsT[number][0]>

/**
 * `fields` as they are, once the compiler has held them to `RecordT`: each a field of it, and
 * every field of it among them -- so a record's new field can never be dropped on its way across
 * the wire, nor a field asked for that the record has not got.
 */
function everyFieldOf<RecordT>() {
  return <FieldsT extends readonly Field<keyof RecordT & string>[]>(
    fields: FieldsT & ([Uncarried<RecordT, FieldsT>] extends [never] ? unknown : { uncarried: Uncarried<RecordT, FieldsT> }),
  ): FieldsT => fields
}

/** Every field of a VaultScope: the vault a verb is aimed at. */
export const ScopeFields = everyFieldOf<VaultScope>()([
  ['applabel',   'plain'],
  ['user_id',    'plain'],
  ['vaultlabel', 'plain'],
] as const)

/**
 * Every field of a VaultProps, as `SafebyokVaultProps` has them: the one place that names the
 * vault props' fields for the wire. The compiler holds it to their shape.
 */
export const VaultPropsFields = everyFieldOf<VaultProps>()([
  ['format',           'plain'],
  ['applabel',         'plain'],
  ['user_id',          'plain'],
  ['vaultlabel',       'plain'],
  ['vault_id',         'plain'],
  ['unlock_epoch',     'plain'],
  ['vault_key_epoch',  'plain'],
  ['prior_vault_key',  'plain'],
  ['wayins',           'plain'],
  ['registered_at',    'plain'],
] as const)

/**
 * Every field of a Lockbox, as `SafebyokLockbox` has them: the one place that names the
 * lockbox's fields for the wire. The compiler holds it to the lockbox's shape.
 */
export const LockboxFields = everyFieldOf<Lockbox>()([
  ['format',                 'plain'],
  ['boxlabel',               'plain'],
  ['revision_tok',           'plain'],
  ['vault_key_epoch',        'plain'],
  ['lockbox_key_wrapped',    'ciphered'],
  ['whisper_ciphered',       'ciphered'],
  ['whisper_codec',          'plain'],
  ['whisper_schema_version', 'plain'],
  ['sidecar_json',           'plain'],
  ['registered_at',          'plain'],
  ['written_at',             'plain'],
] as const)

/** A lockbox as a listing carries it, as `SafebyokListedLockbox` has it: every field but the two ciphered ones. */
export const ListedLockboxFields = LockboxFields.filter(([_field, kind]) => kind !== 'ciphered')

/** The two halves of a Ciphered, as `SafebyokCiphered` has them. */
const CipheredHalves = ['cipher_iv_b64', 'ciphertext_b64'] as const

/**
 * The fields as a GraphQL document asks for them, a ciphered one by its two halves.
 *
 * @example selectionOf([['boxlabel', 'plain'], ['whisper_ciphered', 'ciphered']])  // 'boxlabel whisper_ciphered { cipher_iv_b64 ciphertext_b64 }'
 */
export const selectionOf = (fields: readonly Field[]): string => fields.map(([field, kind]) => (
  kind === 'ciphered' ? `${field} { ${CipheredHalves.join(' ')} }` : field
)).join(' ')

/**
 * The record `sent` carries, field by field: each of `fields`, a null or missing one left out (the
 * prior vaultKey of vault props that hold none), and a ciphered one as its two halves -- so
 * whatever else rode along, a GraphQL client's `__typename` or a stray field, stays behind. Nothing is checked here: the
 * VaultDB on each side validates what it is handed. What is not an object comes back as it is,
 * for that validation to refuse.
 *
 * @example recordOf({ vault_id: 'v1', prior_vault_key: null, __typename: 'SafebyokVaultProps' }, [['vault_id', 'plain'], ['prior_vault_key', 'plain']])   // { vault_id: 'v1' }
 */
export const recordOf = (sent: unknown, fields: readonly Field[]): unknown => {
  if (! isBag(sent)) { return sent }
  return Object.fromEntries(fields.flatMap(([field, kind]) => {
    const val = sent[field]
    if (val === null || val === undefined) { return [] }
    return [[field, kind === 'ciphered' ? halvesOf(val) : val]]
  }))
}

/** A Ciphered's two halves, and nothing else; what is not an object, as it is. */
const halvesOf = (ciphered: unknown): unknown => {
  if (! isBag(ciphered)) { return ciphered }
  return Object.fromEntries(CipheredHalves.map((half) => [half, ciphered[half]]))
}

const isBag = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null && ! Array.isArray(val)
