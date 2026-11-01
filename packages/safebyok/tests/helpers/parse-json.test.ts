import { describe, expect, it } from 'vitest'
import { parseJsonOrNull } from '../../src/helpers/parse-json'

describe("parseJsonOrNull", () => {
  const Cases = [
    // JSON:
    ["{\"val\":\"sk-test-0000\"}",   { val: "sk-test-0000" },   'parses an object'],
    ["\"sk-test-0000\"",             "sk-test-0000",            'parses a bare string'],
    ["null",                         null,                      'parses JSON null as null, which reads the same as none'],
    // none:
    ["sk-test-0000 {",               null,                      'answers null for text that is no JSON, throwing nothing'],
    ["",                             null,                      'answers null for empty text'],
  ] as const
  for (const [text, expected, blurb] of Cases) {
    it(blurb, () => { expect(parseJsonOrNull(text)).to.deep.equal(expected) })
  }
})
