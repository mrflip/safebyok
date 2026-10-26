import { it, describe, expect, vi } from 'vitest'
import type { BoxRecord, BoxSparse } from '../../src/box'
import { isVaultError } from '../../src/errors'
import type { Outcome } from '../../src/outcome'
import type { VaultRecord, VaultDraft } from '../../src/vault-record'
import { MaxLabelChars, MaxUserIdChars } from '../../src/checks/primitives'
import { type VaultDB, type VaultDBOpts, type BoxDelExpectation, type VaultDelExpectation } from '../../src/vault-db'
import { type MakeDevices, type Turnstile, openTurnstile, raceEveryWay, makeTurnstile, type RaceOutcome, raceOutcomeOf } from './racing'
import { gateOf, vaultRecordOf, gatelessOf, ensureGated, vaultRecordIn, recordOfRead, boxesOf, scopeOf, boxOf, noBoxYet, inThisVault, thisVault, OddLabels, deleting, wayinOf, fakeCiphered } from './builders'
import { expectGood, expectingGood, expectBad, omitting } from './refusals'
import { unheard, ticks, wakeupAtNextTick } from './timing'
import { spyLogger, thrownText, leafTexts } from './logging'


// == [Contract and types]: VaultDBContract, VaultDBContractLine, VaultDBVerbs, MakeVaultDB, DescribeVaultDBOpts, MakeVaultDBDevices, others

/**
 * The numbered lines of the VaultDB contract (the core's `VAULTDB.md`), each by its number and
 * short title, as the document has them: {@link describeVaultDB} titles each of its groups by one,
 * and an adapter's own tests of a line the battery cannot reach (5.4, who may reach a vault) cite
 * it the same way. A line whose title is not here is not in the contract.
 *
 * @example describe(`postgresVaultDB, 5.5: ${TH.VaultDBContract['5.5']}`, () => { ... })
 */
export const VaultDBContract = Object.freeze({
  '1.1': 'What is stored reads back whole',
  '1.2': 'Each vault keeps to itself',
  '1.3': 'Nothing is repaired, and nothing is dropped',
  '2.1': 'A write that resolved is seen by every read after it',
  '2.2': 'Every box stored can be read by its boxlabel',
  '2.3': 'A listing is whole',
  '2.4': 'A vault is read in one step, its record and listing together',
  '2.5': 'A box is read only in the vault it lies in',
  '3.1': 'A vault record is created once',
  '3.2': 'An update of the vault record lands only over the record it read',
  '3.3': 'A box write lands only over the box it read, in the vault it was sealed for',
  '3.4': 'A deletion wins, within its vault, and says what it removed',
  '3.5': 'A vault is deleted whole, and alone, and leaves a tombstone',
  '3.6': 'A refused write wrote nothing',
  '3.7': 'Writes that do not collide all land',
  '4.1': 'An adapter declares the most boxes it holds in one vault',
  '4.2': 'A new box past the limit is refused, on a best effort',
  '4.3': 'A replacement is never refused for the count',
  '4.4': 'Under the limit, a new box lands',
  '4.5': 'Past the limit, nothing is lost',
  '4.6': "A hard limit is the backend's, or opt-in",
  '4.7': 'An adapter says how full a vault is',
  '5.1': 'Every refusal is a VaultError whose kind says what to do',
  '5.2': 'A stale write means an expectation failed, and nothing else',
  '5.3': 'A refusal quotes nothing it was handed',
  '5.4': 'Only the signed-in user reaches their vaults',
  '5.5': 'identity_revoked means the user is gone',
  '5.6': 'not_permitted refuses one call, and locks nothing',
  '5.7': 'An adapter with no notion of identity says neither',
  '6.1': 'subscribe hands back an unsubscribe, and calls when the vault may have changed',
  '6.2': 'A watch that fails calls onChange',
  '7.1': 'The most it holds in one record',
  '7.2': 'The most it holds of one vault',
  '7.3': 'The most it holds in one name',
} as const)

/** A numbered line of the VaultDB contract, such as `'3.3'`. */
export type VaultDBContractLine = keyof typeof VaultDBContract

/**
 * A VaultDB as the suite sees it: its public verbs only. Structural, so an adapter extending
 * VaultDB from the built package (`safebyok`) qualifies as readily as one extending `src/`.
 */
export type VaultDBVerbs = Pick<VaultDB,
  'maxRecordBytes' | 'maxVaultBytes' | 'maxBoxes' | 'maxNameBytes' | 'getVault' | 'ensureVault' | 'getVaultRecords' | 'ensureVaultRecords' | 'putVaultRecord' | 'getBox' | 'putBox' | 'getCapacity' | 'delBox' | 'delVault' | 'delDamagedVault' | 'subscribe'
>

/**
 * A fresh, empty adapter, made with the {@link VaultDBOpts} it is handed -- its `logger`, for the
 * battery to hear what it says -- as every adapter's factory takes them: no record in it, and none
 * shared with another call.
 */
export type MakeVaultDB = (vaultDBOpts: VaultDBOpts) => VaultDBVerbs | Promise<VaultDBVerbs>

/** What {@link describeVaultDB} takes beside its adapter. */
export type DescribeVaultDBOpts = {
  /**
   * A fresh, empty adapter that declares and holds `maxBoxes` boxes in one vault, for the
   * box limit's lines (4.2 to 4.5); without it, those are skipped. An adapter whose limit is
   * `Infinity`, or fixed and too large to fill in a test, has none to give.
   */
  makeCappedVaultDB?: ((maxBoxes: number) => VaultDBVerbs | Promise<VaultDBVerbs>) | undefined
  /**
   * A fresh, empty backend, as a way to make an adapter over it signed in as a given user, or
   * signed out for null: for line 5.4, who may reach a vault; without it, that is skipped. An
   * adapter with no notion of identity has none to give.
   */
  makeVaultDBFor?: (() => ((user_id: string | null) => VaultDBVerbs) | Promise<(user_id: string | null) => VaultDBVerbs>) | undefined
  /**
   * Whether the adapter `makeVaultDB` makes pushes: calls a subscriber after each write through
   * it, for line 6.1's push tests; without it, those are skipped. An adapter with no push (a
   * backend that cannot say when it changed, or one whose push the factory left unwired) leaves
   * it out.
   */
  pushes?: boolean | undefined
  /**
   * A fresh, empty backend, as a way to make devices over it: for the races (lines 3.1 to 3.7 and
   * 4.5) made from different devices, line 2.1 across devices, and 6.1's push from another device.
   * Each device is an adapter of its own over that backend, sharing nothing else with the others --
   * no adapter, client, connection, lock or queue -- held to `maxBoxes` where the adapter takes a
   * limit (as for `makeCappedVaultDB`), and passing `turnstile` before every round trip it makes to
   * the backend, a watch's start among them ({@link throughTurnstile}), so a race can hold it there:
   * {@link expectRoundTripsThroughTurnstile} shows that each write passes it, though not that every
   * round trip does, since only the adapter knows how many it makes. An adapter over a backend in this
   * process that answers synchronously makes no round trips, and leaves `turnstile` be.
   * Without it, the races run through one adapter, as `makeVaultDB` makes it, and the rest is skipped.
   */
  makeDevices?: MakeVaultDBDevices | undefined
}

/** What a device of {@link DescribeVaultDBOpts.makeDevices} is made with: the limit to hold it to, where the adapter takes one. */
export type VaultDBDeviceOpts = { maxBoxes?: number | undefined }

/** A fresh, empty backend, as a way to make devices over it: {@link MakeDevices} of a VaultDB, its factory taking {@link VaultDBDeviceOpts}. */
export type MakeVaultDBDevices = MakeDevices<VaultDBVerbs, VaultDBDeviceOpts>

/** The box limit {@link describeVaultDB} asks a capped adapter for. */
const CappedBoxes = 3
// --

/**
 * The behaviour every VaultDB owes, written once: the VaultDB contract (the core's `VAULTDB.md`),
 * one group of tests for each of its numbered lines that a test can reach through an adapter's
 * public verbs, each group titled by its line ({@link VaultDBContract}). Run it against an adapter
 * with a factory making a fresh, empty one per test, and -- for an adapter with a box limit a
 * test can fill -- a second making one held to a given limit, and for an adapter that serves the
 * user signed in, a third making one signed in as anyone; and for an adapter that pushes, a word
 * that it does.
 *
 * For an adapter's own tests, from `safebyok/testing`; it runs under vitest. It checks refusals
 * by `kind` rather than by class, so an adapter passes whichever copy of the package it extends.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeAdapter - A fresh, empty adapter, made with the VaultDBOpts it is handed: no record
 *   in it, and none shared with another call.
 * @param opts - Optionally, `makeCappedVaultDB`, for the box limit's lines; `makeVaultDBFor`,
 *   for who may reach a vault; and `pushes`, for subscribe's calls.
 *
 * @example
 *   describeVaultDB('localVaultDB', (vaultDBOpts) => localVaultDB({ ...vaultDBOpts, store: memoryStore() }), { pushes: true })
 * @example
 *   describeVaultDB('postgresVaultDB', makeRequest, {
 *     makeCappedVaultDB: (maxBoxes) => postgresVaultDB({ client, user_id: 'u1', maxBoxes }),
 *     makeVaultDBFor:    () => (user_id) => postgresVaultDB({ client, user_id }),
 *   })
 */
export const describeVaultDB = (adapterTitle: string, makeAdapter: MakeVaultDB, opts: DescribeVaultDBOpts = {}) => {
  // == [Setup]: makeVaultDB, lineTitle, timing, withVaultRecord, servedHolding, cappedHolding

  const { makeCappedVaultDB, makeVaultDBFor } = opts
  /** A fresh adapter, made with no VaultDBOpts: the battery's own lines hear nothing it logs. */
  const makeVaultDB = () => makeAdapter({})

  /** The title of a group of tests for one line of the contract. */
  const lineTitle = (line: VaultDBContractLine) => `${adapterTitle}, as a VaultDB, ${line}: ${VaultDBContract[line]}`

  // The box limit's lines run only over a capped adapter.
  const capped = makeCappedVaultDB !== undefined
  // And who may reach a vault, only over an adapter that knows who is signed in.
  const signsIn = makeVaultDBFor !== undefined

  // The races, the lines across devices and the push tests, each runnable on its own.
  const timing = vaultDBTimingChecks(makeAdapter, opts)
  /** Each timing check of `line`, as a test, run where its adapter can give what it needs. */
  const timingTestsOf = (line: VaultDBContractLine) => {
    for (const check of Object.values(timing)) {
      if (check.line === line) { it.runIf(check.runs)(check.title, () => expectToHold(check), TimingTestMillis) }
    }
  }

  /** A fresh adapter whose `u1` scope holds a vault record, as every box write needs. */
  const withVaultRecord = async () => {
    const vaultDB = await makeVaultDB()
    await ensureGated(vaultDB, vaultRecordOf('u1'))
    return vaultDB
  }

  /** A fresh backend whose u1 vault holds two boxes, and the way to sign in to it. */
  const servedHolding = async () => {
    if (! makeVaultDBFor) { throw new Error('describeVaultDB ran a sign-in test with no makeVaultDBFor.') }
    const vaultDBFor = await makeVaultDBFor()
    const owner = vaultDBFor('u1')
    await ensureGated(owner, vaultRecordOf('u1'))
    await storeEach(owner, ['anthropic', 'openai'])
    return { owner, vaultDBFor }
  }

  /** A fresh capped adapter, its `u1` vault made and holding a new box under each boxlabel. */
  const cappedHolding = async (boxlabels: readonly string[]) => {
    if (! makeCappedVaultDB) { throw new Error('describeVaultDB ran a box limit test with no makeCappedVaultDB.') }
    const vaultDB = await makeCappedVaultDB(CappedBoxes)
    await ensureGated(vaultDB, vaultRecordOf('u1'))
    await storeEach(vaultDB, boxlabels)
    return vaultDB
  }
  // --

  // == [Reading back and isolation]: 1.1 reads back whole, 1.2 keeps to itself

  describe(lineTitle('1.1'), () => {
    it("has no vault record until one is created, then reads it back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.be.null
      expect(await ensureGated(vaultDB, vaultRecordOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
    })

    it("has no box until one is written, then reads it back whole", async () => {
      const vaultDB = await withVaultRecord()
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("reads back a box with an empty sidecar as stored, and lists it with that sidecar", async () => {
      const vaultDB = await withVaultRecord()
      const sidecarless = boxOf('anthropic', 'one', { sidecar: {} })
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, sidecarless)
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(sidecarless)
      const [summary] = await boxesOf(vaultDB, scopeOf('u1'))
      expect(summary?.sidecar).to.deep.equal({})
    })

    it("reads a sidecar back as the JSON value written, as it is bound: accented letters, an emoji, a tab, a newline, quotes and backslashes", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one', { sidecar: LiteralSidecar }))
      const box = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)
      expect(box?.sidecar).to.deep.equal(LiteralSidecar)
      const [summary] = await boxesOf(vaultDB, scopeOf('u1'))
      expect(summary?.sidecar).to.deep.equal(LiteralSidecar)
    })

    it("refuses a record holding a field safebyok never writes, writing nothing: a draft or vault record as bad_record, a box as invalid_box", async () => {
      const vaultDB = await makeVaultDB()
      const stray = { stray_field: 'never stored' }
      await expectBad(vaultDB.ensureVault({ ...gatelessOf('u1'), ...stray }), 'bad_record')
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.be.null
      const ensured = recordOfRead(await expectingGood(vaultDB).ensureVault(gatelessOf('u1')))
      await expectBad(vaultDB.putVaultRecord({ ...vaultRecordOf('u1'), vault_tok: ensured.vault_tok, ...stray }, { vault_tok: ensured.vault_tok, gate_epoch: 0 }), 'bad_record')
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(ensured)
      const expected = { vault_tok: ensured.vault_tok, revision_tok: null }
      await expectBad(vaultDB.putBox(scopeOf('u1'), expected, { ...boxOf('anthropic', 'one'), ...stray }), 'invalid_box')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.deep.equal([])
    })

    it("hands back from a box write the record as stored, field for field the one written and the one a read then finds", async () => {
      const vaultDB = await withVaultRecord()
      const writes = [
        [boxOf('anthropic', 'one'),                                                   noBoxYet],
        [boxOf('anthropic', 'two', { sidecar: LiteralSidecar }),                      { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }],
        [boxOf('openai', 'one', { sidecar: {} }),                                     noBoxYet],
        [boxOf('mistral', 'one', { sidecar: { gone: null } }),                        noBoxYet],
        [boxOf('gemini', 'one', { sidecar: { list: ['a list', { zeta: 1, alpha: [true, 'two'] }] } }), noBoxYet],
      ] as const
      for (const [box, expected] of writes) {
        const written = await expectingGood(vaultDB).putBox(scopeOf('u1'), expected, box)
        expect(written).to.deep.equal(box)
        expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), box.boxlabel, inThisVault)).to.deep.equal(written)
      }
    })
  })

  describe(lineTitle('1.2'), () => {
    it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
      const vaultDB = await withVaultRecord()
      await ensureGated(vaultDB, vaultRecordOf('u2'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).putBox(scopeOf('u2'), { vault_tok: 'vault-tok-u2', revision_tok: null }, boxOf('anthropic', 'two'))
      const oneBox = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)
      const twoBox = await expectingGood(vaultDB).getBox(scopeOf('u2'), 'anthropic', { vault_tok: 'vault-tok-u2' })
      expect(oneBox?.revision_tok).to.eq('rev-one')
      expect(twoBox?.revision_tok).to.eq('rev-two')
      expect(await boxesOf(vaultDB, scopeOf('u2'))).to.have.lengthOf(1)
    })

    it("keeps apart users whose ids differ only by a colon, a bar, a percent sign or its encoding, a dot, an at sign or a tilde", async () => {
      const vaultDB = await makeVaultDB()
      const userIds = ['u1', 'u1:', 'u1|', 'u1%', 'u1%3A', 'u1.', 'u1@', 'u1~']
      for (const [ii, user_id] of userIds.entries()) {
        await ensureGated(vaultDB, vaultRecordOf(user_id))
        await expectingGood(vaultDB).putBox(scopeOf(user_id), { vault_tok: `vault-tok-${user_id}`, revision_tok: null }, boxOf('anthropic', `of-${String(ii)}`))
      }
      const listEach = () => Promise.all(userIds.map((user_id) => boxesOf(vaultDB, scopeOf(user_id))))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => box.revision_tok))).to.deep.equal(userIds.map((_user_id, ii) => [`rev-of-${String(ii)}`]))
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal([0, 1, 1, 1, 1, 1, 1, 1])
    })

    it("refuses a user id outside ASCII, a letter composed or decomposed alike, never normalizing it", async () => {
      const vaultDB = await makeVaultDB()
      for (const user_id of ['caf\u{E9}', 'cafe\u{301}']) {
        await expectBad(vaultDB.ensureVault(gatelessOf(user_id)), 'bad_record')
        await expectBad(vaultDB.getVault(scopeOf(user_id)), 'bad_scope')
      }
    })

    it("keeps apart vaults and boxes whose labels differ only by an underscore, a digit or where an underscore falls", async () => {
      const vaultDB = await makeVaultDB()
      const scopes = OddLabels.map((vaultlabel) => scopeOf('u1', vaultlabel))
      for (const [ii, scope] of scopes.entries()) {
        await ensureGated(vaultDB, vaultRecordOf('u1', { ...scope, vault_tok: `vault-tok-${String(ii)}` }))
        await expectingGood(vaultDB).putBox(scope, { vault_tok: `vault-tok-${String(ii)}`, revision_tok: null }, boxOf(OddLabels[ii] ?? '', `of-${String(ii)}`))
      }
      const listEach = () => Promise.all(scopes.map((scope) => boxesOf(vaultDB, scope)))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => [box.boxlabel, box.revision_tok]))).to.deep.equal(OddLabels.map((label, ii) => [[label, `rev-of-${String(ii)}`]]))
      await expectingGood(vaultDB).delVault(scopes[0] ?? scopeOf('u1'), { vault_tok: 'vault-tok-0', gate_epoch: 1 })
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal(OddLabels.map((_label, ii) => (ii === 0 ? 0 : 1)))
    })

    it("keeps boxes of one vault apart, by labels near one another, reading back each under its own", async () => {
      const vaultDB = await withVaultRecord()
      for (const [ii, boxlabel] of OddLabels.entries()) {
        await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf(boxlabel, `of-${String(ii)}`))
      }
      const summaries = await boxesOf(vaultDB, scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.have.members([...OddLabels])
      for (const [ii, boxlabel] of OddLabels.entries()) {
        const box = await expectingGood(vaultDB).getBox(scopeOf('u1'), boxlabel, inThisVault)
        expect(box?.revision_tok).to.eq(`rev-of-${String(ii)}`)
      }
      const underscored = deleting(`rev-of-${String(OddLabels.indexOf('main_x'))}`)
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'main_x', underscored)).to.deep.equal({ outcome: 'deleted' })
      const remaining = await boxesOf(vaultDB, scopeOf('u1'))
      expect(remaining).to.have.lengthOf(OddLabels.length - 1)
    })
  })
  // --

  // == [Reads after writes]: 2.1 seen by later reads, 2.2 by boxlabel, 2.3 listings, 2.4 in one step, 2.5 in its vault

  describe(lineTitle('2.1'), () => {
    it("shows each write to the very next read and listing, and each deletion likewise", async () => {
      const vaultDB = await withVaultRecord()
      const revisionsNow = async () => ({
        read:   await revisionIn(vaultDB, 'anthropic'),
        listed: await listedRevisions(vaultDB),
      })
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, boxOf('anthropic', 'two'))
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-two', listed: ['rev-two'] })
      await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting('rev-two'))
      expect(await revisionsNow()).to.deep.equal({ read: null, listed: [] })
    })

    timingTestsOf('2.1')
  })

  describe(lineTitle('2.2'), () => {
    it("reads each of many boxes back by its boxlabel", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ManyBoxlabels)
      const revisions = await Promise.all(ManyBoxlabels.map((boxlabel) => revisionIn(vaultDB, boxlabel)))
      expect(revisions).to.deep.equal(ManyBoxlabels.map((boxlabel) => `rev-${boxlabel}`))
    })
  })

  describe(lineTitle('2.3'), () => {
    it("lists summaries sorted by boxlabel, with format and both ciphered fields stripped", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('openai', 'two'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      const summaries = await boxesOf(vaultDB, scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
      expect(summaries[0]).to.deep.equal({
        boxlabel:        'anthropic',
        revision_tok:    'rev-one',
        sidecar:         { note: 'a test box' },
        registered_at:   Date.UTC(2026, 9, 14),
        written_at:      Date.UTC(2026, 9, 14),
        format:          'safebyok-box-v8',
        whisper_codec:   'json_v1',
        whisper_schema_version: 1,
      })
    })

    it("lists every box, however many: never a page or a sample", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ManyBoxlabels)
      const listed = await boxesOf(vaultDB, scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(ManyBoxlabels.toSorted((one, two) => one.localeCompare(two)))
    })

    it("lists the same twice with nothing written between", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ['openai', 'anthropic', 'mistral'])
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.deep.equal(await boxesOf(vaultDB, scopeOf('u1')))
    })
  })

  describe(lineTitle('2.4'), () => {
    it("has no vault until one is made, as getVault's example finds, then reads its record and listing together", async () => {
      const vaultDB = await makeVaultDB()
      expect(await expectingGood(vaultDB).getVault(scopeOf('u1'))).to.be.null
      await ensureGated(vaultDB, vaultRecordOf('u1'))
      await storeEach(vaultDB, ['openai', 'anthropic'])
      const read = await expectingGood(vaultDB).getVault(scopeOf('u1'))
      expect(recordOfRead(read!)).to.deep.equal(vaultRecordOf('u1'))
      expect(read?.boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    })

    it("ensures a new vault from a gateless draft, handing it back under the draft's vault_tok, as ensureVault's example tells, with an empty listing, and reads it back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await expectingGood(vaultDB).ensureVault(gatelessOf('u1'))).to.deep.equal({ ...gatelessOf('u1'), boxes: [], damagedBoxes: [] })
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(gatelessOf('u1'))
      expect(await expectingGood(vaultDB).getVault(scopeOf('u1'))).to.deep.equal({ ...gatelessOf('u1'), boxes: [], damagedBoxes: [] })
    })

    it("keeps each vault's listing to itself: a vault read lists none of another scope's boxes", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ['anthropic'])
      const other = await expectingGood(vaultDB).ensureVault(gatelessOf('u2'))
      expect(other.boxes).to.deep.equal([])
      const own = await expectingGood(vaultDB).getVault(scopeOf('u1'))
      expect(own?.boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
    })

    it("hands a server the vault as stored, through getVaultRecords, as its example does, and ensureVaultRecords: its vault record, and each box whole but for its two ciphered fields", async () => {
      const vaultDB = await makeVaultDB()
      expect(await expectingGood(vaultDB).getVaultRecords(scopeOf('u1'))).to.be.null
      expect(await expectingGood(vaultDB).ensureVaultRecords(gatelessOf('u1'))).to.deep.equal({ ...gatelessOf('u1'), boxes: [], damagedBoxes: [] })
      await expectingGood(vaultDB).putVaultRecord(vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 0 })
      await storeEach(vaultDB, ['openai', 'anthropic'])
      const records = await expectingGood(vaultDB).getVaultRecords(scopeOf('u1'))
      expect(recordOfRead(records!)).to.deep.equal(vaultRecordOf('u1'))
      expect(records?.boxes).to.have.deep.members([listedRecordOf('openai'), listedRecordOf('anthropic')])
      const ensured = await expectingGood(vaultDB).ensureVaultRecords(gatelessOf('u1', { vault_tok: 'the-second-arrival' }))
      expect(recordOfRead(ensured)).to.deep.equal(vaultRecordOf('u1'))
      expect(ensured.boxes).to.have.deep.members([listedRecordOf('openai'), listedRecordOf('anthropic')])
    })

    timingTestsOf('2.4')
  })

  describe(lineTitle('2.5'), () => {
    it("hands back a box read under the vault_tok of the vault it lies in", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-u1' })).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("refuses a read naming another vault_tok as vault_mismatch, carrying nothing of the vault that stands (Contract: VaultDB.getBox, Refuses)", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      const refusal = await expectBad(vaultDB.getBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-other' }), 'vault_mismatch')
      expect(refusal).to.not.have.property('meta')
      expect(thrownText(refusal)).to.not.include('vault-tok-u1')
      expect(thrownText(refusal)).to.not.include('whisper-one')
    })

    it("refuses a read in a scope that holds no vault record as vault_mismatch, even with no box to find", async () => {
      const vaultDB = await makeVaultDB()
      await expectBad(vaultDB.getBox(scopeOf('u1'), 'anthropic', inThisVault), 'vault_mismatch')
    })

    it("refuses a read in a vault since deleted, its tombstone standing, as vault_mismatch", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      await expectBad(vaultDB.getBox(scopeOf('u1'), 'anthropic', inThisVault), 'vault_mismatch')
    })

    it("refuses a read naming a vault deleted and made anew as vault_mismatch, and finds no box naming the new one", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      const reborn = await expectingGood(vaultDB).ensureVault(gatelessOf('u1', { vault_tok: 'vault-tok-reborn' }))
      expect(reborn.vault_tok).to.eq('vault-tok-reborn')
      await expectBad(vaultDB.getBox(scopeOf('u1'), 'anthropic', inThisVault), 'vault_mismatch')
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-reborn' })).to.be.null
    })
  })
  // --

  // == [Creating and updating]: 3.1 created once, 3.2 vault record update, 3.3 box write

  describe(lineTitle('3.1'), () => {
    it("yields to vault record already standing: the second device gets the first's back", async () => {
      const vaultDB = await withVaultRecord()
      const latecomer = gatelessOf('u1', { vault_tok: 'the-second-arrival' })
      const ensured = await expectingGood(vaultDB).ensureVault(latecomer)
      expect(recordOfRead(ensured)).to.deep.equal(vaultRecordOf('u1'))
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
    })

    it("ensures a vault already standing as it stands, untouched, with its listing: the second device gets the first's back", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ['openai', 'anthropic'])
      const standing = await expectingGood(vaultDB).getVault(scopeOf('u1'))
      expect(await expectingGood(vaultDB).ensureVault(gatelessOf('u1', { vault_tok: 'the-second-arrival' }))).to.deep.equal(standing)
      expect(await expectingGood(vaultDB).getVault(scopeOf('u1'))).to.deep.equal(standing)
    })

    timingTestsOf('3.1')
  })

  describe(lineTitle('3.2'), () => {
    it("lands while the standing vault record is the one proven against", async () => {
      const vaultDB = await withVaultRecord()
      const next = { ...vaultRecordOf('u1'), gate_epoch: 2 }
      const stored = await expectingGood(vaultDB).putVaultRecord(next, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
      expect(stored, 'the store moved vault_epoch up by one, whatever the writer sent').to.deep.equal({ ...next, vault_epoch: 2 })
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(stored)
    })

    it("refuses over a gate_epoch since moved on, writing nothing, and names what won, as putVaultRecord' example reads it", async () => {
      const vaultDB = await withVaultRecord()
      const theirs = { ...vaultRecordOf('u1'), gate_epoch: 2, gate: gateOf('u1', { passphrase: wayinOf('passphrase', { vault_key_wayin_wrapped: fakeCiphered('theirs') }) }) }
      await expectingGood(vaultDB).putVaultRecord(theirs, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
      const mine = { ...vaultRecordOf('u1'), gate_epoch: 2, gate: gateOf('u1', { passphrase: wayinOf('passphrase', { vault_key_wayin_wrapped: fakeCiphered('mine') }) }) }
      const refusal = await expectBad(vaultDB.putVaultRecord(mine, { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'stale_write')
      expect(refusal.meta, 'a stale write of the vault record names what stands').to.deep.equal({ vault_stored: { ...theirs, vault_epoch: 2 } })
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal({ ...theirs, vault_epoch: 2 })
    })

    it("refuses over a vault made anew under another vault_tok", async () => {
      const vaultDB = await withVaultRecord()
      const next = { ...vaultRecordOf('u1'), vault_tok: 'vault-tok-gone', gate_epoch: 2 }
      const refusal = await expectBad(vaultDB.putVaultRecord(next, { vault_tok: 'vault-tok-gone', gate_epoch: 1 }), 'stale_write')
      expect(refusal.meta).to.deep.equal({ vault_stored: vaultRecordOf('u1') })
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
    })

    it("refuses where no vault record stands, naming none: an update never creates", async () => {
      const vaultDB = await makeVaultDB()
      const refusal = await expectBad(vaultDB.putVaultRecord(vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'stale_write')
      expect(refusal.meta).to.deep.equal({ vault_stored: null })
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.be.null
    })

    it("writes a vault's first gate over its gateless props, expecting gate_epoch 0, and refuses a second first gate naming the first", async () => {
      const vaultDB = await makeVaultDB()
      await expectingGood(vaultDB).ensureVault(gatelessOf('u1'))
      const first = vaultRecordOf('u1', { gate: gateOf('u1', { passphrase: wayinOf('first') }) })
      await expectingGood(vaultDB).putVaultRecord(first, { vault_tok: 'vault-tok-u1', gate_epoch: 0 })
      expect(await expectingGood(vaultDB).getVault(scopeOf('u1'))).to.deep.equal({ ...first, boxes: [], damagedBoxes: [] })
      const second = vaultRecordOf('u1', { gate: gateOf('u1', { passphrase: wayinOf('second') }) })
      const refusal = await expectBad(vaultDB.putVaultRecord(second, { vault_tok: 'vault-tok-u1', gate_epoch: 0 }), 'stale_write')
      expect(refusal.meta).to.deep.equal({ vault_stored: first })
    })

    timingTestsOf('3.2')
  })

  describe(lineTitle('3.3'), () => {
    it("replaces a box over the revision it read", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, boxOf('anthropic', 'two'))
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(boxOf('anthropic', 'two'))
    })

    it("refuses a write over a revision it never read as stale_write, with the box that stands as meta.box_stored, writing nothing (Contract: VaultDB.putBox, Refuses)", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      // A second device that saw no box, and one that saw some other revision, both lose.
      const sawNone = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'two')), 'stale_write')
      const sawOther = await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-other' }, boxOf('anthropic', 'two')), 'stale_write')
      for (const refusal of [sawNone, sawOther]) { expect(refusal.meta).to.deep.equal({ box_stored: boxOf('anthropic', 'one') }) }
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("refuses a write over a box since deleted as stale_write, with null as meta.box_stored: nothing stands (Contract: VaultDB.putBox, Refuses)", async () => {
      const vaultDB = await withVaultRecord()
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-gone' }, boxOf('anthropic', 'late')), 'stale_write')
      expect(refusal.meta).to.deep.equal({ box_stored: null })
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null
    })

    it("hands back the box it wrote over the revision it read, and from a write refused as stale the winner, whole, as a read would (Contract: VaultDB.putBox, Returns)", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      const landed = await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, boxOf('anthropic', 'two'))
      expect(landed).to.deep.equal(boxOf('anthropic', 'two'))
      // Refused, it names what stands as a read hands it back: enough to open it, or to write over it.
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, boxOf('anthropic', 'three')), 'stale_write')
      expect(refusal.meta?.box_stored).to.deep.equal(landed)
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(landed)
    })

    it("refuses a write into a scope that holds no vault record as vault_mismatch, carrying no meta (Contract: VaultDB.putBox, Refuses)", async () => {
      const vaultDB = await makeVaultDB()
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one')), 'vault_mismatch')
      expect(refusal).to.not.have.property('meta')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("refuses a box sealed for a vault since deleted and made anew as vault_mismatch, though no box stands in either, carrying nothing of the vault that stands (Contract: VaultDB.putBox, Refuses)", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      await ensureGated(vaultDB, { ...vaultRecordOf('u1'), vault_tok: 'vault-tok-reborn' })
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'stale')), 'vault_mismatch')
      expect(refusal).to.not.have.property('meta')
      expect(thrownText(refusal)).to.not.include('vault-tok-reborn')
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-reborn' })).to.be.null
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-reborn', revision_tok: null }, boxOf('anthropic', 'fresh'))
      const reborn = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-reborn' })
      expect(reborn?.revision_tok).to.eq('rev-fresh')
    })

    it("refuses a write expecting another user's vault_tok as vault_mismatch", async () => {
      const vaultDB = await withVaultRecord()
      await ensureGated(vaultDB, vaultRecordOf('u2'))
      await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u2', revision_tok: null }, boxOf('anthropic', 'one')), 'vault_mismatch')
    })

    it("refuses the same write sent twice, once it has landed, as stale_write naming the box it wrote: a first write and a replacement alike (Contract: VaultDB.putBox, Refuses)", async () => {
      const vaultDB = await withVaultRecord()
      const first = await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      const firstAgain = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one')), 'stale_write')
      expect(firstAgain.meta).to.deep.equal({ box_stored: first })
      const overOne = { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }
      const second = await expectingGood(vaultDB).putBox(scopeOf('u1'), overOne, boxOf('anthropic', 'two'))
      const secondAgain = await expectBad(vaultDB.putBox(scopeOf('u1'), overOne, boxOf('anthropic', 'two')), 'stale_write')
      expect(secondAgain.meta).to.deep.equal({ box_stored: second })
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(second)
    })

    timingTestsOf('3.3')
  })
  // --

  // == [Deleting]: 3.4 box deletion, 3.5 vault deletion

  describe(lineTitle('3.4'), () => {
    it("removes one box without touching its neighbours, saying it deleted the revision named, and then that there is none", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('openai', 'two'))
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))).to.deep.equal({ outcome: 'deleted' })
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))).to.deep.equal({ outcome: 'absent' })
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'openai', inThisVault)).to.not.be.null
    })

    it("removes a box written over the revision it names all the same, saying it deleted another", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, boxOf('anthropic', 'two'))
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))).to.deep.equal({ outcome: 'deleted_other' })
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("removes a box holding a revision where it names none, saying it deleted another", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting(null))).to.deep.equal({ outcome: 'deleted_other' })
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null
    })

    it("says there is none for a box never written, whatever revision it names, and writes nothing", async () => {
      const vaultDB = await withVaultRecord()
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting(null))).to.deep.equal({ outcome: 'absent' })
      expect(await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))).to.deep.equal({ outcome: 'absent' })
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("wins over a write: a write over a revision deleted meanwhile refuses, and the box stays gone", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))
      await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, boxOf('anthropic', 'two')), 'stale_write')
      expect(await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null
    })

    it("refuses from a stale handle, even naming the revision that stands: a vault deleted and made anew keeps its box", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      await ensureGated(vaultDB, { ...vaultRecordOf('u1'), vault_tok: 'vault-tok-reborn' })
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-reborn', revision_tok: null }, boxOf('anthropic', 'reborn'))
      await expectBad(vaultDB.delBox(scopeOf('u1'), 'anthropic', deleting('rev-reborn')), 'stale_write')
      await expectBad(vaultDB.delBox(scopeOf('u1'), 'anthropic', deleting(null)), 'stale_write')
      const kept = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-reborn' })
      expect(kept?.revision_tok).to.eq('rev-reborn')
    })

    it("refuses in a scope that holds no vault record, even with no box to delete", async () => {
      const vaultDB = await makeVaultDB()
      await expectBad(vaultDB.delBox(scopeOf('u1'), 'anthropic', deleting(null)), 'stale_write')
    })

    timingTestsOf('3.4')
  })

  describe(lineTitle('3.5'), () => {
    it("removes the vault record and every box of that scope, and nothing else", async () => {
      const vaultDB = await withVaultRecord()
      await ensureGated(vaultDB, vaultRecordOf('u2'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectingGood(vaultDB).putBox(scopeOf('u2'), { vault_tok: 'vault-tok-u2', revision_tok: null }, boxOf('anthropic', 'two'))
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.be.null
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
      expect(await vaultRecordIn(vaultDB, scopeOf('u2'))).to.not.be.null
      expect(await expectingGood(vaultDB).getBox(scopeOf('u2'), 'anthropic', { vault_tok: 'vault-tok-u2' })).to.not.be.null
    })

    it("refuses from a stale handle: a vault made anew survives, vault record and boxes", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      const reborn = { ...vaultRecordOf('u1'), vault_tok: 'vault-tok-reborn', vault_epoch: 3 }
      await ensureGated(vaultDB, reborn)
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-reborn', revision_tok: null }, boxOf('anthropic', 'reborn'))
      await expectBad(vaultDB.delVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(reborn)
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(1)
    })

    it("refuses where no vault record stands: there is no vault of that vault_tok to delete", async () => {
      const vaultDB = await makeVaultDB()
      await expectBad(vaultDB.delVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.be.null
    })

    it("refuses a deletion proven against a gate since changed elsewhere as stale_write, removing nothing: an old passphrase in a stale tab cannot delete the vault", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ['anthropic'])
      await expectingGood(vaultDB).putVaultRecord(vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
      const before = await standingVault(vaultDB, ['anthropic'])
      await expectBad(vaultDB.delVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await standingVault(vaultDB, ['anthropic'])).to.deep.equal(before)
      await expectingGood(vaultDB).delVault(scopeOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 2 })
    })

    it("leaves a tombstone, which it resolves: the scope and a vault_epoch one past the vault's", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putVaultRecord(vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
      const tombstone = await expectingGood(vaultDB).delVault(scopeOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 2 })
      expect(tombstone).to.deep.equal({ format: 'safebyok-tombstone-v1', ...scopeOf('u1'), vault_epoch: 3 })
      expect(await expectingGood(vaultDB).getVault(scopeOf('u1')), 'a tombstone is no vault').to.be.null
      expect((await expectingGood(vaultDB).getVaultRecords(scopeOf('u1')))).to.be.null
    })

    it("starts a new life over a tombstone, with the draft's fresh vault_tok and the counter carried on, and the tombstone is gone", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      const reborn = await expectingGood(vaultDB).ensureVault(gatelessOf('u1', { vault_tok: 'vault-tok-reborn' }))
      expect(reborn, 'the new life: a fresh vault_tok, no box, the counter past the vault deleted').to.deep.equal({ ...gatelessOf('u1', { vault_tok: 'vault-tok-reborn', vault_epoch: 2 }), boxes: [], damagedBoxes: [] })
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(recordOfRead(reborn))
      // The old life's deletion, sent again, meets a vault made anew, not the tombstone it replaced.
      await expectBad(vaultDB.delVault(scopeOf('u1'), thisVault), 'stale_write')
    })

    it("meets no expectation over a tombstone, a deletion's included: every write refuses as over no vault, and a deletion sent again is stale", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      const refusals = [
        await expectBad(vaultDB.putVaultRecord(vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'stale_write'),
        await expectBad(vaultDB.putVaultRecord(vaultRecordOf('u1', { gate_epoch: 1 }), { vault_tok: 'vault-tok-u1', gate_epoch: 0 }), 'stale_write'),
      ]
      for (const refusal of refusals) { expect(refusal.meta).to.deep.equal({ vault_stored: null }) }
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'late')), 'vault_mismatch')
      await expectBad(vaultDB.delBox(scopeOf('u1'), 'anthropic', deleting(null)), 'stale_write')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.deep.equal([])
      await expectBad(vaultDB.delVault(scopeOf('u1'), thisVault), 'stale_write')
      await expectBad(vaultDB.delVault(scopeOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 2 }), 'stale_write')
      // Refused, it moved nothing: the new life still carries the counter on from the one deletion.
      const reborn = await expectingGood(vaultDB).ensureVault(gatelessOf('u1', { vault_tok: 'vault-tok-reborn' }))
      expect(reborn.vault_epoch).to.eq(2)
    })

    it("delDamagedVault leaves a vault that stands sound as it is, and is quiet where none stands", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
      await expectBad(vaultDB.delDamagedVault(scopeOf('u1')), 'bad_option')
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(1)
      await expectingGood(vaultDB).delVault(scopeOf('u1'), thisVault)
      await expectingGood(vaultDB).delDamagedVault(scopeOf('u1'))
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.be.null
    })
    timingTestsOf('3.5')
  })
  // --

  // == [Refused and independent writes]: 3.6 refused wrote nothing, 3.7 independent writes

  describe(lineTitle('3.6'), () => {
    it("leaves the whole vault as it stood after each refusal: vault record, boxes and listing", async () => {
      const vaultDB = await withVaultRecord()
      await storeEach(vaultDB, ['anthropic', 'openai'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])
      const refusals = [
        [() => vaultDB.putVaultRecord(vaultRecordOf('u1', { gate_epoch: 3 }), { vault_tok: 'vault-tok-u1', gate_epoch: 2 }),           'stale_write'],
        [() => vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-other' }, boxOf('anthropic', 'late')),   'stale_write'],
        [() => vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-gone', revision_tok: null }, boxOf('mistral', 'late')),          'vault_mismatch'],
        [() => vaultDB.putBox(scopeOf('u1'), noBoxYet, omitting(boxOf('mistral', 'late'), 'sidecar')),                                'invalid_box'],
        [() => vaultDB.delBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-gone', revision_tok: 'rev-anthropic' }),             'stale_write'],
        [() => vaultDB.delVault(scopeOf('u1'), { vault_tok: 'vault-tok-gone', gate_epoch: 1 }),                                         'stale_write'],
      ] as const
      for (const [refuse, kind] of refusals) {
        await expectBad(refuse(), kind)
        expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
      }
    })
  })

  describe(lineTitle('3.7'), () => {
    timingTestsOf('3.7')
  })
  // --

  // == [Box limits]: 4.1 declared, 4.2 refused, 4.3 replacement, 4.4 under, 4.5 nothing lost, 4.7 capacity

  describe(lineTitle('4.1'), () => {
    it("declares a whole number of boxes above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxBoxes === Infinity || (Number.isSafeInteger(vaultDB.maxBoxes) && vaultDB.maxBoxes > 0)).to.be.true
    })
  })

  describe.runIf(capped)(lineTitle('4.2'), () => {
    it("refuses a new box in a full vault as vault_full, writing nothing", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('gemini', 'gemini')), 'vault_full')
      expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])).to.deep.equal(before)
      const listed = await boxesOf(vaultDB, scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'mistral', 'openai'])
    })

    it("never lets writes made one after another past the limit", async () => {
      const vaultDB = await cappedHolding([])
      const write = (boxlabel: string) => settledKind(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf(boxlabel, boxlabel)))
      const outcomes = [await write('anthropic'), await write('openai'), await write('mistral'), await write('gemini'), await write('cohere')]
      expect(outcomes).to.deep.equal(['landed', 'landed', 'landed', 'vault_full', 'vault_full'])
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(CappedBoxes)
    })
  })

  describe.runIf(capped)(lineTitle('4.3'), () => {
    it("replaces a box in a full vault", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectingGood(vaultDB).putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-openai' }, boxOf('openai', 'next'))
      const replaced = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'openai', inThisVault)
      expect(replaced?.revision_tok).to.eq('rev-next')
    })

    it("refuses a first write under a boxlabel already taken in a full vault as stale_write, not vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('openai', 'mine')), 'stale_write')
      const standing = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'openai', inThisVault)
      expect(standing?.revision_tok).to.eq('rev-openai')
    })
  })

  describe.runIf(capped)(lineTitle('4.4'), () => {
    it("lands a new box once deleting one has made room", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('gemini', 'gemini')), 'vault_full')
      await expectingGood(vaultDB).delBox(scopeOf('u1'), 'openai', deleting('rev-openai'))
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('gemini', 'gemini'))
      const listed = await boxesOf(vaultDB, scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'gemini', 'mistral'])
    })
  })

  describe(lineTitle('4.5'), () => {
    timingTestsOf('4.5')
  })

  describe(lineTitle('4.7'), () => {
    it("answers nothing used for a scope that holds no vault, against the box limit it declares (Contract: VaultDB.getCapacity)", async () => {
      const vaultDB = await makeVaultDB()
      const capacity = await expectingGood(vaultDB).getCapacity(scopeOf('u1'))
      expect(capacity.boxes).to.deep.equal({ used: 0, max: Math.min(vaultDB.maxBoxes, Number.MAX_SAFE_INTEGER) })
      expect(capacity.bytes.used).to.eq(0)
      expect(capacity.bytes.max).to.be.greaterThan(0)
    })

    it("counts the vault's boxes as its listing does, and weighs more for each box stored and less for each removed, that vault's alone", async () => {
      const vaultDB = await withVaultRecord()
      await ensureGated(vaultDB, vaultRecordOf('u2'))
      await storeEach(vaultDB, ['anthropic', 'openai'])
      const two = await expectingGood(vaultDB).getCapacity(scopeOf('u1'))
      expect(two.boxes.used).to.eq(2)
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(two.boxes.used)
      await storeEach(vaultDB, ['mistral'])
      const three = await expectingGood(vaultDB).getCapacity(scopeOf('u1'))
      expect(three.boxes.used).to.eq(3)
      expect(three.bytes.used).to.be.greaterThan(two.bytes.used)
      await expectingGood(vaultDB).delBox(scopeOf('u1'), 'mistral', deleting('rev-mistral'))
      expect(await expectingGood(vaultDB).getCapacity(scopeOf('u1'))).to.deep.equal(two)
      const other = await expectingGood(vaultDB).getCapacity(scopeOf('u2'))
      expect(other.boxes.used).to.eq(0)
    })

    it.runIf(capped)("carries on vault_full the reckoning that refused it, as a read of how full the vault is answers it after (Contract: VaultDB.putBox, Refuses)", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('gemini', 'gemini')), 'vault_full')
      expect(refusal.meta?.capacity?.boxes).to.deep.equal({ used: CappedBoxes, max: CappedBoxes })
      expect(refusal.meta).to.deep.equal({ capacity: await expectingGood(vaultDB).getCapacity(scopeOf('u1')) })
    })
  })
  // --

  // == [Refusals and access]: 5.1 VaultError kinds, 5.3 quotes nothing, 5.4 signed-in user

  describe(lineTitle('5.1'), () => {
    it("resolves every verb to an Outcome, a refusal as its err and never a rejection (Contract: VaultDB, What an adapter must do)", async () => {
      const vaultDB = await withVaultRecord()
      const below = { ...scopeOf('u1'), vaultlabel: '' }
      const refused: Promise<Outcome<unknown>>[] = [
        vaultDB.getVault(below),
        vaultDB.ensureVault(gatelessOf('u1', { vaultlabel: '' })),
        vaultDB.getVaultRecords(below),
        vaultDB.ensureVaultRecords(gatelessOf('u1', { vaultlabel: '' })),
        vaultDB.putVaultRecord(vaultRecordOf('u1', { vaultlabel: '' }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }),
        vaultDB.delVault(below, thisVault),
        vaultDB.delDamagedVault(below),
        vaultDB.getBox(below, 'anthropic', inThisVault),
        vaultDB.putBox(below, noBoxYet, boxOf('anthropic', 'one')),
        vaultDB.delBox(below, 'anthropic', deleting(null)),
      ]
      const outcomes = await Promise.all(refused)
      for (const outcome of outcomes) {
        expect(outcome.ok).to.be.false
        expect(isVaultError(outcome.err), 'a refusal that is no VaultError: a lookalike, unmarked, is not one').to.be.true
        expect(outcome.err?.family).to.eq('misuse')
        expect(outcome).to.not.have.property('val')
      }
    })

    it("resolves a call that succeeded as ok, its answer as val and no err (Contract: Shapes)", async () => {
      const vaultDB = await withVaultRecord()
      const outcome = await vaultDB.getVault(scopeOf('u1'))
      expect(outcome).to.deep.equal({ ok: true, val: { ...vaultRecordOf('u1'), boxes: [], damagedBoxes: [] } })
    })

    it("refuses a scope or boxlabel that fails its check as bad_scope, and a box holding one as invalid_box, before storage sees it", async () => {
      const vaultDB = await withVaultRecord()
      await expectBad(vaultDB.getVault({ ...scopeOf('u1'), vaultlabel: '' }), 'bad_scope')
      await expectBad(vaultDB.getBox(scopeOf('u1'), 'tab\there', inThisVault), 'bad_scope')
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('cafe\u{301}', 'one')), 'invalid_box')
      await expectBad(vaultDB.delBox({ ...scopeOf('u1'), user_id: 'u1\u{D800}' }, 'anthropic', deleting(null)), 'bad_scope')
      const overlong = 'u'.repeat(MaxUserIdChars + 1)
      await expectBad(vaultDB.getVault(scopeOf(overlong)), 'bad_scope')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("refuses a name holding ^, which key-value stores join names on, in every place a name goes, whatever the store, writing nothing: as bad_scope, in vault record as bad_record, and in a box as invalid_box", async () => {
      const vaultDB = await withVaultRecord()
      const holding = 'a^b'
      await expectBad(vaultDB.ensureVault(gatelessOf(holding)), 'bad_record')
      await expectBad(vaultDB.getVault({ ...scopeOf('u1'), applabel: holding }), 'bad_scope')
      await expectBad(vaultDB.getVault({ ...scopeOf('u1'), vaultlabel: holding }), 'bad_scope')
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf(holding, 'one')), 'invalid_box')
      await expectBad(vaultDB.getBox(scopeOf('u1'), holding, inThisVault), 'bad_scope')
      await expectBad(vaultDB.delBox(scopeOf('u1'), holding, deleting(null)), 'bad_scope')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("holds every name to the package's own checks, as a vault does: a box under a name that is no label refuses, writing nothing", async () => {
      const vaultDB = await withVaultRecord()
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('Not a Label!', 'one')), 'invalid_box')
      await expectBad(vaultDB.getBox(scopeOf('u1'), 'Not a Label!', inThisVault), 'bad_scope')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("refuses a malformed record or expectation, or vault record under another vault_tok, as bad_record, and a malformed box as invalid_box, before storage sees it (Contract: VaultDB.putBox, Does)", async () => {
      const vaultDB = await withVaultRecord()
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'kept'))
      const unparsable = omitting(boxOf('anthropic', 'one'), 'sidecar')
      await expectBad(vaultDB.ensureVault(vaultRecordOf('u1', { vault_tok: 'vault-tok-gated' }) as unknown as VaultDraft), 'bad_record')
      await expectBad(vaultDB.ensureVault(gatelessOf('u1', { vault_epoch: 3 })), 'bad_record')
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, unparsable), 'invalid_box')
      await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: '' }, boxOf('anthropic', 'one')), 'bad_record')
      await expectBad(vaultDB.putVaultRecord(vaultRecordOf('u1', { gate_epoch: 0 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'bad_record')
      await expectBad(vaultDB.putVaultRecord(vaultRecordOf('u1', { vault_tok: 'vault-tok-new', gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'bad_record')
      await expectBad(vaultDB.delBox(scopeOf('u1'), 'anthropic', deleting('')), 'bad_record')
      await expectBad(vaultDB.delBox(scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-u1' } as BoxDelExpectation), 'bad_record')
      await expectBad(vaultDB.delVault(scopeOf('u1'), { vault_tok: '', gate_epoch: 1 }), 'bad_record')
      await expectBad(vaultDB.delVault(scopeOf('u1'), { vault_tok: 'vault-tok-u1' } as VaultDelExpectation), 'bad_record')
      expect(await vaultRecordIn(vaultDB, scopeOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(1)
      const kept = await expectingGood(vaultDB).getBox(scopeOf('u1'), 'anthropic', inThisVault)
      expect(kept?.revision_tok).to.eq('rev-kept')
    })
  })

  describe(lineTitle('5.3'), () => {
    it("quotes no ciphertext, boxlabel or sidecar of a write it refuses as vault_mismatch", async () => {
      const vaultDB = await withVaultRecord()
      const box = boxOf('secret_project_x', 'sk-fake-quoted', { sidecar: { note: 'a sidecar never to be quoted' } })
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-gone', revision_tok: null }, box), 'vault_mismatch')
      expect(quotedOf(refusal, box)).to.deep.equal([])
    })

    it("quotes nothing of a write it refuses as stale: what it carries is the box that stands, never the one refused", async () => {
      const vaultDB = await withVaultRecord()
      const standing = boxOf('secret_project_x', 'sk-fake-standing')
      await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, standing)
      const box = boxOf('secret_project_x', 'sk-fake-quoted', { sidecar: { note: 'a sidecar never to be quoted' } })
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, box), 'stale_write')
      expect(quotedOf(refusal, { ...box, boxlabel: '' })).to.deep.equal([])
      expect(refusal.meta?.box_stored).to.deep.equal(standing)
    })

    it.runIf(capped)("quotes no ciphertext, boxlabel or sidecar of a box it refuses as vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const box = boxOf('secret_project_x', 'sk-fake-quoted', { sidecar: { note: 'a sidecar never to be quoted' } })
      const refusal = await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, box), 'vault_full')
      expect(quotedOf(refusal, box)).to.deep.equal([])
    })
  })

  describe.runIf(signsIn)(lineTitle('5.4'), () => {
    it("refuses another user every verb on a vault as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor('u2'))
      for (const attempt of attempts) { await expectBad(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })

    it("refuses every verb while no one is signed in as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor(null))
      for (const attempt of attempts) { await expectBad(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })
  })
  // --

  // == [Subscribe and size limits]: 6.1 subscribe, 7.1 record, 7.2 vault, 7.3 name

  describe(lineTitle('6.1'), () => {
    it("hands back an unsubscribe that can be called", async () => {
      const vaultDB = await makeVaultDB()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), unheard)
      expect(unsubscribe).to.be.a('function')
      unsubscribe()
    })

    timingTestsOf('6.1')
  })

  describe(lineTitle('7.1'), () => {
    it("declares the most it holds in one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxRecordBytes).to.be.greaterThan(0)
    })
  })

  describe(lineTitle('7.2'), () => {
    it("declares the most it holds of one vault, no less than one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxVaultBytes).to.be.a('number')
      expect(vaultDB.maxVaultBytes).to.be.at.least(vaultDB.maxRecordBytes)
    })
  })

  describe(lineTitle('7.3'), () => {
    it("declares the most bytes it holds in one name: a whole number above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxNameBytes === Infinity || (Number.isSafeInteger(vaultDB.maxNameBytes) && vaultDB.maxNameBytes > 0)).to.be.true
    })

    it("holds a name of every length it declares, up to the longest a label or a user_id may be, in every place a name goes", async () => {
      const vaultDB = await makeVaultDB()
      const longest = 'n'.repeat(Math.min(vaultDB.maxNameBytes, MaxLabelChars))
      const longestUserId = 'u'.repeat(Math.min(vaultDB.maxNameBytes, MaxUserIdChars))
      const scope = { applabel: longest, user_id: longestUserId, vaultlabel: longest }
      await ensureGated(vaultDB, { ...vaultRecordOf(longestUserId), ...scope })
      await expectingGood(vaultDB).putBox(scope, { vault_tok: `vault-tok-${longestUserId}`, revision_tok: null }, boxOf(longest, 'one'))
      const box = await expectingGood(vaultDB).getBox(scope, longest, { vault_tok: `vault-tok-${longestUserId}` })
      expect(box?.revision_tok).to.eq('rev-one')
    })

    it("refuses a name one byte longer than it holds as bad_scope, in every place a name goes, writing nothing", async () => {
      const vaultDB = await withVaultRecord()
      if (vaultDB.maxNameBytes >= MaxUserIdChars) { return }
      const overlong = 'n'.repeat(vaultDB.maxNameBytes + 1)
      await expectBad(vaultDB.ensureVault(gatelessOf(overlong)), 'bad_scope')
      await expectBad(vaultDB.getVault({ ...scopeOf('u1'), applabel: overlong }), 'bad_scope')
      await expectBad(vaultDB.getVault({ ...scopeOf('u1'), vaultlabel: overlong }), 'bad_scope')
      if (vaultDB.maxNameBytes >= MaxLabelChars) { return }
      await expectBad(vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf(overlong, 'one')), 'bad_scope')
      expect(await boxesOf(vaultDB, scopeOf('u1'))).to.have.lengthOf(0)
    })
  })
  // --
}

/** The longest a race or push test may take: a race runs a score of schedules, each over a fresh backend. */
const TimingTestMillis = 60_000

/** One of {@link vaultDBTimingChecks}: the contract line it proves, its title, whether its adapter can run it, and the check, which rejects when it fails. */
export type VaultDBTimingCheck = { line: VaultDBContractLine, title: string, runs: boolean, check: () => Promise<void> }

/**
 * The tests of {@link describeVaultDB} that are about when -- the races between devices, what one
 * device sees of another's writes, and what subscribe hears -- each runnable on its own, so a test
 * can show that one fails against an adapter that breaks it. `describeVaultDB` runs each in its
 * line's group, where `runs`. Each race runs under every schedule of {@link raceEveryWay}, its
 * devices from `makeDevices`, or else every move through one adapter from `makeVaultDB` (or
 * `makeCappedVaultDB`, for the limit's).
 *
 * Two limits of what they prove. `pushFromTheStart` holds a watch's start at the turnstile only
 * where that start is a round trip through it; a watch that starts as `subscribe` returns, or
 * whose start `makeDevices` leaves unwired (a Convex client's `watchQuery` is not a promise, so
 * cannot pass it), is live at once, and the check then shows what the other push checks do. And a
 * push check credits a call to a write by when it ran, not by what caused it: a late call from an
 * earlier write that reads the vault after a later one landed is credited to the later.
 *
 * @param makeAdapter - A fresh, empty adapter, as `describeVaultDB` takes it.
 * @param opts - `describeVaultDB`'s options.
 * @returns Each check, by a handle naming what it races or watches.
 *
 * @example await TH.vaultDBTimingChecks(() => new MyVaultDB(), { makeDevices }).rivalFirstWrites.check()
 */
export const vaultDBTimingChecks = (makeAdapter: MakeVaultDB, opts: DescribeVaultDBOpts = {}) => {
  // == [Timing setup]: makeVaultDB, devicesFor, cappedAdapter, twoDevices, sameAdapterTwice

  const { makeCappedVaultDB, makeDevices, pushes = false } = opts
  /** A fresh adapter, made with `vaultDBOpts`, or with none. */
  const makeVaultDB = (vaultDBOpts: VaultDBOpts = {}) => makeAdapter(vaultDBOpts)
  const capped = makeCappedVaultDB !== undefined
  const devices = makeDevices !== undefined
  // Titles say what the moves come from, so a race through one adapter claims no more than it proves.
  const fromTwo = devices ? 'from two devices' : 'through one adapter'
  const fromEach = devices ? 'each from its own device' : 'all through one adapter'

  /** Devices over one fresh backend for a race, held to `maxBoxes` if given: from `makeDevices`, or else one adapter for every move. */
  const devicesFor = (maxBoxes?: number) => async (turnstile: Turnstile): Promise<() => VaultDBVerbs> => {
    if (makeDevices) {
      const deviceFor = await makeDevices(turnstile)
      return () => deviceFor({ maxBoxes })
    }
    const shared = await (maxBoxes === undefined ? makeVaultDB() : cappedAdapter(maxBoxes))
    return () => shared
  }
  const cappedAdapter = async (maxBoxes: number) => {
    if (! makeCappedVaultDB) { throw new Error('vaultDBTimingChecks ran a box limit check with no makeCappedVaultDB.') }
    return await makeCappedVaultDB(maxBoxes)
  }
  /** Two devices over one fresh backend, through `turnstile` (by default one never held): for a check that is no race. */
  const twoDevices = async (turnstile: Turnstile = openTurnstile): Promise<[VaultDBVerbs, VaultDBVerbs]> => {
    if (! makeDevices) { throw new Error('vaultDBTimingChecks ran a check across devices with no makeDevices.') }
    const deviceFor = await makeDevices(turnstile)
    return [deviceFor({}), deviceFor({})]
  }
  /** A watcher and a writer over one fresh backend: one adapter as both. */
  const sameAdapterTwice = async (): Promise<[VaultDBVerbs, VaultDBVerbs]> => {
    const vaultDB = await makeVaultDB()
    return [vaultDB, vaultDB]
  }
  // --
  return {
    // == [Cross-device and creation races]: seenAcrossDevices, rivalEnsures, readBesideRemake, rivalVaultRecordUpdates, rivalFirstGates, rivalFirstWrites, resentFirstWrites, rivalReplacements

    seenAcrossDevices: {
      line:  '2.1',
      title: "shows a write made on one device to the very next read and listing on another, and a deletion likewise",
      runs:  devices,
      check: async () => {
        const [one, two] = await twoDevices()
        expect(one, 'makeDevices made one adapter for both devices').to.not.eq(two)
        await ensureGated(one, vaultRecordOf('u1'))
        expect(await vaultRecordIn(two, scopeOf('u1'))).to.deep.equal(vaultRecordOf('u1'))
        await expectingGood(one).putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))
        expect({ read: await revisionIn(two, 'anthropic'), listed: await listedRevisions(two) }).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
        await expectingGood(two).delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))
        expect({ read: await revisionIn(one, 'anthropic'), listed: await listedRevisions(one) }).to.deep.equal({ read: null, listed: [] })
        await expectingGood(two).delVault(scopeOf('u1'), thisVault)
        expect(await vaultRecordIn(one, scopeOf('u1'))).to.be.null
      },
    },
    rivalEnsures: {
      line:  '3.1',
      title: `settles two ensures of one new vault made at once ${fromTwo} on one vault_tok, which both get back with its listing, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          moves:       ['vault-tok-one', 'vault-tok-two'].map((vaultTok) => (racer: VaultDBVerbs) => racer.ensureVault(gatelessOf('u1', { vault_tok: vaultTok }))),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            const [first, second] = outcomes
            expect(first?.val).to.deep.equal(second?.val)
            expect((first?.val as { boxes: unknown[] } | undefined)?.boxes).to.deep.equal([])
            for (const racer of racers) { expect(await expectingGood(racer).getVault(scopeOf('u1'))).to.deep.equal(first?.val) }
          },
        })
      },
    },
    readBesideRemake: {
      line:  '2.4',
      title: `reads a vault ${fromTwo} as it stood before a deletion and a remaking, between them, or after: never one vault's props beside another's boxes, however they interleave`,
      runs:  true,
      check: async () => {
        const remade = vaultRecordOf('u1', { vault_tok: 'vault-tok-new' })
        const remake = async (racer: VaultDBVerbs) => {
          await expectingGood(racer).delVault(scopeOf('u1'), thisVault)
          await ensureGated(racer, remade)
          return await racer.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-new', revision_tok: null }, boxOf('openai', 'new'))
        }
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       [(reader: VaultDBVerbs) => reader.getVault(scopeOf('u1')), remake],
          verdict:     (outcomes) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            const read = outcomes[0]?.val as (VaultRecord & { boxes: readonly BoxSparse[] }) | null
            const picture = read === null ? null : [read.vault_tok, read.boxes.map((box) => box.boxlabel)]
            expect([null, ['vault-tok-u1', ['anthropic']], ['vault-tok-new', []], ['vault-tok-new', ['openai']]], 'a read showed one vault beside another\'s boxes').to.deep.include(picture)
          },
        })
      },
    },
    rivalVaultRecordUpdates: {
      line:  '3.2',
      title: `lands one of two updates of one vault record made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [vaultRecordOf('u1', { gate_epoch: 2, gate: gateOf('u1', { passphrase: wayinOf('one') }) }), vaultRecordOf('u1', { gate_epoch: 2, gate: gateOf('u1', { passphrase: wayinOf('two') }) })]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultRecordFirst,
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.putVaultRecord(rival, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = { ...rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')], vault_epoch: 2 }
            expect(metaOf(outcomes.find((outcome) => outcome.kind === 'stale_write')), 'the stale write named another vault record than the one that won').to.deep.equal({ vault_stored: winner })
            expect(outcomes.find((outcome) => outcome.kind === 'landed')?.val, 'the update that landed resolved other vault record than it stored').to.deep.equal(winner)
            for (const racer of racers) { expect(await vaultRecordIn(racer, scopeOf('u1'))).to.deep.equal(winner) }
          },
        })
      },
    },
    rivalFirstGates: {
      line:  '3.2',
      title: `lands one of two first gates of a gateless vault made at once ${fromTwo}, and refuses the other as stale_write naming the first, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [vaultRecordOf('u1', { gate: gateOf('u1', { passphrase: wayinOf('one') }) }), vaultRecordOf('u1', { gate: gateOf('u1', { passphrase: wayinOf('two') }) })]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       (first: VaultDBVerbs) => expectingGood(first).ensureVault(gatelessOf('u1')),
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.putVaultRecord(rival, { vault_tok: 'vault-tok-u1', gate_epoch: 0 })),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            expect(metaOf(outcomes.find((outcome) => outcome.kind === 'stale_write')), 'the stale write named another vault record than the one that won').to.deep.equal({ vault_stored: winner })
            expect(outcomes.find((outcome) => outcome.kind === 'landed')?.val, 'the first gate that landed resolved other vault record than it stored').to.deep.equal(winner)
            for (const racer of racers) { expect(await vaultRecordIn(racer, scopeOf('u1'))).to.deep.equal(winner) }
          },
        })
      },
    },
    rivalFirstWrites: {
      line:  '3.3',
      title: `lands one of two first writes of a box made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultRecordFirst,
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.putBox(scopeOf('u1'), noBoxYet, rival)),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            expectLoserNamesWinner(outcomes, winner)
            for (const racer of racers) { expect(await expectingGood(racer).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(winner) }
          },
        })
      },
    },
    resentFirstWrites: {
      line:  '3.3',
      title: `lands one of two sends of one first write made at once ${fromTwo}, and refuses the other as stale_write naming that box, however they interleave`,
      runs:  true,
      check: async () => {
        const sent = boxOf('anthropic', 'one')
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultRecordFirst,
          moves:       [sent, sent].map((box) => (racer: VaultDBVerbs) => racer.putBox(scopeOf('u1'), noBoxYet, box)),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            expectLoserNamesWinner(outcomes, sent)
            for (const racer of racers) { expect(await expectingGood(racer).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(sent) }
          },
        })
      },
    },
    rivalReplacements: {
      line:  '3.3',
      title: `lands one of two replacements of one revision made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.putBox(scopeOf('u1'), over('rev-anthropic'), rival)),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            expectLoserNamesWinner(outcomes, winner)
            for (const racer of racers) { expect(await expectingGood(racer).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.deep.equal(winner) }
          },
        })
      },
    },
    // --
    // == [Deletion and disjoint-write races]: delBeatsReplacement, vaultDelBeatsWrite, apartNewBoxes, apartReplaceAndDel

    delBeatsReplacement: {
      line:  '3.4',
      title: `lands a deletion made at once ${fromTwo} with a replacement of its box, which is gone afterwards, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       [(one) => one.delBox(scopeOf('u1'), 'anthropic', deleting('rev-anthropic')), (two) => two.putBox(scopeOf('u1'), over('rev-anthropic'), boxOf('anthropic', 'next'))],
          verdict:     async ([erased, written], racers) => {
            expect(erased?.kind).to.eq('landed')
            expect(['landed', 'stale_write']).to.include(written?.kind)
            // A replacement refused came after the deletion, and names what stands: nothing.
            if (written?.kind === 'stale_write') { expect(metaOf(written)).to.deep.equal({ box_stored: null }) }
            // A replacement that landed went first, so the deletion removed it, and says so.
            expect(erased?.val).to.deep.equal({ outcome: written?.kind === 'landed' ? 'deleted_other' : 'deleted' })
            for (const racer of racers) { expect(await expectingGood(racer).getBox(scopeOf('u1'), 'anthropic', inThisVault)).to.be.null }
          },
        })
      },
    },
    vaultDelBeatsWrite: {
      line:  '3.5',
      title: `leaves no box behind a vault deleted while a box was written into it ${fromTwo}, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultRecordFirst,
          moves:       [(one) => one.delVault(scopeOf('u1'), thisVault), (two) => two.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))],
          verdict:     async ([erased, written], racers) => {
            expect(erased?.kind).to.eq('landed')
            expect(['landed', 'vault_mismatch']).to.include(written?.kind)
            for (const racer of racers) { expect(await standingVault(racer, ['anthropic'])).to.deep.equal({ vaultRecord: null, listed: [], boxes: ['vault_mismatch'] }) }
            // A box left behind would stand in the next vault made in the scope.
            const [first] = racers
            if (first) { await ensureGated(first, vaultRecordOf('u1', { vault_tok: 'vault-tok-reborn' })) }
            for (const racer of racers) {
              const { listed, boxes } = await standingVault(racer, ['anthropic'])
              expect({ listed, boxes }).to.deep.equal({ listed: [], boxes: [null] })
            }
          },
        })
      },
    },
    apartNewBoxes: {
      line:  '3.7',
      title: `lands two new boxes written into one vault at once ${fromTwo}, however they interleave, neither waiting on the other`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultRecordFirst,
          moves:       [(one) => one.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'anthropic')), (two) => two.putBox(scopeOf('u1'), noBoxYet, boxOf('openai', 'openai'))],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            for (const racer of racers) { expect(await listedRevisions(racer)).to.deep.equal(['rev-anthropic', 'rev-openai']) }
          },
        })
      },
    },
    apartReplaceAndDel: {
      line:  '3.7',
      title: `lands a replacement of one box and a deletion of another made at once ${fromTwo}, however they interleave, neither waiting on the other`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic', 'openai']),
          moves:       [(one) => one.putBox(scopeOf('u1'), over('rev-anthropic'), boxOf('anthropic', 'next')), (two) => two.delBox(scopeOf('u1'), 'openai', deleting('rev-openai'))],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            for (const racer of racers) {
              const listed = await boxesOf(racer, scopeOf('u1'))
              expect(listed.map((box) => [box.boxlabel, box.revision_tok])).to.deep.equal([['anthropic', 'rev-next']])
            }
          },
        })
      },
    },
    // --
    // == [Box limit races]: crowdForLastPlace, pastLimitFromRoomierDevice

    crowdForLastPlace: {
      line:  '4.5',
      title: `keeps every box that landed when four writers race for the last place, ${fromEach}, and leaves nothing of those refused, however they interleave`,
      runs:  capped,
      check: async () => {
        const racers = ['mistral', 'gemini', 'cohere', 'groq']
        await raceEveryWay({
          makeDevices: devicesFor(CappedBoxes),
          setup:       holdingFirst(['anthropic', 'openai']),
          moves:       racers.map((boxlabel) => (racer: VaultDBVerbs) => racer.putBox(scopeOf('u1'), noBoxYet, boxOf(boxlabel, boxlabel))),
          verdict:     async (outcomes, [first]) => {
            if (! first) { throw new Error('A crowd race had no devices.') }
            // However many found room -- one, where the adapter checks strictly; more, where its
            // count and its insert are apart -- each landed or was refused as full, and one landed.
            expect(outcomes.every((outcome) => outcome.kind === 'landed' || outcome.kind === 'vault_full')).to.be.true
            const landed = racers.filter((_boxlabel, ii) => outcomes[ii]?.kind === 'landed')
            expect(landed).to.not.have.lengthOf(0)
            const found = await Promise.all(racers.map((boxlabel) => revisionIn(first, boxlabel)))
            expect(found).to.deep.equal(racers.map((boxlabel, ii) => (outcomes[ii]?.kind === 'landed' ? `rev-${boxlabel}` : null)))
            // Back under the limit, keeping one racer that landed: the listing is whole again.
            const [kept, ...others] = landed
            for (const boxlabel of ['anthropic', 'openai', ...others]) { await expectingGood(first).delBox(scopeOf('u1'), boxlabel, deleting(`rev-${boxlabel}`)) }
            const listed = await boxesOf(first, scopeOf('u1'))
            expect(listed.map((box) => box.boxlabel)).to.deep.equal([kept])
          },
        })
      },
    },
    pastLimitFromRoomierDevice: {
      line:  '4.5',
      title: "keeps every box of a vault past its limit -- filled by a device allowed more -- readable, refuses a new one as full, replaces one, and lists it whole once deletions bring it back under",
      runs:  capped && devices,
      check: async () => {
        if (! makeDevices) { throw new Error('vaultDBTimingChecks ran a check across devices with no makeDevices.') }
        const deviceFor = await makeDevices(openTurnstile)
        const tight = deviceFor({ maxBoxes: CappedBoxes })
        const roomy = deviceFor({ maxBoxes: CappedBoxes + 2 })
        expect(tight.maxBoxes, 'makeDevices made a device not held to the maxBoxes it was asked for').to.eq(CappedBoxes)
        const held = ['anthropic', 'openai', 'mistral', 'gemini', 'cohere']
        await ensureGated(roomy, vaultRecordOf('u1'))
        await storeEach(roomy, held)
        expect(await Promise.all(held.map((boxlabel) => revisionIn(tight, boxlabel)))).to.deep.equal(held.map((boxlabel) => `rev-${boxlabel}`))
        await expectWholeOrRefused(tight, held)
        const before = await standingVault(tight, [...held, 'groq'])
        await expectBad(tight.putBox(scopeOf('u1'), noBoxYet, boxOf('groq', 'groq')), 'vault_full')
        expect(await standingVault(tight, [...held, 'groq'])).to.deep.equal(before)
        await expectingGood(tight).putBox(scopeOf('u1'), over('rev-openai'), boxOf('openai', 'next'))
        for (const boxlabel of ['anthropic', 'mistral', 'gemini']) { await expectingGood(tight).delBox(scopeOf('u1'), boxlabel, deleting(`rev-${boxlabel}`)) }
        await expectingGood(tight).putBox(scopeOf('u1'), noBoxYet, boxOf('groq', 'groq'))
        expect(await listedRevisions(tight)).to.deep.equal(['rev-cohere', 'rev-groq', 'rev-next'])
      },
    },
    // --
    // == [Push checks]: pushEachWrite, pushFromAnotherDevice, pushFromTheStart, pushPastAFailingListener, pushEndsOnUnsubscribe

    pushEachWrite: {
      line:  '6.1',
      title: "calls onChange after each kind of write to the vault, a read on each call seeing the write, once its watch is live",
      runs:  pushes,
      check: () => expectEachWriteHeard(sameAdapterTwice),
    },
    pushFromAnotherDevice: {
      line:  '6.1',
      title: "calls onChange after each kind of write made on another device, a read on each call seeing the write, once its watch is live",
      runs:  pushes && devices,
      check: () => expectEachWriteHeard(twoDevices),
    },
    pushFromTheStart: {
      line:  '6.1',
      title: `hears a write made ${devices ? 'on another device ' : ''}while its watch is still starting, a watch that starts late calling once it is live`,
      runs:  pushes,
      check: async () => {
        const keeper = makeTurnstile()
        const [watcher, writer] = await (devices ? twoDevices(keeper.turnstile) : sameAdapterTwice())
        await ensureGated(writer, vaultRecordOf('u1'))
        // A watch whose start is a round trip is held there while the write lands; one that starts
        // as subscribe returns, or not through the turnstile, never comes to the gate.
        const gate = keeper.holdAt(1)
        const watch = readingWatch(watcher)
        await Promise.race([gate.reached, ticks(WatchStartTicks)])
        keeper.holdNone()
        await expectHeard(watch, writer, () => writer.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'anthropic')), gate.release)
        watch.unsubscribe()
      },
    },
    pushPastAFailingListener: {
      line:  '6.1',
      title: "lands each write and calls every other listener when one listener throws and another rejects, logging each failure as an error",
      runs:  pushes,
      check: async () => {
        const spy = spyLogger()
        const vaultDB = await makeVaultDB({ logger: spy.logger })
        await ensureGated(vaultDB, vaultRecordOf('u1'))
        const thrown = new Error('a listener that throws')
        const rejected = new Error('a listener whose promise rejects')
        const unsubscribes = [
          vaultDB.subscribe(scopeOf('u1'), () => { throw thrown }),
          // A host's listener may be async, though subscribe types it as returning nothing.
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          vaultDB.subscribe(scopeOf('u1'), () => Promise.reject(rejected)),
        ]
        const watch = readingWatch(vaultDB)
        await untilLive([watch], vaultDB)
        await expectHeard(watch, vaultDB, () => vaultDB.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'anthropic')))
        const failures = () => spy.calls.filter((call) => call.err === thrown || call.err === rejected)
        await vi.waitFor(() => {
          expect(failures().map((call) => call.err), 'a listener failure the logger never heard').to.include.members([thrown, rejected])
        }, { timeout: HeardWithinMillis, interval: 5 })
        for (const call of failures()) {
          expect(call.level).to.eq('error')
          expect(call.story).to.deep.equal({ call: 'subscribe' })
        }
        for (const unsubscribe of [...unsubscribes, watch.unsubscribe]) { unsubscribe() }
      },
    },
    pushEndsOnUnsubscribe: {
      line:  '6.1',
      title: "calls an unsubscribed onChange no more, through several writes, however often it unsubscribes, while another watch hears each",
      runs:  pushes,
      check: async () => {
        const [watcher, writer] = await (devices ? twoDevices() : sameAdapterTwice())
        await ensureGated(writer, vaultRecordOf('u1'))
        const gone = readingWatch(watcher)
        const stays = readingWatch(watcher)
        await untilLive([gone, stays], writer)
        gone.unsubscribe()
        gone.unsubscribe()
        const goneCalls = gone.tally.calls
        for (const boxlabel of ['anthropic', 'openai', 'mistral']) {
          await expectHeard(stays, writer, () => writer.putBox(scopeOf('u1'), noBoxYet, boxOf(boxlabel, boxlabel)))
        }
        await wakeupAtNextTick()
        expect(gone.tally.calls, 'an unsubscribed onChange was called').to.eq(goneCalls)
        stays.unsubscribe()
      },
    },
    // --
  } satisfies Record<string, VaultDBTimingCheck>
}

// == [Turnstile check]: expectRoundTripsThroughTurnstile

/**
 * That a device from `makeDevices` passes the turnstile it was made with before each of its writes
 * goes to the backend -- a create, an update of the vault record, a write of a box, a deletion
 * of one and of the vault -- so the races of {@link describeVaultDB} can hold it there. A race
 * cannot tell a turnstile left unwired from an adapter that makes no round trips; an adapter over a
 * backend reached by round trips calls this in its own tests to show its factory wires one. It
 * counts at least one pass for each write, so a write that makes a second round trip around the
 * turnstile goes unseen here, and unheld in the races.
 *
 * @param makeDevices - The adapter's makeDevices, as `describeVaultDB` takes it.
 *
 * @example it("sends each device's statements through the turnstile", () => TH.expectRoundTripsThroughTurnstile(makeDevices))
 */
export const expectRoundTripsThroughTurnstile = async (makeDevices: MakeVaultDBDevices): Promise<void> => {
  const tally = { passes: 0 }
  const counting: Turnstile = { pass: () => { tally.passes += 1; return Promise.resolve() } }
  const device = (await makeDevices(counting))({})
  const writes = [
    ['ensureVault',          () => device.ensureVault(gatelessOf('u1'))],
    ['putVaultRecord',        () => device.putVaultRecord(vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 0 })],
    ['putBox',               () => device.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'one'))],
    ['delBox',               () => device.delBox(scopeOf('u1'), 'anthropic', deleting('rev-one'))],
    ['delVault',             () => device.delVault(scopeOf('u1'), thisVault)],
  ] as const
  for (const [verb, write] of writes) {
    const before = tally.passes
    await expectGood<unknown>(write())
    expect(tally.passes - before, `${verb} reached the backend without passing the turnstile: makeDevices gives its devices a client that does not go through it`).to.be.greaterThan(0)
  }
}
// --

// == [Race helpers]: expectToHold, withVaultRecordFirst, holdingFirst, kindsOf, expectWholeOrRefused, glimpseOf

/** A timing check run as a test: it rejects, failing the test, when what it checks does not hold. */
const expectToHold = (check: VaultDBTimingCheck): Promise<void> => check.check()

/** A race's setup: u1's vault made, through the first device. */
const withVaultRecordFirst = (first: VaultDBVerbs) => ensureGated(first, vaultRecordOf('u1'))

/** A race's setup: u1's vault made, holding a new box under each of `boxlabels`, through the first device. */
const holdingFirst = (boxlabels: readonly string[]) => async (first: VaultDBVerbs) => {
  await ensureGated(first, vaultRecordOf('u1'))
  await storeEach(first, boxlabels)
}

/** What a replacement in u1's vault expects: that vault, and the revision it read. */
const over = (revisionTok: string) => ({ vault_tok: 'vault-tok-u1', revision_tok: revisionTok })

/** The `meta` a race's refused move carried, read by shape, as a refusal from another copy of the package has it too. */
const metaOf = (outcome: RaceOutcome | undefined): unknown => (outcome?.val as { meta?: unknown } | undefined)?.meta

/** That the move of `outcomes` refused as stale names `winner` as what stands, whole: what the same atomic step read. */
const expectLoserNamesWinner = (outcomes: readonly RaceOutcome[], winner: BoxRecord | undefined) => {
  if (! winner) { throw new Error('A race had no winner to name.') }
  const lost = outcomes.find((outcome) => outcome.kind === 'stale_write')
  expect(metaOf(lost), 'the stale write named another box than the one that won').to.deep.equal({ box_stored: winner })
}

/** The kinds of `outcomes`, sorted, so a test of who won need not say which device it was. */
const kindsOf = (outcomes: readonly RaceOutcome[]): string[] => outcomes.map((outcome) => outcome.kind).toSorted((one, two) => one.localeCompare(two))

/** That `vaultDB` lists every one of `boxlabels` in u1's vault, or refuses the read outright: never part of the listing (2.3). */
const expectWholeOrRefused = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  const read = await raceOutcomeOf(vaultDB.getVault(scopeOf('u1')))
  if (read.kind === 'landed') {
    const listed = (read.val as { boxes: readonly BoxSparse[] }).boxes
    expect(listed.map((box) => box.boxlabel)).to.have.members([...boxlabels])
    return
  }
  expect(isVaultError(read.val), 'a listing refused with something other than a VaultError').to.be.true
}

/** What u1's vault holds as one device reads it: its vault record, and each listed box's boxlabel and revision. */
const glimpseOf = async (vaultDB: VaultDBVerbs) => {
  const vaultRecord = await vaultRecordIn(vaultDB, scopeOf('u1'))
  const listed = await boxesOf(vaultDB, scopeOf('u1'))
  return { vaultRecord, listed: listed.map((box) => [box.boxlabel, box.revision_tok]) }
}
// --

// == [Watch helpers]: readingWatch, expectHeard, untilLive, expectEachWriteHeard

/**
 * A watch on u1's vault through `watcher` that, each time it is called, reads the vault, as a vault
 * does, keeping what each read found and how many writes the test had begun when the call came.
 */
const readingWatch = (watcher: VaultDBVerbs) => {
  const tally = { calls: 0, writesBegun: 0 }
  const reads: { after: number, found: Awaited<ReturnType<typeof glimpseOf>> }[] = []
  const readAndKeep = async (after: number) => {
    try {
      reads.push({ after, found: await glimpseOf(watcher) })
    } catch {
      // A read that fails finds nothing, and the test waiting on it times out saying so.
    }
  }
  const onChange = () => {
    tally.calls += 1
    void readAndKeep(tally.writesBegun)
  }
  const unsubscribe = watcher.subscribe(scopeOf('u1'), onChange)
  return { tally, reads, unsubscribe }
}

/** How many ticks a watch has to come to the turnstile as it starts, for a check to hold it there. */
const WatchStartTicks = 20

/** How long a watch has to hear a write before a push test calls it unheard. */
const HeardWithinMillis = 2000

/**
 * That a write made by `write`, through `writer`, is heard by `watch`: some call made after the
 * write began reads the vault as it stands after it. `onWritten` runs once the write has landed. A call before the write, or one whose read
 * ran before the write landed, never finds that, since each write in a push test leaves the vault
 * unlike it ever stood before.
 */
const expectHeard = async (watch: ReturnType<typeof readingWatch>, writer: VaultDBVerbs, write: () => Promise<unknown>, onWritten = unheard) => {
  watch.tally.writesBegun += 1
  const begun = watch.tally.writesBegun
  await write()
  onWritten()
  const after = await glimpseOf(writer)
  await vi.waitFor(() => {
    expect(watch.reads.filter((read) => read.after >= begun).map((read) => read.found), 'no call to onChange read the vault as the write left it').to.deep.include(after)
  }, { timeout: HeardWithinMillis, interval: 5 })
}

/** How many probe writes {@link untilLive} makes, and how long it waits on each, before it calls a watch dead. */
const LiveProbes = 20

const ProbeWaitMillis = 100

/**
 * Resolves once every one of `watches` has been called, so is known to be live: at once, for a
 * watch that calls when it starts; otherwise after a probe write through `writer` -- the vault record'
 * gate_epoch moved on -- made again until each is heard, as a watch that starts on its own time
 * may miss the first. u1's vault record must already stand.
 */
const untilLive = async (watches: readonly ReturnType<typeof readingWatch>[], writer: VaultDBVerbs) => {
  const allHeard = () => watches.every((watch) => watch.tally.calls > 0)
  for (let ii = 0; ii < LiveProbes && ! allHeard(); ii += 1) {
    const standing = await vaultRecordIn(writer, scopeOf('u1'))
    if (! standing?.gate?.passphrase) { throw new Error('untilLive probes a vault that holds a gated vault record, and found none.') }
    await expectingGood(writer).putVaultRecord({ ...standing, gate_epoch: standing.gate_epoch + 1 }, { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch })
    try {
      await vi.waitFor(() => { expect(allHeard()).to.be.true }, { timeout: ProbeWaitMillis, interval: 5 })
    } catch {
      // Not heard yet: probe again.
    }
  }
  expect(allHeard(), `a watch heard none of ${String(LiveProbes)} writes to its vault`).to.be.true
}

/**
 * That a watch through the first of `pair` hears each kind of write made through the second: an
 * update of the vault record, two new boxes, a replacement, a deletion of one, of the vault,
 * and a create of the vault anew. The two may be one adapter, or two devices.
 */
const expectEachWriteHeard = async (pair: () => Promise<[VaultDBVerbs, VaultDBVerbs]>) => {
  const [watcher, writer] = await pair()
  await ensureGated(writer, vaultRecordOf('u1'))
  const watch = readingWatch(watcher)
  await untilLive([watch], writer)
  const standing = await vaultRecordIn(writer, scopeOf('u1'))
  const epoch = standing?.gate_epoch ?? 1
  const writes = [
    () => writer.putVaultRecord(vaultRecordOf('u1', { gate_epoch: epoch + 1 }), { vault_tok: 'vault-tok-u1', gate_epoch: epoch }),
    () => writer.putBox(scopeOf('u1'), noBoxYet, boxOf('anthropic', 'anthropic')),
    () => writer.putBox(scopeOf('u1'), noBoxYet, boxOf('openai', 'openai')),
    () => writer.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-anthropic' }, boxOf('anthropic', 'next')),
    () => writer.delBox(scopeOf('u1'), 'anthropic', deleting('rev-next')),
    () => writer.delVault(scopeOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: epoch + 1 }),
    () => ensureGated(writer, vaultRecordOf('u1', { vault_tok: 'vault-tok-anew' })),
  ]
  for (const write of writes) { await expectHeard(watch, writer, write) }
  watch.unsubscribe()
}
// --

// == [Fixtures and stranger helpers]: everyVerbOn, LiteralSidecar, ManyBoxlabels, storeEach, standingVault, listedRecordOf, revisionIn, others

/** Every verb a stranger might try on `u1`'s vault, each as a thunk. */
const everyVerbOn = (stranger: VaultDBVerbs) => [
  () => stranger.getVault(scopeOf('u1')),
  () => stranger.ensureVault(gatelessOf('u1', { vault_tok: 'vault-tok-theirs' })),
  () => stranger.putVaultRecord(vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }),
  () => stranger.getBox(scopeOf('u1'), 'anthropic', inThisVault),
  () => stranger.getVaultRecords(scopeOf('u1')),
  () => stranger.ensureVaultRecords(gatelessOf('u1', { vault_tok: 'vault-tok-theirs' })),
  () => stranger.delVault(scopeOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }),
  () => stranger.putBox(scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-anthropic' }, boxOf('anthropic', 'theirs')),
  () => stranger.putBox(scopeOf('u1'), noBoxYet, boxOf('mistral', 'theirs')),
  () => stranger.delBox(scopeOf('u1'), 'openai', deleting('rev-openai')),
  () => stranger.delVault(scopeOf('u1'), thisVault),
]

/** Text no normalization leaves alone: "café" with its accent composed, then decomposed, and a key. */
/**
 * A sidecar of accented letters, an emoji, a tab, a newline, quotes, backslashes, Hebrew, a
 * null and a fraction: a JSON value a store must hand back as the same value, every string in it
 * byte for byte, as it is bound.
 */
const LiteralSidecar = Object.freeze({
  note: 'caf\u{E9} na\u{EF}ve \u{1F511}\trotated\nin March',
  path: String.raw`C:\keys\"work"`,
  tags: ['\u{5D0}\u{5D1}', null, 1.5],
})

/** Enough boxes that a listing cut to a page, or a sample, would show it: 25, `box0` to `box24`. */
const ManyBoxlabels = Object.freeze(Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`))

/** A new box under each boxlabel, in `u1`'s vault, one after another: its revision `rev-<boxlabel>`. */
const storeEach = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  for (const boxlabel of boxlabels) { await expectingGood(vaultDB).putBox(scopeOf('u1'), noBoxYet, boxOf(boxlabel, boxlabel)) }
}

/** Everything `u1`'s vault holds, as its verbs read it: the vault record, the listing, and each of `boxlabels` read in the vault that record names.
 * Where no vault record stands, each read is the refusal it meets, by its kind: `vault_mismatch`.
 */
const standingVault = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  const vaultRecord = await vaultRecordIn(vaultDB, scopeOf('u1'))
  const inStanding = { vault_tok: vaultRecord?.vault_tok ?? 'vault-tok-u1' }
  const readOf = async (boxlabel: string) => {
    const { ok, val, err } = await vaultDB.getBox(scopeOf('u1'), boxlabel, inStanding)
    return ok ? val : err.refusalkind
  }
  return { vaultRecord, listed: await boxesOf(vaultDB, scopeOf('u1')), boxes: await Promise.all(boxlabels.map((boxlabel) => readOf(boxlabel))) }
}

/** What a server hands on of {@link storeEach}'s box under `boxlabel`: its record, but for its two ciphered fields. */
const listedRecordOf = (boxlabel: string) => {
  const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = boxOf(boxlabel, boxlabel)
  return listed
}

/** The revision of `u1`'s box under `boxlabel`, or null when there is none. */
const revisionIn = async (vaultDB: VaultDBVerbs, boxlabel: string): Promise<string | null> => {
  const box = await expectingGood(vaultDB).getBox(scopeOf('u1'), boxlabel, inThisVault)
  return box?.revision_tok ?? null
}

/** The revision of each box `u1`'s listing shows, in its order. */
const listedRevisions = async (vaultDB: VaultDBVerbs): Promise<(string | undefined)[]> => {
  const listed = await boxesOf(vaultDB, scopeOf('u1'))
  return listed.map((box) => box.revision_tok)
}

/** How a write settled: `landed`, or the refusalkind it was refused with. */
const settledKind = async (write: Promise<Outcome<unknown>>): Promise<string> => {
  const { ok, err } = await write
  return ok ? 'landed' : err.refusalkind
}

/** Which of a box's boxlabel, sidecar and ciphertexts a refusal quotes anywhere. */
const quotedOf = (refusal: unknown, box: BoxRecord): string[] => {
  const told = thrownText(refusal)
  const quotable = [box.boxlabel, ...leafTexts(box.sidecar), ...leafTexts(box.box_key_wrapped), ...leafTexts(box.whisper_ciphered)]
  return quotable.filter((text) => text !== '' && told.includes(text))
}
// --

