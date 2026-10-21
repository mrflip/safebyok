import * as Z from 'zod/mini'
import { BoxRecord } from './box'
import { Capacity, VaultProps, VaultScope, type DamagedBox, type BoxSummary, type Sidecar } from './types'
import { VaultError, isVaultError, type RefusalMeta } from './errors'
import * as Names from './names'
import { AnyTextValidators, NameFloor } from './validators'
import * as Refusals from './refusals'
import { asError, parseLogger, type VaultLogger } from './logger'
import { reportToPlatform } from './report-error'
import { type Outcome, isOutcomeShaped, outcomeOf, unexpectedError } from './outcome'

// == [Expectations and records]: VaultPropsExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion, StoredBox

/** What an update of the vault props was proven against: the vault, and the `unlock_epoch` the writer read.
 * The update lands only while the standing vault props still have both.
 *
 * @example { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }
 */
export type VaultPropsExpectation = Z.infer<typeof VaultPropsExpectation>

const VaultPropsExpectation = Z.object({
  vault_id:         VaultProps.shape.vault_id,
  unlock_epoch:     VaultProps.shape.unlock_epoch,
})

/** What a box write was sealed for and read: the vault, the vaultKey's epoch, and the revision the writer read.
 * The write lands only while the standing vault props have this `vault_id` and `vault_key_epoch`
 * (else `vault_mismatch`). It also needs the standing box at this `revision_tok`, or no box at all
 * for null (else `stale_write`).
 *
 * @example { vault_id: vaultProps.vault_id, revision_tok: prev?.revision_tok ?? null, vault_key_epoch: vaultProps.vault_key_epoch }
 */
export type BoxExpectation = Z.infer<typeof BoxExpectation>

const BoxExpectation = Z.object({
  vault_id:        VaultProps.shape.vault_id,
  revision_tok:    Z.nullable(BoxRecord.shape.revision_tok),
  vault_key_epoch: VaultProps.shape.vault_key_epoch,
})

/** The vault a deletion means to remove whole: it lands only while the standing vault props have this `vault_id`.
 *
 * @example { vault_id: vaultProps.vault_id }
 */
export type VaultDelExpectation = Z.infer<typeof VaultDelExpectation>

const VaultDelExpectation = Z.object({
  vault_id: VaultProps.shape.vault_id,
})

/** What a box deletion was aimed at: the vault, and the `revision_tok` the deleter read.
 * The `revision_tok` is null for a box listed as damaged with no revision a read could take.
 * The deletion lands only while the standing vault props have this `vault_id`. It then removes
 * whatever box stands under the boxlabel: within the right vault, a deletion wins over any write.
 * The revision decides only what the {@link BoxDeletion} reports.
 *
 * @example { vault_id: vaultProps.vault_id, revision_tok: listed.revision_tok }
 */
export type BoxDelExpectation = Z.infer<typeof BoxDelExpectation>

const BoxDelExpectation = Z.object({
  vault_id:     VaultProps.shape.vault_id,
  revision_tok: Z.nullable(BoxRecord.shape.revision_tok),
})

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

const BoxDeletion = Z.object({
  outcome: Z.enum(['deleted', 'deleted_other', 'absent']),
})

/** One box as a VaultDB's `doListBoxes` hands it up: the boxlabel it is stored under, and its record exactly as stored.
 * The listing checks the record. The boxlabel lets a damaged box still be named, and so deleted
 * or overwritten.
 *
 * @example { boxlabel: 'anthropic', box: storedRecord }
 */
