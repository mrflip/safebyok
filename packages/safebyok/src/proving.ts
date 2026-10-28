/** Provings: a passphrase or a passkey's answer made into a wayinKey, held for one gating, which opens or seals the vault's ways in.
 * A Proving is sealed over a wayin's header: the current wayin's, to prove the gate held, or a
 * fresh one it mints, to become a new way in. The cleartext goes no further than `seal`; the
 * wayinKey it makes is non-extractable and never leaves the Proving, and no method hands back a
 * vaultKey. What crosses a method's boundary is a Proving, a Wayin, a Lease or a wrapped key.
 */

import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from './crypto'
import { RefusalFamilyForKind, VaultError, listedKindOf } from './errors'
import type { KeyDeriver } from './key-deriver'
import { PassphraseKeyBytes } from './consts'
import { Lease, sealLeaseRecord } from './lease'
import type { VaultLogger } from './logger'
import type { Vault } from './vault'
import { type Outcome, outcomeOf, valOf } from './outcome'
import { stableJsonify } from './stable-jsonify'
import * as Sanitizer from './sanitizer'
import { PasskeySaltBytes, passkeyAnswerShape, type PasskeyAnswer, type WayinKind, type PasskeyWayinHeader, type PassphraseWayinHeader, type WayinHeader, VaultMadeUnder, type VaultRecord, type VaultSparse, passphraseCleartext, type PassphraseCleartext } from './shapes/vault'
import type { LeaseRecord } from './shapes/device'
import { adorn, decorate } from './helpers'
import { prf_salt_b64, salt_b64, vault_key_wayin_wrapped, type VaultKeyWayinWrapped } from './shapes/fields'
import { PasskeyWayin, PassphraseWayin, Wayin, isPrfSalt, isSaltOf, wayinCtxOf } from './wayin'
import * as Phrases from './phrases'
import { Validator } from './checks/validator'

/** The gating a proving is made for, asked whether it has landed: settled, declined, or ended by a lock. A landed gating's provings open nothing more.
 * `call` is the vault call that raised it, which a demand's refusal names in the log.
 */
export type ProvingGating = { readonly landed: boolean, readonly call?: ProvingCall | undefined }

/** The vault calls a proving's demand names: those that raise a gating, and the demand itself for a proving made outside one. */
export type ProvingCall = 'ensureUnlocked' | 'putWayin' | 'delWayin' | 'del' | 'demandConsistentWith'

/** The gating of a proving made outside any gating, which never lands: a test hands it to `seal`. Every vault call's proving is made for a real gating. */
export const OutsideGating: ProvingGating = Object.freeze({ landed: false })

/** The tools a Vault object hands its gatings and its provings inside the package, which no field, spread or JSON of the Vault object shows.
 * Each adds its own powers: a proving's ({@link ProvingTools}) store and hold the lease it grants,
 * and a gating's (`GatingTools`) read storage, store a gate and delete the vault. Neither is
 * handed the other's.
 */
export type VaultPrivateTools = {
  /** The vault's key deriver: what a passphrase proving derives through, and what the gates a gating's chain reads judge their wayins by. */
  keyDeriver:  KeyDeriver
  /** How long a lease the vault grants lasts, in whole milliseconds. */
  leaseMillis: number
  /** The vault's demand on `thing`, a refusal logged as `call`'s; with `opts.firstGate`, a gate in the vault record held is the first gate made elsewhere ('gate_made_elsewhere'). */
  demand:      (thing: VaultMadeUnder, call: ProvingCall, opts?: { firstGate: boolean }) => void
}

/** The tools a proving reaches of its Vault object, through its {@link provingTools} getter: the {@link VaultPrivateTools}, and what it reads and stores as it seals a wayin or grants a lease.
 * A proving is sealed under the `gate_epoch` `vaultRecord()` shows then, and under the vault's
 * stamp, which is fixed for the Vault object's life.
 */
