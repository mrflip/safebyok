/** The classifier's checks of Things that crossed a wire: each takes what is at the ask's scope, and refuses anything else as storage_issue. */

import { describe, expect, it } from 'vitest'
import { Errors } from 'safebyok-big/internals'
import * as Classifier from '../../src/storage/thing-classifier'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { Shell } from '../../src/shapes/shapes-thing'
import { birthPutsOf } from '../../src/shapes/shapes-asks'
import * as TH from '../test-helpers'

const gate     = TH.gateThingOf()
const box      = TH.boxThingOf()
const boxShell = Shell.under(TH.BoxScope, TH.rootBoxOf())
const ofU2     = { userid: 'u2' } as const

/** Expect `attempt` to refuse as storage_issue, the refusal of a server out of step or broken. */
function expectStorageIssue(attempt: () => unknown, blurb: string): void {
  expect(attempt, blurb).to.throw(Errors.VaultError).with.property('refusalkind', 'storage_issue')
}

describe("Classifier.crossedThingOf", () => {
  it("takes the Thing at the scope, or the shell there", () => {
    expect(Classifier.crossedThingOf(TH.GateScope, gate)).to.deep.eq(gate)
    expect(Classifier.crossedThingOf(TH.BoxScope, boxShell)).to.deep.eq(boxShell)
  })

  it("refuses anything but a Thing or the shell at the scope", () => {
    const MisfitCases = [
      [TH.GateScope, null,                              'nothing at all'],
      [TH.GateScope, {},                                'an empty bag'],
      [TH.GateScope, { ...gate, revseq: 'x' },          'a revseq that is no number'],
      [TH.GateScope, TH.gateThingOf(ofU2),              "the gate of another user's bank"],
      [TH.GateScope, TH.gateThingOf({ banklabel: 'other' }), 'the gate of another bank of the same user'],
      [TH.GateScope, TH.rootBoxOf(),                    'the root box, at the gate'],
      [TH.BoxScope,  TH.boxThingOf('anthropic'),        'a box at another labelpath'],
      [TH.BoxScope,  { ...boxShell, revtok: box.revtok }, 'a shell with a revision'],
    ] as const
    for (const [scope, raw, blurb] of MisfitCases) {
      expectStorageIssue(() => Classifier.crossedThingOf(scope, raw), blurb)
    }
  })
})

describe("Classifier.crossedGotOf", () => {
  it("takes a get's act where the get table gives it for the Thing", () => {
    expect(Classifier.crossedGotOf(TH.getGateAskOf(), 'gotlive', gate)).to.deep.eq({ ok: true, act: 'gotlive', record: gate })
    expect(Classifier.crossedGotOf(TH.getAskAt('box/openai'), 'gotvoid', boxShell)).to.deep.eq({ ok: true, act: 'gotvoid', record: boxShell })
    expect(Classifier.crossedGotOf(TH.getAskAt('box/openai', 'fail'), 'void', boxShell)).to.deep.eq({ ok: false, act: 'void', record: boxShell })
    const tomb = TH.boxTombOf(box)
    expect(Classifier.crossedGotOf(TH.getAskAt('box/openai'), 'gotgone', tomb)).to.deep.eq({ ok: true, act: 'gotgone', record: tomb })
  })

  it("refuses an act the Thing does not fit, or a Thing not at the ask's scope", () => {
    const MisfitCases = [
      [TH.getAskAt('box/openai'),         'gotvoid', box,                 'a live box called void'],
      [TH.getAskAt('box/openai'),         'gotlive', boxShell,            'the shell called live'],
      [TH.getAskAt('box/openai'),         'gotgone', boxShell,            'the shell called gone'],
      [TH.getAskAt('box/openai'),         'gotlive', TH.boxTombOf(box),   'a tombstone called live'],
      [TH.getAskAt('box/openai', 'fail'), 'void',    box,                 'a refusal of a void that names a live box'],
      [TH.getAskAt('box/openai', 'fail'), 'gotvoid', boxShell,            'a good void where the ask refuses one'],
      [TH.getGateAskOf(),                 'gotlive', TH.gateThingOf(ofU2), "the gate of another user's bank"],
    ] as const
    for (const [ask, act, raw, blurb] of MisfitCases) {
      expectStorageIssue(() => Classifier.crossedGotOf(ask, act, raw), blurb)
    }
  })
})

describe("Classifier.crossedWrittenOf", () => {
  it("takes the Thing written at the scope", () => {
    expect(Classifier.crossedWrittenOf(TH.GateScope, gate)).to.deep.eq(gate)
  })

  it("refuses the shell, or a Thing not at the scope", () => {
    expectStorageIssue(() => Classifier.crossedWrittenOf(TH.BoxScope, boxShell), 'the shell, which no write leaves')
    expectStorageIssue(() => Classifier.crossedWrittenOf(TH.GateScope, TH.gateThingOf(ofU2)), "the gate of another user's bank")
  })
})

describe("Classifier.crossedNamedOf", () => {
  it("takes the Thing or the shell a refusal names in the bank, at the labelpath it carries", () => {
    expect(Classifier.crossedNamedOf(TH.ThingBank, gate)).to.deep.eq(gate)
    expect(Classifier.crossedNamedOf(TH.ThingBank, boxShell)).to.deep.eq(boxShell)
  })

  it("refuses a Thing in another bank, or one with no labelpath it could be at", () => {
    expectStorageIssue(() => Classifier.crossedNamedOf(TH.ThingBank, TH.gateThingOf(ofU2)), "the gate of another user's bank")
    expectStorageIssue(() => Classifier.crossedNamedOf(TH.ThingBank, { ...gate, labelpath: 'gate/../box' }), 'a labelpath no Thing has')
    expectStorageIssue(() => Classifier.crossedNamedOf(TH.ThingBank, null), 'nothing at all')
  })
})

