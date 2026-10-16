// @vitest-environment node
// The optional hard-cap trigger from the postgres README, run on a real Postgres under each
// isolation level a host might leave its connections at. The README's SQL is read from the
// README itself, so what is proven here is what a host copies.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import type { DeviceKind } from './test-helpers'

const getDb = TH.useFileDatabase()
const u1 = TH.scopeOf('u1')
const Cap = 3

/** The README's trigger SQL, its limit of 1000 replaced by `cap`. */
const triggerSql = (cap: number): string => {
  const readme = readFileSync(fileURLToPath(new URL('../../../packages/safebyok-postgres/README.md', import.meta.url)), 'utf8')
  const sql = /```sql\n([^]*?safebyok_lockboxes_capped[^]*?)```/.exec(readme)?.[1]
  if (! sql?.includes('>= 1000')) { throw new Error("The README's hard-cap trigger is not where this test reads it.") }
  return sql.split('>= 1000').join(`>= ${String(cap)}`)
}

/**
 * What the README says of the trigger under each isolation level a host's connections may run at.
 * `held` maps the outcome of a write that began counting before another's lockbox committed to the
 * lockboxes then standing; `mostTogether` is the most of the writers made together that may land.
 */
type LevelCase = { title: string, kind: DeviceKind, held: Record<string, number>, mostTogether: number }

const Racers = 6
const Levels: LevelCase[] = [
  // The trigger counts again once it has the lock, and sees the committed lockbox: the cap holds.
  { title: "READ COMMITTED, Postgres's default", kind: {}, held: { storage_unavailable: Cap }, mostTogether: 1 },
  // The trigger counts from the transaction's own snapshot, which misses it: a place past the cap lands.
  { title: 'REPEATABLE READ', kind: { isolation: 'repeatable read' }, held: { landed: Cap + 1 }, mostTogether: Racers },
  // Whether the server lands it or fails it is its serialization's to say; either leaves a vault the adapter reads.
  { title: 'SERIALIZABLE', kind: { isolation: 'serializable' }, held: { landed: Cap + 1, storage_unavailable: Cap }, mostTogether: Racers },
]

TH.describeOnPostgres('hard cap', "the README's hard-cap trigger, over a real Postgres", () => {
  beforeEach(async () => {
    await getDb().empty()
    await getDb().host.query(triggerSql(Cap))
  })
  afterEach(async () => {
    // A failed race may leave a writer's transaction open, holding the table the drop needs.
    await getDb().endDevices()
    await getDb().host.query('DROP TRIGGER IF EXISTS safebyok_lockboxes_capped ON safebyok_lockboxes')
  })

  describe("with the trigger's number the adapter's, the adapter's own count refuses first", () => {
    it("refuses a new lockbox in a full vault as vault_full, and the trigger never meets it", async () => {
      const device = TH.deviceOver(getDb(), undefined, { maxLockboxes: Cap })('u1')
      await TH.filled(device, ['one', 'two', 'three'])
      await TH.expectRefusal(device.updateBox(u1, TH.boxOf('four', 'sk-fake'), TH.noBoxYet), 'vault_full')
    })
  })

  describe("with the trigger's number below the adapter's, the trigger is what refuses", () => {
    it("refuses every first write in a vault at the trigger's number as storage_unavailable, one under a boxlabel already taken included", async () => {
      const device = TH.deviceOver(getDb(), undefined, { maxLockboxes: Cap + 2 })('u1')
      await TH.filled(device, ['one', 'two', 'three'])
      await TH.expectRefusal(device.updateBox(u1, TH.boxOf('four', 'sk-fake'), TH.noBoxYet), 'storage_unavailable')
      await TH.expectRefusal(device.updateBox(u1, TH.boxOf('one', 'sk-fake-again'), TH.noBoxYet), 'storage_unavailable')
      expect(await TH.lockboxesStanding(getDb())).to.eq(Cap)
    })

    it("still lets a replacement land", async () => {
      const device = TH.deviceOver(getDb(), undefined, { maxLockboxes: Cap + 2 })('u1')
      await TH.filled(device, ['one', 'two', 'three'])
      const standing = await device.readBox(u1, 'one')
      await device.updateBox(u1, TH.boxOf('one', 'sk-fake-new'), { ...TH.noBoxYet, revision_id: standing?.revision_id ?? null })
      const replaced = await device.readBox(u1, 'one')
      expect(replaced?.revision_id).to.eq('rev-sk-fake-new')
    })
  })

  describe("racing writers for the last place", () => {
    for (const { title, kind, held, mostTogether } of Levels) {
      it(`under ${title}: a write that counted before the other's lockbox committed meets the trigger's verdict`, async () => {
        const db = getDb()
        const device = TH.deviceOver(db, undefined, { maxLockboxes: Cap + 2, kind })('u1')
        await TH.filled(device, ['one', 'two'])
        // One writer inside its transaction holds the trigger's lock on the bundle, its lockbox the third and not yet committed.
        const holder = await db.client()
        await holder.query('BEGIN')
        await TH.insertRawBox(holder, 'third_in_flight', 'one')

        const write = TH.outcomeOf(device.updateBox(u1, TH.boxOf('also_third', 'sk-fake'), TH.noBoxYet))
        await TH.untilStatementBlocked(db)
        await holder.query('COMMIT')
        const outcome = await write

        expect(held).to.have.property(outcome.kind)
        expect(await TH.lockboxesStanding(db)).to.eq(held[outcome.kind])
      })

      it(`under ${title}: writers made together, one place short of the cap, leave a vault every lockbox of which reads back`, async () => {
        const db = getDb()
        const first = TH.deviceOver(db, undefined, { maxLockboxes: Cap + 2, kind })('u1')
        await TH.filled(first, ['one', 'two'])
        const racers = Array.from({ length: Racers }, (_, idx) => ({ boxlabel: `racer_${String(idx)}`, vaultDB: TH.deviceOver(db, undefined, { maxLockboxes: Cap + 2, kind })('u1') }))

        const outcomes = await Promise.all(racers.map(({ boxlabel, vaultDB }) => TH.outcomeOf(vaultDB.updateBox(u1, TH.boxOf(boxlabel, 'sk-fake'), TH.noBoxYet))))

        const landed = racers.filter((_, idx) => outcomes[idx]?.kind === 'landed')
        const refusedKinds = new Set(outcomes.map((outcome) => outcome.kind).filter((outcomeKind) => outcomeKind !== 'landed'))
        expect(landed.length).to.be.within(1, mostTogether)
        expect([...refusedKinds].filter((refused) => refused !== 'storage_unavailable' && refused !== 'vault_full')).to.deep.equal([])
        expect(await TH.lockboxesStanding(db)).to.eq(2 + landed.length)
        const readBack = await Promise.all(landed.map(({ boxlabel }) => first.readBox(u1, boxlabel)))
        expect(readBack.filter((box) => box === null)).to.deep.equal([])
      })
    }
  })
})