export type ProvingTools = VaultPrivateTools & {
  /** The vault record held: the gate whose wayins a proving opens, and the epochs a proving is made under. */
  vaultRecord: () => VaultRecord
  /** The vault's logger, which hears that a key deriver threw. */
  logger:      VaultLogger
  /** The time by the vault's clock, in whole epoch milliseconds: what a fresh header and a lease are stamped by. */
  now:         () => number
  /** This device's id for the vault, from the bank's device record: what a fresh header carries. */
  deviceId:    () => string
  /** Store `record` as this device's lease through the DeviceDB's `putLease`, resolving the record as stored, or the refusal, as an outcome for the demand that follows. */
  putLease:    (record: LeaseRecord) => Promise<Outcome<LeaseRecord>>
  /** Hold `lease`, which this proving made of the record it just stored, as the vault's lease: its expiry armed, the snapshot replaced. */
  holdLease:   (lease: Lease) => Lease
}

/** The key of a Vault object's getter of its {@link ProvingTools}: a symbol of this module's, never `Symbol.for`, so no code outside the package spells it. No entry point exports it.
 * A class accessor is non-enumerable, and a symbol key is passed by anyway: `JSON.stringify`,
 * `Object.keys`, a spread and `for...in` all leave it out. What it reaches is no key and yields
 * none: `putLease`, `holdLease`, and what a seal reads.
 *
 * @example get [provingTools](): ProvingTools { return this.#provingTools }
 */
export const provingTools = Symbol('Vault.provingTools')

/** The proving tools of `vault`, read once as a proving is sealed: 'bad_option' for anything but a Vault object, which alone has the getter. */
const toolsOf = (vault: Vault): ProvingTools => {
  const tools = (vault as Partial<Vault>)[provingTools]
  if (tools === undefined) { throw new VaultError('bad_option', 'A proving is made for a Vault object, which a Bank hands out: a slice of one will not do.') }
  return tools
}

/** The vault record `vault` holds now, as its provings read it: for tests alone, which have no other way to the epochs of a Vault object's picture.
 * Nothing in `src/` calls it, and the package's entry points export none of this. It throws
 * 'bad_option' for anything but a Vault object.
 *
 * @example vaultRecordHeldBy(vault).vault_epoch   // up by one on every write of the vault record
 */
export const vaultRecordHeldBy = (vault: Vault): VaultRecord => toolsOf(vault).vaultRecord()

/** A header that names only its slot, for `seal` to mint the rest. */
type FreshHeader<SlotT extends WayinKind> = { slotlabel: SlotT }

/** The vaultKey's usage when it is unwrapped to be wrapped again: extractable, as a wrap needs, and good for nothing else. */
const RewrapUsage = { extractable: true, usage: ['wrapKey'] } as const
/** The vaultKey's usage when it is unwrapped only to see that it opens: non-extractable. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const

/** A wayinKey made for one gating from a passphrase or a passkey's answer, over one wayin's header: a {@link PassphraseProving} or a {@link PasskeyProving}.
 * Only its slotlabel shows in a spread, JSON or a log line. Its vault, header, gating, what it
 * was made under and its vault's tools are readable but not enumerable; the wayinKey is private.
 *
 * {@link Vault.demandConsistentWith}, handed a proving, asks that the gate's wayin at its slotlabel
 * carries its header, and that its gating has not landed ('gating_landed'). For a fresh header no
 * gate holds yet, it asks instead that the gate has not moved since the proving was sealed.
 *
 * @example const proving = await PassphraseProving.seal(vault, wayin.header, passphrase, { gating })
 * @example JSON.stringify(proving)   // '{"slotlabel":"passphrase"}'
 */
