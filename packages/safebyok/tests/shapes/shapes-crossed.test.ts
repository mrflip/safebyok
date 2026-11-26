/** A refusal across a wire: what crossedErrOf lets cross, what refusedOverWire makes of it again, and what each refuses. */

import { describe, expect, it } from 'vitest'
import { Errors } from 'safebyok-big/internals'
import { CrossedChecks, crossedErrOf, refusedOverWire } from '../../src/shapes/shapes-crossed'
import * as TH from '../test-helpers'

/** A server's refusal, with a cause, an ask and rows that must not cross, and a meta of which only some fields may. */
function serverRefusal(meta: Errors.RefusalMeta = {}): Errors.VaultError {
  const fullMeta = { oplabel: 'getThing', act: 'void', fieldnames: ['labelpath'], ask: { ...TH.getGateAskOf() }, ...meta } as const
  return new Errors.VaultError('storage_unavailable', 'The datastore hiccuped', { cause: new Error('connect db.internal password=hunter2'), meta: fullMeta, rows: { dbhas: TH.gateThingOf() } })
}

describe("crossedErrOf", () => {
  it("lets a refusal's kind, message and allowlisted meta cross, never its cause, ask or rows", () => {
    const crossed = crossedErrOf(serverRefusal())
    expect(crossed).to.deep.eq({
      refusalkind: 'storage_unavailable',
      message:     'The datastore hiccuped',
      meta:        { oplabel: 'getThing', act: 'void', capacity: null, fieldnames: ['labelpath'], labelpaths: null },
    })
    expect(JSON.stringify(crossed)).not.to.include('hunter2').and.not.to.include('whisper')
    expect(CrossedChecks.err.parse(crossed)).to.deep.eq(crossed)
  })

  it("keeps an infinite capacity as the largest safe integer, which JSON can carry", () => {
    const crossed = crossedErrOf(serverRefusal({ capacity: { boxes: { used: 3, max: Infinity }, bytes: { used: 900, max: 1000 } } }))
    expect(crossed.meta?.capacity).to.deep.eq({ boxes: { used: 3, max: Number.MAX_SAFE_INTEGER }, bytes: { used: 900, max: 1000 } })
  })

  it("refuses what is not a VaultError", () => {
    for (const notRefusal of [null, undefined, new Error('Not a refusal'), { refusalkind: 'bad_record', message: 'Looks like one' }]) {
      TH.expectSyncRefusal(() => crossedErrOf(notRefusal as never), 'bad_record')
    }
  })
})

describe("refusedOverWire", () => {
  it("makes a refusal that crossed a VaultError again, naming no Thing", () => {
    const refusal = refusedOverWire(crossedErrOf(serverRefusal()))
    expect(refusal).to.be.instanceOf(Errors.VaultError)
    expect(refusal).to.deep.include({ refusalkind: 'storage_unavailable', message: 'The datastore hiccuped' })
    expect(refusal.meta).to.deep.eq({ oplabel: 'getThing', act: 'void', fieldnames: ['labelpath'] })
    expect(Errors.rowsOfRefusal(refusal)).to.deep.eq({})
  })

  it("lays the answer's act over the refusal's", () => {
    const refusal = refusedOverWire(crossedErrOf(serverRefusal()), { act: 'gone' })
    expect(refusal.meta).to.have.property('act', 'gone')
  })

  it("refuses a refusal that does not cross as one", () => {
    const crossed = crossedErrOf(serverRefusal())
    const MalformedCases = [
      [null,                                                      'no refusal at all'],
      [{ ...crossed, refusalkind: 'datastore_sad' },              'a refusalkind there is none of'],
      [{ refusalkind: 'bad_record', meta: null },                 'no message'],
      [{ ...crossed, cause: 'connect db.internal' },              'a cause beside it'],
      [{ ...crossed, meta: { ...crossed.meta, ask: {} } },        'an ask in its meta'],
      [{ ...crossed, meta: { ...crossed.meta, act: 'gotlive' } }, 'a good act in its meta'],
    ] as const
    for (const [malformed, blurb] of MalformedCases) {
      expect(() => refusedOverWire(malformed as never), blurb).to.throw(Errors.VaultError).with.property('refusalkind', 'storage_issue')
    }
  })

  it("refuses an answer beside it that does not name an act", () => {
    const crossed = crossedErrOf(serverRefusal())
    const MalformedCases = [
      [null,                           'no answer at all'],
      [{ act: 'gotlive' },             'a good act'],
      [{ dbhas: TH.gateThingOf() },    'a Thing beside it'],
      [{ act: 'void', rows: {} },      'rows beside it'],
    ] as const
    for (const [answered, blurb] of MalformedCases) {
      expect(() => refusedOverWire(crossed, answered as never), blurb).to.throw(Errors.VaultError).with.property('refusalkind', 'storage_issue')
    }
  })
})
