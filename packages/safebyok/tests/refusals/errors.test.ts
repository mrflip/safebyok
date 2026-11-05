import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { VaultError, RefusalFamilyForKind, refusalFamilyVals, refusalKindVals, type RefusalKind, isCondition, isVaultError, listedKindOf, thrownNameOf } from '../../src/refusals/errors'

const errorsSource = readFileSync(new URL('../../src/refusals/errors.ts', import.meta.url), 'utf8')

/** The text of errors.ts from `from` up to the next `until`. */
const sourceBetween = (from: string, until: string): string => {
  const start = errorsSource.indexOf(from)
  return errorsSource.slice(start, errorsSource.indexOf(until, start))
}

/** The kinds a doc block names, in backticks. */
const namedKinds = (text: string): string[] => (
  refusalKindVals.filter((kind) => text.includes(`\`${kind}\``))
)

/** The kinds RefusalFamilyForKind puts in `family`. */
const familyKinds = (family: string): string[] => refusalKindVals.filter((kind) => RefusalFamilyForKind[kind] === family)

describe("refusalKindVals", () => {
  it("lists each kind once", () => {
    expect(new Set(refusalKindVals).size).to.eq(refusalKindVals.length)
  })

  it("matches the family lists in the errors.ts doc block", () => {
    expect(namedKinds(sourceBetween('* **Misuse**', '* **Condition**'))).to.have.members(familyKinds('misuse'))
    expect(namedKinds(sourceBetween('* **Condition**', '* **Bad news**'))).to.have.members(familyKinds('condition'))
    expect(namedKinds(sourceBetween('* **Bad news**', '\n *\n'))).to.have.members(familyKinds('bad_news'))
  })
})

describe("VaultError", () => {
  it("carries its kind, and isVaultError tells it apart", () => {
    const err = new VaultError('vault_full', 'This vault is full.')
    expect(err.refusalkind).to.eq('vault_full')
    expect(isVaultError(err)).to.be.true
    expect(isVaultError(err, 'vault_full')).to.be.true
    expect(isVaultError(err, 'stale_write')).to.be.false
    expect(isVaultError(new Error('vault_full'))).to.be.false
  })

  it("carries refusalkind, family, message and cause, and its family read from the one table", () => {
    const cause = new Error('socket closed')
    const err = new VaultError('storage_unavailable', 'Try again shortly.', { cause })
    expect(err).to.include({ refusalkind: 'storage_unavailable', family: 'condition', message: 'Try again shortly.', cause })
    for (const refusalkind of refusalKindVals) {
      expect(new VaultError(refusalkind, 'Said.').family).to.eq(RefusalFamilyForKind[refusalkind])
    }
  })

  it("keeps each fact a refusal learned under its own name in meta, and has no meta when it learned none", () => {
    const capacity = { boxes: { used: 3, max: 3 }, bytes: { used: 900, max: 1000 } }
    const full = new VaultError('vault_full', 'This vault is full.', { meta: { capacity } })
    expect(full.meta).to.deep.equal({ capacity })
    const stale = new VaultError('stale_write', 'Read it again.', { meta: { act: 'void' } })
    expect(stale.meta).to.deep.equal({ act: 'void' })
    const plain = new VaultError('vault_locked', 'Unlock it first.')
    expect(plain.meta).to.be.undefined
    expect(Object.keys(plain)).to.not.include('meta')
  })

  it("keeps meta out of the options Error is given, and keeps a cause given with it", () => {
    const cause = new Error('quota')
    const err = new VaultError('vault_full', 'This vault is full.', { cause, meta: { capacity: { boxes: { used: 1, max: 1 }, bytes: { used: 0, max: 0 } } } })
    expect(err.cause).to.eq(cause)
    expect(Object.keys(err)).to.have.members(['name', 'refusalkind', 'family', 'meta'])
  })

  // VaultError @example 2
  it("lets a caller branch on family", () => {
    const err = new VaultError('bad_record', 'Not one this package builds.')
    expect(err.family).to.eq('misuse')
  })
})

describe("RefusalFamilyForKind", () => {
  it("names a family for every kind, and only for kinds", () => {
    expect(Object.keys(RefusalFamilyForKind)).to.have.members([...refusalKindVals])
  })

  it("uses only the families in refusalFamilyVals, and uses each of them", () => {
    expect([...new Set(Object.values(RefusalFamilyForKind))]).to.have.members([...refusalFamilyVals])
  })

  it("matches the @examples", () => {
    expect(RefusalFamilyForKind.bad_option).to.eq('misuse')
    expect(RefusalFamilyForKind.bad_record).to.eq('misuse')
    expect(RefusalFamilyForKind.storage_unavailable).to.eq('condition')
    expect(RefusalFamilyForKind.damaged_box).to.eq('bad_news')
  })
})