// == [perUser]: perUser

/**
 * One adapter reaching every user's vaults, made of a VaultDB per user: for
 * {@link describeVaultDB} over an adapter that serves only the user signed in, as a server's
 * does when it makes one per request. The suite reaches two users' vaults through one adapter;
 * this sends each verb to the VaultDB `vaultDBFor` made for the user its scope or vault record names,
 * making each user's once and keeping it. Its limits are those of the one made for `anyone`.
 *
 * @param vaultDBFor - The VaultDB a request signed in as `user_id` gets.
 * @returns The verbs of one adapter, each sent on to its user's VaultDB.
 *
 * @example
 *   describeVaultDB('postgresVaultDB', () => perUser((user_id) => postgresVaultDB({ client, user_id, listen: (channel, onNotify) => client.listen(channel, onNotify) })))
 */
export const perUser = (vaultDBFor: (user_id: string) => VaultDBVerbs): VaultDBVerbs => {
  const vaultDBs = new Map<string, VaultDBVerbs>()
  const as = ({ user_id }: { user_id: string }): VaultDBVerbs => {
    const known = vaultDBs.get(user_id)
    if (known) { return known }
    const vaultDB = vaultDBFor(user_id)
    vaultDBs.set(user_id, vaultDB)
    return vaultDB
  }
  const anyone = as({ user_id: 'anyone' })
  return {
    maxRecordBytes:   anyone.maxRecordBytes,
    maxVaultBytes:    anyone.maxVaultBytes,
    maxBoxes:         anyone.maxBoxes,
    maxNameBytes:     anyone.maxNameBytes,
    getVault:           (scope) => as(scope).getVault(scope),
    ensureVault:        (draft) => as(draft).ensureVault(draft),
    getVaultRecords:    (scope) => as(scope).getVaultRecords(scope),
    ensureVaultRecords: (draft) => as(draft).ensureVaultRecords(draft),
    putVaultRecord:   (vaultRecord, expected) => as(vaultRecord).putVaultRecord(vaultRecord, expected),
    getBox:           (scope, boxlabel, expected) => as(scope).getBox(scope, boxlabel, expected),
    putBox:           (scope, expected, box) => as(scope).putBox(scope, expected, box),
    getCapacity:      (scope) => as(scope).getCapacity(scope),
    delBox:           (scope, boxlabel, expected) => as(scope).delBox(scope, boxlabel, expected),
    delVault:         (scope, expected) => as(scope).delVault(scope, expected),
    delDamagedVault:  (scope) => as(scope).delDamagedVault(scope),
    subscribe:        (scope, onChange) => as(scope).subscribe(scope, onChange),
  }
}
// --
