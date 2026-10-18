import { describe, expect, it } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import * as Names from '../src/names'
import { AnyTextValidators, DefaultValidators, Label, NameFloorBytes, UserId } from '../src/validators'
import * as TH from './test-helpers'

/** A boxlabel check a 1Password-style host might pass: any text at all, up to 200 characters. */
const AnyBoxlabel = ZClassic.string().min(1).max(200)

describe("Names.checkValidators", () => {
  it("hands back the bag it was handed, as its first example shows", () => {
    const validators = { boxlabel: ZClassic.string().max(200) }
    expect(Names.checkValidators(validators)).to.eq(validators)
    expect(Names.checkValidators(undefined)).to.be.undefined
    expect(Names.checkValidators({ boxlabel: undefined, userId: Z.string() })).to.have.property('userId')
    expect(Names.checkValidators(AnyTextValidators)).to.eq(AnyTextValidators)
    expect(Names.checkValidators({ wayinlabel: Z.string() })).to.have.property('wayinlabel')
  })

  it("refuses a misspelt field as 'bad_option', as its second example shows, rather than keep the default unseen", () => {
    const err = TH.expectSyncRefusal(() => Names.checkValidators({ boxLabel: ZClassic.string() } as never), 'bad_option')
    expect(err.message).to.include('spelling')
  })

  it("refuses a note check, as there is no note: a lockbox's sidecar is the host's to check", () => {
    TH.expectSyncRefusal(() => Names.checkValidators({ note: ZClassic.string() } as never), 'bad_option')
  })

  it("refuses a bag of anything but schemas, or no bag at all, as 'bad_option'", () => {
    const misfits = ['acme', 42, null, { boxlabel: 'Label' }, { boxlabel: /^[a-z]+$/ }, { userID: ZClassic.string() }]
    for (const misfit of misfits) {
      expect(TH.expectSyncRefusal(() => Names.checkValidators(misfit as never), 'bad_option').message).to.include('validators')
    }
  })
})

describe("Names.rulesOf", () => {
  it("keeps ours for every field a host leaves out", () => {
    expect(Names.rulesOf()).to.deep.equal(DefaultValidators)
    expect(Names.rulesOf({})).to.deep.equal(DefaultValidators)
  })

  it("replaces ours outright with each field a host gives, and only that field", () => {
    const rules = Names.rulesOf({ boxlabel: AnyBoxlabel })
    expect(rules.boxlabel).to.eq(AnyBoxlabel)
    expect(rules.applabel).to.eq(Label)
    expect(rules.userId).to.eq(UserId)
    expect(rules.wayinlabel).to.eq(Label)
    expect(Names.rulesOf({ wayinlabel: AnyBoxlabel }).wayinlabel).to.eq(AnyBoxlabel)
  })

  it("refuses a misspelt field, as checkValidators does", () => {
    expect(TH.expectSyncRefusal(() => Names.rulesOf({ boxLabel: ZClassic.string() } as never), 'bad_option').message).to.include('spelling')
  })

  it("keeps ours for a field given as undefined, as the example shows", () => {
    expect(Names.rulesOf({ boxlabel: undefined }).boxlabel).to.eq(Label)
    expect(Names.rulesOf({ boxlabel: Z.string() }).applabel).to.eq(Label)
  })
})

describe("Names.check, against a host's check", () => {
  const rules = Names.rulesOf({ boxlabel: AnyBoxlabel })

  it("passes what the field's check passes: ours, or the host's", () => {
    expect(Names.check(rules, 'applabel', 'acme')).to.eq('acme')
    TH.expectSyncRefusal(() => Names.check(rules, 'applabel', 'Acme Corp'), 'bad_label')
    expect(Names.check(rules, 'boxlabel', 'Acme Corp: מפתח API')).to.eq('Acme Corp: מפתח API')
  })

  it("refuses anything that is not text, whatever the check would make of it", () => {
    const coercing = Names.rulesOf({ boxlabel: ZClassic.coerce.string() })
    TH.expectSyncRefusal(() => Names.check(coercing, 'boxlabel', 42), 'bad_label')
    TH.expectSyncRefusal(() => Names.check(coercing, 'boxlabel', null), 'bad_label')
  })

  it("refuses an async check as misuse, rather than answering for it", () => {
    const asyncRules = Names.rulesOf({ boxlabel: ZClassic.string().refine(async () => { await TH.wakeupAtNextTick(); return true }) })
    const err = TH.expectSyncRefusal(() => Names.check(asyncRules, 'boxlabel', 'anthropic'), 'bad_option')
    expect(err.message).to.include('boxlabel')
  })

  it("refuses a check that throws as misuse, carrying nothing of what it threw, which may quote the candidate", () => {
    const quotingThrow = Names.rulesOf({ boxlabel: ZClassic.string().refine((boxlabel) => { throw new Error(`no boxlabel like ${boxlabel}`) }) })
    const err = TH.expectSyncRefusal(() => Names.check(quotingThrow, 'boxlabel', 'sk-ant-fake-pasted-by-mistake'), 'bad_option')
    expect(err.message).to.include('boxlabel')
    expect(err.cause).to.be.undefined
    expect(Object.getOwnPropertyNames(err)).to.have.members(['stack', 'message', 'name', 'kind'])
    expect(TH.thrownText(err)).to.not.include('sk-ant-fake')
    expect(TH.leafTexts(err).join(' ')).to.not.include('sk-ant-fake')
  })
})

