import { describe, expect, it } from 'vitest'
import { Box } from '../src/box'
import { FarFuture } from '../src/types'
import * as TH from './test-helpers'

const OldIso = '2026-10-14T00:00:00.000Z'

const wholeBox = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _boxRegistered, written_at: _boxWritten, ...boxWithoutTimes } = wholeBox
const boxV3 = { ...boxWithoutTimes, format: 'safebyok-box-v3', registered_at: Date.UTC(2026, 9, 14), changed_at: Date.UTC(2026, 9, 14) }
const { sidecar_json: _sidecarJson, ...sidecarless } = wholeBox
const boxV4 = { ...sidecarless, format: 'safebyok-box-v4', public_json: '{}' }
const BoxCases = [
  // regular usage:
  [wholeBox,                                               true,   'a whole box, with its sidecar'],
  [{ ...wholeBox, sidecar_json: '{}' },                    true,   'a box with an empty sidecar'],
  [{ ...wholeBox, sidecar_json: '"just text"' },           true,   'a sidecar of any JSON, not only an object'],
  [{ ...wholeBox, sidecar_json: '{"a":2,"b":[null,1.5]}' }, true,  'a sidecar as the vault writes it: keys sorted, no spacing'],
  [{ ...wholeBox, boxlabel: 'Ключ API: מפתח' },           true,   'a boxlabel of any text'],
  // refused, as a damaged or foreign record:
  [sidecarless,                                            false,  'a box with no sidecar: one is always written'],
  [{ ...wholeBox, sidecar_json: '{"note":' },              false,  'a sidecar that is not JSON'],
  [{ ...wholeBox, sidecar_json: '{"b":1, "a":2}' },        false,  'a sidecar respaced and reordered: not the text the vault writes'],
  [{ ...wholeBox, sidecar_json: '{"b":1,"a":2}' },         false,  'a sidecar with its keys out of order'],
  [{ ...wholeBox, sidecar_json: '1.0' },                   false,  'a number written otherwise than JSON writes it'],
  [{ ...wholeBox, sidecar_json: `${'['.repeat(200_000)}${']'.repeat(200_000)}` }, false, 'a sidecar nested too deep to serialize again, refused calmly'],
  [{ ...wholeBox, sidecar_json: { note: 'work' } },        false,  'a sidecar stored as an object rather than its JSON'],
  [{ ...wholeBox, note: 'work account' },                  true,   'an unknown field such as the old note is dropped, never kept'],
  [{ ...wholeBox, whisper_codec: 'json_v2' },              false,  'a whisper codec this version does not know'],
  [{ ...wholeBox, whisper_schema_version: 2 },             false,  'a whisper schema version this version does not know'],
  [TH.omitting(wholeBox, 'whisper_codec'),                 false,  'a box missing its whisper codec'],
  [{ ...wholeBox, format: 'safebyok-box-v7' },         false,  'a format this version does not know'],
  [{ ...wholeBox, format: 'safebyok-box-v2' },         false,  'a box from before the sidecar'],
  [boxV3,                                              false,  'a box from before written_at, holding changed_at'],
  [boxV4,                                              false,  'a box from before the sidecar was named, holding public_json'],
  [{ ...wholeBox, vault_key_epoch: 1.5 },                  false,  'a vaultKey epoch that is not a whole number'],
  [{ ...wholeBox, written_at: FarFuture + 1 },             false,  'a written_at past FarFuture'],
  [{ ...wholeBox, registered_at: Infinity },               false,  'a registered_at that never comes'],
  [{ ...wholeBox, written_at: null },                      false,  'a null written_at'],
  [{ ...wholeBox, registered_at: Date.UTC(2026, 9, 14) + 0.5 }, false, 'a registered_at with a fraction of a millisecond'],
  [boxWithoutTimes,                                        false,  'a box missing its times'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso }, false, 'a box from before its times were named registered_at and changed_at'],
] as const

describe("Box", () => {
  for (const [candidate, expected, blurb] of BoxCases) {
    it(blurb, () => { expect(Box.safeParse(candidate).success).to.eq(expected) })
  }

  it("keeps none of a field it does not know, such as the note a box once had", () => {
    expect(Box.parse({ ...wholeBox, note: 'work account' })).to.deep.equal(wholeBox)
  })
})
