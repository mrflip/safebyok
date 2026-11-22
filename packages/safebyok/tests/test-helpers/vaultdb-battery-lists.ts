/** The battery's cases of tryListThings, over the root box's children. */
import { describe, expect, it } from 'vitest'
import { expectBad, expectGood } from 'safebyok-big/testing'
import type { Labelpath } from '../../src/shapes/primitives'
import type { VaultDB } from '../../src/storage/vault-db'
import { Life0, ThingBank, birthAskOf, boxRebornOf, boxThingOf, boxTombOf, delAskFor, listAskAt, rootBoxOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { Thing } from '../../src/models/thing'

/** A box under the root box that fails its checks, which a datastore that keeps only a row's columns can still contain. */
const DamagedBox = Object.freeze({ ...boxThingOf('bad'), whisper_sealed: {} })

/** The children `vaultDB` lists under the Thing at `labelpath`, or throw. */
async function listedAt(vaultDB: VaultDB, labelpath: Labelpath): Promise<unknown> {
  const answer = await vaultDB.tryListThings(listAskAt(labelpath))
  return await expectGood(answer)
}

/** The root box's tombstone, over {@link rootBoxOf}. */
const RootGone = Object.freeze(boxTombOf(rootBoxOf()))

/** The ask that deletes the root box, leaving {@link RootGone}. */
const RootDelAsk = delAskFor(rootBoxOf(), RootGone)

/** Register the battery's cases of a listing. */
export function describeVaultDBLists({ fresh, bornBank, bornUnder, boxesBorn, rowsOf }: VaultDBBatteryWorld): void {
  /** A vaultDB whose bank's root box, with the box `aa` under it, has been deleted, and a damaged box planted under it. */
  async function withRootGone(): Promise<VaultDB> {
    const vaultDB = await bornBank()
    await boxesBorn(vaultDB, boxThingOf('aa'))
    await expectGood(vaultDB.tryWriteThing(RootDelAsk))
    await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, DamagedBox)
    return vaultDB
  }

  describe("tryListThings(ask)", () => {
    it("lists the parent's children, sparse, in labelpath order, tombstones among them, with the parent beside", async () => {
      const vaultDB = await bornBank()
      const [zz, aa, mm] = await boxesBorn(vaultDB, boxThingOf('zz'), boxThingOf('aa'), boxThingOf('mm'))
      const mmGone = boxTombOf(mm!)
      await expectGood(vaultDB.tryWriteThing(delAskFor(mm!, mmGone)))
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: true, act: 'gotlive', parent: Thing.sparseOf(rootBoxOf()), damaged_rows: [] })
      expect(answer.ok && answer.val).to.deep.equal([aa, mmGone, zz].map((box) => Thing.sparseOf(box!)))
    })

    it("lists labels byte by byte, never by a locale's order", async () => {
      const vaultDB = await bornBank()
      const [ab, az, a9] = await boxesBorn(vaultDB, boxThingOf('ab'), boxThingOf('a_z'), boxThingOf('a9'))
      expect(await listedAt(vaultDB, 'box')).to.deep.equal([a9, az, ab].map((box) => Thing.sparseOf(box!)))
    })

    it("leaves out the children of the parent's earlier lives", async () => {
      const vaultDB = await bornBank()
      await boxesBorn(vaultDB, boxThingOf('old'))
      const rootAgain = boxRebornOf(RootGone)
      await expectGood(vaultDB.tryWriteThing(RootDelAsk))
      await expectGood(vaultDB.tryWriteThing(birthAskOf(rootAgain, RootGone)))
      const fresh = boxThingOf('fresh', { lifepath: `${rootAgain.lifepath}/${Life0}` })
      await bornUnder(vaultDB, fresh, rootAgain.lifepath)
      expect(await listedAt(vaultDB, 'box')).to.deep.equal([Thing.sparseOf(fresh)])
    })

    it("names each child that fails its checks as a damaged row, and lists the rest", async () => {
      const vaultDB = await bornBank()
      const [aa] = await boxesBorn(vaultDB, boxThingOf('aa'))
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, DamagedBox)
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: true, damaged_rows: [{ ...ThingBank, labelpath: 'box/bad', am: 'd' }] })
      expect(answer.ok && answer.val).to.deep.equal([Thing.sparseOf(aa!)])
    })

    it("answers no children, and the parent, for a parent gone under ifAbsent 'nil', reading no child", async () => {
      const vaultDB = await withRootGone()
      const answer = await vaultDB.tryListThings(listAskAt('box', 'nil'))
      expect(answer).to.deep.include({ ok: true, act: 'gotgone', val: [], parent: Thing.sparseOf(RootGone), damaged_rows: [] })
    })

    it("refuses a parent gone under ifAbsent 'fail', with no children as dbhas, reading no child", async () => {
      const vaultDB = await withRootGone()
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: [], parent: Thing.sparseOf(RootGone), damaged_rows: [] })
    })

    it("answers or refuses a void parent by ifAbsent, with no children, reading no child", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, DamagedBox)
      expect(await vaultDB.tryListThings(listAskAt('box', 'nil'))).to.deep.include({ ok: true, act: 'gotvoid', val: [], parent: null, damaged_rows: [] })
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      await expectBad(Promise.resolve(answer), 'absent_vault')
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: [], parent: null, damaged_rows: [] })
    })

    it("lists no children under a box below the root, nor under the main gate", async () => {
      const vaultDB = await bornBank()
      const [aa] = await boxesBorn(vaultDB, boxThingOf('aa'))
      expect(await listedAt(vaultDB, aa!.labelpath)).to.deep.equal([])
      expect(await listedAt(vaultDB, 'gate')).to.deep.equal([])
    })

    it("refuses a parent past its kind's depth", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryListThings(listAskAt('box/aa/deep')), 'bad_record')
      await expectBad(vaultDB.tryListThings(listAskAt('gate/a/b')), 'bad_record')
    })
  })
}