export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  /** The vault it proves for. Not enumerable. */
  declare readonly vault: Vault
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
  /** The `vault_tok` it was sealed under, in each wrap's ctx with the rest of its vault record's stamp. Not enumerable. */
  declare readonly vault_tok: string
  /** The `gate_epoch` it was sealed under. Not enumerable. */
  declare readonly gate_epoch: number
  /** The tools of its vault it reaches inside the package, read once as it was sealed: the vault record held, the vault's demand, and what a lease grant stores through. Not enumerable, and no part of the exported type's public surface. */
  protected declare readonly tools: ProvingTools
  /** The wayinKey: non-extractable, never handed out. */
  readonly #wayinKey: CryptoKey

  protected constructor(vault: Vault, tools: ProvingTools, gateEpoch: number, header: HeaderT, gating: ProvingGating, wayinKey: CryptoKey) {
    // What it was made under is the vault's stamp and the gate_epoch then, for its demand to judge: readable, but no field a spread or JSON shows.
    const { applabel, user_id, vaultlabel, vault_tok } = vault.stamp
    decorate<Proving<HeaderT>>(this, { vault, header: Object.freeze({ ...header }), gating, applabel, user_id, vaultlabel, vault_tok, gate_epoch: gateEpoch })
    adorn(this, 'tools', tools)
    this.slotlabel = header.wayinkind
    this.#wayinKey = wayinKey
  }

  /** True when `vaultRecord`'s wayin at this proving's slotlabel carries its header: the proving opens the gate it holds.
   *
   * @example proving.isCarriedBy(vaultRecord)   // false once another device replaced the passphrase
   */
  isCarriedBy(vaultRecord: Pick<VaultRecord, 'gate'>): boolean {
    const wayin = vaultRecord.gate?.[this.slotlabel] ?? null
    if (wayin === null) { return false }
    const { vault_key_wayin_wrapped: _wrapped, ...carried } = wayin
    return stableJsonify(carried) === stableJsonify(this.header)
  }

  /** `vaultKey` wrapped under the wayinKey, bound to `visible`, a wayin's header in this vault: the wrap a wayin stores.
   *
   * @example const wrapped = await proving.wrappedWith(vaultKey, proving.header)
   */
  async wrappedWith(vaultKey: CryptoKey, visible: WayinHeader): Promise<VaultKeyWayinWrapped> {
    return vault_key_wayin_wrapped.parse(await wrapKeyUnder(this.#wayinKey, vaultKey, wayinCtxOf(this.vault.stamp, visible)))
  }

  /** Demand that the gate's current wayin at its slotlabel opens under this proving, keeping nothing: 'wrong_passphrase' or 'wrong_passkey' when it will not.
   * It demands on the proving before and after its one wait, so a gate that moved meanwhile refuses
   * as the demand does, never as a wrong proof.
   *
   * @example await proving.demandOpens()   // a passphrase proven before the passkey goes
   */
  async demandOpens(): Promise<void> {
    demandOn(this.tools, this, this.gating)
    await this.#unwrap(CheckUsage)
  }

  /** A Wayin for `newProving`'s slot: the vaultKey from this proving's wayin, wrapped under `newProving` and bound to its header.
   * The vaultKey is not kept. It demands on this proving before and after its waits, refusing
   * 'gate_moved' for a passphrase another device has since replaced, and on `newProving` after
   * them. It refuses as {@link Proving.demandOpens} does for a proving that does not open its wayin.
   *
   * @example const wayin = await currentProving.resealWayinFor(newProving)
   */
  async resealWayinFor(newProving: PassphraseProving): Promise<PassphraseWayin>
  async resealWayinFor(newProving: PasskeyProving): Promise<PasskeyWayin>
  async resealWayinFor(newProving: Proving): Promise<PassphraseWayin | PasskeyWayin> {
    demandOn(this.tools, this, this.gating)
    const vaultKey = await this.#unwrap(RewrapUsage)
    const wrapped = await newProving.wrappedWith(vaultKey, newProving.header)
    demandOn(this.tools, this, this.gating)
    demandOn(newProving.tools, newProving, newProving.gating)
    const record: unknown = { ...newProving.header, vault_key_wayin_wrapped: wrapped }
    return Wayin.make(this.vault.stamp, record, { keyDeriver: this.tools.keyDeriver })
  }

  /** Grant this device a lease on the vault, by the wayin this proving opens in the gate held, resolving the Lease as stored and held.
   * It seals a lease record over the vaultKey ({@link sealLeaseRecord}) and stores it through the
   * DeviceDB's `putLease`, then makes the Lease of the stored record, here, and has the vault hold
   * it: its expiry armed, the snapshot replaced. No code but this, the Lease and the device store
   * holds the record.
   *
   * It demands on the proving, and on the gate the lease names, with nothing awaited before the
   * store. A lock or a gating's end landing before then refuses ('gating_landed'); one landing
   * after erases the lease behind it, in the device store's order. It demands again after the
   * store, on the proving and on the stored record's `vault_tok` and `gate_epoch`, never asking it
   * for a lease. A refusal there holds nothing.
   *
   * @example const lease = await proving.grantLease()
   */
  async grantLease(): Promise<Lease> {
    const { tools, gating } = this
    demandOn(tools, this, gating)
    const held = tools.vaultRecord()
    const vaultKey = await this.#unwrap(RewrapUsage)
    const record = await sealLeaseRecord(held, vaultKey, { leaseMillis: tools.leaseMillis, now: tools.now() })
    // Nothing is awaited between these demands and the write.
    demandOn(tools, this, gating)
    demandOn(tools, VaultMadeUnder.parse(record), gating)
    const put = await tools.putLease(record)
    // A lock or a decline meanwhile refuses as found, never as the device store's failure.
    demandOn(tools, this, gating)
    demandOn(tools, VaultMadeUnder.parse(put.ok ? put.val : record), gating)
    return tools.holdLease(Lease.make(this.vault, valOf(put)))
  }

  /** Only its slotlabel: all JSON and a log line show of a proving. */
  toJSON(): { slotlabel: WayinKind } {
    return { slotlabel: this.slotlabel }
  }

  /** The refusal of a wayin this proving does not open. */
  protected abstract wrongProof(): VaultError

  /** The wrap of the gate's wayin at this proving's slotlabel, as the vault holds it now; a gate with none there has moved past it. */
  #currentWrap(): VaultKeyWayinWrapped {
    const wayin = this.tools.vaultRecord().gate?.[this.slotlabel] ?? null
    if (wayin === null) { throw gateMovedPast() }
    return wayin.vault_key_wayin_wrapped
  }

  /** Unwrap the vaultKey from the gate's current wayin at this slot, with `usage`: `wrongProof()` when it will not.
   * The wrap is read from the vault record held before the wait, and a demand follows the wait.
   */
  async #unwrap(usage: typeof RewrapUsage | typeof CheckUsage): Promise<CryptoKey> {
    const wrapped = this.#currentWrap()
    let vaultKey: CryptoKey | null
    try {
      vaultKey = await unwrapKeyUnder(this.#wayinKey, wrapped, wayinCtxOf(this.vault.stamp, this.header), usage)
    } catch {
      vaultKey = null
    }
    demandOn(this.tools, this, this.gating)
    if (vaultKey === null) { throw this.wrongProof() }
    return vaultKey
  }
}