export type StoredBox = { boxlabel: string, box: unknown }
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
 *    vault. You compare only a few unencrypted fields (`vault_id`, `unlock_epoch`,
 *    `vault_key_epoch`, `revision_tok`) before a write.
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
 * `listBoxRecords` where your backend lists more cheaply, and `delDamagedVault` in an adapter
 * that hands each call on to another VaultDB.
 *
 * For every public verb:
 *
 *  * It resolves an {@link Outcome} and never rejects. {@link VaultDB.subscribe} alone throws.
 *  * Each name handed to it, the scope's three and a boxlabel, is held to the floor (`NameFloor`)
 *    and to {@link VaultDB.maxNameBytes} before your `do*` method sees it: 'bad_label' otherwise.
 *    A name inside a record below the floor refuses as that record does.
 *  * A host's own `validators` are never checked here: a server serving several clients takes any
 *    name above the floor.
 *  * A record or expectation this package would not build refuses 'bad_record' before storage
 *    sees it (a box handed to `putBox`, 'invalid_box').
 *  * Each record storage hands back is validated: one that fails refuses 'corrupt_record'.
 *  * A VaultError your `do*` method throws passes through as it came. Anything else it throws
 *    refuses 'storage_unavailable', with what it threw as `cause`.
 *  * A `do*` method that answers with an Outcome, where it owes the bare answer, refuses 'bad_option'.
 *  * A throw from the base's own code that is no VaultError is a bug: 'unexpected_error', never to
 *    be retried.
 */
export abstract class VaultDB {
  // == [Backend limits]: maxRecordBytes, maxVaultBytes, maxBoxes, maxNameBytes

  /** The most bytes this backend holds in one record, or `Infinity` for no per-record limit.
   * `Vault.make` refuses a `maxWhisperBytes` over half of it. {@link VaultDB.putBox} refuses as
   * `box_too_large` a box whose JSON, with its scope, weighs more in UTF-8 bytes. A large sidecar or
   * long names can make a box so even within `maxWhisperBytes`.
   */
  abstract readonly maxRecordBytes: number

  /** The most bytes this backend holds of one vault, every box together, as stored; or `Infinity` for no such limit.
   * Declare what the backend can still list and delete whole. A backend that reads a vault in one
   * transaction under a read budget declares the share of it its heaviest verb leaves.
   *
   * `Vault.make` refuses ('bad_option') a `maxBoxes` whose boxes might not fit, each counted at
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
   * whole number instead. `Vault.make` refuses ('bad_option') a `maxBoxes` above it, and given none
   * takes the smaller of this and `MaxBoxes`.
   *
   * A backend with a finite limit refuses a new box in a full vault as `vault_full`, writing
   * nothing. It holds on a best effort: writes one after another never pass it, while writers
   * racing for the last places may take a vault a few past (`VAULTDB.md`, lines 4.1 to 4.6). A box
   * that replaces one already there is never refused for the count.
   */
  abstract readonly maxBoxes: number

  /** The most UTF-8 bytes this backend holds in one name, or `Infinity` for any name the floor admits (1 KiB).
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
   * logger. `Vault.make` and `VaultProvider` use it when given no logger of their own.
   */
  get logger(): VaultLogger { return this.#logger }

  // --

  // == [Vault props verbs]: getVaultProps, ensureVaultProps, putVaultProps

  // ------------------------------------------------------------------- the verbs safebyok calls

  /** The scope's vault props, validated, or null when the vault has never been created.
   * Stored vault props in a `format` this version does not know refuse as `newer_format`: a newer
   * safebyok may have written them. Those that otherwise fail their checks refuse as
   * `corrupt_record`.
   */
  getVaultProps(scope: VaultScope): Promise<Outcome<VaultProps | null>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const raw = await adapterAnswer('doGetVaultProps', () => this.doGetVaultProps(asked))
      if (raw === null || raw === undefined) { return null }
      return checkVaultProps(raw, asked)
    })
  }

  /** Create `vaultProps` unless vault props already stand in their scope, atomically, resolving whichever stand afterwards.
   * Those are `vaultProps` when this call created them. Otherwise they are the standing ones,
   * untouched, with their own `vault_id`: another device may have made the vault in the same
   * moment. Compare the `vault_id` resolved with the one drafted to tell which. What it reads back
   * refuses as {@link VaultDB.getVaultProps} refuses it.
   */
  ensureVaultProps(vaultProps: VaultProps): Promise<Outcome<VaultProps>> {
    return answering(async () => {
      const outgoing = checkOutgoing(VaultProps, vaultProps, 'vault props record')
      const asked = heldScope(this, outgoing)
      const raw = await adapterAnswer('doEnsureVaultProps', () => this.doEnsureVaultProps(outgoing))
      return checkVaultProps(raw, asked)
    })
  }

  /** Replace the vault props with `vaultProps`, only while the standing ones have the `vault_id` and `unlock_epoch` in `expected`.
   * Otherwise it refuses `stale_write` and writes nothing, as it does when no vault props stand. A
   * vault's `vault_id` never changes, so `vaultProps` must carry the one in `expected`:
   * 'bad_record' otherwise.
   */
  putVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<Outcome<void>> {
    return answering(async () => {
      const outgoing = checkOutgoing(VaultProps, vaultProps, 'vault props record')
      heldScope(this, outgoing)
      const expectation = checkOutgoing(VaultPropsExpectation, expected, 'vault props expectation')
      if (outgoing.vault_id !== expectation.vault_id) {
        throw new VaultError('bad_record', "putVaultProps replaces a vault's props within that vault: the vault props' vault_id must be the expected one, as a vault_id never changes.")
      }
      const landed = await adapterAnswer('doPutVaultProps', () => this.doPutVaultProps(outgoing, expectation))
      if (! landed) { throw Refusals.staleWrite('vaultProps') }
    })
  }
  // --

  // == [Box verbs]: getBox, listBoxes, listBoxRecords, putBox

  /** The box under `boxlabel`, validated, or null when there is none. */
  getBox(scope: VaultScope, boxlabel: string): Promise<Outcome<BoxRecord | null>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const label = heldBoxlabel(this, boxlabel)
      const raw = await adapterAnswer('doGetBox', () => this.doGetBox(asked, label))
      if (raw === null || raw === undefined) { return null }
      return checkStoredBox(raw, label)
    })
  }

  /** The visible fields of every box in the vault, which a locked vault may show, sorted by boxlabel.
   * Ciphered fields are stripped, and the sidecar is the JSON value it holds. The sort is by UTF-16
   * code unit, never by locale, so every device lists in one order. A record that does not read
   * back as its box lists as a {@link DamagedBox} rather than refusing. A row stored under a name
   * below the floor is left out: no verb could reach it.
   */
  listBoxes(scope: VaultScope): Promise<Outcome<(BoxSummary | DamagedBox)[]>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const stored = await adapterAnswer('doListBoxes', () => this.doListBoxes(asked))
      return stored
        .filter((entry) => isNameable(entry))
        .map((entry) => listedOrDamaged(entry))
        .toSorted((one, two) => byCodeUnit(one.boxlabel, two.boxlabel))
    })
  }

  /** Every box in the vault as stored, its two ciphered fields left out: what a server hands a browser's VaultDB.
   * Records come as the adapter handed them, damaged ones too, unchecked and in no particular
   * order: the receiving VaultDB's listing checks them. Rows under a name below the floor are left
   * out, as {@link VaultDB.listBoxes} leaves them. An adapter whose backend lists a vault more
   * cheaply may override it.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.listBoxRecords(scope)
   *   if (! ok) { throw err }
   *   return val   // what a server sends a browser's VaultDB
   */
  listBoxRecords(scope: VaultScope): Promise<Outcome<unknown[]>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const stored = await adapterAnswer('doListBoxes', () => this.doListBoxes(asked))
      return stored
        .filter((entry) => isNameable(entry))
        .map(({ box }) => withoutCiphered(box))
    })
  }

  /** Write `box` under its boxlabel in one atomic conditional write, resolving the box as storage now holds it.
   * The write lands only while the standing vault props have the `vault_id` and `vault_key_epoch`
   * in `expected`, and the standing box its `revision_tok` (for null, while no box stands). The box
   * resolved comes from that same atomic step, checked as {@link VaultDB.getBox} checks one, at
   * the revision written. One that fails refuses as `corrupt_record`, though the write may have
   * landed.
   *
   * Refuses, writing nothing:
   *
   * * `vault_mismatch` when the standing vault props are not those `expected` names, or none
   *   stand. It carries nothing of them.
   * * `stale_write` when the standing box is not the one `expected` names. `err.meta.box_stored`
   *   holds what stands, from the same atomic step: the box that won, checked as `getBox` checks
   *   one; a `DamagedBox` (naming the revision it holds, if any); or null for none. Write over it
   *   naming that revision, or null. A damaged box that names no revision can only be removed,
   *   with {@link VaultDB.delBox}.
   * * `vault_full` from the backend's own limit, with how full the vault is in
   *   `err.meta.capacity`, a {@link Capacity}.
   * * `box_too_large` for a box whose JSON, with its scope, weighs more than
   *   {@link VaultDB.maxRecordBytes}, before storage sees it.
   * * `invalid_box`, before storage sees it, for a box this package would not build, or one sealed
   *   under another `vault_key_epoch` than `expected` names.
   *
   * A write sent again after it landed, a retry after a lost answer say, refuses as `stale_write`,
   * its own box in `err.meta.box_stored`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.putBox(scope, { vault_id, vault_key_epoch: 1, revision_tok: null }, box)
   *   if (! ok && err.refusalkind === 'stale_write') { return err.meta?.box_stored }  // what won
   */
  putBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<Outcome<BoxRecord>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const outgoing = checked(BoxRecord, box, invalidBox)
      heldBoxlabel(this, outgoing.boxlabel)
      const expectation = checkOutgoing(BoxExpectation, expected, 'box expectation')
      if (outgoing.vault_key_epoch !== expectation.vault_key_epoch) {
        throw new VaultError('invalid_box', "Nothing was written: putBox writes a box under the vaultKey it was sealed with, so the box's vault_key_epoch must be the expected one. Hand a VaultDB's putBox only the boxes a vault seals, with the expectation it sealed them for.")
      }
      const recordBytes = jsonBytes({ ...asked, ...outgoing })
      if (recordBytes > this.maxRecordBytes) {
        throw new VaultError('box_too_large', `That box weighs ${String(recordBytes)} bytes, over the ${String(this.maxRecordBytes)} its storage holds in one record, so nothing was written: store a smaller whisper or sidecar, or under a shorter boxlabel.`)
      }
      const stored = await withMissChecked(adapterAnswer('doPutBox', () => this.doPutBox(asked, expectation, outgoing)), outgoing.boxlabel)
      return writtenBack('a box write', () => checkWrittenBox(stored, outgoing))
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

  // == [Delete verbs]: delBox, delVault, delDamagedVault

  /** Remove the box under `boxlabel`, whatever revision stands, only while the standing vault props have `expected`'s `vault_id`.
   * Otherwise it refuses `stale_write` and removes nothing, as it does when no vault props stand.
   * Resolves the {@link BoxDeletion} that the removal's own atomic step reports. One in another
   * shape refuses as `corrupt_record`, though the deletion may have landed. Deleted is gone:
   * nothing of the record is kept, and a `putBox` expecting the revision removed refuses
   * `stale_write`.
   *
   * @example
   *   const { ok, val, err } = await vaultDB.delBox(scope, 'anthropic', { vault_id: vaultProps.vault_id, revision_tok: listed.revision_tok })
   *   if (ok && val.outcome === 'deleted_other') { await refresh() }   // someone wrote over it first
   */
  delBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<Outcome<BoxDeletion>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const label = heldBoxlabel(this, boxlabel)
      const expectation = checkOutgoing(BoxDelExpectation, expected, 'delete expectation', 'removed')
      const deletion = await adapterAnswer('doDelBox', () => this.doDelBox(asked, label, expectation))
      if (deletion === null) { throw Refusals.staleWrite('del') }
      return writtenBack('a deletion', () => checkAnswer(BoxDeletion, deletion, 'a deletion'))
    })
  }

  /** Remove the vault props and every box, only while the standing vault props have `expected`'s `vault_id`.
   * This is the backend's part of deleting a vault. Otherwise it refuses `stale_write` and removes
   * nothing, as it does when no vault props stand.
   */
  delVault(scope: VaultScope, expected: VaultDelExpectation): Promise<Outcome<void>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const expectation = checkOutgoing(VaultDelExpectation, expected, 'delete expectation', 'removed')
      const landed = await adapterAnswer('doDelVault', () => this.doDelVault(asked, expectation))
      if (! landed) { throw Refusals.staleWrite('del') }
    })
  }

  /** Remove a vault whose stored vault props fail their checks, and no other: the escape hatch behind the package's `delDamagedVault`.
   * That is the vault `getVaultProps` refuses as `corrupt_record`, and `hello()` as
   * `damaged_vault`, which no Vault object opens to `del()`. It takes the `vault_id` from the
   * stored vault props, and removes as {@link VaultDB.delVault} does under it. Vault props
   * rewritten under that `vault_id` meanwhile are the same vault, and go with it (`VAULTDB.md`,
   * line 3.5). Resolves quietly when the scope holds no vault props.
   *
   * Refuses, removing nothing:
   *
   * * 'bad_option' when the vault props are sound: delete that vault through its own `del()`.
   * * 'damaged_vault' when the record is too damaged to name its vault: only the backend's own
   *   tools clear it.
   * * 'newer_format' when a newer safebyok may have written it, in a `format` this one does not
   *   know. A device on the newer version opens it.
   * * 'stale_write' when the vault was replaced meanwhile.
   *
   * An adapter that hands each call on to another VaultDB's public verbs must hand this one on
   * too: its `doGetVaultProps` meets the inner refusal, never the record, so this refuses
   * 'damaged_vault'. So does a backend whose server validates what it reads, as
   * `safebyok-graphql`'s does: there a damaged record is the backend's own to clear.
   */
  delDamagedVault(scope: VaultScope): Promise<Outcome<void>> {
    return answering(async () => {
      const asked = heldScope(this, scope)
      const raw = await readStoredVaultProps(() => adapterAnswer('doGetVaultProps', () => this.doGetVaultProps(asked)))
      if (raw === null || raw === undefined) { return }
      if (mayBeNewer(raw)) { throw newerVaultProps() }
      if (isSoundVaultProps(raw, asked)) {
        throw new VaultError('bad_option', "That vault's stored props are sound, so it is not deleted here: a vault that opens is deleted through its handle's del(). Only a vault whose hello() refuses it as damaged_vault is deleted this way.")
      }
      const named = StoredVaultId.safeParse(raw)
      if (! named.success) { throw unnamedVaultProps() }
      const landed = await adapterAnswer('doDelVault', () => this.doDelVault(asked, { vault_id: named.data.vault_id }))
      if (! landed) { throw Refusals.staleWrite('del') }
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

  // == [The half you write]: doGetVaultProps, doEnsureVaultProps, doDelVault, doSubscribe, others

  // --------------------------------------------------------------------------- the half you write

  /** The stored vault props record for `scope`, exactly as saved, or null when there is none. */
  protected abstract doGetVaultProps(scope: VaultScope): Promise<unknown>
  /** Store `vaultProps` if its scope holds none, then return the vault props standing there, exactly as stored.
   * Those are `vaultProps` itself, or the ones already there, untouched. Find and insert in one
   * atomic step where the backend allows, so two devices creating at once settle on one vault.
   */
  protected abstract doEnsureVaultProps(vaultProps: VaultProps): Promise<unknown>
  /** Replace the standing vault props with `vaultProps` if, and only if, they have `expected.vault_id` and `expected.unlock_epoch`.
   * True when written; false, writing nothing, when the expectation failed or no vault props stand.
   */
  protected abstract doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean>
  /** The stored box record under `boxlabel`, exactly as saved, or null when there is none. */
  protected abstract doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown>
  /** Every box in `scope`, in any order, each as a {@link StoredBox}.
   * Each record is exactly as stored: whole, or without `box_key_wrapped` and `whisper_ciphered`
   * where the backend can project. Keep `format` and every other field, and hand up a record that
   * looks damaged as it is: the listing marks it.
   */
  protected abstract doListBoxes(scope: VaultScope): Promise<StoredBox[]>
  /** Store `box` under its boxlabel if, and only if, the standing vault props and box are those `expected` names.
   * That is vault props with `expected.vault_id` and `expected.vault_key_epoch`, and the box at
   * `expected.revision_tok`, or no box for null, all compared in the same atomic step as the write.
   * Once written, resolve the record as stored, read back in that same step (a `RETURNING`, a
   * mutation's return value, a read in the transaction), as `doGetBox` would hand it up.
   *
   * Otherwise write nothing, and throw from that same step:
   *
   * * `Refusals.vaultMismatch()` when the vault props are not the expected ones: none, another
   *   vault's, or another vaultKey epoch's.
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
  /** Remove the box under `boxlabel`, whatever revision stands, if, and only if, the standing vault props have `expected.vault_id`.
   * Compare in the same atomic step as the removal. Once those vault props stand, resolve a
   * {@link BoxDeletion} saying what that step removed: `deleted` for a record at
   * `expected.revision_tok`, `deleted_other` for any other, `absent` for none. For a null
   * `revision_tok`, `deleted` is a record holding no revision a read could take:
   * `Expectations.deletionOf` compares as the listing reads. Otherwise resolve null, removing
   * nothing.
   */
  protected abstract doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown>
  /** Remove the vault props and every box of `scope` if, and only if, the standing vault props have `expected.vault_id`.
   * Use one transaction, where the backend has them. True when removed; false, removing nothing,
   * otherwise.
   */
  protected abstract doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean>
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

// == [Listing helpers]: withoutCiphered, ListedBox, isNameable, listedOrDamaged, damagedOf, summaryOf, byCodeUnit

/** A stored box as {@link VaultDB.listBoxRecords} hands it on: its two ciphered fields left out, anything else as it came. */
const withoutCiphered = (box: unknown): unknown => {
  if (typeof box !== 'object' || box === null || Array.isArray(box)) { return box }
  const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = box as Record<string, unknown>
  return listed
}

/** A box as `doListBoxes` may hand it up: every field but the two ciphered ones, so a projecting backend is checked as one handing whole records. */
const ListedBox = Z.omit(BoxRecord, { box_key_wrapped: true, whisper_ciphered: true })

/** True when a listed box is stored under a name above the floor, which a verb can reach. */
const isNameable = (stored: StoredBox): boolean => NameFloor.safeParse((stored as { boxlabel?: unknown }).boxlabel).success

/** One nameable stored box as the listing shows it: its summary, or a {@link DamagedBox} where `getBox` would refuse it.
 * A name the vault's own validators refuse is no damage: it lists as it stands.
 */
const listedOrDamaged = ({ boxlabel, box }: StoredBox): BoxSummary | DamagedBox => {
  const checked = ListedBox.safeParse(box)
  const sound = checked.success && checked.data.boxlabel === boxlabel
  return sound ? summaryOf(checked.data) : damagedOf(boxlabel, box)
}

/** A record stored under `boxlabel` that does not read back as its box, as a listing shows it: the revision it holds as text, or null. */
const damagedOf = (boxlabel: string, box: unknown): DamagedBox => (
  { boxlabel, damaged: true, revision_tok: StoredRevision.safeParse(box).data?.revision_tok ?? null }
)

/** The one field of a damaged box the listing keeps, when the record holds it as text: what a write over it names. */
const StoredRevision = Z.object({ revision_tok: BoxRecord.shape.revision_tok })

/** A listed box's summary: its visible fields, and its sidecar parsed from the `sidecar_json` the check has passed. */
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

/** `scope`, once each name passes the floor and fits the backend: 'bad_label' otherwise, quoting none of it. */
const heldScope = (facts: NameFacts, scope: unknown): VaultScope => {
  const asked = Names.checkScope(FloorRules, scope)
  heldName(facts, 'applabel', asked.applabel)
  heldName(facts, 'user_id', asked.user_id)
  heldName(facts, 'vaultlabel', asked.vaultlabel)
  return asked
}

/** `boxlabel`, once it passes the floor and fits the backend: 'bad_label' otherwise. */
const heldBoxlabel = (facts: NameFacts, boxlabel: unknown): string => heldName(facts, 'boxlabel', Names.checkFloor('boxlabel', boxlabel))

/** `part`, a name, once it fits the backend's `maxNameBytes`: 'bad_label' otherwise, naming `said` and the limit. */
const heldName = (facts: NameFacts, said: string, part: string): string => {
  const partBytes = new TextEncoder().encode(part).length
  if (partBytes > facts.maxNameBytes) {
    throw new VaultError('bad_label', `That ${said} is ${String(partBytes)} bytes of UTF-8, over the ${String(facts.maxNameBytes)} this storage holds in one name: choose a shorter ${said}.`)
  }
  return part
}
// --

// == [Storage and listener guards]: answering, asStorageTrouble, adapterAnswer, withMissChecked, staleChecked, fullChecked, remade, boxStoredOf, invalidBox, checkListener, checked, checkOutgoing

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

/** `err` made again with `meta`, its kind, message and cause kept. */
const remade = (err: VaultError, meta: RefusalMeta): VaultError => (
  new VaultError(err.refusalkind, err.message, err.cause === undefined ? { meta } : { cause: err.cause, meta })
)

/** What stands under `boxlabel`, as a stale box write reports it: the box where `getBox` would take it, else a {@link DamagedBox}, or null for none. */
const boxStoredOf = (raw: unknown, boxlabel: string): BoxRecord | DamagedBox | null => {
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

/** `candidate` through `recordSchema`, or the refusal `refused` makes, which never quotes it. */
const checked = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, candidate: unknown, refused: () => VaultError): RecordT => {
  const parsed = recordSchema.safeParse(candidate)
  if (! parsed.success) { throw refused() }
  return parsed.data
}

/** A record or expectation a write verb was handed, once it is one this package builds: 'bad_record' otherwise.
 * The refusal leads with what was spared: nothing `written`, or for a delete, nothing `removed`.
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

/** The vault props formats earlier versions of this package wrote: a record in one is older, never newer, and fails as damage does. */
const OlderVaultPropsFormats: ReadonlySet<unknown> = new Set(['safebyok-vault-v1', 'safebyok-vault-v2', 'safebyok-vault-v3', 'safebyok-vault-v4'])

/** True when a stored record names a `format`, of any type, this version neither writes nor wrote before: a later version's, not damage. */
const mayBeNewer = (raw: unknown): boolean => {
  // This is all this version can tell from damage. So any change to what a stored record may hold
  // -- a field, a shape, a kind of way in, or a range a check accepts -- bumps `format`.
  if (typeof raw !== 'object' || raw === null) { return false }
  const { format } = raw as { format?: unknown }
  const knownFormat = VaultProps.shape.format.safeParse(format).success || OlderVaultPropsFormats.has(format)
  return format !== undefined && ! knownFormat
}

/** The vault props as the adapter stores them; an adapter's own `corrupt_record` refuses 'damaged_vault', the vault's id out of reach. */
const readStoredVaultProps = async (reading: () => Promise<unknown>): Promise<unknown> => {
  try {
    return await reading()
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

// == [Box and answer checks]: checkStoredBox, checkWrittenBox, writtenBack, checkAnswer, checkRecord, jsonBytes

/** A stored box, as `getBox` holds it: a box's shape, under the boxlabel it was asked for. */
const checkStoredBox = (raw: unknown, boxlabel: string): BoxRecord => {
  const box = checkRecord(BoxRecord, raw, 'box')
  // A record that names some other boxlabel is a record out of place, wherever it came from.
  if (box.boxlabel !== boxlabel) {
    throw new VaultError('corrupt_record', 'The stored box names a different boxlabel than the one asked for. It was left as it is.')
  }
  return box
}

/** The box an adapter handed back as `written` landed, held to the check `getBox` makes, at the revision written.
 * One at another revision is someone else's box: `corrupt_record`, quoting neither.
 */
const checkWrittenBox = (raw: unknown, written: BoxRecord): BoxRecord => {
  const box = checkStoredBox(raw, written.boxlabel)
  if (box.revision_tok !== written.revision_tok) {
    throw new VaultError('corrupt_record', 'The box storage handed back as written holds another revision than the one written.')
  }
  return box
}

/** What an adapter handed back from `said`, a write that landed, through `check`.
 * A `corrupt_record` from the check refuses as one saying the write may have landed, the check's
 * own refusal as its cause.
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

/** A stored record through its validator: 'corrupt_record' otherwise, quoting none of it. */
const checkRecord = <RecordT>(recordSchema: Z.ZodMiniType<RecordT>, raw: unknown, said: string): RecordT => checked(recordSchema, raw, () => (
  new VaultError('corrupt_record', `A stored ${said} record did not read back in a shape this package knows. It may be damaged, or written by another version of safebyok; it was left as it is.`)
))

/** What `val` weighs as the UTF-8 bytes of its JSON: how the vault measures a record against its storage's limits.
 * Every in-tree backend counts a record as no heavier.
 */
export const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --
