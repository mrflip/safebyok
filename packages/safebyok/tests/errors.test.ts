import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VaultError, VaultErrorFamilyForKind, VaultErrorFamilyVals, VaultErrorKindVals, isVaultCondition, isVaultError } from '../src/errors'

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
  VaultErrorKindVals.filter((kind) => text.includes(`\`${kind}\``))
)

const MisuseKinds    = tableKinds(between(readmeText, '### Misuse', '### Conditions'))
const ConditionKinds = tableKinds(between(readmeText, '### Conditions', '\n## '))

describe("VaultErrorKindVals", () => {
  it("lists each kind once", () => {
    expect(new Set(VaultErrorKindVals).size).to.eq(VaultErrorKindVals.length)
  })

  it("is documented in the README, each kind in exactly one family's table", () => {
    expect([...MisuseKinds, ...ConditionKinds]).to.have.members([...VaultErrorKindVals])
    expect(MisuseKinds.filter((kind) => ConditionKinds.includes(kind))).to.deep.equal([])
  })

  it("puts the same kinds in each family as the doc block in errors.ts does", () => {
    expect(namedKinds(between(errorsSource, '- **Misuse**', '- **Condition**'))).to.have.members(MisuseKinds)
    expect(namedKinds(between(errorsSource, '- **Condition**', '`vault_full` means'))).to.have.members(ConditionKinds)
  })
})

describe("VaultError", () => {
  it("carries its kind, and isVaultError tells it apart", () => {
    const err = new VaultError('vault_full', 'This vault is full.')
    expect(err.kind).to.eq('vault_full')
    expect(isVaultError(err)).to.be.true
    expect(isVaultError(err, 'vault_full')).to.be.true
    expect(isVaultError(err, 'stale_write')).to.be.false
    expect(isVaultError(new Error('vault_full'))).to.be.false
  })
})

/** The kinds VaultErrorFamilyForKind puts in `family`. */
const familyKinds = (family: string): string[] => VaultErrorKindVals.filter((kind) => VaultErrorFamilyForKind[kind] === family)

describe("VaultErrorFamilyForKind", () => {
  it("names a family for every kind, and only for kinds", () => {
    expect(Object.keys(VaultErrorFamilyForKind)).to.have.members([...VaultErrorKindVals])
  })

  it("uses only the families in VaultErrorFamilyVals, and uses both", () => {
    expect([...new Set(Object.values(VaultErrorFamilyForKind))]).to.have.members([...VaultErrorFamilyVals])
  })

  it("puts each kind in the family the README's tables do", () => {
    expect(familyKinds('misuse')).to.have.members(MisuseKinds)
    expect(familyKinds('condition')).to.have.members(ConditionKinds)
  })

  it("matches the @examples", () => {
    expect(VaultErrorFamilyForKind.bad_option).to.eq('misuse')
    expect(VaultErrorFamilyForKind.storage_unavailable).to.eq('condition')
  })
})

