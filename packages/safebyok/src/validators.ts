/** Every validator safebyok makes, under the name its module gives it: the main entry exports them as the `Validators` namespace.
 * Each but the three primitives is made in a `Validator` call: its `parse` throws a VaultError of
 * its call's kind, naming each failing field and quoting no input, and `safeParse` is Zod's own.
 * `label`, `user_id` and `EpochMillis` are plain Zod, the names every scope and time is made of.
 * The validators a host meets most (`VaultRecord`, `BoxRecord`, `Whisper`, `Sidecar`, ...) are
 * also exported by name, each beside its type.
 *
 * @example Validators.vaultScope.parse({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
 * @example Validators.vault_tok.safeParse('').success   // false: a vault_tok is non-empty text
 */

export { EpochMillis, label, user_id } from './checks/primitives'
export { bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath } from './checks/core-checks'
export { keyDeriverSpec } from './checks/key-deriver-spec-checks'
export { vault_tok, revision_tok, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped, passphraseCleartext } from './types/type-aliases'
export { Whisper, whisperBag, Sidecar, Capacity, LeaseRecord, DeviceRecord, VaultScope } from './types/types'
export { PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GateRecord, VaultRecord, VaultSparse, VaultStamp, VaultStampPicked, VaultStampButFormat, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse, VaultDraft } from './vault-record'
export { BoxRecord, BoxSparse, BoxDamaged, BoxStamp, sealBoxlabel, BaseShape, MadeUnderShape, MadeShape } from './box'
export { LeaseStamp, LeaseGrant, VisibleShape, CipheredShape, LeaseStampPicked } from './lease'
export { Ciphered } from './crypto'
export { VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion, ListedBox, StoredRevision, ReadAnswer, ListingAnswer, StoredVaultTok } from './vault-db'
export { makeBankOpts, bankVaultOpts, vaultDBShape, deviceDBShape, maxWhisperBytes, maxBoxes, declaredBytes, declaredBoxes, leaseHoursAsMillis, staleMinutesAsMillis, renewMinutesAsMillis, clockShape, clockReading, keyDeriverShape } from './vault-opts'
export { vaultBag, bankBag } from './bank'
export { strengthChecker, passphraseVerdict } from './passphrase-strength'
export { loggerShape } from './logger'
export { localVaultDBOptsShape } from './local-vault-db'
export { passkeyAnswerShape } from './proving'
export { vaultMadeUnderShape } from './vault'
export { maskOpts } from './mask'
export { idbOpts } from './idb-opts'
