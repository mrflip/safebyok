import * as Z from 'zod/mini'
import { type Ciphered, deriveWrappingKey, fromB64, fromB64OrNull, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { PassphraseKeyBytes } from './key-deriver-spec'
import { type Lease, sealLeaseRecord } from './lease'
import { hostThrewRefusal } from './outcome'
import { stableJsonify } from './stable-jsonify'
import { PasskeySaltBytes, type LeaseRecord, type PasskeyAnswer, type PasskeyWayinRecord, type PassphraseWayinRecord, type Stamp, type VaultProps, type WayinKind, isGated } from './types'
import { decorate } from './adorn'
import type { Vault } from './vault'
import { PasskeyWayin, PassphraseWayin, Wayin, type WayinHeader, wayinCtxOf } from './wayin'

/** Provings: a passphrase or a passkey's answer made into a wayinKey, held for one gating, which opens or seals the vault's ways in.
 * A Proving is sealed over a wayin's header: the current wayin's, to prove what stands, or a
 * fresh one it mints, to become a new way in. The cleartext goes no further than `seal`; the
 * wayinKey it makes is non-extractable and never leaves the Proving, and no method hands back a
 * vaultKey. What crosses a method's boundary is a Proving, a Wayin, a Lease or a wrapped key.
 */

/** The slice of a {@link Vault} a proving reads: its scope and stamp, its key deriver, its lease length and clock, and its demand. */
export type ProvingVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_tok' | 'stamp' | 'keyDeriver' | 'leaseMillis' | 'now' | 'demandConsistentWith'>

/** A passphrase wayin's visible fields: its record but the wrap. */
export type PassphraseWayinHeader = Omit<PassphraseWayinRecord, 'vault_key_wayin_wrapped'>
/** A passkey wayin's visible fields: its record but the wrap. */
export type PasskeyWayinHeader = Omit<PasskeyWayinRecord, 'vault_key_wayin_wrapped'>

/** The gating a proving is made for, asked whether it has landed: settled, declined, or ended by a lock. A landed gating's provings open nothing more. */
export type ProvingGating = { readonly landed: boolean }

/** The gating of a proving made outside any prompt, which never lands. */
export const StandingGating: ProvingGating = Object.freeze({ landed: false })

/** What a proving reaches of its Vault object inside the package, which no getter of the Vault object shows. */
export type ProvingInside = {
  /** The vault props in hand: the gate whose wayins a proving opens. */
  vaultProps: () => VaultProps
  /** This device's id for the vault, from the bank's device record: what a fresh header carries. */
  deviceId:   () => string
  /** Store `record` as this device's lease, {@link DeviceDB.putLease}, resolving the record as stored; a take-up under way stands down first. */
  putLease:   (record: LeaseRecord) => Promise<LeaseRecord>
  /** Hold `stored` as the vault's lease, its expiry armed, the snapshot replaced. */
  holdLease:  (stored: LeaseRecord) => Lease
}

/** Each registered vault's inside: a weak map, so a vault let go is let go here too. */
const insides = new WeakMap<object, ProvingInside>()

/** Let this package's provings reach `vault`'s inside, once: what a Vault object's constructor calls.
 *
 * @example registerProvingInside(this, { vaultProps: () => this.#vaultProps, ... })
 */
export const registerProvingInside = (vault: object, inside: ProvingInside): void => {
  if (! insides.has(vault)) { insides.set(vault, inside) }
}

/** The inside of `vault`, which only a Vault object registers. */
const insideOf = (vault: object): ProvingInside => {
  const inside = insides.get(vault)
  if (inside === undefined) { throw new VaultError('bad_option', 'A proving is made for a Vault object, which a Bank hands out: a slice of one will not do.') }
  return inside
}

/** What a header of `slotlabel` names when it names only the slot: the header `seal` mints. */
type FreshHeader<SlotT extends WayinKind> = { slotlabel: SlotT }

/** The vaultKey's usage when it is unwrapped to be wrapped again: extractable, as a wrap needs, and good for nothing else. */
const RewrapUsage = { extractable: true, usage: ['wrapKey'] } as const
/** The vaultKey's usage when it is unwrapped only to see that it opens: non-extractable. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const

/** A wayinKey made for one gating from a passphrase or a passkey's answer, over one wayin's header: a {@link PassphraseProving} or a {@link PasskeyProving}.
 * It holds its vault, its slotlabel, the header it was sealed over, the stamp it was sealed under,
 * the gating that made it, and the wayinKey. Only its slotlabel shows in a spread, JSON or a log
 * line. Its demand, {@link Vault.demandConsistentWith} handed the proving, asks that the gate's
 * wayin at its slotlabel carries its header (or, for a fresh header no gate holds yet, that the
 * gate has not moved since it was sealed), and that its gating has not landed: 'gating_landed'.
 *
 * @example const proving = await PassphraseProving.seal(vault, wayin.header, passphrase)
 * @example JSON.stringify(proving)   // '{"slotlabel":"passphrase"}'
 */
export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  /** The vault it proves for. Not enumerable. */
  declare readonly vault: ProvingVault
  /** The header it was sealed over: the wayin it opens, or the one it will become. Not enumerable. */
  declare readonly header: HeaderT
  /** The gating it was made for. Not enumerable. */
  declare readonly gating: ProvingGating
  /** Which slot of the gate it opens or fills. */
  readonly slotlabel: HeaderT['wayinkind']
  /** The scope's app. Not enumerable. */
  declare readonly applabel: string
  /** The scope's user. Not enumerable. */
  declare readonly user_id: string
  /** The scope's vault label. Not enumerable. */
  declare readonly vaultlabel: string
  /** The `vault_tok` it was sealed under, which its wraps are bound to. Not enumerable. */
  declare readonly vault_tok: string
  /** The `gate_epoch` it was sealed under. Not enumerable. */
  declare readonly gate_epoch: number
  /** The wayinKey: non-extractable, never handed out. */
  readonly #wayinKey: CryptoKey

  protected constructor(vault: ProvingVault, stamp: Stamp, header: HeaderT, gating: ProvingGating, wayinKey: CryptoKey) {
    // The stamp is the vault's, for its demand to judge: readable, but no field a spread or JSON shows.
    const { applabel, user_id, vaultlabel, vault_tok, gate_epoch } = stamp
    decorate<Proving<HeaderT>>(this, { vault, header: Object.freeze({ ...header }), gating, applabel, user_id, vaultlabel, vault_tok, gate_epoch })
    this.slotlabel = header.wayinkind
    this.#wayinKey = wayinKey
  }

  /** True when `vaultProps`' wayin at this proving's slotlabel carries its header: the proving opens the gate they hold.
   *
   * @example proving.isCarriedBy(vaultProps)   // false once another device replaced the passphrase
   */
  isCarriedBy(vaultProps: VaultProps): boolean {
    const wayin = wayinRecordAt(vaultProps, this.slotlabel)
    if (wayin === null) { return false }
    const { vault_key_wayin_wrapped: _wrapped, ...carried } = wayin
    return stableJsonify(carried) === stableJsonify(this.header)
  }

  /** `vaultKey` wrapped under the wayinKey, bound to `visible`, a wayin's header in this vault: the wrap a wayin stores.
   *
   * @example const wrapped = await proving.wrappedWith(vaultKey, proving.header)
   */
  async wrappedWith(vaultKey: CryptoKey, visible: WayinHeader): Promise<Ciphered> {
    return await wrapKeyUnder(this.#wayinKey, vaultKey, wayinCtxOf(this.vault, this.vault_tok, visible))
  }

  /** Check that the gate's current wayin at its slotlabel opens under this proving, keeping nothing: 'wrong_passphrase' or 'wrong_passkey' when it will not.
   * It demands on the proving before and after its one wait.
   *
   * @example await proving.checkWayin()   // a passphrase proven before the passkey goes
   */
  async checkWayin(): Promise<void> {
    this.#demand()
    await this.#unwrap(this.#currentWrap(), this.header, CheckUsage)
  }

  /** A Wayin for `newProving`'s slotlabel: the vaultKey unwrapped from the gate's wayin at this proving's slotlabel and wrapped under `newProving`, bound to its header.
   * The vaultKey is not kept. It demands on this proving before and after its waits, which is what
   * refuses 'gate_moved' for a passphrase another device has since replaced. It refuses as
   * {@link Proving.checkWayin} does for a proving that does not open its wayin.
   *
   * @example const wayin = await currentProving.resealWayinFor(newProving)
   */
  async resealWayinFor(newProving: Proving): Promise<PassphraseWayin | PasskeyWayin> {
    this.#demand()
    const vaultKey = await this.#unwrap(this.#currentWrap(), this.header, RewrapUsage)
    const wrapped = await newProving.wrappedWith(vaultKey, newProving.header)
    this.#demand()
    const record: unknown = { ...newProving.header, vault_key_wayin_wrapped: wrapped }
    return Wayin.make(this.vault, this.vault_tok, record)
  }

  /** Grant this device a lease on the vault, by the wayin this proving opens in the gate that stands, resolving the Lease as stored and held.
   * In order: a demand on the proving; the vaultKey unwrapped from its wayin; a fresh leaseKey,
   * and the vaultKey wrapped under it ({@link sealLeaseRecord}); a demand on the proving and on the
   * gate the lease names, with nothing awaited between it and the store, so a lock or a gating's
   * end landing before it refuses here ('gating_landed'), and one landing after it erases the lease
   * behind it in the device store's order; {@link DeviceDB.putLease}; a demand on the proving
   * again, and on the stored record's `vault_tok` and `gate_epoch`, never asking it for a lease; then
   * the lease is held, its expiry armed, and the snapshot replaced. A refusal at the last demand
   * holds nothing.
   *
   * @example const lease = await proving.grantLease()
   */
  async grantLease(): Promise<Lease> {
    const inside = insideOf(this.vault)
    this.#demand()
    const standing = inside.vaultProps()
    const vaultKey = await this.#unwrap(this.#currentWrap(), this.header, RewrapUsage)
    const record = await sealLeaseRecord(this.vault, standing, vaultKey)
    // Nothing is awaited between these demands and the write.
    this.#demand()
    this.vault.demandConsistentWith(stampOfRecord(record))
    const stored = await inside.putLease(record)
    this.#demand()
    this.vault.demandConsistentWith(stampOfRecord(stored))
    return inside.holdLease(stored)
  }

  /** Only its slotlabel: all JSON and a log line show of a proving. */
  toJSON(): { slotlabel: WayinKind } {
    return { slotlabel: this.slotlabel }
  }

  /** The refusal of a wayin this proving does not open. */
  protected abstract wrongProof(): VaultError

  /** The demand on this proving, through its vault. */
  #demand() {
    this.vault.demandConsistentWith(this)
  }

  /** The wrap of the gate's wayin at this proving's slotlabel, as the vault holds it now; a gate with none there has moved past it. */
  #currentWrap(): Ciphered {
    const wayin = wayinRecordAt(insideOf(this.vault).vaultProps(), this.slotlabel)
    if (wayin === null) { throw gateMovedPast() }
    return wayin.vault_key_wayin_wrapped
  }

  /** The vaultKey out of `wrapped` under the wayinKey, bound to `visible`, with `usage`: {@link wrongProof} when it will not unwrap. A demand follows the wait. */
  async #unwrap(wrapped: Ciphered, visible: WayinHeader, usage: typeof RewrapUsage | typeof CheckUsage): Promise<CryptoKey> {
    let vaultKey: CryptoKey | null
    try {
      vaultKey = await unwrapKeyUnder(this.#wayinKey, wrapped, wayinCtxOf(this.vault, this.vault_tok, visible), usage)
    } catch {
      vaultKey = null
    }
    this.#demand()
    if (vaultKey === null) { throw this.wrongProof() }
    return vaultKey
  }
}

