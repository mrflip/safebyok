import type * as Z from 'zod'
import { BoxDamaged, BoxFormat, BoxRecord, type BoxSparse, boxSparseOf } from './box'
import { Capacity, type VaultScope } from './types/types'
import { VaultRecord, VaultSparse, VaultTombstone, VaultDraft } from './vault-record'
import { VaultError, isVaultError, type RefusalMeta } from './errors'
import * as Names from './names'
import * as CX from './checks/core-checks'
import { Validator } from './checks/validator'
import * as Refusals from './refusals'
import { isTombstone } from './expectations'
import { asError, parseLogger, type VaultLogger } from './logger'
import { reportToPlatform } from './report-error'
import { type Outcome, isOutcomeShaped, outcomeOf, unexpectedError } from './outcome'

// == [Expectations and records]: VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion, StoredBox, VaultReadResponse

/** What an update of the vault record was proven against: the vault, and the `gate_epoch` the writer read.
 * The update lands only while the standing vault record still has both. A `gate_epoch` of 0 is a
 * novel vault's record, which the vault's first gate is written over.
 *
 * @example { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch }
 */
export type VaultRecordExpectation = Z.infer<typeof VaultRecordExpectation>

/** The vault a box read means to read in: it finds the box only while the standing vault record has this `vault_tok`.
 * Otherwise it refuses `vault_mismatch`, reading nothing more: none stand, a tombstone stands, or
 * the vault was deleted and made anew under another `vault_tok`. So a box from another life of the
 * scope is never handed to a reader holding the key of this one.
 *
 * @example { vault_tok: vaultRecord.vault_tok }
 */
export type BoxGetExpectation = Z.infer<typeof BoxGetExpectation>

/** What a box write was sealed for and read: the vault, and the revision the writer read.
 * The write lands only while the standing vault record has this `vault_tok` (else
 * `vault_mismatch`). It also needs the standing box at this `revision_tok`, or no box at all for
 * null (else `stale_write`).
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: prev?.revision_tok ?? null }
 */
export type BoxExpectation = Z.infer<typeof BoxExpectation>

/** The vault a deletion means to remove whole: it lands only while the standing vault record has this `vault_tok` and `gate_epoch`.
 * So a delete proven against a gate another device has since changed refuses as stale: an old
 * passphrase in a stale tab cannot delete the vault. A `gate_epoch` of null means "check the
 * `vault_tok` alone": it is for `delDamagedVault`, whose vault record fails its checks and shows
 * no `gate_epoch` to name.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export type VaultDelExpectation = Z.infer<typeof VaultDelExpectation>

/** What a box deletion was aimed at: the vault, and the `revision_tok` the deleter read.
 * The `revision_tok` is null for a box listed as damaged with no revision a read could take.
 * The deletion lands only while the standing vault record has this `vault_tok`. It then removes
 * whatever box stands under the boxlabel: within the right vault, a deletion wins over any write.
 * The revision decides only what the {@link BoxDeletion} reports.
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok }
 */
export type BoxDelExpectation = Z.infer<typeof BoxDelExpectation>

/** What a box deletion that landed found under its boxlabel, from the same atomic step as the removal.
 *
 * * `deleted`: the revision its {@link BoxDelExpectation} named (for null, a record holding none a
 *   read could take).
 * * `deleted_other`: any other record (written over meanwhile, say), removed all the same.
 * * `absent`: nothing to remove.
 *
 * @example { outcome: 'deleted_other' }
 */
export type BoxDeletion = Z.infer<typeof BoxDeletion>

/** The checks for each expectation a verb is handed, each sliced from the vault record, and for the {@link BoxDeletion} a box deletion answers. Each refuses 'bad_record', which a verb re-throws as its own refusal.
 * An expectation names what it compares and drops the rest, so a whole record handed as one is
 * read for those fields alone.
 */
export const { VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion } = Validator('bad_record', ({ obj, uint, oneof }) => {
  const VaultRecordExpectation = VaultSparse.pick({ vault_tok: true, gate_epoch: true }).strip()
  const BoxGetExpectation = VaultSparse.pick({ vault_tok: true }).strip()
  const revision_tok = BoxRecord.shape.revision_tok.nullable()
  return {
    VaultRecordExpectation,
    BoxGetExpectation,
    BoxExpectation:        BoxGetExpectation.extend({ revision_tok }),
    VaultDelExpectation:   VaultRecordExpectation.extend({ gate_epoch: uint.nullable() }),
    BoxDelExpectation:     BoxGetExpectation.extend({ revision_tok }),
    BoxDeletion:           obj({ outcome: oneof(['deleted', 'deleted_other', 'absent']) }),
  }
})

/** One box row as a VaultDB's `doGetVault` and `doEnsureVault` read it, as {@link splitStoredBoxes} takes it: the boxlabel the row is filed under, and its record exactly as stored.
 * Take `boxlabel` from the row's scopepath or column, never from its record: a damaged box is
 * still named by it, and so deleted or written over. Hand `box` up as read, whole or without its
 * two ciphered fields, with no cast: it is typed `unknown`, as it may be damaged, and the split
 * judges it.
 *
 * @example { boxlabel: Scopepath.boxscope(scopepath).boxlabel, box: storedRow }
 */
export type StoredBox = { boxlabel: string, box: unknown }

/** One vault as a VaultDB's `doGetVault` and `doEnsureVault` answer it, read in one atomic step: its vault record exactly as stored, and its boxes split into the sound and the damaged.
 * `vault` is what storage holds in the vault record's place, exactly as read: a vault record, one
 * damaged, a tombstone (where a store keeps one there), or null for none. So it is typed `unknown`,
 * and an adapter hands its row up with no cast. `boxes` and `damagedBoxes` are what
 * {@link splitStoredBoxes} makes of the box rows, or what a server's `getVaultRecords` relays. The
 * base class checks all of it again: the vault record as a read of it, each sound box as the split
 * judges one, and each damaged box's boxlabel, revision and damage, taking its word that the box
 * is damaged. The adapter's types keep out nothing: the checks do.
 *
 * @example { vault: storedRow ?? null, ...splitStoredBoxes(boxRows) }
 */
export type VaultReadResponse = {
  vault:        unknown
  boxes:        readonly BoxSparse[]
  damagedBoxes: readonly BoxDamaged[]
}
// --

// == [Options]: VaultDBOpts

/** What an adapter's factory takes from the host beside its backend's own options, and hands to `super()`.
 *
 * @example
 *   export type AcmeVaultDBOpts = VaultDBOpts & { client: AcmeClient }
 * @example
 *   constructor(opts: AcmeVaultDBOpts) { super(opts); this.client = opts.client }
 */
export type VaultDBOpts = {
  /** Where the VaultDB says what it has nobody to throw to: a listener that threw, a watch that failed or dropped.
   * Fixed when the VaultDB is made. A vault made with no `logger` of its own uses this one, so give
   * it here to have one logger hear both. The vault's own `logger` never reaches the VaultDB. Left
   * out or null, the default logger.
   */
  logger?: VaultLogger | null | undefined
}

// --

