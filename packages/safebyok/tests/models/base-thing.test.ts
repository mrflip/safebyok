import { describe, expect, expectTypeOf, it } from 'vitest'
import { omit } from 'es-toolkit'
import { BaseThing } from '../../src/models/base-thing'
import { BaseBox } from '../../src/models/base-box'
import { Gate } from '../../src/models/gate'
import { Thing } from '../../src/models/thing'
import type { LiveOf, ShellOf, TombstoneOf } from '../../src/shapes/shapes-sealers'
import { type BoxRecord, type GateRecord, type Sparse, type ThingRecord, type VoidSentinel, Shell } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'

/** A gate's sparse tombstone: the guards read only its Thing fields. */
function gateSparseTombOf(): Sparse<TombstoneOf<GateRecord>> {
  return { ...Thing.sparseOf(TH.gateThingOf()), am: 'x', revseq: 1, lifeseq: TH.lifepathPlus(TH.Life0, 1), lifepath: TH.lifepathPlus(TH.Life0, 1) }
}

describe("BaseThing.modelkind", () => {
  it("is null for any kind, and each kind's own on its class", () => {
    expect([BaseThing.modelkind, Thing.modelkind, Gate.modelkind, BaseBox.modelkind]).to.deep.equal([null, null, 'gate', 'box'])
  })
})

describe("Thing.isVoidSentinel(val)", () => {
  it("is true of a shell, and false of a live record, a tombstone or a sparse record", () => {
    const box = TH.boxThingOf()
    for (const shell of [Shell.of(TH.GateScope), Shell.of(TH.BoxScope, TH.rootBoxOf())]) { expect(Thing.isVoidSentinel(shell)).to.be.true }
    for (const val of [box, TH.boxTombOf(box), Thing.sparseOf(box), null, undefined, 'x']) { expect(Thing.isVoidSentinel(val)).to.be.false }
  })

  it("is false of a half-shell, which no guard accepts: the shell's revseq without its revtok or lifeseq, or its revtok at another revseq", () => {
    const shell  = Shell.of(TH.GateScope)
    const halves = [{ ...shell, revtok: crypto.randomUUID() }, { ...shell, lifeseq: TH.Life0, lifepath: TH.Life0 }, { ...shell, revseq: 3 }]
    for (const val of halves) {
      expect([Thing.isTombstone(val), Thing.isVoidSentinel(val), Thing.isGone(val), Thing.isLive({ ...val, am: 'a' })]).to.eql([false, false, false, false])
    }
  })
})

describe("Thing.isWhole(record)", () => {
  it("is true of a whole record, live or tombstone, and of the void sentinel", () => {
    const box = TH.boxThingOf()
    for (const record of [box, TH.boxTombOf(box), TH.gateThingOf(), TH.gateTombOf(TH.gateThingOf()), Shell.of(TH.BoxScope, TH.rootBoxOf()), Shell.of(TH.GateScope)]) { expect(Thing.isWhole(record)).to.be.true }
  })

  it("is false of a sparse record, live or tombstone", () => {
    const box = TH.boxThingOf()
    for (const record of [Thing.sparseOf(box), Thing.sparseOf(TH.boxTombOf(box))]) { expect(Thing.isWhole(record)).to.be.false }
  })

  it("is false of a record that states no modelkind, or one that is no kind of Thing's", () => {
    const unkinded = omit(TH.boxThingOf(), ['modelkind'])
    for (const record of [unkinded, { ...unkinded, modelkind: 'bank' }, { ...unkinded, modelkind: 'toString' }]) { expect(Thing.isWhole(record as never)).to.be.false }
  })
})

describe("Thing.isLive(val)", () => {
  it("is true of a live record, whole or sparse", () => {
    const box = TH.boxThingOf()
    for (const record of [box, Thing.sparseOf(box), TH.gateThingOf()]) { expect(Thing.isLive(record)).to.be.true }
  })

  it("is false of a tombstone, the void sentinel, or what is not a record", () => {
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    for (const val of [tombstone, Thing.sparseOf(tombstone), Shell.of(TH.GateScope), { ...TH.boxThingOf(), am: 'd' }, null, undefined, 'x']) { expect(Thing.isLive(val)).to.be.false }
  })
})

