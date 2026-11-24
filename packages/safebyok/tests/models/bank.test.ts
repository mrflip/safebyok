import { describe, expect, it, vi } from 'vitest'
import { Crypto, Errors } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import { type BadNews, bankStageVals } from '../../src/shapes/shapes-bankish'
import { Lease } from '../../src/models/lease'
import type { LiveOf, ShellOf, TombstoneOf } from '../../src/shapes/shapes-sealers'
import { Lifeseq } from '../../src/shapes/primitives'
import { type BankRecord, type BoxRecord, Shell, ThingFormat } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import { getAskOf } from '../../src/shapes/shapes-asks'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The fields of a bank's Thing, which has no body. */
const BankFields = Object.keys(TH.bankThingOf())
/** The fields a bank shows as props: the Thing fields every kind has. Its `lifetok` is a getter. */
const BankProps = BankFields.filter((fieldname) => fieldname !== 'lifetok')

/** The lifeseqs of a box's first lives: live, gone, live again, gone again. Life 0 is the root box's too. */
const Life0 = Lifeseq.ofLifenum(0)
const Life1 = Lifeseq.ofLifenum(1)
const Life2 = Lifeseq.ofLifenum(2)
const Life3 = Lifeseq.ofLifenum(3)

describe("Bank.mintStamps(scope)", () => {
  it("mints the stamp of the bank's first life and its main gate's, of the scope, born now", () => {
    const { bankStamp, gateStamp } = Bank.mintStamps(TH.WorldScope)
    expect(bankStamp).to.deep.equal({ ...TH.ThingBank, lifeseq: Life0, born_at: TH.T0, lifetok: bankStamp.lifetok })
    expect(gateStamp).to.deep.equal({ ...TH.ThingBank, labelpath: 'gate', lifeseq: Life0, born_at: TH.T0 })
  })

  it("mints the first lifeseqs on every call, born when it is called", () => {
    const one = Bank.mintStamps(TH.WorldScope)
    vi.setSystemTime(TH.T0 + 5)
    const two = Bank.mintStamps(TH.WorldScope)
    expect([one.bankStamp.lifeseq, two.bankStamp.lifeseq, one.gateStamp.lifeseq, two.gateStamp.lifeseq]).to.deep.equal([Life0, Life0, Life0, Life0])
    expect([two.bankStamp.born_at, two.gateStamp.born_at]).to.deep.equal([TH.T0 + 5, TH.T0 + 5])
  })

  it("mints a new lifetok on each call, a UUID, in the bank's stamp alone", () => {
    const [one, two] = [Bank.mintStamps(TH.WorldScope), Bank.mintStamps(TH.WorldScope)]
    expect(one.bankStamp.lifetok).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(one.bankStamp.lifetok).to.not.eq(two.bankStamp.lifetok)
    expect(one.gateStamp).to.not.have.property('lifetok')
  })

  it("accepts the scope of anything that has one, such as a device", () => {
    const { bankStamp } = Bank.mintStamps(TH.makeDevice().scope)
    expect(bankStamp).to.include(TH.ThingBank)
    expect(bankStamp).to.not.have.property('device_tok')
  })

  const ScopeCases = [
    [null,                               'null'],
    [{ userid: 'u1' },                   'a scope with no banklabel'],
    [{ ...TH.WorldScope, banklabel: '' }, 'an empty banklabel'],
  ] as const

  for (const [scope, blurb] of ScopeCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => Bank.mintStamps(scope as never))
    })
  }
})

describe("Bank.makeRecord(stamp)", () => {
  it("is the bank's Thing at its first revision, of its stamp", () => {
    const record = Bank.makeRecord(TH.WorldBankStamp)
    expect(record).to.include({ ...TH.WorldBankStamp, labelpath: 'bank', label: 'bank', fmt: ThingFormat, revseq: 0, am: 'a', lifepath: Life0, written_at: TH.T0 })
    expect(Object.keys(record)).to.have.members(BankFields)
  })

  it("mints a new revtok on each call", () => {
    expect(Bank.makeRecord(TH.WorldBankStamp).revtok).to.not.eq(Bank.makeRecord(TH.WorldBankStamp).revtok)
  })

  it("refuses a stamp with no lifeseq, no lifetok, or none at all", () => {
    TH.expectSyncRefusal(() => Bank.makeRecord(TH.omitting(TH.WorldBankStamp, 'lifeseq')), 'bad_record')
    TH.expectSyncRefusal(() => Bank.makeRecord(TH.omitting(TH.WorldBankStamp, 'lifetok')), 'bad_record')
    TH.expectSyncRefusal(() => Bank.makeRecord(null as never), 'bad_record')
  })
})

