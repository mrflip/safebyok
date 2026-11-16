/** The battery's cases of tryBirthBank. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'
import { lifeseqOfLifenum } from '../../src/storage/shapes-thing'
import type { BirthBankAnswer, VaultDB } from '../../src/storage/vault-db'
import { BankScope, GateScope, RootScope, bankThingOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, nextOf, rootBoxOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** Expect `vaultDB` to store none of a bank's three roots but those of `stored`. */
async function expectRootsVoidBut(vaultDB: VaultDB, ...stored: ('bank' | 'gate' | 'box')[]): Promise<void> {
  for (const labelpath of ['bank', 'gate', 'box'] as const) {
    if (stored.includes(labelpath)) { continue }
    expect(await vaultDB.tryGetThing(getAskAt(labelpath))).to.deep.include({ ok: true, act: 'gotvoid' })
  }
}

/** Expect `answer` to be a birth's good answer of `act`, each slot including what `slots` gives under its slotlabel. */
function expectBirth(answer: BirthBankAnswer, act: 'born' | 'noop', slots: Readonly<Record<'bank' | 'gate' | 'box', object>>): void {
  expect(answer).to.include({ ok: true, act })
  if (! answer.ok) { throw answer.err }
  for (const slotlabel of ['bank', 'gate', 'box'] as const) { expect(answer.val[slotlabel], slotlabel).to.deep.include(slots[slotlabel]) }
}

/** Register the battery's cases of a bank's birth. */
export function describeVaultDBBirths({ fresh, bornBank, withGate, gotAt, rowsOf }: VaultDBBatteryWorld): void {
  const roots = { bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf() }
  const born  = { bank: { ok: true, act: 'born', val: roots.bank }, gate: { ok: true, act: 'born', val: roots.gate }, box: { ok: true, act: 'born', val: roots.root } }

  describe("tryBirthBank(ask)", () => {
    it("writes the bank, its main gate and its root box, answering each slot born with its root", async () => {
      const vaultDB = await fresh()
      expectBirth(await vaultDB.tryBirthBank(birthBankAskOf()), 'born', born)
      expect(await gotAt(vaultDB, 'bank')).to.deep.equal(roots.bank)
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(roots.gate)
      expect(await gotAt(vaultDB, 'box')).to.deep.equal(roots.root)
    })

    it("answers noop where another's bank is live, each slot stale with the root stored, writing nothing", async () => {
      const vaultDB = await bornBank()
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: 'rev-other' }), gate: gateThingOf({ revtok: 'rev-other' }), root: rootBoxOf({ revtok: 'rev-other' }) })
      expectBirth(await vaultDB.tryBirthBank(other), 'noop', {
        bank: { ok: false, act: 'stale', dbhas: roots.bank }, gate: { ok: false, act: 'stale', dbhas: roots.gate }, box: { ok: false, act: 'stale', dbhas: roots.root },
      })
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(roots.gate)
    })

    it("answers noop to the birth already stored, each slot retcon by the put table", async () => {
      const vaultDB = await bornBank()
      expectBirth(await vaultDB.tryBirthBank(birthBankAskOf()), 'noop', {
        bank: { ok: false, act: 'retcon', dbhas: roots.bank }, gate: { ok: false, act: 'retcon', dbhas: roots.gate }, box: { ok: false, act: 'retcon', dbhas: roots.root },
      })
    })

    it("answers noop over a live bank stored without its main gate, the gate's slot born as a lone put, writing nothing", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).remove(GateScope)
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: 'rev-other' }), root: rootBoxOf({ revtok: 'rev-other' }) })
      expectBirth(await vaultDB.tryBirthBank(other), 'noop', {
        bank: { ok: false, act: 'stale', dbhas: roots.bank }, gate: born.gate, box: { ok: false, act: 'stale', dbhas: roots.root },
      })
      await expectRootsVoidBut(vaultDB, 'bank', 'box')
    })

    it("answers noop over a bank's tombstone, the bank's slot stale, writing nothing", async () => {
      const vaultDB = await fresh()
      const life1 = lifeseqOfLifenum(1)
      const bankGone = nextOf(bankThingOf(), { am: 'x', lifeseq: life1, lifepath: life1 })
      await rowsOf(vaultDB).plant(BankScope, bankGone)
      expectBirth(await vaultDB.tryBirthBank(birthBankAskOf()), 'noop', { ...born, bank: { ok: false, act: 'stale', dbhas: bankGone } })
      await expectRootsVoidBut(vaultDB, 'bank')
    })

    it("answers noop over a main gate stored with no bank, the gate's slot stale, writing nothing", async () => {
      const stored  = gateThingOf({ revtok: 'rev-other' })
      const vaultDB = await withGate(stored)
      expectBirth(await vaultDB.tryBirthBank(birthBankAskOf()), 'noop', { ...born, gate: { ok: false, act: 'stale', dbhas: stored } })
      await expectRootsVoidBut(vaultDB, 'gate')
    })

    it("answers each slot with its put's loggable ask, and a refused slot with the refusal its lone put would give", async () => {
      const vaultDB = await withGate(gateThingOf({ revtok: 'rev-other' }))
      const answer  = await vaultDB.tryBirthBank(birthBankAskOf())
      if (! answer.ok) { throw answer.err }
      expect(answer).to.not.have.property('dbhas')
      expect(answer.val.bank.ask).to.deep.include({ op: 'put', modelkind: 'bank', labelpath: 'bank', ifAbsent: 'add', ifPresent: 'fail' })
      expect(answer.val.box.ask).to.deep.include({ op: 'put', modelkind: 'box', labelpath: 'box' })
      const err = await expectBad(Promise.resolve(answer.val.gate), 'stale_write')
      expect(err.meta).to.deep.include({ oplabel: 'writeThing', act: 'stale' })
    })

    it("answers noop over a root box stored with no bank, the root box's slot stale, writing neither of the others", async () => {
      const stored  = rootBoxOf({ revtok: 'rev-other' })
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(RootScope, stored)
      expectBirth(await vaultDB.tryBirthBank(birthBankAskOf()), 'noop', { ...born, box: { ok: false, act: 'stale', dbhas: stored } })
      await expectRootsVoidBut(vaultDB, 'box')
    })

    it("refuses an ask whose roots fail their checks, writing nothing", async () => {
      const vaultDB = await fresh()
      const ask = birthBankAskOf({ root: boxThingOf() })
      await expectBad(vaultDB.tryBirthBank(ask), 'bad_record')
      await expectRootsVoidBut(vaultDB)
    })
  })
}
