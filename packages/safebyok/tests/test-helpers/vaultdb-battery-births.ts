/** The battery's cases of tryBirthBank. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'

import type { VaultDB } from '../../src/storage/vault-db'
import { BankScope, GateScope, RootScope, bankThingOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, nextOf, rootBoxOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'
import { Lifeseq } from '../../src/shapes/primitives'

/** Expect `vaultDB` to have none of a bank's three roots but those of `present`. */
async function expectRootsVoidBut(vaultDB: VaultDB, ...present: ('bank' | 'gate' | 'box')[]): Promise<void> {
  for (const labelpath of ['bank', 'gate', 'box'] as const) {
    if (present.includes(labelpath)) { continue }
    expect(await vaultDB.tryGetThing(getAskAt(labelpath))).to.deep.include({ ok: true, act: 'gotvoid' })
  }
}

/** Register the battery's cases of a bank's birth. */
export function describeVaultDBBirths({ fresh, bornBank, withGate, gotAt, rowsOf }: VaultDBBatteryWorld): void {
  const roots = { bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf() }

  describe("tryBirthBank(ask)", () => {
    it("writes the bank, its main gate and its root box, answering with them", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: true, act: 'born', val: roots })
      expect(await gotAt(vaultDB, 'bank')).to.deep.equal(roots.bank)
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(roots.gate)
      expect(await gotAt(vaultDB, 'box')).to.deep.equal(roots.root)
    })

    it("passes the actual roots back, writing nothing, where the bank is live", async () => {
      const vaultDB = await bornBank()
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: OtherRevtok }), gate: gateThingOf({ revtok: OtherRevtok }) })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', val: roots })
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(roots.gate)
    })

    it("answers retcon to the birth already stored, by the put table", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'retcon', dbhas: roots.bank })
    })

    it("refuses a live bank stored without its main gate as a broken datastore", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).remove(GateScope)
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: OtherRevtok }) })
      await expectBad(vaultDB.tryBirthBank(other), 'storage_issue')
    })

    it("refuses over a bank's tombstone, writing nothing", async () => {
      const vaultDB = await fresh()
      const life1 = Lifeseq.ofLifenum(1)
      const bankGone = nextOf(bankThingOf(), { am: 'x', lifeseq: life1, lifepath: life1 })
      await rowsOf(vaultDB).plant(BankScope, bankGone)
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: bankGone })
      await expectRootsVoidBut(vaultDB, 'bank')
    })

    it("refuses over a main gate stored with no bank, writing nothing", async () => {
      const ante    = gateThingOf({ revtok: OtherRevtok })
      const vaultDB = await withGate(ante)
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: ante })
      await expectRootsVoidBut(vaultDB, 'gate')
    })

    it("refuses over a root box stored with no bank, writing neither of the others", async () => {
      const ante    = rootBoxOf({ revtok: OtherRevtok })
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(RootScope, ante)
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: ante })
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