/** Remote storage for vault records: extend it, and implement its `do*` methods against your backend.
 * You are a shelf, not a safe. The package's `VAULTDB.md` is the whole contract, line by line, and
 * `describeVaultDB` (from `safebyok/testing`) tests an adapter against it.
 *
 *  * **Store what you are handed, return what you stored.** Every record and expectation is plain
 *    JSON (binary fields are base64url text), so any backend that holds JSON holds a vault as-is.
 *  * **Never look inside.** Every secret field arrives encrypted, and nothing you hold opens a
 *    vault. You compare only a few unencrypted fields (`vault_tok`, `gate_epoch`, `revision_tok`)
 *    before a write.
 *  * **Write only as expected.** Each update and deletion carries an expectation of what stands in
 *    storage. Check it and write in one atomic step (a transaction, a conditional write). Each
 *    `do*` method says what it answers when the expectation fails.
 *  * **Enforce who may reach which rows.** safebyok's encryption protects the contents; your
 *    authorization decides who may fetch or overwrite them at all. When no one is signed in, or
 *    someone other than the scope's `user_id` is, refuse 'identity_revoked'. The vault locks
 *    itself on it, so never say it for a passing fault, which is 'storage_unavailable'. When the
 *    scope's own user may not make this call, refuse 'not_permitted', which locks nothing.
 *  * **Don't repair.** Return a record exactly as stored, or null when there is none. A damaged
 *    record is safebyok's to refuse, never yours to fix or quietly drop.
 *  * **Refuse with what {@link Refusals} makes.** A `do*` method that hands its call on to another
 *    VaultDB's verb returns that verb's `val` and throws its `err`, as `valOf` does.
 *
 * Hand `super()` the host's {@link VaultDBOpts}. Never override the public verbs, but
 * `delDamagedVault` in an adapter that hands each call on to another VaultDB. A server hands a
 * browser's VaultDB what `getVaultRecords` and `ensureVaultRecords` resolve.
 *
 * For every public verb:
 *
 *  * It resolves an {@link Outcome} and never rejects. {@link VaultDB.subscribe} alone throws.
 *  * Each name handed to it, the scope's three and a boxlabel, is held to its check (`label`, or
 *    `user_id`) and to {@link VaultDB.maxNameBytes} before your `do*` method sees it: 'bad_scope'
 *    otherwise. A name inside a record that fails its check refuses as that record does.
 *  * Who is at fault names a record that fails its checks. One a caller hands in that this
 *    package would not build refuses 'bad_record' before storage sees it (a box handed to
 *    `putBox`, 'invalid_box'). One read from storage that fails is damaged: 'damaged_vault' for
 *    a vault record, 'damaged_box' for a box (a listing shows it among its `damagedBoxes` instead), Zod's
 *    own error its `cause`. An answer your `do*` method owes in the protocol's shape that comes in
 *    another -- a box write's echo, a stale or full refusal missing what it must carry, a deletion's
 *    report, a capacity -- refuses 'corrupt_record': a bug in the adapter.
 *  * A VaultError your `do*` method throws passes through as it came. Anything else it throws
 *    refuses 'storage_unavailable', with what it threw as `cause`.
 *  * A `do*` method that answers with an Outcome, where it owes the bare answer, refuses 'bad_option'.
 *  * A throw from the base's own code that is no VaultError is a bug: 'unexpected_error', never to
 *    be retried.
 */
export abstract class VaultDB {
  // == [Backend limits]: maxRecordBytes, maxVaultBytes, maxBoxes, maxNameBytes

  /** The most bytes this backend holds in one record, or `Infinity` for no per-record limit.
   * `Bank.make` refuses a `maxWhisperBytes` over half of it. {@link VaultDB.putBox} refuses as
   * `box_too_large` a box whose JSON, with its scope, weighs more in UTF-8 bytes. A large sidecar or
   * long names can make a box so even within `maxWhisperBytes`.
   */
  abstract readonly maxRecordBytes: number

  /** The most bytes this backend holds of one vault, every box together, as stored; or `Infinity` for no such limit.
   * Declare what the backend can still list and delete whole. A backend that reads a vault in one
   * transaction under a read budget declares the share of it its heaviest verb leaves.
   *
   * `Bank.make` refuses ('bad_option') a `maxBoxes` whose boxes might not fit, each counted at
   * twice `maxWhisperBytes` plus 1 KiB. The vault's `putBox()` refuses as `vault_full` a new box
   * that might take the vault past it. It counts each box at twice `maxWhisperBytes`, plus its
   * scope and boxlabel as UTF-8 JSON, plus a little for fixed-size fields. That is a conservative
   * estimate made before sealing, so at a limit declared exactly tight it may refuse a box that
   * would just fit.
   *
   * A backend that enforces a limit of its own sets it above what this admits, and refuses a box
   * write past it as `vault_full`. A backend that breaks the limit it declares, or a vault opened
   * with limits that disagree with its backend's, is undefined behaviour: we promise no outcome.
   */
  abstract readonly maxVaultBytes: number

  /** The most boxes this backend holds in one vault, a whole number, or `Infinity` for no such limit.
   * A backend whose limit crosses a wire or is stored, where `Infinity` cannot go, sets a large
   * whole number instead. `Bank.make` refuses ('bad_option') a `maxBoxes` above it, and given none
   * takes the smaller of this and `MaxBoxes`.
   *
   * A backend with a finite limit refuses a new box in a full vault as `vault_full`, writing
   * nothing. It holds on a best effort: writes one after another never pass it, while writers
   * racing for the last places may take a vault a few past (`VAULTDB.md`, lines 4.1 to 4.6). A box
   * that replaces one already there is never refused for the count.
   */
  abstract readonly maxBoxes: number

  /** The most UTF-8 bytes this backend holds in one name, or `Infinity` for any name the checks admit (a user_id's 100 at most).
   * Declare what the backend's keys and indexes hold. A store whose key holds every name of a box
   * together declares its share of the key's limit.
   */
  abstract readonly maxNameBytes: number
  // --

  // == [Constructor and logger]: #logger, constructor, logger

  /** The guarded logger this VaultDB was made with. */
  readonly #logger: VaultLogger

  /** Settle the host's `logger` once, guarded, or the default logger when `opts` gives none.
   * Throws 'bad_option' for a `logger` that is not a VaultLogger. The base reads nothing else of
   * `opts`.
   */
  constructor(opts: VaultDBOpts) {
    // Generous to a subclass written in JavaScript that hands super() nothing.
    this.#logger = parseLogger((opts as VaultDBOpts | null | undefined)?.logger)
  }

  /** The guarded logger this VaultDB was made with: one that throws breaks nothing.
   * It is no own field, so a VaultDB logged, spread or compared never shows or copies the host's
   * logger. `Bank.make` and `BankProvider` use it when given no logger of their own.
   */
  get logger(): VaultLogger { return this.#logger }

  // --

  // == [Vault verbs]: getVault, ensureVault, getVaultRecords, ensureVaultRecords, putVaultRecord, readVault, ensuredVault

  // ------------------------------------------------------------------- the verbs safebyok calls

  /** The scope's vault record and box listing, read in one atomic step, or null when no vault stands.
   * The vault comes back as its record, with `boxes` and `damagedBoxes` beside its fields: each
   * sound box's {@link BoxSparse}, without ciphertext, and each box whose record does not read back
   * as a {@link BoxDamaged}, never among the sound. Each list is sorted by boxlabel, and all of it
   * is frozen. A row stored under a name that is not a label is left out, as no verb could reach
   * it. No write lands between the reads, so the record and the boxes agree as they are handed
   * back. Nothing compares them, here or in the vault. A scope holding only a tombstone, the mark of
   * a vault deleted, has no vault. A vault record it cannot use refuses 'damaged_vault', or
   * 'newer_format' for a format a later version may write.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.getVault(scope)
   *   if (ok && val === null) { offerNewVault() }
   */
  getVault(scope: VaultScope): Promise<Outcome<(VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }) | null>> {
    return answering(() => this.readVault(scope))
  }

