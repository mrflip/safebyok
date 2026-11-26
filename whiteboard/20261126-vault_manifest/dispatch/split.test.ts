import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import type { CheckedGetManifest, CheckedWriteManifest, WriteTags } from './tree/packages/safebyok/src/shapes/shapes-manifest'
import type { GetAsk, WriteAsk } from './tree/packages/safebyok/src/shapes/shapes-asks'
import * as ManifestActs from './tree/packages/safebyok/src/storage/manifest-acts'
import { readTcNow } from './tree/packages/safebyok/src/storage/agerank'
import * as TH from './tree/packages/safebyok/tests/test-helpers'
import { PoliciedRefusals, brokenOf, getActOf, policyFailureOf, writeActOf } from './split-tables'

const LiveBox = TH.boxThingOf()
const PutAsk  = TH.replaceAskOf(LiveBox, TH.nextOf(LiveBox))
const DelAsk  = TH.delAskFor(LiveBox, TH.boxTombOf(LiveBox))
const bools = [true, false] as const, sames = ['same', 'changed', 'moot'] as const
const policySets = [{}, { replace_passphrase: { ok: true } }, { replace_passphrase: { ok: false, message: 'nope' } }] as const
function* asks(): Generator<WriteAsk> {
  for (const am of ['a', 'x']) {
    for (const ifAbsent of ['add', 'fail']) for (const ifPresent of ['repl', 'fail', 'get']) for (const named of [undefined, ['replace_passphrase']])
      yield { ...PutAsk, ifAbsent, ifPresent, options: named && { policies: named }, cited: { ...PutAsk.cited, am } } as WriteAsk
    yield { ...DelAsk, cited: { ...DelAsk.cited, am } } as WriteAsk
  }
}
function* allTags(): Generator<WriteTags> {
  for (const presence of ['void', 'gone', 'live']) for (const revtok_cmp of ['birth', '=next', 'eq', 'neq']) for (const revseq_cmp of ['birth', 'eq', 'stale', 'ahead'])
    for (const lifepath_eq of bools) for (const born_at_cmp of sames) for (const lifetok_cmp of sames) for (const policies of policySets)
      yield { presence, revtok_cmp, revseq_cmp, lifepath_eq, born_at_cmp, lifetok_cmp, policies, written: false } as WriteTags
}
const base = { actual: null, ancestor: null, banktok: SX.VoidLifeTok, tracked: { bank: 'same', gate: 'same', box: 'same' }, read_tc: readTcNow() }

describe('decomposition B', () => {
  it('matches scribeWriteAct and writeAnswerOf over every combination', () => {
    let count = 0
    const bad: string[] = []
    for (const ask of asks()) for (const tags of allTags()) {
      const manifest = { ...base, tags } as CheckedWriteManifest
      ManifestActs.scribeWriteAct(ask, manifest)
      const answer = ManifestActs.writeAnswerOf(ask, manifest)
      const act = writeActOf(ask, tags)
      const broken = brokenOf(ask, tags)
      const meta = { oplabel: 'writeThing', ask: answer.ask }
      const err = (act === 'policied') ? PoliciedRefusals[broken!](null, policyFailureOf(ask, tags) ?? '', meta as never) : (answer.ok ? null : 'same-thrower')
      const ok = answer.ok ? '-' : `${answer.err.kind}:${answer.err.message}`
      const mine = (err === null) ? '-' : (err === 'same-thrower') ? ok : `${err.kind}:${err.message}`
      if ((manifest.act !== act) || (ok !== mine)) { bad.push(`${ask.op} ${JSON.stringify(tags)} today=${manifest.act} B=${act}`) }
      count += 1
    }
    console.log(`B write: ${count} combinations, ${bad.length} mismatches`)
    expect(bad.slice(0, 5)).toEqual([])
  })
  it('matches scribeGetAct', () => {
    let count = 0
    for (const ifAbsent of ['nil', 'fail']) for (const presence of ['void', 'gone', 'live']) {
      const manifest = { ...base, tags: { presence } } as unknown as CheckedGetManifest
      ManifestActs.scribeGetAct({ ifAbsent } as GetAsk, manifest)
      expect(getActOf({ ifAbsent } as GetAsk, { presence } as never)).toBe(manifest.act)
      count += 1
    }
    console.log(`B get: ${count} combinations match`)
  })
})
