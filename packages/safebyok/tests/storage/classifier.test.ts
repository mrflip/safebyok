import { describe, expect, it } from 'vitest'
import * as EX from '../../src/shapes/shapes-enums'
import * as SX from '../../src/shapes/shapes-storage'
import { VaultError } from '../../src/refusals/errors'
import { boxActOf, cappedActOf, isBirthAct, isWriteAct, vaultActOf } from '../../src/storage/classifier'
import type { BoxAct, VaultAct } from '../../src/shapes/shapes-enums'
import type { BoxAsk, BoxRow, VaultAsk, VaultRow } from '../../src/shapes/shapes-storage'
import { boxAt, boxFlaws, boxQuery, boxscope, boxscopeOf, vaultAt, vaultFlaws, vaultScope } from '../test-helpers/storage-world'

// The stored row every comparison is made against stands at this seq, so a request can cite one below it and one above.
const Seq = 5

type Stored = 'void' | 'gone' | 'live'
// A cell of the note's `b_tok` column: the stored revision_tok is the one a request expects, the one it proposes, or neither; `birth` is the void revision over no row.
type TokCell = 'birth' | 'eq' | '=next' | 'neq'
// A cell of the note's `b_seq` column, the seq a request expects: the void row's, one below the stored seq, the stored one, or one above.
type SeqCell = 'birth' | 'stale' | 'eq' | 'ahead'
type Policies = Readonly<{ ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent }>
type Meta = Readonly<{ revision_tok: string, revision_seq: number, am: EX.Am, vault_tok: string, lifeTok: string }>

const ExpectedSeqs = { birth: SX.VoidRevisionSeq, stale: Seq - 1, eq: Seq, ahead: Seq + 2 } as const
const Repl: Policies = { ifAbsent: 'add', ifPresent: 'repl' }

const noVaultYet = SX.sentinelVaultOf(vaultScope)
const noBoxYet   = SX.sentinelBoxOf(boxscope, 'life1')

const liveVault = vaultAt(Seq)
function goneVaultOf(lifeTok: string) { return SX.vaultTombstone.parse({ ...SX.vaultSparse.parse(vaultAt(Seq, lifeTok)), am: 'x' }) }
const goneVault = goneVaultOf('life1')
const liveBox   = boxAt(Seq)
const goneBox   = SX.boxTombstone.parse({ ...SX.boxSparse.parse(liveBox), am: 'x' })

/** One level of the contract, a box's or a vault's, as the cases below drive it: its stored rows, and a request built from what it expects and proposes. */
type Level = Readonly<{
  rows:    Readonly<Record<Stored, BoxRow | VaultRow | null>>
  metaOf:  (row: BoxRow | VaultRow | null) => Meta
  getAct:  (ifAbsent: EX.IfAbsent, stored: Stored) => string
  putAct:  (expected: Meta, proposedTok: string, policies: Policies, stored: Stored) => string
  delAct:  (expected: Meta, proposedTok: string, stored: Stored) => string
}>

const sentinelMeta: Meta = { ...SX.VoidRevision, am: 'x', vault_tok: 'life1', lifeTok: SX.VoidLifeTok }

// A put brings a new life tok over a tombstone or nothing, and keeps the one of a live row.
const lifeTokOver = (expected: Meta): string => ((expected.am === 'a') ? expected.lifeTok : `${expected.lifeTok}-reborn`)

const boxExpectedOf = ({ lifeTok, ...meta }: Meta) => ({ ...meta, box_tok: lifeTok })
const boxProposed   = (expected: Meta, revision_tok: string) => ({ revision_tok, revision_seq: expected.revision_seq + 1 })

