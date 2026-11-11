import { describe, it, expect } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { VaultError } from '../../src/refusals/errors'
import * as SX from '../../src/shapes/shapes-storage'
import type { BoxRecord, BoxTombstone, VaultRecord, VaultTombstone } from '../../src/shapes/shapes-storage'
import { boxAt, boxQuery, boxscope, gateMoveOf, passkeyWayin, passphraseWayin, vaultAt, vaultScope } from '../test-helpers/storage-world'

const noVaultYet = SX.sentinelVaultOf(vaultScope)
const noBoxYet   = SX.sentinelBoxOf(boxscope, 'life1')
const Add  = { op: 'put', ifAbsent: 'add',  ifPresent: 'fail' } as const
const Repl = { op: 'put', ifAbsent: 'fail', ifPresent: 'repl' } as const
const Get  = { op: 'get' } as const
const Del  = { op: 'del' } as const

/** The tombstone that deletes `row`, at the next revision. */
function goneOf(row: BoxRecord | VaultRecord, revision_tok: string) {
  const sparse = ('boxlabel' in row) ? SX.boxSparse.parse(row) : SX.vaultSparse.parse(row)
  const lifeTok = ('boxlabel' in row) ? { box_tok: `${row.box_tok}x` } : { vault_tok: `${row.vault_tok}x` }
  return { ...sparse, ...lifeTok, revision_tok, revision_seq: row.revision_seq + 1, am: 'x' as const }
}

async function vaultDBWithVault(opts = {}): Promise<MemoryVaultDB> {
  const vaultDB = new MemoryVaultDB(opts)
  await vaultDB.putVault({ ...Add, ...vaultScope, expected: noVaultYet, record: vaultAt(0) })
  return vaultDB
}

