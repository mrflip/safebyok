import * as Z from 'zod/mini'
import { Box } from './box'
import { MaxUnlocks, WayinKindVals, VaultProps, VaultScope, type DamagedBox, type BoxSummary, type Sidecar } from './types'
import { VaultError, isVaultError } from './errors'
import * as Names from './names'
import { AnyTextValidators, NameFloor } from './validators'
import * as Refusals from './refusals'
import { asError, parseLogger, type VaultLogger } from './logger'
import { reportToPlatform } from './report-error'

// == [Expectations and records]: VaultPropsExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion, StoredBox

/**
 * What an update of the vault props was proven against: the vault and the unlock epoch of the
 * vault props the writer read. The update lands only while the standing vault props still have
 * both. Plain JSON, so it crosses any wire as-is.
 *
 * @example { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }
 */
export type VaultPropsExpectation = Z.infer<typeof VaultPropsExpectation>

const VaultPropsExpectation = Z.object({
  vault_id:         VaultProps.shape.vault_id,
  unlock_epoch:     VaultProps.shape.unlock_epoch,
})

/**
 * What a box update was written for and read: the vault and the vaultKey that sealed it -- its
 * `vault_id`, and the `vault_key_epoch` the box carries -- and the `revision_tok` of the box
 * the writer read under its boxlabel, or null when there was none. The update lands only while the
 * scope's standing vault props have that `vault_id` and that `vault_key_epoch`, and the standing
 * box has that `revision_tok` -- or, for null, while there is no box there at all. Plain
 * JSON, so it crosses any wire as-is.
 *
 * @example { vault_id: vaultProps.vault_id, revision_tok: prev?.revision_tok ?? null, vault_key_epoch: vaultProps.vault_key_epoch }
 */
export type BoxExpectation = Z.infer<typeof BoxExpectation>

const BoxExpectation = Z.object({
  vault_id:        VaultProps.shape.vault_id,
  revision_tok:    Z.nullable(Box.shape.revision_tok),
  vault_key_epoch: VaultProps.shape.vault_key_epoch,
})

/**
 * What the deletion of a vault was aimed at: the vault the caller means to remove whole. The
 * deletion lands only while the scope's standing vault props have that `vault_id`, so a device
 * that missed a vault being deleted and made anew never deletes the successor. Plain JSON, so it
 * crosses any wire as-is.
 *
 * @example { vault_id: vaultProps.vault_id }
 */
export type VaultDelExpectation = Z.infer<typeof VaultDelExpectation>

const VaultDelExpectation = Z.object({
  vault_id: VaultProps.shape.vault_id,
})

/**
 * What the deletion of a box was aimed at: the vault it stands in, and the `revision_tok`
 * the deleting device read for it -- or null, for a box listed as damaged with none it could
 * read. The deletion lands only while the scope's standing vault props have that `vault_id`, and
 * then removes whatever box stands under the boxlabel: within the right vault, a deletion
 * wins over any write. The revision only lets storage say whether what it removed was the one the
 * device meant (a {@link BoxDeletion}). Plain JSON, so it crosses any wire as-is.
 *
 * @example { vault_id: vaultProps.vault_id, revision_tok: listed.revision_tok }
 */
export type BoxDelExpectation = Z.infer<typeof BoxDelExpectation>

const BoxDelExpectation = Z.object({
  vault_id:     VaultProps.shape.vault_id,
  revision_tok: Z.nullable(Box.shape.revision_tok),
})

/**
 * What a box deletion that landed found under its boxlabel, as storage reports it from the
 * same atomic step as the removal: `deleted`, the revision its {@link BoxDelExpectation}
 * named (or, for a null one, a record holding none it could read); `deleted_other`, a record that
 * was not that revision -- written over meanwhile, or holding one where none was expected -- which
 * was removed all the same; or `absent`, nothing to remove. Plain JSON, so it crosses any wire
 * as-is.
 *
 * @example { outcome: 'deleted_other' }
 */
export type BoxDeletion = Z.infer<typeof BoxDeletion>

const BoxDeletion = Z.object({
  outcome: Z.enum(['deleted', 'deleted_other', 'absent']),
})

/**
 * One box as a VaultDB's `doListBoxes` hands it up: the boxlabel it is stored under -- the
 * one `doGetBox` and `doDelBox` reach it by -- and its record exactly as stored, damaged or
 * not. The listing checks the record; the boxlabel is what lets a damaged one still be named, and
 * so deleted or overwritten.
 *
 * @example { boxlabel: 'anthropic', box: storedRecord }
 */
export type StoredBox = { boxlabel: string, box: unknown }
// --

// == [Options]: VaultDBOpts

/**
 * What an adapter's factory takes from the host, beside its backend's own options: an optional
 * `logger`. The adapter hands its options to `super()`, which settles the logger once, as the
 * VaultDB is made: the host's, guarded, or the default logger when the host gave none.
 *
 * @example
 *   export type AcmeVaultDBOpts = VaultDBOpts & { client: AcmeClient }
 * @example
 *   constructor(opts: AcmeVaultDBOpts) { super(opts); this.client = opts.client }
 */
export type VaultDBOpts = {
  /**
   * Where the VaultDB says what it has nobody to throw to: a subscriber's listener that threw, a
   * watch that failed to start or dropped. Fixed when the VaultDB is made, and not the logger
   * `Vault.make` is given, which is the vault's alone. A vault opened with no logger of its own
   * uses this one, so give it here, once, to have one logger hear both. Without one (or with null),
   * the default logger. Kind 'bad_option' for anything else that is not a VaultLogger.
   */
  logger?: VaultLogger | null | undefined
}
// --