const FamilyCases = [
  // misuse: the host developer's code is wrong, and no user action fixes it
  ["bad_label",           "misuse",    'a label the app chose that breaks the rules is a bug'],
  ["bad_whisper",         "misuse",    'storing what JSON cannot carry is a bug'],
  ["bad_option",          "misuse",    'an Vault.make option out of range is a bug'],
  ["vault_closed",        "misuse",    'using a handle after close() is a bug'],
  ["unknown_key_deriver", "misuse",    'opening with the wrong key deriver is a bug'],
  ["insecure_context",    "misuse",    'serving the app over plain http is a deployment bug'],
  // conditions: normal operation, which may reach the user
  ["vault_locked",        "condition", 'a locked vault asks for the passphrase'],
  ["wrong_passphrase",    "condition", 'a mistyped passphrase asks again'],
  ["created_elsewhere",   "condition", 'a vault made on another device meanwhile asks for the passphrase chosen there'],
  ["weak_passphrase",     "condition", 'a passphrase too easy to guess asks the user for another'],
  ["wrong_passkey",       "condition", 'a passkey that does not open the vault asks again, or for a passphrase'],
  ["passkey_unavailable", "condition", 'a browser or authenticator without PRF falls back to the passphrase'],
  ["absent_box",          "condition", 'a lockbox retired elsewhere is a fact of syncing'],
  ["absent_vault",        "condition", 'a vault never made is made by the first unlock'],
  ["absent_wayin",        "condition", 'a passphrase removed on another device is a fact of syncing'],
  ["whisper_too_large",   "condition", "an oversized whisper is the user's value, not the code"],
  ["lockbox_too_large",   "condition", "a lockbox too heavy for one record is the user's whisper and note, not the code"],
  ["vault_full",          "condition", 'a full vault tells the user to retire a lockbox'],
  ["too_many_wayins",     "condition", 'a vault holding its limit of passphrases tells the user to remove one'],
  ["last_wayin",          "condition", 'removing the last passphrase is refused, and the user told why'],
  ["corrupt_record",      "condition", 'a damaged record is told to the user, not thrown at the developer'],
  ["damaged_vault",       "condition", 'a vault stored damaged is told to the user, who cannot open it'],
  ["damaged_wayin",       "condition", 'a way in stored damaged sends the user to another way in'],
  ["damaged_lockbox",     "condition", 'a lockbox stored damaged is told to the user, who may retire it'],
  ["newer_format",        "condition", 'a vault a newer version wrote is told to the user, who updates the app'],
  ["stale_write",         "condition", 'another device writing first is a fact of syncing'],
  ["rolled_back",         "condition", 'storage handing back an older copy of the vault is a fact a user can be told'],
  ["not_permitted",       "condition", 'a call refused to the signed-in owner is told to them'],
  ["identity_revoked",    "condition", 'a signed-out user signs in again'],
  ["storage_unavailable", "condition", 'unreachable storage is tried again shortly'],
  ["storage_blocked",     "condition", 'a browser withholding its storage is told to the user, without a retry'],
] as const

describe("each kind's family", () => {
  it("covers every kind in the cases below", () => {
    expect(FamilyCases.map(([kind]) => kind)).to.have.members([...VaultErrorKindVals])
  })

  for (const [kind, family, blurb] of FamilyCases) {
    it(blurb, () => { expect(VaultErrorFamilyForKind[kind]).to.eq(family) })
  }
})

const ConditionCases = [
  [new VaultError('storage_unavailable', 'The vault storage could not be reached.'), true,  'a condition VaultError'],
  [new VaultError('identity_revoked', 'Sign in to reach this vault.'),               true,  'a signed-out refusal'],
  [new VaultError('not_permitted', 'You may not change this vault.'),                true,  'a refusal of the signed-in user'],
  [new VaultError('bad_label', 'A label is 2-40 lowercase letters.'),                false, 'a misuse VaultError'],
  [new VaultError('vault_closed', 'This vault handle was closed.'),                  false, 'a closed handle, misuse too'],
  [new Error('storage_unavailable'),                                                false, 'a plain Error, even one whose message names a condition'],
  [{ kind: 'storage_unavailable', message: 'down' },                                false, 'an object shaped like a VaultError, but not one'],
  [null,                                                                            false, 'a thrown null'],
  [undefined,                                                                       false, 'a thrown undefined'],
  ['storage_unavailable',                                                           false, 'a thrown string'],
] as const

describe("isVaultCondition", () => {
  for (const [thrown, expected, blurb] of ConditionCases) {
    it(`is ${String(expected)} for ${blurb}`, () => { expect(isVaultCondition(thrown)).to.eq(expected) })
  }

  it("narrows to a VaultError, so the caller can read its kind and message", () => {
    const err: unknown = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    if (! isVaultCondition(err)) { throw new Error('expected a condition') }
    expect(err.kind).to.eq('storage_unavailable')
    expect(err.message).to.eq('The vault storage could not be reached.')
  })

  it("matches the @example: a condition is shown, anything else is rethrown", () => {
    const shown: string[] = []
    const handle = (err: unknown) => {
      if (! isVaultCondition(err)) { throw err }
      shown.push(err.message)
    }
    handle(new VaultError('whisper_too_large', 'That whisper is over the limit.'))
    expect(shown).to.deep.equal(['That whisper is over the limit.'])
    expect(() => { handle(new VaultError('bad_whisper', 'A whisper must be a JSON value.')) }).to.throw('A whisper must be a JSON value.')
  })
})
