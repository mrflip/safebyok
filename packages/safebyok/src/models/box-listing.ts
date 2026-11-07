/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB and the vault. */

import { VaultError } from '../refusals/errors'
import type { Modelkind } from '../helpers/consts'
import { absentBoxError, notListedBoxError } from '../refusals/throwers'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { type Boxscope, boxscope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import { type BoxCreateOpts, type BoxDna, type BoxPutOpts, type BoxSnapshot, type BoxWorld, type DelTombstone, type Fetched, type FetchOpts, type ListingOpts, boxDna } from '../shapes/shapes-vaultish'
import type { BoxRow, DamagedBox, DelOpts, PutOpts, VaultRow, BoxRecord, BoxSparse } from '../shapes/shapes-storage'
import type { Notice } from '../storage/vault-db'
import { Box } from './box'
import { Listing } from './listing'

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  // == [Props]: world, #damagedRows, damaged_rows

  declare readonly world: BoxWorld

  /** The rows the vaultDB's listing set aside as damaged. */
  #damagedRows: readonly DamagedBox[] = Object.freeze([])

  /** The rows of this vault found damaged, set aside until `del` names one. */
  get damaged_rows(): readonly DamagedBox[] { return this.#damagedRows }
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  /** The listing of the boxes of `world`, the vault they lie in. */
  constructor(world: BoxWorld, opts: ListingOpts) {
    VX.boxWorld.parse(world)
    super(world, opts)
    Object.freeze(this)
  }

  /** The scope of `duck`, held to this vault: no listing answers for another's. */
  scopeOf(duck: unknown):  Boxscope  { return boxscope.parseConsistent(duck, this.world.scope) }

  sparseOf(duck: unknown): BoxSparse { return SX.boxSparse.parse(duck) }

  recordOf(duck: unknown): BoxRecord { return SX.boxRecord.parseConsistent(duck, this.world.scope) }
  // --

  // == [Methods]: list, damagedAt, del, get, tryGet, puttable, create, tryCreate, shellFor

  /** Hold every box the vaultDB lists for this vault, sparse, and set its damaged rows aside. */
  async list(): Promise<void> {
    this.demandEnabled()
    const answer = await this.vaultDB.tryListBoxes({ ...this.world.scope, vault_tok: this.world.vault_tok })
    if (answer.world !== null) { this.world.takeWorld(answer.world) }
    if (! answer.ok) {
      this.tellIfRevoked(answer.err)
      throw answer.err
    }
    const { boxes, damaged_rows } = answer.val
    this.#damagedRows = Object.freeze(damaged_rows)
    for (const { boxlabel } of damaged_rows) { this.things.find((held) => held.boxlabel === boxlabel)?.vacate() }
    await Promise.all(boxes.map((box) => this.build(box)))
  }

  /** The entry of {@link damaged_rows} under `scope`, or null. */
  damagedAt(scope: Boxscope): DamagedBox | null {
    const { boxlabel } = this.scopeOf(scope)
    return this.#damagedRows.find((damaged) => damaged.boxlabel === boxlabel) ?? null
  }

  /** Delete the box `duck` names, and stop setting its row aside as damaged. */
  override async del(duck: BoxSparse | Box): Promise<Box | null> {
    const thing = await super.del(duck)
    const { boxlabel } = this.scopeOf(duck)
    this.#damagedRows = Object.freeze(this.#damagedRows.filter((damaged) => damaged.boxlabel !== boxlabel))
    return thing
  }

  /** The box under `scoped`, no older than `opts` allows, or null under `ifAbsent: 'nil'`. */
  async get(scoped: Boxscope, opts: FetchOpts = {}): Promise<Box | null> {
    const held = this.at(scoped)
    if (held === null) { return this.fetch(scoped, opts) }
    const { ifAbsent, ...timely } = VX.fetchOpts.parse(opts)
    return this.handleIfAbsent(await held.hydrate(timely), scoped, ifAbsent)
  }

  tryGet(scoped: Boxscope, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.get(scoped, opts)) }

  /** The box a put of `scoped` goes through: the one held, or a void one made for an empty slot. */
  puttable(scoped: unknown, opts: BoxPutOpts = {}): Box {
    const { ifAbsent } = VX.boxPutOpts.parse(opts)
    const scope = this.scopeOf(scoped)
    const held = this.at(scope)
    if ((held === null) && (ifAbsent === 'fail')) { throw notListedBoxError(scope) }
    return held ?? this.#shellFor(scope)
  }

  /** Seals a new box and stores it where no live record stands, answering the box listed. */
  async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box> {
    const filled = VX.boxCreateOpts.parse(opts)
    const dna = boxDna.parse(input)
    return this.puttable(input, filled).put(dna, filled)
  }

  tryCreate(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.create(input, opts)) }

  /** A void box held under `scope`. */
  #shellFor(scope: Boxscope): Box { return this.buildOrReceive(SX.sentinelBoxOf(scope, this.world.vault_tok)) }
  // --

  // == [Defined by the box listing]: vaultTokOfWorld, scopepathOf, makeThing, nothingStoredError, tryGetRow, tryPutRow, tryDelRow, watchRows, isOwnRow

  protected vaultTokOfWorld(): string { return this.world.vault_tok }

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>): Box {
    return new Box(this.world, this, central)
  }

  protected nothingStoredError(scope: Boxscope): VaultError { return absentBoxError(scope) }

  protected tryGetRow(scope: Boxscope) { return this.vaultDB.tryGetBox({ ...scope, vault_tok: this.world.vault_tok }, { ifAbsent: 'nil' }) }

  protected tryPutRow(record: BoxRecord, opts: PutOpts) { return this.vaultDB.tryPutBox(record, opts) }

  protected tryDelRow(tombstone: DelTombstone<BoxSparse>, opts: DelOpts) { return this.vaultDB.tryDelBox(tombstone, opts) }

  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice, onBadNews) }

  /** A box row of this life of the vault: one under another `vault_tok` is no row. */
  protected isOwnRow(row: VaultRow | BoxRow): row is BoxRow { return ('boxlabel' in row) && (row.vault_tok === this.world.vault_tok) }
  // --

  /** Answers 'box_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'box_listing' { return 'box_listing' satisfies Modelkind }
}
