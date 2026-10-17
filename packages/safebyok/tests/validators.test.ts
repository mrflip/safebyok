import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import * as Validators from '../src/validators'
import { AnyTextValidators, DefaultValidators, Label, LabelPattern, MaxLabelChars, MaxUserIdChars, NameFloor, NameFloorBytes, UserId, UserIdPattern } from '../src/validators'
import { VaultScope } from '../src/types'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'

describe("safebyok/validators, as an entry point", () => {
  it("exports the default checks, their bounds, and the schemas a host's forms use, and no record schema", () => {
    expect(Object.keys(Validators)).to.have.members([
      'AnyTextValidators', 'DefaultValidators', 'Label', 'LabelPattern', 'MaxLabelChars', 'MaxUserIdChars', 'NameFloor', 'NameFloorBytes', 'UserId', 'UserIdPattern',
    ])
  })
})

const LabelCases = [
  // regular usage:
  ["anthropic_api_key",  true,   'lowercase words joined by underscores'],
  ["anthropic",          true,   'a plain lowercase word'],
  ["ab",                 true,   'two characters is enough'],
  ["a2",                 true,   'may end in a digit'],
  ["a_1_b_2",            true,   'digits may follow each underscore'],
  // edge cases:
  ["a",                  false,  'one character is too short'],
  ["2fast",              false,  'must start with a letter'],
  ["dev_",               false,  'may not end in an underscore'],
  ["_dev",               false,  'may not start with an underscore'],
  ["dev__key",           false,  'underscores come one at a time'],
  ["ANTHROPIC_API_KEY",  false,  'lowercase only'],
  ["anthropic key",      false,  'no spaces'],
  ["anthropic-key",      false,  'no hyphens'],
  ["",                   false,  'never empty'],
  ["x".repeat(41),       false,  'forty-one characters is one too many'],
  ["x".repeat(40),       true,   'forty characters is the ceiling'],
] as const

describe("Label", () => {
  for (const [candidate, expected, blurb] of LabelCases) {
    it(blurb, () => { expect(Label.safeParse(candidate).success).to.eq(expected) })
  }

  it("answers for text of millions of characters, refusing it by its length", () => {
    const vast = 'n'.repeat(12_000_000)
    expect(Label.safeParse(vast).success).to.be.false
    expect(JSON.stringify(Label.safeParse(vast).error?.issues.map((issue) => issue.message))).to.include('at most forty characters')
    expect(LabelPattern.test(vast)).to.be.true
    expect(LabelPattern.test(`${vast}__`)).to.be.false
  })
})

const UserIdCases = [
  // regular usage:
  ["u1",                                   true,   'a short id'],
  ["auth0|5f7c8ec7c33c6c004bbafe82",       true,   "Auth0's provider|id"],
  ["user_2fJ8Kq9xYzA1bC3dE4fG5hI6jK7",     true,   "Clerk's user id"],
  ["01J9ZQ3V4X8M2N6P5R7T9W1Y3B",           true,   'a ULID'],
  ["f47ac10b-58cc-4372-a567-0e02b2c3d479", true,   'a UUID'],
  ["001234.abcdef0123456789.0123",         true,   "Apple's dotted sub"],
  ["did:plc:z72i7hdynmk6r22z27h6tvur",     true,   'a DID'],
  ["alice+vault@example.com",              true,   'a practical email address, though a stable id is better'],
  ["u".repeat(100),                        true,   'a hundred characters is the ceiling'],
  // refused:
  ["",                                     false,  'an empty id names no one'],
  ["u".repeat(101),                        false,  'a hundred and one is one too many'],
  ["alice smith",                          false,  'a space'],
  ["a^b",                                  false,  'a caret, which key-value stores join names on'],
  ["a/b",                                  false,  'a slash, which an S3 store would join names on'],
  [String.raw`DOMAIN\user`,               false,  'a backslash, as a Windows domain login has'],
  ["cn=alice,ou=people",                   false,  'an LDAP name, its equals sign and comma'],
  ["\u{4E00}",                            false,  'a letter outside ASCII'],
  ["user_\u{1F511}",                      false,  'an emoji'],
  ["user_\u{D83D}",                       false,  'half of an emoji'],
  [42,                                     false,  'a number is not an id'],
  [null,                                   false,  'null names no one'],
] as const

