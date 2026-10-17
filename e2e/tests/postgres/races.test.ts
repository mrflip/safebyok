// @vitest-environment node
// Writers for a vault's last places, on a real Postgres and no turnstile: separate pools, so the
// statements run on separate connections at the same moment, as the postgres README's
// "best effort" says they may. PGlite runs one statement at a time and cannot show it.
import { expect, it } from 'vitest'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()
const u1 = TH.scopeOf('u1')

/** The boxlabels the u1 vault lists, through a device of its own. */
const listed = async (vaultDBFor: ReturnType<typeof TH.deviceOver>): Promise<string[]> => {
  const boxes = await vaultDBFor('u1').listBoxes(u1)
  return boxes.map((box) => box.boxlabel)
}

TH.describeOnPostgres('races', "postgresVaultDB's lockbox limit, over a real Postgres", () => {
  const Cap = 5
  const Racers = 8
  const Rounds = 5

  it("leaves writers racing for the last place with some landed, none refused for another reason, and each that landed readable and listed (bounds and read-back, not the limit)", async () => {
    const db = getDb()
    for (let round = 0; round < Rounds; round += 1) {
      await db.endDevices()
      await db.empty()
      const first = TH.deviceOver(db, undefined, { maxLockboxes: Cap })
      await TH.filled(first('u1'), ['standing_one', 'standing_two', 'standing_three', 'standing_four'])
      const racers = Array.from({ length: Racers }, (_, idx) => ({ boxlabel: `racer_${String(idx)}`, vaultDB: TH.deviceOver(db, undefined, { maxLockboxes: Cap })('u1') }))

      const outcomes = await Promise.allSettled(racers.map(({ boxlabel, vaultDB }) => vaultDB.updateBox(u1, TH.boxOf(boxlabel, 'sk-fake'), TH.noBoxYet)))

      const landed = racers.filter((_, idx) => outcomes[idx]?.status === 'fulfilled')
      const refusedKinds = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? (outcome.reason as { kind?: string }).kind : []))
      expect(landed.length).to.be.within(1, Racers)
      expect(refusedKinds.filter((kind) => kind !== 'vault_full')).to.deep.equal([])
      expect(await TH.lockboxesStanding(db)).to.eq(4 + landed.length)
      for (const { boxlabel } of landed) { expect(await first('u1').readBox(u1, boxlabel)).to.not.be.null }
      expect(await listed(first)).to.have.lengthOf(4 + landed.length)
    }
  })

  it("lets a write past the limit land, as the README says it may: a writer whose count began before another's lockbox committed", async () => {
    const db = getDb()
    await db.empty()
    const device = TH.deviceOver(db, undefined, { maxLockboxes: Cap })('u1')
    await TH.filled(device, ['one', 'two', 'three', 'four'])
    const racer = await db.client()
    await racer.query('BEGIN')
    await TH.insertRawBox(racer, 'fifth_in_flight', 'one')

    await device.updateBox(u1, TH.boxOf('also_fifth', 'sk-fake'), TH.noBoxYet)
    await racer.query('COMMIT')

    expect(await TH.lockboxesStanding(db)).to.eq(Cap + 1)
    expect(await device.readBox(u1, 'also_fifth')).to.not.be.null
    expect(await device.readBox(u1, 'fifth_in_flight')).to.not.be.null
  })

  it("keeps every lockbox that landed past the limit readable, refuses a new one until erases make room, and then lands it", async () => {
    const db = getDb()
    await db.empty()
    const device = TH.deviceOver(db, undefined, { maxLockboxes: Cap })('u1')
    await TH.filled(device, ['one', 'two', 'three', 'four'])
    const racer = await db.client()
    await racer.query('BEGIN')
    await TH.insertRawBox(racer, 'fifth_in_flight', 'one')
    await device.updateBox(u1, TH.boxOf('also_fifth', 'sk-fake'), TH.noBoxYet)
    await racer.query('COMMIT')

    await TH.expectRefusal(device.updateBox(u1, TH.boxOf('sixth', 'sk-fake'), TH.noBoxYet), 'vault_full')
    await device.eraseBox(u1, 'one', TH.thisVault)
    await TH.expectRefusal(device.updateBox(u1, TH.boxOf('sixth', 'sk-fake'), TH.noBoxYet), 'vault_full')
    await device.eraseBox(u1, 'two', TH.thisVault)
    await device.updateBox(u1, TH.boxOf('sixth', 'sk-fake'), TH.noBoxYet)
    expect(await TH.lockboxesStanding(db)).to.eq(Cap)
  })
})
