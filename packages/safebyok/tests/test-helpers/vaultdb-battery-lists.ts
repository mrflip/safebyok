/** The battery's cases of tryListThings, over the root box's children. */
import { describe, expect, it } from 'vitest'
import { expectBad, expectGood } from 'safebyok-big/testing'
import { type Labelpath, VoidLifeseq } from '../../src/shapes/primitives'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import type { Kids } from '../../src/shapes/shapes-answers'
import type { VaultDB } from '../../src/storage/vault-db'
import { Life0, ReadTcPattern, RootScope, ThingBank, birthAskOf, boxRebornOf, boxSparseOf, boxThingOf, boxTombOf, delAskFor, gateThingOf, listAskAt, rootBoxOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** A box under the root box that fails its checks, which a datastore that keeps only a row's columns can still contain. */
const IncompatibleBox = Object.freeze({ ...boxThingOf('bad'), whisper_sealed: {} })

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
  /** A vaultDB whose bank's root box, with the box `aa` under it, has been deleted, and an incompatible box planted under it. */
  async function withRootGone(): Promise<VaultDB> {
    const vaultDB = await bornBank()
    await boxesBorn(vaultDB, boxThingOf('aa'))
    await expectGood(vaultDB.tryWriteThing(RootDelAsk))
    await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, IncompatibleBox)
    return vaultDB
  }

  describe("tryListThings(ask)", () => {
    it("answers the parent's children by label, the live and the tombstones apart, with each live box beside sparse and each tombstone whole", async () => {
      const vaultDB = await bornBank()
      const [zz, aa, mm] = await boxesBorn(vaultDB, boxThingOf('zz'), boxThingOf('aa'), boxThingOf('mm'))
      const mmGone = boxTombOf(mm!)
      await expectGood(vaultDB.tryWriteThing(delAskFor(mm!, mmGone)))
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: true, act: 'gotlive', parentage: [boxSparseOf(rootBoxOf())], incompatible_rows: [] })
      expect(answer.deltas).to.deep.equal([boxSparseOf(aa!), mmGone, boxSparseOf(zz!)])
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
      expect(await deltasAt(vaultDB, 'box')).to.deep.equal([a9, az, ab].map((box) => boxSparseOf(box!)))
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
      expect(answer.deltas).to.deep.equal([boxSparseOf(fresh)])
      expect(answer.ok && answer.val).to.deep.equal(answer.ok && kidsOf(rootAgain, [fresh], answer.read_tc))
    })

    it("names each child that fails its checks as an incompatible row, and lists the rest", async () => {
      const vaultDB = await bornBank()
      const [aa] = await boxesBorn(vaultDB, boxThingOf('aa'))
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, IncompatibleBox)
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      expect(answer).to.deep.include({ ok: true, incompatible_rows: [{ ...ThingBank, labelpath: 'box/bad', am: 'd' }] })
      expect(answer.deltas).to.deep.equal([boxSparseOf(aa!)])
    })

    it("refuses a parent gone, with its tombstone as dbhas, no children and the read_tc of its read, reading no child", async () => {
      const vaultDB = await withRootGone()
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      await expectBad(Promise.resolve(answer), 'absent_thing')
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: RootGone, parentage: [], deltas: [], incompatible_rows: [] })
      expect(answer.read_tc).to.match(ReadTcPattern)
    })

    it("refuses a root never stored, with its shell as dbhas, no children and a read_tc, reading no child", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: 'box/bad' }, IncompatibleBox)
      const answer = await vaultDB.tryListThings(listAskAt('box'))
      await expectBad(Promise.resolve(answer), 'absent_thing')
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: Shell.of(RootScope), parentage: [], deltas: [], incompatible_rows: [] })
      expect(Shell.of(RootScope)).to.deep.include({ lifepath: VoidLifeseq })
      expect(answer.read_tc).to.match(ReadTcPattern)
    })

    it("refuses a parent below the root never stored, with null as dbhas: a listing reads no lives above its parent", async () => {
      const vaultDB = await bornBank()
      const answer = await vaultDB.tryListThings(listAskAt('box/aa'))
      await expectBad(Promise.resolve(answer), 'absent_thing')
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, parentage: [], deltas: [], incompatible_rows: [] })
    })

    it("lists no children under a box below the root, nor under the main gate", async () => {
      const vaultDB = await bornBank()
      const [aa] = await boxesBorn(vaultDB, boxThingOf('aa'))
      expect(await deltasAt(vaultDB, aa!.labelpath)).to.deep.equal([])
      expect(await deltasAt(vaultDB, 'gate')).to.deep.equal([])
    })

    it("carries a parent that is not a box whole", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryListThings(listAskAt('gate'))).to.deep.include({ ok: true, act: 'gotlive', parentage: [gateThingOf()] })
    })

    it("refuses a parent past its kind's depth", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryListThings(listAskAt('box/aa/deep')), 'bad_record')
      await expectBad(vaultDB.tryListThings(listAskAt('gate/a/b')), 'bad_record')
    })
  })
}