describe("Bank.make(record, { device }), by the device's world", () => {
  it("makes the bank its device's world keeps, its main gate the world's, locked as the world is", async () => {
    const { record, device, bank } = await TH.buildBornBank()
    device.lock()
    expect(bank.isLocked).to.be.true
    expect(bank.isUnlocked).to.be.false
    expect(bank.stamp).to.deep.equal(TH.WorldBankStamp)
    expect(bank.scope).to.deep.equal(TH.ThingBank)
    expect(bank.device).to.equal(device)
    expect(bank.device_tok).to.eq(TH.DeviceTok)
    expect(bank).to.equal(device.world.bank)
    expect(bank.gate).to.equal(device.world.gate)
    expect(bank.rootBox).to.equal(device.world.rootBox?.pickle())
    expect([bank.revtok, bank.revseq, bank.written_at]).to.deep.equal([record.revtok, 0, TH.T0])
  })

  it("is unlocked where its gate is, and locks as its gate does", async () => {
    const { bank, device } = await TH.buildBornBank()
    device.lock()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(bank.isUnlocked).to.be.true
    expect(bank.getSnapshot()).to.include({ stage: 'unlocked' })
    bank.gate.lock()
    expect(bank.getSnapshot()).to.include({ stage: 'locked' })
  })

  it("pickles to its Thing alone, frozen, without its root box", async () => {
    const { record, bank } = await TH.buildBornBank()
    const pickle = bank.pickle()
    expect(Object.keys(pickle)).to.have.members(BankFields)
    expect(pickle).to.deep.equal(record)
    expect(Object.isFrozen(pickle)).to.be.true
  })

  it("shows its Thing fields alone, read-only, and serializes no wrapped bankKey", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank)).to.have.members(BankProps)
    expect(() => { (bank as { lifeseq: Lifeseq }).lifeseq = Life2 }).to.throw(TypeError)
    expect(JSON.stringify(bank)).to.not.include('ciphertext_b64')
    expect(bank.modelkind).to.eq('bank')
  })

  it("spreads to its Thing fields alone, each a string or a number: nothing secret and nothing opaque", async () => {
    const { bank } = await TH.buildBornBank()
    // The spread is this test's subject: what a log line or a host's `{ ...thing }` sees of a bank.
    const spread = { ...bank } // eslint-disable-line @typescript-eslint/no-misused-spread
    expect(Object.keys(spread)).to.have.members(BankProps)
    expect(Object.values(spread).every((val) => ['string', 'number'].includes(typeof val))).to.be.true
  })

  it("has the lifetok of its record", async () => {
    const { bank, record } = await TH.buildBornBank()
    expect(bank.lifetok).to.eq(record.lifetok)
  })

  const RecordCases = [
    [(record: BankRecord) => ({ ...record, am: 'x' }),                    'a tombstone'],
    [(record: BankRecord) => ({ ...record, fmt: 3000 }),                  'another fmt'],
    [(record: BankRecord) => TH.omitting(record, 'lifeseq'),              'no lifeseq'],
    [(record: BankRecord) => ({ ...record, lifepath: Life2 }),            'a lifepath not its lifeseq'],
    [(record: BankRecord) => TH.omitting(record, 'lifetok'),              'no lifetok'],
    [(record: BankRecord) => ({ ...record, lifetok: 'not-a-uuid' }),      'a lifetok that is not a UUID'],
    [(record: BankRecord) => ({ ...record, labelpath: 'gate' }),          'the labelpath of another kind'],
    [(record: BankRecord) => ({ ...record, vaultlabel: 'main' }),         'a field no bank Thing has'],
    [(record: BankRecord) => ({ ...record, rootBox: TH.rootBoxOf() }),    'its root box beside its fields'],
    [(record: BankRecord) => ({ ...record, born_at: 'yesterday' }),       'a born_at that is not epoch millis'],
    [() => null,                                                          'null'],
  ] as const

  for (const [recordOf, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, async () => {
      const born = await TH.buildBornBank()
      TH.expectSyncRefusal(() => Bank.make(recordOf(born.record) as never, { device: born.device }), 'bad_record')
    })
  }

  const OtherDeviceCases = [
    [{ userid: 'u2' },      "userid",    "another user's device"],
    [{ banklabel: 'work' }, "banklabel", "a device of the user's other bank"],
  ] as const

  for (const [moved, fieldname, blurb] of OtherDeviceCases) {
    it(`refuses ${blurb}`, async () => {
      const born = await TH.buildBornBank()
      const device = TH.makeDevice(moved)
      const err = TH.expectSyncRefusal(() => Bank.make(born.record, { device }), 'record_conflict')
      expect(err.meta).to.deep.equal({ fieldnames: [fieldname] })
    })
  }

  it("reads its root box from its world, as the world hears of newer roots", async () => {
    const { bank, device } = await TH.buildBornBank()
    const root = TH.nextOf(bank.rootBox)
    await TH.expectGood(device.vaultDB.tryWriteThing(TH.replaceAskOf(bank.rootBox, root)))
    await TH.eventually(() => bank.rootBox.revtok === root.revtok)
    expect(bank.rootBox).to.deep.equal(root)
    expect(bank.rootBox).to.equal(device.world.rootBox?.pickle())
  })

  it("refuses no opts at all", async () => {
    const { record } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => Bank.make(record, undefined as never), 'bad_record')
  })

  it("pickles to the very record it was made from", () => {
    const record = TH.bankThingOf()
    expect(Bank.make(record, { device: TH.makeDevice() }).pickle()).to.eq(record)
  })
})

