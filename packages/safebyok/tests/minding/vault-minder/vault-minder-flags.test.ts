import { isEqual } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import { VaultMinder } from '../../../src/minding/vault-minder'
import type { CitedOf } from '../../../src/shapes/shapes-asks'
import { type BoxRecord, Shell } from '../../../src/shapes/shapes-thing'
import type { WriteThingAnswer } from '../../../src/shapes/shapes-answers'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { cheatStored } from './tsq-world'

// == [The table]: Box0, Box1, Tomb2, Mine, Storeds, Citation, Citations, FlagCombos, PutFlagCases

// One history of the box at `TH.BoxScope`: its first revision, its second, and its tombstone. A record written over a
// citation is the next revision of what it cites, under a revtok of its own where it cites what is no longer stored.
const Box0  = TH.boxThingOf()
const Box1  = TH.nextOf(Box0)
const Tomb2 = TH.boxTombOf(Box1)
const Mine  = TH.revtokOf('mine')

/** What is stored at the box's labelpath before the put. */
const Storeds = { nothing: null, live: Box1, tombstone: Tomb2 } as const

/** What a put cites, and the record it writes over that citation. */
type Citation = readonly [CitedOf<BoxRecord>, BoxRecord]

/** Each {@link Citation} by the name the table gives it, for each stored. */
const Citations: Readonly<Record<keyof typeof Storeds, Readonly<Record<string, Citation>>>> = {
  nothing:   {
    void:    [Shell.childCited(TH.Life0), Box0],
  },
  live:      {
    void:    [Shell.childCited(TH.Life0), { ...Box0, revtok: Mine }],
    current: [TH.boxSparseOf(Box1),       TH.nextOf(Box1)],
    older:   [TH.boxSparseOf(Box0),       TH.nextOf(Box0, { revtok: Mine })],
  },
  tombstone: {
    void:    [Shell.childCited(TH.Life0), { ...Box0, revtok: Mine }],
    current: [Tomb2,                      TH.boxRebornOf(Tomb2)],
    older:   [TH.boxSparseOf(Box1),       TH.nextOf(Box1, { revtok: Mine })],
  },
}

/** The flags of each column of {@link PutFlagCases}, in order. */
const FlagCombos = [['add', 'repl'], ['add', 'fail'], ['add', 'get'], ['fail', 'repl'], ['fail', 'fail'], ['fail', 'get']] as const

// Each outcome is the act, then `val` for an answer that resolves or `dbhas` for one refused: `record`, the record
// written; `stored`, what was stored before; `shell`, the void record under the root box's life.
/** A put of the box under each pair of flags, over each thing stored and each citation that differs, and what each answers. */
const PutFlagCases = [
  //                                 ifAbsent add,                                                  ifAbsent fail,
  //                                 ifPresent repl        fail                  get                   repl                  fail                  get
  // nothing stored: only ifAbsent acts
  ["nothing",   "void",    ["born val=record",    "born val=record",    "born val=record",    "void dbhas=shell",   "void dbhas=shell",   "void dbhas=shell"],   'a first revision is born, or refused where ifAbsent fails'],
  // a live box: only ifPresent acts, and a stale citation is stale unless ifPresent gets
  ["live",      "void",    ["stale dbhas=stored", "stale dbhas=stored", "passed val=stored",  "stale dbhas=stored", "stale dbhas=stored", "passed val=stored"],  'citing nothing over a live box is stale, unless ifPresent gets'],
  ["live",      "current", ["replaced val=record", "camped dbhas=stored", "passed val=stored", "replaced val=record", "camped dbhas=stored", "passed val=stored"], 'citing the live revision replaces it, camps on it, or gets it'],
  ["live",      "older",   ["stale dbhas=stored", "stale dbhas=stored", "passed val=stored",  "stale dbhas=stored", "stale dbhas=stored", "passed val=stored"],  'citing an older revision over a live box is stale, unless ifPresent gets'],
  // a tombstone: only ifAbsent acts, and only over a citation of the tombstone
  ["tombstone", "void",    ["stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored"], 'citing nothing over a tombstone is stale under every flag'],
  ["tombstone", "current", ["reborn val=record",  "reborn val=record",  "reborn val=record",  "gone dbhas=stored",  "gone dbhas=stored",  "gone dbhas=stored"],  'citing the tombstone is reborn, or refused where ifAbsent fails'],
  ["tombstone", "older",   ["stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored", "stale dbhas=stored"], 'citing the live revision a tombstone followed is stale under every flag'],
] as const
// --

// == [Harness]: outcomeOf, nameOf, putFlagOutcomesOf

/** `answer` in the table's terms: its act, then its val or dbhas named as `record`, `stored` or `shell`. */
function outcomeOf(answer: WriteThingAnswer, record: BoxRecord, stored: BoxRecord | null): string {
  const [fieldname, seen] = answer.ok ? ['val', answer.val] : ['dbhas', answer.dbhas]
  return `${answer.act} ${fieldname}=${nameOf(seen, record, stored)}`
}

/** `seen` as the table names it: `record`, `stored` or `shell`, or its JSON where it is none of them. */
function nameOf(seen: unknown, record: BoxRecord, stored: BoxRecord | null): string {
  if (isEqual(seen, record))                         { return 'record' }
  if (isEqual(seen, stored))                         { return 'stored' }
  if (isEqual(seen, Shell.inParentLivesOf(record)))  { return 'shell' }
  return JSON.stringify(seen)
}

/** What a put of a citation's record over it answers under each pair of flags, each over a new VaultMinder of a born bank with `stored` at the box's labelpath. */
async function putFlagOutcomesOf(stored: BoxRecord | null, [cited, record]: Citation): Promise<string[]> {
  const outcomes = []
  for (const [ifAbsent, ifPresent] of FlagCombos) {
    const inner  = new MemoryVaultDB()
    const minder = VaultMinder.make(TH.ThingBank, { vaultDB: inner, world: TH.PlainWorld })
    await TH.expectGood(minder.tryBirthBank(TH.birthBankAskOf()))
    if (stored !== null) { cheatStored(inner, stored) }
    outcomes.push(outcomeOf(await minder.tryPutOnce({ cited, record, ifAbsent, ifPresent }), record, stored))
  }
  return outcomes
}
// --

describe("VaultMinder.tryPutOnce under each ifAbsent and ifPresent", () => {
  for (const [storedname, citedname, wanted, blurb] of PutFlagCases) {
    it(blurb, async () => {
      const citation = Citations[storedname][citedname]!
      expect(await putFlagOutcomesOf(Storeds[storedname], citation)).to.deep.equal(wanted)
    })
  }
})
