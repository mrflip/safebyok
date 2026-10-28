import type * as Z from 'zod'
import { type BoxDamaged, BoxFormat, type BoxSparse, type BoxRecord } from './shapes/box'
import * as BX from './shapes/box'
import { boxSparseOf } from './box'
import type { BoxListing, StoredBox, StoredVault, BoxDelExpectation, BoxDeletion, BoxExpectation, BoxGetExpectation, Capacity, VaultDelExpectation, VaultRecordExpectation } from './shapes/vault-db'
import * as VDX from './shapes/vault-db'
import type { VaultScope } from './shapes/scopes'
import { TombstoneFormat, VaultFormat, type VaultDraft, type VaultRecord, type VaultTombstone } from './shapes/vault'
import * as VX from './shapes/vault'
import { VaultError, isVaultError, type RefusalMeta } from './errors'
import { verifyConsistent } from './checks/validator'
import * as OX from './shapes/bank-opts'
import { fieldOf } from './helpers'
import * as CX from './shapes/scopes'
import * as Refusals from './refusals'
import { isTombstone } from './expectations'
import { asError, parseLogger, type VaultLogger } from './logger'
import { reportToPlatform } from './report-error'
import { type Outcome, storageTroubleOf, outcomeOf } from './outcome'
import { byCodeUnit } from './text'

// == [Options]: VaultDBOpts

/** The options every adapter's factory takes from the host beside its backend's own, and hands to `super()`.
 *
 * @example
 *   export type AcmeVaultDBOpts = VaultDBOpts & { client: AcmeClient }
 * @example
 *   constructor(opts: AcmeVaultDBOpts) { super(opts); this.client = opts.client }
 */
export type VaultDBOpts = {
  /** Where the VaultDB says what it has nobody to throw to: a listener that threw, a watch that failed or dropped. Left out or null, the default logger.
   * A vault made with no `logger` of its own uses this one, so give it here to have one logger
   * hear both. The vault's own `logger` never reaches the VaultDB.
   */
  logger?: VaultLogger | null | undefined
}

// --

// == [Hook adapter]: adaptedHook

/** `hook`, one `do*` method of an adapter called on the VaultDB handed first, as a verb calls it: its answer resolved, and a throw made storage trouble by {@link storageTroubleOf}. */
const adaptedHook = <ArgsT extends unknown[], AnswerT>(hook: (...args: ArgsT) => Promise<AnswerT>) => async (...args: ArgsT): Promise<AnswerT> => {
  try {
    return await hook(...args)
  } catch (err) {
    throw storageTroubleOf(err)
  }
}
// --

/** Remote storage for vault records: extend it, and implement its `do*` methods against your backend.
 * You are a shelf, not a safe. The package's `VAULTDB.md` is the whole contract, line by line;
 * `describeVaultDB` (from `safebyok/testing`) tests an adapter against it, and each `do*` method
 * says what it owes.
 *
 *  * **Store what you are handed, return what you stored.** Every record and expectation is plain
 *    JSON (binary fields are base64url text), so any backend that holds JSON holds a vault as-is.
 *  * **Never look inside.** Every secret field arrives encrypted, and nothing you hold opens a
 *    vault. You compare only `vault_tok`, `gate_epoch` and `revision_tok` before a write.
 *  * **Write only as expected.** Each update and deletion carries an expectation of what is
 *    stored. Check it and write in one atomic step (a transaction, a conditional write).
 *  * **Enforce who may reach which rows.** safebyok's encryption protects the contents; your
 *    authorization decides who may fetch or overwrite them at all. When no one is signed in, or
 *    someone other than the scope's `user_id` is, refuse 'identity_revoked'. The vault locks
 *    itself on it, so never say it for a passing fault, which is 'storage_unavailable'. When the
 *    scope's own user may not make this call, refuse 'not_permitted', which locks nothing.
 *  * **Don't repair.** Return a record exactly as stored, or null when there is none. A damaged
 *    record is safebyok's to refuse, never yours to fix or quietly drop.
 *  * **Refuse with what {@link Refusals} makes.** A `do*` method that hands its call on to another
 *    VaultDB calls that VaultDB's throwing verb (`inner.getBox`), which answers with the record
 *    and throws the refusal, as `valOf` does of an Outcome.
 *
 * Hand `super()` the host's {@link VaultDBOpts}. Never override the public verbs, but
 * `delDamagedVault` in an adapter that hands each call on to another VaultDB: `tryDelDamagedVault`,
 * the form the package calls, derives from it.
 *
 * Every public verb is a try pair: `getVault` resolves its answer or throws its refusal, and
 * `tryGetVault` resolves the same as an {@link Outcome} and never rejects; {@link VaultDB.subscribe}
 * alone has one form, and throws. Before your code sees a call, a verb refuses 'bad_scope' for a
 * name, the scope's three or a boxlabel, that fails its check (`label`, or `user_id`) or is over
 * {@link VaultDB.maxNameBytes}. It refuses 'bad_record' for a record or expectation this package
 * would not build, a name in it failing its check among them ('invalid_box' for a box), naming each
 * failing field, never its value.
 *
 * After your code answers, a VaultError it threw passes as it came, and anything else it threw is
 * 'storage_unavailable', that throw its `cause`. A record read back that fails its checks is
 * 'damaged_vault' or 'damaged_box', Zod's own error its `cause`. An answer in a shape the protocol
 * does not allow, an Outcome where the bare answer is owed among them, is 'corrupt_record' (from
 * `doGetBox`, 'damaged_box'): a bug in the adapter (`VAULTDB.md`, line 5.1). A throw from the base
 * class's own code that is no VaultError is a bug, which a `try` form resolves as
 * 'unexpected_error', never to be retried, and a throwing form throws as it came.
 */
export abstract class VaultDB {
  // == [Backend limits]: maxRecordBytes, maxVaultBytes, maxBoxes, maxNameBytes

  /** The most bytes this backend holds in one record, or `Infinity` for no per-record limit.
   * `Bank.make` refuses ('bad_option') a `maxWhisperBytes` over half of it, and
   * {@link VaultDB.putBox} refuses a heavier box as `box_too_large`.
   */
  abstract readonly maxRecordBytes: number

