/** The battery's flawed rows: each one planted past the verbs, and either never held by the store or refused by every verb that meets it. */

import { chai, describe, expect, it } from 'vitest'
import * as SX from '../../src/shapes/shapes-storage'
import type { Awaitable } from '../../src/helpers/helpers'
import type { VaultScope } from '../../src/shapes/shapes-core'
import type { Tidied, VaultDB } from '../../src/storage/vault-db'
import {
  bankScope, vaultScope, boxscope, vaultQuery, boxQuery, vaultScopeOf, boxscopeOf, vaultAt, boxAt, FlawedVaultRows, FlawedBoxRows,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './storage-world'
import type { FlawRefusal } from './storage-world'
import type { BatteryWorld, VaultDBRowCheats } from './vault-db-battery'

/** What a case finds in place of the verbs' answers where the store did not hold the row planted. */
const NotHeld = 'not held'

const anyIfPresent = ['repl', 'fail', 'get'] as const

const vault      = vaultAt()
const box        = boxAt()
const nextVault  = vaultAt(1)
const nextBox    = boxAt(1)
const otherBox   = boxAt(0, 'life1', { boxlabel: 'other' })
const noVaultYet = SX.shellVaultOf(vaultScope)
const noBoxYet   = SX.shellBoxOf(boxscope, 'life1')

/** Plants `row` by `plant`: true where the plant went through and `readBack` then gives `row`, false where the store did not hold it. */
async function isHeld(row: unknown, plant: () => Awaitable<void>, readBack: () => Awaitable<unknown>): Promise<boolean> {
  try {
    await plant()
  } catch {
    return false
  }
  return chai.util.eql(await readBack(), row)
}

/** The acts `calls` answer, each call made once the last has answered. */
async function actsOf(...calls: (() => Promise<{ act: string }>)[]): Promise<string[]> {
  const acts: string[] = []
  for (const call of calls) {
    const { act } = await call()
    acts.push(act)
  }
  return acts
}

/** The box row `boxlabel` under the life `vault_tok` of the vault at `scope`, as stored. */
async function boxRowOf(rows: VaultDBRowCheats, scope: VaultScope, vault_tok: string, boxlabel: string): Promise<unknown> {
  const boxrows = await rows.boxRowsOf(scope, vault_tok)
  return boxrows.get(boxlabel)
}

/** What tidyGone answers over the world's bank: the count of box rows it leaves, or the act it refuses with. */
async function tidiedOf(vaultDB: VaultDB): Promise<Tidied | string> {
  const tidied = await vaultDB.tryTidyGone(bankScope)
  return tidied.ok ? tidied.val : tidied.act
}

/** What each verb answers over the world's vault row, as `vault` and `box` would call it, and the rows they leave. */
async function vaultAnswersOver(vaultDB: VaultDB, rows: VaultDBRowCheats) {
  const got = await vaultDB.tryGetVault(vaultGetAskOf())
  const listed = await vaultDB.tryListVaults(bankScope)
  return {
    getVault:   { act: got.act, world: got.world, fieldnames: got.err?.meta?.fieldnames },
    listVaults: listed.ok ? { damaged_rows: listed.val.damaged_rows } : { act: listed.act, fieldnames: listed.err.meta?.fieldnames },
    putVault:   await actsOf(...anyIfPresent.map((ifPresent) => () => vaultDB.tryPutVault(vaultPutAskOf(nextVault, vault, { ifPresent })))),
    delVault:   await actsOf(() => vaultDB.tryDelVault(vaultDelAskOf(vault)), () => vaultDB.tryDelVault(vaultDelAskOf(noVaultYet))),
    getBox:     await actsOf(() => vaultDB.tryGetBox(boxGetAskOf()), () => vaultDB.tryGetBox(boxGetAskOf({ ...boxQuery, boxlabel: 'never_put' }))),
    listBoxes:  await actsOf(() => vaultDB.tryListBoxes(vaultQuery)),
    putBox:     await actsOf(() => vaultDB.tryPutBox(boxPutAskOf(nextBox, box)), () => vaultDB.tryPutBox(boxPutAskOf(otherBox))),
    delBox:     await actsOf(() => vaultDB.tryDelBox(boxDelAskOf(box))),
    tidyGone:   await tidiedOf(vaultDB),
    vaultRow:   await rows.vaultRowOf(vaultScope),
    boxRows:    [...await rows.boxRowsOf(vaultScope, 'life1')],
  }
}

/** What {@link vaultAnswersOver} must find over the vault row `row`: each verb refused, and the rows left as they were. */
function vaultRefusalsOf(row: unknown, refusal: FlawRefusal, fieldnames: readonly string[] | undefined) {
  const isDamaged = (refusal === 'damaged')
  const rowAct = isDamaged ? 'damaged_row' : 'storage_issue'
  const vaultAct = isDamaged ? 'damaged_vault' : 'storage_issue'
  return {
    getVault:   { act: rowAct, world: null, fieldnames },
    listVaults: isDamaged ? { damaged_rows: [{ ...vaultScope, am: 'd' }] } : { act: 'storage_issue', fieldnames },
    putVault:   [rowAct, rowAct, rowAct],
    delVault:   [rowAct, rowAct],
    getBox:     [vaultAct, vaultAct],
    listBoxes:  [vaultAct],
    putBox:     [vaultAct, vaultAct],
    delBox:     [vaultAct],
    tidyGone:   { totalCount: 1 },
    vaultRow:   row,
    boxRows:    [['openai', box]],
  }
}

/** What each verb answers over the world's box row, as `box` would call it, and the row they leave. */
async function boxAnswersOver(vaultDB: VaultDB, rows: VaultDBRowCheats) {
  const got = await vaultDB.tryGetBox(boxGetAskOf())
  const listed = await vaultDB.tryListBoxes(vaultQuery)
  return {
    getBox:    { act: got.act, fieldnames: got.err?.meta?.fieldnames },
    listBoxes: listed.ok ? { damaged_rows: listed.val.damaged_rows } : { act: listed.act, fieldnames: listed.err.meta?.fieldnames },
    putBox:    await actsOf(...anyIfPresent.map((ifPresent) => () => vaultDB.tryPutBox(boxPutAskOf(nextBox, box, { ifPresent })))),
    delBox:    await actsOf(() => vaultDB.tryDelBox(boxDelAskOf(box)), () => vaultDB.tryDelBox(boxDelAskOf(noBoxYet))),
    boxRow:    await boxRowOf(rows, vaultScope, 'life1', 'openai'),
  }
}

/** What {@link boxAnswersOver} must find over the box row `row`: each verb refused, and the row left as it was. */
function boxRefusalsOf(row: unknown, refusal: FlawRefusal, fieldnames: readonly string[] | undefined) {
  const isDamaged = (refusal === 'damaged')
  const rowAct = isDamaged ? 'damaged_row' : 'storage_issue'
  return {
    getBox:    { act: rowAct, fieldnames },
    listBoxes: isDamaged ? { damaged_rows: [{ ...boxscope, vault_tok: 'life1', am: 'd' }] } : { act: 'storage_issue', fieldnames },
    putBox:    [rowAct, rowAct, rowAct],
    delBox:    [rowAct, rowAct],
    boxRow:    row,
  }
}

/** Registers the flawed rows' cases over `world`. */
export function describeFlaws({ putWith, rowsOf }: BatteryWorld): void {
  describe("a row planted past the verbs", () => {
    it("is held where it is sound, a vault row and a box row alike", async () => {
      const { vaultDB } = await putWith({ box: true })
      const rows = rowsOf(vaultDB)
      const vaultRow = vaultAt(3)
      const boxRow = boxAt(3)
      const held = [
        await isHeld(vaultRow, () => rows.plantVaultRow(vaultScope, vaultRow), () => rows.vaultRowOf(vaultScope)),
        await isHeld(boxRow, () => rows.plantBoxRow(boxscope, 'life1', boxRow), () => boxRowOf(rows, vaultScope, 'life1', 'openai')),
      ]
      expect(held).to.deep.equal([true, true])
    })
  })

  describe("a flawed vault row out of storage", () => {
    for (const [row, refusal, fieldnames, blurb] of FlawedVaultRows) {
      it(`is refused by every verb, ${blurb}, where its store holds it`, async () => {
        const { vaultDB } = await putWith({ box: true })
        const rows = rowsOf(vaultDB)
        const held = await isHeld(row, () => rows.plantVaultRow(vaultScope, row), () => rows.vaultRowOf(vaultScope))
        const answers = held ? await vaultAnswersOver(vaultDB, rows) : NotHeld
        expect(answers).to.deep.equal(held ? vaultRefusalsOf(row, refusal, fieldnames) : NotHeld)
      })
    }

    it("fails the whole of listVaults where it is a null its store holds", async () => {
      const { vaultDB } = await putWith()
      const rows = rowsOf(vaultDB)
      const rubble = vaultScopeOf('rubble')
      const held = await isHeld(null, () => rows.plantVaultRow(rubble, null), () => rows.vaultRowOf(rubble))
      const acts = held ? await actsOf(() => vaultDB.tryListVaults(bankScope)) : NotHeld
      expect(acts).to.deep.equal(held ? ['storage_issue'] : NotHeld)
    })
  })

  describe("a flawed box row out of storage", () => {
    for (const [row, refusal, fieldnames, blurb] of FlawedBoxRows) {
      it(`is refused by every verb, ${blurb}, where its store holds it`, async () => {
        const { vaultDB } = await putWith({ box: true })
        const rows = rowsOf(vaultDB)
        const held = await isHeld(row, () => rows.plantBoxRow(boxscope, 'life1', row), () => boxRowOf(rows, vaultScope, 'life1', 'openai'))
        const answers = held ? await boxAnswersOver(vaultDB, rows) : NotHeld
        expect(answers).to.deep.equal(held ? boxRefusalsOf(row, refusal, fieldnames) : NotHeld)
      })
    }

    it("fails the whole of listBoxes where it is a null its store holds", async () => {
      const { vaultDB } = await putWith({ box: true })
      const rows = rowsOf(vaultDB)
      const held = await isHeld(null, () => rows.plantBoxRow(boxscopeOf('rubble'), 'life1', null), () => boxRowOf(rows, vaultScope, 'life1', 'rubble'))
      const acts = held ? await actsOf(() => vaultDB.tryListBoxes(vaultQuery)) : NotHeld
      expect(acts).to.deep.equal(held ? ['storage_issue'] : NotHeld)
    })

    it("is removed by tidyGone under no vault row, where its store holds it", async () => {
      const { vaultDB } = await putWith({ box: true })
      const rows = rowsOf(vaultDB)
      const never = vaultScopeOf('never')
      const held = await isHeld('whatever', () => rows.plantBoxRow({ ...boxscope, vaultlabel: 'never' }, 'lost', 'whatever'), () => boxRowOf(rows, never, 'lost', 'openai'))
      const tidied = held ? {
        tidyGone: await tidiedOf(vaultDB),
        lost:     [...await rows.boxRowsOf(never, 'lost')],
        kept:     [...await rows.boxRowsOf(vaultScope, 'life1')],
      } : NotHeld
      expect(tidied).to.deep.equal(held ? { tidyGone: { totalCount: 1 }, lost: [], kept: [['openai', box]] } : NotHeld)
    })
  })
}
