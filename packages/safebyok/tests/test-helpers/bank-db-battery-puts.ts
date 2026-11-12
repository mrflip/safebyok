/** The battery's puts and gate verbs: what each does to the rows, and what each refuses by the row it finds. */

import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import type { BankDB } from '../../src/storage/bank-db'
import { omitting } from './refusals'
import { Now } from './storage-world'
import {
  bankScope, gateScope, vaultScope, boxQuery, MainOnly, mainWayin, passkey0Wayin, otherMainWayin, bankAt, gateAt, vaultAt, boxAt,
  bankTombstoneOf, vaultTombstoneOf, boxTombstoneOf, bankEnsureAsk, bankBuildAskOf, gatePutAskOf, bankDelAskOf,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

const anyIfPresent = ['repl', 'fail', 'get'] as const
const anyIfAbsent  = ['add', 'fail'] as const

/** A revision_tok no other record here has: what another device's write at the same seq would bring. */
const Rival = { revision_tok: 'rival' }

/** A first record another device would put at the box's address, in a life of its own. */
const rivalBirth = boxAt(0, 'bank1', 'life1', { ...Rival, box_tok: 'box2' })

const box = boxAt()
const boxTombstone = boxTombstoneOf(box)
const noBoxYet = BX.shellBoxOf(boxQuery)
const noVaultYet = BX.shellVaultOf(vaultScope)

/** The records that replace the world's vault and box, one revision on. */
const nextVault = vaultAt(1)
const nextBox   = boxAt(1)

/** The gate's wayins with its passkey wayin added. */
const WithPasskey = { main: mainWayin, passkey0: passkey0Wayin }

/** Puts and dels of the box that the row expected and the record cannot both be true of, each over the live box at seq 0 unless it says otherwise. */
const UnstorableBoxAsks = [
  // the record against the address of its ask:
  [{ ...boxPutAskOf(nextBox, box), boxlabel: "other" },                                       'a put whose record is at another boxlabel than its ask'],
  [{ ...boxPutAskOf(nextBox, box), vault_tok: "life2" },                                      'a put whose record is of another vault_tok than its ask'],
  [{ ...boxPutAskOf(nextBox, box), bank_tok: "bank2" },                                       'a put whose record is of another bank_tok than its ask'],
  [{ ...boxDelAskOf(box), user_id: "u2" },                                                    'a del whose tombstone is of another user_id than its ask'],
  // the revision of the record against the row expected:
  [boxPutAskOf(boxAt(2), box),                                                                'a put two seqs past the row it expects'],
  [boxDelAskOf(box, { ...boxTombstone, revision_seq: 0 }),                                    'a del at the seq of the row it expects'],
  [boxPutAskOf(boxAt(1, "bank1", "life1", { revision_tok: box.revision_tok }), box),          'a put that keeps the revision_tok of the row it expects'],
  [boxPutAskOf(boxAt(0, "bank1", "life1", { revision_tok: SX.VoidRevisionTok })),             'a put that brings the revision_tok of the shell'],
  [boxPutAskOf(boxAt(6), { ...noBoxYet, revision_seq: 5 }),                                   'a put expecting the revision_tok of the shell at another seq'],
  [boxPutAskOf(boxAt(0), { ...noBoxYet, ...Rival }),                                          'a put expecting the seq of the shell under another revision_tok'],
  // the life of the record against the row expected:
  [boxPutAskOf(boxAt(1, "bank1", "life1", { box_tok: "box2" }), box),                         'a put over a live row under another box_tok'],
  [boxPutAskOf(boxAt(0, "bank1", "life1", { box_tok: SX.VoidLifeTok })),                      'a first put that brings the box_tok of the shell'],
  [boxPutAskOf(boxAt(2, "bank1", "life1", { box_tok: boxTombstone.box_tok }), boxTombstone),  'a put over a tombstone that keeps its box_tok'],
  [boxDelAskOf(box, { ...boxTombstone, box_tok: box.box_tok }),                               'a del that keeps the box_tok of the row it deletes'],
  [{ ...boxPutAskOf(nextBox, box), record: boxTombstone },                                    'a put of a tombstone'],
  [{ ...boxDelAskOf(box), record: nextBox },                                                  'a del of a live record'],
] as const

/** A bankDB `makeCapped` caps at one box to a vault life, with the bank built and the vault put. */
async function cappedWithVault(makeCapped: BatteryWorld['makeCapped']) {
  const bankDB = await makeCapped(1)
  const vault = vaultAt()
  await bankDB.buildBank(bankBuildAskOf())
  await bankDB.putVault(vaultPutAskOf(vault))
  return { bankDB, vault }
}

/** Registers the puts' and gate verbs' cases over `world`. */
export function describePuts({ fresh, putWith, rowsOf, hasCap, makeCapped }: BatteryWorld): void {
  /** A box deleted, and the rebirth that would stand on its tombstone. */
  async function withBoxTombstone() {
    const built = await putWith({ box: true })
    const tombstone = boxTombstoneOf(built.box)
    await built.bankDB.delBox(boxDelAskOf(built.box))
    return { ...built, tombstone, reborn: boxAt(tombstone.revision_seq + 1, 'bank1', 'life1', { box_tok: 'box2' }) }
  }

  /** The box row `openai` of the vault's life `bank1/life1`, as stored. */
  async function storedBoxOf(bankDB: BankDB): Promise<unknown> {
    const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
    return boxrows.get('openai')
  }

  describe("buildBank", () => {
    it("is born over no bank, storing the bank row and its gate row together, with the gate as val and the bank as parent", async () => {
      const bankDB = await fresh()
      const bank = bankAt()
      const gate = gateAt()
      expect(await bankDB.buildBank(bankBuildAskOf(bank, gate))).to.deep.include({ ok: true, act: 'born', val: gate, parent: bank })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("is reborn over the bank's tombstone at its revision, under a bank_tok of its own", async () => {
      const { bankDB, bank } = await putWith()
      const tombstone = bankTombstoneOf(bank)
      await bankDB.delBank(bankDelAskOf(bank))
      const reborn = bankAt(2, 'bank2')
      const gate = gateAt(0, 'bank2')
      expect(await bankDB.buildBank(bankBuildAskOf(reborn, gate, tombstone))).to.deep.include({ ok: true, act: 'reborn', val: gate, parent: reborn })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(reborn)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("over a live bank, returns its gate as passed, storing nothing", async () => {
      const { bankDB, bank, gate } = await putWith()
      const rival = { ...bankAt(0, 'bank2'), ...Rival }
      const ask = bankBuildAskOf(rival, gateAt(0, 'bank2'))
      expect(await bankDB.buildBank(ask)).to.deep.include({ ok: true, act: 'passed', val: gate, parent: bank })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("refuses 'stale_write' over a tombstone later than the row expected, with the tombstone and leaving it", async () => {
      const { bankDB, bank } = await putWith()
      const tombstone = bankTombstoneOf(bank)
      await bankDB.delBank(bankDelAskOf(bank))
      const answer = await bankDB.tryBuildBank(bankBuildAskOf(bankAt(0, 'bank2'), gateAt(0, 'bank2')))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: tombstone, parent: tombstone })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(tombstone)
    })

    it("puts its gate over a gate row left from an ended life of the bank", async () => {
      const { bankDB, bank } = await putWith()
      const tombstone = bankTombstoneOf(bank)
      await bankDB.delBank(bankDelAskOf(bank))
      await rowsOf(bankDB).plantGateRow(gateScope, gateAt(3, 'bank1', WithPasskey))
      const gate = gateAt(0, 'bank2')
      const ask = bankBuildAskOf(bankAt(2, 'bank2'), gate, tombstone)
      expect(await bankDB.buildBank(ask)).to.deep.include({ ok: true, act: 'reborn', val: gate })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("refuses a gate under another bank_tok than its bank record, or past its first revision, storing nothing", async () => {
      const bankDB = await fresh()
      for (const gate of [gateAt(0, 'bank2'), gateAt(1)]) {
        const ask = bankBuildAskOf(bankAt(), gate)
        expect(await bankDB.tryBuildBank(ask)).to.deep.include({ ok: false, act: 'unclassified_storing' })
      }
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.be.null
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.be.null
    })

    it("refuses a bank_tok or gate_tok that is not new, over none or over the bank's tombstone, storing nothing", async () => {
      const { bankDB, bank } = await putWith()
      const tombstone = bankTombstoneOf(bank)
      await bankDB.delBank(bankDelAskOf(bank))
      const asks = [
        bankBuildAskOf(bankAt(2, tombstone.bank_tok), gateAt(0, tombstone.bank_tok), tombstone),
        bankBuildAskOf(bankAt(2, SX.VoidLifeTok), gateAt(0, SX.VoidLifeTok), tombstone),
        bankBuildAskOf(bankAt(2, 'bank2'), gateAt(0, 'bank2', MainOnly, SX.VoidLifeTok), tombstone),
        bankBuildAskOf(bankAt(0, SX.VoidLifeTok), gateAt(0, SX.VoidLifeTok)),
        bankBuildAskOf(bankAt(0, 'bank2'), gateAt(0, 'bank2', MainOnly, SX.VoidLifeTok)),
      ]
      for (const ask of asks) { expect(await bankDB.tryBuildBank(ask)).to.deep.include({ ok: false, act: 'unclassified_storing' }) }
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(tombstone)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.be.null
    })

    it("is born with a passkey wayin beside the main one", async () => {
      const bankDB = await fresh()
      const gate = gateAt(0, 'bank1', WithPasskey)
      const ask = bankBuildAskOf(bankAt(), gate)
      expect(await bankDB.buildBank(ask)).to.deep.include({ ok: true, act: 'born', val: gate })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })
  })

  describe("putVault", () => {
    it("is born over a void row, and reborn over a tombstone at its revision", async () => {
      const { bankDB, bank } = await putWith({ vault: false })
      const vault = vaultAt()
      expect(await bankDB.putVault(vaultPutAskOf(vault))).to.deep.include({ ok: true, act: 'born', val: vault, parent: bank })
      const tombstone = vaultTombstoneOf(vault)
      await bankDB.delVault(vaultDelAskOf(vault))
      const reborn = vaultAt(2, 'bank1', 'life2')
      expect(await bankDB.putVault(vaultPutAskOf(reborn, tombstone))).to.deep.include({ act: 'reborn', val: reborn, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(reborn)
    })

    it("replaces a live row at its revision, and refuses 'stale_write' at an earlier one", async () => {
      const { bankDB, bank, vault } = await putWith()
      expect(await bankDB.putVault(vaultPutAskOf(nextVault, vault))).to.deep.include({ act: 'replaced', val: nextVault, parent: bank })
      const answer = await bankDB.tryPutVault(vaultPutAskOf(vaultAt(1, 'bank1', 'life1', Rival), vault))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: nextVault, parent: bank })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(nextVault)
    })

    it("refuses 'stale_write' where the row stored has the revision_tok its record brings", async () => {
      const { bankDB, bank, vault } = await putWith()
      await bankDB.putVault(vaultPutAskOf(nextVault, vault))
      const answer = await bankDB.tryPutVault(vaultPutAskOf(nextVault, vault))
      expect(answer).to.deep.include({ ok: false, act: 'retcon', dbhas: nextVault, parent: bank })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("refuses a replace under another vault_tok than the row it expects, leaving the row", async () => {
      const { bankDB, vault } = await putWith()
      const ask = vaultPutAskOf(vaultAt(1, 'bank1', 'life2'), vault)
      expect(await bankDB.tryPutVault(ask)).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
    })

    it("refuses a put where the row expected has the stored revision_tok under another vault_tok", async () => {
      const { bankDB, bank, vault } = await putWith()
      const answer = await bankDB.tryPutVault(vaultPutAskOf(vaultAt(1, 'bank1', 'life2'), vaultAt(0, 'bank1', 'life2')))
      expect(answer).to.deep.include({ ok: false, act: 'clash', dbhas: vault, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
    })

    it("over a live row, ifPresent 'get' returns it as passed and 'fail' refuses, and neither stores", async () => {
      const { bankDB, bank, vault } = await putWith()
      const passed = await bankDB.putVault(vaultPutAskOf(vaultAt(0, 'bank1', 'life2', Rival), null, { ifPresent: 'get' }))
      expect(passed).to.deep.include({ ok: true, act: 'passed', val: vault, parent: bank })
      expect(passed.ask).to.deep.include({ op: 'put', ...vaultScope, bank_tok: 'bank1', ifPresent: 'get' })
      expect(passed.ask.record).to.deep.equal({ revision_tok: 'rival', revision_seq: 0, am: 'a', bank_tok: 'bank1', vault_tok: 'life2' })
      expect(passed.ask.expected).to.deep.include(SX.VoidRevision)
      const camped = await bankDB.tryPutVault(vaultPutAskOf(nextVault, vault, { ifPresent: 'fail' }))
      expect(camped).to.deep.include({ ok: false, act: 'camped', dbhas: vault, parent: bank })
      expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
    })

    it("refuses a put expecting a later revision than is stored, or another at its seq", async () => {
      const { bankDB, bank, vault } = await putWith()
      const aheadAsk = vaultPutAskOf(vaultAt(8), vaultAt(7))
      expect(await bankDB.tryPutVault(aheadAsk)).to.deep.include({ ok: false, act: 'ahead', dbhas: vault, parent: bank })
      const forkedAsk = vaultPutAskOf(nextVault, vaultAt(0, 'bank1', 'life1', Rival))
      expect(await bankDB.tryPutVault(forkedAsk)).to.deep.include({ ok: false, act: 'forked', dbhas: vault, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
    })

    it("refuses a put that expects a row where none is stored", async () => {
      const { bankDB, bank } = await putWith({ vault: false })
      const ask = vaultPutAskOf(vaultAt(8), vaultAt(7))
      expect(await bankDB.tryPutVault(ask)).to.deep.include({ ok: false, act: 'ahead', dbhas: null, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
    })

    it("refuses a record whose revision_seq is not one past the expected row's, or that fails its checks", async () => {
      const { bankDB } = await putWith({ vault: false })
      const ask = vaultPutAskOf(vaultAt(3))
      expect(await bankDB.tryPutVault(ask)).to.deep.include({ ok: false, act: 'unclassified_storing' })
      const secretish = 'hunter2'
      const answer = await bankDB.tryPutVault(vaultPutAskOf({ ...vaultAt(), vaultlabel: `${secretish}^^bad label` }))
      expect(answer).to.deep.include({ ok: false, ask: {} })
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['vaultlabel', 'record.vaultlabel'])
      expect(JSON.stringify([answer.err?.message, answer.ask])).to.not.include(secretish)
    })

    it("refuses a box record, a box tombstone or a vault tombstone failing its checks, naming the field and putting nothing", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      const answers = [
        await bankDB.tryPutBox(boxPutAskOf({ ...boxAt(1), whisper_ciphered: 7 } as never, box)),
        await bankDB.tryDelBox(boxDelAskOf(box, { ...boxTombstone, am: 'a' } as never)),
        await bankDB.tryDelVault(vaultDelAskOf(vault, { ...vaultTombstoneOf(vault), wayins: MainOnly } as never)),
      ]
      for (const answer of answers) { expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' }) }
      expect(answers.map(({ err }) => err?.meta?.fieldnames)).to.deep.equal([['record.whisper_ciphered'], ['record.am'], ['record']])
      expect(await bankDB.getBox(boxGetAskOf())).to.deep.include({ val: box })
      expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ val: vault })
    })

    it("refuses a row expected that is half the shell", async () => {
      const { bankDB } = await putWith({ vault: false })
      const halves = [vaultPutAskOf(vaultAt(6), { ...noVaultYet, revision_seq: 5 }), vaultPutAskOf(vaultAt(0), { ...noVaultYet, ...Rival })]
      for (const ask of halves) { expect(await bankDB.tryPutVault(ask)).to.deep.include({ ok: false, act: 'unclassified_storing' }) }
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
    })
  })

  describe("putBox", () => {
    it("returns act 'born', 'replaced' or 'reborn' according to the row it writes over", async () => {
      const { bankDB, vault } = await putWith()
      expect(await bankDB.putBox(boxPutAskOf(box))).to.deep.include({ ok: true, act: 'born', val: box, parent: vault })
      expect(await bankDB.putBox(boxPutAskOf(nextBox, box))).to.deep.include({ act: 'replaced', val: nextBox, parent: vault })
      const tombstone = boxTombstoneOf(nextBox)
      await bankDB.delBox(boxDelAskOf(nextBox))
      const reborn = boxAt(3, 'bank1', 'life1', { box_tok: 'box2' })
      expect(await bankDB.putBox(boxPutAskOf(reborn, tombstone))).to.deep.include({ act: 'reborn', val: reborn, parent: vault })
      expect(await storedBoxOf(bankDB)).to.deep.equal(reborn)
    })

    it("over a live row, ifPresent 'get' returns it as passed and 'fail' refuses", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      expect(await bankDB.putBox(boxPutAskOf(nextBox, box, { ifPresent: 'get' }))).to.deep.include({ ok: true, act: 'passed', val: box, parent: vault })
      expect(await bankDB.tryPutBox(boxPutAskOf(nextBox, box, { ifPresent: 'fail' }))).to.deep.include({ ok: false, act: 'camped', dbhas: box, parent: vault })
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
    })

    it("refuses 'stale_write' over a row moved past the one expected, with the row and leaving it", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      await bankDB.putBox(boxPutAskOf(nextBox, box))
      const answer = await bankDB.tryPutBox(boxPutAskOf(boxAt(1, 'bank1', 'life1', Rival), box))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: nextBox, parent: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await storedBoxOf(bankDB)).to.deep.equal(nextBox)
    })

    it("refuses 'stale_write' where the row stored has the revision_tok its record brings", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      await bankDB.putBox(boxPutAskOf(nextBox, box))
      const answer = await bankDB.tryPutBox(boxPutAskOf(nextBox, box))
      expect(answer).to.deep.include({ ok: false, act: 'retcon', dbhas: nextBox, parent: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("refuses a put where the row expected is not the one stored and no earlier", async () => {
      const { bankDB, vault } = await putWith({ box: true })
      const conflicts = [
        ['ahead',  boxPutAskOf(boxAt(8), boxAt(7))],
        ['forked', boxPutAskOf(nextBox, boxAt(0, 'bank1', 'life1', Rival))],
        ['clash',  boxPutAskOf(boxAt(1, 'bank1', 'life1', { box_tok: 'box2' }), boxAt(0, 'bank1', 'life1', { box_tok: 'box2' }))],
      ] as const
      for (const [act, ask] of conflicts) {
        expect(await bankDB.tryPutBox(ask)).to.deep.include({ ok: false, act, dbhas: box, parent: vault })
      }
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
    })

    for (const [ask, blurb] of UnstorableBoxAsks) {
      it(`refuses ${blurb}`, async () => {
        const { bankDB } = await putWith({ box: true })
        const answer = (ask.op === 'put') ? await bankDB.tryPutBox(ask as never) : await bankDB.tryDelBox(ask as never)
        expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
        expect(await storedBoxOf(bankDB)).to.deep.equal(box)
      })
    }

    it("refuses a put under no vault row, under a life pair that is not the live vault's, and under a vault's tombstone", async () => {
      const { bankDB, vault } = await putWith({ vault: false })
      expect(await bankDB.tryPutBox(boxPutAskOf(box))).to.deep.include({ ok: false, act: 'vault_void', parent: noVaultYet, dbhas: null })

      await bankDB.putVault(vaultPutAskOf(vault))
      for (const ended of [boxAt(0, 'bank1', 'oldlife'), boxAt(0, 'bank0', 'life1')]) {
        expect(await bankDB.tryPutBox(boxPutAskOf(ended))).to.deep.include({ ok: false, act: 'vault_reborn', parent: vault, dbhas: null })
      }

      await bankDB.delVault(vaultDelAskOf(vault))
      expect(await bankDB.tryPutBox(boxPutAskOf(box))).to.deep.include({ ok: false, act: 'vault_gone', parent: vaultTombstoneOf(vault), dbhas: null })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
    })

    it("refuses a box over maxRecordSizeEst, and stores one under it", async () => {
      const bankDB = await fresh({ maxRecordSizeEst: 2000 })
      await bankDB.buildBank(bankBuildAskOf())
      await bankDB.putVault(vaultPutAskOf(vaultAt()))
      const heavy = boxAt(0, 'bank1', 'life1', { sidecar: { memo: 'x'.repeat(2000) } })
      expect(await bankDB.tryPutBox(boxPutAskOf(heavy))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
      expect(await bankDB.putBox(boxPutAskOf(box))).to.deep.include({ act: 'born' })
    })

    // A bankDB made without a cap has none of the cases below.
    if (! hasCap) { return }

    it("refuses a new box past its bankDB's cap, and replaces one stored", async () => {
      const { bankDB, vault } = await cappedWithVault(makeCapped)
      await bankDB.putBox(boxPutAskOf(box))
      const full = await bankDB.tryPutBox(boxPutAskOf(boxAt(0, 'bank1', 'life1', { boxlabel: 'other' })))
      expect(full).to.deep.include({ ok: false, act: 'vault_full', parent: vault })
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
      expect(full.ask).to.include({ boxlabel: 'other' })
      expect(await bankDB.putBox(boxPutAskOf(nextBox, box))).to.deep.include({ act: 'replaced' })
    })

    it("stores a put over a box's own tombstone at its bankDB's cap", async () => {
      const { bankDB } = await cappedWithVault(makeCapped)
      await bankDB.putBox(boxPutAskOf(box))
      await bankDB.delBox(boxDelAskOf(box))
      const reborn = boxAt(boxTombstone.revision_seq + 1, 'bank1', 'life1', { box_tok: 'box2' })
      expect(await bankDB.putBox(boxPutAskOf(reborn, boxTombstone))).to.deep.include({ act: 'reborn', val: reborn })
    })

    it("counts a deleted box against its bankDB's cap", async () => {
      const { bankDB } = await cappedWithVault(makeCapped)
      await bankDB.putBox(boxPutAskOf(box))
      await bankDB.delBox(boxDelAskOf(box))
      const full = await bankDB.tryPutBox(boxPutAskOf(boxAt(0, 'bank1', 'life1', { boxlabel: 'other' })))
      expect(full).to.deep.include({ ok: false, act: 'vault_full' })
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
    })

    it("starts a vault made anew with none of its old boxes against the cap", async () => {
      const { bankDB, vault } = await cappedWithVault(makeCapped)
      await bankDB.putBox(boxPutAskOf(box))
      await bankDB.delVault(vaultDelAskOf(vault))
      await bankDB.putVault(vaultPutAskOf(vaultAt(2, 'bank1', 'life2'), vaultTombstoneOf(vault)))
      const newLife = boxAt(0, 'bank1', 'life2')
      expect(await bankDB.putBox(boxPutAskOf(newLife))).to.deep.include({ act: 'born', val: newLife })
    })
  })

  describe("a put's answer, by the row it finds and its ifAbsent and ifPresent", () => {
    it.each(anyIfPresent)("refuses over a void box row with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { bankDB, vault } = await putWith()
      expect(await bankDB.tryPutBox(boxPutAskOf(box, null, { ifAbsent: 'fail', ifPresent }))).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: vault })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
    })

    it.each(anyIfPresent)("refuses over a box tombstone at its revision with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { bankDB, vault, tombstone, reborn } = await withBoxTombstone()
      expect(await bankDB.tryPutBox(boxPutAskOf(reborn, tombstone, { ifAbsent: 'fail', ifPresent }))).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, parent: vault })
    })

    it.each(anyIfAbsent)("refuses 'stale_write' over a box tombstone later than the row expected, with ifAbsent %s", async (ifAbsent) => {
      const { bankDB, vault, tombstone } = await withBoxTombstone()
      for (const ask of [boxPutAskOf(boxAt(1, 'bank1', 'life1', Rival), box, { ifAbsent }), boxPutAskOf(rivalBirth, null, { ifAbsent })]) {
        const answer = await bankDB.tryPutBox(ask)
        expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: tombstone, parent: vault })
        expect(answer.err?.refusalkind).to.eq('stale_write')
      }
      expect(await storedBoxOf(bankDB)).to.deep.equal(tombstone)
    })

    it.each(anyIfAbsent)("refuses 'camped' over a live box at its revision with ifAbsent %s and ifPresent fail", async (ifAbsent) => {
      const { bankDB, vault } = await putWith({ box: true })
      expect(await bankDB.tryPutBox(boxPutAskOf(nextBox, box, { ifAbsent, ifPresent: 'fail' }))).to.deep.include({ ok: false, act: 'camped', dbhas: box, parent: vault })
    })

    it.each(anyIfAbsent)("refuses 'stale_write' over a live box for a put that expects none, with ifAbsent %s and ifPresent fail", async (ifAbsent) => {
      const { bankDB, vault } = await putWith({ box: true })
      const answer = await bankDB.tryPutBox(boxPutAskOf(rivalBirth, null, { ifAbsent, ifPresent: 'fail' }))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: box, parent: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it.each(anyIfAbsent)("returns act 'passed' with the live box under ifAbsent %s and ifPresent get, at its revision or expecting none", async (ifAbsent) => {
      const { bankDB, vault } = await putWith({ box: true })
      expect(await bankDB.putBox(boxPutAskOf(nextBox, box, { ifAbsent, ifPresent: 'get' }))).to.deep.include({ act: 'passed', val: box, parent: vault })
      expect(await bankDB.putBox(boxPutAskOf(rivalBirth, null, { ifAbsent, ifPresent: 'get' }))).to.deep.include({ act: 'passed', val: box, parent: vault })
      expect(await storedBoxOf(bankDB)).to.deep.equal(box)
    })

    it.each(anyIfAbsent)("replaces a live box at its revision under ifAbsent %s and ifPresent repl, and refuses a put that expects none", async (ifAbsent) => {
      const { bankDB, vault } = await putWith({ box: true })
      expect(await bankDB.tryPutBox(boxPutAskOf(rivalBirth, null, { ifAbsent, ifPresent: 'repl' }))).to.deep.include({ ok: false, act: 'stale', dbhas: box, parent: vault })
      expect(await bankDB.putBox(boxPutAskOf(nextBox, box, { ifAbsent, ifPresent: 'repl' }))).to.deep.include({ act: 'replaced', val: nextBox, parent: vault })
    })

    it.each(anyIfPresent)("adds over a void box row or a tombstone at its revision under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { bankDB, vault } = await putWith()
      expect(await bankDB.putBox(boxPutAskOf(box, null, { ifAbsent: 'add', ifPresent }))).to.deep.include({ act: 'born', val: box, parent: vault })
      const { bankDB: other, tombstone, reborn } = await withBoxTombstone()
      expect(await other.putBox(boxPutAskOf(reborn, tombstone, { ifAbsent: 'add', ifPresent }))).to.deep.include({ act: 'reborn', val: reborn })
    })

    it.each(anyIfPresent)("refuses over a void box row a put that expects a row, under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { bankDB, vault } = await putWith()
      const ask = boxPutAskOf(boxAt(8), boxAt(7), { ifAbsent: 'add', ifPresent })
      expect(await bankDB.tryPutBox(ask)).to.deep.include({ ok: false, act: 'ahead', dbhas: null, parent: vault })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
    })

    it("refuses a put that lacks a policy, or has a get's nil", async () => {
      const { bankDB, vault } = await putWith()
      const policyless = await bankDB.tryPutBox(omitting(boxPutAskOf(box), 'ifAbsent'))
      expect(policyless).to.deep.include({ ok: false })
      expect(policyless.err?.meta?.fieldnames).to.deep.equal(['ifAbsent'])
      expect(await bankDB.tryPutBox({ ...boxPutAskOf(box), ifAbsent: 'nil' } as never)).to.deep.include({ ok: false })
      const nilPut = { ...vaultPutAskOf(nextVault, vault), ifAbsent: 'nil' }
      expect(await bankDB.tryPutVault(nilPut as never)).to.deep.include({ ok: false })
      expect(await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')).to.have.property('size', 0)
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
    })

    it.each(anyIfPresent)("refuses a put over a void vault row and over a tombstone, with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { bankDB, bank } = await putWith({ vault: false })
      const voidAsk = vaultPutAskOf(vaultAt(), null, { ifAbsent: 'fail', ifPresent })
      expect(await bankDB.tryPutVault(voidAsk)).to.deep.include({ ok: false, act: 'void', dbhas: null, parent: bank })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
      const vault = vaultAt()
      await bankDB.putVault(vaultPutAskOf(vault))
      const tombstone = vaultTombstoneOf(vault)
      await bankDB.delVault(vaultDelAskOf(vault))
      const goneAsk = vaultPutAskOf(vaultAt(2, 'bank1', 'life2'), tombstone, { ifAbsent: 'fail', ifPresent })
      expect(await bankDB.tryPutVault(goneAsk)).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, parent: bank })
    })

    it("over a live vault row, ifAbsent changes nothing: fail refuses and get passes", async () => {
      const { bankDB, vault } = await putWith()
      expect(await bankDB.tryPutVault(vaultPutAskOf(nextVault, vault, { ifAbsent: 'fail', ifPresent: 'fail' }))).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await bankDB.putVault(vaultPutAskOf(nextVault, vault, { ifAbsent: 'fail', ifPresent: 'get' }))).to.deep.include({ act: 'passed', val: vault })
    })

    it.each(['repl', 'fail'] as const)("refuses 'stale_write' over a live vault row for a put that expects none, with ifPresent %s", async (ifPresent) => {
      const { bankDB, bank, vault } = await putWith()
      const answer = await bankDB.tryPutVault(vaultPutAskOf(vaultAt(0, 'bank1', 'life2', Rival), null, { ifPresent }))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: vault, parent: bank })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })
  })

  describe("gate verbs", () => {
    it("replacePassphrase replaces the main wayin, keeping gate_tok and bank_tok, and leaves the bank row", async () => {
      const { bankDB, bank, gate } = await putWith()
      const ask = gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin })
      const { act, val, parent } = await bankDB.replacePassphrase(ask)
      expect(act).to.eq('replaced')
      expect(parent).to.deep.equal(bank)
      expect(val).to.deep.equal(ask.record)
      expect(val).to.deep.include({ ...gateScope, bank_tok: gate.bank_tok, gate_tok: gate.gate_tok, registered_at: Now, revision_seq: 1, written_at: Now + 1, wayins: { main: otherMainWayin } })
      expect(val.revision_tok).to.not.eq(gate.revision_tok)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(val)
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
    })

    it("addPasskey adds over no passkey, and returns act 'camped' over one stored, with the stored row", async () => {
      const { bankDB, bank, gate } = await putWith()
      const { act, val } = await bankDB.addPasskey(gatePutAskOf('addPasskey', gate, WithPasskey))
      expect(act).to.eq('replaced')
      expect(val).to.deep.include({ gate_tok: gate.gate_tok, bank_tok: gate.bank_tok, wayins: WithPasskey })
      const again = await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', val, { main: mainWayin, passkey0: { ...passkey0Wayin, credential_id: `${passkey0Wayin.credential_id}2` } }))
      expect(again).to.deep.include({ ok: false, act: 'camped', dbhas: val, parent: bank })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(val)
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
    })

    it("revokePasskey removes a stored passkey, and with none stored returns act 'passed' and the row as stored", async () => {
      const { bankDB, bank, gate } = await putWith()
      const { val: withPasskey } = await bankDB.addPasskey(gatePutAskOf('addPasskey', gate, WithPasskey))
      const { act, val } = await bankDB.revokePasskey(gatePutAskOf('revokePasskey', withPasskey, MainOnly))
      expect(act).to.eq('replaced')
      expect(val).to.deep.include({ gate_tok: gate.gate_tok, bank_tok: gate.bank_tok, revision_seq: 2, wayins: MainOnly })
      expect(await bankDB.revokePasskey(gatePutAskOf('revokePasskey', val, MainOnly))).to.deep.include({ ok: true, act: 'passed', val, parent: bank })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(val)
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
    })

    it("a gate verb refuses a record over the stored revision_tok under another gate_tok, leaving the row", async () => {
      const { bankDB, bank, gate } = await putWith()
      const otherLife = { ...gate, gate_tok: 'gate2' }
      const answers = [
        await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', otherLife, { main: otherMainWayin })),
        await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', otherLife, WithPasskey)),
        await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', otherLife, MainOnly)),
      ]
      for (const answer of answers) { expect(answer).to.deep.include({ ok: false, act: 'clash', dbhas: gate, parent: bank }) }
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("a gate verb refuses 'stale_write' when the gate row has moved past its revision", async () => {
      const { bankDB, bank, gate } = await putWith()
      const { val: moved } = await bankDB.addPasskey(gatePutAskOf('addPasskey', gate, WithPasskey))
      const answers = [
        await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', gate, WithPasskey)),
        await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', gate, MainOnly)),
        await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin })),
      ]
      for (const answer of answers) {
        expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: moved, parent: bank })
        expect(answer.err?.refusalkind).to.eq('stale_write')
      }
    })

    it("refuses a record whose registered_at is not the stored one, under replacePassphrase and revokePasskey", async () => {
      const { bankDB, gate } = await putWith()
      const { val: withPasskey } = await bankDB.addPasskey(gatePutAskOf('addPasskey', gate, WithPasskey))
      const unregistered = { ...withPasskey, registered_at: Now + 5 }
      const answers = [
        await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', unregistered, { ...WithPasskey, main: otherMainWayin })),
        await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', unregistered, MainOnly)),
      ]
      for (const answer of answers) { expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' }) }
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(withPasskey)
    })

    // A bankDB over a shared store may empty it for each bankDB made, so each case makes one.
    it("refuses an addPasskey whose registered_at is not the stored one", async () => {
      const { bankDB, gate } = await putWith()
      expect(await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', { ...gate, registered_at: Now + 5 }, WithPasskey))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("refuses a gate verb that changes the wayin it should leave alone", async () => {
      const { bankDB, gate } = await putWith()
      expect(await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin, passkey0: passkey0Wayin }))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', gate, { main: otherMainWayin, passkey0: passkey0Wayin }))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
      const { val: withPasskey } = await bankDB.addPasskey(gatePutAskOf('addPasskey', gate, WithPasskey))
      expect(await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', withPasskey, { main: otherMainWayin }))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', withPasskey, { main: otherMainWayin }))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(withPasskey)
    })

    it("refuses a record whose revision_seq is not next after its prior, or that changes gate_tok or bank_tok", async () => {
      const { bankDB, gate } = await putWith()
      const ask = gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin })
      const unfit = [
        { ...ask, record: { ...ask.record, revision_seq: 2 } },
        { ...ask, record: { ...ask.record, gate_tok: 'gate2' } },
        { ...ask, record: { ...ask.record, bank_tok: 'bank2' } },
      ]
      for (const unfitAsk of unfit) { expect(await bankDB.tryReplacePassphrase(unfitAsk)).to.deep.include({ ok: false, act: 'unclassified_storing' }) }
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("refuses addPasskey a record with no passkey, and revokePasskey one with a passkey", async () => {
      const { bankDB, gate } = await putWith()
      expect(await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', gate, MainOnly))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', gate, WithPasskey))).to.deep.include({ ok: false, act: 'unclassified_storing' })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })

    it("writes the record it was given, minting no revision of its own", async () => {
      const { bankDB, gate } = await putWith()
      const ask = gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin })
      expect(await bankDB.replacePassphrase(ask)).to.deep.include({ act: 'replaced', val: ask.record })
      const stored = await bankDB.ensureBank(bankEnsureAsk)
      expect(stored.val?.gates).to.deep.equal({ main: ask.record })
    })

    it("carries no wayin in what its answer carries of its ask", async () => {
      const { bankDB, gate } = await putWith()
      const { ask } = await bankDB.replacePassphrase(gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin }))
      expect(ask).to.deep.include({ op: 'put', gateVerb: 'replacePassphrase' })
      expect(JSON.stringify(ask)).to.not.include('wayin')
      expect(JSON.stringify(ask)).to.not.include(otherMainWayin.salt_b64)
    })
  })

  describe("the bank and gate rows under the vault and box verbs", () => {
    it("are left as they were by every put and del of a vault and its boxes", async () => {
      const { bankDB, bank, gate, vault, box } = await putWith({ box: true })
      await bankDB.putBox(boxPutAskOf(nextBox, box))
      await bankDB.delBox(boxDelAskOf(nextBox))
      await bankDB.putVault(vaultPutAskOf(nextVault, vault))
      await bankDB.delVault(vaultDelAskOf(nextVault))
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(bank)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
    })
  })

  describe("the row above a gate or vault verb", () => {
    /** Each gate and vault verb, made under the bank life `bank1`, with an ask its stored rows would let through. */
    const AboveAsks = [
      ['replacePassphrase', async (bankDB: BankDB) => await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', gateAt(), { main: otherMainWayin }))],
      ['addPasskey',        async (bankDB: BankDB) => await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', gateAt(), WithPasskey))],
      ['revokePasskey',     async (bankDB: BankDB) => await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', gateAt(), MainOnly))],
      ['getVault',          async (bankDB: BankDB) => await bankDB.tryGetVault(vaultGetAskOf('bank1', 'nil'))],
      ['putVault',          async (bankDB: BankDB) => await bankDB.tryPutVault(vaultPutAskOf(vaultAt()))],
      ['delVault',          async (bankDB: BankDB) => await bankDB.tryDelVault(vaultDelAskOf(vaultAt()))],
    ] as const

    it.each(AboveAsks)("%s refuses over no bank row, with the shell bank row as parent", async (_verbname, verb) => {
      const bankDB = await fresh()
      expect(await verb(bankDB)).to.deep.include({ ok: false, act: 'bank_void', parent: BX.shellBankOf(bankScope) })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.be.null
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
    })

    it.each(AboveAsks)("%s refuses under the bank's tombstone, with the tombstone as parent", async (_verbname, verb) => {
      const { bankDB, bank } = await putWith({ vault: false })
      await bankDB.delBank(bankDelAskOf(bank))
      expect(await verb(bankDB)).to.deep.include({ ok: false, act: 'bank_gone', parent: bankTombstoneOf(bank) })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.be.null
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
    })

    it.each(AboveAsks)("%s refuses under a bank live in another life, with that bank row as parent", async (_verbname, verb) => {
      const bankDB = await fresh()
      const reborn = bankAt(0, 'bank2')
      const gate = gateAt(0, 'bank2')
      await bankDB.buildBank(bankBuildAskOf(reborn, gate))
      expect(await verb(bankDB)).to.deep.include({ ok: false, act: 'bank_reborn', parent: reborn })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.be.null
    })
  })
}
