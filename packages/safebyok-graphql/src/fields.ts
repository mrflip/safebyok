import type { BoxRecord, VaultProps, VaultScope } from 'safebyok'

/** How one field crosses the wire: `plain`, as it is, or `ciphered`, a Ciphered sent as its own two fields.
 * A plain field is text, a number, or one of the vault props' two ways in, each one opaque JSON.
 */
export type FieldKind = 'plain' | 'ciphered'

/** One field of a record: its name, the same in the record and the schema, and how it crosses. */
export type Field<FieldT extends string = string> = readonly [field: FieldT, kind: FieldKind]

/** The fields of `RecordT` that `FieldsT` does not carry. */
type Uncarried<RecordT, FieldsT extends readonly Field[]> = Exclude<keyof RecordT, FieldsT[number][0]>

/** `fields` as given, once the compiler holds them to `RecordT`: every one a field of it, and every field of it among them.
 * A field added to the record then fails to compile until it is carried.
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

/** Every field of a VaultProps, as `SafebyokVaultProps` has them: the one place naming them for the wire. */
export const VaultPropsFields = everyFieldOf<VaultProps>()([
  ['format',           'plain'],
  ['applabel',         'plain'],
  ['user_id',          'plain'],
  ['vaultlabel',       'plain'],
  ['vault_id',         'plain'],
  ['unlock_epoch',     'plain'],
  ['vault_key_epoch',  'plain'],
  ['passphrase',       'plain'],
  ['passkey',          'plain'],
  ['registered_at',    'plain'],
] as const)

/** Every field of a BoxRecord, as `SafebyokBox` has them: the one place naming them for the wire. */
export const BoxFields = everyFieldOf<BoxRecord>()([
  ['format',                 'plain'],
  ['boxlabel',               'plain'],
  ['revision_tok',           'plain'],
  ['vault_key_epoch',        'plain'],
  ['box_key_wrapped',        'ciphered'],
  ['whisper_ciphered',       'ciphered'],
  ['whisper_codec',          'plain'],
  ['whisper_schema_version', 'plain'],
  ['sidecar_json',           'plain'],
  ['registered_at',          'plain'],
  ['written_at',             'plain'],
] as const)

/** A box as a listing carries it, as `SafebyokListedBox` has it: every field but the two ciphered ones. */
export const ListedBoxFields = BoxFields.filter(([_field, kind]) => kind !== 'ciphered')

/** The two halves of a Ciphered, as `SafebyokCiphered` has them. */
const CipheredHalves = ['cipher_iv_b64', 'ciphertext_b64'] as const

/** The fields as a GraphQL document asks for them, a ciphered one by its two halves.
 *
 * @example selectionOf([['boxlabel', 'plain'], ['whisper_ciphered', 'ciphered']])  // 'boxlabel whisper_ciphered { cipher_iv_b64 ciphertext_b64 }'
 */
export const selectionOf = (fields: readonly Field[]): string => fields.map(([field, kind]) => (
  kind === 'ciphered' ? `${field} { ${CipheredHalves.join(' ')} }` : field
)).join(' ')

/** The record `sent` carries, rebuilt from `fields` alone, so whatever else rode along stays behind: a `__typename`, a stray field.
 * A null field stays null, a missing one is left out, and a ciphered one keeps only its two
 * halves. Nothing is checked here: the VaultDB on each side validates what it is handed. What is
 * not an object comes back as it is, for that validation to refuse.
 *
 * @example recordOf({ vault_id: 'v1', passkey: null, __typename: 'SafebyokVaultProps' }, [['vault_id', 'plain'], ['passkey', 'plain']])   // { vault_id: 'v1', passkey: null }
 */
export const recordOf = (sent: unknown, fields: readonly Field[]): unknown => {
  if (! isBag(sent)) { return sent }
  return Object.fromEntries(fields.flatMap(([field, kind]) => {
    const val = sent[field]
    if (val === undefined) { return [] }
    return [[field, kind === 'ciphered' ? halvesOf(val) : val]]
  }))
}

/** A Ciphered's two halves, and nothing else; what is not an object, as it is. */
const halvesOf = (ciphered: unknown): unknown => {
  if (! isBag(ciphered)) { return ciphered }
  return Object.fromEntries(CipheredHalves.map((half) => [half, ciphered[half]]))
}

const isBag = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null && ! Array.isArray(val)