/** The proving of a passphrase: the passphraseKey the key deriver makes of it over the header's salt.
 *
 * @example const proving = await PassphraseProving.seal(vault, headerOf(vaultProps.passphrase), typed)
 * @example const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, chosen)   // a fresh header, its salt minted
 */
export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  private constructor(vault: ProvingVault, stamp: Stamp, header: PassphraseWayinHeader, gating: ProvingGating, wayinKey: CryptoKey) {
    super(vault, stamp, header, gating, wayinKey)
    Object.freeze(this)
  }

  /** The proving `passphrase` makes over `header`: the current passphrase wayin's visible fields, to prove what stands, or `{ slotlabel: 'passphrase' }`, for a fresh header whose salt it mints.
   * One key derivation, its bytes zeroed once imported. A fresh header names the vault's key
   * deriver, a fresh salt, this device's id, and the time now. Over a current header it refuses,
   * deriving nothing: 'unknown_key_deriver' for another deriver's wayin, 'damaged_wayin' for a salt
   * its deriver never makes, and 'wrong_passphrase' for a blank passphrase. A fresh one checks no
   * strength: {@link Vault.checkStrength} does. It refuses 'bad_option' for a passphrase that is not
   * text, and as {@link passphraseKeyOf} does. It demands on the proving after the derivation.
   *
   * @param opts.gating - The gating it is made for; {@link StandingGating} when left out.
   *
   * @example await PassphraseProving.seal(vault, headerOf(vaultProps.passphrase), typed)
   * @example await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, chosen)
   */
  static async seal(vault: ProvingVault, header: PassphraseWayinHeader | FreshHeader<'passphrase'>, passphrase: string, opts: { gating?: ProvingGating } = {}): Promise<PassphraseProving> {
    if (typeof passphrase !== 'string') {
      throw new VaultError('bad_option', 'A passphrase is the text the user typed, as a string.')
    }
    const { stamp } = vault
    const { keyDeriver } = vault
    const sealing = 'slotlabel' in header ? mintedPassphraseHeader(vault, keyDeriver) : checkedPassphraseHeader(header, keyDeriver, passphrase)
    const wayinKey = await passphraseKeyOf(keyDeriver, passphrase, fromB64(sealing.salt_b64))
    const proving = new PassphraseProving(vault, stamp, sealing, opts.gating ?? StandingGating, wayinKey)
    vault.demandConsistentWith(proving)
    return proving
  }

  /** The wayins of a novel vault, the first gate's: a fresh vaultKey wrapped under this proving's header and, when given, `passkeyProving`'s, in one method so the vaultKey never crosses.
   * The vaultKey is not kept. Both provings are fresh. It demands on this proving after its waits.
   *
   * @example const { passphrase, passkey } = await passphraseProving.sealWayins(passkeyProving)
   */
  async sealWayins(passkeyProving?: PasskeyProving): Promise<{ passphrase: PassphraseWayin, passkey: PasskeyWayin | null }> {
    const vaultKey = await makeVaultKey()
    const passphraseWrap = await this.wrappedWith(vaultKey, this.header)
    const passkeyWrap = passkeyProving === undefined ? null : await passkeyProving.wrappedWith(vaultKey, passkeyProving.header)
    this.vault.demandConsistentWith(this)
    return {
      passphrase: Wayin.make(this.vault, this.vault_tok, { ...this.header, vault_key_wayin_wrapped: passphraseWrap }),
      passkey:    passkeyProving === undefined || passkeyWrap === null ? null : Wayin.make(this.vault, this.vault_tok, { ...passkeyProving.header, vault_key_wayin_wrapped: passkeyWrap }),
    }
  }

  protected wrongProof(): VaultError {
    return new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again. If you're sure it's right, the stored vault may be damaged.")
  }
}