describe("a bank over the shell or a tombstone", () => {
  /** A bank of `record`, the bank's shell or a tombstone, made on a device that has heard of no world. */
  function makeBankOf(record: BankRecord | ShellOf<BankRecord>): Bank {
    const device = TH.makeDevice()
    return Bank.make(record, { device })
  }

  /** A whole tombstone of the bank, in its second life. */
  const BankTombstone = TH.bankThingOf({ am: 'x', lifeseq: Life1, lifepath: Life1, revtok: TH.revtokOf('gone'), revseq: 1, written_at: TH.T0 + 1 })

  const RefusingCalls = [
    [(bank: Bank) => bank.stamp,                                                           'its stamp'],
    [(bank: Bank) => bank.rootBox,                                                         'its root box'],
  ] as const

  for (const [call, blurb] of RefusingCalls) {
    it(`refuses ${blurb} over the shell and over a tombstone`, () => {
      TH.expectSyncRefusal(() => call(makeBankOf(TH.bankShellOf())), 'absent_thing')
      TH.expectSyncRefusal(() => call(makeBankOf(BankTombstone)), 'absent_thing')
    })
  }

  it("refuses a put, a seal and an unseal over the shell, and its try forms resolve the refusal", async () => {
    const bank = makeBankOf(TH.bankShellOf())
    await TH.expectRefusal(bank.put({ cited: TH.bankShellOf(), record: TH.bankThingOf() }), 'absent_thing')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'absent_thing')
    await TH.expectRefusal(bank.unsealBox(TH.boxThingOf()), 'absent_thing')
    expect(await bank.trySealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })).to.deep.include({ ok: false })
    expect(await bank.tryUnsealBox(TH.boxThingOf())).to.deep.include({ ok: false })
  })

  it("is made from the shell with no world heard of, which it pickles to, with no lifetok and the scope and citation of the shell", () => {
    const bank = makeBankOf(TH.bankShellOf())
    expect(bank.pickle()).to.deep.equal(TH.bankShellOf())
    expect(bank.lifetok).to.be.undefined
    expect(bank.scope).to.deep.equal(TH.ThingBank)
    expect(bank.citable).to.deep.equal(Thing.sparseOf(TH.bankShellOf()))
    expect([bank.isLocked, bank.isEnabled, bank.modelkind]).to.deep.equal([true, true, 'bank'])
    TH.expectSyncRefusal(() => bank.gate, 'absent_thing')
  })

  it("is made from a whole tombstone, which keeps the lifetok of the life it ends", () => {
    const bank = makeBankOf(BankTombstone)
    expect(bank.pickle()).to.deep.equal(BankTombstone)
    expect(bank.lifetok).to.eq(BankTombstone.lifetok)
  })

  it("refuses a shell of another bank than its device's", () => {
    TH.expectSyncRefusal(() => makeBankOf({ ...TH.bankShellOf(), userid: 'u2' }), 'record_conflict')
  })

  it("receives a whole live record over the shell, and then answers its stamp and lifetok", () => {
    const bank = makeBankOf(TH.bankShellOf())
    const record = TH.bankThingOf()
    bank.receive(TH.thingEventOf(record))
    expect(bank.pickle()).to.equal(record)
    expect(bank.stamp).to.deep.equal(TH.WorldBankStamp)
    expect(bank.lifetok).to.eq(record.lifetok)
  })
})