const BoxLevel: Level = {
  rows:   { void: null, gone: goneBox, live: liveBox },
  metaOf: (row) => ((row === null) ? sentinelMeta : { ...SX.rowMeta.parse(row), lifeTok: (row as BoxRow).box_tok }),
  getAct: (ifAbsent, stored) => boxActOf({ op: 'get', ...boxQuery, ifAbsent, expected: noBoxYet }, liveVault, BoxLevel.rows[stored]),
  putAct: (expected, proposedTok, policies, stored) => boxActOf({
    op: 'put', ...boxQuery, ...policies, expected: boxExpectedOf(expected), record: { ...liveBox, ...boxProposed(expected, proposedTok), box_tok: lifeTokOver(expected) },
  }, liveVault, BoxLevel.rows[stored]),
  delAct: (expected, proposedTok, stored) => boxActOf({
    op: 'del', ...boxQuery, expected: boxExpectedOf(expected), record: { ...goneBox, ...boxProposed(expected, proposedTok), box_tok: 'lifeended' },
  }, liveVault, BoxLevel.rows[stored]),
}

const vaultExpectedOf = ({ lifeTok, ...meta }: Meta) => ({ ...meta, vault_tok: lifeTok })

const VaultLevel: Level = {
  rows:   { void: null, gone: goneVault, live: liveVault },
  metaOf: (row) => ((row === null) ? { ...sentinelMeta, vault_tok: SX.VoidLifeTok } : { ...SX.rowMeta.parse(row), lifeTok: row.vault_tok }),
  getAct: (ifAbsent, stored) => vaultActOf({ op: 'get', ...vaultScope, ifAbsent, expected: noVaultYet }, VaultLevel.rows[stored]),
  putAct: (expected, proposedTok, policies, stored) => vaultActOf({
    op: 'put', ...vaultScope, ...policies, expected: vaultExpectedOf(expected), record: { ...liveVault, ...boxProposed(expected, proposedTok), vault_tok: lifeTokOver(expected) },
  }, VaultLevel.rows[stored]),
  delAct: (expected, proposedTok, stored) => vaultActOf({
    op: 'del', ...vaultScope, expected: vaultExpectedOf(expected), record: { ...goneVault, ...boxProposed(expected, proposedTok), vault_tok: 'lifeended' },
  }, VaultLevel.rows[stored]),
}

const Levels = [['boxActOf', BoxLevel], ['vaultActOf', VaultLevel]] as const

/** What a request in the cell `tok` by `seq` expects and proposes against the row `stored`. */
const citedOver = (level: Level, stored: Stored, tok: TokCell, seq: SeqCell): { expected: Meta, proposedTok: string } => {
  const row       = level.rows[stored]
  const storedTok = (row === null) ? 'no-row' : row.revision_tok
  // What it expects has the life and liveness of the row stored, or of a live row where none is: only its revision is off.
  const base      = level.metaOf((seq === 'birth') ? null : (row ?? level.rows.live))
  const expected  = (seq === 'birth') ? base : { ...base, revision_seq: ExpectedSeqs[seq], revision_tok: (tok === 'eq') ? storedTok : 'elsewhere' }
  return { expected, proposedTok: (tok === '=next') ? storedTok : 'proposed' }
}

const GetCases = [
  ["void", "nil",  "gotvoid",  'answers that nothing is stored'],
  ["void", "fail", "void",     'refuses over nothing when told to fail'],
  ["gone", "nil",  "gotgone",  'answers a tombstone'],
  ["gone", "fail", "gone",     'refuses over a tombstone when told to fail'],
  ["live", "nil",  "gotlive",  'gets a live row'],
  ["live", "fail", "gotlive",  'gets a live row whatever it was told of an absence'],
] as const

const PutCases = [
  // over nothing
  ["void", "birth", "birth", "add",  "repl", "born",       'is born over nothing'],
  ["void", "birth", "birth", "fail", "repl", "void",       'refuses over nothing when told to fail'],
  ["void", "neq",   "ahead", "add",  "repl", "ahead",      'expects a row where none is stored'],
  // over a tombstone
  ["gone", "=next", "stale", "add",  "repl", "retcon",     'finds a tombstone under the tok it would store'],
  ["gone", "neq",   "birth", "add",  "repl", "stale",      'expects nothing where a tombstone is stored'],
  ["gone", "neq",   "stale", "add",  "repl", "stale",      'expects an earlier revision than the tombstone stored'],
  ["gone", "eq",    "stale", "add",  "repl", "clash",      'cites the tombstone by its tok at a lower seq'],
  ["gone", "neq",   "eq",    "add",  "repl", "forked",     'cites the tombstone by its seq under another tok'],
  ["gone", "neq",   "ahead", "add",  "repl", "ahead",      'expects a later revision than the tombstone stored'],
  ["gone", "eq",    "ahead", "add",  "repl", "ahead",      'cites the tombstone by its tok at a higher seq'],
  ["gone", "eq",    "eq",    "add",  "repl", "reborn",     'is reborn over the tombstone it cites'],
  ["gone", "eq",    "eq",    "fail", "repl", "gone",       'refuses over the tombstone it cites when told to fail'],
  // over a live row
  ["live", "=next", "stale", "add",  "repl", "retcon",     'finds a live row under the tok it would store'],
  ["live", "=next", "stale", "add",  "get",  "retcon",     'finds a live row under the tok it would store, though told to get'],
  ["live", "=next", "ahead", "add",  "repl", "retcon",     'finds a live row under the tok it would store, at a lower seq than it expects'],
  ["live", "neq",   "birth", "add",  "repl", "stale",      'expects nothing where a live row is stored'],
  ["live", "neq",   "birth", "add",  "fail", "stale",      'expects nothing where a live row is stored, when told to fail'],
  ["live", "neq",   "birth", "add",  "get",  "passed",     'gets the live row stored where it expected nothing'],
  ["live", "neq",   "stale", "add",  "get",  "passed",     'gets the live row stored where it expected an earlier one'],
  ["live", "neq",   "stale", "add",  "repl", "stale",      'expects an earlier revision than the live row stored'],
  ["live", "neq",   "stale", "add",  "fail", "stale",      'expects an earlier revision than the live row stored, when told to fail'],
  ["live", "eq",    "stale", "add",  "get",  "clash",      'cites the live row by its tok at a lower seq'],
  ["live", "neq",   "eq",    "add",  "get",  "forked",     'cites the live row by its seq under another tok'],
  ["live", "neq",   "ahead", "add",  "get",  "ahead",      'expects a later revision than the live row stored'],
  ["live", "eq",    "ahead", "add",  "get",  "ahead",      'cites the live row by its tok at a higher seq'],
  ["live", "eq",    "eq",    "add",  "repl", "replaced",   'replaces the live row it cites'],
  ["live", "eq",    "eq",    "add",  "get",  "passed",     'gets the live row it cites when told to get'],
  ["live", "eq",    "eq",    "add",  "fail", "camped",     'refuses over the live row it cites when told to fail'],
] as const

const DelCases = [
  // over nothing
  ["void", "birth", "birth", "void",       'refuses over nothing'],
  ["void", "neq",   "ahead", "ahead",      'expects a row where none is stored'],
  // over a tombstone
  ["gone", "=next", "stale", "retcon",     'finds a tombstone under the tok it would store'],
  ["gone", "neq",   "birth", "gone",       'expects nothing where a tombstone is stored'],
  ["gone", "neq",   "stale", "gone",       'expects an earlier revision than the tombstone stored'],
  ["gone", "eq",    "stale", "clash",      'cites the tombstone by its tok at a lower seq'],
  ["gone", "neq",   "eq",    "forked",     'cites the tombstone by its seq under another tok'],
  ["gone", "neq",   "ahead", "ahead",      'expects a later revision than the tombstone stored'],
  ["gone", "eq",    "ahead", "ahead",      'cites the tombstone by its tok at a higher seq'],
  ["gone", "eq",    "eq",    "dubdel",     'refuses to delete the tombstone it cites'],
  // over a live row
  ["live", "=next", "stale", "retcon",     'finds a live row under the tok it would store'],
  ["live", "neq",   "birth", "stale",      'expects nothing where a live row is stored'],
  ["live", "neq",   "stale", "stale",      'expects an earlier revision than the live row stored'],
  ["live", "eq",    "stale", "clash",      'cites the live row by its tok at a lower seq'],
  ["live", "neq",   "eq",    "forked",     'cites the live row by its seq under another tok'],
  ["live", "neq",   "ahead", "ahead",      'expects a later revision than the live row stored'],
  ["live", "eq",    "ahead", "ahead",      'cites the live row by its tok at a higher seq'],
  ["live", "eq",    "eq",    "deleted",    'deletes the live row it cites'],
] as const