/** How many bytes a passkey's PRF answers with: always 32, by the WebAuthn PRF extension. */
const PrfAnswerBytes = 32

/** What a passkey's answer must carry. The refusal never quotes it: its bytes are secret. */
const passkeyAnswerShape = Z.object({
  credentialId: Z.string().check(Z.minLength(1)),
  prfSaltB64:   Z.string().check(Z.minLength(1)),
  prfBytes:     Z.custom<Uint8Array>((candidate) => candidate instanceof Uint8Array && candidate.length === PrfAnswerBytes),
})

/** The proving of a passkey's answer: the passkeyKey HKDF makes of its PRF bytes, with the header's whole wayin ctx as its `info`.
 *
 * @example const proving = await PasskeyProving.seal(vault, headerOf(vaultProps.passkey), answer)
 */
export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  private constructor(vault: ProvingVault, stamp: Stamp, header: PasskeyWayinHeader, gating: ProvingGating, wayinKey: CryptoKey) {
    super(vault, stamp, header, gating, wayinKey)
    Object.freeze(this)
  }

  /** The proving `answer` makes over `header`: the current passkey wayin's visible fields, or `{ slotlabel: 'passkey' }` for a fresh one, its credential and salt the answer's.
   * The answer's PRF bytes are zeroed once imported, whatever happens, so hand in an answer for
   * this one call. It refuses 'bad_option' for what is no passkey's answer, and, fresh, for a salt
   * that is not {@link PasskeySaltBytes} bytes; over a current header, 'damaged_wayin' for a salt
   * its kind never makes and 'wrong_passkey' for another credential's answer or one over another
   * salt, deriving nothing. It demands on the proving after the HKDF.
   *
   * @param opts.gating - The gating it is made for; {@link StandingGating} when left out.
   *
   * @example await PasskeyProving.seal(vault, headerOf(vaultProps.passkey), await askPasskey(vault.passkey))
   * @example await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await createPasskey(opts))
   */
  static async seal(vault: ProvingVault, header: PasskeyWayinHeader | FreshHeader<'passkey'>, answer: PasskeyAnswer, opts: { gating?: ProvingGating } = {}): Promise<PasskeyProving> {
    const checked = checkedPasskeyAnswer(answer)
    const { prfBytes } = checked
    try {
      const { stamp } = vault
      const sealing = 'slotlabel' in header ? mintedPasskeyHeader(vault, checked) : checkedPasskeyHeader(header, checked)
      const wayinKey = await deriveWrappingKey(prfBytes, wayinCtxOf(vault, stamp.vault_tok, sealing))
      const proving = new PasskeyProving(vault, stamp, sealing, opts.gating ?? StandingGating, wayinKey)
      vault.demandConsistentWith(proving)
      return proving
    } finally {
      prfBytes.fill(0)
    }
  }

  protected wrongProof(): VaultError {
    return new VaultError('wrong_passkey', "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with the passphrase; if that works, add the passkey again, which replaces it.")
  }
}

