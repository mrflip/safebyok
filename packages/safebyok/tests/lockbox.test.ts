import { describe, expect, it } from 'vitest'
import { Lockbox } from '../src/lockbox'
import { FarFuture } from '../src/types'
import * as TH from './test-helpers'

const OldIso = '2026-10-14T00:00:00.000Z'

const wholeBox = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _boxRegistered, written_at: _boxWritten, ...boxWithoutTimes } = wholeBox
const lockboxV3 = { ...boxWithoutTimes, format: 'safebyok-lockbox-v3', registered_at: Date.UTC(2026, 9, 14), changed_at: Date.UTC(2026, 9, 14) }
const { public_json: _publicJson, ...bagless } = wholeBox
const LockboxCases = [
  // regular usage:
  [wholeBox,                                               true,   'a whole lockbox, with its public bag'],
  [{ ...wholeBox, public_json: '{}' },                     true,   'a lockbox with an empty public bag'],
  [{ ...wholeBox, public_json: '"just text"' },            true,   'a public bag of any JSON, not only an object'],
  [{ ...wholeBox, public_json: '{"a":2,"b":[null,1.5]}' }, true,   'a public bag as the vault writes it: keys sorted, no spacing'],
  [{ ...wholeBox, boxlabel: 'Ключ API: מפתח' },           true,   'a boxlabel of any text'],
  // refused, as a damaged or foreign record:
  [bagless,                                                false,  'a lockbox with no public bag: one is always written'],
  [{ ...wholeBox, public_json: '{"note":' },               false,  'a public bag that is not JSON'],
  [{ ...wholeBox, public_json: '{"b":1, "a":2}' },         false,  'a public bag respaced and reordered: not the text the vault writes'],
  [{ ...wholeBox, public_json: '{"b":1,"a":2}' },          false,  'a public bag with its keys out of order'],
  [{ ...wholeBox, public_json: '1.0' },                    false,  'a number written otherwise than JSON writes it'],
  [{ ...wholeBox, public_json: `${'['.repeat(200_000)}${']'.repeat(200_000)}` }, false, 'a public bag nested too deep to serialize again, refused calmly'],
  [{ ...wholeBox, public_json: { note: 'work' } },         false,  'a public bag stored as an object rather than its JSON'],
  [{ ...wholeBox, note: 'work account' },                  true,   'an unknown field such as the old note is dropped, never kept'],
  [{ ...wholeBox, whisper_codec: 'json_v2' },              false,  'a whisper codec this version does not know'],
  [{ ...wholeBox, whisper_schema_version: 2 },             false,  'a whisper schema version this version does not know'],
  [TH.omitting(wholeBox, 'whisper_codec'),                 false,  'a lockbox missing its whisper codec'],
  [{ ...wholeBox, format: 'safebyok-lockbox-v5' },         false,  'a format this version does not know'],
  [{ ...wholeBox, format: 'safebyok-lockbox-v2' },         false,  'a lockbox from before the public bag'],
  [lockboxV3,                                              false,  'a lockbox from before written_at, holding changed_at'],
  [{ ...wholeBox, vault_key_epoch: 1.5 },                  false,  'a vaultKey epoch that is not a whole number'],
  [{ ...wholeBox, written_at: FarFuture + 1 },             false,  'a written_at past FarFuture'],
  [{ ...wholeBox, registered_at: Infinity },               false,  'a registered_at that never comes'],
  [{ ...wholeBox, written_at: null },                      false,  'a null written_at'],
  [{ ...wholeBox, registered_at: Date.UTC(2026, 9, 14) + 0.5 }, false, 'a registered_at with a fraction of a millisecond'],
  [boxWithoutTimes,                                        false,  'a lockbox missing its times'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso }, false, 'a lockbox from before its times were named registered_at and changed_at'],
] as const

describe("Lockbox", () => {
  for (const [candidate, expected, blurb] of LockboxCases) {
    it(blurb, () => { expect(Lockbox.safeParse(candidate).success).to.eq(expected) })
  }

  it("keeps none of a field it does not know, such as the note a lockbox once had", () => {
    expect(Lockbox.parse({ ...wholeBox, note: 'work account' })).to.deep.equal(wholeBox)
  })
})
