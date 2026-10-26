import type * as Z from 'zod'
import { Validator } from '../checks/validator'
import { prf_salt_b64, revision_tok, salt_b64, vault_key_lease_wrapped, vault_key_wayin_wrapped, vault_tok } from './type-aliases'

/** The JSON a whisper is made of, `null` included inside an array or object: a whole {@link Whisper} cannot be null. */
export type WhisperJson = string | number | boolean | null | WhisperJson[] | { [ckey: string]: WhisperJson }

/** The secret kept in a box: a JSON value, a string, number, boolean, array or plain object.
 * `undefined` anywhere in it is refused, as JSON cannot carry it. A bare `null` is refused too:
 * emptying a box is `delBox`'s job.
 *
 * @example 'sk-ant-api03-...'
 * @example { apiKey: 'sk-ant-...', orgId: null }
 */
export type Whisper = Exclude<WhisperJson, null>

/** True for a plain object, built by a literal or `Object.create(null)`: never a Date or Map, which JSON would flatten. */
export const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/** The check for a {@link Whisper}, exactly what JSON can carry, never what it would mangle, and never a bare null; and `whisperBag`, the plain JSON object a whisper or a {@link Sidecar} may be.
 * Its `parse` refuses 'bad_whisper', quoting none of it.
 *
 * @example Whisper.parse('sk-ant-...')                  // a string passes through
 * @example Whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example Whisper.safeParse(undefined).success         // false: undefined cannot be stored
 * @example Whisper.safeParse(null).success              // false: emptying a box is delBox's job
 * @example Whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const { Whisper, whisperBag } = Validator('bad_whisper', ({ lazy, union, str, num, bool, lit, arr, rec, custom }) => {
  const whisperJson: Z.ZodType<WhisperJson> = lazy(() => union([str, num, bool, lit(null), whisperArr, whisperBag]))
  const whisperBag = custom<Record<string, unknown>>(isPlainBag, "a whisper object must be a plain object").pipe(rec(str, whisperJson))
  const whisperArr = arr(whisperJson)
  const Whisper: Z.ZodType<Whisper> = union([str, num, bool, whisperArr, whisperBag])
  return { Whisper, whisperBag }
})

/** What names one vault: the app's label, the signed-in user's id, and the vault's own label. Its `parse` refuses 'bad_scope'.
 * Each label is a `label`, and the user's id a `user_id`. A scope carrying more fields passes,
 * the rest left out.
 */
export const { VaultScope } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => ({ VaultScope: obj({ applabel, user_id, vaultlabel }) }))
export type VaultScope = Z.infer<typeof VaultScope>

/** A box's sidecar: your app's own JSON object beside the whisper, `{}` for none, shown while the vault is locked. Never put secret material in it.
 * It is stored in the clear, as the JSON object it is (a `jsonb` column, say, which a server can
 * query), so anyone who can read the database can read it. It is bound into the box's encryption
 * as its JSON with keys sorted, so a sidecar altered in storage makes the box refuse to open, while
 * one whose keys storage reorders still opens. safebyok never looks inside it: check its shape
 * before `putBox()`. Its `parse` refuses 'bad_option', as `putBox()` does.
 *
 * @example Sidecar.parse({ note: 'work account', project: 'atlas' })
 * @example Sidecar.safeParse({ when: new Date() }).success     // false: JSON would flatten it to {}
 * @example Sidecar.safeParse('work account').success           // false: a sidecar is an object -- { note: 'work account' }
 */
export const { Sidecar } = Validator('bad_option', () => ({ Sidecar: whisperBag }))
export type Sidecar = Z.infer<typeof Sidecar>

/** The visible fields of a sound box, readable while locked: what a vault's snapshot holds beside {@link DamagedBox}es.
 * They are a `Box`'s own fields, as `{ ...box }` holds them, and `vault_tok`, of the box's stamp,
 * and `damaged` false. Its sidecar is `{}` when the host gave none. The sidecar is as storage holds it: only
 * `getWhisper()` opens the box and so proves it unaltered.
 *
 * @example BoxSummary.parse({ boxlabel: 'anthropic', revision_tok: 'r1', sidecar: {}, registered_at, written_at, vault_tok }).damaged // false
 */