/** The proving of a passphrase: the passphraseKey the key deriver makes of it over the header's salt.
 *
 * @example const proving = await PassphraseProving.seal(vault, headerOf(vaultRecord.gate.passphrase), typed, { gating })
 * @example const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, chosen, { gating })   // a fresh header, its salt minted
 */
export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  private constructor(vault: Vault, tools: ProvingTools, gateEpoch: number, header: PassphraseWayinHeader, gating: ProvingGating, wayinKey: CryptoKey) {
    super(vault, tools, gateEpoch, header, gating, wayinKey)
    Object.freeze(this)
  }

  /** The proving `passphrase` makes over `header`: the current passphrase wayin's visible fields, or `{ slotlabel: 'passphrase' }` for a fresh header whose salt it mints.
   * One key derivation, its bytes zeroed once imported. A fresh header names the vault's key
   * deriver, a fresh salt, this device's id, and the time now. Over a current header it refuses,
   * deriving nothing: 'unknown_key_deriver' for another deriver's wayin, 'damaged_wayin' for a salt
   * its deriver never makes, and 'wrong_passphrase' for a blank passphrase. A fresh one checks no
   * strength: {@link Vault.checkStrength} does. It refuses 'bad_option' for a passphrase that is not
   * text, and as {@link passphraseKeyOf} does. It demands on the proving after the derivation.
   *
   * @param opts.gating - The gating it is made for: every vault call passes its own, and a test {@link OutsideGating}.
   *
   * @example await PassphraseProving.seal(vault, headerOf(vaultRecord.gate.passphrase), typed, { gating })
   * @example await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, chosen, { gating })
   */
  static async seal(vault: Vault, header: PassphraseWayinHeader | FreshHeader<'passphrase'>, passphrase: string, opts: { gating: ProvingGating }): Promise<PassphraseProving> {
    const cleartext = passphraseCleartext.parse(passphrase)
    const tools = toolsOf(vault)
    const { gate_epoch: gateEpoch } = tools.vaultRecord()
    const { keyDeriver } = tools
    const sealing = 'slotlabel' in header ? mintedPassphraseHeader(tools) : checkedPassphraseHeader(header, keyDeriver, cleartext)
    const derived = await outcomeOf(() => passphraseKeyOf(keyDeriver, cleartext, fromB64(sealing.salt_b64), tools.logger))
    if (! derived.ok) { demandAfterFailedSeal(tools, { vault_tok: vault.vault_tok, gate_epoch: gateEpoch }, opts.gating) }
    const proving = new PassphraseProving(vault, tools, gateEpoch, sealing, opts.gating, valOf(derived))
    demandOn(tools, proving, opts.gating, { sealing: true })
    return proving
  }

  /** The first gate's wayins for a novel vault: a fresh vaultKey wrapped under this proving's header and, when given, `passkeyProving`'s.
   * Both wraps are made in this one method, so the vaultKey never crosses a method's boundary, and
   * it is not kept. Both provings are fresh. It demands on both provings after its waits.
   *
   * @example const { passphrase, passkey } = await passphraseProving.sealWayins(passkeyProving)
   */
  async sealWayins(passkeyProving?: PasskeyProving): Promise<{ passphrase: PassphraseWayin, passkey: PasskeyWayin | null }> {
    const vaultKey = await makeVaultKey()
    const passphraseWrap = await this.wrappedWith(vaultKey, this.header)
    const passkeyWrap = passkeyProving === undefined ? null : await passkeyProving.wrappedWith(vaultKey, passkeyProving.header)
    demandOn(this.tools, this, this.gating, { sealing: true })
    if (passkeyProving !== undefined) { demandOn(this.tools, passkeyProving, this.gating, { sealing: true }) }
    const { keyDeriver } = this.tools
    return {
      passphrase: Wayin.make(this.vault.stamp, { ...this.header, vault_key_wayin_wrapped: passphraseWrap }, { keyDeriver }),
      passkey:    passkeyProving === undefined || passkeyWrap === null ? null : Wayin.make(this.vault.stamp, { ...passkeyProving.header, vault_key_wayin_wrapped: passkeyWrap }, { keyDeriver }),
    }
  }

  protected wrongProof(): VaultError {
    return new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again. If you're sure it's right, the stored vault may be damaged.")
  }
}