describe.each(Levels)("%s, the table of notes/answer-contract.md", (_fnname, level) => {
  describe("a get", () => {
    for (const [stored, ifAbsent, act, blurb] of GetCases) {
      it(blurb, () => { expect(level.getAct(ifAbsent, stored)).to.eq(act) })
    }
  })

  describe("a put", () => {
    for (const [stored, tok, seq, ifAbsent, ifPresent, act, blurb] of PutCases) {
      it(blurb, () => {
        const { expected, proposedTok } = citedOver(level, stored, tok, seq)
        expect(level.putAct(expected, proposedTok, { ifAbsent, ifPresent }, stored)).to.eq(act)
      })
    }
  })

  describe("a del", () => {
    for (const [stored, tok, seq, act, blurb] of DelCases) {
      it(blurb, () => {
        const { expected, proposedTok } = citedOver(level, stored, tok, seq)
        expect(level.delAct(expected, proposedTok, stored)).to.eq(act)
      })
    }
  })

  it("calls it a clash when the row cited by tok and seq is of another life", () => {
    const { expected, proposedTok } = citedOver(level, 'live', 'eq', 'eq')
    const ofOtherLife = { ...expected, lifeTok: 'another-life' }
    expect(level.putAct(ofOtherLife, proposedTok, Repl, 'live')).to.eq('clash')
    expect(level.delAct(ofOtherLife, proposedTok, 'live')).to.eq('clash')
  })

  it("calls it a clash when the row cited by tok and seq is live where a tombstone was expected", () => {
    const { expected, proposedTok } = citedOver(level, 'live', 'eq', 'eq')
    expect(level.putAct({ ...expected, am: 'x' }, proposedTok, Repl, 'live')).to.eq('clash')
  })
})

describe("the whole table of a put, a del and a get, cell by cell", () => {
  const Storeds  = ['void', 'gone', 'live'] as const
  const TokCells = ['eq', '=next', 'neq'] as const
  const SeqCells = ['birth', 'stale', 'eq', 'ahead'] as const
  // The void row's revision is cited whole, so a birth is never cited by the stored tok; over nothing there is no stored tok to cite.
  const cells = Storeds.flatMap((stored) => TokCells.flatMap((tok) => SeqCells.map((seq) => ({ stored, tok, seq }))))
    .filter(({ stored, tok, seq }) => (! ((tok === 'eq') && (seq === 'birth'))) && ((stored !== 'void') || (tok === 'neq')))
  const policiesList = EX.putIfAbsentVals.flatMap((ifAbsent) => EX.ifPresentVals.map((ifPresent) => ({ ifAbsent, ifPresent })))
  const isCited = ({ stored, tok, seq }: typeof cells[number]) => (stored === 'void') ? (seq === 'birth') : ((tok === 'eq') && (seq === 'eq'))

  describe.each(Levels)("%s", (_fnname, level) => {
    const knownActs: readonly string[] = [...EX.writeActVals, ...EX.foundActVals, ...EX.refusedActVals]
    const puts = cells.flatMap((cell) => policiesList.map((policies) => {
      const { expected, proposedTok } = citedOver(level, cell.stored, cell.tok, cell.seq)
      return { cell, policies, act: level.putAct(expected, proposedTok, policies, cell.stored) }
    }))
    const dels = cells.map((cell) => {
      const { expected, proposedTok } = citedOver(level, cell.stored, cell.tok, cell.seq)
      return { cell, act: level.delAct(expected, proposedTok, cell.stored) }
    })

    it("names an act of its own lists in every cell", () => {
      expect(puts).to.have.lengthOf(156)
      expect(dels).to.have.lengthOf(26)
      for (const { act } of [...puts, ...dels]) { expect(knownActs).to.include(act) }
    })

    it("stores a put's record only over the row it cites, and names the act for what stood there", () => {
      const wrote = puts.filter(({ act }) => isWriteAct(act as BoxAct | VaultAct))
      for (const { cell, act } of wrote) {
        expect(isCited(cell)).to.be.true
        expect(act).to.eq({ void: 'born', gone: 'reborn', live: 'replaced' }[cell.stored])
      }
      expect(wrote.map(({ act }) => act)).to.include.members(['born', 'reborn', 'replaced'])
    })

    it("stores a del's tombstone only over the live row it cites", () => {
      const wrote = dels.filter(({ act }) => isWriteAct(act as BoxAct | VaultAct))
      expect(wrote.map(({ cell, act }) => ({ ...cell, act }))).to.deep.equal([{ stored: 'live', tok: 'eq', seq: 'eq', act: 'deleted' }])
    })

    it("passes a put only when it was told to get and a live row is stored", () => {
      const passed = puts.filter(({ act }) => act === 'passed')
      for (const { cell, policies } of passed) {
        expect(policies.ifPresent).to.eq('get')
        expect(cell.stored).to.eq('live')
      }
    })

    it("never answers a get with an act that stores", () => {
      for (const stored of Storeds) {
        for (const ifAbsent of EX.ifAbsentVals) { expect(isWriteAct(level.getAct(ifAbsent, stored) as BoxAct | VaultAct)).to.be.false }
      }
    })
  })
})