describe("Names.check", () => {
  it("hands back exactly what it was handed, never what the check made of it", () => {
    const trimming = Names.rulesOf({ boxlabel: ZClassic.string().trim().min(1) })
    expect(Names.check(trimming, 'boxlabel', '  padded  ')).to.eq('  padded  ')
    const lowering = Names.rulesOf({ userId: ZClassic.string().toLowerCase() })
    expect(Names.check(lowering, 'userId', 'User_2FJ8')).to.eq('User_2FJ8')
  })

  it("refuses a name as bad_label, naming the field and never the candidate", () => {
    const rules = Names.rulesOf()
    const labelErr = TH.expectSyncRefusal(() => Names.check(rules, 'boxlabel', 'Not A Label sk-fake'), 'bad_label')
    expect(labelErr.message).to.include('boxlabel')
    expect(labelErr.message).to.not.include('sk-fake')
  })

  it("says what one of our own checks found wrong, quoting nothing", () => {
    const rules = Names.rulesOf()
    const cases = [
      ['boxlabel', 'sk-fake-UPPER',            'lowercase words'],
      ['boxlabel', `sk-fake${'x'.repeat(40)}`, 'at most forty characters'],
      ['userId',   'sk-fake user',             'ASCII letters, digits'],
    ] as const
    for (const [field, candidate, said] of cases) {
      const err = TH.expectSyncRefusal(() => Names.check(rules, field, candidate), 'bad_label')
      expect(err.message).to.include(`vault's ${field} check`)
      expect(err.message).to.include(said)
      expect(err.message).to.not.include('sk-fake')
    }
  })

  it("holds every name to the floor first, saying what it found wrong and quoting nothing", () => {
    const rules = Names.rulesOf()
    const cases = [
      ['userId',   '',                         "can't be empty"],
      ['userId',   'sk-fake\u{D800}',          'lone surrogate'],
      ['boxlabel', 'sk-fak\u{E9}'.normalize('NFD'), 'NFC'],
      ['wayinlabel', 'sk-fake\u{7}',           'no control characters'],
      ['vaultlabel', 'sk-fake\u{DD11}',        'well-formed Unicode'],
    ] as const
    for (const [field, candidate, said] of cases) {
      const err = TH.expectSyncRefusal(() => Names.check(rules, field, candidate), 'bad_label')
      expect(err.message).to.include(`That ${field} is not text any vault can hold`)
      expect(err.message).to.include(said)
      expect(err.message).to.not.include('sk-fak')
    }
    const anyText = Names.rulesOf(AnyTextValidators)
    expect(TH.expectSyncRefusal(() => Names.check(anyText, 'boxlabel', 'key \u{D83D}'), 'bad_label').message).to.include('lone surrogate')
  })

  it("holds a name to the floor beneath a host's own check, however much that check admits", () => {
    const rules = Names.rulesOf({ boxlabel: ZClassic.string(), userId: Z.string() })
    TH.expectSyncRefusal(() => Names.check(rules, 'boxlabel', 'key \u{D83D}'), 'bad_label')
    TH.expectSyncRefusal(() => Names.check(rules, 'userId', 'tab\there'), 'bad_label')
    TH.expectSyncRefusal(() => Names.check(rules, 'boxlabel', 'n'.repeat(NameFloorBytes + 1)), 'bad_label')
    expect(Names.check(rules, 'boxlabel', 'Any Text: מפתח')).to.eq('Any Text: מפתח')
  })

  it("runs the host's check once, and only on text above the floor", () => {
    let asked = 0
    const counting = ZClassic.string().refine(() => {
      asked += 1
      return true
    })
    const rules = Names.rulesOf({ boxlabel: counting })
    Names.check(rules, 'boxlabel', 'anthropic')
    expect(asked).to.eq(1)
    TH.expectSyncRefusal(() => Names.check(rules, 'boxlabel', 'tab\there'), 'bad_label')
    expect(asked).to.eq(1)
  })

  it("names a host check that refuses, and that the check is the host's, saying nothing of why", () => {
    const rules = Names.rulesOf({ boxlabel: ZClassic.string().max(5, 'too long for our forms') })
    const err = TH.expectSyncRefusal(() => Names.check(rules, 'boxlabel', 'sk-fake-long'), 'bad_label')
    expect(err.message).to.include("boxlabel check passed in openVault's validators")
    expect(err.message).to.not.include('too long for our forms')
  })

  it("refuses a candidate that is not text, saying so", () => {
    expect(TH.expectSyncRefusal(() => Names.check(Names.rulesOf(), 'boxlabel', undefined), 'bad_label').message).to.include('not text')
  })

  it("never quotes a host check's own issues, which may quote the candidate", () => {
    const quoting = Names.rulesOf({ userId: ZClassic.string().refine(() => false, { error: (issue) => `refused ${String(issue.input)}` }) })
    const err = TH.expectSyncRefusal(() => Names.check(quoting, 'userId', 'alice@example.com'), 'bad_label')
    expect(TH.thrownText(err)).to.not.include('alice')
  })
})

describe("Names.checkScope", () => {
  it("passes a scope whose names pass their checks, as handed in", () => {
    const scope = { applabel: 'Acme', user_id: 'user|2fJ8:google', vaultlabel: 'Главный' }
    const rules = Names.rulesOf({ applabel: ZClassic.string(), vaultlabel: ZClassic.string() })
    expect(Names.checkScope(rules, scope)).to.deep.equal(scope)
  })

  it("hands back a frozen copy, which no one it is handed to can change, leaving the scope handed in as it was", () => {
    const scope = { ...TH.scopeOf('u1') }
    const checked = Names.checkScope(Names.rulesOf(), scope)
    expect(Object.isFrozen(checked)).to.be.true
    expect(checked).to.not.eq(scope)
    expect(Object.isFrozen(scope)).to.be.false
  })

  it("refuses, as bad_label, a scope with a name its check refuses, or one that is not text", () => {
    const rules = Names.rulesOf()
    expect(TH.expectSyncRefusal(() => Names.checkScope(rules, { ...TH.scopeOf('u1'), applabel: 'Acme' }), 'bad_label').message).to.include('applabel')
    expect(TH.expectSyncRefusal(() => Names.checkScope(rules, TH.scopeOf('')), 'bad_label').message).to.include('userId')
    expect(TH.expectSyncRefusal(() => Names.checkScope(rules, TH.scopeOf('alice smith')), 'bad_label').message).to.include('userId')
    expect(TH.expectSyncRefusal(() => Names.checkScope(rules, { ...TH.scopeOf('u1'), vaultlabel: 42 }), 'bad_label').message).to.include('vault scope')
    expect(TH.expectSyncRefusal(() => Names.checkScope(rules, null), 'bad_label').message).to.include('vault scope')
  })
})

describe("Names.checkFloor", () => {
  it("hands back a name above the floor as it is, whatever any check would say of it", () => {
    expect(Names.checkFloor('boxlabel', 'Not A Label')).to.eq('Not A Label')
    expect(Names.checkFloor('vaultlabel', 'n'.repeat(1000))).to.have.lengthOf(1000)
  })

  it("refuses a name below the floor as bad_label, quoting none of it", () => {
    expect(TH.expectSyncRefusal(() => Names.checkFloor('boxlabel', 'sk-fake\u{7}'), 'bad_label').message).to.not.include('sk-fake')
    expect(TH.expectSyncRefusal(() => Names.checkFloor('applabel', 42), 'bad_label').message).to.include('not text')
    TH.expectSyncRefusal(() => Names.checkFloor('vaultlabel', 'two\nlines'), 'bad_label')
  })
})

describe("Names.sameScope", () => {
  it("is true for a record naming the same app, user and vault, whatever else it holds", () => {
    expect(Names.sameScope(TH.vaultPropsOf('u1'), TH.scopeOf('u1'))).to.be.true
  })

  it("is false when any one of the three differs", () => {
    expect(Names.sameScope(TH.scopeOf('u2'), TH.scopeOf('u1'))).to.be.false
    expect(Names.sameScope(TH.scopeOf('u1', 'spare'), TH.scopeOf('u1'))).to.be.false
    expect(Names.sameScope({ ...TH.scopeOf('u1'), applabel: 'other' }, TH.scopeOf('u1'))).to.be.false
  })
})
