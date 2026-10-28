import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import * as RefusalPolicy from '../src/refusal-policy'

const signedOut = () => new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')

describe("RefusalPolicy.decide", () => {
  const DecideCases = [
    // the examples:
    [signedOut(),                                                       "lock",  'locks for identity_revoked'],
    [new VaultError('vault_behind', 'An older copy.'),                  "lock",  'locks for vault_behind: storage handing back an older copy is as little to be trusted'],
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