/**
 * Remote storage for vault records, as the host application plugs it in: extend this class and
 * implement its `do*` methods against your backend, one for each verb safebyok calls. That is the
 * whole job -- you are a shelf, not a safe:
 *
 *  * **Store what you are handed, return what you stored.** Every record is plain JSON (binary
 *    fields are base64url text), so any backend that can hold JSON can hold a vault, as-is.
 *  * **Never look inside.** Every secret field arrives encrypted; nothing you hold can open a
 *    vault, and nothing safebyok does ever needs you to understand a record -- only to compare a
 *    few unencrypted fields (`vault_id`, `unlock_epoch`, `vault_key_epoch`, `revision_tok`) before a
 *    write.
 *  * **Write only as expected.** Every update and deletion carries an expectation of what
 *    stands in storage, and writes only if it still does: check and write in one atomic step (a
 *    transaction, a conditional write), and resolve `false` when the expectation fails. A box
 *    write resolves `null` instead, and when it lands, the record as you now hold it, read back in
 *    the same step. A box deletion resolves `null` too, and when it lands, what it removed
 *    (a {@link BoxDeletion}): within the right vault, a deletion wins over any revision,
 *    and only reports whether the one it removed was the one it named.
 *  * **Enforce who may reach which rows.** Your backend should let a signed-in user reach only
 *    their own records: safebyok's encryption protects the contents, your authorization decides
 *    who may fetch or overwrite them at all. When no one is signed in, or someone other than the
 *    scope's `user_id` is, refuse with a VaultError of kind `identity_revoked`: the vault locks
 *    itself on it, so say it only when the user really is gone -- never for a passing fault, which
 *    is `storage_unavailable`. When the signed-in user is the scope's own but may not make this
 *    call, refuse with kind `not_permitted`, which locks nothing.
 *  * **Don't repair.** Return a record exactly as stored, or null when there is none. safebyok
 *    validates everything it reads back; a damaged record is safebyok's to refuse, never yours to
 *    fix or quietly drop.
 *
 * The public verbs -- `getVaultProps`, `putBox` and the rest -- wrap your `do*` methods with the
 * checks every adapter owes: names, scope, records and expectations on the way in, the shape of
 * every record on the way out, `stale_write` for a failed expectation, and `storage_unavailable`
 * (your own error as its `cause`) for anything you throw that is not already a VaultError. They
 * also own what every adapter would otherwise write again: `subscribe` calls each listener so
 * that nothing it throws reaches your code, and its unsubscribe runs once; and `listBoxRecords`
 * lists a vault as stored, for a server to serve. Implement the `do*` methods, and hand `super()`
 * the host's {@link VaultDBOpts}; never override the public verbs, but for
 * `listBoxRecords` where your backend lists more cheaply. To refuse, throw what `Refusals` makes.
 * The package's `VAULTDB.md` is the whole contract, line by line, and `describeVaultDB` (from
 * `safebyok/testing`) tests it so.
 *
 * Every name handed to a public verb -- the scope's three and a boxlabel -- is held, before your
 * `do*` method sees it, to what any store holds and to what yours declares: the floor every name
 * is held to (`NameFloor`: well-formed, NFC, no control characters, no `^`, at most 1 KiB), and
 * no more than {@link maxNameBytes}. Nothing turns these off. A
 * host's own `validators` are the vault's, checked where a name enters it, never here: a verb
 * takes any name above the floor, as a server serving several clients must. So a VaultDB that
 * hands each call on to another VaultDB's public verbs passes each name through as it came.
 */
export abstract class VaultDB {
  // == [Backend limits]: maxRecordBytes, maxVaultBytes, maxBoxes, maxNameBytes

  /**
   * The most this backend holds in one record, in bytes: a plain fact about the backend, or
   * `Infinity` when it sets no per-record limit. A vault refuses to open with a `maxWhisperBytes`
   * over half of it, leaving room for encoding and the record's other fields; and `putBox`
   * refuses, with kind `box_too_large`, a box that with its scope weighs more than this
   * as the UTF-8 bytes of its JSON -- a large sidecar or long names can make one so.
   */
  abstract readonly maxRecordBytes: number

  /**
   * The most this backend holds of one vault in all, in bytes as stored -- every box
   * together -- or `Infinity` when it sets no such limit. Declare what the backend can still
   * list and delete whole: a backend that reads a vault in one transaction under a read budget
   * declares the share of that budget its heaviest verb leaves. A vault refuses to open when its
   * `maxBoxes` boxes might not fit in it, each counted at twice `maxWhisperBytes` (room
   * for its whisper and sidecar together, their encoding, and the backend's own counting) and
   * 1 KiB for its other fields, which covers them at their largest under the default validators.
   * And since a host's validators may admit names of any length, each `putBox()` measures them: it
   * refuses, with kind `vault_full`, a new box that would take the vault past this limit, each
   * box counted at twice `maxWhisperBytes` and the UTF-8 bytes of its scope and boxlabel as
   * JSON, with a little more for its fixed-size fields. That total is a conservative estimate, made before the
   * box is sealed, so at a limit declared exactly tight it may refuse a write that would just
   * have fit; `maxRecordBytes`, by contrast, is checked on the real serialized bytes. A backend
   * that also enforces a limit of its own sets it above what this admits, and refuses a box write past it with a
   * VaultError of kind `vault_full`. A backend that does not hold to the limit it declares, or
   * a vault opened with limits that disagree with its backend's, is undefined behaviour: not a
   * bug we will fix, and not one whose outcome we promise.
   */
  abstract readonly maxVaultBytes: number

