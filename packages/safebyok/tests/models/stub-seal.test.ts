import { describe, expect, it } from 'vitest'
import * as MSX from '../../src/models/models-shapes'
import { StubBoxKeyWrapped, StubWhisperCiphered, stubSeal } from '../../src/models/stub-seal'
import type { Sidecar } from '../../src/shapes/box'
import * as TH from '../test-helpers'
import { fullBoxRecord, sparseBoxRecord } from '../test-helpers/models-world'

describe("stubSeal(staged, whisper)", () => {
  it("makes the full record of the staged, its sealed parts the placeholders, as its example shows", async () => {
    const staged = { ...sparseBoxRecord(), sidecar: {} }
    const sealed = await stubSeal(staged, 'sk-test-0000')
    expect(sealed).to.deep.equal({ ...staged, box_key_wrapped: StubBoxKeyWrapped, whisper_ciphered: StubWhisperCiphered })
    expect(MSX.boxRecord.parse(sealed)).to.deep.equal(sealed)
  })

  it("keeps the staged's sidecar, revision and times as given", async () => {
    const staged = { ...sparseBoxRecord({ revision_tok: 'rev-a7', revision_seq: 7 }), sidecar: { account: 'work' } }
    const sealed = await stubSeal(staged, 'sk-test-0000')
    expect(sealed).to.include({ revision_tok: 'rev-a7', revision_seq: 7, registered_at: staged.registered_at, written_at: staged.written_at })
    expect(sealed.sidecar).to.deep.equal(staged.sidecar)
  })

  it("replaces the sealed parts a full staged carries", async () => {
    const sealed = await stubSeal(fullBoxRecord(), 'sk-test-0000')
    expect(sealed.box_key_wrapped).to.deep.equal(StubBoxKeyWrapped)
    expect(sealed.whisper_ciphered).to.deep.equal(StubWhisperCiphered)
  })
})

describe("stubSeal(staged, whisper): no secret material", () => {
  const staged = { ...sparseBoxRecord(), sidecar: {} }

  it("makes the same record whatever the whisper, so nothing in it is derived from the whisper", async () => {
    const one = await stubSeal(staged, 'sk-test-one')
    const other = await stubSeal(staged, { key: 'sk-test-other', org: 'acme' })
    expect(one).to.deep.equal(other)
  })

  it("carries none of the whisper in what it makes", async () => {
    const sealed = await stubSeal(staged, { key: 'sk-test-SECRET' })
    expect(JSON.stringify(sealed)).to.not.include('SECRET')
  })

  it("refuses 'bad_record' a staged that makes no full record, quoting none of the whisper", async () => {
    const err = await TH.expectRefusal((async () => stubSeal({ ...staged, sidecar: 'no bag' as unknown as Sidecar }, 'sk-test-SECRET'))(), 'bad_record')
    expect(err.message).to.not.include('SECRET')
    expect(JSON.stringify(err.meta)).to.not.include('SECRET')
  })
})