describe("UserId", () => {
  for (const [candidate, expected, blurb] of UserIdCases) {
    it(blurb, () => { expect(UserId.safeParse(candidate).success).to.eq(expected) })
  }

  it("names its bound when it refuses, and never quotes the id", () => {
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const refusals = [UserId.safeParse(overlong), UserId.safeParse(''), UserId.safeParse('alice smith')].map((checked) => JSON.stringify(checked.error?.issues.map((issue) => issue.message)))
    expect(refusals[0]).to.include('at most 100 characters')
    expect(refusals[1]).to.include("can't be empty")
    expect(refusals[2]).to.include('ASCII letters, digits')
    expect(refusals.join(' ')).to.not.include('alice')
  })

  it("passes and refuses as its examples show", () => {
    expect(UserId.parse('auth0|5f7c8ec7c33c6c004bbafe82')).to.eq('auth0|5f7c8ec7c33c6c004bbafe82')
    expect(UserId.safeParse('').success).to.be.false
    expect(UserId.safeParse('u'.repeat(101)).success).to.be.false
    expect(UserId.safeParse('alice smith').success).to.be.false
  })
})

describe("UserIdPattern", () => {
  it("is the pattern UserId checks, as its example shows", () => {
    expect(UserIdPattern.test('auth0|5f7c8ec7c33c6c004bbafe82')).to.be.true
    const withinLength = UserIdCases.filter((row): row is typeof row & [string, boolean, string] => typeof row[0] === 'string' && row[0].length > 0 && row[0].length <= MaxUserIdChars)
    for (const [candidate, expected] of withinLength) {
      expect(UserIdPattern.test(candidate), candidate).to.eq(expected)
    }
  })
})

const NameFloorCases = [
  // regular usage:
  ["anthropic_api_key",              true,   'a default label'],
  ["Work: מפתח API",                 true,   'any script, spaces and punctuation'],
  ["caf\u{E9}",                      true,   'an accented letter, composed'],
  ["key \u{1F511}",                  true,   'an emoji, whole'],
  ["n".repeat(NameFloorBytes),       true,   'a kibibyte of ASCII is the ceiling'],
  // refused:
  ["",                               false,  'an empty name names nothing'],
  ["n".repeat(NameFloorBytes + 1),   false,  'a byte over a kibibyte'],
  ["\u{E9}".repeat((NameFloorBytes / 2) + 1), false, 'a kibibyte of UTF-8 in half as many characters'],
  ["cafe\u{301}",                    false,  'an accented letter decomposed: not NFC'],
  ["key \u{D83D}",                   false,  'half of an emoji: a lone surrogate'],
  ["tab\there",                      false,  'a tab'],
  ["line\nbreak",                    false,  'a newline'],
  ["nul\0",                          false,  'a NUL'],
  ["a^b",                            false,  'a ^, which key-value stores join names on'],
  ["next\u{85}line",                 false,  'a C1 control character'],
  [42,                               false,  'a number is not a name'],
] as const

/** What NameFloor says of a name it refuses: its issues' messages, as one text. */
const said = (candidate: string) => JSON.stringify(NameFloor.safeParse(candidate).error?.issues.map((issue) => issue.message))

describe("NameFloor", () => {
  for (const [candidate, expected, blurb] of NameFloorCases) {
    it(blurb, () => { expect(NameFloor.safeParse(candidate).success).to.eq(expected) })
  }

  it("passes and refuses as its examples show", () => {
    expect(NameFloor.safeParse('Work: מפתח API').success).to.be.true
    expect(NameFloor.safeParse('key \u{D83D}').success).to.be.false
    expect(NameFloor.safeParse('cafe\u{301}').success).to.be.false
    expect(NameFloor.safeParse('tab\there').success).to.be.false
    expect(NameFloor.safeParse('a^b').success).to.be.false
  })

  it("refuses the very character Ckeys joins on, so every store refuses it alike", () => {
    expect(NameFloor.safeParse(`a${Ckeys.Delimiter}b`).success).to.be.false
    expect(said(`secret-ish${Ckeys.Delimiter}`)).to.include('no ^')
  })

  it("says what is wrong, quoting nothing", () => {
    expect(said('secret-ish\u{7}')).to.include('no control characters')
    expect(said('secret-ise\u{301}')).to.include('NFC')
    expect(said('secret-ish\u{D800}')).to.include('lone surrogate')
    expect(said(`secret-ish${'n'.repeat(NameFloorBytes)}`)).to.include('1024 bytes')
    expect(said('secret-ish\u{7}') + said('secret-ise\u{301}')).to.not.include('secret-is')
  })

  it("answers for text of millions of characters at once, by its length", () => {
    const said = JSON.stringify(NameFloor.safeParse(`${'n'.repeat(12_000_000)}\u{7}\u{D800}`).error?.issues.map((issue) => issue.message))
    expect(said).to.include('1024 bytes')
    expect(said).to.not.include('control')
  })
})