  /**
   * The most boxes this backend holds in one vault, a whole number, or `Infinity` when it sets
   * no such limit: each backend sets its own, and one whose limit crosses a wire or is stored,
   * where `Infinity` cannot go, sets a large whole number instead. A vault refuses to open with a
   * `maxBoxes` above it, with kind `bad_option`, and given none opens with the smaller of this
   * and `MaxBoxes`. A backend with a finite limit refuses a new box in a vault already
   * holding that many with a VaultError of kind `vault_full`, writing nothing, on a best effort:
   * writes made one after another never pass it, while writers racing for the last places may
   * take a vault a few past (`VAULTDB.md`, lines 4.1 to 4.6). It never refuses for the count a
   * box that replaces one already there.
   */
  abstract readonly maxBoxes: number

  /**
   * The most bytes of UTF-8 this backend holds in one name -- an applabel, a user_id, a vaultlabel
   * or a boxlabel -- or `Infinity` when it holds any name the floor admits (1 KiB). Every public
   * verb refuses a longer name with kind `bad_label` before the backend sees it. Declare what the
   * backend's keys and indexes hold: a store whose key holds every name of a box together
   * declares its share of the key's limit.
   */
  abstract readonly maxNameBytes: number
  // --

  // == [Constructor and logger]: #logger, constructor, logger

  /** The logger this VaultDB was made with, guarded: private, so that nothing can put another in its place. */
  readonly #logger: VaultLogger

  /**
   * @param opts - The host's options, as the adapter's factory was handed them: the base class reads
   *   only `logger`, the default logger when there is none. Kind 'bad_option' for a `logger` that is
   *   not a VaultLogger.
   */
  constructor(opts: VaultDBOpts) {
    // Generous to a subclass written in JavaScript that hands super() nothing.
    this.#logger = parseLogger((opts as VaultDBOpts | null | undefined)?.logger)
  }

