/** BirthBoxSql and ReviseBoxSql on PGlite: a box's first record stored over no row, and its next record over the row a caller expects. Each answers what it found, and stores nothing where a test fails. And safebyok_tell, the notice each sends. */

import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import type { BoxRecord, BoxRow, BoxTombstone } from 'safebyok/storage'
import { vaultChannelOf } from '../src/postgres-vault-db'
import { BirthBoxSql, ReviseBoxSql } from '../src/vault-queries'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

const Add = { op: 'put', ifAbsent: 'add', ifPresent: 'fail' } as const

/** The one row either statement answers: a birth's has `boxcount` too. */
type BoxWriteAnswer = { ok: boolean, act: string | null, world: unknown, box: unknown, presence: string, boxcount?: number }

async function writeBox(text: string, record: BoxRow, expected: BoxRow, ...more: unknown[]): Promise<BoxWriteAnswer> {
  const db = await TH.database()
  const { rows } = await db.query<BoxWriteAnswer>(text, [JSON.stringify(record), JSON.stringify(expected), ...more])
  expect(rows).to.have.length(1)
  return rows[0]!
}

/** Run BirthBoxSql for `record`. */
async function birthBox(record: BoxRecord, maxBoxes = 100): Promise<BoxWriteAnswer> {
  return await writeBox(BirthBoxSql, record, DB.shellBoxOf(record, record.vault_tok), maxBoxes)
}

/** Run ReviseBoxSql for `record`, over the row the caller expects to find stored. */
async function reviseBox(record: BoxRow, expected: BoxRow): Promise<BoxWriteAnswer> {
  return await writeBox(ReviseBoxSql, record, expected, 100)
}

async function storedBox(): Promise<unknown> {
  const boxrows = await TH.rowsOf().boxRowsOf(TH.vaultScope, 'life1')
  return boxrows.get(TH.boxscope.boxlabel) ?? null
}

async function vaultDBWithVault() {
  const vaultDB = await TH.makeVaultDB()
  await vaultDB.putVault({ ...Add, ...TH.vaultScope, expected: DB.shellVaultOf(TH.vaultScope), record: TH.vaultAt(0) })
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
    expect(await birthBox(TH.boxAt(0))).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: TH.boxAt(0), boxcount: 0, act: 'born', presence: 'void' })
    expect(await storedBox()).to.deep.equal(TH.boxAt(0))
  })

  it('stores nothing over a live box or a box tombstone, and answers the row stored', async () => {
    const { tombstone } = await vaultDBWithBoxGone()
    expect(await birthBox(TH.boxAt(0, 'life1', { box_tok: 'box2' }))).to.deep.equal({ ok: false, world: TH.vaultAt(0), box: tombstone, boxcount: 1, act: null, presence: 'gone' })
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
    expect(await writeBox(BirthBoxSql, tombstone, DB.shellBoxOf(tombstone, 'life1'), 100)).to.deep.include({ ok: false, box: null })
    expect(await storedBox()).to.be.null
  })

  it('stores nothing where the vault is not stored, is deleted, or is in another life, and answers the vault row it found', async () => {
    await TH.makeVaultDB()
    expect(await birthBox(TH.boxAt(0))).to.deep.equal({ ok: false, world: null, box: null, boxcount: 0, act: null, presence: 'void' })

    const vaultDB = await vaultDBWithVault()
    expect(await birthBox(TH.boxAt(0, 'life2'))).to.deep.include({ ok: false, world: TH.vaultAt(0) })
    const tombstone = TH.vaultTombstoneOf(TH.vaultAt(0))
    await vaultDB.delVault({ op: 'del', ...TH.vaultScope, expected: TH.vaultAt(0), record: tombstone })
    expect(await birthBox(TH.boxAt(0))).to.deep.include({ ok: false, world: tombstone })
    expect(await storedBox()).to.be.null
  })

  it('stores nothing in a vault at its cap of box rows, a tombstone among them', async () => {
    await vaultDBWithBoxGone()
    const second = TH.boxAt(0, 'life1', TH.boxscopeOf('anthropic'))
    expect(await birthBox(second, 1)).to.deep.include({ ok: false, box: null, boxcount: 1 })
    expect(await birthBox(second, 2)).to.deep.include({ ok: true, box: second, boxcount: 1 })
  })
})

