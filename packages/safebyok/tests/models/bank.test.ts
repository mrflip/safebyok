/** The models' Bank at its door: the names it takes and the key derivers it keeps, refused as the core's Bank.make refuses them, and the strength checker it holds. */

import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Argon2idKeyDeriver, KeyDeriver } from '../../src/deriver/basederiver'
import { Argon2idWebV1 } from '../../src/deriver/shapes'
import type { VaultLogger } from '../../src/logger'
import { type Bank as BankClass, Bank, type BankOpts } from '../../src/models/bank'
import * as Phrases from '../../src/phrases'
import { MaxUserIdChars } from '../../src/shapes/primitives'
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

/** `Bank.make` over {@link bankOptsOf}, with `change` laid over loosely, so a test can hand it what no `BankOpts` allows. */
const makeBank = (change: Record<string, unknown> = {}): Bank => Bank.make(bankOptsOf(change as Partial<BankOpts>))

const cheapDerive: KeyDeriver['deriveKeyBytes'] = (passphrase, saltBytes) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)

/** A hand-built Argon2id deriver over the cheap derivation: the whole spec, under a label of its own, then `change`. */
const handBuilt = (change: Record<string, unknown> = {}): KeyDeriver => (
  { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', deriveKeyBytes: cheapDerive, ...change }
)

/** A logger that keeps everything it hears, the notice included, which TH.spyLogger drops. */
const hearingEverything = () => {
  const heard: TH.LoggedCall[] = []
  const hear = (level: keyof VaultLogger) => (message?: string, story?: Record<string, unknown>, err?: Error | null) => { heard.push({ level, message, story, err }) }
  return { heard, logger: { log: hear('log'), warn: hear('warn'), error: hear('error') } }
}

describe("Bank.make's names", () => {
  it("takes the applabel and user_id it is handed as its scope", () => {
    expect(makeBank().scope).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
  })

  it("refuses a hyphenated applabel, and a hyphenated vaultlabel at bank.vaultOf, as bad_scope", () => {
    TH.expectSyncRefusal(() => makeBank({ applabel: 'not-a-label' }), 'bad_scope')
    TH.expectSyncRefusal(() => makeBank().vaultOf({ vaultlabel: 'not-a-label' }), 'bad_scope')
  })

  it("refuses to make a bank without a signed-in user", () => {
    TH.expectSyncRefusal(() => makeBank({ user_id: '' }), 'bad_scope')
  })

  it("takes a user_id of a hundred characters, and refuses a longer one, naming the bound and never the id", () => {
    expect(makeBank({ user_id: 'u'.repeat(MaxUserIdChars) }).scope.user_id).to.have.lengthOf(MaxUserIdChars)
    const err = TH.expectSyncRefusal(() => makeBank({ user_id: `alice@example.com${'u'.repeat(MaxUserIdChars)}` }), 'bad_scope')
    expect(err.message).to.include('at most 100 characters')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("refuses a user_id that is not text, as no signed-in user", () => {
    for (const user_id of [42, null, undefined, { id: 'u1' }]) {
      TH.expectSyncRefusal(() => makeBank({ user_id }), 'bad_scope')
    }
  })

  it("refuses a call with no bag of options at all as bad_option", () => {
    for (const opts of [undefined, null, 'acme']) {
      TH.expectSyncRefusal(() => Bank.make(opts as unknown as BankOpts), 'bad_option')
    }
  })
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

describe("Bank.make's key deriver", () => {
  describe("one that declares Argon2id", () => {
    it("is kept when its spec is one Argon2id can run", () => {
      expect(makeBank({ keyDeriver: handBuilt({ salt_bytes: 16 }) }).keyDeriver.key_deriver_label).to.eq('acme_argon2id_v1')
    })

    const Unrunnable = [
      [{ salt_bytes: 4 },         'a salt under 8 bytes'],
      [{ memory_kib: 4 },         'memory under 8 KiB a lane'],
      [{ iterations: 0 },         'no passes'],
      [{ parallelism: 0 },        'no lanes'],
      [{ output_bytes: 16 },      'a key other than 32 bytes'],
      [{ memory_kib: undefined }, 'a parameter missing'],
    ] as const

    for (const [change, blurb] of Unrunnable) {
      it(`is refused as bad_option at the door, not at the first unlock: ${blurb}`, () => {
        const err = TH.expectSyncRefusal(() => makeBank({ keyDeriver: handBuilt(change) }), 'bad_option')
        expect(err.meta?.fieldnames).to.deep.equal(Object.keys(change))
      })
    }
  })

  describe("one of another algorithm, or none declared", () => {
    it("is kept declaring an algorithm of its own, with no Argon2id parameters to carry, or declaring none", () => {
      expect(makeBank({ keyDeriver: { ...TH.testDeriver, key_deriver_label: 'acme_scrypt_v1', algorithm: 'scrypt' } }).keyDeriver.algorithm).to.eq('scrypt')
      expect(makeBank().keyDeriver).to.not.have.property('algorithm')
    })

    it("is refused when its algorithm is not text", () => {
      TH.expectSyncRefusal(() => makeBank({ keyDeriver: { ...TH.testDeriver, algorithm: 7 } }), 'bad_option')
    })
  })

  describe("the reserved label namespace", () => {
    const Reserved = [
      ['argon2id_web_v2',   'a spec safebyok may supply later'],
      ['Argon2id_Web_acme', 'the prefix in another case'],
      ['argon2id_web_v1',   'the supplied label, on a deriver carrying no parameters'],
    ] as const

    for (const [label, blurb] of Reserved) {
      it(`is refused as bad_option: ${blurb}`, () => {
        const err = TH.expectSyncRefusal(() => makeBank({ keyDeriver: { ...TH.testDeriver, key_deriver_label: label } }), 'bad_option')
        expect(err.message).to.match(/argon2id_web_/u)
      })
    }
  })

  describe("a label that begins test_", () => {
    it("warns once each time a bank is made, quoting nothing of the deriver but its mark", () => {
      const { heard, logger } = hearingEverything()
      makeBank({ logger })
      makeBank({ logger })
      expect(heard).to.deep.equal([
        { level: 'warn', message: Phrases.TestDeriverNotice, story: { call: 'Bank.make' }, err: undefined },
        { level: 'warn', message: Phrases.TestDeriverNotice, story: { call: 'Bank.make' }, err: undefined },
      ])
    })

    it("says nothing of a label that does not begin test_, or merely holds it", () => {
      const { heard, logger } = hearingEverything()
      makeBank({ logger, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'acme_test_v1' } })
      makeBank({ logger, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'Test_digest' } })
      expect(heard).to.deep.equal([])
    })
  })
})