  /**
   * Where this VaultDB says what it has nobody to throw to: always a logger, fixed when it is made,
   * and guarded, so a logger that throws breaks nothing. Read only, and kept off the VaultDB
   * itself, so a VaultDB logged, spread or compared never shows or copies a host's logger.
   * `Vault.make` and `VaultProvider` use it when they are given no logger of their own.
   */
  get logger(): VaultLogger { return this.#logger }
  // --

  // == [Vault props verbs]: getVaultProps, ensureVaultProps, putVaultProps

  // ------------------------------------------------------------------- the verbs safebyok calls

  /**
   * The vault props, validated, or null when the vault has never been created. Stored vault props
   * that fail their checks are refused as `corrupt_record`, and those a newer safebyok may have
   * written -- a `format`, wayinkind or number of wayins this version does not know -- as
   * `newer_format`.
   */
  async getVaultProps(scope: VaultScope): Promise<VaultProps | null> {
    const asked = heldScope(this, scope)
    const raw = await fromStorage(() => this.doGetVaultProps(asked))
    if (raw === null || raw === undefined) { return null }
    return checkVaultProps(raw, asked)
  }

  /**
   * Fetch the vault props standing in `vaultProps`' scope, creating them from `vaultProps` only if
   * the scope holds none, in one atomic step. Returns whichever vault props stand there afterwards:
   * the given ones when this call created them, or, when the vault already existed -- made by
   * another device, perhaps in the same moment -- the standing ones, exactly as stored, untouched
   * and with their own `vault_id`. A caller tells the two apart by comparing the `vault_id` it gets
   * back with the one it drafted. Vault props this package would not write -- a name in them below
   * the floor included -- are refused with kind `bad_record`, before storage sees them; a name in
   * them the floor admits but longer than the backend holds, with kind `bad_label`.
   */
  async ensureVaultProps(vaultProps: VaultProps): Promise<VaultProps> {
    const outgoing = checkOutgoing(VaultProps, vaultProps, 'vault props record')
    const asked = heldScope(this, outgoing)
    const raw = await fromStorage(() => this.doEnsureVaultProps(outgoing))
    return checkVaultProps(raw, asked)
  }

  /**
   * Replace the vault props with `vaultProps`, only while the standing ones still have the
   * `vault_id` and `unlock_epoch` in `expected`. Refuses with kind `stale_write` otherwise --
   * including when no vault props stand at all -- and writes nothing. Vault props or an `expected`
   * this package would not build are refused with kind `bad_record`, before storage sees them, as
   * `ensureVaultProps` refuses them. A vault's `vault_id` never changes, so `vaultProps` must
   * carry the one in `expected`: kind 'bad_record' otherwise.
   */
  async putVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<void> {
    const outgoing = checkOutgoing(VaultProps, vaultProps, 'vault props record')
    heldScope(this, outgoing)
    const expectation = checkOutgoing(VaultPropsExpectation, expected, 'vault props expectation')
    if (outgoing.vault_id !== expectation.vault_id) {
      throw new VaultError('bad_record', "putVaultProps replaces a vault's props within that vault: the vault props' vault_id must be the expected one, as a vault_id never changes.")
    }
    const landed = await fromStorage(() => this.doPutVaultProps(outgoing, expectation))
    if (! landed) { throw Refusals.staleWrite('vaultProps') }
  }
  // --

  // == [Box verbs]: getBox, listBoxes, listBoxRecords, putBox

  /** One box, validated, or null when there is none under that boxlabel. */
  async getBox(scope: VaultScope, boxlabel: string): Promise<Box | null> {
    const asked = heldScope(this, scope)
    const label = heldBoxlabel(this, boxlabel)
    const raw = await fromStorage(() => this.doGetBox(asked, label))
    if (raw === null || raw === undefined) { return null }
    return checkStoredBox(raw, label)
  }

  /**
   * Visible fields of every box in the vault -- ciphered fields stripped, the sidecar as the
   * JSON value it holds -- valid while locked, sorted by boxlabel, character by character (UTF-16
   * code unit, never by a locale), so every device lists in one order. A box whose record does
   * not read back as one, or names another boxlabel than it is stored under, is listed as a
   * {@link DamagedBox} rather than refused, so one bad record never hides the rest. A row
   * stored under a name below the floor, which no verb could reach, is not listed at all.
   */
  async listBoxes(scope: VaultScope): Promise<(BoxSummary | DamagedBox)[]> {
    const asked = heldScope(this, scope)
    const stored = await fromStorage(() => this.doListBoxes(asked))
    return stored
      .filter((entry) => isNameable(entry))
      .map((entry) => listedOrDamaged(entry))
      .toSorted((one, two) => byCodeUnit(one.boxlabel, two.boxlabel))
  }

  /**
   * Every box in the vault as stored, each with its two ciphered fields left out: what a server
   * hands a browser's VaultDB, whose own listing then checks them. `listBoxes` gives summaries
   * instead, the shape a vault shows, which a VaultDB's adapter may not hand up. Each record is as
   * the adapter handed it -- damaged ones too, unchecked -- in no particular order; an entry filed
   * under a name below the floor, which no verb could reach, is left out, as `listBoxes` leaves
   * it. Refuses as `listBoxes` does. An adapter whose backend lists a vault more cheaply in one
   * query may override it.
   *
   * @example
   *   const resolvers = { safebyokListBoxes: (_parent, { scope }, ctx) => vaultDBFor(ctx).listBoxRecords(scope) }
   */
  async listBoxRecords(scope: VaultScope): Promise<unknown[]> {
    const asked = heldScope(this, scope)
    const stored = await fromStorage(() => this.doListBoxes(asked))
    return stored
      .filter((entry) => isNameable(entry))
      .map(({ box }) => withoutCiphered(box))
  }

  /**
   * Write `box` under its boxlabel, only while the scope's standing vault props have the
   * `vault_id` and `vault_key_epoch` in `expected` and the standing box has its `revision_tok`
   * (or, for null, there is none). Refuses with kind `stale_write` otherwise -- including when the
   * scope holds no vault props -- and writes nothing. A backend that holds each vault to a limit of
   * its own refuses a write past it with kind `vault_full`, writing nothing. A box heavier than the
   * backend's `maxRecordBytes` is refused with kind `box_too_large` before storage sees it, and
   * a box or an `expected` this package would not build with kind `bad_record`: a missing
   * box, or one whose boxlabel is below the floor, included. A `scope` below the floor, or a
   * name the floor admits but longer than the backend holds, is kind `bad_label`. A box is
   * written under the vaultKey it was sealed with, so its `vault_key_epoch` must be the one in
   * `expected`: kind 'bad_record' otherwise.
   *
   * Resolves the box as storage now holds it, handed back by the same atomic step as the write
   * and held to the check `getBox` makes: field for field the one written, from an adapter that
   * keeps its contract. One that fails that check is refused as `corrupt_record`, though the write
   * may have landed: the adapter wrote something it cannot read back.
   */
  async putBox(scope: VaultScope, box: Box, expected: BoxExpectation): Promise<Box> {
    const asked = heldScope(this, scope)
    const outgoing = checkOutgoing(Box, box, 'box')
    heldBoxlabel(this, outgoing.boxlabel)
    const expectation = checkOutgoing(BoxExpectation, expected, 'box expectation')
    if (outgoing.vault_key_epoch !== expectation.vault_key_epoch) {
      throw new VaultError('bad_record', "putBox writes a box under the vaultKey it was sealed with: the box's vault_key_epoch must be the expected one.")
    }
    const recordBytes = jsonBytes({ ...asked, ...outgoing })
    if (recordBytes > this.maxRecordBytes) {
      throw new VaultError('box_too_large', `That box weighs ${String(recordBytes)} bytes, over the ${String(this.maxRecordBytes)} its storage holds in one record, so nothing was written: store a smaller whisper or sidecar, or under a shorter boxlabel.`)
    }
    const stored = await fromStorage(() => this.doPutBox(asked, outgoing, expectation))
    if (stored === null) { throw Refusals.staleWrite('box') }
    return writtenBack('a box write', () => checkStoredBox(stored, outgoing.boxlabel))
  }
  // --

  // == [Delete verbs]: delBox, delVault, delDamagedVault

  /**
   * Remove the box under `boxlabel`, whatever revision stands, only while the scope's standing
   * vault props have the `vault_id` in `expected`. Refuses with kind `stale_write` otherwise --
   * including when the scope holds no vault props -- and removes nothing. An `expected` this
   * package would not build is refused with kind `bad_record`, removing nothing.
   *
   * Resolves what storage found, from the same atomic step as the removal: `deleted` when it
   * removed the revision `expected` names (for a null `revision_tok`, a record holding none it could
   * read), `deleted_other` when it removed some other record, and `absent` when there was none. An
   * answer in any other shape is refused as `corrupt_record`, though the deletion may have
   * landed. Deleted is gone: nothing of the record is kept, and a `putBox` expecting the revision
   * it removed is refused with kind `stale_write`.
   *
   * @example
   *   const { outcome } = await vaultDB.delBox(scope, 'anthropic', { vault_id: vaultProps.vault_id, revision_tok: listed.revision_tok })
   */
  async delBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<BoxDeletion> {
    const asked = heldScope(this, scope)
    const label = heldBoxlabel(this, boxlabel)
    const expectation = checkOutgoing(BoxDelExpectation, expected, 'delete expectation', 'removed')
    const deletion = await fromStorage(() => this.doDelBox(asked, label, expectation))
    if (deletion === null) { throw Refusals.staleWrite('del') }
    return writtenBack('a deletion', () => checkAnswer(BoxDeletion, deletion, 'a deletion'))
  }

  /**
   * Remove the vault props and every box -- the backend's part of deleting a vault -- only while
   * the standing vault props have the `vault_id` in `expected`. Refuses with kind `stale_write`
   * otherwise -- including when the scope holds no vault props -- and removes nothing. An
   * `expected` this package would not build is refused with kind `bad_record`, removing nothing.
   */
  async delVault(scope: VaultScope, expected: VaultDelExpectation): Promise<void> {
    const asked = heldScope(this, scope)
    const expectation = checkOutgoing(VaultDelExpectation, expected, 'delete expectation', 'removed')
    const landed = await fromStorage(() => this.doDelVault(asked, expectation))
    if (! landed) { throw Refusals.staleWrite('del') }
  }

  /**
   * Remove a vault whose stored vault props fail their checks -- the one vault `getVaultProps`
   * refuses as `corrupt_record`, which a vault's `hello()` says as `damaged_vault` -- and no other: the
   * escape hatch behind `delDamagedVault`, for a vault that no handle can be opened on to
   * `del()`. It reads the vault props as stored, takes the `vault_id` out of them, and removes
   * the vault props and every box only while the standing vault props still have that
   * `vault_id` (`delVault`'s own expectation). Resolves quietly when the scope holds no vault
   * props. Refuses with kind `bad_option` when the vault props stand sound, and removes nothing,
   * since a sound vault is deleted through its handle's `del()`; with kind `damaged_vault`,
   * removing nothing, when the record is too damaged to name the vault it belongs to (which only
   * the backend's own tools can clear); with kind `newer_format`, removing nothing, when it may
   * have been written by a newer safebyok, in a `format`, wayinkind or number of wayins this one
   * does not know, and which a device on the newer version opens: it is told from damage by those
   * three, and where it cannot be told, it is refused; and with kind `stale_write` when the vault
   * was replaced meanwhile. Vault props rewritten under the same `vault_id` between the read and
   * the deletion are the same vault, and are deleted with it (line 3.5).
   *
   * An adapter that hands each call on to another VaultDB's public verbs hands this one on too:
   * its `doGetVaultProps` would meet the inner adapter's refusal of the damaged record, never the
   * record, and so could not name the vault. So does a backend whose server validates what it
   * reads, as `safebyok-graphql`'s: there a damaged record is the backend's own to clear.
   */
  async delDamagedVault(scope: VaultScope): Promise<void> {
    const asked = heldScope(this, scope)
    const raw = await readStoredVaultProps(() => this.doGetVaultProps(asked))
    if (raw === null || raw === undefined) { return }
    if (mayBeNewer(raw)) { throw newerVaultProps() }
    if (isSoundVaultProps(raw, asked)) {
      throw new VaultError('bad_option', "That vault's stored props are sound, so it is not deleted here: a vault that opens is deleted through its handle's del(). Only a vault whose hello() refuses it as damaged_vault is deleted this way.")
    }
    const named = StoredVaultId.safeParse(raw)
    if (! named.success) { throw unnamedVaultProps() }
    const landed = await fromStorage(() => this.doDelVault(asked, { vault_id: named.data.vault_id }))
    if (! landed) { throw Refusals.staleWrite('del') }
  }
  // --

  // == [Watching]: subscribe, listenerFailed, watchTrouble

  /**
   * Calls `onChange` after any write touching `scope`, from this device or another; returns the
   * unsubscribe. A backend without push never calls: safebyok refreshes after its own writes
   * regardless, so all it loses is news of *other* devices' writes.
   *
   * `onChange` is called so that nothing it throws, and no promise it returns that rejects, reaches
   * the adapter or the write that rang it: each failure is logged through this VaultDB's logger
   * (`error`), and handed to the platform's `reportError` too where there is one (a browser's),
   * and every other listener is still called. Once unsubscribed, `onChange` is never called again,
   * whatever the backend delivers late. The unsubscribe ends the watch once: a second call does
   * nothing, and one the adapter's own unsubscribe throws from is logged, never thrown.
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

  /** Says a subscriber's listener failed: through the logger, and to the platform where it reports errors. */
  private listenerFailed(err: unknown): void {
    this.logger.error("A listener passed to subscribe threw, or returned a promise that rejected. The write it heard of stands, and every other listener was called; the listener is the host's to mend.", { call: 'subscribe' }, asError(err))
    reportToPlatform(err)
  }

  /**
   * A watch's trouble, said through this VaultDB's logger: for a `doSubscribe` whose backend tells
   * it when its watch fails to start or drops. `failed(err)` warns with `message` and the backend's
   * error, once for a failing streak; `delivered()`, called whenever the watch hears again, ends the
   * streak. Neither calls `onChange`: a watch that fails calls it too, so the vault reads again and
   * meets the trouble itself (VAULTDB.md line 6.2).
   *
   * @param message - What failed and what it costs, calmly, naming no scope or record.
   * @returns The streak's two calls, for one watch.
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

  // == [The half you write]: doGetVaultProps, doEnsureVaultProps, doDelVault, doSubscribe, others

  // --------------------------------------------------------------------------- the half you write

  /** The stored vault props record for `scope`, exactly as saved, or null when there is none. */
  protected abstract doGetVaultProps(scope: VaultScope): Promise<unknown>
  /**
   * Store `vaultProps` if its scope holds none, then return the vault props standing there, exactly
   * as stored: `vaultProps` itself, or the ones already there, untouched. Find and insert in one
   * atomic step where the backend allows, so two devices creating at once settle on one vault.
   */
  protected abstract doEnsureVaultProps(vaultProps: VaultProps): Promise<unknown>
  /**
   * Replace the standing vault props with `vaultProps` if, and only if, they have
   * `expected.vault_id` and `expected.unlock_epoch`. True when they were written; false, writing
   * nothing, when the expectation failed or no vault props stand.
   */
  protected abstract doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean>
  /** The stored box record under `boxlabel`, exactly as saved, or null when there is none. */
  protected abstract doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown>
  /**
   * Every box in `scope`, in any order, each as a {@link StoredBox}: the boxlabel it is
   * stored under, and its record exactly as stored -- whole, or, where the backend can project,
   * without its two ciphered fields, `box_key_wrapped` and `whisper_ciphered`. Keep `format`
   * and every other field, and hand up a record that looks damaged as it is: the listing marks it.
   */
  protected abstract doListBoxes(scope: VaultScope): Promise<StoredBox[]>
  /**
   * Store `box` under its boxlabel if, and only if, the scope's standing vault props have
   * `expected.vault_id` and `expected.vault_key_epoch`, and the standing box has
   * `expected.revision_tok` -- or, when that is null, no box stands there: all compared in the
   * same atomic step as the write. Resolves the record as stored once written, read back in that
   * same step (a `RETURNING`, a mutation's return value, a read in the transaction), exactly as a
   * `doGetBox` would hand it up; null, writing nothing, otherwise.
   */
  protected abstract doPutBox(scope: VaultScope, box: Box, expected: BoxExpectation): Promise<unknown>
  /**
   * Remove the box under `boxlabel`, whatever revision stands, if, and only if, the scope's
   * standing vault props have `expected.vault_id`: compared in the same atomic step as the removal.
   * Resolves, once those vault props stand, a {@link BoxDeletion} saying what that step
   * removed -- `{ outcome: 'deleted' }` for a record at `expected.revision_tok` (for null, one
   * holding no revision a read could take as one: `Expectations.deletionOf` compares as the
   * listing reads), `{ outcome: 'deleted_other' }` for any other record, `{ outcome: 'absent' }`
   * when there was none; null, removing nothing, otherwise.
   */
  protected abstract doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown>
  /**
   * Remove the vault props and every box of `scope` if, and only if, the standing vault props
   * have `expected.vault_id` -- in one transaction, where the backend has them. True when removed;
   * false, removing nothing, otherwise.
   */
  protected abstract doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean>
  /**
   * Call `onChange` after any write touching `scope`, and return the unsubscribe. The default
   * never calls; a backend with live queries or push (Convex, a websocket) overrides it.
   */
  protected doSubscribe(_scope: VaultScope, _onChange: () => void): () => void {
    return noUnsubscribing
  }
  // --
}

// == [Watch helpers]: noUnsubscribing, WatchTrouble, startedWatch, heedListener, heedRejection

const noUnsubscribing = (): void => undefined

/**
 * What {@link VaultDB.watchTrouble} hands a watch: `failed`, to say it failed, once for a failing
 * streak; and `delivered`, to end the streak when it hears again.
 */
export type WatchTrouble = {
  /** Warns, with the backend's error, unless it has already for this failing streak. */
  failed:    (err: unknown) => void
  /** Ends a failing streak: the watch hears again. */
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

/**
 * Calls a subscriber's `onChange`, so that nothing it throws, and no promise it hands back that
 * rejects, escapes: each such failure goes to `failed`.
 */
const heedListener = (onChange: () => unknown, failed: (err: unknown) => void): void => {
  try {
    void heedRejection(onChange(), failed)
  } catch (err) {
    failed(err)
  }
}

/** Settles what a listener returned -- a promise, or anything else, which settles at once -- handing a rejection to `failed`. */
const heedRejection = async (returned: unknown, failed: (err: unknown) => void): Promise<void> => {
  try {
    await returned
  } catch (err) {
    failed(err)
  }
}
// --

// == [Listing helpers]: withoutCiphered, ListedBox, isNameable, listedOrDamaged, summaryOf, byCodeUnit

/** A stored box as {@link VaultDB.listBoxRecords} hands it on: its two ciphered fields left out, anything else as it came. */
const withoutCiphered = (box: unknown): unknown => {
  if (typeof box !== 'object' || box === null || Array.isArray(box)) { return box }
  const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = box as Record<string, unknown>
  return listed
}

/**
 * A box as the list verb's adapter half may hand it back: every field but the two ciphered
 * ones, `format` included, so a backend that projects server-side is validated like one that
 * returns whole records (whose ciphered fields this strips).
 */
const ListedBox = Z.omit(Box, { box_key_wrapped: true, whisper_ciphered: true })

/**
 * True when a listed box is stored under a name above the floor, which a verb can reach
 * whatever the vault's checks: a vault deletes a box by the name it was stored under.
 */
const isNameable = (stored: StoredBox): boolean => NameFloor.safeParse((stored as { boxlabel?: unknown }).boxlabel).success

/**
 * One nameable stored box as the listing shows it: its summary, or -- when its record fails
 * the check (its names held to the floor among it), or names another boxlabel than it
 * is stored under, as `getBox` would refuse it -- a {@link DamagedBox} under the boxlabel it
 * is stored under. A name the vault's own validators refuse is no damage: it was stored
 * under other checks, and lists as it stands.
 */
const listedOrDamaged = ({ boxlabel, box }: StoredBox): BoxSummary | DamagedBox => {
  const checked = ListedBox.safeParse(box)
  const sound = checked.success && checked.data.boxlabel === boxlabel
  return sound ? summaryOf(checked.data) : { boxlabel, damaged: true, revision_tok: StoredRevision.safeParse(box).data?.revision_tok ?? null }
}

/** The one field of a damaged box the listing keeps, when the record holds it as text: what a write over it names. */
const StoredRevision = Z.object({ revision_tok: Box.shape.revision_tok })

/**
 * A listed box's summary: its visible fields, and its sidecar as the JSON value its record holds
 * (`sidecar_json` is JSON text, as the record's check has found).
 */
const summaryOf = (listed: Z.infer<typeof ListedBox>): BoxSummary => {
  const { boxlabel, revision_tok, vault_key_epoch, sidecar_json, registered_at, written_at } = listed
  return { boxlabel, revision_tok, vault_key_epoch, sidecar: JSON.parse(sidecar_json) as Sidecar, registered_at, written_at, damaged: false }
}

/** Two names in one order on every device: character by character, by UTF-16 code unit, never by a locale. */
const byCodeUnit = (one: string, two: string): number => {
  if (one === two) { return 0 }
  return one < two ? -1 : 1
}
// --

// == [Name checks]: FloorRules, heldScope, heldBoxlabel, heldName

/** The checks a public verb runs on a name: the floor beneath every name, and nothing a host chose. */
const FloorRules: Names.NameRules = Names.rulesOf(AnyTextValidators)

/** What a backend declares about the names it holds. */
type NameFacts = Pick<VaultDB, 'maxNameBytes'>

/**
 * `scope`, once each of its names passes the floor and fits the backend: kind 'bad_label'
 * otherwise, naming the name and the rule, quoting none of it.
 */
const heldScope = (facts: NameFacts, scope: unknown): VaultScope => {
  const asked = Names.checkScope(FloorRules, scope)
  heldName(facts, 'applabel', asked.applabel)
  heldName(facts, 'user_id', asked.user_id)
  heldName(facts, 'vaultlabel', asked.vaultlabel)
  return asked
}

/** `boxlabel`, once it passes the floor and fits the backend: kind 'bad_label' otherwise. */
const heldBoxlabel = (facts: NameFacts, boxlabel: unknown): string => heldName(facts, 'boxlabel', Names.checkFloor('boxlabel', boxlabel))

/**
 * `part`, a name, once it holds no more bytes than the backend holds in a name: kind 'bad_label'
 * otherwise, naming `said` and the limit. It holds whatever validators the host chose: a name a
 * backend cannot hold is never sent.
 */
const heldName = (facts: NameFacts, said: string, part: string): string => {
  const partBytes = new TextEncoder().encode(part).length
  if (partBytes > facts.maxNameBytes) {
    throw new VaultError('bad_label', `That ${said} is ${String(partBytes)} bytes of UTF-8, over the ${String(facts.maxNameBytes)} this storage holds in one name: choose a shorter ${said}.`)
  }
  return part
}
// --

// == [Storage and listener guards]: fromStorage, asStorageTrouble, checkListener, checked, checkOutgoing

/**
 * The adapter's half of a verb, with anything it throws that is not already a VaultError turned
 * into a calm one: a caller branches on `kind`, whatever the backend. The adapter's own error
 * rides along as `cause`, for debugging; adapters hold only ciphertext and unencrypted fields.
 */
const fromStorage = async <ValT>(attempt: () => Promise<ValT>): Promise<ValT> => {
  try {
    return await attempt()
  } catch (err) {
    throw asStorageTrouble(err)
  }
}

/** What an adapter threw, as a VaultError: its own VaultError untouched, anything else wrapped. */
const asStorageTrouble = (err: unknown): VaultError => (err instanceof VaultError ? err : Refusals.storageUnavailable(err))

const checkListener = (onChange: unknown) => {
  if (typeof onChange !== 'function') {
    throw new VaultError('bad_option', 'subscribe needs an onChange function to call after each write.')
  }
}

/**
 * `candidate` through `recordSchema`, or the refusal `refused` makes: the one check behind every
 * record and expectation a verb is handed, and every record storage hands back. The refusal names
 * what was refused but never quotes it.
 */
const checked = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, candidate: unknown, refused: () => VaultError): RecordT => {
  const parsed = recordSchema.safeParse(candidate)
  if (! parsed.success) { throw refused() }
  return parsed.data
}

/**
 * A record or expectation a write verb was handed, as this package writes one. One that is not
 * -- the names in it included, held to the floor by its schema -- is refused before storage sees
 * it, as misuse, so that nothing is ever written that a read would refuse as corrupt. The refusal
 * leads with what was spared: nothing `written`, or for a delete, nothing `removed`.
 */
const checkOutgoing = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, candidate: unknown, said: string, spared: 'written' | 'removed' = 'written'): RecordT => checked(recordSchema, candidate, () => (
  new VaultError('bad_record', `Nothing was ${spared}: that ${said} is not one this package builds. Hand a VaultDB only the records and expectations a vault builds.`)
))
// --

