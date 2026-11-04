/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB and the vault. */

import type { CipherCtxRecord } from '../crypto'
import { VaultError } from '../errors'
import { absentBoxError, notListedBoxError } from '../helpers/throwers'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Sidecar } from '../shapes/box'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/scopes'
import type { Notice } from '../storage/vault-db-new'
import type { BoxRow, DamagedBox, DelOpts, PutOpts, VaultRow } from '../storage/vault-db-shapes'
import * as VS from '../storage/vault-db-shapes'
import { type BoxSnapshot, Box } from './box'
import { type DelTombstone, Listing } from './listing'
import { type BoxesListed, type BoxPutOpts, type BoxRecord, type BoxSparse, type BoxCreateOpts, type Dna, type Fetched, type FetchOpts, type ListingOpts, type ListingWorld, type SealedWhisper, type WhisperHolder, boxDna, boxRecord, boxSparse } from './models-shapes'
import * as MSX from './models-shapes'

// == [Given to a box listing]: BoxWorld, BoxDna, BoxListingOpts

/** The vault, as far as its boxes need it: a {@link ListingWorld}, the vault's scope, token and demand, and its seal verbs. */
export type BoxWorld = ListingWorld & {
  scope:     VaultScope
  vault_tok: string
  demandBoxesUsable(): unknown
  sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper>
  unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string>
}

/** SLOPDOC: What a caller hands `create` to make a box: its scope, whisper and sidecar, with no sealed parts. */
export type BoxDna = Omit<Dna<Boxscope, BoxRecord>, 'box_key_wrapped' | 'whisper_ciphered' | 'sidecar'> & { whisper: WhisperHolder, sidecar: Sidecar }

export type BoxListingOpts = ListingOpts & { world: BoxWorld }
// --