export const { BoxSummary } = Validator('bad_record', ({ obj, lit, boxlabel, epochMillis }) => ({
  BoxSummary: obj({
    boxlabel,
    revision_tok,
    sidecar:         Sidecar,
    registered_at:   epochMillis,
    written_at:      epochMillis,
    vault_tok,
    damaged:         lit(false).default(false),
  }),
}))
export type BoxSummary = Z.infer<typeof BoxSummary>

/** A box as a VaultDB's `getVault` lists it: a {@link BoxSummary} but for its `vault_tok`, which the vault adds from the vault props it read beside the listing. */
export type ListedSummary = Omit<BoxSummary, 'vault_tok'>

/** A box whose stored record does not read back as one, listed under its boxlabel among the {@link BoxSummary}s of a vault's snapshot.
 * That covers damage, tampering, another version's record, or a vaultKey the vault does not hold.
 * Nothing of it is trusted but its `revision_tok`, which only names the record to write over; null
 * when it holds none as text. `delBox()` removes it and `putBox()` writes a fresh box over it.
 * `getBox()`, `getWhisper()` and `useWhisper()` refuse it 'damaged_box'.
 *
 * @example
 *   for (const box of snapshot.boxes) {
 *     if (box.damaged) { showRemovable(box.boxlabel) } else { showSummary(box.boxlabel, box.sidecar) }
 *   }
 */
export type DamagedBox = { boxlabel: string, damaged: true, revision_tok: string | null }

/** How much room a vault has: boxes against the most it holds, and bytes against the most its storage holds of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`. Its
 * `parse` refuses 'bad_record'.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const { Capacity } = Validator('bad_record', ({ obj, union, int, uint, lit }) => {
  // A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
  // safe integer, as Bank.make keeps a declared limit: past this check, no limit is infinite.
  const roomLimit = union([int.positive(), lit(Infinity)]).transform((most) => Math.min(most, Number.MAX_SAFE_INTEGER))
  const room      = obj({ used: uint, max: roomLimit })
  return { Capacity: obj({ boxes: room, bytes: room }) }
})
export type Capacity = Z.infer<typeof Capacity>

/** The kinds of wayin, each with a record shape and a vault props slot of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const WayinKindVals = ['passphrase', 'passkey'] as const
export type WayinKind = typeof WayinKindVals[number]

/** How many random bytes a passkey wayin's `prf_salt_b64` holds.
 * A new passkey's {@link PasskeyAnswer} carries a fresh salt this long, as `createPasskey` mints.
 */
export const PasskeySaltBytes = 32

/** The `format` a {@link Tombstone} carries, which tells it from vault props stored in the same place. */
export const TombstoneFormat = 'safebyok-tombstone-v1'

/** The vault's stored records: its props, gated or gateless, each wayin they hold, and the tombstone a deletion leaves. Each `parse` refuses 'bad_record', quoting none of it.
 * Each is strict: a field this version does not know is damage, or a newer `format`. A VaultDB
 * reads each back through these, and refuses what fails as 'damaged_vault'.
 */