// == [Headers]: headerOf, wayinRecordAt, checkedPasskeyAnswer, checkFreshSalt, mintedPassphraseHeader, checkedPassphraseHeader, mintedPasskeyHeader, checkedPasskeyHeader, stampOfRecord, gateMovedPast

/** `record`'s visible fields: the header a proving of the wayin it is seals over.
 *
 * @example await PassphraseProving.seal(vault, headerOf(vaultProps.passphrase), typed)
 */
export function headerOf(record: PassphraseWayinRecord): PassphraseWayinHeader
export function headerOf(record: PasskeyWayinRecord): PasskeyWayinHeader
export function headerOf(record: PassphraseWayinRecord | PasskeyWayinRecord): PassphraseWayinHeader | PasskeyWayinHeader {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = record
  return header
}

/** The wayin record `vaultProps` hold at `slotlabel`, or null: a novel vault's, or no passkey. */
const wayinRecordAt = (vaultProps: VaultProps, slotlabel: WayinKind): PassphraseWayinRecord | PasskeyWayinRecord | null => {
  if (! isGated(vaultProps)) { return null }
  return slotlabel === 'passphrase' ? vaultProps.passphrase : vaultProps.passkey
}

/** A fresh passphrase header: the vault's key deriver, a fresh salt of its length, this device's id, and the time now. */
const mintedPassphraseHeader = (vault: ProvingVault, keyDeriver: KeyDeriver): PassphraseWayinHeader => ({
  wayinkind:         'passphrase',
  key_deriver_label: keyDeriver.key_deriver_label,
  salt_b64:          toB64(randomBytes(keyDeriver.salt_bytes)),
  device_id:         insideOf(vault).deviceId(),
  registered_at:     vault.now(),
})