  /** The vault of `draft`'s scope, as {@link VaultDB.getVault} reads it, created first from `draft` when no vault stands.
   * The look, the create and the read are one atomic step, so two devices ensuring one new scope
   * settle on one vault, and both get it back. Compare its `vault_tok` with the draft's to tell
   * whether this call made it. A vault record already standing comes back untouched, gated or not.
   * Over a tombstone it starts a new life: the draft's `vault_tok`, and `vault_epoch` carried on
   * from the vault deleted, so the counter never goes back.
   *
   * Refuses 'bad_record', before storage sees it, for a draft that is not a novel vault's record
   * (`gate_epoch` 0, `gate` null) with `vault_epoch` 0: the store decides the counter.
   *
   * @example
   *   const { ok, val } = await vaultDB.ensureVault(draft)
   *   if (ok && val.vault_tok === draft.vault_tok) { greetNewVault() }   // this call made it
   */
  ensureVault(draft: VaultDraft): Promise<Outcome<VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }>> {
    return answering(() => this.ensuredVault(draft))
  }

  /** The scope's vault, as {@link VaultDB.getVault} reads and checks it: what a server relays to a browser's VaultDB, as its `doGetVault` answers.
   * The vault record and each box come checked and split, so the browser's VaultDB passes them
   * through to its own base class, which checks them again: it takes no server's word for a sound
   * box, and parses its word on a damaged one.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.getVaultRecords(scope)
   *   if (! ok) { throw err }
   *   if (val === null) { return null }
   *   const { boxes, damagedBoxes, ...vault } = val
   *   return { vault, boxes, damagedBoxes }   // what a server sends a browser's VaultDB
   */
  getVaultRecords(scope: VaultScope): Promise<Outcome<(VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }) | null>> {
    return answering(() => this.readVault(scope))
  }

  /** The vault as {@link VaultDB.ensureVault} ensures it: what a server relays to a browser's VaultDB, as its `doEnsureVault` answers. */
  ensureVaultRecords(draft: VaultDraft): Promise<Outcome<VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }>> {
    return answering(() => this.ensuredVault(draft))
  }

  /** Replace the vault record with `vaultRecord`, only while the standing one has the `vault_tok` and `gate_epoch` in `expected`, resolving the vault record as stored.
   * The record and its gate are written in this one step. The store moves `vault_epoch` up by one
   * in the same step, whatever value `vaultRecord` carries, so what is resolved is the vault as it
   * now stands. Otherwise it refuses `stale_write` and writes nothing, as it does when no vault
   * record stands, or only a tombstone does. `err.meta.vault_stored` then holds what stands,
   * from the same atomic step, checked as {@link VaultDB.getVault} checks it, or null for none; a
   * vault record standing that fails that check refuses as a read of it does. A vault's
   * `vault_tok` never changes, so `vaultRecord` must carry the one in `expected`: 'bad_record'
   * otherwise. A vault's first gate is such an update, written over its novel record expecting
   * `gate_epoch` 0.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.putVaultRecord(next, { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch })
   *   if (! ok && err.refusalkind === 'stale_write') { return err.meta?.vault_stored }   // what won
   */
  putVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<Outcome<VaultRecord>> {
    return answering(async () => {
      const outgoing = checkOutgoing(VaultRecord, vaultRecord, 'vault record')
      const asked = heldScope(this, outgoing)
      const expectation = checkOutgoing(VaultRecordExpectation, expected, 'vault record expectation')
      if (outgoing.vault_tok !== expectation.vault_tok) {
        throw new VaultError('bad_record', "putVaultRecord replaces a vault's record within that vault: the vault record's vault_tok must be the expected one, as a vault_tok never changes.")
      }
      const raw = await withStaleVaultRecordChecked(adapterAnswer('doPutVaultRecord', () => this.doPutVaultRecord(outgoing, expectation)), asked)
      return checkWrittenVaultRecord(raw, outgoing, asked)
    })
  }

  /** The vault `doGetVault` reads for `scope`, its vault record and listing checked, frozen; or null for none. */
  private async readVault(scope: VaultScope): Promise<(VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }) | null> {
    const asked = heldScope(this, scope)
    const read = await adapterAnswer('doGetVault', () => this.doGetVault(asked))
    const raw = checkAnswer(ReadAnswer, read, 'a vault read').vault
    if (raw === null || raw === undefined || isTombstone(raw)) { return null }
    return Object.freeze({ ...checkVaultRecord(raw, asked), ...checkedListing(read) })
  }

  /** The vault `doEnsureVault` ensures from `draft`, once the draft is checked, as {@link VaultDB.getVault} hands one back. */
  private async ensuredVault(draft: VaultDraft): Promise<VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }> {
    const outgoing = checkDraft(draft)
    const asked = heldScope(this, outgoing)
    const read = await adapterAnswer('doEnsureVault', () => this.doEnsureVault(outgoing))
    const raw = checkAnswer(ReadAnswer, read, 'a vault read').vault
    return Object.freeze({ ...checkVaultRecord(raw, asked), ...checkedListing(read) })
  }
  // --

  // == [Box verbs]: getBox, putBox

  /** The box under `boxlabel`, validated, or null when there is none, read only while the standing vault record has `expected`'s `vault_tok`.
   * The vault record and the box are read in one atomic step. Refuses `vault_mismatch`, reading
   * nothing more, when the standing vault record is another vault's, or none stands (the vault
   * deleted, or deleted and made anew): what the reader holds a key for is gone. A box that fails
   * its checks refuses as `damaged_box`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.getBox(scope, 'anthropic', { vault_tok: vaultRecord.vault_tok })
   *   if (! ok && err.refusalkind === 'vault_mismatch') { await reopen() }   // the vault was remade
   */
  getBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<Outcome<BoxRecord | null>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const label = heldBoxlabel(this, asked, boxlabel)
      const expectation = checkOutgoing(BoxGetExpectation, expected, 'box read expectation', 'read')
      const raw = await adapterAnswer('doGetBox', () => this.doGetBox(asked, label, expectation))
      if (raw === null || raw === undefined) { return null }
      return checkStoredBox(raw, label)
    })
  }

  /** Write `box` under its boxlabel in one atomic conditional write, resolving the box as storage now holds it.
   * The write lands only while the standing vault record has the `vault_tok` in `expected`, and the
   * standing box its `revision_tok` (for null, while no box stands). The box resolved comes from
   * that same atomic step, checked as {@link VaultDB.getBox} checks one, at the revision written.
   * One that fails is the adapter's wrong answer, `corrupt_record`, though the write may have landed.
   *
   * Refuses, writing nothing:
   *
   * * `vault_mismatch` when the standing vault record is not the one `expected` names, or none
   *   stands. It carries nothing of them.
   * * `stale_write` when the standing box is not the one `expected` names. `err.meta.box_stored`
   *   holds what stands, from the same atomic step: the box that won, checked as `getBox` checks
   *   one; a `BoxDamaged` (naming the revision it holds, if any); or null for none. Write over it
   *   naming that revision, or null. A damaged box that names no revision can only be removed,
   *   with {@link VaultDB.delBox}.
   * * `vault_full` from the backend's own limit, with how full the vault is in
   *   `err.meta.capacity`, a {@link Capacity}.
   * * `box_too_large` for a box whose JSON, with its scope, weighs more than
   *   {@link VaultDB.maxRecordBytes}, before storage sees it.
   * * `invalid_box`, before storage sees it, for a box this package would not build.
   *
   * A write sent again after it landed, a retry after a lost answer say, refuses as `stale_write`,
   * its own box in `err.meta.box_stored`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.putBox(scope, { vault_tok, revision_tok: null }, box)
   *   if (! ok && err.refusalkind === 'stale_write') { return err.meta?.box_stored }  // what won
   */
  putBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<Outcome<BoxRecord>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const outgoing = checked(BoxRecord, box, invalidBox)
      heldBoxlabel(this, asked, outgoing.boxlabel)
      const expectation = checkOutgoing(BoxExpectation, expected, 'box expectation')
      const recordBytes = jsonBytes({ ...asked, ...outgoing })
      if (recordBytes > this.maxRecordBytes) {
        throw new VaultError('box_too_large', `That box weighs ${String(recordBytes)} bytes, over the ${String(this.maxRecordBytes)} its storage holds in one record, so nothing was written: store a smaller whisper or sidecar, or under a shorter boxlabel.`)
      }
      const stored = await withMissChecked(adapterAnswer('doPutBox', () => this.doPutBox(asked, expectation, outgoing)), outgoing.boxlabel)
      return checkWrittenBox(stored, outgoing)
    })
  }
  // --

  // == [Capacity]: getCapacity

  /** How full the vault is, as storage reckons it in one step: its boxes and their bytes, each against storage's most.
   * An estimate, for a host to warn its user before a write is refused: storage checks again on
   * every write. Bytes are counted as the backend counts them, which need not match the vault's own
   * `capacity`; each adapter's README says how. A limit the backend does not keep reads as
   * `Number.MAX_SAFE_INTEGER`. A scope holding no vault answers nothing used. An answer that is no
   * {@link Capacity} refuses as `corrupt_record`.
   *
   * @example
   *   const { ok, val } = await vaultDB.getCapacity(scope)
   *   if (ok && val.boxes.used >= val.boxes.max) { warnFull() }
   */
  getCapacity(scope: VaultScope): Promise<Outcome<Capacity>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const raw = await adapterAnswer('doGetCapacity', () => this.doGetCapacity(asked))
      return checkAnswer(Capacity, raw, 'a capacity reading')
    })
  }
  // --

  // == [Delete verbs]: delBox, delVault, delDamagedVault, deletedVault

  /** Remove the box under `boxlabel`, whatever revision stands, only while the standing vault record has `expected`'s `vault_tok`.
   * Otherwise it refuses `stale_write` and removes nothing, as it does when no vault record stands.
   * Resolves the {@link BoxDeletion} that the removal's own atomic step reports. One in another
   * shape refuses as `corrupt_record`, though the deletion may have landed. Deleted is gone:
   * nothing of the record is kept, and a `putBox` expecting the revision removed refuses
   * `stale_write`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.delBox(scope, 'anthropic', { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok })
   *   if (ok && val.outcome === 'deleted_other') { await refresh() }   // someone wrote over it first
   */
  delBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<Outcome<BoxDeletion>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const label = heldBoxlabel(this, asked, boxlabel)
      const expectation = checkOutgoing(BoxDelExpectation, expected, 'delete expectation', 'removed')
      const deletion = await adapterAnswer('doDelBox', () => this.doDelBox(asked, label, expectation))
      if (deletion === null) { throw Refusals.staleWrite('del') }
      return checkAnswer(BoxDeletion, deletion, 'a deletion', 'landed')
    })
  }

  /** Remove the vault record and every box, only while the standing vault record has `expected`'s `vault_tok` and `gate_epoch`, leaving a tombstone, which it resolves.
   * This is the backend's part of deleting a vault. The {@link VaultTombstone} holds the scope and
   * `vault_epoch` moved up by one; the next
   * {@link VaultDB.ensureVault} of the scope carries that counter into a new life. A deletion
   * proven against a gate another device has since changed refuses, so a stale tab's old
   * passphrase cannot delete the vault. Otherwise it refuses `stale_write` and removes nothing, as
   * it does when no vault stands, or one made anew does. Sent again after it landed, a retry
   * after a lost answer say, it refuses as stale too: a tombstone holds no `vault_tok` for an
   * expectation to name, and the vault is gone all the same.
   *
   * @example
   *   const { ok, val } = await vaultDB.delVault(scope, { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch })
   *   if (ok) { rememberEpoch(val.vault_epoch) }
   */
  delVault(scope: VaultScope, expected: VaultDelExpectation): Promise<Outcome<VaultTombstone>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const expectation = checkOutgoing(VaultDelExpectation, expected, 'delete expectation', 'removed')
      return await this.deletedVault(asked, expectation)
    })
  }

  /** The tombstone `doDelVault` leaves for `scope` under `expectation`, checked: `stale_write` when it removed nothing. */
  private async deletedVault(scope: VaultScope, expectation: VaultDelExpectation): Promise<VaultTombstone> {
    const raw = await adapterAnswer('doDelVault', () => this.doDelVault(scope, expectation))
    if (raw === null || raw === undefined) { throw Refusals.staleWrite('del') }
    const tombstone = checkAnswer(VaultTombstone, raw, 'a vault deletion', 'landed')
    if (! Names.sameScope(tombstone, scope)) { throw wrongAnswer('a vault deletion', 'landed') }
    return tombstone
  }

  /** Remove a vault whose stored vault record fails its checks, and no other: the escape hatch behind the package's `delDamagedVault`.
   * That is the vault `getVault` and `hello()` refuse as `damaged_vault`, which no Vault
   * object opens to `del()`. It takes the `vault_tok` from the stored vault record, and removes as
   * {@link VaultDB.delVault} does under it, handing the adapter `gate_epoch: null`, "check the
   * `vault_tok` alone": the record fails its checks and shows no `gate_epoch` to name. A vault
   * record rewritten under that `vault_tok` meanwhile is the same vault, and goes with it
   * (`VAULTDB.md`, line 3.5). Resolves the tombstone it leaves, or null when the scope holds no
   * vault record.
   *
   * Refuses, removing nothing:
   *
   * * 'bad_option' when the vault record is sound: delete that vault through its own `del()`.
   * * 'damaged_vault' when the record is too damaged to say which vault it is: only the backend's
   *   own tools clear it.
   * * 'newer_format' when a newer safebyok may have written it, in a `format` this one does not
   *   know. A device on the newer version opens it.
   * * 'stale_write' when the vault was replaced meanwhile.
   *
   * An adapter that hands each call on to another VaultDB's public verbs must hand this one on
   * too: its `doGetVault` meets the inner refusal, never the record, so this refuses
   * 'damaged_vault'. So does a backend whose server validates what it reads, as
   * `safebyok-graphql`'s does: there a damaged record is the backend's own to clear.
   */
  delDamagedVault(scope: VaultScope): Promise<Outcome<VaultTombstone | null>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const read = await readStoredVault(() => adapterAnswer('doGetVault', () => this.doGetVault(asked)))
      const raw = checkAnswer(ReadAnswer, read, 'a vault read').vault
      if (raw === null || raw === undefined || isTombstone(raw)) { return null }
      if (mayBeNewer(raw)) { throw newerVaultRecord() }
      if (isSoundVaultRecord(raw, asked)) {
        throw new VaultError('bad_option', "That vault's stored record is sound, so it is not deleted here: a vault that opens is deleted through its Vault object's del(). Only a vault whose hello() refuses it as damaged_vault is deleted this way.")
      }
      const named = StoredVaultTok.safeParse(raw)
      if (! named.success) { throw unnamedVaultRecord() }
      return await this.deletedVault(asked, { vault_tok: named.data.vault_tok, gate_epoch: null })
    })
  }
  // --

  // == [Watching]: subscribe, listenerFailed, watchTrouble

  /** Call `onChange` after any write touching `scope`, from this device or another, returning the unsubscribe.
   * The one verb that throws rather than resolving an Outcome, since it answers at once. A backend
   * without push never calls `onChange`: the vault refreshes after its own writes, so it misses
   * only other devices' writes.
   *
   * Nothing `onChange` throws or rejects with reaches the adapter or the write that rang it. It is
   * logged as an error and handed to the platform's `reportError` where there is one, and every
   * other listener is still called. Once unsubscribed, `onChange` is never called again. A second
   * unsubscribe does nothing; one the adapter's own unsubscribe throws from is logged, never
   * thrown. Throws 'bad_option' for an `onChange` that is no function.
   */
  subscribe(scope: VaultScope, onChange: () => void): () => void {
    const asked = heldScope(this, scope)
    checkListener(onChange)
    let live = true
    const unsubscribe = startedWatch(() => this.doSubscribe(asked, () => {
      if (live) { heedListener(onChange, (err) => { this.listenerFailed(err) }) }
    }))
    return () => {
      if (! live) { return }
      live = false
      try {
        unsubscribe()
      } catch (err) {
        this.logger.error("The storage adapter's unsubscribe threw, so its watch of the vault may not have ended. Nothing else is affected; the adapter is its author's to mend.", { call: 'subscribe' }, asError(err))
      }
    }
  }

  /** Log a listener's failure, and report it to the platform where it reports errors. */
  private listenerFailed(err: unknown): void {
    this.logger.error("A listener passed to subscribe threw, or returned a promise that rejected. The write it heard of stands, and every other listener was called; the listener is the host's to mend.", { call: 'subscribe' }, asError(err))
    reportToPlatform(err)
  }

  /** A {@link WatchTrouble} for one watch, warning through this VaultDB's logger once per failing streak.
   * For a `doSubscribe` whose backend tells it when its watch fails to start or drops. Neither of
   * its calls rings `onChange`: ring it yourself on failure too, so the vault reads again and meets
   * the trouble (`VAULTDB.md`, line 6.2).
   *
   * @param message - What failed and what it costs, calmly, naming no scope or record.
   *
   * @example
   *   const trouble = this.watchTrouble("This vault's live watch failed: other devices' changes may not show until its next read.")
   *   return client.watch(args, () => { trouble.delivered(); onChange() }, (err) => { trouble.failed(err); onChange() })
   */
  protected watchTrouble(message: string): WatchTrouble {
    let warned = false
    return {
      failed: (err) => {
        if (warned) { return }
        warned = true
        this.logger.warn(message, { call: 'subscribe' }, asError(err))
      },
      delivered: () => { warned = false },
    }
  }
  // --

  // == [The half you write]: doGetVault, doEnsureVault, doPutVaultRecord, doDelVault, doSubscribe, others

  // --------------------------------------------------------------------------- the half you write

  /** The scope's vault record exactly as stored, and every box of it split by {@link splitStoredBoxes}, read in one atomic step: one statement, query or transaction.
   * `vault` is the vault record, null when none stands. A store that keeps a tombstone in the vault
   * record's place (one row to a scope) may hand it up as `vault`: the base class reads it as none.
   * Hand each box row to `splitStoredBoxes` as a {@link StoredBox}, the boxlabel it is filed under
   * beside its record exactly as stored, whole, or without `box_key_wrapped` and
   * `whisper_ciphered` where the backend can project; a record that looks damaged goes in as it is,
   * for the split to judge. No write may land between the reads: that is the whole of what this
   * owes beyond them. An adapter relaying a server's `getVaultRecords` answers what it was sent.
   */
  protected abstract doGetVault(scope: VaultScope): Promise<VaultReadResponse>
  /** Store `draft` if its scope holds no vault record, then read the vault record standing and every box, all in one atomic step, answering as {@link VaultDB.doGetVault} does.
   * The vault record is `draft` itself, or the one already there, untouched, exactly as stored.
   * Over a tombstone the scope stands as no vault, and the new life is `draft` with its
   * `vault_epoch` set to the tombstone's: store that, and drop the tombstone in the same step. The
   * boxes are of the vault record it hands up. Two devices ensuring one scope at once settle on one
   * vault. `Expectations.newLifeOf` makes the record a key-value backend stores.
   */
  protected abstract doEnsureVault(draft: VaultDraft): Promise<VaultReadResponse>
  /** Replace the standing vault record with `vaultRecord` if, and only if, it has `expected.vault_tok` and `expected.gate_epoch`, resolving it as stored.
   * Store `vaultRecord`, its gate with it, with its `vault_epoch` set to the standing one plus one,
   * whatever it carries, and resolve the record as stored, read back in that same step: a key-value
   * backend asks `Expectations.vaultRecordPutOf`. Otherwise write nothing, and throw
   * `Refusals.staleVaultRecord(standing)` from the same atomic step, `standing` the vault record
   * exactly as stored, or null for none (a tombstone is none). A key-value backend asks
   * `Expectations.vaultRecordRefusalOf`. A server-side adapter also refuses a vault record that
   * moves `gate_epoch` back or leaves it where it stands. How the record is laid out in storage
   * (columns, documents, one JSON value) is the adapter's own.
   */
  protected abstract doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<unknown>
  /** The stored box record under `boxlabel`, exactly as saved, or null for none, if, and only if, the standing vault record has `expected.vault_tok`.
   * Compare the vault record in the same atomic step as the read of the box. Otherwise read
   * nothing more, and throw `Refusals.vaultMismatch()` from that step: none stand, a tombstone
   * stands, or another vault's. A key-value backend reads both rows and asks
   * `Expectations.vaultMeets(standingVaultRecord, expected)`.
   */
  protected abstract doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown>
  /** Store `box` under its boxlabel if, and only if, the standing vault record and box are those `expected` names.
   * That is a vault record with `expected.vault_tok`, and the box at `expected.revision_tok`, or no box
   * for null, all compared in the same atomic step as the write. Once written, resolve the record as
   * stored, read back in that same step (a `RETURNING`, a mutation's return value, a read in the
   * transaction), as `doGetBox` would hand it up.
   *
   * Otherwise write nothing, and throw from that same step:
   *
   * * `Refusals.vaultMismatch()` when the vault record is not the expected one: none, or another
   *   vault's.
   * * `Refusals.staleBox(standing)` when they are, but the box is not. `standing` is the record
   *   under the boxlabel exactly as stored, damaged or not, or null for none.
   * * `Refusals.vaultFull(capacity)`, from a backend that keeps a limit, for a vault with no room.
   *
   * A key-value backend reads both rows and asks `Expectations.boxRefusalOf` which.
   */
  protected abstract doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown>
  /** How full the vault is, read in one step: a {@link Capacity}, with `Infinity` for a limit the backend does not keep.
   * Count its boxes and weigh their bytes as the backend weighs them. A box write refused for room
   * reports the same reckoning, with `Refusals.vaultFull(capacity)`.
   */
  protected abstract doGetCapacity(scope: VaultScope): Promise<unknown>
  /** Remove the box under `boxlabel`, whatever revision stands, if, and only if, the standing vault record has `expected.vault_tok`.
   * Compare in the same atomic step as the removal. Once that vault record stands, resolve a
   * {@link BoxDeletion} saying what that step removed: `deleted` for a record at
   * `expected.revision_tok`, `deleted_other` for any other, `absent` for none. For a null
   * `revision_tok`, `deleted` is a record holding no revision a read could take:
   * `Expectations.deletionOf` compares as the listing reads. Otherwise resolve null, removing
   * nothing.
   */
  protected abstract doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown>
  /** Remove the vault record and every box of `scope` if, and only if, the standing vault record has `expected.vault_tok` and, unless it is null, `expected.gate_epoch`, leaving a tombstone.
   * Use one transaction, where the backend has them. Resolve the {@link VaultTombstone} as stored,
   * read back in that same step: the scope, and `vault_epoch` the vault's own plus one. Over a
   * tombstone, or no vault record, resolve null, removing nothing. So does any other miss.
   * `Expectations.tombstoneOf` makes it for a key-value backend.
   */
  protected abstract doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown>
  /** Call `onChange` after any write touching `scope`, and return the unsubscribe.
   * The default never calls. A backend with live queries or push (Convex, a websocket) overrides
   * it, and may report its watch's failures through {@link VaultDB.watchTrouble}.
   */
  protected doSubscribe(_scope: VaultScope, _onChange: () => void): () => void {
    return noUnsubscribing
  }
  // --
}