export const { PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GatedVaultProps, GatelessVaultProps, VaultProps, Tombstone } = Validator('bad_record', ({ obj, str, uint, int, lit, union, discrim, applabel, user_id, vaultlabel, epochMillis }) => {
  const PassphraseWayinRecord = obj({
    wayinkind:               lit('passphrase'),
    /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
    key_deriver_label:       str.min(1),
    /** This wayin's passphraseSalt: fresh for every passphrase the vault takes. */
    salt_b64,
    /** The sealing device's random id for the vault, from its device mark: never drawn from the device itself. */
    device_id:               str.min(1),
    /** When this wayin was sealed: a new passphrase stamps it afresh. */
    registered_at:           epochMillis,
    /** The vaultKey, wrapped under the passphraseKey: unwrapping it is the passphrase check. */
    vault_key_wayin_wrapped,
  }).strict()

  const PasskeyWayinRecord = obj({
    wayinkind:               lit('passkey'),
    /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
    credential_id:           str.min(1),
    /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every wayin. */
    prf_salt_b64,
    /** The adding device's random id for the vault, from its device mark: never drawn from the device itself. */
    device_id:               str.min(1),
    /** When this wayin was added. */
    registered_at:           epochMillis,
    /** The vaultKey, wrapped under the passkeyKey: unwrapping it is the passkey check. */
    vault_key_wayin_wrapped,
  }).strict()

  const WayinRecord = discrim('wayinkind', [PassphraseWayinRecord, PasskeyWayinRecord])

  // The fields every vault props record opens with, gated or gateless: its format, its scope and its `vault_tok`.
  const vaultPropsHead = {
    format:              lit('safebyok-vault-v6'),
    applabel,
    user_id,
    vaultlabel,
    /** A random token minted when the vault is made, never changed, and bound into every encryption. */
    vault_tok,
    /** A counter the store bumps on every write of the gate and on the vault's deletion, and carries on into a new life of the scope.
     * It only goes up; a device that has seen a higher one than storage shows knows storage was rolled back.
     * No box write moves it, and a writer's own value is ignored: the store decides.
     */
    vault_epoch:         uint,
  }

  const GatedVaultProps = obj({
    ...vaultPropsHead,
    gate_epoch:          int.positive(),
    /** The vault's passphrase wayin, which every gated vault has. */
    passphrase:          PassphraseWayinRecord,
    /** The vault's passkey, or null when it has none: at most one. */
    passkey:             PasskeyWayinRecord.nullable(),
    /** When the vault was made; never changed. */
    registered_at:       epochMillis,
  }).strict()

  const GatelessVaultProps = obj({
    ...vaultPropsHead,
    gate_epoch:          lit(0),
    passphrase:          lit(null),
    passkey:             lit(null),
    registered_at:       epochMillis,
  }).strict()

  const VaultProps = union([GatedVaultProps, GatelessVaultProps])

  const Tombstone = obj({
    format:              lit(TombstoneFormat),
    applabel,
    user_id,
    vaultlabel,
    vault_epoch:         int.positive(),
  }).strict()

  return { PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GatedVaultProps, GatelessVaultProps, VaultProps, Tombstone }
})

/** A passphrase wayin as stored: the vaultKey wrapped under the passphraseKey the passphrase and this wayin's passphraseSalt make.
 * Every other field is visible, and bound into that wrap, so a wayin altered or moved to another
 * vault refuses to open. A vault holds exactly one, as its props' `passphrase`.
 */
export type PassphraseWayinRecord = Z.infer<typeof PassphraseWayinRecord>

/** A passkey wayin as stored: the vaultKey wrapped under the passkeyKey made from the authenticator's PRF answer over this wayin's salt.
 * The authenticator holds the secret. Every other field is visible, and bound into that wrap. A
 * vault holds at most one, as its props' `passkey`.
 */
export type PasskeyWayinRecord = Z.infer<typeof PasskeyWayinRecord>

/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export type WayinRecord = Z.infer<typeof WayinRecord>

/** A vault's passphrase as its snapshot shows it, even while locked: its kind, when and by which device it was sealed, and its `vault_tok`.
 * The `device_id` is one per device per vault, so it links nothing the vault does not already link.
 *
 * @example vault.getSnapshot().passphrase   // { wayinkind: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000, vault_tok: 'v7q2...' }
 */
export type PassphraseWayinSummary = Pick<PassphraseWayinRecord, 'wayinkind' | 'device_id' | 'registered_at'> & Pick<VaultProps, 'vault_tok'>

/** A vault's passkey as its snapshot shows it, even while locked: a {@link PassphraseWayinSummary}'s fields, and what to ask the authenticator with.
 * `safebyok-react`'s `askPasskey` takes it.
 *
 * @example vault.getSnapshot().passkey   // { wayinkind: 'passkey', device_id, registered_at, vault_tok, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }, or null
 */