describe("bank.lock() and bank.sweep()", () => {
  it("locks, evicting its lease, and locks again with nothing to evict", async () => {
    const { bank } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    expect(bank.lock()).to.equal(bank)
    expect(bank.isLocked).to.be.true
    bank.lock()
    expect(evict).toHaveBeenCalledTimes(1)
  })

  it("sweeps its lease and disables the bank for good, leaving its device enabled, and never throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    const sweep = vi.spyOn(Lease.prototype, 'sweep')
    expect(bank.sweep()).to.equal(bank)
    expect(sweep).toHaveBeenCalledTimes(1)
    expect(bank.isLocked).to.be.true
    expect(bank.isEnabled).to.be.false
    expect(bank.endCause).to.include({ refusalkind: 'disabled' })
    expect(device.isEnabled).to.be.true
    expect(bank.sweep()).to.equal(bank)
    expect(sweep).toHaveBeenCalledTimes(1)
  })

  it("refuses every call that needs it enabled once swept", async () => {
    const { bank } = await TH.buildBornBank()
    bank.sweep()
    TH.expectSyncRefusal(() => bank.demandEnabled(), 'disabled')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    await TH.expectRefusal(bank.put({ cited: bank.pickle(), record: nextBankThingOf(bank) }), 'disabled')
  })

  it("hosts only a vault, with a sweep to call, and only while enabled", async () => {
    const { bank } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => { bank.hostVault({} as never) }, 'bad_record')
    TH.expectSyncRefusal(() => { bank.hostVault(null as never) }, 'bad_record')
    bank.sweep()
    TH.expectSyncRefusal(() => { bank.hostVault({ sweep: vi.fn() }) }, 'disabled')
  })

  it("sweeps each vault it hosts once, as it is swept, and lets them go", async () => {
    const { bank, device } = await TH.buildBornBank()
    const hosted = { sweep: vi.fn(() => { expect(bank.isEnabled).to.be.false }) }
    bank.hostVault(hosted)
    bank.sweep()
    device.sweep()
    expect(hosted.sweep).toHaveBeenCalledOnce()
  })

  it("is swept once its device is swept, the device staying enabled", async () => {
    const { bank, device } = await TH.buildBornBank()
    device.sweep()
    expect(bank.isEnabled).to.be.false
    expect(bank.endCause).to.include({ refusalkind: 'disabled' })
    expect(device.isEnabled).to.be.true
  })
})

describe("bank.getSnapshot() and bank.subscribe(listener)", () => {
  it("shows a born bank unlocked, its lease ending the device's lease length after it was proved", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(bank.getSnapshot()).to.deep.equal({ stage: 'unlocked', isLocked: false, isEnded: false, endCause: null, leaseEndsAt: TH.T0 + device.leaseMillis, lastErr: null, isUnlockWanted: false })
    expect(Object.isFrozen(bank.getSnapshot())).to.be.true
  })

  it("tells its subscribers once each for a lock, an `unlock` gating and a sweep, the snapshot the same object between them", async () => {
    const { bank } = await TH.buildBornBank()
    const counter = TH.countCalls(bank.subscribe)
    const unlocked = bank.getSnapshot()
    expect(bank.getSnapshot()).to.equal(unlocked)

    bank.lock()
    const locked = bank.getSnapshot()
    expect(counter.calls).to.eq(1)
    expect(locked).to.deep.equal({ stage: 'locked', isLocked: true, isEnded: false, endCause: null, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(bank.getSnapshot()).to.equal(locked)

    await bank.gate.gatingUnlockAttempt({ passphrase: TH.TestPassphrase })
    expect(counter.calls).to.eq(2)
    expect(bank.getSnapshot()).to.deep.equal(unlocked)

    bank.sweep()
    expect(counter.calls).to.eq(3)
    expect(bank.getSnapshot()).to.deep.equal({ stage: 'swept', isLocked: true, isEnded: true, endCause: bank.endCause, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(bank.getSnapshot().endCause).to.equal(bank.endCause).and.include({ refusalkind: 'disabled' })
  })

  it("tells no subscriber of a call that changes nothing in the snapshot: a second lock or sweep, a wrong passphrase, or a box landing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const counter = TH.countCalls(bank.subscribe)
    const unlocked = bank.getSnapshot()
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(bank.getSnapshot()).to.equal(unlocked)
    bank.lock()
    bank.lock()
    await TH.expectRefusal(bank.gate.gatingUnlockAttempt({ passphrase: 'not the passphrase' }), 'wrong_passphrase')
    expect(counter.calls).to.eq(1)
    bank.sweep()
    bank.sweep()
    expect(counter.calls).to.eq(2)
  })

  it("shows the bank swept once its device is swept", async () => {
    const { bank, device } = await TH.buildBornBank()
    const counter = TH.countCalls(bank.subscribe)
    device.sweep()
    expect(counter.calls).to.eq(1)
    expect(bank.getSnapshot()).to.include({ stage: 'swept', isEnded: true, endCause: bank.endCause })
  })

  it("leaves its snapshot unchanged once swept, telling no subscriber of a lock or of its device's sweep", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.sweep()
    const swept = bank.getSnapshot()
    const counter = TH.countCalls(bank.subscribe)
    bank.lock()
    device.sweep()
    expect(counter.calls).to.eq(0)
    expect(bank.getSnapshot()).to.equal(swept)
    expect(swept.endCause).to.equal(bank.endCause)
  })

  it("shows only stages that bankStageVals lists", async () => {
    const { bank } = await TH.buildBornBank()
    const snapshots = [bank.getSnapshot()]
    bank.lock()
    snapshots.push(bank.getSnapshot())
    bank.sweep()
    snapshots.push(bank.getSnapshot())
    expect(snapshots.map(({ stage }) => stage)).to.deep.equal(['unlocked', 'locked', 'swept'])
    expect(bankStageVals).to.include.members(snapshots.map(({ stage }) => stage))
  })

  it("stops telling a listener once it unsubscribes", async () => {
    const { bank } = await TH.buildBornBank()
    const listener = vi.fn()
    const unsubscribe = bank.subscribe(listener)
    bank.lock()
    unsubscribe()
    bank.sweep()
    expect(listener).toHaveBeenCalledOnce()
  })

  it("tells every subscriber when one throws, and passes the throw to the device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.subscribe(() => { throw new Error('a bug in the host') })
    const listener = vi.fn()
    bank.subscribe(listener)
    bank.lock()
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'unexpected_error' })
  })

  it("refuses a listener that is not a function", async () => {
    const { bank } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => bank.subscribe('call me' as never), 'bad_record')
  })
})

