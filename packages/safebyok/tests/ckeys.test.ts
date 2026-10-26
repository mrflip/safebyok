import { describe, expect, it } from 'vitest'
import * as Ckeys from '../src/ckeys'
import type { VaultScope } from '../src/types/types'
import { memoryStore } from '../src/string-store'
import * as TH from './test-helpers'

const u1 = TH.scopeOf('u1')

describe("Ckeys, the ckey of each row", () => {
  it("files the vault props under their kind and scope, joined on ^", () => {
    expect(Ckeys.vaultProps(u1)).to.eq('vault^acme^u1^main')
  })

  it("files a box under its kind, scope and boxlabel, joined on ^", () => {
    expect(Ckeys.box(u1, 'anthropic')).to.eq('box^acme^u1^main^anthropic')
  })

  it("files a lease under its kind and scope, joined on ^, as its example shows", () => {
    expect(Ckeys.lease(u1)).to.eq('lease^acme^u1^main')
  })

  it("files a device record under its kind and scope, joined on ^", () => {
    expect(Ckeys.deviceRecord(u1)).to.eq('device^acme^u1^main')
  })

  it("begins every box ckey of a scope with its box prefix: the first four parts and a trailing ^", () => {
    expect(Ckeys.boxPrefix(u1)).to.eq('box^acme^u1^main^')
    expect(Ckeys.box(u1, 'anthropic').startsWith(Ckeys.boxPrefix(u1))).to.be.true
  })

  it("picks a scope's box ckeys out of a store, and nothing else", () => {
    const store = memoryStore()
    const others = [Ckeys.vaultProps(u1), Ckeys.lease(u1), Ckeys.box(TH.scopeOf('u2'), 'anthropic'), Ckeys.box(TH.scopeOf('u12'), 'anthropic'), '["box","acme","u1","main","legacy"]']
    for (const ckey of [...others, Ckeys.box(u1, 'anthropic'), Ckeys.box(u1, 'openai')]) {
      store.write(ckey, '{}')
    }
    expect(store.ckeys().filter(Ckeys.isBoxIn(u1))).to.have.members([Ckeys.box(u1, 'anthropic'), Ckeys.box(u1, 'openai')])
  })

  it("passes over a ckey that is not text, as IndexedDB may hold", () => {
    const isBox = Ckeys.isBoxIn(u1)
    expect(isBox(42)).to.be.false
    expect(isBox(undefined)).to.be.false
    expect(isBox(['box', 'acme', 'u1', 'main', 'anthropic'])).to.be.false
  })

  it("splits back into the names it joins, whatever text they hold but the delimiter", () => {
    const scope = { applabel: 'a:"b"', user_id: String.raw`\,[]`, vaultlabel: 'עברית ไทย' }
    expect(Ckeys.box(scope, 'x/y').split('^')).to.deep.equal(['box', 'a:"b"', String.raw`\,[]`, 'עברית ไทย', 'x/y'])
  })

  it("says the character it joins on", () => {
    expect(Ckeys.Delimiter).to.eq('^')
  })
})

const HoldingCaret = [
  [{ ...u1, applabel: 'ac^me' },   'anthropic',  'applabel'],
  [{ ...u1, user_id: 'u1^x' },     'anthropic',  'user_id'],
  [{ ...u1, vaultlabel: '^main' }, 'anthropic',  'vaultlabel'],
  [u1,                             'anthro^pic', 'boxlabel'],
] as const

describe("Ckeys, refusing a name that holds its delimiter", () => {
  for (const [scope, boxlabel, part] of HoldingCaret) {
    it(`refuses a ${part} holding ^ as bad_scope, naming the part and quoting none of it`, () => {
      const refusal = TH.expectSyncRefusal(() => Ckeys.box(scope, boxlabel), 'bad_scope')
      expect(TH.thrownText(refusal)).to.include(part)
      expect(TH.thrownText(refusal)).to.not.include('anthro^pic')
      expect(TH.thrownText(refusal)).to.not.include('u1^x')
    })
  }

  it("refuses a scope holding ^ in every ckey it makes: vault props, lease, device record and prefix", () => {
    const scope = { ...u1, user_id: 'u1^x' }
    for (const make of [Ckeys.vaultProps, Ckeys.lease, Ckeys.deviceRecord, Ckeys.boxPrefix]) {
      TH.expectSyncRefusal(() => make(scope), 'bad_scope')
    }
  })

  it("refuses as its last example shows", () => {
    TH.expectSyncRefusal(() => Ckeys.box({ ...u1, user_id: 'a^b' }, 'x'), 'bad_scope')
  })
})

