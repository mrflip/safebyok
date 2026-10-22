import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { VaultError, RefusalFamilyForKind, RefusalFamilyVals, RefusalKindVals, isCondition, isVaultError } from '../src/errors'

const readmeText = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const errorsSource = readFileSync(new URL('../src/errors.ts', import.meta.url), 'utf8')

/** The text from `from` up to the next `until`, or to the end. */
const between = (text: string, from: string, until: string): string => {
  const start = text.indexOf(from)
  const end = text.indexOf(until, start)
  return text.slice(start, end === -1 ? text.length : end)
}

/** The kinds in the backticked first cell of each table row of `text`. */
const tableKinds = (text: string): string[] => (
  Array.from(text.matchAll(/^\| `([a-z_]+)`/gm), (hit) => hit[1]!)
)

/** The kinds a doc block names, in backticks. */
const namedKinds = (text: string): string[] => (
  RefusalKindVals.filter((kind) => text.includes(`\`${kind}\``))
)

const MisuseKinds    = tableKinds(between(readmeText, '### Misuse', '### Conditions'))
const ConditionKinds = tableKinds(between(readmeText, '### Conditions', '### Bad news'))
const BadNewsKinds   = tableKinds(between(readmeText, '### Bad news', '\n## '))

describe("RefusalKindVals", () => {
  it("lists each kind once", () => {
    expect(new Set(RefusalKindVals).size).to.eq(RefusalKindVals.length)
  })

  it("is documented in the README, each kind in exactly one family's table", () => {
    expect([...MisuseKinds, ...ConditionKinds, ...BadNewsKinds]).to.have.members([...RefusalKindVals])
  })

  it("puts the same kinds in each family as the doc block in errors.ts does", () => {
    expect(namedKinds(between(errorsSource, '* **Misuse**', '* **Condition**'))).to.have.members(MisuseKinds)
    expect(namedKinds(between(errorsSource, '* **Condition**', '* **Bad news**'))).to.have.members(ConditionKinds)
    expect(namedKinds(between(errorsSource, '* **Bad news**', '* `vault_full` means'))).to.have.members(BadNewsKinds)
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

  it("carries refusalkind, family, message and cause, and its family read from the one table (Contract: Shapes)", () => {
    const cause = new Error('socket closed')
    const err = new VaultError('storage_unavailable', 'Try again shortly.', { cause })
    expect(err).to.include({ refusalkind: 'storage_unavailable', family: 'condition', message: 'Try again shortly.', cause })
    for (const refusalkind of RefusalKindVals) {
      expect(new VaultError(refusalkind, 'Said.').family).to.eq(RefusalFamilyForKind[refusalkind])
    }
  })

  it("keeps each fact a refusal learned under its own name in meta, and has no meta when it learned none (Contract: Shapes)", () => {
    const capacity = { boxes: { used: 3, max: 3 }, bytes: { used: 900, max: 1000 } }
    const full = new VaultError('vault_full', 'This vault is full.', { meta: { capacity } })
    expect(full.meta).to.deep.equal({ capacity })
    const stale = new VaultError('stale_write', 'Read it again.', { meta: { box_stored: null } })
    expect(stale.meta).to.deep.equal({ box_stored: null })
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

  it("lets a caller branch on family, as its second example shows", () => {
    const err = new VaultError('bad_record', 'Not one this package builds.')
    expect(err.family).to.eq('misuse')
  })
})

/** The kinds RefusalFamilyForKind puts in `family`. */
const familyKinds = (family: string): string[] => RefusalKindVals.filter((kind) => RefusalFamilyForKind[kind] === family)

describe("RefusalFamilyForKind", () => {
  it("names a family for every kind, and only for kinds", () => {
    expect(Object.keys(RefusalFamilyForKind)).to.have.members([...RefusalKindVals])
  })

  it("uses only the families in RefusalFamilyVals, and uses each of them", () => {
    expect([...new Set(Object.values(RefusalFamilyForKind))]).to.have.members([...RefusalFamilyVals])
  })

  it("puts each kind in the family the README's tables do", () => {
    expect(familyKinds('misuse')).to.have.members(MisuseKinds)
    expect(familyKinds('condition')).to.have.members(ConditionKinds)
    expect(familyKinds('bad_news')).to.have.members(BadNewsKinds)
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
  ["bad_label",           "misuse",    'a label the app chose that breaks the rules is a bug'],
  ["bad_whisper",         "misuse",    'storing what JSON cannot carry is a bug'],
  ["bad_option",          "misuse",    'an Vault.make option out of range is a bug'],
  ["bad_record",          "misuse",    'handing a VaultDB a record this package does not build is a bug'],
  ["invalid_box",         "misuse",    'handing a VaultDB a box this package does not build, or one for another vaultKey, is a bug'],
  ["corrupt_record",      "misuse",    "a storage adapter's wrong answer is the developer's bug to fix, never the user's"],
  ["vault_closed",        "misuse",    'using a handle after close() is a bug'],
  ["unknown_key_deriver", "misuse",    'opening with the wrong key deriver is a bug'],
  ["insecure_context",    "misuse",    'serving the app over plain http is a deployment bug'],
  ["unexpected_error",    "misuse",    'a throw that is no refusal is a bug, in safebyok or in a function the app handed it'],
  // conditions: normal operation, which may reach the user; bad news: told to the user, nobody's bug
  ["vault_locked",        "condition", 'a locked vault asks for the passphrase'],
  ["wrong_passphrase",    "condition", 'a mistyped passphrase asks again'],
  ["created_elsewhere",   "condition", 'a vault made on another device meanwhile asks for the passphrase chosen there'],
  ["weak_passphrase",     "condition", 'a passphrase too easy to guess asks the user for another'],
  ["wrong_passkey",       "condition", 'a passkey that does not open the vault asks again, or for a passphrase'],
  ["passkey_unavailable", "condition", 'a browser or authenticator without PRF falls back to the passphrase'],
  ["absent_box",          "condition", 'a box deleted elsewhere is a fact of syncing'],
  ["absent_vault",        "condition", 'a vault never made is made by the first unlock'],
  ["absent_wayin",        "condition", 'a passkey removed on another device is a fact of syncing'],
  ["whisper_too_large",   "condition", "an oversized whisper is the user's value, not the code"],
  ["box_too_large",       "condition", "a box too heavy for one record is the user's whisper and note, not the code"],
  ["vault_full",          "condition", 'a full vault tells the user to remove a box'],
  ["damaged_vault",       "bad_news",  'a vault stored damaged is told to the user, who cannot open it'],
  ["damaged_wayin",       "bad_news",  'a way in stored damaged sends the user to another way in'],
  ["damaged_box",         "bad_news",  'a box stored damaged is told to the user, who may remove it'],
  ["newer_format",        "bad_news",  'a vault a newer version wrote is told to the user, who updates the app'],
  ["stale_write",         "condition", 'another device writing first is a fact of syncing'],
  ["vault_mismatch",      "condition", 'a vault deleted or made anew on another device is a fact of syncing'],
  ["rolled_back",         "bad_news",  'storage handing back an older copy of the vault is a fact a user can be told'],
  ["not_permitted",       "condition", 'a call refused to the signed-in owner is told to them'],
  ["identity_revoked",    "bad_news",  'a signed-out user signs in again'],
  ["storage_unavailable", "condition", 'unreachable storage is tried again shortly'],
  ["storage_blocked",     "condition", 'a browser withholding its storage is told to the user, without a retry'],
  ["vault_gone",          "condition", 'a vault deleted while a call worked on it is a fact of syncing'],
  ["vault_remade",        "condition", 'a vault deleted and made anew while a call worked on it is a fact of syncing'],
  ["gate_moved",          "condition", 'a passphrase or passkey changed while a call worked under the old one is a fact of syncing'],
] as const

describe("each kind's family", () => {
  it("covers every kind in the cases below", () => {
    expect(FamilyCases.map(([kind]) => kind)).to.have.members([...RefusalKindVals])
  })

  for (const [kind, family, blurb] of FamilyCases) {
    it(blurb, () => { expect(RefusalFamilyForKind[kind]).to.eq(family) })
  }
})

const ConditionCases = [
  [new VaultError('storage_unavailable', 'The vault storage could not be reached.'), true,  'a condition VaultError'],
  [new VaultError('identity_revoked', 'Sign in to reach this vault.'),               true,  'a signed-out refusal, bad news the app shows'],
  [new VaultError('damaged_box', 'That box is damaged.'),                            true,  'a damaged box, bad news too'],
  [new VaultError('not_permitted', 'You may not change this vault.'),                true,  'a refusal of the signed-in user'],
  [new VaultError('bad_label', 'A label is 2-40 lowercase letters.'),                false, 'a misuse VaultError'],
  [new VaultError('vault_closed', 'This vault handle was closed.'),                  false, 'a closed handle, misuse too'],
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

  it("narrows to a VaultError, so the caller can read its kind and message", () => {
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
    handle(new VaultError('whisper_too_large', 'That whisper is over the limit.'))
    expect(shown).to.deep.equal(['That whisper is over the limit.'])
    expect(() => { handle(new VaultError('bad_whisper', 'A whisper must be a JSON value.')) }).to.throw('A whisper must be a JSON value.')
  })
})

describe("isVaultError", () => {
  it("tells a refusal of the kind asked, as its example shows", () => {
    const prompted: string[] = []
    const handle = (err: unknown) => { if (isVaultError(err, 'vault_locked')) { prompted.push('passphrase') } }
    handle(new VaultError('vault_locked', 'Unlock the vault first.'))
    handle(new VaultError('absent_box', 'No box under that label.'))
    expect(prompted).to.deep.equal(['passphrase'])
  })

  it("is false for a VaultError of another copy of safebyok, as an ESM and a CJS build loaded side by side make: it is a foreign throw", async () => {
    vi.resetModules()
    const Other = await import('../src/errors')
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