  /** The most bytes this backend holds of one vault, every box together, as stored; or `Infinity` for no such limit.
   * Declare what the backend can still list and delete whole. A backend that reads a vault in one
   * transaction under a read budget declares the share of it its heaviest verb leaves.
   *
   * The vault reckons each box at twice `maxWhisperBytes` and a little more, before sealing.
   * `Bank.make` refuses ('bad_option') a `maxBoxes` whose boxes might not fit, and the vault's
   * `putBox()` refuses as `vault_full` a new box that might take the vault past it. The estimate is
   * conservative, so at a limit declared exactly tight it may refuse a box that would just fit.
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
   * A backend with a finite limit refuses a new box in a full vault as `vault_full`, on a best
   * effort, and never a box that replaces one (`VAULTDB.md`, lines 4.1 to 4.6).
   */
  abstract readonly maxBoxes: number

  /** The most UTF-8 bytes this backend holds in one name, or `Infinity` for any name the checks admit (a user_id's 100 at most).
   * Declare what the backend's keys and indexes hold. A store whose key holds every name of a box
   * together declares its share of the key's limit.
   */
  abstract readonly maxNameBytes: number
  // --

  // == [Constructor, logger and hooks]: #logger, #hooks, constructor, logger

  /** The guarded logger this VaultDB was made with. */
  readonly #logger: VaultLogger