describe("Classifier.crossedTrackedOf", () => {
  const AllSame = { bank: 'same', gate: 'same', box: 'same' } as const

  it("takes each root's 'same', or the Thing stored there", () => {
    expect(Classifier.crossedTrackedOf(TH.getGateAskOf(), AllSame)).to.deep.eq(AllSame)
    expect(Classifier.crossedTrackedOf(TH.getGateAskOf(), { ...AllSame, gate })).to.deep.eq({ ...AllSame, gate })
  })

  it("refuses a tracked with a root missing, a root more, or a root not its own", () => {
    const MisfitCases = [
      [{ bank: 'same', gate: 'same' },               'the root box missing'],
      [{ ...AllSame, 'box/openai': 'same' },         'a box that is no root'],
      [{ ...AllSame, gate: TH.gateThingOf(ofU2) },   "the gate of another user's bank"],
      [{ ...AllSame, box: gate },                    'the gate, as the root box'],
      [{ ...AllSame, bank: 'different' },            'a word other than same'],
    ] as const
    for (const [raw, blurb] of MisfitCases) {
      expectStorageIssue(() => Classifier.crossedTrackedOf(TH.getGateAskOf(), raw), blurb)
    }
  })
})

describe("Classifier.crossedRootsOf", () => {
  const puts  = birthPutsOf(TH.birthBankAskOf())
  const roots = { bank: TH.bankThingOf(), gate, root: TH.rootBoxOf() }

  it("takes the three roots of a birth", () => {
    expect(Classifier.crossedRootsOf(puts, roots)).to.deep.eq(roots)
  })

  it("refuses a root of another bank, or one in another root's place", () => {
    expectStorageIssue(() => Classifier.crossedRootsOf(puts, { ...roots, root: TH.rootBoxOf(ofU2) }), "the root box of another user's bank")
    expectStorageIssue(() => Classifier.crossedRootsOf(puts, { ...roots, gate: roots.root, root: gate }), 'the gate and the root box swapped')
    expectStorageIssue(() => Classifier.crossedRootsOf(puts, { bank: roots.bank, gate }), 'the root box missing')
  })
})

describe("Classifier.crossedWorldOf", () => {
  const roots = { bank: TH.bankThingOf(), gate, root: TH.rootBoxOf() }

  it("takes the three roots stored, or the shell at each", () => {
    expect(Classifier.crossedWorldOf(TH.getWorldAskOf(), roots)).to.deep.eq(roots)
    const shells = { bank: Shell.of({ ...TH.ThingBank, labelpath: 'bank' }), gate: Shell.of(TH.GateScope), root: Shell.of(TH.RootScope) }
    expect(Classifier.crossedWorldOf(TH.getWorldAskOf(), shells)).to.deep.eq(shells)
  })

  it("refuses a root of another bank", () => {
    expectStorageIssue(() => Classifier.crossedWorldOf(TH.getWorldAskOf(), { ...roots, bank: TH.bankThingOf(ofU2) }), 'the bank of another user')
  })
})

/** What a server's good answer to a listing of the root box carries, over a bank with two boxes under its root. */
async function servedListing() {
  const memory = new MemoryVaultDB()
  const cited  = Shell.childCited(TH.Life0)
  await TH.expectGood(memory.tryBirthBank(TH.birthBankAskOf()))
  for (const label of ['anthropic', 'openai']) {
    const birth = TH.birthAskOf(TH.boxThingOf(label), cited)
    await TH.expectGood(memory.tryWriteThing(birth))
  }
  const answer = await memory.tryListThings(TH.listAskAt('box'))
  if (! answer.ok) { throw new Error('Expected a listing') }
  const { val, parentage, deltas, damaged_rows } = structuredClone(answer)
  return { val, parentage, deltas, damaged_rows }
}

describe("Classifier.crossedListingOf", () => {
  it("takes a listing whose kids its parent and children make", async () => {
    const served = await servedListing()
    const listed = Classifier.crossedListingOf(TH.listAskAt('box'), served)
    expect(listed.deltas.map((thing) => thing.labelpath)).to.deep.eq(['box/anthropic', 'box/openai'])
  })

  it("refuses a child of another bank or another parent, or kids its children do not make", async () => {
    const served = await servedListing()
    const [first, second] = served.deltas as [object, object]
    const MisfitCases = [
      [{ ...served, deltas: [first, { ...second, userid: 'u2' }] },                "a child in another user's bank"],
      [{ ...served, deltas: [first, { ...second, labelpath: 'box/openai/x' }] },   'a grandchild'],
      [{ ...served, deltas: [second, first] },                                    'its children out of labelpath order'],
      [{ ...served, deltas: [first] },                                            'a child the kids name left out'],
      [{ ...served, parentage: [gate] },                                          'the gate as the parent'],
    ] as const
    for (const [crossed, blurb] of MisfitCases) {
      expectStorageIssue(() => Classifier.crossedListingOf(TH.listAskAt('box'), crossed), blurb)
    }
  })
})
