/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB and the vault. */

import { VaultError } from '../refusals/errors'
import type { Modelkind } from '../helpers/consts'
import { tattoo } from '../helpers/helpers'
import { absentBoxError, notListedBoxError } from '../refusals/throwers'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import { type BoxCreateOpts, type BoxDna, type BoxListingOpts, type BoxPutOpts, type BoxSnapshot, type BoxWorld, type DelTombstone, type Fetched, type FetchOpts, boxDna } from '../shapes/shapes-vaultish'
import type { BoxRow, DamagedBox, DelOpts, PutOpts, VaultRow, BoxRecord, BoxSparse } from '../shapes/shapes-storage'
import type { Notice } from '../storage/vault-db'
import { Box } from './box'
import { Listing } from './listing'

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  // == [Props]: applabel, user_id, vaultlabel, scope, world, #damagedRows, damaged_rows

  /** The scope of the vault listed, tattooed on by the constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  readonly scope:              VaultScope
  declare readonly world:      BoxWorld

  /** The rows the vaultDB's listing set aside as damaged. */
  #damagedRows: readonly DamagedBox[] = Object.freeze([])

  /** The rows of this vault found damaged at its last listing. */
  get damaged_rows(): readonly DamagedBox[] { return this.#damagedRows }
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  /** The listing of the boxes of `world`, the vault under `opts.scope` they lie in. */
  constructor(world: BoxWorld, opts: BoxListingOpts) {
    VX.boxWorld.parse(world)
    const { scope, ...listingOpts } = VX.boxListingOpts.parse(opts)
    super(world, listingOpts)
    this.scope = Object.freeze(scope)
    tattoo(this, this.scope)
    Object.freeze(this)
  }

  /** The scope of `duck`, which must be this vault's: no listing answers for another's. */
  scopeOf(duck: unknown):  Boxscope  { return boxscope.parseConsistent(duck, this.scope) }

  /** Parse `duck` as a {@link BoxSparse}. */
  sparseOf(duck: unknown): BoxSparse { return SX.boxSparse.parse(duck) }

  /** Parse `duck` as a {@link BoxRecord} of this vault. */
  recordOf(duck: unknown): BoxRecord { return SX.boxRecord.parseConsistent(duck, this.scope) }
  // --

  // == [Methods]: list, get, tryGet, puttable, create, tryCreate, shellFor

  /** Enlist every box the vaultDB lists for this vault, sparse, and set its damaged rows aside. */
  async list(): Promise<void> {
    this.demandEnabled()
    const answer = await this.vaultDB.tryListBoxes({ ...this.scope, vault_tok: this.world.vault_tok })
    this.demandEnabled()
    if (answer.world !== null) { this.world.receiveWorld(answer.world) }
    if (! answer.ok) {
      this.panicIfRevoked(answer.err)
      throw answer.err
    }
    const { boxes, damaged_rows } = answer.val
    this.#damagedRows = Object.freeze(damaged_rows)
    for (const { boxlabel } of damaged_rows) { this.things.find((listed) => listed.boxlabel === boxlabel)?.vacate() }
    await Promise.all(boxes.map((box) => this.build(box)))
  }

  /** The box under `scoped`, no older than `opts` allows, or null under `ifAbsent: 'nil'`. */
  async get(scoped: Boxscope, opts: FetchOpts = {}): Promise<Box | null> {
    const listed = this.at(scoped)
    if (listed === null) { return this.fetch(scoped, opts) }
    const { ifAbsent, ...timely } = VX.fetchOpts.parse(opts)
    return this.handleIfAbsent(await listed.hydrate(timely), scoped, ifAbsent)
  }

  /** Non-throwing form of {@link get}. */
  tryGet(scoped: Boxscope, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.get(scoped, opts)) }

  /** The box a put of `scoped` goes through: the one listed, or a void one made for an empty slot. */
  puttable(scoped: unknown, opts: BoxPutOpts = {}): Box {
    const { ifAbsent } = VX.boxPutOpts.parse(opts)
    const scope = this.scopeOf(scoped)
    const listed = this.at(scope)
    if ((listed === null) && (ifAbsent === 'fail')) { throw notListedBoxError(scope) }
    return listed ?? this.#shellFor(scope)
  }

  /** The box a delete of `scoped` goes through: the one listed, or a void one made for an empty slot. */
  deletable(scoped: unknown): Box { return this.puttable(scoped) }

  /** Seals a new box and puts it where no live record stands, answering the box listed. */
  async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box> {
    const filled = VX.boxCreateOpts.parse(opts)
    const dna = boxDna.parse(input)
    return this.puttable(input, filled).put(dna, filled)
  }

  /** Non-throwing form of {@link create}. */
  tryCreate(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.create(input, opts)) }

  /** A void box listed under `scope`. */
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

  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void { return this.vaultDB.watch(this.scope, onNotice, onBadNews) }

  /** A box row of this life of the vault: one under another `vault_tok` is no row. */
  protected isOwnRow(row: VaultRow | BoxRow): row is BoxRow { return ('boxlabel' in row) && (row.vault_tok === this.world.vault_tok) }
  // --

  /** Answers 'box_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'box_listing' { return 'box_listing' satisfies Modelkind }
}