describe("Thing.isTombstone(val)", () => {
  it("is true of a tombstone, whole or sparse, and of the void sentinel", () => {
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    for (const record of [tombstone, Thing.sparseOf(tombstone), Shell.of(TH.BoxScope, TH.rootBoxOf()), Shell.of(TH.GateScope)]) { expect(Thing.isTombstone(record)).to.be.true }
  })

  it("is false of a live record, whole or sparse, or what is not a record", () => {
    const box = TH.boxThingOf()
    for (const val of [box, Thing.sparseOf(box), null, undefined, 'x']) { expect(Thing.isTombstone(val)).to.be.false }
  })
})

describe("Thing.isGone(val)", () => {
  it("is true of a deleted Thing's tombstone, whole or sparse", () => {
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    for (const record of [tombstone, Thing.sparseOf(tombstone)]) { expect(Thing.isGone(record)).to.be.true }
  })

  it("is false of the void sentinel, a live record, whole or sparse, or what is not a record", () => {
    const box = TH.boxThingOf()
    for (const val of [Shell.of(TH.BoxScope, TH.rootBoxOf()), Shell.of(TH.GateScope), box, Thing.sparseOf(box), null, undefined, 'x']) { expect(Thing.isGone(val)).to.be.false }
  })
})

describe("Thing.isSparse(record)", () => {
  it("is true of a live record's Thing fields alone", () => {
    const sparse = Thing.sparseOf(TH.boxThingOf())
    expect(Thing.isSparse(sparse)).to.be.true
  })

  it("is false of a whole record, a tombstone, or the void sentinel", () => {
    const box = TH.boxThingOf()
    for (const record of [box, TH.gateThingOf(), Thing.sparseOf(TH.boxTombOf(box)), Shell.of(TH.GateScope)]) { expect(Thing.isSparse(record)).to.be.false }
  })
})

describe("a kind's guards", () => {
  const box       = TH.boxThingOf()
  const boxSparse = Thing.sparseOf(box)
  const boxTomb   = TH.boxTombOf(box)
  const boxShell  = Shell.of(TH.BoxScope, TH.rootBoxOf())
  const gate      = TH.gateThingOf()
  const gateShell = Shell.of(TH.GateScope)
  const GuardCases = [
    // what Gate and BaseBox answer, in that order:
    [() => [Gate.isLive(box),                 BaseBox.isLive(box)], [false, true],  'isLive of a live box'],
    [() => [Gate.isLive(gate),                BaseBox.isLive(gate)], [true,  false], 'isLive of a live gate'],
    [() => [Gate.isTombstone(boxTomb),        BaseBox.isTombstone(boxTomb)], [false, true],  "isTombstone of a box's tombstone"],
    [() => [Gate.isTombstone(gateSparseTombOf()),   BaseBox.isTombstone(gateSparseTombOf())], [true,  false], "isTombstone of a gate's sparse tombstone"],
    [() => [Gate.isGone(boxTomb),             BaseBox.isGone(boxTomb)], [false, true],  "isGone of a box's tombstone"],
    [() => [Gate.isGone(boxShell),            BaseBox.isGone(boxShell)], [false, false], "isGone of a box's shell"],
    [() => [Gate.isVoidSentinel(boxShell),    BaseBox.isVoidSentinel(boxShell)], [false, true],  "isVoidSentinel of a box's shell"],
    [() => [Gate.isVoidSentinel(gateShell),   BaseBox.isVoidSentinel(gateShell)], [true,  false], "isVoidSentinel of a gate's shell"],
    [() => [Gate.isWhole(box),                BaseBox.isWhole(box)], [false, true],  'isWhole of a whole box'],
    [() => [Gate.isWhole(boxShell),           BaseBox.isWhole(boxShell)], [false, true],  "isWhole of a box's shell"],
    [() => [Gate.isWhole(gate),               BaseBox.isWhole(gate)], [true,  false], 'isWhole of a whole gate'],
    [() => [Gate.isSparse(boxSparse),         BaseBox.isSparse(boxSparse)], [false, true],  'isSparse of a sparse box'],
  ] as const

  for (const [answersOf, expected, blurb] of GuardCases) {
    it(`answer ${blurb} for its own kind alone`, () => { expect(answersOf()).to.deep.equal(expected) })
  }

  it("serve as a callback through an arrow", () => {
    expect([gateSparseTombOf(), boxTomb, gate].filter((rec) => Gate.isTombstone(rec))).to.deep.equal([gateSparseTombOf()])
  })
})

