import { describe, expect, it } from 'vitest'
import { Errors, Phrases as BigPhrases, SX } from 'safebyok-big/internals'
import type { CheckedGetManifest, CheckedWriteManifest, PolicyTag, WriteTags } from '../../src/shapes/shapes-manifest'
import type { WriteAsk } from '../../src/shapes/shapes-asks'
import type { WriteThingAnswer } from '../../src/shapes/shapes-answers'
import * as Phrases from '../../src/phrases'
import * as ManifestActs from '../../src/storage/manifest-acts'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A live box, and the put and del asks citing it: a test overrides their flags and the liveness they cite. */
const LiveBox = TH.boxThingOf()
const PutAsk  = TH.replaceAskOf(LiveBox, TH.nextOf(LiveBox))
const DelAsk  = TH.delAskFor(LiveBox, TH.boxTombOf(LiveBox))

/** The cited liveness that agrees with `presence`: live for a live row, else a tombstone. */
function citedAmOf(presence: WriteTags['presence']): 'a' | 'x' { return (presence === 'live') ? 'a' : 'x' }

/** `ask` over a row of `presence`, citing that row's liveness, with `flag` as the flag that applies there. */
function askOf(ask: WriteAsk, presence: WriteTags['presence'], flag: string): WriteAsk {
  const flags = (presence === 'live') ? { ifPresent: flag } : { ifAbsent: flag }
  return withCitedAm({ ...ask, ...flags } as WriteAsk, citedAmOf(presence))
}

/** `ask`, citing the liveness `am`. */
function withCitedAm(ask: WriteAsk, am: 'a' | 'x'): WriteAsk { return { ...ask, cited: { ...ask.cited, am } } as WriteAsk }

/** Write tags of `presence` and the two revision comparisons, the life and liveness as cited, every fixed field the same and no storage policy. */
function tagsOf(presence: WriteTags['presence'], revtok_cmp: WriteTags['revtok_cmp'], revseq_cmp: WriteTags['revseq_cmp'], overrides: Partial<WriteTags> = {}): WriteTags {
  return { presence, revtok_cmp, revseq_cmp, lifepath_eq: true, born_at_cmp: 'moot', lifetok_cmp: 'moot', policies: {}, written: false, ...overrides }
}

/** What every manifest here carries beside its tags and rows: the void banktok, each root the same as tracked, and a read_tc made now. */
function besideOf() { return { banktok: SX.VoidLifeTok, tracked: { bank: 'same', gate: 'same', box: 'same' }, read_tc: readTcNow() } as const }

/** The answer `writeAnswerOf` makes of a checked manifest of `tags` over the `actual` row, scribed for `ask`. */
function writeAnsweredOf(ask: WriteAsk, tags: WriteTags, actual: CheckedWriteManifest['actual'] = null) {
  const manifest: CheckedWriteManifest = { tags, actual, ancestor: null, ...besideOf() }
  ManifestActs.scribeWriteAct(ask, manifest)
  return ManifestActs.writeAnswerOf(ask, manifest)
}

/** The refusal a refused `answer` carries. */
function refusalOf(answer: WriteThingAnswer): Errors.VaultError {
  if (answer.ok) { throw new Error(`answered ${answer.act}`) }
  return answer.err
}

/** The act `scribeWriteAct` writes onto a checked manifest of `tags`, for `ask`. */
function scribedActOf(ask: WriteAsk, tags: WriteTags): string { return writeAnsweredOf(ask, tags).act }

/** Each revseq comparison, for a row whose revseq is "@": the act is the same at every one. */
const EveryRevseq = ['birth', 'eq', 'stale', 'ahead'] as const

/** The revseq comparisons a row of a table names: "@" for every one. */
function revseqsOf(revseqCmp: WriteTags['revseq_cmp'] | '@'): readonly WriteTags['revseq_cmp'][] { return (revseqCmp === '@') ? EveryRevseq : [revseqCmp] }

// Each row of the get table of notes/answer-contract.md.
const GetRows = [
  ["GV1", ["nil"],         "void", "gotvoid"],
  ["GV2", ["fail"],        "void", "void"],
  ["GG1", ["nil"],         "gone", "gotgone"],
  ["GG2", ["fail"],        "gone", "gone"],
  ["GL1", ["nil", "fail"], "live", "gotlive"],
] as const

describe("ManifestActs.scribeGetAct(ask, manifest), row by row of the get table", () => {
  for (const [abbr, flags, presence, act] of GetRows) {
    it(`${abbr}: ${act}`, () => {
      for (const ifAbsent of flags) {
        const manifest: CheckedGetManifest = { tags: { presence }, actual: null, ancestor: null, ...besideOf() }
        ManifestActs.scribeGetAct(TH.getAskAt('box', ifAbsent), manifest)
        expect(manifest.act, ifAbsent).to.eq(act)
      }
    })
  }
})

// Each row of the put and del tables of notes/answer-contract.md, as the new core reads them. A flag of "@" is every flag
// that applies over that row: ifAbsent's over none or a tombstone, ifPresent's over a live row.
const PutRows = [
  ["PV1",  "birth", "birth", ["add"],                "void", "born"],
  ["PV2",  "birth", "birth", ["fail"],               "void", "void"],
  ["PV3",  "neq",   "ahead", ["add", "fail"],        "void", "ahead"],
  ["PG1",  "=next", "@",     ["add", "fail"],        "gone", "retcon"],
  ["PG3",  "neq",   "birth", ["add", "fail"],        "gone", "stale"],
  ["PG4",  "neq",   "stale", ["add", "fail"],        "gone", "stale"],
  ["PG5",  "eq",    "stale", ["add", "fail"],        "gone", "clash"],
  ["PG6",  "neq",   "eq",    ["add", "fail"],        "gone", "forked"],
  ["PG7",  "neq",   "ahead", ["add", "fail"],        "gone", "ahead"],
  ["PG8",  "eq",    "ahead", ["add", "fail"],        "gone", "ahead"],
  ["PG9",  "eq",    "eq",    ["add"],                "gone", "reborn"],
  ["PG10", "eq",    "eq",    ["fail"],               "gone", "gone"],
  ["PL1",  "=next", "@",     ["repl", "get", "fail"], "live", "retcon"],
  ["PL4r", "neq",   "birth", ["repl"],               "live", "stale"],
  ["PL4f", "neq",   "birth", ["fail"],               "live", "stale"],
  ["PL3",  "neq",   "birth", ["get"],                "live", "passed"],
  ["PL6",  "neq",   "stale", ["get"],                "live", "passed"],
  ["PL5r", "neq",   "stale", ["repl"],               "live", "stale"],
  ["PL5f", "neq",   "stale", ["fail"],               "live", "stale"],
  ["PL7",  "eq",    "stale", ["repl", "get", "fail"], "live", "clash"],
  ["PL8",  "neq",   "eq",    ["repl", "get", "fail"], "live", "forked"],
  ["PL9",  "neq",   "ahead", ["repl", "get", "fail"], "live", "ahead"],
  ["PL10", "eq",    "ahead", ["repl", "get", "fail"], "live", "ahead"],
  ["PL11", "eq",    "eq",    ["repl"],               "live", "replaced"],
  ["PL12", "eq",    "eq",    ["get"],                "live", "passed"],
  ["PL13", "eq",    "eq",    ["fail"],               "live", "camped"],
] as const

const DelRows = [
  ["DV1", "birth", "birth", "void", "void"],
  ["DV2", "neq",   "ahead", "void", "ahead"],
  ["DG1", "=next", "@",     "gone", "retcon"],
  ["DG3", "neq",   "birth", "gone", "gone"],
  ["DG4", "neq",   "stale", "gone", "gone"],
  ["DG5", "eq",    "stale", "gone", "clash"],
  ["DG6", "neq",   "eq",    "gone", "forked"],
  ["DG7", "neq",   "ahead", "gone", "ahead"],
  ["DG8", "eq",    "ahead", "gone", "ahead"],
  ["DG9", "eq",    "eq",    "gone", "dubdel"],
  ["DL1", "=next", "@",     "live", "retcon"],
  ["DL3", "neq",   "birth", "live", "stale"],
  ["DL4", "neq",   "stale", "live", "stale"],
  ["DL5", "eq",    "stale", "live", "clash"],
  ["DL6", "neq",   "eq",    "live", "forked"],
  ["DL7", "neq",   "ahead", "live", "ahead"],
  ["DL8", "eq",    "ahead", "live", "ahead"],
  ["DL9", "eq",    "eq",    "live", "deleted"],
] as const

describe("ManifestActs.scribeWriteAct(ask, manifest), a put, row by row of the put table", () => {
  for (const [abbr, revtokCmp, revseqCmp, flags, presence, act] of PutRows) {
    it(`${abbr}: ${act}`, () => {
      for (const flag of flags) {
        for (const revseq of revseqsOf(revseqCmp)) {
          expect(scribedActOf(askOf(PutAsk, presence, flag), tagsOf(presence, revtokCmp, revseq)), `${flag} at ${revseq}`).to.eq(act)
        }
      }
    })
  }
})

describe("ManifestActs.scribeWriteAct(ask, manifest), a del, row by row of the del table", () => {
  for (const [abbr, revtokCmp, revseqCmp, presence, act] of DelRows) {
    it(`${abbr}: ${act}`, () => {
      const ask = withCitedAm(DelAsk, citedAmOf(presence))
      for (const revseq of revseqsOf(revseqCmp)) {
        expect(scribedActOf(ask, tagsOf(presence, revtokCmp, revseq)), revseq).to.eq(act)
      }
    })
  }
})

describe("ManifestActs.scribeWriteAct(ask, manifest), the life and liveness a matching revtok cites", () => {
  it("scribes clash where the ante row's lifepath is not the cited one", () => {
    expect(scribedActOf(askOf(PutAsk, 'live', 'repl'), tagsOf('live', 'eq', 'eq', { lifepath_eq: false }))).to.eq('clash')
    expect(scribedActOf(withCitedAm(DelAsk, 'a'), tagsOf('live', 'eq', 'eq', { lifepath_eq: false }))).to.eq('clash')
  })

  it("scribes clash where the ante row is live and the ask cites a tombstone, or the reverse", () => {
    const citingGone = withCitedAm(askOf(PutAsk, 'live', 'repl'), 'x')
    const citingLive = withCitedAm(askOf(PutAsk, 'gone', 'add'), 'a')
    expect(scribedActOf(citingGone, tagsOf('live', 'eq', 'eq'))).to.eq('clash')
    expect(scribedActOf(citingLive, tagsOf('gone', 'eq', 'eq'))).to.eq('clash')
  })
})

describe("ManifestActs.scribeWriteAct(ask, manifest), a write the tables let through and its fixed fields or policies forbid", () => {
  const PoliciedCases = [
    ["policied", PutAsk, { born_at_cmp: "changed" },                                     'scribes policied for a replacement that changes the born_at'],
    ["policied", PutAsk, { lifetok_cmp: "changed" },                                     'scribes policied for a replacement that changes the lifetok'],
    ["policied", DelAsk, { lifetok_cmp: "changed" },                                     'scribes policied for a deletion that changes the lifetok'],
    ["replaced", PutAsk, { born_at_cmp: "same", lifetok_cmp: "same" },                   'scribes the write where each fixed field is the same'],
  ] as const
  for (const [act, ask, overrides, blurb] of PoliciedCases) {
    it(blurb, () => {
      expect(scribedActOf(askOf(ask, 'live', 'repl'), tagsOf('live', 'eq', 'eq', overrides))).to.eq(act)
    })
  }

  it("scribes policied for a replacement that fails a storage policy it names, and the write where each it names is met", () => {
    const ask = { ...askOf(PutAsk, 'live', 'repl'), options: { policies: ['add_passkey', 'revoke_passkey'] } } as WriteAsk
    const failed = { add_passkey: { ok: true }, revoke_passkey: { ok: false, refusaltag: 'NoPasskeyStored' } } as const
    const met    = { add_passkey: { ok: true }, revoke_passkey: { ok: true } } as const
    expect(scribedActOf(ask, tagsOf('live', 'eq', 'eq', { policies: failed }))).to.eq('policied')
    expect(scribedActOf(ask, tagsOf('live', 'eq', 'eq', { policies: met }))).to.eq('replaced')
  })

  it("leaves an act that writes nothing as it is, whatever its fixed fields", () => {
    const changed = { born_at_cmp: 'changed', lifetok_cmp: 'changed' } as const
    expect(scribedActOf(askOf(PutAsk, 'live', 'get'), tagsOf('live', 'eq', 'eq', changed))).to.eq('passed')
    expect(scribedActOf(askOf(PutAsk, 'live', 'repl'), tagsOf('live', 'neq', 'stale', changed))).to.eq('stale')
  })
})

describe("ManifestActs.writeAnswerOf(ask, manifest), a policied write", () => {
  const PoliciedAsk = { ...askOf(PutAsk, 'live', 'repl'), options: { policies: ['add_passkey'] } } as WriteAsk
  const Failed      = { add_passkey: { ok: false, refusaltag: 'PasskeyStored' } } as const
  const RefusalCases = [
    ["bad_record", Phrases.BornAtMoved,                                        { born_at_cmp: "changed", lifetok_cmp: "changed", policies: Failed }, 'refuses bad_record for a changed born_at, before a failed storage policy or a changed lifetok'],
    ["gate_issue", BigPhrases.gateIssue(Phrases.PolicyPhrases.PasskeyStored),       { lifetok_cmp: "changed", policies: Failed },                         'refuses gate_issue with a failed storage policy\'s message, before a changed lifetok'],
    ["bad_record", Phrases.LifetokMoved,                                       { lifetok_cmp: "changed", policies: { add_passkey: { ok: true } } },  'refuses bad_record for a changed lifetok'],
  ] as const
  for (const [refusalkind, message, overrides, blurb] of RefusalCases) {
    it(blurb, () => {
      const answer = writeAnsweredOf(PoliciedAsk, tagsOf('live', 'eq', 'eq', overrides), LiveBox)
      const err    = refusalOf(answer)
      expect(answer.act).to.eq('policied')
      expect(err).to.deep.include({ refusalkind, message })
      expect(Errors.rowsOfRefusal(err)).to.deep.equal({ dbhas: LiveBox })
      expect(err.meta).to.deep.equal({ oplabel: 'writeThing', ask: answer.ask, act: 'policied' })
    })
  }

  it("refuses gate_issue with the message of each storage policy's refusaltag", () => {
    for (const refusaltag of Object.keys(Phrases.PolicyPhrases) as PolicyTag[]) {
      const answer = writeAnsweredOf(PoliciedAsk, tagsOf('live', 'eq', 'eq', { policies: { add_passkey: { ok: false, refusaltag } } }), LiveBox)
      expect(answer.act, refusaltag).to.eq('policied')
      expect(refusalOf(answer), refusaltag).to.deep.include({ refusalkind: 'gate_issue', message: BigPhrases.gateIssue(Phrases.PolicyPhrases[refusaltag]) })
    }
  })
})
