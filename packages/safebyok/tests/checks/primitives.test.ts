import { describe, expect, it } from 'vitest'
import * as Zod from 'zod'
import { LabelPattern, MaxLabelChars, MaxUserIdChars, UserIdPattern, label, user_id } from '../../src/checks/primitives'

const LabelCases = [
  // regular usage:
  ["anthropic_api_key",  true,   'lowercase words joined by underscores'],
  ["anthropic",          true,   'a plain lowercase word'],
  ["ab",                 true,   'two characters is enough'],
  ["a2",                 true,   'may end in a digit'],
  ["a_1_b_2",            true,   'digits may follow each underscore'],
  ["x".repeat(40),       true,   'forty characters is the ceiling'],
  // edge cases:
  ["a",                  false,  'one character is too short'],
  ["2fast",              false,  'must start with a letter'],
  ["dev_",               false,  'may not end in an underscore'],
  ["_dev",               false,  'may not start with an underscore'],
  ["dev__key",           false,  'underscores come one at a time'],
  ["ANTHROPIC_API_KEY",  false,  'lowercase only'],
  ["anthropic key",      false,  'no spaces'],
  ["anthropic-key",      false,  'no hyphens'],
  ["a^b",                false,  'no ^, which a scopepath joins its names on'],
  ["caf\u{E9}",          false,  'no letter outside ASCII'],
  ["",                   false,  'never empty'],
  ["x".repeat(41),       false,  'forty-one characters is one too many'],
] as const

describe("label", () => {
  for (const [candidate, expected, blurb] of LabelCases) {
    it(blurb, () => { expect(label.safeParse(candidate).success).to.eq(expected) })
  }

  it("refuses what is not text: undefined, a number, null", () => {
    for (const misfit of [undefined, 42, null, ['anthropic']]) {
      expect(label.safeParse(misfit).success).to.be.false
    }
  })

  it("passes and refuses as its examples show", () => {
    expect(label.safeParse('anthropic_api_key').success).to.be.true
    expect(label.safeParse('ANTHROPIC_API_KEY').success).to.be.false
  })

  it("says what is wrong in its own sentences, and never quotes the label", () => {
    const said = JSON.stringify([label.safeParse('Secret_Label'), label.safeParse(`secret${'x'.repeat(MaxLabelChars)}`)].map((checked) => checked.error?.issues.map((issue) => issue.message)))
    expect(said).to.include('lowercase words of letters and digits')
    expect(said).to.include('at most 40 characters')
    expect(said.toLowerCase()).to.not.include('secret')
  })

  it("answers for text of millions of characters, refusing it by its length", () => {
    const vast = 'n'.repeat(12_000_000)
    expect(JSON.stringify(label.safeParse(vast).error?.issues.map((issue) => issue.message))).to.include('at most 40 characters')
    expect(LabelPattern.test(vast)).to.be.true
    expect(LabelPattern.test(`${vast}__`)).to.be.false
  })
})

describe("MaxLabelChars and LabelPattern", () => {
  it("are the bounds label checks: forty characters, and the pattern alone", () => {
    expect(MaxLabelChars).to.eq(40)
    const withinLength = LabelCases.filter(([candidate]) => candidate.length <= MaxLabelChars)
    for (const [candidate, expected] of withinLength) {
      expect(LabelPattern.test(candidate), candidate).to.eq(expected)
    }
  })

  it("gives a form's input its pattern and length, as its example shows", () => {
    const input = { pattern: LabelPattern.source, maxLength: MaxLabelChars }
    expect(new RegExp(input.pattern).test('anthropic_api_key')).to.be.true
    expect(new RegExp(input.pattern).test('Anthropic')).to.be.false
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
  ["alice+vault@example.com",              true,   'an email address, though a stable id is better'],
  ["user_2abc.def+work",                   true,   'dots and a plus among letters'],
  ["~alice",                               true,   'a tilde'],
  ["a%2Fb",                                true,   'a percent-encoded slash'],
  ["u".repeat(100),                        true,   'a hundred characters is the ceiling'],
  ["a.",                                   true,   'a dot beside a letter'],
  // edge cases:
  ["",                                     false,  'an empty id names no one'],
  [".",                                    false,  'one dot alone'],
  ["..",                                   false,  'dots alone, which a path would read as its parent'],
  ["u".repeat(101),                        false,  'a hundred and one is one too many'],
  ["alice smith",                          false,  'a space'],
  ["a^b",                                  false,  'a ^, which a scopepath joins its names on'],
  ["a/b",                                  false,  'a slash, to be percent-encoded'],
  ["cn=alice,ou=people",                   false,  'an LDAP name, its equals sign and comma'],
  ["\u{4E00}",                             false,  'a letter outside ASCII'],
  ["user_\u{1F511}",                       false,  'an emoji'],
  ["user_\u{D83D}",                        false,  'half of an emoji'],
  ["tab\there",                            false,  'a tab'],
] as const

describe("user_id", () => {
  for (const [candidate, expected, blurb] of UserIdCases) {
    it(blurb, () => { expect(user_id.safeParse(candidate).success).to.eq(expected) })
  }

  it("refuses what is not text: null, undefined, a number", () => {
    for (const misfit of [null, undefined, 42]) {
      expect(user_id.safeParse(misfit).success).to.be.false
    }
  })

  it("passes and refuses as its examples show", () => {
    expect(user_id.safeParse('user_2abc.def+work').success).to.be.true
    expect(user_id.safeParse('auth0|5f7c8ec7').success).to.be.true
    expect(user_id.safeParse('..').success).to.be.false
    expect(user_id.safeParse('a/b').success).to.be.false
    expect(user_id.safeParse('a%2Fb').success).to.be.true
  })

  it("names its bound when it refuses, and never quotes the id", () => {
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const refusals = [user_id.safeParse(overlong), user_id.safeParse(''), user_id.safeParse('alice smith')].map((checked) => JSON.stringify(checked.error?.issues.map((issue) => issue.message)))
    expect(refusals[0]).to.include('at most 100 characters')
    expect(refusals[1]).to.include("can't be empty")
    expect(refusals[2]).to.include('percent-encode')
    expect(refusals.join(' ')).to.not.include('alice')
  })
})

describe("UserIdPattern", () => {
  it("is the pattern user_id checks, as its example shows", () => {
    expect(UserIdPattern.test('auth0|5f7c8ec7c33c6c004bbafe82')).to.be.true
    const withinLength = UserIdCases.filter(([candidate]) => candidate.length > 0 && candidate.length <= MaxUserIdChars)
    for (const [candidate, expected] of withinLength) {
      expect(UserIdPattern.test(candidate), candidate).to.eq(expected)
    }
  })

  it("answers for millions of dots at once, refusing them", () => {
    expect(UserIdPattern.test('.'.repeat(12_000_000))).to.be.false
  })
})

describe("label and user_id, inside a host's own Zod", () => {
  // A host on classic Zod holds them in its own schemas, as a form checking a box might.
  const BoxForm = Zod.object({ boxlabel: label, user_id: Zod.optional(user_id) })

  it("compose into a host's schema and check as they do alone", () => {
    expect(BoxForm.parse({ boxlabel: 'anthropic_api_key', user_id: 'auth0|5f7c8ec7' })).to.deep.equal({ boxlabel: 'anthropic_api_key', user_id: 'auth0|5f7c8ec7' })
    expect(BoxForm.safeParse({ boxlabel: 'ANTHROPIC' }).success).to.be.false
    expect(BoxForm.safeParse({ boxlabel: 'anthropic', user_id: 'u'.repeat(101) }).success).to.be.false
  })
})
