/** The battery's cases of tryListThings, over the root box's children. */
import { describe, expect, it } from 'vitest'
import { expectBad, expectGood } from 'safebyok-big/testing'
import { type Labelpath, VoidLifeseq } from '../../src/shapes/primitives'
import type { BoxRecord } from '../../src/shapes/shapes-thing'
import type { Kids, VaultDB } from '../../src/storage/vault-db'
import { Life0, ReadTcPattern, ThingBank, birthAskOf, boxRebornOf, boxThingOf, boxTombOf, delAskFor, listAskAt, rootBoxOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { Thing } from '../../src/models/thing'

/** A box under the root box that fails its checks, which a datastore that keeps only a row's columns can still contain. */
const DamagedBox = Object.freeze({ ...boxThingOf('bad'), whisper_sealed: {} })

/** The deltas of `vaultDB`'s list of the Things at `labelpath`, or throw. */
async function deltasAt(vaultDB: VaultDB, labelpath: Labelpath): Promise<unknown> {
  const answer = await vaultDB.tryListThings(listAskAt(labelpath))
  await expectGood(answer)
  return answer.deltas
}

/** The Kids value of `boxes` under `parent`, the live in `items` and the tombstones in `gones`, read at `read_tc`. */
function kidsOf(parent: Pick<BoxRecord, 'labelpath' | 'lifepath'>, boxes: readonly BoxRecord[], read_tc: string): Kids {
  const entriesOf = (am: string) => Object.fromEntries(boxes.filter((box) => box.am === am).map(({ label, lifeseq }) => [label, { lifeseq }]))
  return { modelkind: 'kids', parentpath: parent.labelpath, parentlife: parent.lifepath, items: entriesOf('a'), gones: entriesOf('x'), read_tc }
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
    it("answers the parent's children by label, the live and the tombstones apart, with the parent and each child sparse beside", async () => {
      const vaultDB = await bornBank()
      const [zz, aa, mm] = await boxesBorn(vaultDB, boxThingOf('zz'), boxThingOf('aa'), boxThingOf('mm'))
      const mmGone = boxTombOf(mm!)
      await expectGood(vaultDB.tryWriteThing(delAskFor(mm!, mmGone)))
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: true, act: 'gotlive', parentage: [Thing.sparseOf(rootBoxOf())], damaged_rows: [] })
      expect(answer.deltas).to.deep.equal([aa, mmGone, zz].map((box) => Thing.sparseOf(box!)))
      const read_tc = answer.ok ? answer.read_tc : ''
      expect(read_tc).to.match(ReadTcPattern)
      expect(answer.ok && answer.val).to.deep.equal(kidsOf(rootBoxOf(), [aa!, mmGone, zz!], read_tc))
    })

    it("answers a later read_tc for each later list", async () => {
      const vaultDB = await bornBank()
      const first  = await vaultDB.tryListThings(listAskAt('box'))
      const second = await vaultDB.tryListThings(listAskAt('box'))
      expect(first.ok && second.ok && (first.read_tc < second.read_tc)).to.be.true
    })

    it("lists labels byte by byte, never by a locale's order", async () => {
      const vaultDB = await bornBank()
      const [ab, az, a9] = await boxesBorn(vaultDB, boxThingOf('ab'), boxThingOf('a_z'), boxThingOf('a9'))
      expect(await deltasAt(vaultDB, 'box')).to.deep.equal([a9, az, ab].map((box) => Thing.sparseOf(box!)))
    })

    it("leaves out the children of the parent's earlier lives", async () => {
      const vaultDB = await bornBank()
      await boxesBorn(vaultDB, boxThingOf('old'))
      const rootAgain = boxRebornOf(RootGone)
      await expectGood(vaultDB.tryWriteThing(RootDelAsk))
      await expectGood(vaultDB.tryWriteThing(birthAskOf(rootAgain, RootGone)))
      const fresh = boxThingOf('fresh', { lifepath: `${rootAgain.lifepath}/${Life0}` })
      await bornUnder(vaultDB, fresh, rootAgain.lifepath)
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer.deltas).to.deep.equal([Thing.sparseOf(fresh)])
      expect(answer.ok && answer.val).to.deep.equal(answer.ok && kidsOf(rootAgain, [fresh], answer.read_tc))
    })

    it("names each child that fails its checks as a damaged row, and lists the rest", async () => {
      const vaultDB = await bornBank()
      const [aa] = await boxesBorn(vaultDB, boxThingOf('aa'))
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, DamagedBox)
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: true, damaged_rows: [{ ...ThingBank, labelpath: 'box/bad', am: 'd' }] })
      expect(answer.deltas).to.deep.equal([Thing.sparseOf(aa!)])
    })

    it("answers no children, and the parent, for a parent gone under ifAbsent 'nil', reading no child", async () => {
      const vaultDB = await withRootGone()
      const answer = await vaultDB.tryListThings(listAskAt('box', 'nil'))
      expect(answer).to.deep.include({ ok: true, act: 'gotgone', deltas: [], parentage: [Thing.sparseOf(RootGone)], damaged_rows: [] })
      expect(answer.ok && answer.val).to.deep.equal(answer.ok && kidsOf(RootGone, [], answer.read_tc))
    })

    it("refuses a parent gone under ifAbsent 'fail', with no children as dbhas and the read_tc of its read, reading no child", async () => {
      const vaultDB = await withRootGone()
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: [], parentage: [Thing.sparseOf(RootGone)], deltas: [], damaged_rows: [] })
      expect(answer.read_tc).to.match(ReadTcPattern)
    })

    it("answers or refuses a void parent by ifAbsent, with no children and a read_tc, reading no child", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, DamagedBox)
      const nilAnswer = await vaultDB.tryListThings(listAskAt('box', 'nil'))
      expect(nilAnswer).to.deep.include({ ok: true, act: 'gotvoid', deltas: [], parentage: [], damaged_rows: [] })
      expect(nilAnswer.ok && nilAnswer.val).to.deep.equal(nilAnswer.ok && kidsOf({ labelpath: 'box', lifepath: VoidLifeseq }, [], nilAnswer.read_tc))
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      await expectBad(Promise.resolve(answer), 'absent_vault')
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: [], parentage: [], deltas: [], damaged_rows: [] })
      expect(answer.read_tc).to.match(ReadTcPattern)
    })

    it("lists no children under a box below the root, nor under the main gate", async () => {
      const vaultDB = await bornBank()
      const [aa] = await boxesBorn(vaultDB, boxThingOf('aa'))
      expect(await deltasAt(vaultDB, aa!.labelpath)).to.deep.equal([])
      expect(await deltasAt(vaultDB, 'gate')).to.deep.equal([])
    })

    it("refuses a parent past its kind's depth", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryListThings(listAskAt('box/aa/deep')), 'bad_record')
      await expectBad(vaultDB.tryListThings(listAskAt('gate/a/b')), 'bad_record')
    })
  })
}
