import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../src/errors'
import { localVaultDB } from '../src/local-vault-db'
import { memoryStore } from '../src/string-store'
import * as RefusalPolicy from '../src/refusal-policy'
import { bad, good } from '../src/outcome'
import * as TH from './test-helpers'

const signedOut = () => new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')

describe("RefusalPolicy.decide", () => {
  const DecideCases = [
    // the examples:
    [signedOut(),                                                       "lock",  'locks for identity_revoked'],
    [new VaultError('rolled_back', 'An older copy.'),                   "lock",  'locks for rolled_back: storage handing back an older copy is as little to be trusted'],
    [new VaultError('not_permitted', 'Not yours.'),                     "none",  'does nothing more for not_permitted: the vault\'s own user, refused one call'],
    // what says nothing about who is signed in:
    [new VaultError('stale_write', 'Another device wrote first.'),      "none",  'does nothing more for a stale write'],
    [new VaultError('storage_unavailable', 'Down.'),                    "none",  'does nothing more for storage that could not be reached'],
    [new VaultError('vault_full', 'Full.'),                             "none",  'does nothing more for a full vault'],
    // what is no refusal of storage's:
    [new Error('identity_revoked'),                                            "none",  'does nothing for a plain Error naming the kind'],
    [{ refusalkind: 'identity_revoked', message: 'Signed out.' },              "none",  'does nothing for an object shaped like the refusal'],
  ] as const

  for (const [refusal, expected, blurb] of DecideCases) {
    it(blurb, () => { expect(RefusalPolicy.decide(refusal)).to.eq(expected) })
  }
})

describe("RefusalPolicy.heed", () => {
  const scope = TH.scopeOf('u1')

  it("answers each verb as the VaultDB does, passing on every argument", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const heeded = RefusalPolicy.heed(vaultDB, () => Promise.resolve())
    const getVault = vi.spyOn(vaultDB, 'getVault')
    expect(await heeded.getVault(scope)).to.be.null
    expect(getVault).toHaveBeenCalledWith(scope)
    const ensured = await heeded.ensureVault(TH.gatelessOf('u1'))
    expect(ensured).to.deep.equal({ vaultProps: TH.gatelessOf('u1'), boxes: [] })
    expect(await heeded.getVault(scope)).to.deep.equal(ensured)
  })

  /** Each heeded verb, and the arguments a vault hands it. */
  const VerbArgsCases = [
    ['getVault',    [scope]],
    ['ensureVault', [TH.gatelessOf('u1')]],
    ['putVaultProps',    [TH.vaultPropsOf('u1'), TH.thisVault]],
    ['getBox',           [scope, 'anthropic']],
    ['putBox',           [scope, TH.noBoxYet, TH.boxOf('anthropic', 'one')]],
    ['delBox',           [scope, 'anthropic', TH.thisVault]],
    ['delVault',         [scope, TH.thisVault]],
  ] as const

  for (const [verb, args] of VerbArgsCases) {
    it(`passes ${verb} every argument it is given`, async () => {
      const vaultDB = localVaultDB({ store: memoryStore() })
      const spied = vi.spyOn(vaultDB, verb).mockResolvedValue(good(undefined) as never)
      const heeded = RefusalPolicy.heed(vaultDB, () => Promise.resolve())
      await (heeded[verb] as (...given: readonly unknown[]) => Promise<unknown>)(...args)
      expect(spied).toHaveBeenCalledWith(...args)
    })
  }

  it("hands a refusal to onRefusal, waits for it, then rejects with that very refusal", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const refusal = signedOut()
    vi.spyOn(vaultDB, 'getBox').mockResolvedValueOnce(bad(refusal))
    const heard: string[] = []
    const heeded = RefusalPolicy.heed(vaultDB, async (given) => {
      await TH.wakeupAtNextTick()
      heard.push(given.refusalkind)
    })
    expect(await TH.expectRefusal(heeded.getBox(scope, 'anthropic_api_key', TH.inThisVault), 'identity_revoked')).to.eq(refusal)
    expect(heard).to.deep.equal(['identity_revoked'])
  })

  it("hands on every VaultError, so the policy alone decides what each means", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const onRefusal = vi.fn(() => Promise.resolve())
    const heeded = RefusalPolicy.heed(vaultDB, onRefusal)
    await TH.expectRefusal(heeded.putVaultProps(TH.vaultPropsOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'stale_write')
    expect(onRefusal).toHaveBeenCalledTimes(1)
  })

  it("rejects with the refusal even when onRefusal throws", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const refusal = signedOut()
    vi.spyOn(vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    const heeded = RefusalPolicy.heed(vaultDB, () => Promise.reject(new Error('the device store is broken')))
    expect(await TH.expectRefusal(heeded.getVault(scope), 'identity_revoked')).to.eq(refusal)
  })

  it("passes subscribe through, its unsubscribe the VaultDB's own", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(vaultDB, 'subscribe').mockReturnValue(unsubscribe)
    const onChange = vi.fn()
    expect(RefusalPolicy.heed(vaultDB, () => Promise.resolve()).subscribe(scope, onChange)).to.eq(unsubscribe)
    expect(subscribe).toHaveBeenCalledWith(scope, onChange)
  })
})
