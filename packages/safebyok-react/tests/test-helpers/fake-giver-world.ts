/** A fake Device for the giver's tests: its bank started on demand, box records the test stores and announces, and form verbs' gatings that record what they are handed. */

import { type BankSnapshot, type DeviceSnapshot, type Gating, type PassphraseVerdict, PendingBank, Shell } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { boxRecordQueryKey } from '../../src/giver/react-giver'
import type { GiverBank, GiverDevice, GiverEvent } from '../../src/giver/shapes-giver'

/** A box record as the fake vaultDB stores it: a Thing's scope and revision, enough for the giver to tell revisions apart. */
export type FakeBoxRecord = Readonly<{
  userid: string, banklabel: string, labelpath: string, revtok: string, revseq: number, am: 'a' | 'x', lifepath: string,
  sidecar?: Readonly<{ mask: string }>,
}>

/** The lifepath of every fake box: its first life, under the root box's first. */
const FakeLifepath = '0000000000/0000000000'

/** A fake box record of user `u1`'s bank `acme` at `labelpath`, of revision `revseq`. */
export function fakeBoxRecordOf(labelpath: string, revseq: number): FakeBoxRecord {
  const revtok = `11111111-1111-4111-8111-${String(revseq).padStart(12, '0')}`
  return Object.freeze({ userid: 'u1', banklabel: 'acme', labelpath, revtok, revseq, am: 'a', lifepath: FakeLifepath, sidecar: Object.freeze({ mask: `****${String(revseq)}` }) })
}

/** The shell of the box at `labelpath`, where none is stored. */
export function fakeShellOf(labelpath: string): FakeBoxRecord {
  return Object.freeze({ userid: 'u1', banklabel: 'acme', labelpath, ...Shell.childCited('0000000000') })
}

/** The snapshot of an unlocked bank whose lease runs a while yet. */
export const UnlockedBank: BankSnapshot = Object.freeze({
  stage: 'unlocked', isLocked: false, isEnded: false, endCause: null, leaseEndsAt: 1_800_000_000_000, lastErr: null, isUnlockWanted: false,
})

/** The verbs of a giver's bank that a form calls. */
export type FakeFormVerb = 'birth' | 'unlock' | 'replacePassphrase' | 'addPasskey' | 'revokePasskey' | 'dismissUnlock'

/** The fake strength checker's verdict: strong at twelve characters or more. */
export function fakeVerdictOf(passphrase: string): PassphraseVerdict {
  return (passphrase.length >= 12) ? { strong: true } : { strong: false, reason: 'Twelve characters or more, please.' }
}

/** A fake Device, and the test's ways past it. */
export interface FakeGiverWorld {
  device:  GiverDevice<FakeBoxRecord>
  /** Each labelpath's record as the vaultDB would answer it now. A labelpath left out answers the shell. */
  stored:  Map<string, FakeBoxRecord>
  /** How many records the bank objects have asked the vaultDB for. */
  counts:  { gets: number }
  /** Each form verb attempted on the bank objects, in order, with a copy of the cleartexts its gating had, and dismissUnlock. */
  formCalls: Readonly<{ verb: FakeFormVerb, cleartexts: unknown }>[]
  /** Pause each record the vaultDB reads from now on until the function returned is called: it then answers what it read. */
  pauseAnswers(): () => void
  /** Pause each strength verdict from now on until the function returned is called. */
  pauseVerdicts(): () => void
  /** Have each form verb from now on reject with `err`, or resolve again for null. */
  refuseFormVerbs(err: Error | null): void
  /** Have each strength verdict from now on reject with `err`, or land again for null. */
  refuseVerdicts(err: Error | null): void
  /** Replace the Device's snapshot of its bank. */
  _cheat_setBank(snapshot: BankSnapshot): void
  /** Announce `record` to the bank object's listeners, as its minder would on caching it in its item at `dataUpdatedAt`. */
  _cheat_hear(labelpath: string, record: FakeBoxRecord, dataUpdatedAt?: number): void
  /** Announce that the minder's item at `labelpath` fell behind a newer revision, as its minder would on a newer sparse record. */
  _cheat_hearBehind(labelpath: string): void
  /** Announce `sparse` in the minder's soon at `labelpath`, newer than its item, which is behind it until a get answers a record no older; tell nothing of the item. */
  _cheat_hearSoon(labelpath: string, sparse: FakeBoxRecord): void
  /** Announce that the minder let go of the item at `labelpath`. */
  _cheat_hearRemoved(labelpath: string): void
  /** End the bank object: the next ensureBank starts another, with nothing cached. */
  _cheat_endBank(): void
}

