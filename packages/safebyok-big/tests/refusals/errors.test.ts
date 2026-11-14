import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { VaultError, RefusalFamilyForKind, refusalFamilyVals, refusalkindVals, type Refusalkind, isCondition, isVaultError, listedKindOf, thrownNameOf } from '../../src/refusals/errors'

const errorsSource = readFileSync(new URL('../../src/refusals/errors.ts', import.meta.url), 'utf8')

/** The text of errors.ts from `from` up to the next `until`. */
function sourceBetween(from: string, until: string): string {
  const start = errorsSource.indexOf(from)
  return errorsSource.slice(start, errorsSource.indexOf(until, start))
}

/** The kinds a doc block names, in backticks. */
function namedKinds(text: string): string[] {
  return refusalkindVals.filter((kind) => text.includes(`\`${kind}\``))
}

/** The kinds RefusalFamilyForKind puts in `family`. */
function familyKinds(family: string): string[] { return refusalkindVals.filter((kind) => RefusalFamilyForKind[kind] === family) }

describe("refusalkindVals", () => {
  it("lists each kind once", () => {
    expect(new Set(refusalkindVals).size).to.eq(refusalkindVals.length)
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

  it("carries refusalkind, family, message and cause", () => {
    const cause = new Error('socket closed')
    const err = new VaultError('storage_unavailable', 'Try again shortly.', { cause })
    expect(err).to.include({ refusalkind: 'storage_unavailable', family: 'condition', message: 'Try again shortly.', cause })
    for (const refusalkind of refusalkindVals) {
      expect(new VaultError(refusalkind, 'Said.').family).to.eq(RefusalFamilyForKind[refusalkind])
    }
  })

  it("keeps each fact a refusal learned under its own name in meta, and has no meta when it learned none", () => {
    const capacity = { boxes: { used: 3, max: 3 }, bytes: { used: 900, max: 1000 } }
    const full = new VaultError('vault_full', 'This vault is full.', { meta: { capacity } })
    expect(full.meta).to.deep.equal({ capacity })
    const stale = new VaultError('stale_write', 'Read it again.', { meta: { act: 'void' } })
    expect(stale.meta).to.deep.equal({ act: 'void' })
    const plain = new VaultError('bank_locked', 'Unlock it first.')
    expect(plain.meta).to.be.undefined
    expect(Object.keys(plain)).to.not.include('meta')
  })

  it("keeps meta out of the options Error is given, and keeps a cause given with it", () => {
    const cause = new Error('quota')
    const err = new VaultError('vault_full', 'This vault is full.', { cause, meta: { capacity: { boxes: { used: 1, max: 1 }, bytes: { used: 0, max: 0 } } } })
    expect(err.cause).to.eq(cause)
    expect(Object.keys(err)).to.have.members(['name', 'refusalkind', 'family', 'meta'])
  })

  // VaultError @example
  it("lets a caller branch on family", () => {
    const err = new VaultError('bad_record', 'Not one this package builds.')
    expect(err.family).to.eq('misuse')
  })
})

describe("RefusalFamilyForKind", () => {
  it("names a family for every kind, and only for kinds", () => {
    expect(Object.keys(RefusalFamilyForKind)).to.have.members([...refusalkindVals])
  })

  it("uses only the families in refusalFamilyVals, and uses each of them", () => {
    expect([...new Set(Object.values(RefusalFamilyForKind))]).to.have.members([...refusalFamilyVals])
  })

  it("sorts each kind into its family", () => {
    expect(RefusalFamilyForKind.bad_option).to.eq('misuse')
    expect(RefusalFamilyForKind.bad_record).to.eq('misuse')
    expect(RefusalFamilyForKind.storage_unavailable).to.eq('condition')
    expect(RefusalFamilyForKind.damaged_whisper).to.eq('bad_news')
  })
})

const FamilyCases = [
  // misuse: the host developer's code is wrong, and no user action fixes it
  ["bad_scope",           "misuse",    'a label the app chose that breaks the rules is a bug'],
  ["bad_option",          "misuse",    'a Device.make option out of range is a bug'],
  ["bad_record",          "misuse",    'handing a BankDB a record this package does not build is a bug'],
  ["insecure_context",    "misuse",    'serving the app over plain http is a deployment bug'],
  ["unexpected_error",    "misuse",    'a throw that is no refusal is a bug, in safebyok or in a function the app handed it'],
  // conditions: normal operation, which may reach the user; bad news: told to the user, nobody's bug
  ["bank_locked",         "condition", 'a locked vault asks for the passphrase'],
  ["wrong_passphrase",    "condition", 'a mistyped passphrase asks again'],
  ["weak_passphrase",     "condition", 'a passphrase too easy to guess asks the user for another'],
  ["wrong_passkey",       "condition", 'a passkey that does not open the vault asks again, or for a passphrase'],
  ["passkey_unavailable", "condition", 'a browser or authenticator that cannot answer for a passkey asks for the passphrase, or another authenticator'],
  ["absent_box",          "condition", 'a box deleted on another device is a normal part of syncing'],
  ["absent_vault",        "condition", 'a vault with no gate yet is set up by its first unlock'],
  ["absent_wayin",        "condition", 'a passkey removed on another device is a normal part of syncing'],
  ["box_too_large",       "condition", "a box too heavy for one record is the user's whisper and note, not the code"],
  ["vault_full",          "condition", 'a full vault tells the user to remove a box'],
  ["damaged_whisper",     "bad_news",  'a box stored damaged is reported to the user, who may remove it'],
  ["newer_format",        "bad_news",  'a vault a newer version wrote is reported to the user, who updates the app'],
  ["stale_write",         "condition", 'another device writing first is a normal part of syncing'],
  ["record_conflict",     "condition", 'storage and this device disagreeing about one revision is for the app to tell the user of; fetching again does not mend it'],
  ["identity_revoked",    "bad_news",  'a signed-out user signs in again'],
  ["storage_unavailable", "condition", 'unreachable storage is tried again shortly'],
  ["storage_blocked", "condition", 'a browser that withholds its storage is reported to the user'],
  ["gate_made_elsewhere", "condition", 'a vault made first on another device is reported to the user who typed another passphrase'],
  ["vault_gone",          "condition", 'a vault deleted while a call worked on it is a normal part of syncing'],
  ["vault_reborn",        "condition", 'a vault deleted or made anew on another device is a normal part of syncing'],
  ["gating_concluded",    "condition", 'a gating ended while its attempt ran is the user moving on, not a fault'],
  ["damaged_lease",       "bad_news",  'a lease damaged on this device is reported to the user, who unlocks again'],
  ["attempt_in_flight",   "condition", 'a second submit while the first attempt runs is the user being quick, not a fault'],
  ["already_asking",      "condition", 'a second launch while a dialog is up is the host deduping late, not a fault'],
  ["dismissed",           "condition", 'a dismissed dialog is not a fault'],
  ["same_passphrase",     "condition", 'a new passphrase equal to the current one asks the user for another'],
  ["camped",              "condition", 'a put told not to replace a live record takes up the one stored'],
  ["damaged_row",         "bad_news",  'a row from storage that fails its checks is set aside and reported'],
  ["damaged_vault",       "bad_news",  'the vault row above a box asked for failing its checks is told of'],
  ["storage_issue",       "bad_news",  'a row that is not an object, or is stored at the wrong address, will not be fixed by a retry'],
  ["gate_issue",          "misuse",    'gate params at odds with the stored row are a bug in the caller'],
  ["disabled",            "misuse",    'calling an object let go by a sweep, a vacate or a delete is a bug: ask the bank for it again'],
] as const

describe("each kind's family", () => {
  it("covers every kind in the cases below", () => {
    expect(FamilyCases.map(([kind]) => kind)).to.have.members([...refusalkindVals])
  })

  for (const [kind, family, blurb] of FamilyCases) {
    it(blurb, () => { expect(RefusalFamilyForKind[kind]).to.eq(family) })
  }
})

const ConditionCases = [
  [new VaultError('storage_unavailable', 'The vault storage could not be reached.'), true,  'a condition VaultError'],
  [new VaultError('identity_revoked', 'Sign in to reach this vault.'),               true,  'a signed-out refusal, bad news the app shows'],
  [new VaultError('damaged_whisper', 'That box is damaged.'),                            true,  'a damaged box, bad news too'],
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

  // isCondition @example
  it("lets a caller show a condition and rethrow anything else", () => {
    const shown: string[] = []
    function handle(err: unknown) {
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
    function handle(err: unknown) { if (isVaultError(err, 'bank_locked')) { prompted.push('passphrase') } }
    handle(new VaultError('bank_locked', 'Unlock the vault first.'))
    handle(new VaultError('absent_box', 'No box under that label.'))
    expect(prompted).to.deep.equal(['passphrase'])
  })

  it("is true for a VaultError of another copy of safebyok", async () => {
    vi.resetModules()
    const Other = await import('../../src/refusals/errors')
    expect(Other.VaultError).to.not.eq(VaultError)
    expect(isVaultError(new Other.VaultError('identity_revoked', 'Sign in again to reach this vault.'))).to.be.true
    expect(isVaultError(new Other.VaultError('identity_revoked', 'Sign in again to reach this vault.'), 'identity_revoked')).to.be.true
    expect(isVaultError(new Other.VaultError('identity_revoked', 'Sign in again to reach this vault.'), 'bank_locked')).to.be.false
  })

  it("is true for an error whose class wears the brand every copy of safebyok shares", () => {
    const proto = Object.defineProperty(Object.create(Error.prototype) as object, Symbol.for('@safebyok/vaulterror'), { get: () => true })
    const stranger = Object.assign(Object.create(proto) as object, { refusalkind: 'bank_locked' })
    expect(isVaultError(stranger)).to.be.true
    expect(isVaultError(stranger, 'bank_locked')).to.be.true
    expect(isVaultError(stranger, 'absent_box')).to.be.false
  })

  it("is false for a copy of a VaultError's own fields", () => {
    const refusal = new VaultError('bank_locked', 'Unlock the vault first.')
    expect(isVaultError(Object.assign({}, refusal))).to.be.false
  })

  // As a client rebuilds one from a server's JSON: an Error that names itself, with a kind.
  class LookalikeError extends Error {
    override readonly name = 'VaultError'
    readonly refusalkind = 'identity_revoked'
  }
  const sent = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
  const sentAsJson = JSON.stringify(sent)
  const ImpostorCases = [
    [new LookalikeError('Sign in at another site.'),                                                         'an Error that names itself a VaultError and claims a kind, as a client rebuilds one from a server'],
    [JSON.parse('{"name":"VaultError","refusalkind":"identity_revoked","family":"bad_news","message":"Signed out."}') as unknown, 'a VaultError as JSON, as a server sends one'],
    [JSON.parse(sentAsJson) as unknown,                                                                      'a VaultError through JSON and back, as no symbol survives it'],
    [structuredClone(sent),                                                                                 'a VaultError through structuredClone, as postMessage hands one over'],
    [{ name: 'VaultError', refusalkind: 'identity_revoked', family: 'bad_news', message: 'Signed out.' },     'a plain object shaped like one'],
  ] as const

  for (const [impostor, blurb] of ImpostorCases) {
    it(`is false for ${blurb}`, () => {
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

  it("is null for a VaultError whose kind is not on the list", () => {
    expect(listedKindOf(new VaultError('no luck with hunter2' as Refusalkind, 'A refusal made up.'))).to.be.null
    expect(listedKindOf('hunter2')).to.be.null
  })
})

describe("thrownNameOf", () => {
  // thrownNameOf @example
  it("is the name an Error, a DOMException or a bare object carries", () => {
    expect(thrownNameOf(new DOMException('No room.', 'QuotaExceededError'))).to.eq('QuotaExceededError')
    expect(thrownNameOf(new TypeError('hunter2 is not a function'))).to.eq('TypeError')
    expect(thrownNameOf({ name: 'SecurityError', message: 'from another frame' })).to.eq('SecurityError')
  })

  it("is null for anything without a string name", () => {
    expect(thrownNameOf('a bare string')).to.be.null
    expect(thrownNameOf(null)).to.be.null
    expect(thrownNameOf(undefined)).to.be.null
    expect(thrownNameOf({ name: 42 })).to.be.null
    expect(thrownNameOf({ message: 'nameless' })).to.be.null
  })
})