describe("MaxLabelChars and LabelPattern", () => {
  it("are the bounds Label checks: forty characters, and the pattern alone", () => {
    expect(Label.safeParse('x'.repeat(MaxLabelChars)).success).to.be.true
    expect(Label.safeParse('x'.repeat(MaxLabelChars + 1)).success).to.be.false
    const withinLength = LabelCases.filter(([label]) => label.length <= MaxLabelChars)
    for (const [candidate, expected] of withinLength) {
      expect(LabelPattern.test(candidate)).to.eq(expected)
    }
  })

  it("gives a form's input its pattern and length, as its example shows", () => {
    const input = { pattern: LabelPattern.source, maxLength: MaxLabelChars }
    expect(new RegExp(input.pattern).test('anthropic_api_key')).to.be.true
    expect(new RegExp(input.pattern).test('Anthropic')).to.be.false
    expect(input.maxLength).to.eq(40)
  })
})

describe("AnyTextValidators", () => {
  it("admits, in every field, whatever passes the floor, and nothing that is not text", () => {
    for (const check of Object.values(AnyTextValidators)) {
      expect(check.safeParse('Mixed: English, עברית, العربية, ไทย, \u{202E}').success).to.be.true
      expect(check.safeParse('emoji \u{1F511}').success).to.be.true
      expect(check.safeParse('n'.repeat(NameFloorBytes)).success).to.be.true
      expect(check.safeParse(42).success).to.be.false
    }
    expect(Object.isFrozen(AnyTextValidators)).to.be.true
  })

  it("is the floor itself, field by field", () => {
    expect(AnyTextValidators).to.deep.equal({ applabel: NameFloor, vaultlabel: NameFloor, boxlabel: NameFloor, userId: NameFloor, unlocklabel: NameFloor })
  })

  it("refuses, in every field, a lone surrogate, a carriage return, and text not in NFC", () => {
    for (const check of Object.values(AnyTextValidators)) {
      expect(check.safeParse('key \u{D83D}').success).to.be.false
      expect(check.safeParse('\u{DD11} key').success).to.be.false
      expect(check.safeParse('control\r\n').success).to.be.false
      expect(check.safeParse('cafe\u{301}').success).to.be.false
    }
  })

  it("refuses any control character in a name, a tab and a newline included", () => {
    expect(AnyTextValidators.boxlabel.safeParse('two\nlines').success).to.be.false
    expect(AnyTextValidators.boxlabel.safeParse('two\tcolumns').success).to.be.false
  })

  it("answers for text of millions of characters, refusing it by its length", () => {
    const vast = 'n'.repeat(12_000_000)
    expect(AnyTextValidators.boxlabel.safeParse(vast).success).to.be.false
    const said = JSON.stringify(NameFloor.safeParse(`${vast}\u{0007}\u{D800}`).error?.issues.map((issue) => issue.message))
    expect(said).to.include('at most 1024 bytes')
  })

  it("passes and refuses as its examples show", () => {
    expect(AnyTextValidators.boxlabel.safeParse('Work: מפתח API').success).to.be.true
    expect(AnyTextValidators.boxlabel.safeParse('key \u{D83D}').success).to.be.false
  })

  it("composes with a default, as its second example shows", () => {
    const validators = { ...AnyTextValidators, userId: UserId }
    expect(validators.boxlabel.safeParse('Anthropic API key').success).to.be.true
    expect(validators.userId.safeParse('').success).to.be.false
  })
})

describe("DefaultValidators", () => {
  it("checks each label with Label, an unlocklabel included, and the user with UserId", () => {
    expect(DefaultValidators).to.deep.equal({ applabel: Label, vaultlabel: Label, boxlabel: Label, userId: UserId, unlocklabel: Label })
    expect(DefaultValidators.applabel).to.eq(Label)
    expect(DefaultValidators.userId).to.eq(UserId)
  })

  it("is frozen: a host replaces a check in openVault's validators, never here", () => {
    expect(Object.isFrozen(DefaultValidators)).to.be.true
  })

  it("passes and refuses as its example shows", () => {
    expect(DefaultValidators.boxlabel.safeParse('anthropic_api_key').success).to.be.true
    expect(DefaultValidators.boxlabel.safeParse('Anthropic API key').success).to.be.false
  })
})

describe("the default validators, inside a host's own Zod", () => {
  // A host on classic Zod holds them in its own schemas, as a form checking a lockbox might.
  const BoxForm = ZClassic.object({ scope: VaultScope, boxlabel: Label, userId: ZClassic.optional(UserId) })

  it("compose into a classic Zod schema and check as they do alone", () => {
    const form = { scope: TH.scopeOf('u1'), boxlabel: 'anthropic_api_key', userId: 'auth0|5f7c8ec7' }
    expect(BoxForm.parse(form)).to.deep.equal(form)
  })

  it("refuse inside a classic Zod schema what they refuse alone", () => {
    expect(BoxForm.safeParse({ scope: TH.scopeOf('u1'), boxlabel: 'ANTHROPIC' }).success).to.be.false
    expect(BoxForm.safeParse({ scope: TH.scopeOf('u1'), boxlabel: 'anthropic', userId: 'u'.repeat(101) }).success).to.be.false
  })
})