/** The proving of a passkey's answer: the passkeyKey HKDF makes of its PRF bytes, with the header's whole wayin ctx as its `info`.
 *
 * @example const proving = await PasskeyProving.seal(vault, headerOf(vaultRecord.gate.passkey), answer, { gating })
 */
export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  private constructor(vault: Vault, tools: ProvingTools, gateEpoch: number, header: PasskeyWayinHeader, gating: ProvingGating, wayinKey: CryptoKey) {
    super(vault, tools, gateEpoch, header, gating, wayinKey)
    Object.freeze(this)
  }

  /** The proving `answer` makes over `header`: the current passkey wayin's visible fields, or `{ slotlabel: 'passkey' }` for a fresh one over the answer's credential and salt.
   * The answer's PRF bytes are zeroed once imported, whatever happens, so hand in an answer for
   * this one call. It refuses 'bad_option' for what is no passkey's answer, or one already used,
   * and, fresh, for a salt that is not {@link PasskeySaltBytes} bytes; over a current header,
   * 'damaged_wayin' for a salt its kind never makes and 'wrong_passkey' for another credential's
   * answer or one over another salt, deriving nothing. It demands on the proving after the HKDF.
   *
   * @param opts.gating - The gating it is made for: every vault call passes its own, and a test {@link OutsideGating}.
   *
   * @example await PasskeyProving.seal(vault, headerOf(vaultRecord.gate.passkey), await askPasskey(vault.snapshot.gate), { gating })
   * @example await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await createPasskey(opts), { gating })
   */
  static async seal(vault: Vault, header: PasskeyWayinHeader | FreshHeader<'passkey'>, answer: PasskeyAnswer, opts: { gating: ProvingGating }): Promise<PasskeyProving> {
    const checked = passkeyAnswerShape.parse(answer)
    const { prfBytes } = checked
    try {
      const tools = toolsOf(vault)
      const { gate_epoch: gateEpoch } = tools.vaultRecord()
      const sealing = 'slotlabel' in header ? mintedPasskeyHeader(tools, checked) : checkedPasskeyHeader(header, checked)
      const derived = await outcomeOf(() => deriveWrappingKey(prfBytes, wayinCtxOf(vault.stamp, sealing)))
      if (! derived.ok) { demandAfterFailedSeal(tools, { vault_tok: vault.vault_tok, gate_epoch: gateEpoch }, opts.gating) }
      const proving = new PasskeyProving(vault, tools, gateEpoch, sealing, opts.gating, valOf(derived))
      demandOn(tools, proving, opts.gating, { sealing: true })
      return proving
    } finally {
      prfBytes.fill(0)
    }
  }

  protected wrongProof(): VaultError {
    return new VaultError('wrong_passkey', "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with the passphrase; if that works, add the passkey again, which replaces it.")
  }
}

