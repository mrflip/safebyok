import type { BoxRecord, VaultRecord, VaultScope, VaultTombstone } from 'safebyok'

/** How one field crosses the wire: `plain`, as it is; `ciphered`, a Ciphered sent as its own two fields; or `gate`, a vault record's gate sent as its two ways in.
 * A plain field is text, a number, or a way in, opaque JSON. A gate may be null, for a novel vault.
 */
export type FieldKind = 'plain' | 'ciphered' | 'gate'

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

/** Every field of a VaultRecord, as `SafebyokVaultRecord` has them: the one place naming them for the wire. */
export const VaultRecordFields = everyFieldOf<VaultRecord>()([
  ['format',           'plain'],
  ['applabel',         'plain'],
  ['user_id',          'plain'],
  ['vaultlabel',       'plain'],
  ['vault_tok',        'plain'],
  ['registered_at',    'plain'],
  ['vault_epoch',      'plain'],
  ['gate_epoch',       'plain'],
  ['gate',             'gate'],
] as const)

/** Every field of a VaultTombstone, as `SafebyokVaultTombstone` has them: what a deleted vault leaves. */
export const VaultTombstoneFields = everyFieldOf<VaultTombstone>()([
  ['format',           'plain'],
  ['applabel',         'plain'],
  ['user_id',          'plain'],
  ['vaultlabel',       'plain'],
  ['vault_epoch',      'plain'],
] as const)

/** Every field of a BoxRecord, as `SafebyokBox` has them: the one place naming them for the wire. */
export const BoxFields = everyFieldOf<BoxRecord>()([
  ['format',                 'plain'],
  ['boxlabel',               'plain'],
  ['revision_tok',           'plain'],
  ['box_key_wrapped',        'ciphered'],
  ['whisper_ciphered',       'ciphered'],
  ['whisper_codec',          'plain'],
  ['whisper_schema_version', 'plain'],
  ['sidecar',                'plain'],
  ['registered_at',          'plain'],
  ['written_at',             'plain'],
] as const)

/** A box as a listing carries it, as `SafebyokListedBox` has it: every field but the two ciphered ones. */
export const ListedBoxFields = BoxFields.filter(([_field, kind]) => kind !== 'ciphered')

/** The parts each kind of field crosses as, by name: a Ciphered's two halves, as `SafebyokCiphered` has them, and a gate's two ways in, as `SafebyokGate` has them; none for a plain field. */
const PartsOfKind = {
  plain:    [],
  ciphered: ['cipher_iv_b64', 'ciphertext_b64'],
  gate:     ['passphrase', 'passkey'],
} as const satisfies Readonly<Record<FieldKind, readonly string[]>>

/** The fields as a GraphQL document asks for them, a ciphered one by its two halves and a gate by its two ways in.
 *
 * @example selectionOf([['boxlabel', 'plain'], ['whisper_ciphered', 'ciphered']])  // 'boxlabel whisper_ciphered { cipher_iv_b64 ciphertext_b64 }'
 * @example selectionOf([['gate', 'gate']])                                          // 'gate { passphrase passkey }'
 */
export const selectionOf = (fields: readonly Field[]): string => fields.map(([field, kind]) => (
  kind === 'plain' ? field : `${field} { ${PartsOfKind[kind].join(' ')} }`
)).join(' ')

/** The record `sent` carries, rebuilt from `fields` alone, so whatever else rode along stays behind: a `__typename`, a stray field.
 * A null field stays null, a missing one is left out, a ciphered one keeps only its two halves,
 * and a gate only its two ways in. Nothing is checked here: the VaultDB on each side validates
 * what it is handed. What is not an object comes back as it is, for that validation to refuse.
 *
 * @example recordOf({ vault_tok: 'v1', passkey: null, __typename: 'SafebyokVaultRecord' }, [['vault_tok', 'plain'], ['passkey', 'plain']])  // { vault_tok: 'v1', passkey: null }
 */
export const recordOf = (sent: unknown, fields: readonly Field[]): unknown => {
  if (! isBag(sent)) { return sent }
  return Object.fromEntries(fields.flatMap(([field, kind]) => {
    const val = sent[field]
    if (val === undefined) { return [] }
    return [[field, kind === 'plain' ? val : partsOf(val, PartsOfKind[kind])]]
  }))
}

/** A Ciphered's two halves or a gate's two ways in, and nothing else; what is not an object (a novel vault's null gate), as it is. */
const partsOf = (nested: unknown, parts: readonly string[]): unknown => {
  if (! isBag(nested)) { return nested }
  return Object.fromEntries(parts.map((part) => [part, nested[part]]))
}

const isBag = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null && ! Array.isArray(val)