export type PasskeyWayinSummary = Pick<PasskeyWayinRecord, 'wayinkind' | 'device_id' | 'registered_at' | 'credential_id' | 'prf_salt_b64'> & Pick<VaultProps, 'vault_tok'>

/** A wayin of either kind as a snapshot shows it, told apart by `wayinkind`: what a `damaged_wayin` refusal's `meta.wayin_listed` holds. */
export type WayinSummary = PassphraseWayinSummary | PasskeyWayinSummary

/** What a passkey answers when asked for a vault's PRF, to hand to the vault as proof: `safebyok-react`'s `askPasskey` makes one.
 * `credentialId` is base64url, as `PublicKeyCredential.id` gives it. `prfBytes`, 32 of them, are
 * as good as the passphrase for this vault: pass them to the vault, then drop them.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().passkey)   // null when the user dismissed it
 *   if (passkey !== null) { await gating.attemptPasskey(passkey) }   // an unlock_vault gating's
 */
export type PasskeyAnswer = {
  credentialId: string
  prfSaltB64:   string
  prfBytes:     Uint8Array
}

/** The vault props of a vault whose gate is made: a `gate_epoch` of 1 or more, its passphrase wayin, and its passkey or null.
 * `gate_epoch` goes up by one on every change of wayins, so other devices and leases know to ask
 * again.
 */
export type GatedVaultProps = Z.infer<typeof GatedVaultProps>

/** The vault props of a vault made with no gate yet: `gate_epoch` 0, and no way in.
 * A vault is first stored so, by `VaultDB.ensureVault`. Its first gate is written over it at
 * `gate_epoch` 1, expecting 0.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, vault_epoch: 0, registered_at, gate_epoch: 0, passphrase: null, passkey: null }
 */
export type GatelessVaultProps = Z.infer<typeof GatelessVaultProps>

/** What a deleted vault leaves in its scope: its counter, which the next life of the scope carries on.
 * `vault_epoch` is the deleted vault's plus one. Every write refuses over a tombstone as it does
 * over no vault, a deletion included: it holds no `vault_tok` for an expectation to name. The next
 * `ensureVault` of the scope replaces it with a new life.
 *
 * @example { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }
 */
export type Tombstone = Z.infer<typeof Tombstone>

/** The one record per vault that every device syncs: its scope, its `vault_tok`, and its wayins, each wrapping the one vaultKey.
 * None of it opens without a proof. It is {@link GatedVaultProps} once the vault has a gate, and
 * {@link GatelessVaultProps} before. Vault props at a `gate_epoch` of 1 or more with no
 * passphrase are neither, and refused.
 */
export type VaultProps = Z.infer<typeof VaultProps>

/** What a vault's picture of storage stands at: its scope, the `vault_tok` of the life it holds, its `vault_epoch` and its `gate_epoch`, frozen.
 * A Vault's `stamp` is the one it holds now; a thing it hands out carries the one it was made
 * under, and `demandConsistentWith` compares the two.
 *
 * @example { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', vault_epoch: 3, gate_epoch: 2 }
 */
export type Stamp = Readonly<VaultScope & Pick<GatedVaultProps, 'vault_tok' | 'vault_epoch' | 'gate_epoch'>>

/** A thing `demandConsistentWith` can judge: the `vault_tok` it was made under, and as much of the rest of a {@link Stamp} as it carries.
 * A box carries its `vault_tok` alone, a lease its scope and `gate_epoch` besides, a stamp all of
 * them. Each field present is compared; one absent is not.
 *
 * @example vault.demandConsistentWith(box)          // { vault_tok, ... }: the vault half
 * @example vault.demandConsistentWith(vault.stamp)  // every field
 */
export type Stamped = Readonly<Pick<Stamp, 'vault_tok'> & Partial<Stamp>>

/** True for vault props whose gate is made: {@link GatedVaultProps}, as opposed to gateless ones.
 *
 * @example if (isGated(vaultProps)) { offerUnlock(vaultProps.passphrase) } else { offerNewPassphrase() }
 */
export const isGated = (vaultProps: VaultProps): vaultProps is GatedVaultProps => vaultProps.gate_epoch > 0