/** A fake Device for user `u1` and bank `acme`, no bank object started, and nothing stored. */
export function makeFakeGiverWorld(): FakeGiverWorld {
  type Starter = (bank: GiverBank<FakeBoxRecord>) => () => void
  const userid    = 'u1'
  const banklabel = 'acme'
  let snapshot: DeviceSnapshot = Object.freeze({ bank: PendingBank })
  let answerPause:    Promise<void> | null = null
  let verdictPause:   Promise<void> | null = null
  let formRefusal:    Error | null = null
  let verdictRefusal: Error | null = null
  let bank: GiverBank<FakeBoxRecord> | null = null
  const deviceListeners = new Set<() => void>()
  const itemListeners   = new Set<(event: GiverEvent) => void>()
  // For each starter, the function it returned for the bank object it was handed, or null for none.
  const endings         = new Map<Starter, (() => void) | null>()
  const stored          = new Map<string, FakeBoxRecord>()
  // Each labelpath's record as the minder's item last had it: by a get, or from a notice.
  const cached          = new Map<string, FakeBoxRecord>()
  // Each labelpath whose item fell behind a newer revision, until a get or a record received catches it up.
  const behind          = new Set<string>()
  // Each labelpath's soon, as `_cheat_hearSoon` announced it: a get that answers an older record leaves the item behind it.
  const soons           = new Map<string, FakeBoxRecord>()
  const counts          = { gets: 0 }
  const formCalls: FakeGiverWorld['formCalls'] = []

  function publish(next: DeviceSnapshot): void {
    snapshot = Object.freeze(next)
    for (const listener of deviceListeners) { listener() }
  }

  function emit(event: GiverEvent): void {
    for (const listener of itemListeners) { listener(event) }
  }

  // As the minder's get does, an item in hand that is not behind answers at once.
  async function getBoxRecord(labelpath: string): Promise<FakeBoxRecord> {
    const held = cached.get(labelpath)
    if ((held !== undefined) && (! behind.has(labelpath))) { return held }
    counts.gets += 1
    const record = stored.get(labelpath) ?? fakeShellOf(labelpath)
    if (answerPause !== null) { await answerPause }
    cached.set(labelpath, record)
    if (record.revseq >= (soons.get(labelpath)?.revseq ?? -1)) { behind.delete(labelpath); soons.delete(labelpath) }
    return record
  }

  // As the bank's verbs do, it answers once the verb is done, or rejects with the refusal. The copy outlives the gating's vacate.
  async function hearForm(verb: FakeFormVerb, cleartexts: unknown): Promise<void> {
    formCalls.push(Object.freeze({ verb, cleartexts: structuredClone(cleartexts) }))
    await Promise.resolve()
    if (formRefusal !== null) { throw formRefusal }
  }

  function gatingHeardAs(verb: FakeFormVerb, cleartexts: unknown): Gating {
    return LeanTH._cheat_gatingOf(cleartexts, (adopted) => hearForm(verb, adopted))
  }

  async function judgeStrength(passphrase: string): Promise<PassphraseVerdict> {
    if (verdictPause !== null) { await verdictPause }
    if (verdictRefusal !== null) { throw verdictRefusal }
    return fakeVerdictOf(passphrase)
  }

  function startBank(): GiverBank<FakeBoxRecord> {
    const started: GiverBank<FakeBoxRecord> = Object.freeze({
      getBoxRecord,
      isBoxRecordBehind: (labelpath: string) => behind.has(labelpath),
      listenBoxRecords:  (listener: (event: GiverEvent) => void) => {
        itemListeners.add(listener)
        return () => { itemListeners.delete(listener) }
      },
      birthGating:             (cleartexts: unknown) => gatingHeardAs('birth', cleartexts),
      unlockGating:            (cleartexts: unknown) => gatingHeardAs('unlock', cleartexts),
      replacePassphraseGating: (cleartexts: unknown) => gatingHeardAs('replacePassphrase', cleartexts),
      addPasskeyGating:        (cleartexts: unknown) => gatingHeardAs('addPasskey', cleartexts),
      revokePasskeyGating:     (cleartexts: unknown) => gatingHeardAs('revokePasskey', cleartexts),
      dismissUnlock:           () => { formCalls.push(Object.freeze({ verb: 'dismissUnlock', cleartexts: undefined })) },
    })
    bank = started
    for (const starter of endings.keys()) { endings.set(starter, starter(started)) }
    return started
  }

  const device: GiverDevice<FakeBoxRecord> = Object.freeze({
    userid,
    banklabel,
    subscribe: (listener: () => void) => {
      deviceListeners.add(listener)
      return () => { deviceListeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    judgeStrength,
    ensureBank:  () => Promise.resolve(bank ?? startBank()),
    onBankStart: (starter: Starter) => {
      endings.set(starter, (bank === null) ? null : starter(bank))
      return () => { endings.delete(starter) }
    },
  })

  return {
    device,
    stored,
    counts,
    formCalls,
    pauseAnswers: () => {
      let release!: () => void
      answerPause = new Promise<void>((resolve) => { release = resolve })
      return () => { answerPause = null; release() }
    },
    pauseVerdicts: () => {
      let release!: () => void
      verdictPause = new Promise<void>((resolve) => { release = resolve })
      return () => { verdictPause = null; release() }
    },
    refuseFormVerbs: (err) => { formRefusal = err },
    refuseVerdicts:  (err) => { verdictRefusal = err },
    _cheat_setBank:  (bankSnapshot) => { publish({ ...snapshot, bank: bankSnapshot }) },
    _cheat_hear:     (labelpath, record, dataUpdatedAt = Date.now()) => {
      cached.set(labelpath, record)
      behind.delete(labelpath)
      soons.delete(labelpath)
      emit({ eventkind: 'item', type: 'updated', action: { type: 'success' }, queryKey: boxRecordQueryKey({ userid, banklabel, labelpath }), userid, banklabel, labelpath, state: { data: record, dataUpdatedAt } })
    },
    _cheat_hearBehind: (labelpath) => {
      behind.add(labelpath)
      emit({ eventkind: 'item', type: 'updated', action: { type: 'invalidate' }, queryKey: boxRecordQueryKey({ userid, banklabel, labelpath }), userid, banklabel, labelpath, state: { data: cached.get(labelpath), dataUpdatedAt: 0 } })
    },
    _cheat_hearSoon: (labelpath, sparse) => {
      behind.add(labelpath)
      soons.set(labelpath, sparse)
      emit({ eventkind: 'soon', type: 'updated', action: { type: 'success' }, queryKey: soonQueryKeyOf({ userid, banklabel, labelpath }), userid, banklabel, labelpath, state: { data: sparse, dataUpdatedAt: Date.now() } })
    },
    _cheat_hearRemoved: (labelpath) => {
      const record = cached.get(labelpath)
      cached.delete(labelpath)
      emit({ eventkind: 'item', type: 'removed', action: undefined, queryKey: boxRecordQueryKey({ userid, banklabel, labelpath }), userid, banklabel, labelpath, state: { data: record, dataUpdatedAt: 0 } })
    },
    _cheat_endBank: () => {
      bank = null
      cached.clear()
      behind.clear()
      for (const [starter, ending] of endings) {
        ending?.()
        endings.set(starter, null)
      }
    },
  }
}

/** The key a minder caches the soon of the box at `scope` under: its item's key, with `'soon'` for `'item'` and `'~'` for `'!'`. */
function soonQueryKeyOf(scope: Readonly<{ userid: string, banklabel: string, labelpath: string }>): readonly unknown[] {
  const itemKey = boxRecordQueryKey(scope)
  return [...itemKey.slice(0, 3), 'soon', ...itemKey.slice(4, -1), '~']
}