describe("a vaultDB's get, put and del, each given one ask", () => {
  it("answers born, gotlive, replaced and deleted as a box is put, got, replaced and deleted", async () => {
    const vaultDB = await vaultDBWithVault()
    const born = await vaultDB.putBox({ ...Add, ...boxQuery, expected: noBoxYet, record: boxAt(0) })
    expect(born).to.deep.include({ ok: true, act: 'born', val: boxAt(0), world: vaultAt(0) })
    expect(await vaultDB.getBox({ ...Get, ...boxQuery, ifAbsent: 'fail', expected: noBoxYet })).to.deep.include({ act: 'gotlive', val: boxAt(0) })
    expect(await vaultDB.putBox({ ...Repl, ...boxQuery, expected: boxAt(0), record: boxAt(1) })).to.deep.include({ act: 'replaced', val: boxAt(1) })
    const tombstone = goneOf(boxAt(1), 'brev2') as BoxTombstone
    expect(await vaultDB.delBox({ ...Del, ...boxQuery, expected: boxAt(1), record: tombstone })).to.deep.include({ act: 'deleted', val: tombstone })
    expect(await vaultDB.getBox({ ...Get, ...boxQuery, ifAbsent: 'nil', expected: noBoxYet })).to.deep.include({ act: 'gotgone', val: tombstone })
  })

  it("takes the row a caller holds as expected, whatever else the row has", async () => {
    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...boxQuery, expected: noBoxYet, record: boxAt(0) })
    const held = { ...SX.boxSparse.parse(boxAt(0)), unrelated: 'field' }
    expect(await vaultDB.putBox({ ...Repl, ...boxQuery, expected: held, record: boxAt(1) })).to.deep.include({ act: 'replaced' })
  })

  it.each([
    ['absent_box',     'void',   () => ({ ...Get, ...boxQuery, ifAbsent: 'fail' as const, expected: noBoxYet })],
  ])("refuses %s with the act %s for a get of a box that is not stored", async (refusalkind, act, requestOf) => {
    const vaultDB = await vaultDBWithVault()
    const answer = await vaultDB.tryGetBox(requestOf())
    expect(answer).to.deep.include({ ok: false, act, world: vaultAt(0), dbhas: null })
    expect(answer.ok ? null : answer.err.refusalkind).to.eq(refusalkind)
  })

  it("refuses stale_write for a put that expects a revision the box has moved on from, with the row stored as dbhas", async () => {
    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...boxQuery, expected: noBoxYet, record: boxAt(0) })
    await vaultDB.putBox({ ...Repl, ...boxQuery, expected: boxAt(0), record: boxAt(1) })
    const answer = await vaultDB.tryPutBox({ ...Repl, ...boxQuery, expected: boxAt(0), record: boxAt(1, 'life1', { revision_tok: 'rival' }) })
    expect(answer).to.deep.include({ ok: false, act: 'stale', dbhas: boxAt(1) })
    expect(answer.ok ? null : answer.err.refusalkind).to.eq('stale_write')
  })

  it("refuses absent_box for a del of a tombstone, and camped for a put told not to replace", async () => {
    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...boxQuery, expected: noBoxYet, record: boxAt(0) })
    const camped = await vaultDB.tryPutBox({ ...Add, ...boxQuery, expected: boxAt(0), record: boxAt(1) })
    expect(camped).to.deep.include({ ok: false, act: 'camped' })
    expect(camped.ok ? null : camped.err.refusalkind).to.eq('camped')
    const tombstone = goneOf(boxAt(0), 'brev1') as BoxTombstone
    await vaultDB.delBox({ ...Del, ...boxQuery, expected: boxAt(0), record: tombstone })
    const again = await vaultDB.tryDelBox({ ...Del, ...boxQuery, expected: tombstone, record: { ...tombstone, revision_tok: 'brev2', revision_seq: 2, box_tok: 'box1xx' } })
    expect(again).to.deep.include({ ok: false, act: 'dubdel', dbhas: tombstone })
    expect(again.ok ? null : again.err.refusalkind).to.eq('absent_box')
  })

  it("refuses record_conflict for a put that expects a later revision than is stored", async () => {
    const vaultDB = await vaultDBWithVault()
    await vaultDB.putBox({ ...Add, ...boxQuery, expected: noBoxYet, record: boxAt(0) })
    const answer = await vaultDB.tryPutBox({ ...Repl, ...boxQuery, expected: boxAt(4), record: boxAt(5) })
    expect(answer).to.deep.include({ ok: false, act: 'ahead' })
    expect(answer.ok ? null : answer.err.refusalkind).to.eq('record_conflict')
  })

  it("refuses a box's call for its vault: absent_vault over none or a tombstone, vault_reborn over another life, the vault row as world", async () => {
    const empty = new MemoryVaultDB()
    const overVoid = await empty.tryGetBox({ ...Get, ...boxQuery, ifAbsent: 'nil', expected: noBoxYet })
    expect(overVoid).to.deep.include({ ok: false, act: 'vault_void', world: noVaultYet })
    expect(overVoid.ok ? null : overVoid.err.refusalkind).to.eq('absent_vault')

    const vaultDB = await vaultDBWithVault()
    const tombstone = goneOf(vaultAt(0), 'vrev1') as VaultTombstone
    await vaultDB.delVault({ ...Del, ...vaultScope, expected: vaultAt(0), record: tombstone })
    const overGone = await vaultDB.tryGetBox({ ...Get, ...boxQuery, ifAbsent: 'nil', expected: noBoxYet })
    expect(overGone).to.deep.include({ ok: false, act: 'vault_gone', world: tombstone })
    expect(overGone.ok ? null : overGone.err.refusalkind).to.eq('absent_vault')

    const reborn = vaultAt(2, 'life2')
    expect(await vaultDB.putVault({ ...Add, ...vaultScope, expected: tombstone, record: reborn })).to.deep.include({ act: 'reborn' })
    const overReborn = await vaultDB.tryGetBox({ ...Get, ...boxQuery, ifAbsent: 'nil', expected: noBoxYet })
    expect(overReborn).to.deep.include({ ok: false, act: 'vault_reborn', world: reborn })
    expect(overReborn.ok ? null : overReborn.err.refusalkind).to.eq('vault_reborn')
  })

  it("refuses absent_vault for a get of a vault that is not stored, and vault_full for a box past the cap", async () => {
    const empty = new MemoryVaultDB()
    const absent = await empty.tryGetVault({ ...Get, ...vaultScope, ifAbsent: 'fail', expected: noVaultYet })
    expect(absent).to.deep.include({ ok: false, act: 'void', world: noVaultYet })
    expect(absent.ok ? null : absent.err.refusalkind).to.eq('absent_vault')

    const vaultDB = await vaultDBWithVault({ maxBoxes: 1 })
    await vaultDB.putBox({ ...Add, ...boxQuery, expected: noBoxYet, record: boxAt(0) })
    const second = { ...boxscope, boxlabel: 'anthropic' }
    const full = await vaultDB.tryPutBox({ ...Add, ...boxQuery, ...second, expected: SX.sentinelBoxOf(second, 'life1'), record: boxAt(0, 'life1', second) })
    expect(full).to.deep.include({ ok: false, act: 'vault_full', world: vaultAt(0), dbhas: null })
    expect(full.ok ? null : full.err.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
  })

  it("refuses bad_record for a put with no policy, and throws damaged_row for a stored row that fails its checks", async () => {
    const vaultDB = await vaultDBWithVault()
    const policyless = await vaultDB.tryPutBox({ op: 'put', expected: noBoxYet, record: boxAt(0) } as never)
    expect(policyless.ok ? null : policyless.err.refusalkind).to.eq('bad_record')
    expect(() => new MemoryVaultDB({ maxBoxes: 0 })).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    vaultDB._cheat_boxRowsOf(vaultScope, 'life1').set(boxscope.boxlabel, { ...boxAt(0), smuggled: 'field' })
    const damaged = await vaultDB.tryGetBox({ ...Get, ...boxQuery, ifAbsent: 'nil', expected: noBoxYet })
    expect(damaged.ok ? null : damaged.err.refusalkind).to.eq('damaged_row')
  })

  it("runs a gate verb's tests over the vault row stored: replaced, added and revoked, and stale_write, camped and gate_issue with nothing stored", async () => {
    const vaultDB = await vaultDBWithVault()
    const vault = vaultAt(0)
    const otherPassphrase = { ...passphraseWayin, device_id: '00000000-0000-4000-8000-0000000000d2' }

    const [rekeyed] = gateMoveOf(vault, { passphrase_wayin: otherPassphrase })
    expect(await vaultDB.replacePassphrase(rekeyed, { prior: vault })).to.deep.include({ act: 'replaced', val: rekeyed })
    const stale = await vaultDB.tryAddPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin }))
    expect(stale).to.deep.include({ ok: false, dbhas: rekeyed }).and.to.have.nested.property('err.refusalkind', 'stale_write')

    const [keyed, keyedOpts] = gateMoveOf(rekeyed, { passkey_wayin: passkeyWayin })
    expect(await vaultDB.addPasskey(keyed, keyedOpts)).to.deep.include({ act: 'added', val: keyed })
    const camped = await vaultDB.tryAddPasskey(...gateMoveOf(keyed, { passkey_wayin: passkeyWayin }))
    expect(camped).to.have.nested.property('err.refusalkind', 'camped')
    const moved = await vaultDB.tryRevokePasskey(...gateMoveOf(keyed, { passkey_wayin: null, passphrase_wayin: passphraseWayin }))
    expect(moved).to.deep.include({ ok: false, world: keyed }).and.to.have.nested.property('err.refusalkind', 'gate_issue')

    const [unkeyed, unkeyedOpts] = gateMoveOf(keyed, { passkey_wayin: null })
    expect(await vaultDB.revokePasskey(unkeyed, unkeyedOpts)).to.deep.include({ act: 'revoked', val: unkeyed })
    expect(await vaultDB.revokePasskey(...gateMoveOf(unkeyed, { passkey_wayin: null }))).to.deep.include({ act: 'revoked', val: unkeyed, world: unkeyed })
    expect(await vaultDB.getVault({ ...Get, ...vaultScope, ifAbsent: 'fail', expected: unkeyed })).to.deep.include({ val: unkeyed })
  })
})