/** A scope from a tuple, for the tables below. */
const scopeFrom = ([applabel = '', userId = '', vaultlabel = '']: readonly string[]): VaultScope => ({ applabel, user_id: userId, vaultlabel })

/**
 * Pairs of addresses -- applabel, user_id, vaultlabel, boxlabel -- that a join on a separator
 * other than ^ would confuse. Each must get two different ckeys, and neither's scope may list the
 * other's box.
 */
const NearTwins = [
  // a separator, slid across a boundary:
  [["acme", "u1:x", "main", "box"],       ["acme", "u1", "x:main", "box"],         'a colon moved from the user_id into the vaultlabel'],
  [["acme", "u1", "main:x", "box"],       ["acme", "u1", "main", "x:box"],         'a colon moved from the vaultlabel into the boxlabel'],
  [["acme", "u1/x", "main", "box"],       ["acme", "u1", "x/main", "box"],         'a slash moved across a boundary'],
  [["acme", "u1|x", "main", "box"],       ["acme", "u1", "x|main", "box"],         'a pipe moved across a boundary'],
  // names that differ only by one character a join or an escape might lose:
  [["acme", "u1", "main", "box"],         ["acme", "u1:", "main", "box"],          'a trailing colon'],
  [["acme", "u1", "main", "box"],         ["acme", 'u1"', "main", "box"],          'a trailing quote'],
  [["acme", "u1", "main", "box"],         ["acme", String.raw`u1\\`, "main", "box"],   'trailing backslashes'],
  [["acme", "u1", "main", "box"],         ["acme", "[u1]", "main", "box"],         'brackets'],
  [["acme", "é", "main", "box"],          ["acme", "e\u{301}", "main", "box"],     'two spellings of the same accented letter, kept apart as given'],
  [["", "u1", "main", "box"],             ["u1", "", "main", "box"],               'an empty name moved'],
] as const

describe("Ckeys, between near twins", () => {
  for (const [one, two, blurb] of NearTwins) {
    it(`never confuses ${blurb}`, () => {
      const [oneScope, twoScope] = [scopeFrom(one), scopeFrom(two)]
      const [oneBox, twoBox] = [Ckeys.box(oneScope, one[3]), Ckeys.box(twoScope, two[3])]
      expect(oneBox).to.not.eq(twoBox)
      expect(Ckeys.isBoxIn(oneScope)(twoBox)).to.be.false
      expect(Ckeys.isBoxIn(twoScope)(oneBox)).to.be.false
    })
  }
})

describe("Ckeys, over every split of one awkward string", () => {
  // Every way to cut this string into applabel, user_id, vaultlabel and boxlabel: 220 addresses
  // made of the same characters in the same order, which a join on any of them would confuse.
  const awkward = String.raw`a:"b\/[c]`
  const cuts = Array.from({ length: awkward.length + 1 }, (_unused, ii) => ii)
  const addresses = cuts.flatMap((one) => cuts.flatMap((two) => cuts.flatMap((three) => (
    one <= two && two <= three ? [[awkward.slice(0, one), awkward.slice(one, two), awkward.slice(two, three), awkward.slice(three)]] : []
  ))))

  it("gives each a ckey of its own", () => {
    const boxCkeys = new Set(addresses.map((address) => Ckeys.box(scopeFrom(address), address[3] ?? '')))
    expect(addresses).to.have.lengthOf(220)
    expect(boxCkeys.size).to.eq(addresses.length)
  })

  it("lists each scope's boxes alone", () => {
    const leaks = addresses.map((address) => scopeFrom(address)).flatMap((scope) => {
      const isBox = Ckeys.isBoxIn(scope)
      return addresses.filter((address) => {
        const owner = scopeFrom(address)
        const isOwn = owner.applabel === scope.applabel && owner.user_id === scope.user_id && owner.vaultlabel === scope.vaultlabel
        return ! isOwn && isBox(Ckeys.box(owner, address[3] ?? ''))
      })
    })
    expect(leaks).to.have.lengthOf(0)
  })
})