describe("boxActOf, its vault", () => {
  const get: BoxAsk = { op: 'get', ...boxQuery, ifAbsent: 'nil', expected: noBoxYet }
  const put: BoxAsk = { op: 'put', ...boxQuery, ifAbsent: 'add', ifPresent: 'repl', expected: noBoxYet, record: boxAt(0) }
  const garbled = { smuggled: 'field' }
  const VaultCases = [
    [null,                  "vault_void",   'no vault row'],
    [goneVault,             "vault_gone",   'a vault tombstone of its life'],
    [goneVaultOf('life2'),  "vault_gone",   'a vault tombstone of another life'],
    [vaultAt(Seq, 'life2'), "vault_reborn", 'a live vault row of another life'],
  ] as const

  for (const [vaultRaw, act, blurb] of VaultCases) {
    it(`stops at ${blurb}, whatever the box row and the request`, () => {
      for (const request of [get, put]) {
        for (const boxRaw of [null, liveBox, goneBox, garbled]) { expect(boxActOf(request, vaultRaw, boxRaw)).to.eq(act) }
      }
    })
  }

})

const damagedRowOf = (classify: () => unknown): VaultError => {
  try { classify() } catch (err) { return err as VaultError }
  return expect.fail('the classifier answered an act for a damaged row')
}

describe("boxActOf and vaultActOf, a row that fails its checks", () => {
  const get: BoxAsk = { op: 'get', ...boxQuery, ifAbsent: 'nil', expected: noBoxYet }
  const put: BoxAsk = { op: 'put', ...boxQuery, ifAbsent: 'add', ifPresent: 'repl', expected: noBoxYet, record: boxAt(0) }
  const vaultGet: VaultAsk = { op: 'get', ...vaultScope, ifAbsent: 'nil', expected: noVaultYet }
  it.each(boxFlaws)("refuses damaged_row for a box row with %s", (_flawname, flawOf) => {
    expect(() => boxActOf(get, liveVault, flawOf(liveBox))).to.throw(VaultError).with.property('refusalkind', 'damaged_row')
    expect(() => boxActOf(put, liveVault, flawOf(liveBox))).to.throw(VaultError).with.property('refusalkind', 'damaged_row')
  })

  it.each(vaultFlaws)("refuses damaged_row for the vault row asked for and damaged_vault for a box's vault row, with %s, whatever the box row", (_flawname, flawOf) => {
    expect(() => vaultActOf(vaultGet, flawOf(liveVault))).to.throw(VaultError).with.property('refusalkind', 'damaged_row')
    for (const boxRaw of [null, liveBox, { smuggled: 'field' }]) {
      expect(() => boxActOf(get, flawOf(liveVault), boxRaw)).to.throw(VaultError).with.property('refusalkind', 'damaged_vault')
    }
  })

  it("names the field that failed", () => {
    const { revision_tok: _dropped, ...boxTokless } = liveBox
    const boxErr = damagedRowOf(() => boxActOf(get, liveVault, boxTokless))
    expect(boxErr.refusalkind).to.eq('damaged_row')
    expect(boxErr.meta?.fieldnames).to.deep.equal(['revision_tok'])

    const { revision_tok: _gone, ...vaultTokless } = liveVault
    const vaultErr = damagedRowOf(() => boxActOf(get, vaultTokless, liveBox))
    expect(vaultErr.refusalkind).to.eq('damaged_vault')
    expect(vaultErr.meta?.fieldnames).to.deep.equal(['revision_tok'])
  })
})