const FamilyCases = [
  // misuse: the host developer's code is wrong, and no user action fixes it
  ["bad_scope",           "misuse",    'a label the app chose that breaks the rules is a bug'],
  ["bad_option",          "misuse",    'a Bank.make option out of range is a bug'],
  ["bad_record",          "misuse",    'handing a VaultDB a record this package does not build is a bug'],
  ["unknown_key_deriver", "misuse",    'opening with the wrong key deriver is a bug'],
  ["insecure_context",    "misuse",    'serving the app over plain http is a deployment bug'],
  ["unexpected_error",    "misuse",    'a throw that is no refusal is a bug, in safebyok or in a function the app handed it'],
  // conditions: normal operation, which may reach the user; bad news: told to the user, nobody's bug
  ["vault_locked",        "condition", 'a locked vault asks for the passphrase'],
  ["wrong_passphrase",    "condition", 'a mistyped passphrase asks again'],
  ["weak_passphrase",     "condition", 'a passphrase too easy to guess asks the user for another'],
  ["wrong_passkey",       "condition", 'a passkey that does not open the vault asks again, or for a passphrase'],
  ["absent_box",          "condition", 'a box deleted elsewhere is a fact of syncing'],
  ["absent_vault",        "condition", 'a novel vault, asked for what only a gated one has, is set up by its first unlock'],
  ["absent_wayin",        "condition", 'a passkey removed on another device is a fact of syncing'],
  ["box_too_large",       "condition", "a box too heavy for one record is the user's whisper and note, not the code"],
  ["vault_full",          "condition", 'a full vault tells the user to remove a box'],
  ["damaged_box",         "bad_news",  'a box stored damaged is told to the user, who may remove it'],
  ["newer_format",        "bad_news",  'a vault a newer version wrote is told to the user, who updates the app'],
  ["stale_write",         "condition", 'another device writing first is a fact of syncing'],
  ["record_conflict",     "condition", 'storage and this device disagreeing about one revision is for the app to tell the user of; fetching again does not mend it'],
  ["vault_mismatch",      "condition", 'a vault deleted or made anew on another device is a fact of syncing'],
  ["identity_revoked",    "bad_news",  'a signed-out user signs in again'],
  ["storage_unavailable", "condition", 'unreachable storage is tried again shortly'],
  ["vault_gone",          "condition", 'a vault deleted while a call worked on it is a fact of syncing'],
  ["vault_remade",        "condition", 'a vault deleted and made anew while a call worked on it is a fact of syncing'],
  ["gating_landed",       "condition", 'a gating ended while its attempt ran is the user moving on, not a fault'],
  ["damaged_lease",       "bad_news",  'a lease damaged on this device is told to the user, who unlocks again'],
  ["attempt_in_flight",   "condition", 'a second submit while the first attempt runs is the user being quick, not a fault'],
  ["already_asking",      "condition", 'a second launch while a dialog is up is the host deduping late, not a fault'],
  ["locked_while_asking", "condition", 'a lock before the enter key ends the ask: the user locked, and nothing was proved'],
  ["declined",            "condition", 'a closed dialog is the user saying no, not a fault'],
  ["same_passphrase",     "condition", 'a new passphrase equal to the current one asks the user for another'],
  ["camped",              "condition", 'a put told not to replace a live record takes up the one stored'],
  ["vault_empty",         "condition", 'a vault_tok of a life no row holds is a fact of syncing: read the vault by its scope'],
  ["storage_error",       "condition", "a vaultDB's store failing is tried again shortly"],
  ["damaged_record",      "bad_news",  'a stored row failing its checks is set aside and told of'],
  ["invalid_input",       "misuse",    'an argument failing its check is a bug in the caller'],
  ["gate_issue",          "misuse",    'gate params at odds with the stored row are a bug in the caller'],
  ["disabled",            "misuse",    'calling an object let go by a sweep, a vacate or a delete is a bug: ask the bank for it again'],
] as const

describe("each kind's family", () => {
  it("covers every kind in the cases below", () => {
    expect(FamilyCases.map(([kind]) => kind)).to.have.members([...refusalKindVals])
  })

  for (const [kind, family, blurb] of FamilyCases) {
    it(blurb, () => { expect(RefusalFamilyForKind[kind]).to.eq(family) })
  }
})

const ConditionCases = [
  [new VaultError('storage_unavailable', 'The vault storage could not be reached.'), true,  'a condition VaultError'],
  [new VaultError('identity_revoked', 'Sign in to reach this vault.'),               true,  'a signed-out refusal, bad news the app shows'],
  [new VaultError('damaged_box', 'That box is damaged.'),                            true,  'a damaged box, bad news too'],
  [new VaultError('bad_scope', 'A label is 2-40 lowercase letters.'),                false, 'a misuse VaultError'],
  [new VaultError('unexpected_error', 'Something threw that is no refusal.'),       false, 'an unexpected error, misuse too'],
  [new Error('storage_unavailable'),                                                       false, 'a plain Error, even one whose message names a condition'],
  [{ refusalkind: 'storage_unavailable', message: 'down' },                                false, 'an object shaped like a VaultError, but not one'],
  [null,                                                                                   false, 'a thrown null'],
  [undefined,                                                                              false, 'a thrown undefined'],
  ['storage_unavailable',                                                                  false, 'a thrown string'],
] as const