// == [Watch helpers]: noUnsubscribing, WatchTrouble, startedWatch, heedListener, heedRejection

const noUnsubscribing = (): void => undefined

/** What {@link VaultDB.watchTrouble} hands a watch, to say when it fails and when it hears again. */
export type WatchTrouble = {
  /** Warn, with the backend's error, unless already warned in this failing streak. */
  failed:    (err: unknown) => void
  /** End a failing streak: the watch hears again. */
  delivered: () => void
}

/** The adapter's watch, begun: its unsubscribe, or what it threw said as storage trouble. */
const startedWatch = (start: () => () => void): (() => void) => {
  try {
    return start()
  } catch (err) {
    throw asStorageTrouble(err)
  }
}

/** Call a subscriber's `onChange`, handing `failed` whatever it throws or its promise rejects with. */
const heedListener = (onChange: () => unknown, failed: (err: unknown) => void): void => {
  try {
    void heedRejection(onChange(), failed)
  } catch (err) {
    failed(err)
  }
}

/** Settle what a listener returned, a promise or anything else, handing a rejection to `failed`. */
const heedRejection = async (returned: unknown, failed: (err: unknown) => void): Promise<void> => {
  try {
    await returned
  } catch (err) {
    failed(err)
  }
}
// --

// == [Listing helpers]: splitStoredBoxes, checkedListing, ListingAnswer, isNameable, judgedBox, damagedOf, mayBeNewerBox, listingOf, isDamagedBox, byBoxlabel, byCodeUnit