describe("Thing.cmp(ante, post)", () => {
  const box       = TH.boxThingOf()
  const boxNext   = TH.nextOf(box)
  const boxTomb   = TH.boxTombOf(box)
  const boxReborn = TH.boxRebornOf(boxTomb, { revseq: 0 })
  const boxShell  = Shell.of(TH.BoxScope, TH.rootBoxOf())
  const CmpCases = [
    [box,      boxNext,    1,  'a later revision is newer'],
    [boxNext,  box,        -1, 'an earlier revision is older'],
    [box,      { ...box }, 0,  'one revision is neither'],
    [boxTomb,  boxReborn,  1,  'a later life is newer, whatever its revseq'],
    [boxShell, box,        1,  'any life is newer than the shell'],
  ] as const

  for (const [ante, post, sign, blurb] of CmpCases) {
    it(blurb, () => { expect(Math.sign(Thing.cmp(ante, post))).to.eq(sign) })
  }
})

describe("Thing.haveSameScope(scoped, other)", () => {
  it("is true of two revisions at one labelpath of one bank, and false across labelpaths, banks, users or kinds", () => {
    const box = TH.boxThingOf()
    expect(Thing.haveSameScope(box, TH.nextOf(box))).to.be.true
    for (const other of [TH.boxThingOf('anthropic'), { ...box, banklabel: 'other' }, { ...box, userid: 'u2' }, { ...box, modelkind: 'gate' as const }]) { expect(Thing.haveSameScope(box, other)).to.be.false }
  })
})

describe("Thing.sparseOf(record)", () => {
  it("carries over a Thing's fields and drops its body", () => {
    const { sidecar: _sidecar, whisper_sealed: _sealed, ...thingFields } = TH.boxThingOf()
    expect(Thing.sparseOf(TH.boxThingOf())).to.deep.equal(thingFields)
  })
})

describe("the guards' types", () => {
  it("narrow a record of any kind to the kind of the class asked", () => {
    const rec = TH.boxThingOf() as ThingRecord
    if (Gate.isTombstone(rec)) { expectTypeOf(rec).toExtend<TombstoneOf<GateRecord>>() }
    if (BaseBox.isLive(rec)) { expectTypeOf(rec).toExtend<LiveOf<BoxRecord>>() }
    if (Thing.isTombstone(rec)) { expectTypeOf(rec).toExtend<TombstoneOf<ThingRecord>>() }
  })

  it("narrow what is not known to be a record to a sparse one of the kind", () => {
    const val: unknown = TH.boxTombOf(TH.boxThingOf())
    if (BaseBox.isTombstone(val)) { expectTypeOf(val).toExtend<Sparse<TombstoneOf<BoxRecord>>>() }
    if (Thing.isVoidSentinel(val)) { expectTypeOf(val).toExtend<VoidSentinel>() }
    if (BaseBox.isVoidSentinel(val)) { expectTypeOf(val).toExtend<ShellOf<BoxRecord>>() }
  })

  it("narrow a shell of the kind to a shell, not to never", () => {
    const shell: VoidSentinel = TH.boxShellOf()
    const boxShell = TH.boxShellOf()
    if (Thing.isVoidSentinel(shell))      { expectTypeOf(shell).not.toBeNever() }
    if (BaseBox.isTombstone(boxShell))    { expectTypeOf(boxShell).not.toBeNever() }
    if (BaseBox.isVoidSentinel(boxShell)) { expectTypeOf(boxShell).not.toBeNever() }
  })

  it("narrow another kind's record to never", () => {
    const box = TH.boxThingOf()
    if (Gate.isTombstone(box))    { expectTypeOf(box).toBeNever() }
    if (Gate.isVoidSentinel(box)) { expectTypeOf(box).toBeNever() }
  })
})