describe("boxActOf and vaultActOf, a row no working store could answer", () => {
  const get: BoxAsk = { op: 'get', ...boxQuery, ifAbsent: 'nil', expected: noBoxYet }
  const vaultGet: VaultAsk = { op: 'get', ...vaultScope, ifAbsent: 'nil', expected: noVaultYet }
  const elsewhere = boxscopeOf('anthropic')

  it("refuses storage_issue for a sound box row filed under another scope, or another life of its vault", () => {
    expect(() => boxActOf(get, liveVault, { ...liveBox, ...elsewhere })).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
    expect(() => boxActOf(get, liveVault, boxAt(Seq, 'life0'))).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
  })

  it("refuses storage_issue for a sound vault row filed under another scope", () => {
    const otherVault = { ...liveVault, vaultlabel: 'elsewhere' }
    expect(() => boxActOf(get, otherVault, liveBox)).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
    expect(() => vaultActOf(vaultGet, otherVault)).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
  })

  it.each([['a string', 'row'], ['a number', 42], ['a list', [liveBox]]])("refuses storage_issue for a row that is %s", (_what, raw) => {
    expect(() => boxActOf(get, liveVault, raw)).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
    expect(() => boxActOf(get, raw, liveBox)).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
    expect(() => vaultActOf(vaultGet, raw)).to.throw(VaultError).with.property('refusalkind', 'storage_issue')
  })
})

const roomOf = (used: number) => ({ boxes: { used, max: 3 }, bytes: { used: 0, max: 1000 } })

describe("cappedActOf, the soft cap on a vault's boxes", () => {
  it("answers vault_full for a born in a vault at its cap", () => {
    expect(cappedActOf('born', roomOf(3))).to.eq('vault_full')
    expect(cappedActOf('born', roomOf(4))).to.eq('vault_full')
  })

  it("answers born where the vault has room", () => {
    expect(cappedActOf('born', roomOf(2))).to.eq('born')
  })

  it("answers the act itself, whatever the room, where it adds no box row", () => {
    for (const act of ['reborn', 'replaced', 'deleted', 'gotlive', 'passed', 'stale'] as const) { expect(cappedActOf(act, roomOf(9))).to.eq(act) }
  })

  it("refuses a capacity that fails its check", () => {
    expect(() => cappedActOf('born', { boxes: { used: -1, max: 3 }, bytes: { used: 0, max: 1000 } })).to.throw(VaultError)
  })
})

describe("isBirthAct", () => {
  it("holds of born and reborn alone", () => {
    const acts = [...EX.writeActVals, ...EX.foundActVals, ...EX.refusedActVals, ...EX.boxVaultActVals]
    expect(acts.filter((act) => isBirthAct(act))).to.deep.equal(['born', 'reborn'])
  })
})

describe("boxActOf and vaultActOf, a request that fails its check", () => {
  it("refuses, storing and classifying nothing", () => {
    const seqSkipped: BoxAsk = { op: 'put', ...boxQuery, ifAbsent: 'add', ifPresent: 'repl', expected: noBoxYet, record: boxAt(3) }
    expect(() => boxActOf(seqSkipped, liveVault, null)).to.throw(VaultError).with.property('refusalkind', 'bad_record')
    const noPolicy = { op: 'get', ...vaultScope } as unknown as VaultAsk
    expect(() => vaultActOf(noPolicy, null)).to.throw(VaultError).with.property('refusalkind', 'bad_record')
  })
})