describe("Ckeys.boxlabelOf", () => {
  it("reads the boxlabel back from a box's ckey, whatever text it holds but the delimiter", () => {
    expect(Ckeys.boxlabelOf(Ckeys.box(u1, 'anthropic'))).to.eq('anthropic')
    expect(Ckeys.boxlabelOf('box^acme^u1^main^anthropic')).to.eq('anthropic')
    expect(Ckeys.boxlabelOf(Ckeys.box(u1, 'OpenAI: "work", [1]'))).to.eq('OpenAI: "work", [1]')
  })

  const Unreachable = [
    ['box^acme^u1^main',                         'a ckey too short'],
    ['box^acme^u1^main^x^y',                     'a ckey too long'],
    ['lease^acme^u1^main^x',                     'another kind'],
    ['["box","acme","u1","main","anthropic"]',   "an earlier version's ckey"],
  ] as const
  for (const [ckey, blurb] of Unreachable) {
    it(`gives null, never throwing, for ${blurb}`, () => {
      expect(Ckeys.boxlabelOf(ckey)).to.be.null
    })
  }
})

describe("Ckeys.isLease", () => {
  it("knows a lease's ckey, for any scope, as its first example shows", () => {
    expect(Ckeys.isLease(Ckeys.lease(u1))).to.be.true
    expect(Ckeys.isLease(Ckeys.lease({ applabel: 'a:"b"', user_id: String.raw`\,[]`, vaultlabel: 'x' }))).to.be.true
  })

  it("refuses an earlier version's ckey, as its second example shows, another kind's, and anything that is not text", () => {
    expect(Ckeys.isLease('unlock^acme^u1^main')).to.be.false
    expect(Ckeys.isLease('["unlock","acme","u1","main"]')).to.be.false
    expect(Ckeys.isLease('lease:acme:u1:main')).to.be.false
    expect(Ckeys.isLease(Ckeys.vaultProps(u1))).to.be.false
    expect(Ckeys.isLease('leased^acme^u1^main')).to.be.false
    expect(Ckeys.isLease(['unlock', 'acme', 'u1', 'main'])).to.be.false
  })
})

describe("Ckeys.isDeviceRecord", () => {
  it("knows a device record's ckey, for any scope, as its first example shows", () => {
    expect(Ckeys.isDeviceRecord(Ckeys.deviceRecord(u1))).to.be.true
  })

  it("refuses an earlier version's device mark", () => {
    expect(Ckeys.isDeviceRecord('mark^acme^u1^main')).to.be.false
  })

  it("refuses a lease's ckey, as its second example shows, another kind's, and anything that is not text", () => {
    expect(Ckeys.isDeviceRecord(Ckeys.lease(u1))).to.be.false
    expect(Ckeys.isDeviceRecord('devices^acme^u1^main')).to.be.false
    expect(Ckeys.isDeviceRecord(['device', 'acme', 'u1', 'main'])).to.be.false
  })
})

describe("Ckeys, between kinds", () => {
  it("never takes vault props or a lease for a box, nor one kind's ckey for another's", () => {
    const isBox = Ckeys.isBoxIn(u1)
    expect(isBox(Ckeys.vaultProps(u1))).to.be.false
    expect(isBox(Ckeys.lease(u1))).to.be.false
    expect(isBox(Ckeys.deviceRecord(u1))).to.be.false
    expect(new Set([Ckeys.vaultProps(u1), Ckeys.lease(u1), Ckeys.deviceRecord(u1), Ckeys.box(u1, 'main')]).size).to.eq(4)
  })
})
