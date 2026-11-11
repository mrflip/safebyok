import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import * as TH from '../test-helpers'

// The component's validators are converted from the core's checkers. These cases check that the
// conversion does its job: a record the core writes is accepted whole, and a malformed one is rejected.

type Backend = ReturnType<typeof TH.componentTest>

const api = TH.rootApi
const birth = { prior: DB.VoidRevision, ifAbsent: 'add', ifPresent: 'fail' } as const
const vault = TH.vaultAt()
const box = TH.boxAt()

/** List every document in the component's tables, without system fields. */
const storedRows = (backend: Backend) => backend.run(async ({ db }) => {
  const vaultDocs = await db.query('safebyok_vaults').collect()
  const boxDocs = await db.query('safebyok_boxes').collect()
  const tallyDocs = await db.query('safebyok_tallies').collect()
  return { vaults: vaultDocs.map(({ vault: row }): unknown => row), boxes: boxDocs.map(({ box: row }): unknown => row), tallies: tallyDocs.length }
})

/** Make a backend with the live vault that every box put needs. */
const withVault = async (): Promise<Backend> => {
  const backend = TH.componentTest()
  await backend.mutation(api.putVault, { record: vault, opts: birth })
  return backend
}

describe("the component's validators, against what the core writes", () => {
  it("take a vault record and its tombstone, a box record and its tombstone, whole", async () => {
    const backend = await withVault()
    await backend.mutation(api.putBox, { record: box, opts: birth })
    expect(await storedRows(backend)).to.deep.equal({ vaults: [vault], boxes: [box], tallies: 1 })
    await backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(box), opts: { prior: DB.revisionOf(box) } })
    await backend.mutation(api.delVault, { tombstone: TH.vaultTombstoneOf(vault), opts: { prior: DB.revisionOf(vault) } })
    expect(await storedRows(backend)).to.deep.equal({ vaults: [TH.vaultTombstoneOf(vault)], boxes: [TH.boxTombstoneOf(box)], tallies: 0 })
  })

  it("take a sidecar of any JSON the core admits, and put it as it came", async () => {
    const backend = await withVault()
    const sidecar = { label: 'work', tags: ['a', 'b'], nested: { count: 2, on: true, none: null } }
    const record = TH.boxAt(0, 'life1', { sidecar })
    await backend.mutation(api.putBox, { record, opts: birth })
    expect(await backend.query(api.getBox, { asked: { ...TH.boxscope, vault_tok: record.vault_tok } })).to.deep.equal({ vault, box: record })
  })
})

const { gate: _gate, ...gateless } = vault
const { whisper_ciphered: _whisperCiphered, ...whisperless } = box

const MisshapenCases = [
  [() => ({ record: gateless, opts: birth }),                                'putVault', 'a vault record missing a field'],
  [() => ({ record: { ...vault, colour: 'red' }, opts: birth }),             'putVault', 'a vault record with a field the core has not'],
  [() => ({ record: { ...vault, revision_seq: '0' }, opts: birth }),         'putVault', 'a vault record with a field of the wrong type'],
  [() => ({ record: vault, opts: { ...birth, ifPresent: 'merge' } }),        'putVault', 'options of a choice the core has not'],
  [() => ({ record: whisperless, opts: birth }),                             'putBox',   'a box record missing its whisper'],
  [() => ({ record: { ...box, colour: 'red' }, opts: birth }),               'putBox',   'a box record with a field the core has not'],
  [() => ({ record: { ...box, am: 'x' }, opts: birth }),                     'putBox',   'a box record marked as a tombstone'],
  [() => ({ record: box, opts: birth, maxBoxes: '2' }),                      'putBox',   'a cap written as text'],
] as const

describe("the component's validators, against a misshapen call", () => {
  for (const [argsOf, fnname, blurb] of MisshapenCases) {
    it(`refuse ${blurb}, putting nothing`, async () => {
      const backend = await withVault()
      const fnRef = (fnname === 'putVault') ? api.putVault : api.putBox
      await expect(backend.mutation(fnRef, argsOf() as never)).rejects.toThrow(/Validator/)
      expect(await storedRows(backend)).to.deep.equal({ vaults: [vault], boxes: [], tallies: 0 })
    })
  }
})
