import { inspect } from 'node:util'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Cloak, cloak } from '../../src/helpers/cloak'
import * as TH from '../test-helpers'

/** A passphrase, an obvious fake. */
const FakePassphrase = 'fake passphrase'

/** A new passphrase, an obvious fake. */
const FakeNextPassphrase = 'fake next passphrase'

describe("cloak", () => {
  it("reads each cleartext it adopted through its getter", () => {
    const cloaked = cloak({ passphraseClear: FakePassphrase, nextPassphraseClear: FakeNextPassphrase })
    expect(cloaked).to.be.instanceOf(Cloak)
    expect([cloaked.passphraseClear, cloaked.nextPassphraseClear]).to.deep.equal([FakePassphrase, FakeNextPassphrase])
    expect([cloaked.passkeyClear, cloaked.nextPasskeyClear]).to.deep.equal([undefined, undefined])
  })

  it("reads a passkey answer of null as null", () => {
    expect(cloak({ passphraseClear: FakePassphrase, passkeyClear: null }).passkeyClear).to.be.null
  })

  it("zeroes the PRF bytes of each passkey answer handed in, keeping a copy of its own", () => {
    const passkeyCleartext     = TH.passkeyAnswerOf()
    const nextPasskeyCleartext = TH.passkeyAnswerOf()
    const handed = [passkeyCleartext, nextPasskeyCleartext].map((answer) => ({ ...answer, prfBytes: new Uint8Array(answer.prfBytes) }))
    const cloaked = cloak({ passkeyClear: passkeyCleartext, nextPasskeyClear: nextPasskeyCleartext })
    expect([TH.isZeroed(passkeyCleartext.prfBytes), TH.isZeroed(nextPasskeyCleartext.prfBytes)]).to.deep.equal([true, true])
    expect([cloaked.passkeyClear, cloaked.nextPasskeyClear]).to.deep.equal(handed)
  })

  it("adopts a passkey answer from another realm", () => {
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    const cloaked = cloak({ passkeyClear: { ...TH.passkeyAnswerOf(), prfBytes } })
    expect(TH.isZeroed(prfBytes)).to.be.true
    expect([...cloaked.passkeyClear!.prfBytes]).to.deep.equal(Array.from({ length: 32 }, () => 7))
  })

  it("hands out a fresh copy of a passkey answer at each read, so zeroing one leaves the next whole", () => {
    const cloaked = cloak({ passkeyClear: TH.passkeyAnswerOf() })
    const first = cloaked.passkeyClear!
    first.prfBytes.fill(0)
    const second = cloaked.passkeyClear!
    expect(second).to.not.eq(first)
    expect(TH.isZeroed(second.prfBytes)).to.be.false
  })

  it("refuses what is not an object", () => {
    for (const notObject of [null, undefined, FakePassphrase, 42, [FakePassphrase]]) {
      TH.expectSyncRefusal(() => cloak(notObject as never), 'bad_record')
    }
  })

  it("refuses a field no form verb takes, quoting nothing of it", () => {
    const err = TH.expectSyncRefusal(() => cloak({ passphraseClear: FakePassphrase, passphrase: FakeNextPassphrase } as never), 'bad_record')
    expect(TH.thrownText(err)).to.not.include(FakePassphrase).and.not.include(FakeNextPassphrase)
  })

  it("refuses cleartexts whose getter throws, keeping nothing of the throw", () => {
    const cleartexts = { get passphraseClear(): string { throw new Error(FakePassphrase) } }
    const err = TH.expectSyncRefusal(() => cloak(cleartexts), 'unexpected_error')
    expect(TH.thrownText(err)).to.not.include(FakePassphrase)
  })
})

describe("Cloak.vacate", () => {
  it("empties every getter", () => {
    const cloaked = cloak({ passphraseClear: FakePassphrase, passkeyClear: TH.passkeyAnswerOf(), nextPassphraseClear: FakeNextPassphrase, nextPasskeyClear: TH.passkeyAnswerOf() })
    cloaked.vacate()
    expect([cloaked.passphraseClear, cloaked.passkeyClear, cloaked.nextPassphraseClear, cloaked.nextPasskeyClear]).to.deep.equal([undefined, undefined, undefined, undefined])
  })

  it("zeroes the PRF bytes the cloak had", () => {
    const handed  = TH.passkeyAnswerOf()
    const cloaked = cloak({ passkeyClear: handed })
    const copy    = cloaked.passkeyClear!
    const fill    = vi.spyOn(Uint8Array.prototype, 'fill')
    onTestFinished(() => { fill.mockRestore() })
    cloaked.vacate()
    // The bytes zeroed are the cloak's own: neither the host's, zeroed at adoption, nor a copy a getter handed out.
    expect(fill.mock.calls).to.deep.equal([[0]])
    const [zeroed] = fill.mock.contexts as Uint8Array[]
    expect([zeroed === handed.prfBytes, zeroed === copy.prfBytes, TH.isZeroed(zeroed!)]).to.deep.equal([false, false, true])
  })
})

describe("a cloak's redaction", () => {
  const cloaked = cloak({ passphraseClear: FakePassphrase, passkeyClear: TH.passkeyAnswerOf() })

  it("serializes as the marker", () => {
    expect(JSON.stringify({ variables: cloaked })).to.eq('{"variables":"[cloaked]"}')
  })

  it("prints as the marker", () => {
    expect([String(cloaked), inspect(cloaked), inspect({ variables: cloaked })]).to.deep.equal(['[cloaked]', '[cloaked]', '{ variables: [cloaked] }'])
  })

  it("has no field of its own", () => {
    expect(Reflect.ownKeys(cloaked)).to.deep.equal([])
  })
})
