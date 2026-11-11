/** BirthBoxSql and ReviseBoxSql on PGlite: a box's first record stored over no row, and its next record over the row a caller expects. Each answers what it found, and stores nothing where a test fails. */

import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import type { BoxRecord, BoxRow, BoxTombstone } from 'safebyok/storage'
import { BirthBoxSql, ReviseBoxSql } from '../src/vault-queries'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

const Add = { op: 'put', ifAbsent: 'add', ifPresent: 'fail' } as const

/** The one row either statement answers. */
type BoxWriteAnswer = { ok: boolean, act: string | null, world: unknown, box: unknown, presence: string, boxcount: number, told: number }

async function writeBox(text: string, record: BoxRow, rest: unknown[]): Promise<BoxWriteAnswer> {
  const db = await TH.database()
  const { applabel, user_id, vaultlabel, vault_tok, boxlabel } = record
  const [maxBoxes, ...cited] = rest
  const params = [applabel, user_id, vaultlabel, vault_tok, boxlabel, JSON.stringify(record), maxBoxes, 'safebyok_unheard', 'a notice', ...cited]
  const { rows } = await db.query<BoxWriteAnswer>(text, params)
  expect(rows).to.have.length(1)
  return rows[0]!
}

/** Run BirthBoxSql for `record`. */
async function birthBox(record: BoxRecord, maxBoxes = 100): Promise<BoxWriteAnswer> {
  return await writeBox(BirthBoxSql, record, [maxBoxes])
}

/** Run ReviseBoxSql for `record`, over the row the caller expects to find stored. */
async function reviseBox(record: BoxRow, expected: BoxRow, maxBoxes = 100): Promise<BoxWriteAnswer> {
  return await writeBox(ReviseBoxSql, record, [maxBoxes, expected.revision_tok, expected.am])
}

async function storedBox(): Promise<unknown> {
  const boxrows = await TH.rowsOf().boxRowsOf(TH.vaultScope, 'life1')
  return boxrows.get(TH.boxscope.boxlabel) ?? null
}

async function vaultDBWithVault() {
  const vaultDB = await TH.makeVaultDB()
  await vaultDB.putVault({ ...Add, expected: DB.sentinelVaultOf(TH.vaultScope), record: TH.vaultAt(0) })
  return vaultDB
}

/** A vaultDB whose box is a tombstone, and that tombstone. */
async function vaultDBWithBoxGone(): Promise<{ vaultDB: Awaited<ReturnType<typeof vaultDBWithVault>>, tombstone: BoxTombstone }> {
  const vaultDB = await vaultDBWithVault()
  await birthBox(TH.boxAt(0))
  const tombstone = TH.boxTombstoneOf(TH.boxAt(0))
  await reviseBox(tombstone, TH.boxAt(0))
  return { vaultDB, tombstone }
}

describe('BirthBoxSql', () => {
  it('stores a record over no box row, and answers the vault row, the box stored and the count taken before the write', async () => {
    await vaultDBWithVault()
    expect(await birthBox(TH.boxAt(0))).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: TH.boxAt(0), boxcount: 0, act: 'born', presence: 'void', told: 1 })
    expect(await storedBox()).to.deep.equal(TH.boxAt(0))
  })

  it('stores nothing over a live box or a box tombstone, and answers the row stored', async () => {
    const { tombstone } = await vaultDBWithBoxGone()
    expect(await birthBox(TH.boxAt(0, 'life1', { box_tok: 'box2' }))).to.deep.equal({ ok: false, world: TH.vaultAt(0), box: tombstone, boxcount: 0, act: null, presence: 'gone', told: 0 })
    expect(await storedBox()).to.deep.equal(tombstone)

    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    expect(await birthBox(TH.boxAt(0, 'life1', { revision_tok: 'rival' }))).to.deep.include({ ok: false, box: TH.boxAt(0), boxcount: 1 })
    expect(await storedBox()).to.deep.equal(TH.boxAt(0))
  })

  it('stores nothing where the record is not at revision_seq 0, or is a tombstone', async () => {
    await vaultDBWithVault()
    expect(await birthBox(TH.boxAt(1))).to.deep.include({ ok: false, box: null })
    const tombstone = { ...TH.boxTombstoneOf(TH.boxAt(0)), revision_seq: 0 }
    expect(await writeBox(BirthBoxSql, tombstone, [100])).to.deep.include({ ok: false, box: null })
    expect(await storedBox()).to.be.null
  })

  it('stores nothing where the vault is not stored, is deleted, or is in another life, and answers the vault row it found', async () => {
    await TH.makeVaultDB()
    expect(await birthBox(TH.boxAt(0))).to.deep.equal({ ok: false, world: null, box: null, boxcount: 0, act: null, presence: 'void', told: 0 })

    const vaultDB = await vaultDBWithVault()
    expect(await birthBox(TH.boxAt(0, 'life2'))).to.deep.include({ ok: false, world: TH.vaultAt(0) })
    const tombstone = TH.vaultTombstoneOf(TH.vaultAt(0))
    await vaultDB.delVault({ op: 'del', expected: TH.vaultAt(0), record: tombstone })
    expect(await birthBox(TH.boxAt(0))).to.deep.include({ ok: false, world: tombstone })
    expect(await storedBox()).to.be.null
  })

  it('stores nothing in a vault at its cap of live boxes', async () => {
    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    const second = TH.boxAt(0, 'life1', TH.boxscopeOf('anthropic'))
    expect(await birthBox(second, 1)).to.deep.include({ ok: false, box: null, boxcount: 1 })
    expect(await birthBox(second, 2)).to.deep.include({ ok: true, box: second, boxcount: 1 })
  })
})