// == [Vault props checks]: checkVaultProps, unnamedVaultProps, newerVaultProps, mayBeNewer, readStoredVaultProps, isSoundVaultProps, others

const checkVaultProps = (raw: unknown, scope: VaultScope): VaultProps => {
  // A later safebyok may write what this one cannot read, which is no damage: it is said apart.
  if (mayBeNewer(raw)) { throw newerVaultProps() }
  const vaultProps = checkRecord(VaultProps, raw, 'vault props')
  // A record that names some other scope is a record out of place, wherever it came from.
  if (! Names.sameScope(vaultProps, scope)) {
    throw new VaultError('corrupt_record', 'The stored vault props name a different app, user, or vault than the one asked for. They were left as they are.')
  }
  return vaultProps
}

const unnamedVaultProps = (opts?: ErrorOptions) => new VaultError('damaged_vault', "This vault's stored record is too damaged to say which vault it is, so storage can't be told which one to remove, and nothing was removed. Its backend's own tools can clear it.", opts)

/** A stored vault this version cannot read, which a newer one may have: its own constructor, its own kind. */
const newerVaultProps = () => new VaultError('newer_format', "This vault's stored record is in a form this version of the app does not know. It may have been written by a newer version, which opens it, so it was left as it is: update the app and try again.")

/**
 * The vault props formats earlier versions of this package wrote: a record in one is older, never
 * newer, and fails today's checks as damage does.
 */
