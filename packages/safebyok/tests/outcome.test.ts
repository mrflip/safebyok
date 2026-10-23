import { describe, expect, expectTypeOf, it } from 'vitest'
import { VaultError } from '../src/errors'
import { type Outcome, bad, good, isOutcomeShaped, outcomeOf, unexpectedError, valOf } from '../src/outcome'
import * as Refusals from '../src/refusals'

/** An app's own call, which rejects: what outcomeOf's first example wraps. */
const fetchBackup = (vaultlabel: string): Promise<string> => Promise.reject(new TypeError(`no backup of ${vaultlabel}`))

describe("good and bad", () => {
  it("makes a good outcome of a val, as good's example shows (Contract: Shapes)", () => {
    const vaultProps = { vault_tok: 'vault-tok-u1' }
    expect(good(vaultProps)).to.deep.equal({ ok: true, val: vaultProps })
    expect(good(null)).to.deep.equal({ ok: true, val: null })
  })

  it("makes a bad outcome of a refusal, as bad's example shows (Contract: Shapes)", () => {
    const err = Refusals.staleWrite('del')
    const outcome = bad(err)
    expect(outcome).to.deep.equal({ ok: false, err })
    expect(outcome).to.not.have.property('val')
  })
})

describe("Outcome", () => {
  it("narrows on ok, so a destructured val is the answer once a refusal has returned, as its example shows (Contract: Shapes)", () => {
    const answer = (outcome: Outcome<number | null>): number | null | VaultError => {
      const { ok, val, err } = outcome
      if (! ok) {
        expectTypeOf(err).toEqualTypeOf<VaultError>()
        return err
      }
      expectTypeOf(val).toEqualTypeOf<number | null>()
      return val
    }
    expect(answer(good(7))).to.eq(7)
    const locked = bad(new VaultError('vault_locked', 'Unlock it first.'))
    expect(answer(locked)).to.be.instanceOf(VaultError)
  })

  it("has an err that is always a VaultError, so throw err always works (Contract: Shapes)", () => {
    const outcomes: Outcome<string>[] = [bad(new VaultError('absent_box', 'No box under that label.'))]
    expect(() => { for (const { ok, err } of outcomes) { if (! ok) { throw err } } }).to.throw(VaultError)
  })
})

describe("outcomeOf", () => {
  it("resolves what a body returns, sync or async, as a good outcome", async () => {
    expect(await outcomeOf(() => 'sync')).to.deep.equal({ ok: true, val: 'sync' })
    expect(await outcomeOf(() => Promise.resolve('async'))).to.deep.equal({ ok: true, val: 'async' })
    expect(await outcomeOf(() => undefined)).to.deep.equal({ ok: true, val: undefined })
  })

  it("keeps a VaultError the body throws or rejects with, as it came (Contract: Shapes)", async () => {
    const refusal = new VaultError('not_permitted', 'Not yours to make.')
    const thrown = await outcomeOf(() => { throw refusal })
    expect(thrown.err).to.eq(refusal)
    const rejected = await outcomeOf(() => Promise.reject(refusal))
    expect(rejected.err).to.eq(refusal)
  })

  it("turns anything else thrown into storage_unavailable, the thrown value its cause, as its second example shows (Contract: Shapes)", async () => {
    const socketClosed = new Error('socket closed')
    const { ok, err } = await outcomeOf(() => { throw socketClosed })
    expect(ok).to.be.false
    expect(err).to.be.instanceOf(VaultError)
    expect(err?.refusalkind).to.eq('storage_unavailable')
    expect(err?.family).to.eq('condition')
    expect(err?.cause).to.eq(socketClosed)
  })

  it("turns a thrown string, or a rejection with nothing, into storage_unavailable with a cause that is never null", async () => {
    const fromString = await outcomeOf(() => { throw 'down' })  // eslint-disable-line @typescript-eslint/only-throw-error -- a backend that throws a string is what this guards against
    expect(fromString.err?.cause).to.eq('down')
    const fromNothing = await outcomeOf(() => Promise.reject(undefined))  // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- likewise, a rejection with nothing
    expect(fromNothing.err?.refusalkind).to.eq('storage_unavailable')
    expect(fromNothing.err?.cause).to.be.instanceOf(Error)
  })

  it("never rejects: what an app wraps is one Outcome whatever happens, as its first example shows", async () => {
    const { ok, val, err } = await outcomeOf(() => fetchBackup('main'))
    expect(ok).to.be.false
    expect(val).to.be.undefined
    expect(err?.message).to.not.include('main')
  })
})

describe("outcomeOf, told otherwise", () => {
  it("turns a throw that is no VaultError into what otherwise makes of it, as its third example shows", async () => {
    const parseImport = (file: string): string => { throw new TypeError(`cannot parse ${file}`) }
    const { err } = await outcomeOf(() => parseImport('backup.json'), unexpectedError)
    expect(err?.refusalkind).to.eq('unexpected_error')
    expect(err?.family).to.eq('misuse')
    expect(err?.cause).to.be.instanceOf(TypeError)
  })

  it("keeps a VaultError as it came, whatever otherwise would make", async () => {
    const refusal = new VaultError('absent_box', 'No box under that label.')
    const kept = await outcomeOf(() => { throw refusal }, unexpectedError)
    expect(kept.err).to.eq(refusal)
  })
})

describe("unexpectedError", () => {
  it("makes a misuse refusal of a bug, the thrown value its cause, as its example shows", () => {
    const thrown = new TypeError("Cannot read properties of undefined (reading 'wayins')")
    const err = unexpectedError(thrown)
    expect(err).to.include({ refusalkind: 'unexpected_error', family: 'misuse', cause: thrown })
    expect(err.message).to.match(/did not expect/)
  })

  it("keeps a cause that is never null, for a throw of nothing", () => {
    expect(unexpectedError(undefined).cause).to.be.instanceOf(Error)
  })
})

describe("isOutcomeShaped", () => {
  it("knows an answer handed up still wrapped, as its example shows", () => {
    const answered = good({ vault_tok: 'vault-tok-u1' })
    const refused = bad(Refusals.staleWrite('del'))
    expect(isOutcomeShaped(answered)).to.be.true
    expect(isOutcomeShaped(refused)).to.be.true
  })

  it("takes no record for one: a record, null, a boolean, a bag with ok alone", () => {
    expect(isOutcomeShaped({ vault_tok: 'vault-tok-u1' })).to.be.false
    expect(isOutcomeShaped(null)).to.be.false
    expect(isOutcomeShaped(true)).to.be.false
    expect(isOutcomeShaped({ ok: true })).to.be.false
  })
})

describe("valOf", () => {
  it("hands back a good outcome's val, and throws a bad one's err, as its example shows", () => {
    expect(valOf(good('vault props'))).to.eq('vault props')
    const refusal = new VaultError('stale_write', 'Read it again.')
    expect(() => valOf(bad(refusal))).to.throw(refusal)
  })
})
