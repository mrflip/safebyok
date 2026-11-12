/** PostgresVaultDB on PGlite: a get, put and del each given one ask, classified inside its transaction. */

import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

const noVaultYet = DB.shellVaultOf(TH.vaultScope)
const noBoxYet   = DB.shellBoxOf(TH.boxscope, 'life1')
const Add  = { op: 'put', ifAbsent: 'add',  ifPresent: 'fail' } as const
const Repl = { op: 'put', ifAbsent: 'fail', ifPresent: 'repl' } as const
const Get  = { op: 'get' } as const
const Del  = { op: 'del' } as const

async function vaultDBWithVault(opts = {}) {
  const vaultDB = await TH.makeVaultDB(opts)
  await vaultDB.putVault({ ...Add, ...TH.vaultScope, expected: noVaultYet, record: TH.vaultAt(0) })
  return vaultDB
}

describe("PostgresVaultDB's get, put and del, each given one ask", () => {
  it("answers born, gotlive, replaced, deleted and gotgone as a box is put, got, replaced and deleted", async () => {
    const vaultDB = await vaultDBWithVault()
    expect(await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: TH.boxAt(0) })).to.deep.include({ ok: true, act: 'born', val: TH.boxAt(0), world: TH.vaultAt(0) })
    expect(await vaultDB.getBox({ ...Get, ...TH.boxQuery, ifAbsent: 'fail', expected: noBoxYet })).to.deep.include({ act: 'gotlive', val: TH.boxAt(0) })
    expect(await vaultDB.putBox({ ...Repl, ...TH.boxQuery, expected: TH.boxAt(0), record: TH.boxAt(1) })).to.deep.include({ act: 'replaced', val: TH.boxAt(1) })
    const tombstone = TH.boxTombstoneOf(TH.boxAt(1))
    expect(await vaultDB.delBox({ ...Del, ...TH.boxQuery, expected: TH.boxAt(1), record: tombstone })).to.deep.include({ act: 'deleted', val: tombstone })
    expect(await vaultDB.getBox({ ...Get, ...TH.boxQuery, ifAbsent: 'nil', expected: noBoxYet })).to.deep.include({ act: 'gotgone', val: tombstone })
  })

  it("answers born, replaced, deleted and reborn as a vault is put, replaced, deleted and put again, and refuses stale_write over a revision it has moved on from", async () => {
    const vaultDB = await TH.makeVaultDB()
    expect(await vaultDB.putVault({ ...Add, ...TH.vaultScope, expected: noVaultYet, record: TH.vaultAt(0) })).to.deep.include({ ok: true, act: 'born', val: TH.vaultAt(0), world: TH.vaultAt(0) })
    expect(await vaultDB.putVault({ ...Repl, ...TH.vaultScope, expected: TH.vaultAt(0), record: TH.vaultAt(1) })).to.deep.include({ act: 'replaced', val: TH.vaultAt(1) })
    const rival = TH.vaultAt(1, 'life1', { revision_tok: 'rival' })
    const stale = await vaultDB.tryPutVault({ ...Repl, ...TH.vaultScope, expected: TH.vaultAt(0), record: rival })
    expect(stale).to.deep.include({ ok: false, act: 'stale', dbhas: TH.vaultAt(1) })
    expect(stale.ok ? null : stale.err.refusalkind).to.eq('stale_write')

    const tombstone = TH.vaultTombstoneOf(TH.vaultAt(1))
    expect(tombstone.vault_tok).not.to.eq('life1')
    expect(await vaultDB.delVault({ ...Del, ...TH.vaultScope, expected: TH.vaultAt(1), record: tombstone })).to.deep.include({ act: 'deleted', val: tombstone })
    const again = await vaultDB.tryDelVault({ ...Del, ...TH.vaultScope, expected: tombstone, record: { ...tombstone, revision_tok: 'again', revision_seq: tombstone.revision_seq + 1, vault_tok: 'again' } })
    expect(again).to.deep.include({ ok: false, act: 'dubdel', dbhas: tombstone })
    const reborn = TH.vaultAt(tombstone.revision_seq + 1, 'life2')
    expect(await vaultDB.putVault({ ...Add, ...TH.vaultScope, expected: tombstone, record: reborn })).to.deep.include({ act: 'reborn', val: reborn })
    expect(await vaultDB.getVault({ ...Get, ...TH.vaultScope, ifAbsent: 'fail', expected: noVaultYet })).to.deep.include({ act: 'gotlive', val: reborn })
  })

  it("refuses stale_write for a put that expects a revision the box has moved on from, with the row stored as dbhas, and writes nothing", async () => {
    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: TH.boxAt(0) })
    await vaultDB.putBox({ ...Repl, ...TH.boxQuery, expected: TH.boxAt(0), record: TH.boxAt(1) })
    const answer = await vaultDB.tryPutBox({ ...Repl, ...TH.boxQuery, expected: TH.boxAt(0), record: TH.boxAt(1, 'life1', { revision_tok: 'rival' }) })
    expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: TH.boxAt(1), world: TH.vaultAt(0) })
    expect(answer.ok ? null : answer.err.refusalkind).to.eq('stale_write')
    expect(await vaultDB.getBox({ ...Get, ...TH.boxQuery, ifAbsent: 'fail', expected: noBoxYet })).to.deep.include({ val: TH.boxAt(1) })
  })

  it("refuses a box's call for its vault: absent_vault over none or a tombstone, vault_reborn over another life, the vault row as world", async () => {
    const empty = await TH.makeVaultDB()
    const overVoid = await empty.tryGetBox({ ...Get, ...TH.boxQuery, ifAbsent: 'nil', expected: noBoxYet })
    expect(overVoid).to.deep.include({ ok: false, act: 'vault_void', world: noVaultYet })
    expect(overVoid.ok ? null : overVoid.err.refusalkind).to.eq('absent_vault')

    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: TH.boxAt(0) })
    const tombstone = TH.vaultTombstoneOf(TH.vaultAt(0))
    expect(await vaultDB.delVault({ ...Del, ...TH.vaultScope, expected: TH.vaultAt(0), record: tombstone })).to.deep.include({ act: 'deleted', val: tombstone })
    const overGone = await vaultDB.tryPutBox({ ...Repl, ...TH.boxQuery, expected: TH.boxAt(0), record: TH.boxAt(1) })
    expect(overGone).to.deep.include({ ok: false, act: 'vault_gone', world: tombstone })

    const reborn = TH.vaultAt(tombstone.revision_seq + 1, 'life2')
    expect(await vaultDB.putVault({ ...Add, ...TH.vaultScope, expected: tombstone, record: reborn })).to.deep.include({ act: 'reborn' })
    const overReborn = await vaultDB.tryGetBox({ ...Get, ...TH.boxQuery, ifAbsent: 'nil', expected: noBoxYet })
    expect(overReborn).to.deep.include({ ok: false, act: 'vault_reborn', world: reborn })
    expect(overReborn.ok ? null : overReborn.err.refusalkind).to.eq('vault_reborn')
  })

  it("refuses vault_full for a box past the cap, with the room it counted, and absent_box for a del of a tombstone", async () => {
    const vaultDB = await vaultDBWithVault({ maxBoxes: 1 })
    await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: TH.boxAt(0) })
    const second = TH.boxscopeOf('anthropic')
    const full = await vaultDB.tryPutBox({ ...Add, ...TH.boxQuery, ...second, expected: DB.shellBoxOf(second, 'life1'), record: TH.boxAt(0, 'life1', second) })
    expect(full).to.deep.include({ ok: false, act: 'vault_full', dbhas: null })
    expect(full.ok ? null : full.err.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })

    const tombstone = TH.boxTombstoneOf(TH.boxAt(0))
    await vaultDB.delBox({ ...Del, ...TH.boxQuery, expected: TH.boxAt(0), record: tombstone })
    const again = await vaultDB.tryDelBox({ ...Del, ...TH.boxQuery, expected: tombstone, record: { ...tombstone, revision_tok: 'again', revision_seq: tombstone.revision_seq + 1, box_tok: 'again' } })
    expect(again).to.deep.include({ ok: false, act: 'dubdel', dbhas: tombstone })
    expect(again.ok ? null : again.err.refusalkind).to.eq('absent_box')
  })

  it('stores nothing for a put over no row that its policy forbids, though the row it expects is marked live', async () => {
    const vaultDB = await vaultDBWithVault()
    const liveVoid = { ...noBoxYet, am: 'a', box_tok: 'box1' } as const
    expect(await vaultDB.tryPutBox({ ...Repl, ...TH.boxQuery, expected: liveVoid, record: TH.boxAt(0) })).to.deep.include({ ok: false, act: 'void', dbhas: null })
    expect(await TH.rowsOf().boxRowsOf(TH.vaultScope, 'life1')).to.have.property('size', 0)
  })

  it('refuses clash, and stores nothing, where the row expected has the stored revision_tok under another life tok', async () => {
    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: TH.boxAt(0) })
    const otherBox = { box_tok: 'box2' }
    const boxClash = await vaultDB.tryPutBox({ ...Repl, ...TH.boxQuery, expected: TH.boxAt(0, 'life1', otherBox), record: TH.boxAt(1, 'life1', otherBox) })
    expect(boxClash).to.deep.include({ ok: false, act: 'clash', dbhas: TH.boxAt(0) })

    const vaultClash = await vaultDB.tryPutVault({ ...Repl, ...TH.vaultScope, expected: TH.vaultAt(0, 'life2'), record: TH.vaultAt(1, 'life2') })
    expect(vaultClash).to.deep.include({ ok: false, act: 'clash', dbhas: TH.vaultAt(0) })
    expect(await TH.rowsOf().boxRowsOf(TH.vaultScope, 'life1')).to.have.property('size', 1)
  })

  it("tells a watch of a box put and of a vault's deletion, and deletes the box rows of the life that ended", async () => {
    const vaultDB = await vaultDBWithVault()
    const notices: Notice[] = []
    const unwatch = vaultDB.watch(TH.vaultScope, (notice) => { notices.push(notice) })
    await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: TH.boxAt(0) })
    await vaultDB.delVault({ ...Del, ...TH.vaultScope, expected: TH.vaultAt(0), record: TH.vaultTombstoneOf(TH.vaultAt(0)) })
    await expect.poll(() => notices.map(({ act }) => act)).to.deep.equal(['got', 'gone'])
    expect(notices[0]).to.deep.equal({ act: 'got', val: TH.boxAt(0), world: TH.vaultAt(0) })
    expect(await TH.rowsOf().boxRowsOf(TH.vaultScope, 'life1')).to.have.property('size', 0)
    unwatch()
  })

  it('tells a watch of a box too heavy for a notice, whose rows the watch fetches', async () => {
    const vaultDB = await vaultDBWithVault({ maxRecordSizeEst: 20_000 })
    const notices: Notice[] = []
    const unwatch = vaultDB.watch(TH.vaultScope, (notice) => { notices.push(notice) })
    const heavy = TH.boxAt(0, 'life1', { sidecar: { remark: 'x'.repeat(9000) } })
    await vaultDB.putBox({ ...Add, ...TH.boxQuery, expected: noBoxYet, record: heavy })
    await expect.poll(() => notices).to.deep.equal([{ act: 'got', val: heavy, world: TH.vaultAt(0) }])
    unwatch()
  })

  it("runs a gate verb's tests over the vault row stored: replaced, added and revoked, and stale_write, camped and gate_issue with nothing stored", async () => {
    const vaultDB = await vaultDBWithVault()
    const vault = TH.vaultAt(0)
    const otherPassphrase = { ...TH.passphraseWayin, device_id: '00000000-0000-4000-8000-0000000000d2' }

    const [rekeyed] = TH.gateMoveOf(vault, { passphrase_wayin: otherPassphrase })
    expect(await vaultDB.replacePassphrase(rekeyed, { prior: vault })).to.deep.include({ act: 'replaced', val: rekeyed })
    const stale = await vaultDB.tryAddPasskey(...TH.gateMoveOf(vault, { passkey_wayin: TH.passkeyWayin }))
    expect(stale).to.deep.include({ ok: false, dbhas: rekeyed }).and.to.have.nested.property('err.refusalkind', 'stale_write')

    const [keyed, keyedOpts] = TH.gateMoveOf(rekeyed, { passkey_wayin: TH.passkeyWayin })
    expect(await vaultDB.addPasskey(keyed, keyedOpts)).to.deep.include({ act: 'added', val: keyed })
    const camped = await vaultDB.tryAddPasskey(...TH.gateMoveOf(keyed, { passkey_wayin: TH.passkeyWayin }))
    expect(camped).to.have.nested.property('err.refusalkind', 'camped')
    const moved = await vaultDB.tryRevokePasskey(...TH.gateMoveOf(keyed, { passkey_wayin: null, passphrase_wayin: TH.passphraseWayin }))
    expect(moved).to.deep.include({ ok: false, world: keyed }).and.to.have.nested.property('err.refusalkind', 'gate_issue')

    const [unkeyed, unkeyedOpts] = TH.gateMoveOf(keyed, { passkey_wayin: null })
    expect(await vaultDB.revokePasskey(unkeyed, unkeyedOpts)).to.deep.include({ act: 'revoked', val: unkeyed })
    expect(await vaultDB.revokePasskey(...TH.gateMoveOf(unkeyed, { passkey_wayin: null }))).to.deep.include({ act: 'passed', val: unkeyed, world: unkeyed })
    expect(await vaultDB.getVault({ ...Get, ...TH.vaultScope, ifAbsent: 'fail', expected: unkeyed })).to.deep.include({ val: unkeyed })
  })
})
