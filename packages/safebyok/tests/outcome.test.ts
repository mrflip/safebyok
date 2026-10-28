import { describe, expect, expectTypeOf, it } from 'vitest'
import { VaultError } from '../src/errors'
import { type Outcome, asStorageTrouble, bad, good, outcomeOf, refusalOf, valOf } from '../src/outcome'
import * as Refusals from '../src/refusals'

/** An app's own call, which rejects: what outcomeOf's first example wraps. */
const fetchBackup = (vaultlabel: string): Promise<string> => Promise.reject(new TypeError(`no backup of ${vaultlabel}`))

describe("good and bad", () => {
  it("makes a good outcome of a val, as good's example shows (Contract: Shapes)", () => {
    const vaultRecord = { vault_tok: 'vault-tok-u1' }
    expect(good(vaultRecord)).to.deep.equal({ ok: true, val: vaultRecord })
    expect(good(null)).to.deep.equal({ ok: true, val: null })
  })

  it("makes a bad outcome of a refusal, as bad's example shows (Contract: Shapes)", () => {
    const err = Refusals.staleDel()
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

  it("turns anything else thrown into unexpected_error, the thrown value its cause, as its second example shows (Contract: Shapes)", async () => {
    const parseImport = (file: string): string => { throw new TypeError(`cannot parse ${file}`) }
    const { ok, err } = await outcomeOf(() => parseImport('backup.json'))
    expect(ok).to.be.false
    expect(err).to.be.instanceOf(VaultError)
    expect(err?.refusalkind).to.eq('unexpected_error')
    expect(err?.family).to.eq('misuse')
    expect(err?.cause).to.be.instanceOf(TypeError)
  })

  it("turns a thrown string, or a rejection with nothing, into unexpected_error with a cause that is never null", async () => {
    const fromString = await outcomeOf(() => { throw 'down' })  // eslint-disable-line @typescript-eslint/only-throw-error -- a body that throws a string is what this guards against
    expect(fromString.err?.cause).to.eq('down')
    const fromNothing = await outcomeOf(() => Promise.reject(undefined))  // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- likewise, a rejection with nothing
    expect(fromNothing.err?.refusalkind).to.eq('unexpected_error')
    expect(fromNothing.err?.cause).to.be.instanceOf(Error)
  })

  it("never rejects: what an app wraps is one Outcome whatever happens, as its first example shows", async () => {
    const { ok, val, err } = await outcomeOf(() => fetchBackup('main'), Refusals.storageUnavailable)
    expect(ok).to.be.false
    expect(val).to.be.undefined
    expect(err?.refusalkind).to.eq('storage_unavailable')
    expect(err?.message).to.not.include('main')
  })
})

describe("outcomeOf, told otherwise", () => {
  it("turns a throw that is no VaultError into what otherwise makes of it, as its third example shows", async () => {
    const socketClosed = new Error('socket closed')
    const { err } = await outcomeOf(() => { throw socketClosed }, Refusals.storageUnavailable)
    expect(err?.refusalkind).to.eq('storage_unavailable')
    expect(err?.family).to.eq('condition')
    expect(err?.cause).to.eq(socketClosed)
  })

  it("keeps a VaultError as it came, whatever otherwise would make", async () => {
    const refusal = new VaultError('absent_box', 'No box under that label.')
    const kept = await outcomeOf(() => { throw refusal }, Refusals.storageUnavailable)
    expect(kept.err).to.eq(refusal)
  })
})

describe("valOf", () => {
  it("hands back a good outcome's val, and throws a bad one's err, as its example shows", () => {
    expect(valOf(good('vault record'))).to.eq('vault record')
    const refusal = new VaultError('stale_write', 'Read it again.')
    expect(() => valOf(bad(refusal))).to.throw(refusal)
  })
})

describe("asStorageTrouble", () => {
  it("hands back a VaultError as the same object, and makes storage_unavailable of anything else, the throw its cause, as its example shows", () => {
    const refusal = new VaultError('vault_mismatch', 'Another vault is stored there.')
    expect(asStorageTrouble(refusal)).to.eq(refusal)
    const dropped = new Error('connection terminated unexpectedly')
    const trouble = asStorageTrouble(dropped)
    expect(trouble.refusalkind).to.eq('storage_unavailable')
    expect(trouble.cause).to.eq(dropped)
    expect(trouble.message).to.not.include('terminated')
  })

  it("makes storage_unavailable of a thrown string, or of nothing, with a cause that is never null, as Refusals.storageUnavailable does", () => {
    for (const thrown of ['socket closed', undefined, null]) {
      const trouble = asStorageTrouble(thrown)
      expect(trouble.refusalkind).to.eq('storage_unavailable')
      expect(trouble.message).to.eq(Refusals.storageUnavailable(thrown).message)
      expect(trouble.cause).to.not.be.null
      expect(trouble.cause).to.not.be.undefined
    }
  })
})

describe("refusalOf", () => {
  it("hands a VaultError back as it came, as its second example shows", () => {
    const refusal = new VaultError('vault_locked', 'The vault is locked.')
    expect(refusalOf(refusal)).to.eq(refusal)
  })

  it("makes an unexpected_error of anything else, the throw its cause, as its third example shows", () => {
    const bug = new TypeError('ctx is not a function')
    const err = refusalOf(bug)
    expect(err).to.be.instanceOf(VaultError).and.to.have.property('refusalkind', 'unexpected_error')
    expect(err.cause).to.eq(bug)
    expect(refusalOf('a bare string').cause).to.eq('a bare string')
    expect(refusalOf(undefined).cause).to.be.instanceOf(Error)
  })

  it("ends a throwing form, so a bug in its body reaches the caller as a VaultError and a refusal passes untouched, as its first example shows", async () => {
    const refusal = new VaultError('vault_locked', 'The vault is locked.')
    await expect(throwingForm(new TypeError('broken'))).rejects.toThrow(expect.objectContaining({ name: 'VaultError', refusalkind: 'unexpected_error' }))
    await expect(throwingForm(refusal)).rejects.toThrow(refusal)
  })
})

/** A throwing form in the shape refusalOf's first example shows, its body rejecting with `thrown`. */
const throwingForm = async (thrown: Error) => {
  try {
    await Promise.reject(thrown)
  } catch (err) {
    throw refusalOf(err)
  }
}