const OlderVaultPropsFormats: ReadonlySet<unknown> = new Set(['safebyok-vault-v1', 'safebyok-vault-v2', 'safebyok-vault-v3'])

/**
 * True when a record that fails this version's checks may be one a later version writes, which
 * is not damage: it names a `format` this version neither writes nor wrote before (of any type),
 * holds a `wayinkind` it does not know, or holds more wayins than {@link MaxUnlocks}. These
 * are all this version can tell from damage; anything else that fails is taken for damage. Any
 * change to what a stored record may hold -- a field, a shape, or a range a check accepts --
 * therefore bumps `format`.
 */
const mayBeNewer = (raw: unknown): boolean => {
  if (typeof raw !== 'object' || raw === null) { return false }
  const { format, wayins } = raw as { format?: unknown, wayins?: unknown }
  const knownFormat = VaultProps.shape.format.safeParse(format).success || OlderVaultPropsFormats.has(format)
  if (format !== undefined && ! knownFormat) { return true }
  if (! Array.isArray(wayins)) { return false }
  if (wayins.length > MaxUnlocks) { return true }
  return wayins.some((wayin: unknown) => {
    const { wayinkind } = (typeof wayin === 'object' && wayin !== null ? wayin : {}) as { wayinkind?: unknown }
    return typeof wayinkind === 'string' && ! (WayinKindVals as readonly string[]).includes(wayinkind)
  })
}