describe('ReviseBoxSql', () => {
  it('stores a live record over a live box, a tombstone over a live box, and a live record over a tombstone, each at the expected revision', async () => {
    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    expect(await reviseBox(TH.boxAt(1), TH.boxAt(0))).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: TH.boxAt(1), act: 'replaced', presence: 'live' })

    const tombstone = TH.boxTombstoneOf(TH.boxAt(1))
    expect(await reviseBox(tombstone, TH.boxAt(1))).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: tombstone, act: 'deleted', presence: 'live' })
    expect(await storedBox()).to.deep.equal(tombstone)

    const reborn = TH.boxAt(tombstone.revision_seq + 1, 'life1', { box_tok: 'box2' })
    expect(await reviseBox(reborn, tombstone)).to.deep.equal({ ok: true, world: TH.vaultAt(0), box: reborn, act: 'reborn', presence: 'gone' })
    expect(await storedBox()).to.deep.equal(reborn)
  })

  it('stores nothing where the stored row is not the revision expected, and answers the row stored', async () => {
    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    await reviseBox(TH.boxAt(1), TH.boxAt(0))
    expect(await reviseBox(TH.boxAt(1, 'life1', { revision_tok: 'rival' }), TH.boxAt(0))).to.deep.equal({ ok: false, world: TH.vaultAt(0), box: TH.boxAt(1), act: null, presence: 'live' })
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

  it('stores nothing where the stored row is of another box_tok than the row expected', async () => {
    await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    const otherLife = { box_tok: 'box2' }
    expect(await reviseBox(TH.boxAt(1, 'life1', otherLife), TH.boxAt(0, 'life1', otherLife))).to.deep.include({ ok: false, box: TH.boxAt(0) })
    expect(await storedBox()).to.deep.equal(TH.boxAt(0))
  })

  it('never stores a tombstone over a tombstone', async () => {
    const { tombstone } = await vaultDBWithBoxGone()
    const again = { ...tombstone, revision_tok: 'again', revision_seq: tombstone.revision_seq + 1 }
    expect(await reviseBox(again, tombstone)).to.deep.include({ ok: false, box: tombstone })
    expect(await storedBox()).to.deep.equal(tombstone)
  })

  it('stores nothing over no box row', async () => {
    await vaultDBWithVault()
    expect(await reviseBox(TH.boxAt(1), TH.boxAt(0))).to.deep.equal({ ok: false, world: TH.vaultAt(0), box: null, act: null, presence: 'void' })
    expect(await storedBox()).to.be.null
  })

  it('stores nothing where the vault is deleted, and answers its tombstone', async () => {
    const vaultDB = await vaultDBWithVault()
    await birthBox(TH.boxAt(0))
    const vaultTombstone = TH.vaultTombstoneOf(TH.vaultAt(0))
    await vaultDB.delVault({ op: 'del', ...TH.vaultScope, expected: TH.vaultAt(0), record: vaultTombstone })
    const swept = await storedBox()
    expect(await reviseBox(TH.boxAt(1), TH.boxAt(0))).to.deep.include({ ok: false, world: vaultTombstone, box: swept })
  })
})

/** The notice `safebyok_tell` sends for a vault row, or for a box row and its vault row. */
async function noticeOf(vault: object, box: object | null): Promise<unknown> {
  const texts: string[] = []
  const unlisten = await TH.listen(vaultChannelOf(TH.vaultScope.user_id), (text) => { texts.push(text) })
  const db = await TH.database()
  await db.query('SELECT safebyok_tell($1::text::jsonb, $2::text::jsonb)', [JSON.stringify(vault), (box === null) ? null : JSON.stringify(box)])
  await expect.poll(() => texts).to.have.length(1)
  await unlisten()
  return JSON.parse(texts[0]!)
}

/** A field that weighs `bytes`. */
function pad(bytes: number): { pad: string } { return { pad: 'x'.repeat(bytes) } }

describe('safebyok_tell', () => {
  it('tells of a vault row by its scope, and of a box row by its address with its vault row beside it', async () => {
    expect(await noticeOf(TH.vaultAt(0), null)).to.deep.equal({ at: TH.vaultScope, vault: TH.vaultAt(0) })
    expect(await noticeOf(TH.vaultAt(0), TH.boxAt(0))).to.deep.equal({ at: TH.boxQuery, vault: TH.vaultAt(0), box: TH.boxAt(0) })
  })

  it('sheds the vault row of a box notice too heavy for Postgres, and then the box row', async () => {
    const vault = { ...TH.vaultAt(0), ...pad(4000) }
    const box   = { ...TH.boxAt(0), ...pad(5000) }
    expect(await noticeOf(vault, box)).to.deep.equal({ at: TH.boxQuery, box })
    expect(await noticeOf(vault, { ...TH.boxAt(0), ...pad(9000) })).to.deep.equal({ at: TH.boxQuery })
  })

  it('sheds the row of a vault notice too heavy for Postgres', async () => {
    expect(await noticeOf({ ...TH.vaultAt(0), ...pad(9000) }, null)).to.deep.equal({ at: TH.vaultScope })
  })
})