/** `header`, a current passphrase wayin's, once its deriver is the vault's and its salt one that deriver makes, and the passphrase is not blank. */
const checkedPassphraseHeader = (header: PassphraseWayinHeader, keyDeriver: KeyDeriver, passphrase: string): PassphraseWayinHeader => {
  if (header.key_deriver_label !== keyDeriver.key_deriver_label) {
    throw new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')
  }
  if (fromB64OrNull(header.salt_b64)?.length !== keyDeriver.salt_bytes) {
    throw new VaultError('damaged_wayin', "This vault's passphrase is stored damaged, so it could not be tried. If the vault has a passkey, unlock with it to read what it holds; a damaged passphrase can't be replaced, so the vault is then to be removed and made again. The vault was left as it is.")
  }
  if (! passphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces: type the vault's passphrase.") }
  return header
}

/** `given`, once it is a passkey's answer: two non-empty strings and 32 bytes, as `safebyok-react`'s `askPasskey` gives it; 'bad_option' otherwise, quoting none of it.
 *
 * @example checkedPasskeyAnswer(await askPasskey(vault.passkey))
 * @example checkedPasskeyAnswer({ credentialId: 'abc' })   // throws 'bad_option'
 */
export const checkedPasskeyAnswer = (given: unknown): PasskeyAnswer => {
  const checked = passkeyAnswerShape.safeParse(given)
  if (! checked.success) {
    throw new VaultError('bad_option', `A passkey's answer is { credentialId, prfSaltB64, prfBytes }: the credential's id and the salt it answered for, as base64url text, and its ${String(PrfAnswerBytes)}-byte PRF answer, as safebyok-react's askPasskey and createPasskey give them.`)
  }
  return checked.data
}

/** Refuse 'bad_option' for a new passkey's answer over a salt that is not {@link PasskeySaltBytes} bytes as base64url text: a passkey wayin sealed over another would read as damaged at every later unlock.
 *
 * @example checkFreshSalt(await createPasskey(opts))   // passes
 * @example checkFreshSalt({ ...answer, prfSaltB64: 'c2hvcnQ' })   // throws 'bad_option'
 */
export const checkFreshSalt = (answer: PasskeyAnswer): void => {
  if (fromB64OrNull(answer.prfSaltB64)?.length !== PasskeySaltBytes) {
    throw new VaultError('bad_option', `A new passkey answers over a fresh salt of ${String(PasskeySaltBytes)} random bytes, as base64url text: safebyok-react's createPasskey mints one.`)
  }
}

/** A fresh passkey header: the credential and salt the answer came over, this device's id, and the time now. */
const mintedPasskeyHeader = (vault: ProvingVault, answer: PasskeyAnswer): PasskeyWayinHeader => {
  checkFreshSalt(answer)
  return {
    wayinkind:     'passkey',
    credential_id: answer.credentialId,
    prf_salt_b64:  answer.prfSaltB64,
    device_id:     insideOf(vault).deviceId(),
    registered_at: vault.now(),
  }
}

/** `header`, a current passkey wayin's, once its salt is one a passkey wayin holds and the answer is its credential's, over its salt. */
const checkedPasskeyHeader = (header: PasskeyWayinHeader, answer: PasskeyAnswer): PasskeyWayinHeader => {
  if (fromB64OrNull(header.prf_salt_b64)?.length !== PasskeySaltBytes) {
    throw new VaultError('damaged_wayin', "This vault's passkey is stored damaged, so it could not be tried. Unlock with the passphrase, then add the passkey again, which replaces it. The vault was left as it is.")
  }
  if (answer.credentialId !== header.credential_id) {
    throw new VaultError('wrong_passkey', "That passkey is not this vault's: it may have been replaced or removed on another device, or belong to another vault. Ask the credential the snapshot's passkey names.")
  }
  if (answer.prfSaltB64 !== header.prf_salt_b64) {
    throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's passkey names.")
  }
  return header
}

/** The stamp a lease record names: its scope, `vault_tok` and `gate_epoch`. */
const stampOfRecord = (record: LeaseRecord) => ({
  applabel:   record.applabel,
  user_id:    record.user_id,
  vaultlabel: record.vaultlabel,
  vault_tok:  record.vault_tok,
  gate_epoch: record.gate_epoch,
})

/** The refusal of a proving whose slot the gate no longer fills. */
const gateMovedPast = () => new VaultError('gate_moved', "The vault's ways in changed while this call was under way -- its passphrase or passkey was changed, here or on another device -- so nothing more was done. Unlock again to carry on.")
// --

// == [Key bytes]: notKeyBytes, isSharedMemory, isAllZero, passphraseKeyOf

/** The refusal for a key deriver's result that is not 32 bytes of a view. */
const notKeyBytes = () => new VaultError('bad_option', 'keyDeriver handed back something other than 32 key bytes: a passphraseKey is a 256-bit key.')

/** True when a key deriver's bytes sit in shared memory, told even across realms and where `SharedArrayBuffer` is absent. */
const isSharedMemory = (view: ArrayBufferView): boolean => Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]'

/** True when every byte of `bytes` is zero, read with no early exit, as libsodium's `sodium_is_zero` does.
 * No JavaScript engine promises constant time, but nothing here branches on a byte: only the
 * verdict steers what follows, and the refusal of an all-zero output tells that anyway.
 */
const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0

/** The passphraseKey `keyDeriver` makes of `passphrase` and its salt, the deriver's bytes zeroed after, whatever happens.
 * It refuses 'bad_option' for anything but 32 bytes in memory of their own, before anything is
 * wrapped: WebCrypto would take 16 or 24 as a weaker key. It refuses 32 zero bytes alike: a key
 * anyone could rebuild, as a deriver handing back bytes kept from an earlier call, wiped since,
 * would make. Shared memory is refused untouched. What the deriver throws is refused as {@link
 * hostThrewRefusal} says.
 *
 * @example const wayinKey = await passphraseKeyOf(vault.keyDeriver, typed, saltBytes)
 */
export const passphraseKeyOf = async (keyDeriver: KeyDeriver, passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> => {
  let handed: unknown
  try {
    handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch (err) {
    // The deriver heard the passphrase: what it threw may quote it.
    throw hostThrewRefusal(err)
  }
  if (! ArrayBuffer.isView(handed)) { throw notKeyBytes() }
  if (isSharedMemory(handed)) {
    throw new VaultError('bad_option', 'keyDeriver handed back key bytes in shared memory (a SharedArrayBuffer), which WebCrypto will not import and other threads could read: hand back a fresh Uint8Array.')
  }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.byteLength !== PassphraseKeyBytes) { throw notKeyBytes() }
    if (isAllZero(keyBytes)) {
      throw new VaultError('bad_option', 'keyDeriver handed back 32 zero bytes, a key anyone could rebuild: derive the key afresh on every call, and never hand back bytes kept from an earlier one.')
    }
    return await importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}
// --