/**
 * The vault props as the adapter stores them. An adapter that validates on the way up, as a
 * wrapper over another VaultDB's public verbs or a server's checked reads do, refuses the damaged
 * record instead of handing it up: that refusal is the vault's id being out of reach, said as such.
 */
const readStoredVaultProps = async (reading: () => Promise<unknown>): Promise<unknown> => {
  try {
    return await fromStorage(reading)
  } catch (err) {
    if (isVaultError(err, 'corrupt_record')) { throw unnamedVaultProps({ cause: err }) }
    throw err
  }
}

/** True when `raw` reads back as the scope's vault props: what `getVaultProps` would hand up rather than refuse. */
const isSoundVaultProps = (raw: unknown, scope: VaultScope): boolean => {
  try {
    checkVaultProps(raw, scope)
    return true
  } catch (err) {
    if (isVaultError(err, 'corrupt_record')) { return false }
    throw err
  }
}

/** The one field of stored vault props a deletion needs, as the vault's own check has it. */
const StoredVaultId = Z.object({ vault_id: VaultProps.shape.vault_id })
// --

// == [Box and answer checks]: checkStoredBox, writtenBack, checkAnswer, checkRecord, jsonBytes

/** A stored box, as `getBox` holds it: a box's shape, under the boxlabel it was asked for. */
const checkStoredBox = (raw: unknown, boxlabel: string): Box => {
  const box = checkRecord(Box, raw, 'box')
  // A record that names some other boxlabel is a record out of place, wherever it came from.
  if (box.boxlabel !== boxlabel) {
    throw new VaultError('corrupt_record', 'The stored box names a different boxlabel than the one asked for. It was left as it is.')
  }
  return box
}