  /** The `do*` hooks as the verbs call them, each adapted once by `adaptedHook` and handed the VaultDB first: its answer resolved, a throw that is no VaultError made `storage_unavailable`.
   * `doSubscribe` is not among them: it answers at once, and `startedWatch` guards it.
   */
  // Static, and handed the instance: a host's store built over a VaultDB (`Object.create(vaultDB, { maxBoxes })`), or a Proxy of
  // one, has no instance field of its own, and each hook is looked up on it as it is called, as `this.doGetVault(...)` would be.
  static readonly #hooks = {
    doGetVault:       adaptedHook((db: VaultDB, scope: VaultScope) => db.doGetVault(scope)),
    doEnsureVault:    adaptedHook((db: VaultDB, draft: VaultDraft) => db.doEnsureVault(draft)),
    doPutVaultRecord: adaptedHook((db: VaultDB, vaultRecord: VaultRecord, expected: VaultRecordExpectation) => db.doPutVaultRecord(vaultRecord, expected)),
    doGetBox:         adaptedHook((db: VaultDB, scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) => db.doGetBox(scope, boxlabel, expected)),
    doPutBox:         adaptedHook((db: VaultDB, scope: VaultScope, expected: BoxExpectation, box: BoxRecord) => db.doPutBox(scope, expected, box)),
    doGetCapacity:    adaptedHook((db: VaultDB, scope: VaultScope) => db.doGetCapacity(scope)),
    doDelBox:         adaptedHook((db: VaultDB, scope: VaultScope, boxlabel: string, expected: BoxDelExpectation) => db.doDelBox(scope, boxlabel, expected)),
    doDelVault:       adaptedHook((db: VaultDB, scope: VaultScope, expected: VaultDelExpectation) => db.doDelVault(scope, expected)),
  }

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
   * logger.
   */
  get logger(): VaultLogger { return this.#logger }

  // --

  // == [Vault verbs]: getVault, ensureVault, getVaultRecords, ensureVaultRecords, putVaultRecord, their try forms, gottenVault, ensuredVault

  // ------------------------------------------------------------------- the verbs safebyok calls

  /** Read the scope's vault record and box listing in one atomic step, or null when no vault is stored.
   * The vault comes back as its record, with `boxes` and `damagedBoxes` beside its fields: each
   * sound box's {@link BoxSparse}, without ciphertext, and each box whose record does not read back
   * as a {@link BoxDamaged}. Each list is sorted by boxlabel, and all of it is frozen. A row stored
   * under a name that is not a label is left out, as no verb could reach it. Nothing compares the
   * record with the boxes (`VAULTDB.md`, line 2.4). A scope holding only a tombstone, the mark of a
   * vault deleted, has no vault. A vault record it cannot use refuses 'damaged_vault', or
   * 'newer_format' for a format a later version may write.
   *
   * @example
   *   const stored = await vaultDB.getVault(scope)
   *   if (stored === null) { offerNewVault() }
   */
  getVault(scope: VaultScope): Promise<(VaultRecord & BoxListing) | null> {
    return this.gottenVault(scope)
  }

  /** The vault of `scope`, or null for none, as an {@link Outcome}: the non-throwing form of {@link VaultDB.getVault}. */
  tryGetVault(scope: VaultScope): Promise<Outcome<(VaultRecord & BoxListing) | null>> {
    return outcomeOf(() => this.getVault(scope))
  }

  /** Read the vault of `draft`'s scope as {@link VaultDB.getVault} does, creating it from `draft` first when none is stored.
   * The look, the create and the read are one atomic step, so two devices ensuring one new scope
   * settle on one vault, and both get it back: compare its `vault_tok` with the draft's to tell
   * whether this call made it. A vault record already stored comes back untouched. Over a
   * tombstone it starts a new life, carrying `vault_epoch` on from the vault deleted, so the counter
   * never goes back.
   *
   * `draft` is a novel vault's record (`gate_epoch` 0, `gate` null) with `vault_epoch` 0, as the
   * store sets the counter: any other refuses 'bad_record'.
   *
   * @example
   *   const ensured = await vaultDB.ensureVault(draft)
   *   if (ensured.vault_tok === draft.vault_tok) { greetNewVault() }   // this call made it
   */
  ensureVault(draft: VaultDraft): Promise<VaultRecord & BoxListing> {
    return this.ensuredVault(draft)
  }

  /** The vault of `draft`'s scope, made from `draft` when none was stored, as an {@link Outcome}: the non-throwing form of {@link VaultDB.ensureVault}. */
  tryEnsureVault(draft: VaultDraft): Promise<Outcome<VaultRecord & BoxListing>> {
    return outcomeOf(() => this.ensureVault(draft))
  }

  /** Read the scope's vault as {@link VaultDB.getVault} does: what a server relays to a browser's VaultDB, as its `doGetVault` answers.
   * The browser's base class checks it all again: it takes no server's word for a sound box, and
   * parses its word on a damaged one.
   *
   * @example
   *   const got = await vaultDB.getVaultRecords(scope)   // throws its refusal
   *   if (got === null) { return null }
   *   const { boxes, damagedBoxes, ...vault } = got
   *   return { vault, boxes, damagedBoxes }   // what a server sends a browser's VaultDB
   */
  getVaultRecords(scope: VaultScope): Promise<(VaultRecord & BoxListing) | null> {
    return this.gottenVault(scope)
  }

  /** The vault of `scope` as a server relays it, as an {@link Outcome}: the non-throwing form of {@link VaultDB.getVaultRecords}. */
  tryGetVaultRecords(scope: VaultScope): Promise<Outcome<(VaultRecord & BoxListing) | null>> {
    return outcomeOf(() => this.getVaultRecords(scope))
  }

  /** Ensure the vault as {@link VaultDB.ensureVault} does: what a server relays to a browser's VaultDB, as its `doEnsureVault` answers. */
  ensureVaultRecords(draft: VaultDraft): Promise<VaultRecord & BoxListing> {
    return this.ensuredVault(draft)
  }

  /** The vault of `draft`'s scope as a server relays it, as an {@link Outcome}: the non-throwing form of {@link VaultDB.ensureVaultRecords}. */
  tryEnsureVaultRecords(draft: VaultDraft): Promise<Outcome<VaultRecord & BoxListing>> {
    return outcomeOf(() => this.ensureVaultRecords(draft))
  }

  /** Replace the vault record with `vaultRecord`, only while the stored one has the `vault_tok` and `gate_epoch` in `expected`, resolving the vault record as stored.
   * The record and its gate are written in one step, in which the store moves `vault_epoch` up by
   * one, whatever `vaultRecord` carries. A vault's first gate is such an update, expecting
   * `gate_epoch` 0.
   *
   * A miss refuses `stale_write`, writing nothing, as does no vault record or only a tombstone.
   * `err.meta.vault_stored` then holds what is stored, from the same atomic step, checked as
   * {@link VaultDB.getVault} checks it, or null for none; a stored vault record that fails that
   * check refuses as a read of it does. A `vaultRecord` whose `vault_tok` is not `expected`'s
   * refuses 'bad_record', as a vault's never changes.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.tryPutVaultRecord(next, { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch })
   *   if (! ok && err.refusalkind === 'stale_write') { return err.meta?.vault_stored }   // what won
   */
  async putVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<VaultRecord> {
    const outgoing = checkOutgoing(VX.VaultRecord, vaultRecord, 'vault record')
    const asked = heldScope(this, outgoing)
    const expectation = checkOutgoing(VDX.VaultRecordExpectation, expected, 'vault record expectation')
    if (outgoing.vault_tok !== expectation.vault_tok) {
      throw new VaultError('bad_record', "putVaultRecord replaces a vault's record within that vault: the vault record's vault_tok must be the expected one, as a vault_tok never changes.")
    }
    const raw = await withStaleVaultRecordChecked(VaultDB.#hooks.doPutVaultRecord(this, outgoing, expectation), asked)
    return checkPutVaultRecord(raw, outgoing)
  }

  /** The vault record as stored, as an {@link Outcome}: the non-throwing form of {@link VaultDB.putVaultRecord}. */
  tryPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<Outcome<VaultRecord>> {
    return outcomeOf(() => this.putVaultRecord(vaultRecord, expected))
  }

  /** Read the vault of `scope` through `doGetVault`, its vault record and listing checked and frozen; null for none or a tombstone. */
  private async gottenVault(scope: VaultScope): Promise<(VaultRecord & BoxListing) | null> {
    const asked = heldScope(this, scope)
    const answer = await VaultDB.#hooks.doGetVault(this, asked)
    const raw = checkAnswer(VDX.StoredVaultAnswer, answer, 'a vault read').vault
    if (raw === null || raw === undefined || isTombstone(raw)) { return null }
    return Object.freeze({ ...checkVaultRecord(raw, asked), ...checkedListing(answer) })
  }

  /** Ensure the vault of `draft` through `doEnsureVault`, once the draft is checked, handing it back as {@link VaultDB.getVault} does. */
  private async ensuredVault(draft: VaultDraft): Promise<VaultRecord & BoxListing> {
    // A draft claims no counter, vault_epoch 0: the store sets it, and carries it on past a tombstone.
    const outgoing = checkOutgoing(VX.VaultDraft, draft, 'novel vault record draft')
    const asked = heldScope(this, outgoing)
    const answer = await VaultDB.#hooks.doEnsureVault(this, outgoing)
    const raw = checkAnswer(VDX.StoredVaultAnswer, answer, 'a vault read').vault
    return Object.freeze({ ...checkVaultRecord(raw, asked), ...checkedListing(answer) })
  }
  // --

  // == [Box verbs]: getBox, putBox, their try forms

  /** Read the box under `boxlabel`, checked, or null for none, only while the stored vault record has `expected`'s `vault_tok`.
   * The vault record and the box are read in one atomic step. Another vault's record, or none (the
   * vault deleted, or deleted and made anew), refuses `vault_mismatch`, reading nothing more: so a
   * box from another life of the scope never reaches a reader holding the key of this one. A box
   * that fails its checks refuses `damaged_box`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.tryGetBox(scope, 'anthropic', { vault_tok: vaultRecord.vault_tok })
   *   if (! ok && err.refusalkind === 'vault_mismatch') { await reopen() }   // the vault was remade
   */
  async getBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<BoxRecord | null> {
    const asked = heldScope(this, scope)
    const label = heldBoxlabel(this, asked, boxlabel)
    const expectation = checkOutgoing(VDX.BoxGetExpectation, expected, 'box read expectation', 'read')
    const raw = await VaultDB.#hooks.doGetBox(this, asked, label, expectation)
    if (raw === null || raw === undefined) { return null }
    return checkStoredBox(raw, label)
  }

  /** The box under `boxlabel`, or null for none, as an {@link Outcome}: the non-throwing form of {@link VaultDB.getBox}. */
  tryGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<Outcome<BoxRecord | null>> {
    return outcomeOf(() => this.getBox(scope, boxlabel, expected))
  }

  /** Write `box` under its boxlabel in one atomic conditional write, resolving the box as storage now holds it.
   * The write lands only while the stored vault record has `expected`'s `vault_tok`, and the stored
   * box its `revision_tok` (for null, while no box is stored). The box resolved comes from that same
   * step, checked as {@link VaultDB.getBox} checks one, at the revision written; one that fails is
   * `corrupt_record`, though the write may have landed.
   *
   * Refuses, writing nothing:
   *
   * * `vault_mismatch` when the stored vault record is not the one `expected` names, or none
   *   is stored. It carries nothing of them.
   * * `stale_write` when the stored box is not the one `expected` names: a retry of a write that
   *   landed too, naming its own box. `err.meta.box_stored` holds what is stored, from the same
   *   atomic step: the box that won, checked as `getBox` checks one; a `BoxDamaged`, naming the
   *   revision it holds, if any; or null for none. Write over it naming that revision, or null. A
   *   damaged box that names no revision can only be removed, with {@link VaultDB.delBox}.
   * * `vault_full` from the backend's own limit, `err.meta.capacity` saying how full the vault is.
   * * `box_too_large`, before storage sees it, for a box whose JSON, with its scope, weighs more
   *   than {@link VaultDB.maxRecordBytes}: a large sidecar or long names can make one so even within
   *   `maxWhisperBytes`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.tryPutBox(scope, { vault_tok, revision_tok: null }, box)
   *   if (! ok && err.refusalkind === 'stale_write') { return err.meta?.box_stored }  // what won
   */
  async putBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<BoxRecord> {
    const asked = heldScope(this, scope)
    const outgoing = checked(BX.BoxRecord, box, invalidBox)
    heldBoxlabel(this, asked, outgoing.boxlabel)
    const expectation = checkOutgoing(VDX.BoxExpectation, expected, 'box expectation')
    const recordBytes = jsonBytes({ ...asked, ...outgoing })
    if (recordBytes > this.maxRecordBytes) {
      throw new VaultError('box_too_large', `That box weighs ${String(recordBytes)} bytes, over the ${String(this.maxRecordBytes)} its storage holds in one record, so nothing was written: store a smaller whisper or sidecar, or under a shorter boxlabel.`)
    }
    const stored = await withMissChecked(VaultDB.#hooks.doPutBox(this, asked, expectation, outgoing), outgoing.boxlabel)
    return checkPutBox(stored, outgoing)
  }

  /** The box as storage now holds it, as an {@link Outcome}: the non-throwing form of {@link VaultDB.putBox}. */
  tryPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<Outcome<BoxRecord>> {
    return outcomeOf(() => this.putBox(scope, expected, box))
  }
  // --

  // == [Capacity]: getCapacity, tryGetCapacity

  /** Read how full the vault is, as storage reckons it in one step: its boxes and their bytes, each against storage's most.
   * An estimate, for a host to warn its user before a write is refused: storage checks again on
   * every write. Bytes are counted as the backend counts them, which need not match the vault's own
   * `capacity`; each adapter's README says how. A limit the backend does not keep reads as
   * `Number.MAX_SAFE_INTEGER`. A scope holding no vault answers nothing used.
   *
   * @example
   *   const capacity = await vaultDB.getCapacity(scope)
   *   if (capacity.boxes.used >= capacity.boxes.max) { warnFull() }
   */
  async getCapacity(scope: VaultScope): Promise<Capacity> {
    const asked = heldScope(this, scope)
    const raw = await VaultDB.#hooks.doGetCapacity(this, asked)
    return checkAnswer(VDX.Capacity, raw, 'a capacity reading')
  }

  /** How full the vault is, as an {@link Outcome}: the non-throwing form of {@link VaultDB.getCapacity}. */
  tryGetCapacity(scope: VaultScope): Promise<Outcome<Capacity>> {
    return outcomeOf(() => this.getCapacity(scope))
  }
  // --

  // == [Delete verbs]: delBox, delVault, delDamagedVault, their try forms, deletedVault

  /** Remove the box under `boxlabel`, whatever revision is stored, only while the stored vault record has `expected`'s `vault_tok`.
   * Another vault's record, or none, refuses `stale_write`, removing nothing. Resolves the
   * {@link BoxDeletion} the removal's own atomic step reports; one in another shape is
   * `corrupt_record`, though the deletion may have landed. Deleted is gone: nothing of the record
   * is kept, and a `putBox` expecting the revision removed refuses `stale_write`.
   *
   * @example
   *   const deletion = await vaultDB.delBox(scope, 'anthropic', { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok })
   *   if (deletion.outcome === 'deleted_other') { await refresh() }   // someone wrote over it first
   */
  async delBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<BoxDeletion> {
    const asked = heldScope(this, scope)
    const label = heldBoxlabel(this, asked, boxlabel)
    const expectation = checkOutgoing(VDX.BoxDelExpectation, expected, 'delete expectation', 'removed')
    const deletion = await VaultDB.#hooks.doDelBox(this, asked, label, expectation)
    if (deletion === null) { throw Refusals.staleDel() }
    return checkAnswer(VDX.BoxDeletion, deletion, 'a deletion', 'landed')
  }

  /** The {@link BoxDeletion} the removal reports, as an {@link Outcome}: the non-throwing form of {@link VaultDB.delBox}. */
  tryDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<Outcome<BoxDeletion>> {
    return outcomeOf(() => this.delBox(scope, boxlabel, expected))
  }

  /** Remove the vault record and every box, only while the stored vault record has `expected`'s `vault_tok` and `gate_epoch`, leaving a tombstone, which it resolves.
   * The {@link VaultTombstone} holds the scope and `vault_epoch` moved up by one, which the next
   * {@link VaultDB.ensureVault} of the scope carries into a new life. A miss refuses `stale_write`,
   * removing nothing: so a stale tab's old passphrase, proven against a gate another device has
   * since changed, cannot delete the vault. So does no vault, one made anew, or a retry of a
   * deletion that landed: a tombstone holds no `vault_tok` for an expectation to name.
   *
   * @example
   *   const tombstone = await vaultDB.delVault(scope, { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch })
   *   rememberEpoch(tombstone.vault_epoch)
   */
  async delVault(scope: VaultScope, expected: VaultDelExpectation): Promise<VaultTombstone> {
    const asked = heldScope(this, scope)
    const expectation = checkOutgoing(VDX.VaultDelExpectation, expected, 'delete expectation', 'removed')
    return await this.deletedVault(asked, expectation)
  }

  /** The tombstone the deletion leaves, as an {@link Outcome}: the non-throwing form of {@link VaultDB.delVault}. */
  tryDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<Outcome<VaultTombstone>> {
    return outcomeOf(() => this.delVault(scope, expected))
  }

  /** Delete the vault of `scope` through `doDelVault`, resolving the tombstone it leaves, checked: `stale_write` when it removed nothing. */
  private async deletedVault(scope: VaultScope, expectation: VaultDelExpectation): Promise<VaultTombstone> {
    const raw = await VaultDB.#hooks.doDelVault(this, scope, expectation)
    if (raw === null || raw === undefined) { throw Refusals.staleDel() }
    const tombstone = checkAnswer(VX.VaultTombstone, raw, 'a vault deletion', 'landed')
    return verifyConsistent(tombstone, scope, { kind: 'corrupt_record', message: wrongAnswerSays('a vault deletion', 'landed') })
  }

  /** Remove a vault whose stored vault record fails its checks, and no other: the escape hatch behind the package's `delDamagedVault`.
   * That is the vault `getVault` and `hello()` refuse as `damaged_vault`, which no Vault object
   * opens to `del()`. It reads the stored record through `doGetVault`, takes its `vault_tok`, and
   * removes as {@link VaultDB.delVault} does with `gate_epoch: null`. A vault record rewritten under
   * that `vault_tok` meanwhile is the same vault, and goes with it (`VAULTDB.md`, line 3.5).
   * Resolves the tombstone it leaves, or null when the scope holds no vault record.
   *
   * Refuses, removing nothing:
   *
   * * 'bad_option' when the vault record is sound: delete that vault through its own `del()`.
   * * 'damaged_vault' when the record is too damaged to say which vault it is: only the backend's
   *   own tools clear it.
   * * 'newer_format' when a newer safebyok may have written it: a device on the newer version
   *   opens it.
   * * 'stale_write' when the vault was replaced meanwhile.
   *
   * An adapter that hands each call on to another VaultDB's public verbs must hand this one on
   * too: its `doGetVault` meets the inner refusal, never the record, so this refuses
   * 'damaged_vault'. So does a backend whose server validates what it reads, as
   * `safebyok-graphql`'s does: there a damaged record is the backend's own to clear.
   */
  async delDamagedVault(scope: VaultScope): Promise<VaultTombstone | null> {
    const asked = heldScope(this, scope)
    let answer: StoredVault
    try {
      answer = await VaultDB.#hooks.doGetVault(this, asked)
    } catch (err) {
      // A damaged_vault from the adapter itself, as a VaultDB handing its calls on to another meets, leaves the record, and so its vault_tok, out of reach.
      if (isVaultError(err, 'damaged_vault')) { throw unnamedVaultRecord({ cause: err }) }
      throw err
    }
    const raw = checkAnswer(VDX.StoredVaultAnswer, answer, 'a vault read').vault
    if (raw === null || raw === undefined || isTombstone(raw)) { return null }
    if (mayBeNewer(raw)) { throw newerVaultRecord() }
    if (isSoundVaultRecord(raw, asked)) {
      throw new VaultError('bad_option', "That vault's stored record is sound, so it is not deleted here: a vault that opens is deleted through its Vault object's del(). Only a vault whose hello() refuses it as damaged_vault is deleted this way.")
    }
    const named = VDX.StoredVaultTok.safeParse(raw)
    if (! named.success) { throw unnamedVaultRecord() }
    return await this.deletedVault(asked, { vault_tok: named.data.vault_tok, gate_epoch: null })
  }

  /** The tombstone the deletion leaves, or null for no vault record, as an {@link Outcome}: the non-throwing form of {@link VaultDB.delDamagedVault}. */
  tryDelDamagedVault(scope: VaultScope): Promise<Outcome<VaultTombstone | null>> {
    return outcomeOf(() => this.delDamagedVault(scope))
  }
  // --

  // == [Watching]: subscribe, listenerFailed, watchTrouble

  /** Call `onChange` after any write touching `scope`, from this device or another, returning the unsubscribe.
   * The one verb with no `try` form, as it answers at once: it throws 'bad_option' for an
   * `onChange` that is no function. A backend without push never calls `onChange`: the vault
   * refreshes after its own writes, so it misses only other devices' writes.
   *
   * Nothing `onChange` throws or rejects with reaches the adapter or the write that rang it: it is
   * logged as an error and handed to the platform's `reportError` where there is one, and every
   * other listener is still called. Once unsubscribed, `onChange` is never called again. A second
   * unsubscribe does nothing, and a throw from the adapter's own unsubscribe is logged, never thrown.
   */
  subscribe(scope: VaultScope, onChange: () => void): () => void {
    const asked = heldScope(this, scope)
    OX.callback.parse(onChange)
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
    this.logger.error("A listener passed to subscribe threw, or returned a promise that rejected. The write it heard of is kept, and every other listener was called; the listener is the host's to mend.", { call: 'subscribe' }, asError(err))
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

  /** Read the scope's vault record exactly as stored, and every box of it split by {@link splitStoredBoxes}, in one atomic step: one statement, query or transaction.
   * `vault` is null when no vault record is stored; a store that keeps a tombstone in its place may
   * hand that up. Hand each box row to the split as a {@link StoredBox}, one that looks damaged as it
   * is. No write may land between the reads: that is the whole of what this owes beyond them. An
   * adapter relaying a server's `getVaultRecords` answers what it was sent.
   */
  protected abstract doGetVault(scope: VaultScope): Promise<StoredVault>
  /** Store `draft` if its scope holds no vault record, then read the vault as {@link VaultDB.doGetVault} does, all in one atomic step.
   * The vault record handed up is `draft`, or the one already there, untouched. Over a tombstone,
   * store `draft` with the tombstone's `vault_epoch`, and drop the tombstone in the same step:
   * `Expectations.newLifeOf` makes that record for a key-value backend. The boxes are of the vault
   * record handed up.
   */
  protected abstract doEnsureVault(draft: VaultDraft): Promise<StoredVault>
  /** Replace the stored vault record with `vaultRecord` if, and only if, it has `expected.vault_tok` and `expected.gate_epoch`, resolving it as stored.
   * Store it with its `vault_epoch` the stored one plus one, whatever it carries, and resolve the
   * record read back in that same step. Otherwise write nothing, and throw
   * `Refusals.staleVaultRecord(stored)` from that step, `stored` the vault record exactly as stored,
   * or null for none (a tombstone is none). A key-value backend asks
   * `Expectations.vaultRecordPutOf` and `Expectations.vaultRecordRefusalOf`. A server-side adapter
   * also refuses a vault record that moves `gate_epoch` back or leaves it where it is. How the record
   * is laid out in storage (columns, documents, one JSON value) is the adapter's own.
   */
  protected abstract doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<unknown>
  /** Read the box record under `boxlabel` exactly as stored, or null for none, if, and only if, the stored vault record has `expected.vault_tok`.
   * Compare the vault record in the same atomic step as the read of the box. Otherwise read
   * nothing more, and throw `Refusals.vaultMismatch()` from that step. A key-value backend reads
   * both rows and asks `Expectations.vaultMeets(storedVaultRecord, expected)`.
   */
  protected abstract doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown>
  /** Store `box` under its boxlabel if, and only if, the stored vault record has `expected.vault_tok` and the stored box is at `expected.revision_tok` (no box, for null).
   * Compare in the same atomic step as the write. Once written, resolve the record read back in that
   * same step (a `RETURNING`, a mutation's return value, a read in the transaction), as `doGetBox`
   * would hand it up.
   *
   * Otherwise write nothing, and throw from that same step:
   *
   * * `Refusals.vaultMismatch()` when the vault record is not the expected one: none, or another
   *   vault's.
   * * `Refusals.staleBox(stored)` when it is, but the box is not, `stored` the record under the
   *   boxlabel exactly as stored, damaged or not, or null for none.
   * * `Refusals.vaultFull(capacity)`, from a backend that keeps a limit, for a vault with no room.
   *
   * A key-value backend reads both rows and asks `Expectations.boxRefusalOf` which.
   */
  protected abstract doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown>
  /** Read how full the vault is in one step: a {@link Capacity}, with `Infinity` for a limit the backend does not keep.
   * Count its boxes and weigh their bytes as the backend weighs them. A box write refused for room
   * reports the same reckoning, with `Refusals.vaultFull(capacity)`.
   */
  protected abstract doGetCapacity(scope: VaultScope): Promise<unknown>
  /** Remove the box under `boxlabel`, whatever revision is stored, if, and only if, the stored vault record has `expected.vault_tok`.
   * Compare in the same atomic step as the removal, and resolve the {@link BoxDeletion} that step
   * found; a key-value backend asks `Expectations.deletionOf`, which compares the revision as the
   * listing reads it. Otherwise resolve null, removing nothing.
   */
  protected abstract doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown>
  /** Remove the vault record and every box of `scope` if, and only if, the stored vault record has `expected.vault_tok` and, unless it is null, `expected.gate_epoch`, leaving a tombstone.
   * Use one transaction, where the backend has them. Resolve the {@link VaultTombstone} read back in
   * that same step: the scope, and `vault_epoch` the vault's own plus one. On any miss, over a
   * tombstone or no vault record among them, resolve null, removing nothing.
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

/** The two calls {@link VaultDB.watchTrouble} hands a watch: one for when it fails, one for when it hears again. */
export type WatchTrouble = {
  /** Warn, with the backend's error, unless already warned in this failing streak. */
  failed:    (err: unknown) => void
  /** End a failing streak: the watch hears again. */
  delivered: () => void
}

/** Start the adapter's watch, returning its unsubscribe; a throw is made storage trouble by `storageTroubleOf`. */
const startedWatch = (start: () => () => void): (() => void) => {
  try {
    return start()
  } catch (err) {
    throw storageTroubleOf(err)
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

// == [Listing helpers]: splitStoredBoxes, checkedListing, isNameable, judgedBox, damagedOf, mayBeNewerBox, listingOf, isDamagedBox, byBoxlabel

/** Split the box rows a VaultDB read into the sound and the damaged, for `doGetVault` and `doEnsureVault` to answer with: the package judges damage, so an adapter adds one line.
 * A row whose record reads back as a box filed under its own boxlabel is sound, listed as its
 * {@link BoxSparse}. Any other is a {@link BoxDamaged} under the boxlabel the row is filed under:
 * `newer_format` for a record naming a `format` a newer safebyok may have written, `damaged`
 * otherwise. A row filed under a name that is no label is left out, as no verb could reach it.
 * Each list is sorted by boxlabel, and each entry frozen.
 *
 * @example
 *   protected async doGetVault(scope: VaultScope): Promise<StoredVault> {
 *     const { vaultRow, boxRows } = await this.getVaultRows(scope)   // one transaction
 *     return { vault: vaultRow ?? null, ...splitStoredBoxes(boxRows.map((row) => ({ boxlabel: row.boxlabel, box: row as StoredBox['box'] }))) }
 *   }
 */
export const splitStoredBoxes = (rows: readonly StoredBox[]): { boxes: BoxSparse[], damagedBoxes: BoxDamaged[] } => (
  listingOf(rows.filter((row) => isNameable(row.boxlabel)).map((row) => judgedBox(row.boxlabel, row.box)))
)

/** The listing an adapter answered a vault read with, checked again: `corrupt_record` for one in another shape.
 * Each sound box is judged as {@link splitStoredBoxes} judges a row, and listed damaged when it
 * fails; each damaged box is parsed, its word that it is damaged taken. Both lists come back sorted
 * by boxlabel and frozen.
 */
const checkedListing = (response: unknown): BoxListing => {
  const { boxes, damagedBoxes } = checkAnswer(VDX.ListingAnswer, response, 'a vault read')
  const sound = boxes.filter((box) => isNameable(box.boxlabel)).map((box) => judgedBox(box.boxlabel as string, box))
  const listing = listingOf([...sound, ...damagedBoxes.map((box) => Object.freeze(box))])
  return { boxes: Object.freeze(listing.boxes), damagedBoxes: Object.freeze(listing.damagedBoxes) }
}

/** True when a box is filed under a label, which a verb can reach. */
const isNameable = (boxlabel: unknown): boolean => CX.label.safeParse(boxlabel).success

/** A record filed under `boxlabel` as a listing shows it: its {@link BoxSparse} where `getBox` would take it, else a {@link BoxDamaged}. */
const judgedBox = (boxlabel: string, box: unknown): BoxSparse | BoxDamaged => {
  const checked = VDX.ListedBox.safeParse(box)
  if (checked.success && checked.data.boxlabel === boxlabel) { return boxSparseOf(checked.data) }
  return damagedOf(boxlabel, box)
}

/** A record filed under `boxlabel` that does not read back as its box, as a listing shows it, frozen: the revision it holds as text, or null, and whether a newer version may have written it. */
const damagedOf = (boxlabel: string, box: unknown): BoxDamaged => Object.freeze({
  boxlabel,
  revision_tok: VDX.StoredRevision.safeParse(box).data?.revision_tok ?? null,
  damage:       mayBeNewerBox(box) ? 'newer_format' : 'damaged',
})

/** The box record formats earlier versions of this package wrote: a record in one is older, never newer, and fails as damage does. */
const OlderBoxFormats: ReadonlySet<unknown> = new Set(['safebyok-box-v1', 'safebyok-box-v2', 'safebyok-box-v3', 'safebyok-box-v4', 'safebyok-box-v5', 'safebyok-box-v6', 'safebyok-box-v7'])

/** True when a stored box names a `format`, of any type, this version neither writes nor wrote before: a later version's, not damage. */
const mayBeNewerBox = (raw: unknown): boolean => {
  const format = fieldOf(raw, 'format')
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
// --

// == [Name checks]: heldScope, heldBoxlabel, heldName

/** The part of a backend's declarations that bounds the names it holds. */
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

// == [Storage and listener guards]: withMissChecked, staleChecked, fullChecked, withStaleVaultRecordChecked, unsaidVaultRecord, remade, boxStoredOf, invalidBox, callback, checked, checkOutgoing

/** `putting`, a box write, with what its `stale_write` or `vault_full` says of storage checked by `staleChecked` or `fullChecked`. */
const withMissChecked = async <ValT>(putting: Promise<ValT>, boxlabel: string): Promise<ValT> => {
  try {
    return await putting
  } catch (err) {
    if (isVaultError(err, 'stale_write')) { throw staleChecked(err, boxlabel) }
    if (isVaultError(err, 'vault_full')) { throw fullChecked(err) }
    throw err
  }
}

/** A box write's `stale_write`, its `box_stored` checked; `corrupt_record` when it does not say what is stored. */
const staleChecked = (err: VaultError, boxlabel: string): VaultError => {
  const said = err.meta ?? {}
  if (! ('box_stored' in said)) {
    return new VaultError('corrupt_record', "Storage refused a box write as stale, so nothing was written, but did not say what is stored under its boxlabel. The storage adapter needs a developer's look: its doPutBox throws Refusals.staleBox(stored).", { cause: err })
  }
  return remade(err, { box_stored: boxStoredOf(said.box_stored, boxlabel) })
}

/** A box write's `vault_full`, its `capacity` checked; `corrupt_record` when it carries none that reads as one. */
const fullChecked = (err: VaultError): VaultError => {
  const capacity = VDX.Capacity.safeParse(err.meta?.capacity)
  if (! capacity.success) {
    return new VaultError('corrupt_record', "Storage refused a box write as vault_full, so nothing was written, but did not say how full the vault is. The storage adapter needs a developer's look: its doPutBox throws Refusals.vaultFull(capacity).", { cause: err })
  }
  return remade(err, { capacity: capacity.data })
}

/** `putting`, an update of the vault record, its `stale_write`'s `vault_stored` checked as `getVault` checks a record.
 * A stored vault record that fails that check refuses as `getVault` does: 'damaged_vault' or
 * 'newer_format'. A stale write that does not say what is stored refuses as `corrupt_record`.
 */
const withStaleVaultRecordChecked = async <ValT>(putting: Promise<ValT>, scope: VaultScope): Promise<ValT> => {
  try {
    return await putting
  } catch (err) {
    if (! isVaultError(err, 'stale_write')) { throw err }
    const said = err.meta ?? {}
    if (! ('vault_stored' in said)) { throw unsaidVaultRecord({ cause: err }) }
    const stored: unknown = said.vault_stored
    throw remade(err, { vault_stored: stored === null || stored === undefined ? null : checkVaultRecord(stored, scope) })
  }
}

/** An update of the vault record refused without saying what is stored: the adapter's bug, `corrupt_record`. */
const unsaidVaultRecord = (opts?: ErrorOptions) => new VaultError('corrupt_record', "Storage refused an update of the vault record, so nothing was written, but did not say what is stored. The storage adapter needs a developer's look: its doPutVaultRecord throws Refusals.staleVaultRecord(stored).", opts)

/** `err` made again with `meta`, its kind, message and cause kept. */
const remade = (err: VaultError, meta: RefusalMeta): VaultError => (
  new VaultError(err.refusalkind, err.message, err.cause === undefined ? { meta } : { cause: err.cause, meta })
)

/** The record under `boxlabel` as a stale box write reports it: the box where `getBox` would take it, else a {@link BoxDamaged}, or null for none. */
const boxStoredOf = (raw: unknown, boxlabel: string): BoxRecord | BoxDamaged | null => {
  if (raw === null || raw === undefined) { return null }
  const box = BX.BoxRecord.safeParse(raw)
  return box.success && box.data.boxlabel === boxlabel ? box.data : damagedOf(boxlabel, raw)
}

/** A box handed to `putBox` that this package would not build: kind 'invalid_box', quoting none of it. */
const invalidBox = () => new VaultError('invalid_box', "Nothing was written: that box is not one this package builds. Hand a VaultDB's putBox only the boxes a vault seals.")

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
// --

// == [Vault record checks]: checkVaultRecord, checkPutVaultRecord, damagedVaultRecord, damagedVaultRecordSays, unnamedVaultRecord, newerVaultRecord, mayBeNewer, isSoundVaultRecord, others

/** A vault record read from storage for `scope`, once it passes its checks: 'newer_format' for a format a later version may write, 'damaged_vault' otherwise. */
const checkVaultRecord = (raw: unknown, scope: VaultScope): VaultRecord => {
  // A later safebyok may write what this one cannot read, which is no damage: it is said apart.
  if (mayBeNewer(raw)) { throw newerVaultRecord() }
  const vaultRecord = checked(VX.VaultRecord, raw, (opts) => damagedVaultRecord('did not read back in a shape this package knows: it is damaged, or was written by an older version of safebyok', opts))
  // A record that names some other scope is a record out of place, wherever it came from.
  return verifyConsistent(vaultRecord, scope, { kind: 'damaged_vault', message: damagedVaultRecordSays('names a different app, user or vault than the one asked for') })
}

/** The vault record an adapter handed back as `put` landed: a vault record of its scope, the same vault at the same `gate_epoch`; `corrupt_record` otherwise, quoting none of it. */
const checkPutVaultRecord = (raw: unknown, put: VaultRecord): VaultRecord => {
  const stored = checkAnswer(VX.VaultRecord, raw, 'an update of the vault record', 'landed')
  const { applabel, user_id, vaultlabel, vault_tok, gate_epoch } = put
  return verifyConsistent(stored, { applabel, user_id, vaultlabel, vault_tok, gate_epoch }, { kind: 'corrupt_record', message: wrongAnswerSays('an update of the vault record', 'landed') })
}

/** A vault record read from storage that fails its checks, as `said` says how: 'damaged_vault', quoting none of it. */
const damagedVaultRecord = (said: string, opts?: ErrorOptions) => new VaultError('damaged_vault', damagedVaultRecordSays(said), opts)

/** What {@link damagedVaultRecord} says. */
const damagedVaultRecordSays = (said: string): string => `This vault's stored record ${said}, so no vault unlocker (passphrase or passkey) can be tried against it, and the vault can't be opened. It was left as it is: restore it from a backup, or, if the user chooses to start over, delDamagedVault() clears it.`

const unnamedVaultRecord = (opts?: ErrorOptions) => new VaultError('damaged_vault', "This vault's stored record is too damaged to say which vault it is, so storage can't be told which one to remove, and nothing was removed. Its backend's own tools can clear it.", opts)

/** The refusal of a stored vault this version cannot read, which a newer one may have written: 'newer_format'. */
const newerVaultRecord = () => new VaultError('newer_format', "This vault's stored record is in a form this version of the app does not know. It may have been written by a newer version, which opens it, so it was left as it is: update the app and try again.")

/** The vault record formats earlier versions of this package wrote: a record in one is older, never newer, and fails as damage does. */
const OlderVaultRecordFormats: ReadonlySet<unknown> = new Set(['safebyok-vault-v1', 'safebyok-vault-v2', 'safebyok-vault-v3', 'safebyok-vault-v4', 'safebyok-vault-v5'])

/** True when a stored record names a `format`, of any type, this version neither writes nor wrote before: a later version's, not damage. */
const mayBeNewer = (raw: unknown): boolean => {
  // This is all this version can tell from damage. So any change to what a stored record may hold
  // -- a field, a shape, a kind of way in, or a range a check accepts -- bumps `format`.
  const format = fieldOf(raw, 'format')
  return format !== undefined && format !== VaultFormat && format !== TombstoneFormat && ! OlderVaultRecordFormats.has(format)
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
// --

// == [Box and answer checks]: checkStoredBox, damagedBox, checkPutBox, checkAnswer, wrongAnswer, wrongAnswerSays, jsonBytes

/** A box read from storage, as `getBox` holds it: a box's shape, under the boxlabel it was asked for; 'damaged_box' otherwise. */
const checkStoredBox = (raw: unknown, boxlabel: string): BoxRecord => {
  const box = checked(BX.BoxRecord, raw, (opts) => damagedBox('did not read back in a shape this package knows: it is damaged, or was written by an older version of safebyok', opts))
  // A record naming another boxlabel is out of place: a misfiling adapter, or a moved record.
  if (box.boxlabel !== boxlabel) { throw damagedBox('names a different boxlabel than the one it is stored under') }
  return box
}

/** A box read from storage that fails its checks, as `said` says how: 'damaged_box', quoting none of it.
 * It never quotes the boxlabel either: a label may still be a key pasted by mistake.
 */
const damagedBox = (said: string, opts?: ErrorOptions) => new VaultError('damaged_box', `That box's stored record ${said}, so it can't be read. It was left as it is; remove it, or store its whisper again over it.`, opts)

/** The box an adapter handed back as `put` landed: a box's shape, under the boxlabel and at the revision put; `corrupt_record` otherwise, quoting neither. */
const checkPutBox = (raw: unknown, put: BoxRecord): BoxRecord => {
  const box = checkAnswer(BX.BoxRecord, raw, 'a box write', 'landed')
  const { boxlabel, revision_tok } = put
  return verifyConsistent(box, { boxlabel, revision_tok }, { kind: 'corrupt_record', message: wrongAnswerSays('a box write', 'landed') })
}

/** An adapter's answer to `said` through `answerSchema`: one in another shape is the adapter's bug, `corrupt_record`, its check's 'bad_record' the cause. */
const checkAnswer = <AnswerT>(answerSchema: Z.ZodType<AnswerT>, raw: unknown, said: string, landed?: 'landed'): AnswerT => (
  checked(answerSchema, raw, (opts) => wrongAnswer(said, landed, opts))
)

/** The refusal of an adapter's answer to `said` that is not in the protocol's shape: `corrupt_record`, quoting none of it.
 * For a write or deletion, `landed` says it may have landed all the same.
 */
const wrongAnswer = (said: string, landed?: 'landed', opts?: ErrorOptions) => new VaultError('corrupt_record', wrongAnswerSays(said, landed), opts)

/** What {@link wrongAnswer} says. */
const wrongAnswerSays = (said: string, landed?: 'landed'): string => (landed === 'landed'
  ? `Storage says ${said} landed, but answered with what this package cannot read back, so whether it did is not known: reading the vault again shows what is stored. The storage adapter needs a developer's look: it wrote or reported something it should not have.`
  : `Storage answered ${said} in a shape this package does not know. The storage adapter needs a developer's look.`)

/** The UTF-8 bytes of `val`'s JSON: the weight the vault measures a record by against its storage's limits.
 * Every in-tree backend counts a record as no heavier.
 */
export const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --
