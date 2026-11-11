import { describe, expect, expectTypeOf, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { type GoodOutcome, type Outcome, storageTroubleOf, bad, demandGood, good, outcomeOf, valOf } from '../../src/refusals/outcome'
import * as Refusals from '../../src/refusals/throwers'

/** An app's own call, which rejects: what outcomeOf's first example wraps. */
const fetchBackup = (vaultlabel: string): Promise<string> => Promise.reject(new TypeError(`no backup of ${vaultlabel}`))

describe("good and bad", () => {
  it("makes a good outcome of a val", () => {
    const vaultRecord = { vault_tok: 'vault-tok-u1' }
    expect(good(vaultRecord)).to.deep.equal({ ok: true, val: vaultRecord })
    expect(good(null)).to.deep.equal({ ok: true, val: null })
  })

  it("makes a bad outcome of a refusal", () => {
    const err = Refusals.needUnlocked()
    const outcome = bad(err)
    expect(outcome).to.deep.equal({ ok: false, err })
    expect(outcome).to.not.have.property('val')
  })
})

describe("Outcome", () => {
  // Outcome @example
  it("narrows on ok", () => {
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

  it("has an err that is always a VaultError", () => {
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

  it("keeps a VaultError the body throws or rejects with, as it came", async () => {
    const refusal = new VaultError('storage_unavailable', 'Storage is down.')
    const thrown = await outcomeOf(() => { throw refusal })
    expect(thrown.err).to.eq(refusal)
    const rejected = await outcomeOf(() => Promise.reject(refusal))
    expect(rejected.err).to.eq(refusal)
  })

  it("wraps anything else thrown, keeping it as the cause", async () => {
    const parseImport = (file: string): string => { throw new TypeError(`cannot parse ${file}`) }
    const { ok, err } = await outcomeOf(() => parseImport('backup.json'))
    expect(ok).to.be.false
    expect(err).to.be.instanceOf(VaultError)
    expect(err?.refusalkind).to.eq('unexpected_error')
    expect(err?.family).to.eq('misuse')
    expect(err?.cause).to.be.instanceOf(TypeError)
  })

  it("wraps a thrown string, or a rejection with nothing, with a cause that is never null", async () => {
    const fromString = await outcomeOf(() => { throw 'down' })  // eslint-disable-line @typescript-eslint/only-throw-error -- a body that throws a string is what this guards against
    expect((fromString.err?.cause as Error).message).to.eq('down')
    const fromNothing = await outcomeOf(() => Promise.reject(undefined))  // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- likewise, a rejection with nothing
    expect(fromNothing.err?.refusalkind).to.eq('unexpected_error')
    expect(fromNothing.err?.cause).to.be.instanceOf(Error)
  })

  // outcomeOf @example
  it("never rejects", async () => {
    const { ok, val, err } = await outcomeOf(() => fetchBackup('main'), Refusals.storageUnavailable)
    expect(ok).to.be.false
    expect(val).to.be.undefined
    expect(err?.refusalkind).to.eq('storage_unavailable')
    expect(err?.message).to.not.include('main')
  })
})

describe("outcomeOf, given an otherwise", () => {
  it("passes a throw that is not a VaultError to otherwise", async () => {
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
  // valOf @example
  it("hands back a good outcome's val, and throws a bad one's err", () => {
    expect(valOf(good('vault record'))).to.eq('vault record')
    const refusal = new VaultError('stale_write', 'Read it again.')
    expect(() => valOf(bad(refusal))).to.throw(refusal)
  })
})

describe("demandGood", () => {
  it("hands back a good outcome as it came", () => {
    const outcome = good('vault record')
    expect(demandGood(outcome)).to.eq(outcome)
    expectTypeOf(demandGood(good(7))).toEqualTypeOf<GoodOutcome<number>>()
  })

  it("throws a bad outcome's err as it came", () => {
    const refusal = new VaultError('stale_write', 'Read it again.')
    expect(() => demandGood(bad(refusal))).to.throw(refusal)
  })
})

describe("storageTroubleOf", () => {
  // storageTroubleOf @example
  it("returns a VaultError unchanged, and wraps anything else as the cause", () => {
    const refusal = new VaultError('vault_reborn', 'Another vault is stored there.')
    expect(storageTroubleOf(refusal)).to.eq(refusal)
    const dropped = new Error('connection terminated unexpectedly')
    const trouble = storageTroubleOf(dropped)
    expect(trouble.refusalkind).to.eq('storage_unavailable')
    expect(trouble.cause).to.eq(dropped)
    expect(trouble.message).to.not.include('terminated')
  })

  it("wraps a thrown string, or nothing, with a cause that is never null", () => {
    for (const thrown of ['socket closed', undefined, null]) {
      const trouble = storageTroubleOf(thrown)
      expect(trouble.refusalkind).to.eq('storage_unavailable')
      expect(trouble.message).to.eq(Refusals.storageUnavailable(thrown).message)
      expect(trouble.cause).to.not.be.null
      expect(trouble.cause).to.not.be.undefined
    }
  })
})