// == [Headers]: freshPasskeyAnswer, mintedPassphraseHeader, checkedPassphraseHeader, mintedPasskeyHeader, checkedPasskeyHeader, gateMovedPast, demandOn, demandAfterFailedSeal, sealLandedError

/** A fresh passphrase header: the vault's key deriver, a fresh salt of its length, this device's id, and the time now, each as `tools` hands it. */
const mintedPassphraseHeader = (tools: ProvingTools): PassphraseWayinHeader => ({
  wayinkind:         'passphrase',
  key_deriver_label: tools.keyDeriver.key_deriver_label,
  salt_b64:          salt_b64.parse(toB64(randomBytes(tools.keyDeriver.salt_bytes))),
  device_id:         tools.deviceId(),
  registered_at:     tools.now(),
})

/** `header`, a current passphrase wayin's, once its deriver is the vault's and its salt one that deriver makes, and the passphrase is not blank. */
const checkedPassphraseHeader = (header: PassphraseWayinHeader, keyDeriver: KeyDeriver, passphrase: PassphraseCleartext): PassphraseWayinHeader => {
  if (header.key_deriver_label !== keyDeriver.key_deriver_label) {
    throw new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')
  }
  if (! isSaltOf(keyDeriver, header.salt_b64)) {
    throw new VaultError('damaged_wayin', "This vault's passphrase is stored damaged, so it could not be tried. If the vault has a passkey, unlock with it to read what it holds; a damaged passphrase can't be replaced, so the vault is then to be removed and made again. The vault was left as it is.")
  }
  if (! passphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces: type the vault's passphrase.") }
  return header
}

/** A new passkey's answer, as `safebyok-react`'s `createPasskey` gives it: a passkey's answer, over a fresh salt of {@link PasskeySaltBytes} bytes as base64url text. Its `parse` refuses 'bad_option', quoting none of it.
 * A passkey wayin sealed over another salt would read as damaged at every later unlock.
 *
 * @example freshPasskeyAnswer.parse(await createPasskey(opts))   // passes
 * @example freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' })   // throws 'bad_option'
 */
export const { freshPasskeyAnswer } = Validator('bad_option', () => ({
  freshPasskeyAnswer: passkeyAnswerShape.refine(({ prf_salt_b64: prfSalt }) => isPrfSalt(prfSalt), { error: Phrases.prfSaltNotFresh(PasskeySaltBytes), path: ['prf_salt_b64'] }),
}))

/** A fresh passkey header: the credential and salt the answer came over, this device's id, and the time now, as `tools` hands them. */
const mintedPasskeyHeader = (tools: ProvingTools, answer: PasskeyAnswer): PasskeyWayinHeader => {
  const { credential_id, prf_salt_b64: prfSalt } = freshPasskeyAnswer.parse(answer)
  return {
    wayinkind:     'passkey',
    credential_id,
    prf_salt_b64:  prf_salt_b64.parse(prfSalt),
    device_id:     tools.deviceId(),
    registered_at: tools.now(),
  }
}

/** `header`, a current passkey wayin's, once its salt is one a passkey wayin holds and the answer is its credential's, over its salt. */
const checkedPasskeyHeader = (header: PasskeyWayinHeader, answer: PasskeyAnswer): PasskeyWayinHeader => {
  if (! isPrfSalt(header.prf_salt_b64)) {
    throw new VaultError('damaged_wayin', "This vault's passkey is stored damaged, so it could not be tried. Unlock with the passphrase, then add the passkey again, which replaces it. The vault was left as it is.")
  }
  if (answer.credential_id !== header.credential_id) {
    throw new VaultError('wrong_passkey', "That passkey is not this vault's: it may have been replaced or removed on another device, or belong to another vault. Ask the credential the snapshot's passkey names.")
  }
  if (answer.prf_salt_b64 !== header.prf_salt_b64) {
    throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's passkey names.")
  }
  return header
}

/** The refusal of a proving whose slot the gate no longer fills. */
const gateMovedPast = () => new VaultError('gate_moved', "A vault unlocker changed while this call was under way -- the passphrase or passkey was changed, here or on another device -- so nothing more was done. Unlock again to carry on.")

/** The vault's demand on `thing`, through `tools`: a refusal logged as `gating`'s call, or as `demandConsistentWith`'s for a proving made outside any gating.
 * While `sealing`, before any gate is written to carry the proving, a thing made on a vault with
 * no gate is for the first: a gate in the vault record held then was made elsewhere
 * ('gate_made_elsewhere').
 */
const demandOn = (tools: VaultPrivateTools, thing: VaultMadeUnder, gating: ProvingGating, opts?: { sealing: boolean }): void => {
  tools.demand(thing, gating.call ?? 'demandConsistentWith', { firstGate: opts?.sealing === true && thing.gate_epoch === 0 })
}

/** The demand after a seal's derivation failed, with no proving yet to demand on: the vault on `sealedUnder`, its `vault_tok` and the `gate_epoch` the seal began under, and `gating` not landed ('gating_landed').
 * A seal begun on a vault with no gate was for the first: a gate in the vault record held now was
 * made elsewhere ('gate_made_elsewhere').
 */
const demandAfterFailedSeal = (tools: VaultPrivateTools, sealedUnder: Pick<VaultSparse, 'vault_tok' | 'gate_epoch'>, gating: ProvingGating) => {
  demandOn(tools, sealedUnder, gating, { sealing: true })
  if (gating.landed) { throw sealLandedError() }
}

/** The refusal of a seal whose gating landed while it derived. */
const sealLandedError = () => new VaultError('gating_landed', 'The prompt ended while this vault unlocker was being worked through -- a lock landed, or it was answered or declined -- and its end wins: nothing was unlocked or changed. Ask again when the user wants the vault.')
// --

// == [Key bytes]: notKeyBytes, deriverThrewRefusal, isSharedMemory, isAllZero, passphraseKeyOf

/** The refusal for a key deriver's result that is not 32 bytes of a view. */
const notKeyBytes = () => new VaultError('bad_option', 'keyDeriver handed back something other than 32 key bytes: a passphraseKey is a 256-bit key.')

/** The refusal in place of what a key deriver threw, through `Sanitizer.refusalFor`, carrying nothing of it: a throw may quote the passphrase.
 * A condition-family VaultError keeps its kind, for the caller to show or retry, in safebyok's
 * words. Anything else refuses 'unexpected_error', and `logger` hears that the deriver threw, and
 * the refusalkind of a VaultError it threw, as {@link listedKindOf} tells it: the one thing read
 * of the throw, a kind from safebyok's own list.
 */
const deriverThrewRefusal = (thrown: unknown, logger: VaultLogger): VaultError => {
  const refusalkind = listedKindOf(thrown)
  if (refusalkind !== null && RefusalFamilyForKind[refusalkind] === 'condition') {
    return Sanitizer.refusalFor(thrown, refusalkind, `The key deriver could not make a key of this passphrase, and refused it as '${refusalkind}'. What it said is left out of this report, as it heard the passphrase.`)
  }
  logger.error("The keyDeriver handed to Bank.make threw rather than deriving a key, so the call that asked was refused. What it threw is left out, as the deriver hears the passphrase.", { call: 'deriveKeyBytes', refusalkind })
  return Sanitizer.refusalFor(thrown, 'unexpected_error', "The keyDeriver handed to Bank.make threw rather than deriving a key, so this call was not answered. What it threw is left out of this report, as the deriver hears the passphrase; the log says the refusalkind of a VaultError it threw. Look there first, then at the deriver and how it is set up.")
}

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
 * deriverThrewRefusal} says, through `logger`.
 *
 * @example const wayinKey = await passphraseKeyOf(keyDeriver, passphraseCleartext.parse(typed), saltBytes, logger)
 */
export const passphraseKeyOf = async (keyDeriver: KeyDeriver, passphrase: PassphraseCleartext, saltBytes: Uint8Array, logger: VaultLogger): Promise<CryptoKey> => {
  let handed: unknown
  try {
    handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch (err) {
    throw deriverThrewRefusal(err, logger)
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
