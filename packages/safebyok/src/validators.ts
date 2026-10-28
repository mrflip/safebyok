/** The validators a host or a storage adapter calls or composes, each under its module's name: the main entry exports them as the `Validators` namespace.
 * They check what is stored or crosses the `VaultDB` and `DeviceDB` seams, the scopes and
 * scopepaths, each token and ciphered field, the options a host passes, and what its callbacks
 * return. Each is made in a `Validator` call, so its `parse` throws a VaultError of its call's
 * kind, but for `label`, `user_id` and `EpochMillis`, which are plain Zod. Every validator the main
 * entry exports by name (`VaultRecord`, `Whisper`, `Sidecar`, ...) is here too, the same object.
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