describe("isCondition", () => {
  for (const [thrown, expected, blurb] of ConditionCases) {
    it(`is ${String(expected)} for ${blurb}`, () => { expect(isCondition(thrown)).to.eq(expected) })
  }

  it("narrows to a VaultError", () => {
    const err: unknown = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    if (! isCondition(err)) { throw new Error('expected a condition') }
    expect(err.refusalkind).to.eq('storage_unavailable')
    expect(err.message).to.eq('The vault storage could not be reached.')
  })

  it("matches the @example: a condition is shown, anything else is rethrown", () => {
    const shown: string[] = []
    const handle = (err: unknown) => {
      if (! isCondition(err)) { throw err }
      shown.push(err.message)
    }
    handle(new VaultError('box_too_large', 'That box is over the limit.'))
    expect(shown).to.deep.equal(['That box is over the limit.'])
    expect(() => { handle(new VaultError('bad_option', 'A whisper must be a JSON value.')) }).to.throw('A whisper must be a JSON value.')
  })
})

describe("isVaultError", () => {
  // isVaultError @example
  it("tells a refusal of the kind asked", () => {
    const prompted: string[] = []
    const handle = (err: unknown) => { if (isVaultError(err, 'vault_locked')) { prompted.push('passphrase') } }
    handle(new VaultError('vault_locked', 'Unlock the vault first.'))
    handle(new VaultError('absent_box', 'No box under that label.'))
    expect(prompted).to.deep.equal(['passphrase'])
  })

  it("is false for a VaultError of another copy of safebyok", async () => {
    vi.resetModules()
    const Other = await import('../../src/refusals/errors')
    expect(Other.VaultError).to.not.eq(VaultError)
    expect(isVaultError(new Other.VaultError('identity_revoked', 'Sign in again to reach this vault.'))).to.be.false
  })

  // As a client rebuilds one from a server's JSON: an Error that names itself, with a kind.
  class LookalikeError extends Error {
    override readonly name = 'VaultError'
    readonly refusalkind = 'identity_revoked'
  }
  const sent = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
  const ImpostorCases = [
    [new LookalikeError('Sign in at another site.'),                                                         'an Error that names itself a VaultError and claims a kind, as a client rebuilds one from a server'],
    [JSON.parse('{"name":"VaultError","refusalkind":"identity_revoked","family":"bad_news","message":"Signed out."}') as unknown, 'a VaultError as JSON, as a server sends one'],
    [structuredClone(sent),                                                                                 'a VaultError through structuredClone, as postMessage hands one over'],
    [{ name: 'VaultError', refusalkind: 'identity_revoked', family: 'bad_news', message: 'Signed out.' },     'a plain object shaped like one'],
  ] as const

  for (const [impostor, blurb] of ImpostorCases) {
    it(`is false for ${blurb}, so it can pose as no refusal`, () => {
      expect(isVaultError(impostor)).to.be.false
      expect(isVaultError(impostor, 'identity_revoked')).to.be.false
      expect(isCondition(impostor)).to.be.false
    })
  }
})

describe("listedKindOf", () => {
  // listedKindOf @example
  it("is the kind of a VaultError on the list, and null for any other throw", () => {
    expect(listedKindOf(new VaultError('storage_unavailable', 'The word list would not load.'))).to.eq('storage_unavailable')
    expect(listedKindOf(new Error('no luck with hunter2'))).to.be.null
  })

  it("is null for a VaultError whose kind is off the list: the thrower's own text", () => {
    expect(listedKindOf(new VaultError('no luck with hunter2' as RefusalKind, 'A refusal made up.'))).to.be.null
    expect(listedKindOf('hunter2')).to.be.null
  })
})

describe("thrownNameOf", () => {
  // thrownNameOf @example 1
  it("is the name an Error, a DOMException or a bare object carries", () => {
    expect(thrownNameOf(new DOMException('No room.', 'QuotaExceededError'))).to.eq('QuotaExceededError')
    expect(thrownNameOf(new TypeError('hunter2 is not a function'))).to.eq('TypeError')
    expect(thrownNameOf({ name: 'SecurityError', message: 'from another frame' })).to.eq('SecurityError')
  })

  // thrownNameOf @example 2
  it("is null for anything without a string name", () => {
    expect(thrownNameOf('a bare string')).to.be.null
    expect(thrownNameOf(null)).to.be.null
    expect(thrownNameOf(undefined)).to.be.null
    expect(thrownNameOf({ name: 42 })).to.be.null
    expect(thrownNameOf({ message: 'nameless' })).to.be.null
  })
})
