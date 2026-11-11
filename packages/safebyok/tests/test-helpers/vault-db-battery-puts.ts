/** The battery's puts and gate verbs: what each does to the rows, and what each refuses by the row it finds. */

import { describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import type { VaultDB } from '../../src/storage/vault-db'
import { omitting } from './refusals'
import {
  vaultScope, boxscope, Now, passphraseWayin, passkeyWayin, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, gateMoveOf,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './storage-world'
import type { BatteryWorld } from './vault-db-battery'

const anyIfPresent = ['repl', 'fail', 'get'] as const
const anyIfAbsent  = ['add', 'fail'] as const

/** A revision_tok no other record here has: what another device's write at the same seq would bring. */
const Rival = { revision_tok: 'rival' }

/** A first record another device would put at the box's address, in a life of its own. */
const rivalBirth = boxAt(0, 'life1', { ...Rival, box_tok: 'box2' })

/** The policies of a gate verb's put. */
const AsGateVerb = { ifAbsent: 'fail', ifPresent: 'repl' } as const

const box = boxAt()
const boxTombstone = boxTombstoneOf(box)
const noBoxYet = SX.shellBoxOf(boxscope, 'life1')
const noVaultYet = SX.shellVaultOf(vaultScope)

/** The records that replace the world's vault and box, one revision on. */
const nextVault = vaultAt(1)
const nextBox   = boxAt(1)

/** Puts and dels of the box that the row expected and the record cannot both be true of, each over the live box at seq 0 unless it says otherwise. */
const UnstorableBoxAsks = [
  // the record against the address of its ask:
  [{ ...boxPutAskOf(nextBox, box), boxlabel: "other" },                              'a put whose record is at another boxlabel than its ask'],
  [{ ...boxPutAskOf(nextBox, box), vault_tok: "life2" },                             'a put whose record is of another vault_tok than its ask'],
  [{ ...boxDelAskOf(box), user_id: "u2" },                                           'a del whose tombstone is of another user_id than its ask'],
  // the revision of the record against the row expected:
  [boxPutAskOf(boxAt(2), box),                                                       'a put two seqs past the row it expects'],
  [boxDelAskOf(box, { ...boxTombstone, revision_seq: 0 }),                           'a del at the seq of the row it expects'],
  [boxPutAskOf(boxAt(1, "life1", { revision_tok: box.revision_tok }), box),          'a put that keeps the revision_tok of the row it expects'],
  [boxPutAskOf(boxAt(0, "life1", { revision_tok: SX.VoidRevisionTok })),             'a put that brings the revision_tok of the shell'],
  [boxPutAskOf(boxAt(6), { ...noBoxYet, revision_seq: 5 }),                          'a put expecting the revision_tok of the shell at another seq'],
  [boxPutAskOf(boxAt(0), { ...noBoxYet, ...Rival }),                                 'a put expecting the seq of the shell under another revision_tok'],
  // the life of the record against the row expected:
  [boxPutAskOf(boxAt(1, "life1", { box_tok: "box2" }), box),                         'a put over a live row under another box_tok'],
  [boxPutAskOf(boxAt(0, "life1", { box_tok: SX.VoidLifeTok })),                      'a first put that brings the box_tok of the shell'],
  [boxPutAskOf(boxAt(2, "life1", { box_tok: boxTombstone.box_tok }), boxTombstone),  'a put over a tombstone that keeps its box_tok'],
  [boxDelAskOf(box, { ...boxTombstone, box_tok: box.box_tok }),                      'a del that keeps the box_tok of the row it deletes'],
  [{ ...boxPutAskOf(nextBox, box), record: boxTombstone },                           'a put of a tombstone'],
  [{ ...boxDelAskOf(box), record: nextBox },                                         'a del of a live record'],
] as const

/** Registers the puts' and gate verbs' cases over `world`. */
export const describePuts = ({ fresh, putWith, rowsOf, hasCap, makeCapped }: BatteryWorld): void => {
  /** A box deleted, and the rebirth that would stand on its tombstone. */
  const withBoxTombstone = async () => {
    const world = await putWith({ box: true })
    const tombstone = boxTombstoneOf(world.box)
    await world.vaultDB.delBox(boxDelAskOf(world.box))
    return { ...world, tombstone, reborn: boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' }) }
  }

  /** The box row `openai` of the vault's life `life1`, as stored. */
  const storedBoxOf = async (vaultDB: VaultDB): Promise<unknown> => {
    const boxrows = await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')
    return boxrows.get('openai')
  }

  describe("putVault", () => {
    it("is born over a void row, and reborn over a tombstone at its revision", async () => {
      const vaultDB = await fresh()
      const vault = vaultAt()
      expect(await vaultDB.putVault(vaultPutAskOf(vault))).to.deep.include({ ok: true, act: 'born', val: vault, world: vault })
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const reborn = vaultAt(2, 'life2')
      expect(await vaultDB.putVault(vaultPutAskOf(reborn, tombstone))).to.deep.include({ act: 'reborn', val: reborn, world: reborn })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(reborn)
    })

    it("replaces a live row at its revision, and refuses 'stale_write' at an earlier one", async () => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.putVault(vaultPutAskOf(nextVault, vault))).to.deep.include({ act: 'replaced', val: nextVault, world: nextVault })
      const answer = await vaultDB.tryPutVault(vaultPutAskOf(vaultAt(1, 'life1', Rival), vault))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: nextVault, world: nextVault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(nextVault)
    })

    it("refuses 'stale_write' where the row stored has the revision_tok its record brings", async () => {
      const { vaultDB, vault } = await putWith()
      await vaultDB.putVault(vaultPutAskOf(nextVault, vault))
      const answer = await vaultDB.tryPutVault(vaultPutAskOf(nextVault, vault))
      expect(answer).to.deep.include({ ok: false, act: 'retcon', dbhas: nextVault, world: nextVault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("refuses a replace under another vault_tok than the row it expects, leaving the row", async () => {
      const { vaultDB, vault } = await putWith()
      const otherLife = vaultAt(1, 'life2')
      expect(await vaultDB.tryPutVault(vaultPutAskOf(otherLife, vault))).to.deep.include({ ok: false, act: 'bad_record' })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: vault })
    })

    it("refuses a put where the row expected has the stored revision_tok under another vault_tok", async () => {
      const { vaultDB, vault } = await putWith()
      const answer = await vaultDB.tryPutVault(vaultPutAskOf(vaultAt(1, 'life2'), vaultAt(0, 'life2')))
      expect(answer).to.deep.include({ ok: false, act: 'clash', dbhas: vault, world: vault })
      expect(answer.err?.refusalkind).to.eq('record_conflict')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
    })

    it("over a live row, ifPresent 'get' returns it as passed and 'fail' refuses, and neither stores", async () => {
      const { vaultDB, vault } = await putWith()
      const passed = await vaultDB.putVault(vaultPutAskOf(vaultAt(0, 'life2', Rival), null, { ifPresent: 'get' }))
      expect(passed).to.deep.include({ ok: true, act: 'passed', val: vault, world: vault })
      expect(passed.req_params).to.deep.equal({ ...vaultScope, vault_tok: 'life2', revision_tok: 'rival', revision_seq: 0, expected: SX.VoidRevision })
      const camped = await vaultDB.tryPutVault(vaultPutAskOf(nextVault, vault, { ifPresent: 'fail' }))
      expect(camped).to.deep.include({ ok: false, act: 'camped', dbhas: vault, world: vault })
      expect(camped.err?.refusalkind).to.eq('camped')
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: vault })
    })

    it("refuses a put expecting a later revision than is stored, or another at its seq", async () => {
      const { vaultDB, vault } = await putWith()
      const ahead = await vaultDB.tryPutVault(vaultPutAskOf(vaultAt(8), vaultAt(7)))
      expect(ahead).to.deep.include({ ok: false, act: 'ahead', dbhas: vault, world: vault })
      expect(ahead.err?.refusalkind).to.eq('record_conflict')
      const forked = await vaultDB.tryPutVault(vaultPutAskOf(nextVault, vaultAt(0, 'life1', Rival)))
      expect(forked).to.deep.include({ ok: false, act: 'forked', dbhas: vault, world: vault })
      expect(forked.err?.refusalkind).to.eq('record_conflict')
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
    })

    it("refuses a put that expects a row where none is stored", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryPutVault(vaultPutAskOf(vaultAt(8), vaultAt(7)))
      expect(answer).to.deep.include({ ok: false, act: 'ahead', dbhas: null, world: noVaultYet })
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.be.null
    })

    it("refuses a record whose revision_seq is not one past the expected row's, or that fails its checks", async () => {
      const vaultDB = await fresh()
      const unsequenced = vaultAt(3)
      expect(await vaultDB.tryPutVault(vaultPutAskOf(unsequenced))).to.deep.include({ ok: false, act: 'bad_record' })
      const secretish = 'hunter2'
      const answer = await vaultDB.tryPutVault(vaultPutAskOf({ ...vaultAt(), vaultlabel: `${secretish}^^bad label` }))
      expect(answer).to.deep.include({ ok: false, req_params: {} })
      expect(answer.err?.meta?.fieldnames).to.deep.equal(['vaultlabel', 'record.vaultlabel'])
      expect(JSON.stringify([answer.err?.message, answer.req_params])).to.not.include(secretish)
    })

    it("refuses a box record, a box tombstone or a vault tombstone failing its checks, naming the field and putting nothing", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const answers = [
        await vaultDB.tryPutBox(boxPutAskOf({ ...boxAt(1), whisper_ciphered: 7 } as never, box)),
        await vaultDB.tryDelBox(boxDelAskOf(box, { ...boxTombstone, am: 'a' } as never)),
        await vaultDB.tryDelVault(vaultDelAskOf(vault, { ...vaultTombstoneOf(vault), gate: vault.gate } as never)),
      ]
      for (const answer of answers) { expect(answer).to.deep.include({ ok: false, act: 'bad_record' }) }
      expect(answers.map(({ err }) => err?.meta?.fieldnames)).to.deep.equal([['record.whisper_ciphered'], ['record.am'], ['record']])
      expect(await vaultDB.getBox(boxGetAskOf())).to.deep.include({ val: box })
    })

    it("refuses a row expected that is half the shell", async () => {
      const vaultDB = await fresh()
      const halves = [vaultPutAskOf(vaultAt(6), { ...noVaultYet, revision_seq: 5 }), vaultPutAskOf(vaultAt(0), { ...noVaultYet, ...Rival })]
      for (const ask of halves) { expect(await vaultDB.tryPutVault(ask)).to.deep.include({ ok: false, act: 'bad_record' }) }
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.be.null
    })
  })

  describe("putBox", () => {
    it("returns act 'born', 'replaced' or 'reborn' according to the row it writes over", async () => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.putBox(boxPutAskOf(box))).to.deep.include({ ok: true, act: 'born', val: box, world: vault })
      expect(await vaultDB.putBox(boxPutAskOf(nextBox, box))).to.deep.include({ act: 'replaced', val: nextBox, world: vault })
      const tombstone = boxTombstoneOf(nextBox)
      await vaultDB.delBox(boxDelAskOf(nextBox))
      const reborn = boxAt(3, 'life1', { box_tok: 'box2' })
      expect(await vaultDB.putBox(boxPutAskOf(reborn, tombstone))).to.deep.include({ act: 'reborn', val: reborn, world: vault })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(reborn)
    })

    it("over a live row, ifPresent 'get' returns it as passed and 'fail' refuses", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      expect(await vaultDB.putBox(boxPutAskOf(nextBox, box, { ifPresent: 'get' }))).to.deep.include({ ok: true, act: 'passed', val: box, world: vault })
      const camped = await vaultDB.tryPutBox(boxPutAskOf(nextBox, box, { ifPresent: 'fail' }))
      expect(camped).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
      expect(camped.err?.refusalkind).to.eq('camped')
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it("refuses 'stale_write' over a row moved past the one expected, with the row and leaving it", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      await vaultDB.putBox(boxPutAskOf(nextBox, box))
      const answer = await vaultDB.tryPutBox(boxPutAskOf(boxAt(1, 'life1', Rival), box))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: nextBox, world: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
      expect(await storedBoxOf(vaultDB)).to.deep.equal(nextBox)
    })

    it("refuses 'stale_write' where the row stored has the revision_tok its record brings", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      await vaultDB.putBox(boxPutAskOf(nextBox, box))
      const answer = await vaultDB.tryPutBox(boxPutAskOf(nextBox, box))
      expect(answer).to.deep.include({ ok: false, act: 'retcon', dbhas: nextBox, world: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("refuses a put where the row expected is not the one stored and no earlier", async () => {
      const { vaultDB, vault } = await putWith({ box: true })
      const conflicts = [
        ['ahead',  boxPutAskOf(boxAt(8), boxAt(7))],
        ['forked', boxPutAskOf(nextBox, boxAt(0, 'life1', Rival))],
        ['clash',  boxPutAskOf(boxAt(1, 'life1', { box_tok: 'box2' }), boxAt(0, 'life1', { box_tok: 'box2' }))],
      ] as const
      for (const [act, ask] of conflicts) {
        const answer = await vaultDB.tryPutBox(ask)
        expect(answer).to.deep.include({ ok: false, act, dbhas: box, world: vault })
        expect(answer.err?.refusalkind).to.eq('record_conflict')
      }
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    for (const [ask, blurb] of UnstorableBoxAsks) {
      it(`refuses ${blurb}`, async () => {
        const { vaultDB } = await putWith({ box: true })
        const answer = (ask.op === 'put') ? await vaultDB.tryPutBox(ask as never) : await vaultDB.tryDelBox(ask as never)
        expect(answer).to.deep.include({ ok: false, act: 'bad_record' })
        expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
      })
    }

    it("refuses a put under no vault row, under a vault_tok that is not the live vault's, and under a vault's tombstone", async () => {
      const empty = await fresh()
      const overVoid = await empty.tryPutBox(boxPutAskOf(box))
      expect(overVoid).to.deep.include({ ok: false, act: 'vault_void', world: noVaultYet, dbhas: null })
      expect(overVoid.err?.refusalkind).to.eq('absent_vault')

      const { vaultDB, vault } = await putWith()
      const overReborn = await vaultDB.tryPutBox(boxPutAskOf(boxAt(0, 'oldlife')))
      expect(overReborn).to.deep.include({ ok: false, act: 'vault_reborn', world: vault, dbhas: null })
      expect(overReborn.err?.refusalkind).to.eq('vault_reborn')

      await vaultDB.delVault(vaultDelAskOf(vault))
      const overGone = await vaultDB.tryPutBox(boxPutAskOf(box))
      expect(overGone).to.deep.include({ ok: false, act: 'vault_gone', world: vaultTombstoneOf(vault), dbhas: null })
      expect(overGone.err?.refusalkind).to.eq('absent_vault')
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it("refuses a box over maxRecordSizeEst", async () => {
      const vaultDB = await fresh({ maxRecordSizeEst: 2000 })
      await vaultDB.putVault(vaultPutAskOf(vaultAt()))
      const heavy = boxAt(0, 'life1', { sidecar: { memo: 'x'.repeat(2000) } })
      expect(await vaultDB.tryPutBox(boxPutAskOf(heavy))).to.deep.include({ ok: false, act: 'box_too_large' })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    // A VaultDB made without a cap has none of the cases below.
    if (! hasCap) { return }

    it("refuses a new box past its VaultDB's cap, and replaces one stored", async () => {
      const vaultDB = await makeCapped(1)
      const vault = vaultAt()
      await vaultDB.putVault(vaultPutAskOf(vault))
      await vaultDB.putBox(boxPutAskOf(box))
      const full = await vaultDB.tryPutBox(boxPutAskOf(boxAt(0, 'life1', { boxlabel: 'other' })))
      expect(full).to.deep.include({ ok: false, act: 'vault_full', world: vault })
      expect(full.err?.refusalkind).to.eq('vault_full')
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
      expect(full.req_params).to.include({ boxlabel: 'other' })
      expect(await vaultDB.putBox(boxPutAskOf(nextBox, box))).to.deep.include({ act: 'replaced' })
    })

    it("stores a put over a box's own tombstone at its VaultDB's cap", async () => {
      const vaultDB = await makeCapped(1)
      await vaultDB.putVault(vaultPutAskOf(vaultAt()))
      await vaultDB.putBox(boxPutAskOf(box))
      await vaultDB.delBox(boxDelAskOf(box))
      const reborn = boxAt(boxTombstone.revision_seq + 1, 'life1', { box_tok: 'box2' })
      expect(await vaultDB.putBox(boxPutAskOf(reborn, boxTombstone))).to.deep.include({ act: 'reborn', val: reborn })
    })

    it("counts a deleted box against its VaultDB's cap", async () => {
      const vaultDB = await makeCapped(1)
      await vaultDB.putVault(vaultPutAskOf(vaultAt()))
      await vaultDB.putBox(boxPutAskOf(box))
      await vaultDB.delBox(boxDelAskOf(box))
      const full = await vaultDB.tryPutBox(boxPutAskOf(boxAt(0, 'life1', { boxlabel: 'other' })))
      expect(full).to.deep.include({ ok: false, act: 'vault_full' })
      expect(full.err?.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
    })

    it("starts a vault made anew with none of its old boxes against the cap", async () => {
      const vaultDB = await makeCapped(1)
      const vault = vaultAt()
      await vaultDB.putVault(vaultPutAskOf(vault))
      await vaultDB.putBox(boxPutAskOf(box))
      await vaultDB.delVault(vaultDelAskOf(vault))
      await vaultDB.putVault(vaultPutAskOf(vaultAt(2, 'life2'), vaultTombstoneOf(vault)))
      const newLife = boxAt(0, 'life2')
      expect(await vaultDB.putBox(boxPutAskOf(newLife))).to.deep.include({ act: 'born', val: newLife })
    })
  })

  describe("a put's answer, by the row it finds and its ifAbsent and ifPresent", () => {
    it.each(anyIfPresent)("refuses over a void box row with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault } = await putWith()
      const answer = await vaultDB.tryPutBox(boxPutAskOf(box, null, { ifAbsent: 'fail', ifPresent }))
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null, world: vault })
      expect(answer.err?.refusalkind).to.eq('absent_box')
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it.each(anyIfPresent)("refuses over a box tombstone at its revision with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault, tombstone, reborn } = await withBoxTombstone()
      const answer = await vaultDB.tryPutBox(boxPutAskOf(reborn, tombstone, { ifAbsent: 'fail', ifPresent }))
      expect(answer).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: vault })
      expect(answer.err?.refusalkind).to.eq('absent_box')
    })

    it.each(anyIfAbsent)("refuses 'stale_write' over a box tombstone later than the row expected, with ifAbsent %s", async (ifAbsent) => {
      const { vaultDB, vault, tombstone } = await withBoxTombstone()
      for (const ask of [boxPutAskOf(boxAt(1, 'life1', Rival), box, { ifAbsent }), boxPutAskOf(rivalBirth, null, { ifAbsent })]) {
        const answer = await vaultDB.tryPutBox(ask)
        expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: tombstone, world: vault })
        expect(answer.err?.refusalkind).to.eq('stale_write')
      }
      expect(await storedBoxOf(vaultDB)).to.deep.equal(tombstone)
    })

    it.each(anyIfAbsent)("refuses 'camped' over a live box at its revision with ifAbsent %s and ifPresent fail", async (ifAbsent) => {
      const { vaultDB, vault } = await putWith({ box: true })
      expect(await vaultDB.tryPutBox(boxPutAskOf(nextBox, box, { ifAbsent, ifPresent: 'fail' }))).to.deep.include({ ok: false, act: 'camped', dbhas: box, world: vault })
    })

    it.each(anyIfAbsent)("refuses 'stale_write' over a live box for a put that expects none, with ifAbsent %s and ifPresent fail", async (ifAbsent) => {
      const { vaultDB, vault } = await putWith({ box: true })
      const answer = await vaultDB.tryPutBox(boxPutAskOf(rivalBirth, null, { ifAbsent, ifPresent: 'fail' }))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: box, world: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it.each(anyIfAbsent)("returns act 'passed' with the live box under ifAbsent %s and ifPresent get, at its revision or expecting none", async (ifAbsent) => {
      const { vaultDB, vault } = await putWith({ box: true })
      expect(await vaultDB.putBox(boxPutAskOf(nextBox, box, { ifAbsent, ifPresent: 'get' }))).to.deep.include({ act: 'passed', val: box, world: vault })
      expect(await vaultDB.putBox(boxPutAskOf(rivalBirth, null, { ifAbsent, ifPresent: 'get' }))).to.deep.include({ act: 'passed', val: box, world: vault })
      expect(await storedBoxOf(vaultDB)).to.deep.equal(box)
    })

    it.each(anyIfAbsent)("replaces a live box at its revision under ifAbsent %s and ifPresent repl, and refuses a put that expects none", async (ifAbsent) => {
      const { vaultDB, vault } = await putWith({ box: true })
      expect(await vaultDB.tryPutBox(boxPutAskOf(rivalBirth, null, { ifAbsent, ifPresent: 'repl' }))).to.deep.include({ ok: false, act: 'stale', dbhas: box, world: vault })
      expect(await vaultDB.putBox(boxPutAskOf(nextBox, box, { ifAbsent, ifPresent: 'repl' }))).to.deep.include({ act: 'replaced', val: nextBox, world: vault })
    })

    it.each(anyIfPresent)("adds over a void box row or a tombstone at its revision under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.putBox(boxPutAskOf(box, null, { ifAbsent: 'add', ifPresent }))).to.deep.include({ act: 'born', val: box, world: vault })
      const { vaultDB: other, tombstone, reborn } = await withBoxTombstone()
      expect(await other.putBox(boxPutAskOf(reborn, tombstone, { ifAbsent: 'add', ifPresent }))).to.deep.include({ act: 'reborn', val: reborn })
    })

    it.each(anyIfPresent)("refuses over a void box row a put that expects a row, under ifAbsent add and ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault } = await putWith()
      const answer = await vaultDB.tryPutBox(boxPutAskOf(boxAt(8), boxAt(7), { ifAbsent: 'add', ifPresent }))
      expect(answer).to.deep.include({ ok: false, act: 'ahead', dbhas: null, world: vault })
      expect(answer.err?.refusalkind).to.eq('record_conflict')
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
    })

    it("refuses a put that lacks a policy, or has a get's nil", async () => {
      const { vaultDB, vault } = await putWith()
      const policyless = await vaultDB.tryPutBox(omitting(boxPutAskOf(box), 'ifAbsent'))
      expect(policyless).to.deep.include({ ok: false })
      expect(policyless.err?.meta?.fieldnames).to.deep.equal(['ifAbsent'])
      expect(await vaultDB.tryPutBox({ ...boxPutAskOf(box), ifAbsent: 'nil' } as never)).to.deep.include({ ok: false })
      const nilPut = { ...vaultPutAskOf(nextVault, vault), ifAbsent: 'nil' }
      expect(await vaultDB.tryPutVault(nilPut as never)).to.deep.include({ ok: false })
      expect(await rowsOf(vaultDB).boxRowsOf(vaultScope, 'life1')).to.have.property('size', 0)
      expect(await rowsOf(vaultDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
    })

    it.each(anyIfPresent)("refuses a put over a void vault row and over a tombstone, with ifAbsent fail and ifPresent %s", async (ifPresent) => {
      const empty = await fresh()
      const overVoid = await empty.tryPutVault(vaultPutAskOf(vaultAt(), null, { ifAbsent: 'fail', ifPresent }))
      expect(overVoid).to.deep.include({ ok: false, act: 'void', dbhas: null })
      expect(overVoid.err?.refusalkind).to.eq('absent_vault')
      expect(await rowsOf(empty).vaultRowOf(vaultScope)).to.be.null
      const { vaultDB, vault } = await putWith()
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const overGone = await vaultDB.tryPutVault(vaultPutAskOf(vaultAt(2, 'life2'), tombstone, { ifAbsent: 'fail', ifPresent }))
      expect(overGone).to.deep.include({ ok: false, act: 'gone', dbhas: tombstone, world: tombstone })
      expect(overGone.err?.refusalkind).to.eq('absent_vault')
    })

    it("over a live vault row, ifAbsent changes nothing: fail refuses and get passes", async () => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.tryPutVault(vaultPutAskOf(nextVault, vault, { ifAbsent: 'fail', ifPresent: 'fail' }))).to.deep.include({ ok: false, act: 'camped', dbhas: vault })
      expect(await vaultDB.putVault(vaultPutAskOf(nextVault, vault, { ifAbsent: 'fail', ifPresent: 'get' }))).to.deep.include({ act: 'passed', val: vault })
    })

    it.each(['repl', 'fail'] as const)("refuses 'stale_write' over a live vault row for a put that expects none, with ifPresent %s", async (ifPresent) => {
      const { vaultDB, vault } = await putWith()
      const answer = await vaultDB.tryPutVault(vaultPutAskOf(vaultAt(0, 'life2', Rival), null, { ifPresent }))
      expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: vault, world: vault })
      expect(answer.err?.refusalkind).to.eq('stale_write')
    })

    it("writes a gate verb over the live row, with no ifAbsent", async () => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.tryRevokePasskey(...gateMoveOf(vault, { passkey_wayin: null }))).to.deep.include({ ok: true })
    })
  })

  describe("gate verbs", () => {
    it("replacePassphrase sets the new wayin and moves gate_epoch and the revision up by one", async () => {
      const { vaultDB, vault } = await putWith()
      const wayin = { ...passphraseWayin, device_id: '00000000-0000-4000-8000-0000000000d2' }
      const { act, val, world } = await vaultDB.replacePassphrase(...gateMoveOf(vault, { passphrase_wayin: wayin }))
      expect(act).to.eq('replaced')
      expect(world).to.deep.equal(val)
      expect(val).to.deep.include({ ...vaultScope, vault_tok: 'life1', registered_at: Now, fmt: SX.VaultFormat, revision_seq: 1, written_at: Now + 1 })
      expect(val.revision_tok).to.not.eq(vault.revision_tok)
      expect(val.gate).to.deep.equal({ gate_epoch: 2, passphrase_wayin: wayin, passkey_wayin: null })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: val })
    })

    it("addPasskey adds over no passkey, and refuses over one stored, with the stored record", async () => {
      const { vaultDB, vault } = await putWith()
      const { act, val } = await vaultDB.addPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
      expect(act).to.eq('added')
      expect(val.gate).to.deep.equal({ gate_epoch: 2, passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin })
      const again = await vaultDB.tryAddPasskey(...gateMoveOf(val, { passkey_wayin: { ...passkeyWayin, device_id: '00000000-0000-4000-8000-0000000000d2' } }))
      expect(again).to.deep.include({ ok: false, act: 'camped', dbhas: val, world: val })
      expect(again.err?.refusalkind).to.eq('camped')
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: val })
    })

    it("revokePasskey removes a stored passkey, and with none stored returns act 'revoked' and changes nothing", async () => {
      const { vaultDB, vault } = await putWith()
      const { val: withPasskey } = await vaultDB.addPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
      const { act, val } = await vaultDB.revokePasskey(...gateMoveOf(withPasskey, { passkey_wayin: null }))
      expect(act).to.eq('revoked')
      expect(val.gate).to.deep.equal({ gate_epoch: 3, passphrase_wayin: passphraseWayin, passkey_wayin: null })
      expect(await vaultDB.revokePasskey(...gateMoveOf(val, { passkey_wayin: null }))).to.deep.include({ act: 'revoked', val, world: val })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: val })
    })

    it("a gate verb refuses 'stale_write' when the row has moved past its revision", async () => {
      const { vaultDB, vault } = await putWith()
      const { val: moved } = await vaultDB.addPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
      const answers = [
        await vaultDB.tryAddPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin })),
        await vaultDB.tryRevokePasskey(...gateMoveOf(vault, { passkey_wayin: null })),
        await vaultDB.tryReplacePassphrase(...gateMoveOf(vault, { passphrase_wayin: passphraseWayin })),
      ]
      for (const answer of answers) {
        expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: moved, world: moved })
        expect(answer.err?.refusalkind).to.eq('stale_write')
      }
    })

    it("a put that names a gate verb is tested as the verb's own put is", async () => {
      const { vaultDB, vault } = await putWith()
      const [keyed] = gateMoveOf(vault, { passkey_wayin: passkeyWayin })
      expect(await vaultDB.putVault({ ...vaultPutAskOf(keyed, vault, AsGateVerb), gateVerb: 'addPasskey' })).to.deep.include({ act: 'replaced', val: keyed, world: keyed })
      const [again] = gateMoveOf(keyed, { passkey_wayin: passkeyWayin })
      expect(await vaultDB.tryPutVault({ ...vaultPutAskOf(again, keyed, AsGateVerb), gateVerb: 'addPasskey' })).to.deep.include({ ok: false, act: 'camped', dbhas: keyed, world: keyed })
      const [unkeyed] = gateMoveOf(keyed, { passkey_wayin: null })
      expect(await vaultDB.tryPutVault({ ...vaultPutAskOf(unkeyed, keyed, AsGateVerb), gateVerb: 'addPasskey' })).to.deep.include({ ok: false, act: 'bad_record' })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: keyed })
    })

    it("refuses a gate verb that changes the wayin it should leave alone", async () => {
      const { vaultDB, vault } = await putWith()
      const otherPassphrase = { ...passphraseWayin, device_id: '00000000-0000-4000-8000-0000000000d2' }
      expect(await vaultDB.tryReplacePassphrase(...gateMoveOf(vault, { passphrase_wayin: otherPassphrase, passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'gate_issue', world: vault })
      expect(await vaultDB.tryAddPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin, passphrase_wayin: otherPassphrase }))).to.deep.include({ ok: false, act: 'gate_issue', world: vault })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: vault })
      const { val: withPasskey } = await vaultDB.addPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
      expect(await vaultDB.tryRevokePasskey(...gateMoveOf(withPasskey, { passkey_wayin: null, passphrase_wayin: otherPassphrase }))).to.deep.include({ ok: false, act: 'gate_issue', world: withPasskey })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: withPasskey })
    })

    it("refuses a record whose registered_at is not the stored one", async () => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.tryReplacePassphrase(...gateMoveOf({ ...vault, registered_at: Now + 5 }, { passphrase_wayin: passphraseWayin }))).to.deep.include({ ok: false, act: 'gate_issue', world: vault })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: vault })
    })

    it.each([[0], [2]])("refuses a gate_epoch moved %i from the stored one", async (moved) => {
      const { vaultDB, vault } = await putWith()
      const [record, opts] = gateMoveOf(vault, { passkey_wayin: passkeyWayin })
      const unepoched = { ...record, gate: { ...record.gate, gate_epoch: vault.gate.gate_epoch + moved } }
      expect(await vaultDB.tryAddPasskey(unepoched, opts)).to.deep.include({ ok: false, act: 'gate_issue', world: vault })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: vault })
    })

    it("refuses a record whose revision_seq is not next after its prior", async () => {
      const { vaultDB, vault } = await putWith()
      const [record, opts] = gateMoveOf(vault, { passphrase_wayin: passphraseWayin })
      expect(await vaultDB.tryReplacePassphrase({ ...record, revision_seq: record.revision_seq + 1 }, opts)).to.deep.include({ ok: false, act: 'bad_record' })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: vault })
    })

    it("refuses addPasskey a record with no passkey, and revokePasskey one with a passkey", async () => {
      const { vaultDB, vault } = await putWith()
      expect(await vaultDB.tryAddPasskey(...gateMoveOf(vault, { passkey_wayin: null }))).to.deep.include({ ok: false, act: 'bad_option' })
      expect(await vaultDB.tryRevokePasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))).to.deep.include({ ok: false, act: 'bad_option' })
    })

    it("writes the record it was given, minting no revision of its own", async () => {
      const { vaultDB, vault } = await putWith()
      const [record, opts] = gateMoveOf(vault, { passphrase_wayin: passphraseWayin })
      expect(await vaultDB.replacePassphrase(record, opts)).to.deep.include({ act: 'replaced', val: record, world: record })
      expect(await vaultDB.getVault(vaultGetAskOf())).to.deep.include({ world: record })
    })

    it("refuses under the vault's tombstone, and a record of another vault_tok than the row stored", async () => {
      const { vaultDB, vault } = await putWith()
      const otherLife = await vaultDB.tryReplacePassphrase(...gateMoveOf(vaultAt(0, 'oldlife'), { passphrase_wayin: passphraseWayin }))
      expect(otherLife).to.deep.include({ ok: false, act: 'clash', dbhas: vault, world: vault })
      expect(otherLife.err?.refusalkind).to.eq('record_conflict')
      const tombstone = vaultTombstoneOf(vault)
      await vaultDB.delVault(vaultDelAskOf(vault))
      const overGone = await vaultDB.tryReplacePassphrase(...gateMoveOf(vault, { passphrase_wayin: passphraseWayin }))
      expect(overGone).to.deep.include({ ok: false, act: 'stale', dbhas: tombstone, world: tombstone })
      expect(overGone.err?.refusalkind).to.eq('stale_write')
    })

    it("carries no wayin in its request's safe metadata", async () => {
      const { vaultDB, vault } = await putWith()
      const { req_params } = await vaultDB.replacePassphrase(...gateMoveOf(vault, { passphrase_wayin: passphraseWayin }))
      expect(Object.keys(req_params)).to.not.include('gate')
    })
  })
}