describe('ReviseBoxSql', () => {
  it('stores a live record over a live box, a tombstone over a live box, and a live record over a tombstone, each at the expected revision', async () => {
    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    expect(await reviseBox(TH.boxAt(1), TH.boxAt(0))).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: TH.boxAt(1), boxcount: 1, act: 'replaced', presence: 'live', told: 1 })

    const tombstone = TH.boxTombstoneOf(TH.boxAt(1))
    expect(await reviseBox(tombstone, TH.boxAt(1))).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: tombstone, boxcount: 1, act: 'deleted', presence: 'live', told: 1 })
    expect(await storedBox()).to.deep.equal(tombstone)

    const reborn = TH.boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' })
    expect(await reviseBox(reborn, tombstone)).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: reborn, boxcount: 0, act: 'reborn', presence: 'gone', told: 1 })
    expect(await storedBox()).to.deep.equal(reborn)
  })

  it('stores nothing where the stored row is not the revision expected, and answers the row stored', async () => {
    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    await reviseBox(TH.boxAt(1), TH.boxAt(0))
    expect(await reviseBox(TH.boxAt(1, 'life1', { revision_tok: 'rival' }), TH.boxAt(0))).to.deep.equal({ ok: false, world: TH.vaultAt(0), box: TH.boxAt(1), boxcount: 1, act: null, presence: 'live', told: 0 })
    expect(await reviseBox(TH.boxAt(3), TH.boxAt(1))).to.deep.include({ ok: false, box: TH.boxAt(1) })
    expect(await storedBox()).to.deep.equal(TH.boxAt(1))
  })

  it('stores nothing where the stored row is live and a tombstone was expected, or the other way round', async () => {
    const { tombstone } = await vaultDBWithBoxGone()
    const reborn = TH.boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' })
    expect(await reviseBox(reborn, { ...tombstone, am: 'a' } as unknown as BoxRow)).to.deep.include({ ok: false, box: tombstone })
    await reviseBox(reborn, tombstone)
    expect(await reviseBox(TH.boxAt(reborn.revision_seq + 1, 'life1', { box_tok: 'box2' }), { ...reborn, am: 'x' } as unknown as BoxRow)).to.deep.include({ ok: false, box: reborn })
  })

  it('never stores a tombstone over a tombstone', async () => {
    const { tombstone } = await vaultDBWithBoxGone()
    const again = { ...tombstone, revision_tok: 'again', revision_seq: tombstone.revision_seq + 1 }
    expect(await reviseBox(again, tombstone)).to.deep.include({ ok: false, box: tombstone })
    expect(await storedBox()).to.deep.equal(tombstone)
  })

  it('stores nothing over no box row', async () => {
    await vaultDBWithVault()
    expect(await reviseBox(TH.boxAt(1), TH.boxAt(0))).to.deep.equal({ ok: false, world: TH.vaultAt(0), box: null, boxcount: 0, act: null, presence: 'void', told: 0 })
    expect(await storedBox()).to.be.null
  })

  it('holds a live record over a tombstone to the cap, and no other write', async () => {
    const { tombstone } = await vaultDBWithBoxGone()
    await birthBox(TH.boxAt(0, 'life1', TH.boxscopeOf('anthropic')))
    const reborn = TH.boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' })
    expect(await reviseBox(reborn, tombstone, 1)).to.deep.include({ ok: false, box: tombstone, boxcount: 1 })
    expect(await reviseBox(reborn, tombstone, 2)).to.deep.include({ ok: true, boxcount: 1 })
    expect(await reviseBox(TH.boxAt(reborn.revision_seq + 1, 'life1', { box_tok: 'box2' }), reborn, 1)).to.deep.include({ ok: true, boxcount: 2 })
  })

  it('stores nothing where the vault is deleted, and answers its tombstone', async () => {
    const vaultDB = await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    const vaultTombstone = TH.vaultTombstoneOf(TH.vaultAt(0))
    await vaultDB.delVault({ op: 'del', expected: TH.vaultAt(0), record: vaultTombstone })
    const swept = await storedBox()
    expect(await reviseBox(TH.boxAt(1), TH.boxAt(0))).to.deep.include({ ok: false, world: vaultTombstone, box: swept })
  })
})
