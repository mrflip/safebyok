import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Argon2idKeyDeriver, KeyDeriver } from '../../src/deriver/basederiver'
import { Argon2idWebV1 } from '../../src/deriver/shapes'
import { type Bank as BankClass, Bank, type BankOpts } from '../../src/models/bank'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'

const noop = () => undefined

/** The options `Bank.make` needs besides its `keyDeriver` and `strengthChecker`: stores that are never called. */
const bankOptsOf = (overrides: Partial<BankOpts> = {}): BankOpts => ({
  applabel:    'acme',
  user_id:     'u1',
  vaultStore:  { get: noop, put: noop, del: noop, watch: noop } as unknown as BankOpts['vaultStore'],
  vaultCache:  { load: noop, save: noop } as unknown as BankOpts['vaultCache'],
  deviceDB:    { tryGetLease: noop, tryPutLease: noop, tryDelLease: noop } as unknown as BankOpts['deviceDB'],
  keyDeriver:  TH.testDeriver,
  logger:      TH.spyLogger().logger,
  ...overrides,
})

describe("BankOpts.keyDeriver", () => {
  it("is required and has no default: the type allows no omission and no undefined", () => {
    expectTypeOf<BankOpts['keyDeriver']>().toEqualTypeOf<KeyDeriver>()
    expectTypeOf<Pick<BankOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("is refused 'bad_option' by Bank.make when left out, naming where browserOpts() comes from", () => {
    const { keyDeriver: _dropped, ...withoutDeriver } = bankOptsOf()
    const refusal = TH.expectSyncRefusal(() => Bank.make(withoutDeriver as BankOpts), 'bad_option')
    expect(refusal.message).to.include('browserOpts')
  })

  it("is refused 'bad_option' by Bank.make when it is no deriver", () => {
    for (const notDeriver of [undefined, null, 'argon2id_web_v1', { key_deriver_label: 'acme_v1' }]) {
      TH.expectSyncRefusal(() => Bank.make(bankOptsOf({ keyDeriver: notDeriver as unknown as KeyDeriver })), 'bad_option')
    }
  })

  it("is refused 'bad_option' when it wears the supplied label over other parameters", () => {
    const impostor: Argon2idKeyDeriver = { ...Argon2idWebV1, iterations: 1, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) }
    TH.expectSyncRefusal(() => Bank.make(bankOptsOf({ keyDeriver: impostor })), 'bad_option')
  })

  it("is the bank's keyDeriver, and a test deriver's label is warned of once", () => {
    const heard: string[] = []
    const logger = { log: noop, warn: (message = '') => { heard.push(message) }, error: noop }
    const bank: BankClass = Bank.make(bankOptsOf({ logger }))
    expect(bank.keyDeriver).to.eq(TH.testDeriver)
    expect(heard).to.deep.equal([Phrases.TestDeriverNotice])
  })
})

describe("BankOpts.strengthChecker", () => {
  it("left out, answers every passphrase weak with NoStrengthChecker as the reason", async () => {
    const bank = Bank.make(bankOptsOf())
    expect(await bank.strengthChecker('a very long and unguessable passphrase', TH.scopeOf('u1'))).to.deep.equal({ strong: false, reason: Phrases.NoStrengthChecker })
  })

  it("given, is the bank's own", () => {
    const bank = Bank.make(bankOptsOf({ strengthChecker: TH.anyStrengthChecker }))
    expect(bank.strengthChecker).to.eq(TH.anyStrengthChecker)
  })
})