describe("bank.sealBox(donor, publicProps, secretProps) and bank.unsealBox(box)", () => {
  it("seals a new box over its shell: the first revision of its first life, born now", async () => {
    const { bank } = await TH.buildBornBank()
    vi.setSystemTime(TH.T0 + 7)
    const shell = TH.boxShellOf()
    const box = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(box).to.include({ labelpath: 'box/anthropic_api_key', am: 'a', revseq: 0, lifeseq: Life0, lifepath: `${Life0}/${Life0}`, born_at: TH.T0 + 7, written_at: TH.T0 + 7 })
    expect(box.revtok).to.not.eq(shell.revtok)
    expect(box.sidecar).to.deep.equal(TH.Sidecar)
    expect(box.whisper_sealed).to.include({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect(JSON.stringify(box)).to.not.include('sk-test-0000')
    expect(BoxChecks.record.parse(box)).to.deep.equal(box)
  })

  it("unseals the box's whisper in place of its sealed one", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const unsealed = await bank.unsealBox(box)
    const { whisper_sealed: _sealed, ...rest } = box
    expect(unsealed).to.deep.equal({ ...rest, whisper: TH.Whisper })
    expect(Object.isFrozen(unsealed)).to.be.true
  })

  it("seals the next revision of a live box, in the same life, from the stored box with a new sidecar", async () => {
    // sealBox @example
    const { bank } = await TH.buildBornBank()
    const first = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 9)
    const next = await bank.sealBox(first, { sidecar: { account: 'home' } }, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ lifeseq: first.lifeseq, lifepath: first.lifepath, born_at: first.born_at, revseq: 1, written_at: TH.T0 + 9, am: 'a' })
    expect(next.revtok).to.not.eq(first.revtok)
    expect(await bank.unsealBox(next)).to.deep.include({ whisper: { apiKey: 'sk-test-1111' }, sidecar: { account: 'home' } })
  })

  it("seals the same whisper differently each time: a fresh part key and cipher iv", async () => {
    const { bank } = await TH.buildBornBank()
    const shell = TH.boxShellOf()
    const one = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const two = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(one.whisper_sealed.ciphered.ciphertext_b64).to.not.eq(two.whisper_sealed.ciphered.ciphertext_b64)
    expect(one.whisper_sealed.key_wrapped.ciphertext_b64).to.not.eq(two.whisper_sealed.key_wrapped.ciphertext_b64)
  })

  it("unseals a box sealed before the bank locked and unlocked again", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    const { whisper } = await bank.unsealBox(box)
    expect(whisper).to.deep.equal(TH.Whisper)
  })

  // The seal leaves the sidecar out.
  it("unseals with its sidecar altered", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const unsealed = await bank.unsealBox({ ...box, sidecar: { account: 'home' } })
    expect(unsealed).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  // Each alteration still passes the box's check, so only the seal can catch it. The box's userid and banklabel are bound
  // too, but a box claiming another bank is refused before the unseal, below.
  const AlteredCases = [
    [(box: LiveOf<BoxRecord>) => ({ ...box, revtok: TH.OtherRevtok }),                          'its revtok'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, revseq: box.revseq + 1 }),                                             'its revseq'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, born_at: box.born_at + 1 }),                                           'its born_at'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, written_at: box.written_at + 1 }),                                     'its written_at'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, labelpath: 'box/openai_api_key', label: 'openai_api_key' }),           'its labelpath and label'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, lifeseq: Life2, lifepath: `${Life0}/${Life2}` }),                       'its lifeseq'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, codectag: 'json_v2' } }),     'its codectag'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, schematag: 'whisper_v2' } }), 'its schematag'],
  ] as const

  for (const [alter, blurb] of AlteredCases) {
    it(`refuses 'damaged_whisper' for a box with ${blurb} altered`, async () => {
      const { bank } = await TH.buildBornBank()
      const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox(alter(box)), 'damaged_whisper')
    })
  }

  const UncheckedCases = [
    [(box: LiveOf<BoxRecord>) => ({ ...box, fmt: 'a010502' }),                                                 'its fmt not its one value'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, am: 'd' }),                                                        'am d'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, label: 'openai_api_key' }),                                        'a label not the last of its labelpath'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, codectag: 'JSON v1' } }), 'a codectag that is not a label'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, extra: 'field' } }),      'a field no sealed part has'],
    [(box: LiveOf<BoxRecord>) => TH.omitting(box, 'whisper_sealed'),                                           'no sealed whisper'],
    [() => null,                                                                                       'null'],
  ] as const

  for (const [alter, blurb] of UncheckedCases) {
    it(`refuses a box with ${blurb}, before unsealing`, async () => {
      const { bank } = await TH.buildBornBank()
      const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(bank.unsealBox(alter(box) as never), 'bad_record')
    })
  }

  it("refuses 'damaged_whisper' for one box's sealed whisper on another box", async () => {
    const { bank } = await TH.buildBornBank()
    const one = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const two = await bank.sealBox(TH.boxShellOf({ labelpath: 'box/openai_api_key', label: 'openai_api_key' }), { sidecar: TH.Sidecar }, { whisper: { apiKey: 'sk-test-2222' } })
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: one.whisper_sealed }), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: { ...two.whisper_sealed, ciphered: one.whisper_sealed.ciphered } }), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: { ...two.whisper_sealed, key_wrapped: one.whisper_sealed.key_wrapped } }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for tampered ciphertext, quoting none of it", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const ciphertext_b64 = TH.tweakB64(box.whisper_sealed.ciphered.ciphertext_b64)
    const whisper_sealed = { ...box.whisper_sealed, ciphered: { ...box.whisper_sealed.ciphered, ciphertext_b64 } }
    const err = await TH.expectRefusal(bank.unsealBox({ ...box, whisper_sealed }), 'damaged_whisper')
    expect(TH.thrownText(err)).to.not.include(ciphertext_b64)
  })

  it("refuses 'damaged_whisper' for a box another bank of the same stamp sealed", async () => {
    const { bank } = await TH.buildBornBank()
    const { bank: other } = await TH.buildBornBank()
    const box = await other.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(bank.unsealBox(box), 'damaged_whisper')
    expect(bank.isUnlocked).to.be.true
  })

  const OtherBanks = [
    [{ userid: 'u2' },       "another user's"],
    [{ banklabel: 'other' }, 'another banklabel'],
  ] as const

  for (const [moved, blurb] of OtherBanks) {
    it(`refuses 'record_conflict' at the seal, the tombstone and the unseal for a box claiming ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(TH.boxShellOf(moved), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'record_conflict')
      const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(bank.sealBox({ ...box, ...moved }, { am: 'x' }), 'record_conflict')
      await TH.expectRefusal(bank.unsealBox({ ...box, ...moved }), 'record_conflict')
      expect(bank.isUnlocked).to.be.true
    })
  }

  // A box sealed under another life of the bank's root box would refuse 'damaged_whisper' at the unseal, as its root
  // lifeseq is bound; the bank refuses it before any seal.
  it("refuses at the seal, the tombstone and the unseal a box under another life of the root box", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf({ lifepath: `${Life2}/${Shell.VoidLifeseq}` }), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'record_conflict')
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const moved = { lifepath: `${Life2}/${box.lifeseq}` }
    await TH.expectRefusal(bank.sealBox({ ...box, ...moved }, { am: 'x' }), 'record_conflict')
    await TH.expectRefusal(bank.unsealBox({ ...box, ...moved }), 'record_conflict')
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses 'bank_locked' at the seal, the tombstone and the unseal once the bank locks", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    await TH.expectRefusal(bank.unsealBox(box), 'bank_locked')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectRefusal(bank.sealBox(box, { am: 'x' }), 'bank_locked')
  })

  it("refuses at the seal, the tombstone and the unseal on a swept device", async () => {
    const { bank, device } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    device.sweep()
    await TH.expectRefusal(bank.unsealBox(box), 'disabled')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    await TH.expectRefusal(bank.sealBox(box, { am: 'x' }), 'disabled')
  })

  const DonorCases = [
    [() => ({ ...TH.boxShellOf(), am: 'd' }),                'a donor of a damaged row'],
    [() => ({ ...TH.boxShellOf(), revseq: 0 }),              'half the shell: its revseq moved, its revtok and lifeseq not'],
    [() => ({ ...TH.boxShellOf(), labelpath: 'gate/main' }), 'a donor of another kind'],
    [() => ({ ...TH.boxShellOf(), revseq: -2 }),             'a revseq below the shell'],
    [() => null,                                             'null'],
  ] as const

  for (const [donorOf, blurb] of DonorCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(donorOf() as never, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_record')
    })
  }

  it("refuses a misspelt key in publicProps, and a key beside the whisper in secretProps", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidcar: TH.Sidecar } as never, { whisper: TH.Whisper }), 'bad_record')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper, sidecar: TH.Sidecar } as never), 'bad_record')
  })

  it("refuses to seal a box when neither the donor nor publicProps has a sidecar", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), {}, { whisper: TH.Whisper }), 'bad_record')
  })

  const WhisperCases = [
    [{ whisper: 'sk-test-0000' },    'a whisper that is a string'],
    [{ whisper: null },              'a null whisper'],
    [{},                             'no whisper'],
    [null,                           'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of WhisperCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { bank } = await TH.buildBornBank()
      await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, cleartexts as never))
    })
  }
})

describe("bank.sealBox(donor, { am: 'x' }), and the unseal of a tombstone", () => {
  it("makes the tombstone of a live box: its next revision, at the next lifeseq, with the sidecar `{}`, born when the box was", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 11)
    const tombstone = await bank.sealBox(box, { am: 'x' })
    expect(tombstone).to.include({ am: 'x', revseq: box.revseq + 1, lifeseq: Life1, lifepath: `${Life0}/${Life1}`, born_at: box.born_at, written_at: TH.T0 + 11 })
    expect(tombstone.revtok).to.not.eq(box.revtok)
    expect(tombstone.sidecar).to.deep.equal({})
    expect(tombstone.whisper_sealed).to.include({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect(BoxChecks.record.parse(tombstone)).to.deep.equal(tombstone)
  })

  it("writes the tombstone at the written_at given, and seals it: a tombstone whose written_at moved will not unseal", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await bank.sealBox(box, { written_at: TH.T0 + 21, am: 'x' })
    expect(tombstone).to.include({ am: 'x', written_at: TH.T0 + 21 })
    expect(await bank.unsealBox(tombstone)).to.deep.include({ whisper: {} })
    await TH.expectRefusal(bank.unsealBox({ ...tombstone, written_at: TH.T0 + 22 }), 'damaged_whisper')
  })

  it("refuses a tombstone given secret props", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(bank.sealBox(box, { am: 'x' }, { whisper: TH.Whisper }), 'bad_record')
  })

  it("writes a tombstone given the sidecar `{}`, a tombstone's own", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await bank.sealBox(box, { sidecar: {}, am: 'x' })
    expect(tombstone).to.deep.include({ am: 'x', sidecar: {} })
  })

  it("refuses a tombstone given any other sidecar", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(bank.sealBox(box, { sidecar: TH.Sidecar, am: 'x' }), 'bad_record')
  })

  it("unseals a tombstone to its Thing fields and an empty whisper", async () => {
    const { bank } = await TH.buildBornBank()
    const live = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await bank.sealBox(live, { am: 'x' })
    const { whisper_sealed: _sealed, ...rest } = tombstone
    expect(await bank.unsealBox(tombstone)).to.deep.equal({ ...rest, whisper: {} })
  })

  it("starts the box's next life over its tombstone, born now", async () => {
    const { bank } = await TH.buildBornBank()
    const live = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await bank.sealBox(live, { am: 'x' })
    vi.setSystemTime(TH.T0 + 13)
    const reborn = await bank.sealBox(tombstone, { sidecar: { account: 'home' } }, { whisper: TH.Whisper })
    expect(reborn).to.include({ am: 'a', revseq: tombstone.revseq + 1, lifeseq: Life2, lifepath: `${Life0}/${Life2}`, born_at: TH.T0 + 13 })
    expect(await bank.unsealBox(reborn)).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  it("refuses the tombstone of a tombstone or of the shell", async () => {
    const { bank } = await TH.buildBornBank()
    const live = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await bank.sealBox(live, { am: 'x' })
    await TH.expectRefusal(bank.sealBox(tombstone, { am: 'x' }), 'bad_record')
    await TH.expectRefusal(bank.sealBox(TH.boxShellOf(), { am: 'x' }), 'bad_record')
  })

  // A tombstone's seal is its sealed empty whisper, and the unseal is its check.
  it("refuses 'damaged_whisper' for a tombstone made up without the bankKey, or sealed with its live box's seal", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const madeUp = { ...box, sidecar: {}, revtok: TH.revtokOf('madeup'), revseq: box.revseq + 1, am: 'x', lifeseq: Life1, lifepath: `${Life0}/${Life1}`, whisper_sealed: TH.FakeSealed } as const
    await TH.expectRefusal(bank.unsealBox(madeUp), 'damaged_whisper')
    await TH.expectRefusal(bank.unsealBox({ ...madeUp, whisper_sealed: box.whisper_sealed }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for a tombstone carrying another tombstone's seal", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const one = await bank.sealBox(box, { am: 'x' })
    const two = await bank.sealBox(box, { am: 'x' })
    await TH.expectRefusal(bank.unsealBox({ ...two, whisper_sealed: one.whisper_sealed }), 'damaged_whisper')
  })

  const AlteredCases = [
    [(tombstone: TombstoneOf<BoxRecord>) => ({ ...tombstone, revtok: TH.OtherRevtok }),          'its revtok'],
    [(tombstone: TombstoneOf<BoxRecord>) => ({ ...tombstone, written_at: tombstone.written_at + 1 }),            'its written_at'],
    [(tombstone: TombstoneOf<BoxRecord>) => ({ ...tombstone, lifeseq: Life3, lifepath: `${Life0}/${Life3}` }),   'its lifeseq'],
  ] as const

  for (const [alter, blurb] of AlteredCases) {
    it(`refuses 'damaged_whisper' for a tombstone with ${blurb} altered`, async () => {
      const { bank } = await TH.buildBornBank()
      const live = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      const tombstone = await bank.sealBox(live, { am: 'x' })
      await TH.expectRefusal(bank.unsealBox(alter(tombstone)), 'damaged_whisper')
    })
  }
})

/** The revision of `bank`'s Thing after the one in hand, written a millisecond later. */
function nextBankThingOf(bank: TH.LiveBank) {
  return { ...bank.pickle(), revtok: Crypto.randomId(), revseq: bank.revseq + 1, written_at: bank.written_at + 1 }
}

describe("bank.trySealBox(donor, publicProps, secretProps) and bank.tryUnsealBox(box)", () => {
  it("resolve a good outcome of what sealBox and unsealBox resolve, and the refusal they throw", async () => {
    const { bank } = await TH.buildBornBank()
    const box = await TH.expectGood(bank.trySealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    expect(await TH.expectGood(bank.tryUnsealBox(box))).to.deep.include({ whisper: TH.Whisper })
    bank.lock()
    await TH.expectBad(bank.trySealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectBad(bank.tryUnsealBox(box), 'bank_locked')
  })
})

describe("the bank's world, beside the bank's own writes", () => {
  it("has the bank's Thing that bank.put wrote once it resolves", async () => {
    const { bank, device } = await TH.buildBornBank()
    const written = await bank.put({ cited: bank.pickle(), record: nextBankThingOf(bank) })
    expect(device.bankMinder.worldAt()?.bank).to.deep.equal(written)
  })

  it("has the main gate a gate verb wrote once the verb resolves", async () => {
    const { bank, device } = await TH.buildBornBank()
    const after = await bank.gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'another horse battery staple' })
    expect(device.bankMinder.worldAt()?.gate).to.deep.equal(after.pickle())
  })
})

describe("bank.tellBadNews(badnews)", () => {
  it("passes the news to its device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews.mock.calls[0]?.[0]).to.deep.include({ device: bank.device })
  })
})

describe("bank.put(args)", () => {
  it("writes the bank's next revision, answering the stored bank", async () => {
    const { bank, device } = await TH.buildBornBank()
    const record = nextBankThingOf(bank)
    expect(await bank.put({ cited: bank.pickle(), record })).to.deep.equal(record)
    const got = await device.vaultDB.tryGetThing(getAskOf({ ...bank.scope, labelpath: 'bank' }))
    expect(got).to.deep.include({ ok: true, val: record })
  })

  it("models the revision written once it resolves", async () => {
    const { bank } = await TH.buildBornBank()
    const record = nextBankThingOf(bank)
    await bank.put({ cited: bank.pickle(), record })
    expect(bank.pickle()).to.deep.equal(record)
  })

  it("throws the vaultDB's refusal of a revision it does not cite", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.put({ cited: { ...bank.pickle(), revtok: TH.revtokOf('stale') }, record: nextBankThingOf(bank) }))
    expect(await bank.put({ cited: bank.pickle(), record: nextBankThingOf(bank) })).to.include({ revseq: 1 })
  })

  it("refuses a record of another bank, writing nothing", async () => {
    const { bank, device } = await TH.buildBornBank()
    const record = { ...nextBankThingOf(bank), banklabel: 'work' }
    await TH.expectRefusal(bank.put({ cited: { ...bank.pickle(), banklabel: 'work' }, record }))
    const got = await device.vaultDB.tryGetThing(getAskOf({ ...bank.scope, labelpath: 'bank' }))
    expect(got).to.deep.include({ ok: true, val: bank.pickle() })
  })

  it("leaves its world's asks tracking the bank it wrote, which the answer then reports the same", async () => {
    const { bank, device } = await TH.buildBornBank()
    const record = nextBankThingOf(bank)
    await bank.put({ cited: bank.pickle(), record })
    const sortedVaultDB = device.world.demandSortedVaultDB()
    expect(sortedVaultDB.makeGetAsk({ labelpath: 'bank' }).track?.bank).to.deep.equal({ revseq: 1, lifepath: record.lifepath })
    const answer = await device.vaultDB.tryGetThing(sortedVaultDB.makeGetAsk({ labelpath: 'bank' }))
    expect(answer).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: 'same' } })
  })

  it("refuses once its device is swept, before it reaches the vaultDB", async () => {
    const { bank, device } = await TH.buildBornBank()
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    device.sweep()
    const err = await TH.expectRefusal(bank.put({ cited: bank.pickle(), record: nextBankThingOf(bank) }), 'disabled')
    expect(err).to.equal(bank.endCause)
    expect(tryWriteThing).not.toHaveBeenCalled()
  })
})
