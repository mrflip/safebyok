import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import { parseDbName, parseIdbOpts, type IdbOpts } from '../src/idb-opts'

const DbNameCases = [
  // regular usage:
  [undefined,                 "safebyok",  'no options at all reads as the default'],
  [{},                        "safebyok",  'a bag without a dbName reads as the default'],
  [{ dbName: undefined },     "safebyok",  'an undefined dbName reads as the default'],
  [{ dbName: "acme" },        "acme",      'a plain name is kept'],
  [{ dbName: "my-app db" },   "my-app db", 'any non-empty text is a name IndexedDB takes'],
] as const

describe("parseDbName", () => {
  for (const [opts, expected, blurb] of DbNameCases) {
    it(blurb, () => { expect(parseDbName(opts, 'idbDeviceDB')).to.eq(expected) })
  }

  it("refuses an empty or non-text dbName, naming the call, never the input", () => {
    for (const dbName of ['', 42, ['acme']]) {
      expect(() => parseDbName({ dbName } as unknown as IdbOpts, 'browserOpts'))
        .to.throw(VaultError, /^browserOpts takes an optional dbName/).with.property('kind', 'bad_option')
    }
  })
})

describe("parseIdbOpts", () => {
  it("takes a dbName and a ckeyDelimiter, leaving the delimiter's own check to Ckeys", () => {
    expect(parseIdbOpts({ dbName: 'acme', ckeyDelimiter: '/' }, 'browserOpts')).to.deep.equal({ dbName: 'acme', ckeyDelimiter: '/' })
    expect(parseIdbOpts(undefined, 'browserOpts')).to.deep.equal({ dbName: 'safebyok' })
  })

  it("refuses a ckeyDelimiter that is not text, naming the call and the option, never the input", () => {
    expect(() => parseIdbOpts({ ckeyDelimiter: 42 } as unknown as IdbOpts, 'idbDeviceDB'))
      .to.throw(VaultError, /^idbDeviceDB takes .* and an optional ckeyDelimiter, one character\.$/).with.property('kind', 'bad_option')
  })
})