/** A lease as this device keeps it: the non-extractable leaseKey, and the vaultKey wrapped under it. What a `Lease` is made from.
 * It has no JSON form, so only structured-clone storage (IndexedDB) or memory holds it. Nothing in
 * it ever goes to the backend. Its `parse` refuses 'bad_record'; it is strict, as every stored
 * record is.
 */
export const { LeaseRecord } = Validator('bad_record', ({ obj, int, lit, custom, applabel, user_id, vaultlabel, epochMillis }) => ({
  LeaseRecord: obj({
    format:            lit('safebyok-lease-v1'),
    applabel,
    user_id,
    vaultlabel,
    vault_tok,
    /** The vault props' `gate_epoch` when this lease was granted: a mismatch voids it. */
    gate_epoch:        int.positive(),
    /** This browser's leaseKey, a CryptoKey, never its bytes: non-extractable, usable only to unwrap what it wrapped. */
    lease_key:         custom<CryptoKey>((val) => val instanceof CryptoKey, "a CryptoKey handle"),
    /** The vaultKey, wrapped under the leaseKey. */
    vault_key_lease_wrapped,
    /** The instant from which the lease no longer counts, and the vault asks for a proof. */
    ask_passphrase_at: epochMillis,
  }).strict(),
}))
export type LeaseRecord = Z.infer<typeof LeaseRecord>

/** The `format` a {@link DeviceRecord} carries. */
export const DeviceRecordFormat = 'safebyok-device-v1'

/** What this device keeps of one scope, locked or not, across the vault's lives there: its own id, and the highest `vault_epoch` it has seen. Nothing in it is secret.
 * A vault served below `highest_vault_epoch` was rolled back, and the bank refuses it as
 * 'vault_behind'. The DeviceDB raises it, never lowers it: a write of a lower epoch keeps the
 * higher, and the first `device_id` stored stays. `bank.clearCachedVault` erases it. Its `parse`
 * refuses 'bad_record', and it is strict.
 *
 * @example { format: 'safebyok-device-v1', ...scope, device_id: 'Zm9vYmFy', highest_vault_epoch: 3 }
 */
export const { DeviceRecord } = Validator('bad_record', ({ obj, str, uint, lit, applabel, user_id, vaultlabel }) => ({
  DeviceRecord: obj({
    format:              lit(DeviceRecordFormat),
    applabel,
    user_id,
    vaultlabel,
    /** This device's random id for the scope, minted the first time it births the vault there, and carried by every wayin it seals. */
    device_id:           str.min(1),
    /** The highest `vault_epoch` this device has seen the scope's vault at, in any of its lives. */
    highest_vault_epoch: uint,
  }).strict(),
}))
export type DeviceRecord = Z.infer<typeof DeviceRecord>

/** The default `leaseHours`: how long a proof's unlock lasts on this device before the vault asks again. */
export const LeaseHours = 168 // seven days

/** The default `staleMinutes`: how long a `hello()` trusts the last read of storage, so a burst of hellos costs one read.
 *
 * @example Bank.make({ ...opts, staleMinutes: 1 })   // hello() reads at most once a minute
 */
export const StaleMinutes = 5

/** The longest finite `leaseHours` a vault takes, 24.5 days: the most one timer reaches. Above it, only `Infinity`, until `lock()`, is taken.
 *
 * @example Bank.make({ ...opts, leaseHours: MaxLeaseHours })   // the longest that ends by itself
 */
export const MaxLeaseHours = 588

/** The default `maxWhisperBytes`: bytes of a whisper's JSON and its sidecar's together, several times an RSA-8192 private key's PEM.
 * A larger whisper is usually a sign that the wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/** The default `maxBoxes`: within what every supplied storage adapter can hold and still delete in one go, at the default largest whisper. */
export const MaxBoxes = 100

/** A source of the time, `Bank.make`'s `clock`: `now()` is epoch milliseconds, as `Date.now()` gives, a fraction rounded down.
 * `Bank.make` reads it once, and refuses 'bad_option' for a reading outside {@link FarPast} to
 * {@link FarFuture}, or a throw. The vault takes every later reading as it comes.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
