/** The validators a host or a storage adapter calls or composes, under the name its module gives each: the main entry exports them as the `Validators` namespace.
 * They are what is stored or crosses the `VaultDB` and `DeviceDB` seams, the scopes and
 * scopepaths, each token and ciphered field, the options and objects a host passes, and what its
 * callbacks return. Each but the three primitives is made in a `Validator` call: its `parse`
 * throws a VaultError of its call's kind, naming each failing field and quoting no input, and
 * `safeParse` is Zod's own. `label`, `user_id` and `EpochMillis` are plain Zod, the names every
 * scope and time is made of. Every validator the main entry exports by name (`VaultRecord`,
 * `BoxRecord`, `Whisper`, `Sidecar`, ...) is here too, the same object.
 *
 * @example Validators.vaultScope.parse({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
 * @example Validators.vault_tok.safeParse('').success   // false: a vault_tok is non-empty text
 */

export { EpochMillis, label, user_id } from './checks/primitives'
export { bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath, VaultScope, vaultBag, bankBag } from './shapes/scopes'
export { keyDeriverSpec } from './checks/key-deriver-spec-checks'
export { vault_tok, revision_tok, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped, Ciphered } from './shapes/fields'
export { Whisper, Sidecar, BoxRecord, BoxSparse, BoxDamaged, BoxStamp } from './shapes/box'
export { Capacity, VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion } from './shapes/vault-db'
export { LeaseRecord, DeviceRecord, LeaseStamp } from './shapes/device'
export { PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GateRecord, VaultRecord, VaultSparse, VaultStamp, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse, VaultDraft, passkeyAnswerShape } from './shapes/vault'
export { makeBankOpts, bankVaultOpts, vaultDBShape, deviceDBShape, clockShape, clockReading, keyDeriverShape } from './shapes/bank-opts'
export { strengthChecker, passphraseVerdict } from './passphrase-strength'
export { loggerShape } from './logger'
export { localVaultDBOptsShape } from './local-vault-db'
export { maskOpts } from './mask'
export { idbOpts } from './idb-opts'
