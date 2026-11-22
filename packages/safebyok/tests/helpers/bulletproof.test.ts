import { describe, expect, it } from 'vitest'
import * as Throwers from '../../src/refusals/throwers'
import { bulletproofAsyncHandlerOf, bulletproofHandlerOf } from '../../src/helpers/bulletproof'
import * as TH from '../test-helpers'

/** A transformer that wraps whatever it is handed as the cause of a new Error, recording each one. */
function recordingTransformer(): { transformer: (thrown: unknown) => Error, handed: unknown[] } {
  const handed: unknown[] = []
  return { handed, transformer: (thrown) => { handed.push(thrown); return new Error('transformed', { cause: thrown }) } }
}

/** An `onBadNews` that records each Error it is told. */
function recordingTeller(): { onBadNews: (err: Error) => void, told: Error[] } {
  const told: Error[] = []
  return { told, onBadNews: (err) => { told.push(err) } }
}

/** A handler, declared to return a number, that throws `thrown`. */
function throwing(thrown: unknown): () => number {
  return () => { throw thrown }
}

/** A handler, declared to resolve a number, that rejects with `thrown`. */
function rejecting(thrown: unknown): () => Promise<number> {
  return () => Promise.reject(thrown) // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- a host's handler may reject with anything
}

const TellNothing = (_err: Error): void => { /* Told nothing. */ }

const BadArgsCases = [
  // the handler:
  [undefined,     { ifError: 'fail', transformer: Throwers.sanitizeForeignError },                         'refuses a missing handler'],
  ["handler",     { ifError: 'fail', transformer: Throwers.sanitizeForeignError },                         'refuses a handler that is no function'],
  // the options:
  [() => 1,       undefined,                                                                               'refuses missing options'],
  [() => 1,       { ifError: 'retry', transformer: Throwers.sanitizeForeignError },                        'refuses an ifError that is neither fail nor tell'],
  [() => 1,       { ifError: 'fail' },                                                                     'refuses options without a transformer'],
  [() => 1,       { ifError: 'fail', transformer: 'sanitize' },                                            'refuses a transformer that is no function'],
  [() => 1,       { ifError: 'tell', transformer: Throwers.sanitizeForeignError },                         'refuses telling without an onBadNews'],
  [() => 1,       { ifError: 'fail', transformer: Throwers.sanitizeForeignError, onBadNews: TellNothing }, 'refuses an onBadNews where it would never be told'],
  [() => 1,       { ifError: 'fail', transformer: Throwers.sanitizeForeignError, retries: 3 },             'refuses an option it does not know'],
] as const

describe("bulletproofHandlerOf", () => {
  it("returns what the handler returns, untouched, handed the caller's arguments", () => {
    const answer = { joke: 'knock knock' }
    const handed: unknown[] = []
    const wrapped = bulletproofHandlerOf((first: string, second: number) => { handed.push(first, second); return answer }, { ifError: 'fail', transformer: Throwers.sanitizeForeignError })
    expect(wrapped('who', 2)).to.eq(answer)
    expect(handed).to.deep.equal(['who', 2])
  })

  it("calls neither the transformer nor onBadNews when the handler does not throw", () => {
    const { transformer, handed } = recordingTransformer()
    const { onBadNews, told } = recordingTeller()
    expect(bulletproofHandlerOf(() => 7, { ifError: 'tell', transformer, onBadNews })()).to.eq(7)
    expect(handed).to.have.lengthOf(0)
    expect(told).to.have.lengthOf(0)
  })

  it("hands the transformer exactly what the handler threw, and rethrows its Error under fail", () => {
    const thrown = { code: 'ENOPE' }
    const { transformer, handed } = recordingTransformer()
    const wrapped = bulletproofHandlerOf(throwing(thrown), { ifError: 'fail', transformer })
    expect(wrapped).to.throw(Error, 'transformed')
    expect(handed).to.have.lengthOf(1)
    expect(handed[0]).to.eq(thrown)
  })

  it("rethrows a host's Error as the same object, and a thrown string as an Error's message, with sanitizeForeignError", () => {
    const hostErr = new TypeError('the form has no apiKey')
    expect(bulletproofHandlerOf(throwing(hostErr), { ifError: 'fail', transformer: Throwers.sanitizeForeignError })).to.throw(hostErr)
    expect(bulletproofHandlerOf(throwing('no apiKey'), { ifError: 'fail', transformer: Throwers.sanitizeForeignError })).to.throw(Error, 'no apiKey')
  })

  it("tells onBadNews the transformer's Error under tell, and returns undefined without throwing", () => {
    const { transformer } = recordingTransformer()
    const { onBadNews, told } = recordingTeller()
    const wrapped = bulletproofHandlerOf(throwing(42), { ifError: 'tell', transformer, onBadNews })
    expect(wrapped()).to.be.undefined
    expect(told).to.have.lengthOf(1)
    expect(told[0]?.message).to.eq('transformed')
    expect(told[0]?.cause).to.eq(42)
  })

  it("lets what the transformer throws reach the caller, in either mode", () => {
    const transformerErr = new Error('the transformer is broken')
    const transformer = (): Error => { throw transformerErr }
    const { onBadNews, told } = recordingTeller()
    expect(bulletproofHandlerOf(throwing('x'), { ifError: 'fail', transformer })).to.throw(transformerErr)
    expect(bulletproofHandlerOf(throwing('x'), { ifError: 'tell', transformer, onBadNews })).to.throw(transformerErr)
    expect(told).to.have.lengthOf(0)
  })

  it("lets what onBadNews throws reach the caller", () => {
    const tellerErr = new Error('the teller is broken')
    const onBadNews = (): void => { throw tellerErr }
    expect(bulletproofHandlerOf(throwing('x'), { ifError: 'tell', transformer: Throwers.sanitizeForeignError, onBadNews })).to.throw(tellerErr)
  })

  it("returns a handler's rejected promise as it is, catching nothing", async () => {
    const { transformer, handed } = recordingTransformer()
    const rejected = rejecting('later')()
    const wrapped = bulletproofHandlerOf(() => rejected, { ifError: 'fail', transformer })
    expect(wrapped()).to.eq(rejected)
    await expect(rejected).rejects.toThrow('later')
    expect(handed).to.have.lengthOf(0)
  })

  for (const [handler, opts, blurb] of BadArgsCases) {
    it(blurb, () => {
      TH.expectSyncRefusal(() => bulletproofHandlerOf(handler as never, opts as never), 'bad_record')
    })
  }
})

describe("bulletproofAsyncHandlerOf", () => {
  it("resolves what the handler resolves, untouched, handed the caller's arguments", async () => {
    const answer = { joke: 'knock knock' }
    const wrapped = bulletproofAsyncHandlerOf(async (first: string) => { await Promise.resolve(); return first === 'who' ? answer : null }, { ifError: 'fail', transformer: Throwers.sanitizeForeignError })
    expect(await wrapped('who')).to.eq(answer)
  })

  it("resolves what a handler returns that is no promise", async () => {
    const wrapped = bulletproofAsyncHandlerOf(() => 7, { ifError: 'fail', transformer: Throwers.sanitizeForeignError })
    expect(await wrapped()).to.eq(7)
  })

  it("hands the transformer exactly what the handler rejected with, and rejects with its Error under fail", async () => {
    const thrown = { code: 'ENOPE' }
    const { transformer, handed } = recordingTransformer()
    await expect(bulletproofAsyncHandlerOf(rejecting(thrown), { ifError: 'fail', transformer })()).rejects.toThrow('transformed')
    expect(handed).to.have.lengthOf(1)
    expect(handed[0]).to.eq(thrown)
  })

  it("rejects with the transformer's Error for what a handler throws before returning a promise", async () => {
    const { transformer, handed } = recordingTransformer()
    await expect(bulletproofAsyncHandlerOf(throwing('at once'), { ifError: 'fail', transformer })()).rejects.toThrow('transformed')
    expect(handed).to.deep.equal(['at once'])
  })

  it("tells onBadNews the transformer's Error under tell, and resolves undefined", async () => {
    const { onBadNews, told } = recordingTeller()
    expect(await bulletproofAsyncHandlerOf(rejecting('no deriver'), { ifError: 'tell', transformer: Throwers.sanitizeForeignError, onBadNews })()).to.be.undefined
    expect(told).to.have.lengthOf(1)
    expect(told[0]?.message).to.eq('no deriver')
  })

  it("rejects with what the transformer throws, in either mode", async () => {
    const transformerErr = new Error('the transformer is broken')
    const transformer = (): Error => { throw transformerErr }
    const { onBadNews, told } = recordingTeller()
    await expect(bulletproofAsyncHandlerOf(rejecting('x'), { ifError: 'fail', transformer })()).rejects.toThrow(transformerErr)
    await expect(bulletproofAsyncHandlerOf(rejecting('x'), { ifError: 'tell', transformer, onBadNews })()).rejects.toThrow(transformerErr)
    expect(told).to.have.lengthOf(0)
  })

  for (const [handler, opts, blurb] of BadArgsCases) {
    it(blurb, () => {
      TH.expectSyncRefusal(() => bulletproofAsyncHandlerOf(handler as never, opts as never), 'bad_record')
    })
  }
})