/**
 * What an adapter handed back from `said`, a write that landed, through `check`: for a record, the
 * check a read of it would make. What fails that check is refused as `corrupt_record`, the check's
 * own refusal as its cause, saying the write may have landed: storage answered with what its
 * adapter cannot read back.
 */
const writtenBack = <ResultT>(said: string, check: () => ResultT): ResultT => {
  try {
    return check()
  } catch (err) {
    if (! isVaultError(err, 'corrupt_record')) { throw err }
    throw new VaultError('corrupt_record', `Storage says ${said} landed, but answered with what this package cannot read back: its adapter wrote or reported something it should not have. Reading the vault again shows what stands; the storage adapter needs a developer's look.`, { cause: err })
  }
}

/** Storage's answer to `said`, a write, through `answerSchema`: one in another shape is `corrupt_record`, quoting none of it. */
const checkAnswer = <AnswerT>(answerSchema: Z.ZodMiniType<AnswerT>, raw: unknown, said: string): AnswerT => checked(answerSchema, raw, () => (
  new VaultError('corrupt_record', `Storage answered ${said} in a shape this package does not know.`)
))

/**
 * A stored record through its validator, with failure as a calm VaultError: storage is someone
 * else's database, and a record may be damaged or written by another version of this package.
 */
const checkRecord = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, raw: unknown, said: string): RecordT => checked(recordSchema, raw, () => (
  new VaultError('corrupt_record', `A stored ${said} record did not read back in a shape this package knows. It may be damaged, or written by another version of safebyok; it was left as it is.`)
))

/**
 * What `val` weighs as the UTF-8 bytes of its JSON: how the vault measures a record against its
 * storage's limits. Every in-tree backend counts a record as no heavier.
 */
export const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --
