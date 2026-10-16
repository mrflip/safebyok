import { describe, expect, it } from 'vitest'
import * as Ckeys from '../src/ckeys'
import type { VaultScope } from '../src/types'
import { memoryStore } from '../src/string-store'
import * as TH from './test-helpers'

const u1 = TH.scopeOf('u1')
const caret = Ckeys.joiner()

describe("Ckeys.joiner, the ckey of each row", () => {
  it("files a bundle under its kind and scope, joined on ^", () => {
    expect(caret.bundle(u1)).to.eq('vault^acme^u1^main')
  })

  it("files a lockbox under its kind, scope and boxlabel, joined on ^", () => {
    expect(caret.box(u1, 'anthropic')).to.eq('box^acme^u1^main^anthropic')
  })

  it("files a remembered unlock under its kind and scope, joined on ^", () => {
    expect(caret.unlock(u1)).to.eq('unlock^acme^u1^main')
  })

  it("files a device mark under its kind and scope, joined on ^", () => {
    expect(caret.mark(u1)).to.eq('mark^acme^u1^main')
  })

  it("begins every lockbox ckey of a scope with its box prefix: the first four parts and a trailing ^", () => {
    expect(caret.boxPrefix(u1)).to.eq('box^acme^u1^main^')
    expect(caret.box(u1, 'anthropic').startsWith(caret.boxPrefix(u1))).to.be.true
  })

  it("picks a scope's lockbox ckeys out of a store, and nothing else", () => {
    const store = memoryStore()
    const others = [caret.bundle(u1), caret.unlock(u1), caret.box(TH.scopeOf('u2'), 'anthropic'), caret.box(TH.scopeOf('u12'), 'anthropic'), '["box","acme","u1","main","legacy"]']
    for (const ckey of [...others, caret.box(u1, 'anthropic'), caret.box(u1, 'openai')]) {
      store.write(ckey, '{}')
    }
    expect(store.ckeys().filter(caret.isBoxIn(u1))).to.have.members([caret.box(u1, 'anthropic'), caret.box(u1, 'openai')])
  })

  it("passes over a ckey that is not text, as IndexedDB may hold", () => {
    const isBox = caret.isBoxIn(u1)
    expect(isBox(42)).to.be.false
    expect(isBox(undefined)).to.be.false
    expect(isBox(['box', 'acme', 'u1', 'main', 'anthropic'])).to.be.false
  })

  it("splits back into the names it joins, whatever text they hold but the delimiter", () => {
    const scope = { applabel: 'a:"b"', user_id: String.raw`\,[]`, vaultlabel: 'עברית ไทย' }
    expect(caret.box(scope, 'x/y').split('^')).to.deep.equal(['box', 'a:"b"', String.raw`\,[]`, 'עברית ไทย', 'x/y'])
  })

  it("is frozen, and says its delimiter", () => {
    expect(Object.isFrozen(caret)).to.be.true
    expect(caret.delimiter).to.eq('^')
    expect(Ckeys.DefaultDelimiter).to.eq('^')
  })
})

const HoldingCaret = [
  [{ ...u1, applabel: 'ac^me' },   'anthropic',  'applabel'],
  [{ ...u1, user_id: 'u1^x' },     'anthropic',  'user_id'],
  [{ ...u1, vaultlabel: '^main' }, 'anthropic',  'vaultlabel'],
  [u1,                             'anthro^pic', 'boxlabel'],
] as const

describe("Ckeys.joiner, refusing a name that holds its delimiter", () => {
  for (const [scope, boxlabel, part] of HoldingCaret) {
    it(`refuses a ${part} holding ^ as bad_label, naming the part and quoting none of it`, () => {
      const refusal = TH.expectSyncRefusal(() => caret.box(scope, boxlabel), 'bad_label')
      expect(TH.thrownText(refusal)).to.include(part)
      expect(TH.thrownText(refusal)).to.not.include('anthro^pic')
      expect(TH.thrownText(refusal)).to.not.include('u1^x')
    })
  }

  it("refuses a scope holding ^ in every ckey it makes: bundle, unlock, mark and prefix", () => {
    const scope = { ...u1, user_id: 'u1^x' }
    for (const make of [caret.bundle, caret.unlock, caret.mark, caret.boxPrefix]) {
      TH.expectSyncRefusal(() => make(scope), 'bad_label')
    }
  })

  it("refuses as its last example shows", () => {
    TH.expectSyncRefusal(() => caret.box({ ...u1, user_id: 'a^b' }, 'x'), 'bad_label')
  })
})

describe("Ckeys.joiner, on a delimiter of the host's", () => {
  const slash = Ckeys.joiner('/')

  it("joins on it, as its example shows, and round-trips a boxlabel through its ckey", () => {
    expect(slash.bundle(u1)).to.eq('vault/acme/u1/main')
    expect(slash.box(u1, 'anthropic')).to.eq('box/acme/u1/main/anthropic')
    expect(slash.boxlabelOf(slash.box(u1, 'anthro^pic'))).to.eq('anthro^pic')
    expect(slash.isBoxIn(u1)(slash.box(u1, 'x'))).to.be.true
    expect(slash.isUnlock(slash.unlock(u1))).to.be.true
    expect(slash.isMark(slash.mark(u1))).to.be.true
  })

  it("refuses its own delimiter in a name, and lets ^ pass", () => {
    TH.expectSyncRefusal(() => slash.box(u1, 'a/b'), 'bad_label')
    expect(slash.bundle({ ...u1, user_id: 'u1^x' })).to.eq('vault/acme/u1^x/main')
  })

  it("takes NUL, which the floor keeps out of every name, for names of any other text", () => {
    const nul = Ckeys.joiner('\0')
    expect(nul.boxlabelOf(nul.box(u1, 'a^b/c'))).to.eq('a^b/c')
  })

  const BadDelimiters = [
    ["",      'nothing'],
    ["^^",    'two characters'],
    [42,      'a number'],
    [null,    'null'],
  ] as const

  for (const [delimiter, blurb] of BadDelimiters) {
    it(`refuses ${blurb} for a delimiter as bad_option`, () => {
      TH.expectSyncRefusal(() => Ckeys.joiner(delimiter as unknown as string), 'bad_option')
    })
  }
})

/** A scope from a tuple, for the tables below. */
const scopeFrom = ([applabel = '', userId = '', vaultlabel = '']: readonly string[]): VaultScope => ({ applabel, user_id: userId, vaultlabel })

/**
 * Pairs of addresses -- applabel, user_id, vaultlabel, boxlabel -- that a join on a separator
 * other than ^ would confuse. Each must get two different ckeys, and neither's scope may list the
 * other's lockbox.
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

describe("Ckeys.joiner, between near twins", () => {
  for (const [one, two, blurb] of NearTwins) {
    it(`never confuses ${blurb}`, () => {
      const [oneScope, twoScope] = [scopeFrom(one), scopeFrom(two)]
      const [oneBox, twoBox] = [caret.box(oneScope, one[3]), caret.box(twoScope, two[3])]
      expect(oneBox).to.not.eq(twoBox)
      expect(caret.isBoxIn(oneScope)(twoBox)).to.be.false
      expect(caret.isBoxIn(twoScope)(oneBox)).to.be.false
    })
  }
})

describe("Ckeys.joiner, over every split of one awkward string", () => {
  // Every way to cut this string into applabel, user_id, vaultlabel and boxlabel: 220 addresses
  // made of the same characters in the same order, which a join on any of them would confuse.
  const awkward = String.raw`a:"b\/[c]`
  const cuts = Array.from({ length: awkward.length + 1 }, (_unused, ii) => ii)
  const addresses = cuts.flatMap((one) => cuts.flatMap((two) => cuts.flatMap((three) => (
    one <= two && two <= three ? [[awkward.slice(0, one), awkward.slice(one, two), awkward.slice(two, three), awkward.slice(three)]] : []
  ))))

  it("gives each a ckey of its own", () => {
    const boxCkeys = new Set(addresses.map((address) => caret.box(scopeFrom(address), address[3] ?? '')))
    expect(addresses).to.have.lengthOf(220)
    expect(boxCkeys.size).to.eq(addresses.length)
  })

  it("lists each scope's lockboxes alone", () => {
    const leaks = addresses.map((address) => scopeFrom(address)).flatMap((scope) => {
      const isBox = caret.isBoxIn(scope)
      return addresses.filter((address) => {
        const owner = scopeFrom(address)
        const isOwn = owner.applabel === scope.applabel && owner.user_id === scope.user_id && owner.vaultlabel === scope.vaultlabel
        return ! isOwn && isBox(caret.box(owner, address[3] ?? ''))
      })
    })
    expect(leaks).to.have.lengthOf(0)
  })
})

describe("Ckeys.joiner's boxlabelOf", () => {
  it("reads the boxlabel back from a lockbox's ckey, whatever text it holds but the delimiter", () => {
    expect(caret.boxlabelOf(caret.box(u1, 'anthropic'))).to.eq('anthropic')
    expect(caret.boxlabelOf('box^acme^u1^main^anthropic')).to.eq('anthropic')
    expect(caret.boxlabelOf(caret.box(u1, 'OpenAI: "work", [1]'))).to.eq('OpenAI: "work", [1]')
  })

  const Unreachable = [
    ['box^acme^u1^main',                         'a ckey too short'],
    ['box^acme^u1^main^x^y',                     'a ckey too long'],
    ['unlock^acme^u1^main^x',                    'another kind'],
    ['["box","acme","u1","main","anthropic"]',   "an earlier version's ckey"],
  ] as const
  for (const [ckey, blurb] of Unreachable) {
    it(`gives null, never throwing, for ${blurb}`, () => {
      expect(caret.boxlabelOf(ckey)).to.be.null
    })
  }
})

describe("Ckeys.joiner's isUnlock", () => {
  it("knows an unlock's ckey, for any scope", () => {
    expect(caret.isUnlock(caret.unlock(u1))).to.be.true
    expect(caret.isUnlock(caret.unlock({ applabel: 'a:"b"', user_id: String.raw`\,[]`, vaultlabel: 'x' }))).to.be.true
  })

  it("refuses an earlier version's ckey, another kind's, and anything that is not text", () => {
    expect(caret.isUnlock('["unlock","acme","u1","main"]')).to.be.false
    expect(caret.isUnlock('unlock:acme:u1:main')).to.be.false
    expect(caret.isUnlock(caret.bundle(u1))).to.be.false
    expect(caret.isUnlock('unlocked^acme^u1^main')).to.be.false
    expect(caret.isUnlock(['unlock', 'acme', 'u1', 'main'])).to.be.false
  })
})

describe("Ckeys.joiner's isMark", () => {
  it("knows a mark's ckey, for any scope", () => {
    expect(caret.isMark(caret.mark(u1))).to.be.true
  })

  it("refuses an unlock's ckey, another kind's, and anything that is not text", () => {
    expect(caret.isMark(caret.unlock(u1))).to.be.false
    expect(caret.isMark('marked^acme^u1^main')).to.be.false
    expect(caret.isMark(['mark', 'acme', 'u1', 'main'])).to.be.false
  })
})

describe("Ckeys.joiner, between kinds", () => {
  it("never takes a bundle or an unlock for a lockbox, nor one kind's ckey for another's", () => {
    const isBox = caret.isBoxIn(u1)
    expect(isBox(caret.bundle(u1))).to.be.false
    expect(isBox(caret.unlock(u1))).to.be.false
    expect(isBox(caret.mark(u1))).to.be.false
    expect(new Set([caret.bundle(u1), caret.unlock(u1), caret.mark(u1), caret.box(u1, 'main')]).size).to.eq(4)
  })
})