// == [BoxListing]

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  declare readonly world: BoxWorld

  /** The rows the vault's get set aside as damaged. */
  #damagedRecords: readonly DamagedBox[] = Object.freeze([])

  /** A box listing in `opts.world`, whose vault's scope and `vault_tok` are held to `boxListingOpts`, the rest to the base's check. */
  constructor(opts: BoxListingOpts) {
    MSX.boxListingOpts.parse(opts)
    super(opts)
    Object.freeze(this)
  }

  // == [Starting]: hello, damaged_records, damagedAt, del

  /** Start the watch, and take what the vault's get listed, if given: each box built sparse, a tombstone among them, each damaged row set aside, and any instance held under a damaged row vacated, as nothing acts on one. */
  override async hello(listed?: BoxesListed): Promise<void> {
    await super.hello()
    if (listed === undefined) { return }
    const { boxes, damaged_records } = MSX.boxesListed.parse(listed)
    this.#damagedRecords = Object.freeze(damaged_records)
    for (const { boxlabel } of damaged_records) { this.things.find((held) => held.boxlabel === boxlabel)?.vacate() }
    await Promise.all(boxes.map((box) => this.build(box)))
  }

  /** The rows of this vault found damaged, set aside until `del` names one. */
  get damaged_records(): readonly DamagedBox[] { return this.#damagedRecords }

  /** The entry of {@link damaged_records} under `scope`, or null. */
  damagedAt(scope: Boxscope): DamagedBox | null {
    const { boxlabel } = this.scopeOf(scope)
    return this.#damagedRecords.find((damaged) => damaged.boxlabel === boxlabel) ?? null
  }

  /** As the base's `del`; landed, the row is no longer set aside as damaged. */
  override async del(duck: BoxSparse | Box): Promise<Box | null> {
    const thing = await super.del(duck)
    const { boxlabel } = this.scopeOf(duck)
    this.#damagedRecords = Object.freeze(this.#damagedRecords.filter((damaged) => damaged.boxlabel !== boxlabel))
    return thing
  }
  // --

  // == [Finding]: get, tryGet, demandUsable

  /** The present box under `scoped`, as fresh as asked: one storage has told of hydrates, any other, a void one included, is fetched. */
  async get(scoped: Boxscope, opts: FetchOpts = {}): Promise<Box | null> {
    const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
    const scope = this.scopeOf(scoped)
    this.demandUsable()
    const held = this.at(scope)
    const isHeard = (held !== null) && (held.revision_seq !== VS.VoidRevisionSeq)
    const box = await (isHeard ? held.hydrate(timely) : this.fetch(scope, { ifAbsent: 'nil', maxWorldMillis: timely.maxWorldMillis }))
    this.demandUsable()
    if (box?.isPresent === true) { return box }
    if (ifAbsent === 'nil') { return null }
    throw this.nothingStoredError(scope)
  }

  tryGet(scoped: Boxscope, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.get(scoped, opts)) }

  /** What a box verb needs: the vault usable and unlocked, and this listing enabled. */
  demandUsable(): this {
    this.world.demandBoxesUsable()
    return this.demandEnabled()
  }
  // --

  // == [Putting]: puttable, create, tryCreate, shellFor

  /** The box a put of `scoped` goes through, taking this listing as timely: the one held, or a void one made for the slot. */
  puttable(scoped: object, opts: BoxPutOpts = {}): Box {
    const { ifAbsent, ifPresent } = MSX.boxPutOpts.parse(opts)
    const scope = this.scopeOf(scoped)
    if ((ifPresent === 'fail') && ('whisper_ciphered' in scoped)) { throw recordForNewBox() }
    const held = this.at(scope)
    if ((ifAbsent === 'fail') && (held?.isPresent !== true)) { throw notListedBoxError(scope) }
    return held ?? this.#shellFor(scope)
  }

  /** Seals a new box and stores it where no live record stands, answering the box listed. */
  async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box> {
    const filled = MSX.boxCreateOpts.parse(opts)
    const dna = boxDna.parse(input)
    return this.puttable(input, filled).put(dna, filled)
  }

  tryCreate(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.create(input, opts)) }

  /** A void box held under `scope`, timely as it received its own void revision, so a put on it fetches nothing. */
  #shellFor(scope: Boxscope): Box { return this.buildOrReceive(VS.sentinelBoxOf(scope, this.world.vault_tok)) }
  // --

  // == [Defined by the box listing]

  protected vaultTokOfWorld(): string { return this.world.vault_tok }

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  /** The scope of `duck`, held to this vault: no listing answers for another's. */
  scopeOf(duck: unknown):  Boxscope  { return boxscope.parseConsistent(duck, this.world.scope) }

  sparseOf(duck: unknown): BoxSparse { return boxSparse.parse(duck) }

  recordOf(duck: unknown): BoxRecord { return boxRecord.parseConsistent(duck, this.world.scope) }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>): Box {
    return new Box(this.world, this, central, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  protected nothingStoredError(scope: Boxscope): VaultError { return absentBoxError(scope) }

  /** A put under `ifAbsent: 'fail'` hears `absent_box` over a tombstone, which is delivered as any row it missed is. */
  protected override isRefusalOfRow(err: VaultError): boolean { return super.isRefusalOfRow(err) || (err.refusalkind === 'absent_box') }

  protected tryGetRow(scope: Boxscope) { return this.vaultDB.tryGetBox({ ...scope, vault_tok: this.world.vault_tok }, { ifAbsent: 'nil' }) }

  protected tryPutRow(record: BoxRecord, opts: PutOpts) { return this.vaultDB.tryPutBox(record, opts) }

  protected tryDelRow(tombstone: DelTombstone<BoxSparse>, opts: DelOpts) { return this.vaultDB.tryDelBox(tombstone, opts) }

  protected watchRows(onNotice: (notice: Notice) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice) }

  /** A box row of this life of the vault: one under another `vault_tok` is no row. */
  protected isOwnRow(row: VaultRow | BoxRow): row is BoxRow { return ('boxlabel' in row) && (row.vault_tok === this.world.vault_tok) }
  // --
}
// --

// == [Refusals]: recordForNewBox

/** A put that said only-if-new, handed a whole record: what it would store is recycled. */
const recordForNewBox = (): VaultError => new VaultError('bad_option', Phrases.RecordForNewBox)
// --