/** Split the box rows a VaultDB read into the sound and the damaged, as `doGetVault` and `doEnsureVault` answer them: the judging of damage is the package's, so an adapter adds one line.
 * A row whose record reads back as a box filed under its own boxlabel is sound, and listed as its
 * {@link BoxSparse}: its two ciphered fields left out. Any other is a {@link BoxDamaged} under the
 * boxlabel the row is filed under: `newer_format` for a record naming a `format` this version
 * neither writes nor wrote before, which a newer safebyok may have written, and `damaged`
 * otherwise. A row filed under a name that is no label is left out, as no verb could reach it.
 * Each list is sorted by boxlabel, and each entry frozen.
 *
 * @example
 *   protected async doGetVault(scope: VaultScope): Promise<VaultReadResponse> {
 *     const { vaultRow, boxRows } = await this.readVaultRows(scope)   // one transaction
 *     return { vault: vaultRow ?? null, ...splitStoredBoxes(boxRows.map((row) => ({ boxlabel: row.boxlabel, box: row }))) }
 *   }
 */
export const splitStoredBoxes = (rows: readonly StoredBox[]): { boxes: BoxSparse[], damagedBoxes: BoxDamaged[] } => (
  listingOf(rows.filter((row) => isNameable(row.boxlabel)).map((row) => judgedBox(row.boxlabel, row.box)))
)