describe("boxActOf, one box through a run of requests", () => {
  type Write = Extract<BoxAsk, { op: 'put' | 'del' }>
  // A row as a request carries it: the record it would store, which is the row stored once it has.
  type Row = Write['record']
  type Run = Readonly<{ stored: Row | null, versions: readonly Row[], sent: readonly Write[], wrote: ReadonlySet<Write> }>
  const sentinel: Row = SX.sentinelBoxOf(boxscope, 'life1')
  let minted = 0
  const mint = (stem: string): string => { minted += 1; return `${stem}${String(minted)}` }

  const putCiting = (expected: Row, policies: Policies): Write => ({
    op: 'put', ...boxQuery, ...policies, expected,
    record: { ...liveBox, revision_tok: mint('rev'), revision_seq: expected.revision_seq + 1, box_tok: (expected.am === 'a') ? expected.box_tok : mint('life') },
  })
  const delCiting = (expected: Row): Write => ({
    op: 'del', ...boxQuery, expected, record: { ...goneBox, revision_tok: mint('rev'), revision_seq: expected.revision_seq + 1, box_tok: mint('life') },
  })

  /** Every request worth sending next: a put or del citing nothing, the row stored or the one before it, and each request sent before, again. */
  const nextRequests = ({ stored, versions, sent }: Run): Write[] => {
    const citable = [sentinel, ...versions.slice(-2)]
    const fresh = citable.flatMap((expected) => [
      putCiting(expected, Repl), putCiting(expected, { ifAbsent: 'add', ifPresent: 'get' }), putCiting(expected, { ifAbsent: 'fail', ifPresent: 'fail' }), delCiting(expected),
    ])
    return (stored === null) ? [...fresh, ...sent] : [...sent, ...fresh]
  }

  /** The run after `request` was answered `act`, with what the contract promises of a write checked on the way. */
  const runAfter = (run: Run, request: Write, act: BoxAct): Run => {
    const sent = run.sent.includes(request) ? run.sent : [...run.sent, request]
    if (! isWriteAct(act)) { return { ...run, sent } }
    expect(run.wrote.has(request), 'a request stores its record at most once').to.be.false
    expect(request.record.revision_seq, 'a write is one seq past the row it replaces').to.eq((run.stored?.revision_seq ?? SX.VoidRevisionSeq) + 1)
    expect(run.versions.map((version) => version.revision_tok), 'no revision_tok is stored twice').not.to.include(request.record.revision_tok)
    const isNewLife = (request.record.box_tok !== run.stored?.box_tok)
    expect(isNewLife, 'a life tok is new at a birth and at a delete, and kept by a replace').to.eq(act !== 'replaced')
    return { stored: request.record, versions: [...run.versions, request.record], sent, wrote: new Set([...run.wrote, request]) }
  }

  const walk = (run: Run, depth: number, seen: { acts: Set<BoxAct>, runs: number }): void => {
    seen.runs += 1
    if (depth === 0) { return }
    for (const request of nextRequests(run)) {
      const act = boxActOf(request, liveVault, run.stored)
      seen.acts.add(act)
      walk(runAfter(run, request, act), depth - 1, seen)
    }
  }

  it("stores each request's record at most once, a seq at a time, in every run of four requests", () => {
    const seen = { acts: new Set<BoxAct>(), runs: 0 }
    walk({ stored: null, versions: [], sent: [], wrote: new Set() }, 4, seen)
    expect([...seen.acts]).to.include.members([...EX.writeActVals, 'passed', 'retcon', 'stale', 'gone', 'dubdel', 'camped', 'void'])
    expect(seen.runs).to.be.above(3000)
  })

  it("goes on from a tombstone's seq at a rebirth", () => {
    const born    = putCiting(sentinel, Repl)
    const deleted = delCiting(born.record)
    const reborn  = putCiting(deleted.record, Repl)
    expect(boxActOf(born, liveVault, null)).to.eq('born')
    expect(boxActOf(deleted, liveVault, born.record)).to.eq('deleted')
    expect(boxActOf(reborn, liveVault, deleted.record)).to.eq('reborn')
    expect([born, deleted, reborn].map((request) => request.record.revision_seq)).to.deep.equal([0, 1, 2])
  })
})