/** The listing an adapter answered a vault read with, checked again: each sound box judged as {@link splitStoredBoxes} judges a row, each damaged box parsed, its word that it is damaged taken; `corrupt_record` for an answer in another shape.
 * A sound box that fails is listed as the split would list it, damaged under its own boxlabel. Both
 * lists come back sorted by boxlabel and frozen.
 */
const checkedListing = (response: unknown): { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] } => {
  const { boxes, damagedBoxes } = checkAnswer(ListingAnswer, response, 'a vault read')
  const sound = boxes.filter((box) => isNameable(box.boxlabel)).map((box) => judgedBox(box.boxlabel as string, box))
  const listing = listingOf([...sound, ...damagedBoxes.map((box) => Object.freeze(box))])
  return { boxes: Object.freeze(listing.boxes), damagedBoxes: Object.freeze(listing.damagedBoxes) }
}

/** A box as `doGetVault` may hand it up, whole or with its two ciphered fields left out, so a projecting backend is checked as one handing whole records; the one field of a damaged box the listing keeps, when the record holds it as text, what a write over it names; and a vault read's answer, an object holding its vault record as stored, and its listing, each sound box an object to judge, each damaged one a {@link BoxDamaged}. */
export const { ListedBox, StoredRevision, ReadAnswer, ListingAnswer } = Validator('bad_record', ({ obj, arr, unk }) => ({
  ListedBox:      BoxRecord.partial({ box_key_wrapped: true, whisper_ciphered: true }),
  StoredRevision: obj({ revision_tok: BoxRecord.shape.revision_tok }),
  ReadAnswer:     obj({ vault: unk }).loose(),
  ListingAnswer:  obj({ boxes: arr(obj({ boxlabel: unk }).loose()), damagedBoxes: arr(BoxDamaged) }).loose(),
}))

/** True when a box is filed under a label, which a verb can reach. */
const isNameable = (boxlabel: unknown): boolean => CX.label.safeParse(boxlabel).success

/** A record filed under `boxlabel` as a listing shows it: its {@link BoxSparse} where `getBox` would take it, else a {@link BoxDamaged}. */
const judgedBox = (boxlabel: string, box: unknown): BoxSparse | BoxDamaged => {
  const checked = ListedBox.safeParse(box)
  if (checked.success && checked.data.boxlabel === boxlabel) { return boxSparseOf(checked.data) }
  return damagedOf(boxlabel, box)
}

/** A record filed under `boxlabel` that does not read back as its box, as a listing shows it, frozen: the revision it holds as text, or null, and whether a newer version may have written it. */
const damagedOf = (boxlabel: string, box: unknown): BoxDamaged => Object.freeze({
  boxlabel,
  revision_tok: StoredRevision.safeParse(box).data?.revision_tok ?? null,
  damage:       mayBeNewerBox(box) ? 'newer_format' : 'damaged',
})

/** The box record formats earlier versions of this package wrote: a record in one is older, never newer, and fails as damage does. */
const OlderBoxFormats: ReadonlySet<unknown> = new Set(['safebyok-box-v1', 'safebyok-box-v2', 'safebyok-box-v3', 'safebyok-box-v4', 'safebyok-box-v5', 'safebyok-box-v6', 'safebyok-box-v7'])

/** True when a stored box names a `format`, of any type, this version neither writes nor wrote before: a later version's, not damage. */
const mayBeNewerBox = (raw: unknown): boolean => {
  const format = formatOf(raw)
  return format !== undefined && format !== BoxFormat && ! OlderBoxFormats.has(format)
}

/** Judged boxes as a listing holds them: the sound and the damaged apart, each sorted by boxlabel. */
const listingOf = (judged: readonly (BoxSparse | BoxDamaged)[]): { boxes: BoxSparse[], damagedBoxes: BoxDamaged[] } => ({
  boxes:        judged.filter((box): box is BoxSparse => ! isDamagedBox(box)).toSorted(byBoxlabel),
  damagedBoxes: judged.filter(isDamagedBox).toSorted(byBoxlabel),
})

/** True for a listed box that is damaged: only a {@link BoxDamaged} says its `damage`. */
const isDamagedBox = (box: BoxSparse | BoxDamaged): box is BoxDamaged => 'damage' in box

/** Two listed boxes in boxlabel order, as {@link byCodeUnit} orders names. */
const byBoxlabel = (one: { boxlabel: string }, two: { boxlabel: string }): number => byCodeUnit(one.boxlabel, two.boxlabel)

/** Two names in one order on every device: character by character, by UTF-16 code unit, never by a locale. */
export const byCodeUnit = (one: string, two: string): number => {
  if (one === two) { return 0 }
  return one < two ? -1 : 1
}
// --

// == [Name checks]: heldScope, heldBoxlabel, heldName

/** What a backend declares about the names it holds. */
type NameFacts = Pick<VaultDB, 'maxNameBytes'>

/** `scope`, frozen, once each name passes its check and fits the backend: 'bad_scope' otherwise, quoting none of it. */
const heldScope = (facts: NameFacts, scope: unknown): VaultScope => {
  const asked = CX.vaultScope.parse(scope)
  heldName(facts, 'applabel', asked.applabel)
  heldName(facts, 'user_id', asked.user_id)
  heldName(facts, 'vaultlabel', asked.vaultlabel)
  return asked
}

/** `boxlabel`, once it is a label that fits the backend, beside `scope` already held: 'bad_scope' otherwise. */
const heldBoxlabel = (facts: NameFacts, scope: VaultScope, boxlabel: unknown): string => heldName(facts, 'boxlabel', CX.boxscope.parse({ ...scope, boxlabel }).boxlabel)

/** `part`, a name, once it fits the backend's `maxNameBytes`: 'bad_scope' otherwise, naming `said` and the limit. */
const heldName = (facts: NameFacts, said: string, part: string): string => {
  const partBytes = new TextEncoder().encode(part).length
  if (partBytes > facts.maxNameBytes) {
    throw new VaultError('bad_scope', `That ${said} is ${String(partBytes)} bytes of UTF-8, over the ${String(facts.maxNameBytes)} this storage holds in one name: choose a shorter ${said}.`)
  }
  return part
}
// --

// == [Storage and listener guards]: answering, asStorageTrouble, adapterAnswer, withMissChecked, staleChecked, fullChecked, withStaleVaultRecordChecked, unsaidVaultRecord, remade, boxStoredOf, invalidBox, checkListener, checked, checkOutgoing, checkDraft

/** `body`'s outcome, as each verb answers: a throw that is no VaultError is the base's own bug, `unexpected_error`.
 * The adapter's throws reach it as VaultErrors already, through {@link adapterAnswer}.
 */
const answering = <ValT>(body: () => Promise<ValT>): Promise<Outcome<ValT>> => outcomeOf(body, unexpectedError)

/** What an adapter threw, as a VaultError: a VaultError untouched, anything else wrapped. */
const asStorageTrouble = (err: unknown): VaultError => (isVaultError(err) ? err : Refusals.storageUnavailable(err))

/** What the adapter's `hook` answers, its throw as storage trouble; an answer still wrapped as an Outcome refuses 'bad_option'. */
const adapterAnswer = async <AnswerT>(hookname: string, hook: () => Promise<AnswerT>): Promise<AnswerT> => {
  let answer: AnswerT
  try {
    answer = await hook()
  } catch (err) {
    throw asStorageTrouble(err)
  }
  if (isOutcomeShaped(answer)) {
    throw new VaultError('bad_option', `The storage adapter's ${hookname} answered with an Outcome, { ok, val } or { ok, err }, where it owes the answer itself: an adapter that hands its call on to another VaultDB's verb must unwrap what that verb resolves, with valOf(...), returning its val and throwing its err.`)
  }
  return answer
}

/** What a box write resolves, or its refusal, with what a miss says of storage checked as a read checks it.
 * A stale write naming nothing standing, or a `vault_full` without a sound capacity, refuses as
 * `corrupt_record`.
 */
const withMissChecked = async <ValT>(writing: Promise<ValT>, boxlabel: string): Promise<ValT> => {
  try {
    return await writing
  } catch (err) {
    if (isVaultError(err, 'stale_write')) { throw staleChecked(err, boxlabel) }
    if (isVaultError(err, 'vault_full')) { throw fullChecked(err) }
    throw err
  }
}

/** A box write's `stale_write`, its `box_stored` checked; `corrupt_record` when it names nothing standing. */
const staleChecked = (err: VaultError, boxlabel: string): VaultError => {
  const said = err.meta ?? {}
  if (! ('box_stored' in said)) {
    return new VaultError('corrupt_record', "Storage refused a box write as stale, so nothing was written, but did not say what stands under its boxlabel. The storage adapter needs a developer's look: its doPutBox throws Refusals.staleBox(standing).", { cause: err })
  }
  return remade(err, { box_stored: boxStoredOf(said.box_stored, boxlabel) })
}

/** A box write's `vault_full`, its `capacity` checked; `corrupt_record` when it carries none that reads as one. */
const fullChecked = (err: VaultError): VaultError => {
  const capacity = Capacity.safeParse(err.meta?.capacity)
  if (! capacity.success) {
    return new VaultError('corrupt_record', "Storage refused a box write as vault_full, so nothing was written, but did not say how full the vault is. The storage adapter needs a developer's look: its doPutBox throws Refusals.vaultFull(capacity).", { cause: err })
  }
  return remade(err, { capacity: capacity.data })
}

/** What an update of the vault record resolves, or its refusal, its `stale_write`'s `vault_stored` checked as a read checks it.
 * A vault record standing that fails that check refuses as the read does: 'damaged_vault' or
 * 'newer_format'. A stale write naming nothing standing refuses as `corrupt_record`.
 */
const withStaleVaultRecordChecked = async <ValT>(writing: Promise<ValT>, scope: VaultScope): Promise<ValT> => {
  try {
    return await writing
  } catch (err) {
    if (! isVaultError(err, 'stale_write')) { throw err }
    const said = err.meta ?? {}
    if (! ('vault_stored' in said)) { throw unsaidVaultRecord({ cause: err }) }
    const standing: unknown = said.vault_stored
    throw remade(err, { vault_stored: standing === null || standing === undefined ? null : checkVaultRecord(standing, scope) })
  }
}

/** An update of the vault record refused without saying what stands: the adapter's bug, `corrupt_record`. */
const unsaidVaultRecord = (opts?: ErrorOptions) => new VaultError('corrupt_record', "Storage refused an update of the vault record, so nothing was written, but did not say what stands. The storage adapter needs a developer's look: its doPutVaultRecord throws Refusals.staleVaultRecord(standing).", opts)

/** `err` made again with `meta`, its kind, message and cause kept. */
const remade = (err: VaultError, meta: RefusalMeta): VaultError => (
  new VaultError(err.refusalkind, err.message, err.cause === undefined ? { meta } : { cause: err.cause, meta })
)

/** What stands under `boxlabel`, as a stale box write reports it: the box where `getBox` would take it, else a {@link BoxDamaged}, or null for none. */
const boxStoredOf = (raw: unknown, boxlabel: string): BoxRecord | BoxDamaged | null => {
  if (raw === null || raw === undefined) { return null }
  const box = BoxRecord.safeParse(raw)
  return box.success && box.data.boxlabel === boxlabel ? box.data : damagedOf(boxlabel, raw)
}

/** A box handed to `putBox` that this package would not build: kind 'invalid_box', quoting none of it. */
const invalidBox = () => new VaultError('invalid_box', "Nothing was written: that box is not one this package builds. Hand a VaultDB's putBox only the boxes a vault seals.")

const checkListener = (onChange: unknown) => {
  if (typeof onChange !== 'function') {
    throw new VaultError('bad_option', 'subscribe needs an onChange function to call after each write.')
  }
}

/** `candidate` through `recordSchema`, or the refusal `refused` makes, its cause the schema's own 'bad_record'.
 * That cause names each failing field and what it expected, in its message and `meta.fieldnames`,
 * never the value.
 */
const checked = <RecordT>(recordSchema: Z.ZodType<RecordT>, candidate: unknown, refused: (opts: ErrorOptions) => VaultError): RecordT => {
  try {
    return recordSchema.parse(candidate)
  } catch (err) {
    if (isVaultError(err, 'bad_record')) { throw refused({ cause: err }) }
    throw err
  }
}

/** A record or expectation a verb was handed, once it is one this package builds: 'bad_record' otherwise, its cause the schema's own, naming each failing field.
 * The refusal leads with what was spared: nothing `written`, for a delete nothing `removed`, or for
 * a box read nothing `read`.
 */
const checkOutgoing = <RecordT>(recordSchema: Z.ZodType<RecordT>, candidate: unknown, said: string, spared: 'written' | 'removed' | 'read' = 'written'): RecordT => checked(recordSchema, candidate, (opts) => (
  new VaultError('bad_record', `Nothing was ${spared}: that ${said} is not one this package builds. Hand a VaultDB only the records and expectations a vault builds.`, opts)
))

/** A draft handed to `ensureVault`, once it is a novel vault's record, `gate_epoch` 0 and `gate` null, with `vault_epoch` 0: 'bad_record' otherwise, quoting none of it.
 * The counter is the store's to set, so a draft claims none.
 */
const checkDraft = (draft: unknown): VaultDraft => {
  const outgoing = checkOutgoing(VaultDraft, draft, 'novel vault record draft')
  if (outgoing.vault_epoch !== 0) {
    throw new VaultError('bad_record', "Nothing was written: a draft's vault_epoch is 0. The store sets the counter, and carries it on from a vault deleted in the scope.")
  }
  return outgoing
}
// --

// == [Vault record checks]: checkVaultRecord, checkWrittenVaultRecord, damagedVaultRecord, unnamedVaultRecord, newerVaultRecord, mayBeNewer, readStoredVault, isSoundVaultRecord, others

/** A vault record read from storage for `scope`, once it passes its checks: 'newer_format' for a format a later version may write, 'damaged_vault' otherwise. */
const checkVaultRecord = (raw: unknown, scope: VaultScope): VaultRecord => {
  // A later safebyok may write what this one cannot read, which is no damage: it is said apart.
  if (mayBeNewer(raw)) { throw newerVaultRecord() }
  const vaultRecord = checked(VaultRecord, raw, (opts) => damagedVaultRecord('did not read back in a shape this package knows: it is damaged, or was written by an older version of safebyok', opts))
  // A record that names some other scope is a record out of place, wherever it came from.
  if (! Names.sameScope(vaultRecord, scope)) { throw damagedVaultRecord('names a different app, user or vault than the one asked for') }
  return vaultRecord
}

/** The vault record an adapter handed back as `written` landed: a vault record of the scope, the same vault at the same `gate_epoch`; `corrupt_record` otherwise, quoting none of it. */
const checkWrittenVaultRecord = (raw: unknown, written: VaultRecord, scope: VaultScope): VaultRecord => {
  const stored = checkAnswer(VaultRecord, raw, 'an update of the vault record', 'landed')
  if (! Names.sameScope(stored, scope) || stored.vault_tok !== written.vault_tok || stored.gate_epoch !== written.gate_epoch) { throw wrongAnswer('an update of the vault record', 'landed') }
  return stored
}

/** A vault record read from storage that fails its checks, as `said` says how: 'damaged_vault', quoting none of it. */
const damagedVaultRecord = (said: string, opts?: ErrorOptions) => new VaultError('damaged_vault', `This vault's stored record ${said}, so no vault unlocker (passphrase or passkey) can be tried against it, and the vault can't be opened. It was left as it is: restore it from a backup, or, if the user chooses to start over, delDamagedVault() clears it.`, opts)

const unnamedVaultRecord = (opts?: ErrorOptions) => new VaultError('damaged_vault', "This vault's stored record is too damaged to say which vault it is, so storage can't be told which one to remove, and nothing was removed. Its backend's own tools can clear it.", opts)

/** A stored vault this version cannot read, which a newer one may have: its own constructor, its own kind. */
const newerVaultRecord = () => new VaultError('newer_format', "This vault's stored record is in a form this version of the app does not know. It may have been written by a newer version, which opens it, so it was left as it is: update the app and try again.")

/** The vault record formats earlier versions of this package wrote: a record in one is older, never newer, and fails as damage does. */
const OlderVaultRecordFormats: ReadonlySet<unknown> = new Set(['safebyok-vault-v1', 'safebyok-vault-v2', 'safebyok-vault-v3', 'safebyok-vault-v4', 'safebyok-vault-v5'])

/** True when a stored record names a `format`, of any type, this version neither writes nor wrote before: a later version's, not damage. */
const mayBeNewer = (raw: unknown): boolean => {
  // This is all this version can tell from damage. So any change to what a stored record may hold
  // -- a field, a shape, a kind of way in, or a range a check accepts -- bumps `format`.
  const format = formatOf(raw)
  const knownFormat = VaultSparse.shape.format.safeParse(format).success || VaultTombstone.shape.format.safeParse(format).success || OlderVaultRecordFormats.has(format)
  return format !== undefined && ! knownFormat
}

/** The `format` a stored record names, of any type, or undefined for none, or for a record that is no object. */
const formatOf = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) { return undefined }
  return (raw as { format?: unknown }).format
}

/** The vault as the adapter stores it; an adapter's own `damaged_vault`, from a VaultDB it hands on to, refuses as one too damaged to name, the vault's token out of reach. */
const readStoredVault = async (reading: () => Promise<VaultReadResponse>): Promise<VaultReadResponse> => {
  try {
    return await reading()
  } catch (err) {
    if (isVaultError(err, 'damaged_vault')) { throw unnamedVaultRecord({ cause: err }) }
    throw err
  }
}

/** True when `raw` reads back as the scope's vault record: what `getVault` would hand up rather than refuse. */
const isSoundVaultRecord = (raw: unknown, scope: VaultScope): boolean => {
  try {
    checkVaultRecord(raw, scope)
    return true
  } catch (err) {
    if (isVaultError(err, 'damaged_vault')) { return false }
    throw err
  }
}

/** The one field of a stored vault record a deletion needs, as the record's own check has it, every other field dropped unread. */
export const { StoredVaultTok } = Validator('bad_record', () => ({
  StoredVaultTok: VaultSparse.pick({ vault_tok: true }).strip(),
}))
// --

// == [Box and answer checks]: checkStoredBox, damagedBox, checkWrittenBox, checkAnswer, wrongAnswer, jsonBytes

/** A box read from storage, as `getBox` holds it: a box's shape, under the boxlabel it was asked for; 'damaged_box' otherwise. */
const checkStoredBox = (raw: unknown, boxlabel: string): BoxRecord => {
  const box = checked(BoxRecord, raw, (opts) => damagedBox('did not read back in a shape this package knows: it is damaged, or was written by an older version of safebyok', opts))
  // A record naming another boxlabel is out of place: a misfiling adapter, or a moved record.
  if (box.boxlabel !== boxlabel) { throw damagedBox('names a different boxlabel than the one it is stored under') }
  return box
}

/** A box read from storage that fails its checks, as `said` says how: 'damaged_box', quoting none of it.
 * It never quotes the boxlabel either: a label may still be a key pasted by mistake.
 */
const damagedBox = (said: string, opts?: ErrorOptions) => new VaultError('damaged_box', `That box's stored record ${said}, so it can't be read. It was left as it is; remove it, or store its whisper again over it.`, opts)

/** The box an adapter handed back as `written` landed: a box's shape, under the boxlabel and at the revision written; `corrupt_record` otherwise, quoting neither. */
const checkWrittenBox = (raw: unknown, written: BoxRecord): BoxRecord => {
  const box = checkAnswer(BoxRecord, raw, 'a box write', 'landed')
  if (box.boxlabel !== written.boxlabel || box.revision_tok !== written.revision_tok) { throw wrongAnswer('a box write', 'landed') }
  return box
}

/** An adapter's answer to `said` through `answerSchema`: one in another shape is the adapter's bug, `corrupt_record`, its check's 'bad_record' the cause. */
const checkAnswer = <AnswerT>(answerSchema: Z.ZodType<AnswerT>, raw: unknown, said: string, landed?: 'landed'): AnswerT => (
  checked(answerSchema, raw, (opts) => wrongAnswer(said, landed, opts))
)

/** The refusal of an adapter's answer to `said` that is not in the protocol's shape: `corrupt_record`, quoting none of it.
 * For a write or deletion, `landed` says it may have landed all the same.
 */
const wrongAnswer = (said: string, landed?: 'landed', opts?: ErrorOptions) => new VaultError('corrupt_record', landed === 'landed'
  ? `Storage says ${said} landed, but answered with what this package cannot read back, so whether it did is not known: reading the vault again shows what stands. The storage adapter needs a developer's look: it wrote or reported something it should not have.`
  : `Storage answered ${said} in a shape this package does not know. The storage adapter needs a developer's look.`, opts)

/** What `val` weighs as the UTF-8 bytes of its JSON: how the vault measures a record against its storage's limits.
 * Every in-tree backend counts a record as no heavier.
 */
export const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --
