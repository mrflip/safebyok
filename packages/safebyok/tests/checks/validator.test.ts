import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import * as Zod from 'zod'
import * as PX from '../../src/shapes/primitives'
import { Checker, Checkers, type ConsistencyRefusal, Kit, type Story, consistent, demandConsistent, objCheck, verifyConsistent } from '../../src/checks/validator'
import { type RefusalKind, VaultError } from '../../src/errors'
import * as TH from '../test-helpers'

// A module of validators, as a star import would hand one in `sources`: made in a call of its own
// kind, to show a validator nested in another refuses with the outer one's.
const GateChecks = Checkers('bad_option', ({ obj, str, uint }) => {
  const passphraseWayinRecord = obj({ salt_b64: str.min(1), memory_kib: uint }).strict()
  const gateRecord            = obj({ passphrase: passphraseWayinRecord }).strict()
  return { passphraseWayinRecord, gateRecord }
})

const { bankScope, vaultScope } = Checkers('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => {
  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  return { bankScope, vaultScope }
})

const { boxRecord, boxSparse } = Checkers('bad_record', ({ obj, str, uint, applabel, user_id, vaultlabel, boxlabel }) => {
  const boxRecord = obj({ applabel, user_id, vaultlabel, boxlabel, written_at: uint, whisper_ciphered: str }).strict()
  const boxSparse = boxRecord.omit({ whisper_ciphered: true })
  return { boxRecord, boxSparse }
})

const { vaultRecord } = Checkers('bad_record', ({ obj, uint, applabel, user_id, vaultlabel, gateRecord }) => {
  const vaultRecord = obj({ applabel, user_id, vaultlabel, gate_epoch: uint, gate: gateRecord.nullable() }).strict()
  return { vaultRecord }
}, [GateChecks])

const scope = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
/** An objCheck builder: a bank scope's fields. */
const bankScopeOf = ({ applabel, user_id }: typeof Kit) => ({ applabel, user_id })
const sparse = { ...scope, boxlabel: 'openai', written_at: 1 }
const gate = { passphrase: { salt_b64: 'c2FsdA', memory_kib: 19_456 } }

describe("Checkers", () => {
  afterEach(() => { Zod.config({ customError: undefined }) })

  it("refuses a scope with a bad name as its call's kind, naming the field, as its first example shows", () => {
    const err = TH.expectSyncRefusal(() => vaultScope.parse({ ...scope, vaultlabel: 'Main' }), 'bad_scope')
    expect(err.message).to.match(/^vaultlabel: A label is lowercase words/)
    expect(err.meta?.fieldnames).to.deep.equal(['vaultlabel'])
  })

  it("hands back what passes, the rest of a bag left out, as Zod's object does", () => {
    expect(vaultScope.parse({ ...scope, vault_tok: 'tok', lock: () => null })).to.deep.equal(scope)
  })

  it("refuses an unknown field in a slice made in the call, as its second example shows", () => {
    expect(boxSparse.parse(sparse)).to.deep.equal(sparse)
    const err = TH.expectSyncRefusal(() => boxSparse.parse({ ...sparse, note: 'hi' }), 'bad_record')
    expect(err.message).to.eq("There is a field it does not take (its name is not repeated): it takes only applabel, user_id, vaultlabel, boxlabel, written_at. Check the spelling, or leave it out")
    TH.expectSyncRefusal(() => boxRecord.parse(sparse), 'bad_record')
  })

  it("spreads a module of validators into the kit, and a nested one refuses with the outer call's kind, as its third example shows", () => {
    expect(vaultRecord.parse({ ...scope, gate_epoch: 1, gate })).to.deep.equal({ ...scope, gate_epoch: 1, gate })
    expect(vaultRecord.parse({ ...scope, gate_epoch: 0, gate: null }).gate).to.be.null
    const err = TH.expectSyncRefusal(() => vaultRecord.parse({ ...scope, gate_epoch: 1, gate: { passphrase: { ...gate.passphrase, memory_kib: -1 } } }), 'bad_record')
    expect(err.message).to.match(/^gate\.passphrase\.memory_kib: Too small/)
    expect(err.meta?.fieldnames).to.deep.equal(['gate.passphrase.memory_kib'])
  })

  it("repeats the keys of a schema keyed by its input in the refusal, as its doc warns", () => {
    const { tagged } = Checkers('bad_option', ({ label }) => ({ tagged: Zod.record(Zod.string(), label) }))
    const err = TH.expectSyncRefusal(() => tagged.parse({ host_chosen_key: 'Not A Label' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['host_chosen_key'])
  })

  it("refuses a module's own validator with its own call's kind", () => {
    TH.expectSyncRefusal(() => GateChecks.gateRecord.parse({ passphrase: { salt_b64: '', memory_kib: 1 } }), 'bad_option')
  })

  it("names every failing field, each with its check's sentence, in the message and meta.fieldnames", () => {
    const err = TH.expectSyncRefusal(() => boxRecord.parse({ applabel: 'Acme', user_id: 'a/b', vaultlabel: 'main', boxlabel: 'x', written_at: -1, whisper_ciphered: 'c' }), 'bad_record')
    expect(err.message.split('; ').map((sentence) => sentence.split(':', 1)[0])).to.deep.equal(['applabel', 'user_id', 'boxlabel', 'written_at'])
    expect(err.meta?.fieldnames).to.deep.equal(['applabel', 'user_id', 'boxlabel', 'written_at'])
    expect(Object.isFrozen(err.meta?.fieldnames)).to.be.true
  })

  it("names eight failures at most, counting the rest", () => {
    const { tenFields } = Checkers('bad_option', ({ obj, label }) => ({
      tenFields: obj(Object.fromEntries(Array.from({ length: 10 }, (_field, ii) => [`field${String(ii)}`, label]))),
    }))
    const err = TH.expectSyncRefusal(() => tenFields.parse({}), 'bad_option')
    expect(err.message.split('; ')).to.have.lengthOf(9)
    expect(err.message).to.match(/; and 2 more failures$/)
    expect(err.meta?.fieldnames).to.have.lengthOf(8)
    const nine = TH.expectSyncRefusal(() => tenFields.parse({ field0: 'ok' }), 'bad_option')
    expect(nine.message).to.match(/; and 1 more failure$/)
    expect(nine.message).to.not.include('failure;')
  })

  it("says Zod's own sentence for an input that fails as a whole, and lists no fieldname", () => {
    const err = TH.expectSyncRefusal(() => vaultScope.parse('acme^u1^main'), 'bad_scope')
    expect(err.message).to.eq("Invalid input: expected object, received string")
    expect(err.meta?.fieldnames).to.deep.equal([])
  })

  it("quotes no value it refuses, counts the fields it does not take, never naming one, and lists the fields it takes", () => {
    const secret = 'sk-live-0xSECRET'
    const err = TH.expectSyncRefusal(() => boxRecord.parse({ ...sparse, applabel: secret, user_id: `${secret} `, written_at: secret, whisper_ciphered: 7, vault_key: secret, [secret]: 1, 'sk live': 2 }), 'bad_record')
    expect(err.message).to.not.include('SECRET')
    expect(err.message).to.not.include('sk live')
    expect(err.message).to.not.include('vault_key')
    expect(err.message).to.include("There are 3 fields it does not take (their names are not repeated): it takes only applabel, user_id, vaultlabel, boxlabel, written_at, whisper_ciphered.")
    expect(JSON.stringify(err.meta)).to.not.include('SECRET')
    expect(err.cause).to.be.undefined
  })

  it("names an unknown field's place by its path, never its name, and says when an object takes no fields", () => {
    const { strictBag, holder } = Checkers('bad_option', ({ obj }) => {
      const strictBag = obj({}).strict()
      return { strictBag, holder: obj({ inner: strictBag }) }
    })
    expect(TH.expectSyncRefusal(() => strictBag.parse({ salt_b64: 1 }), 'bad_option').message).to.eq("There is a field it does not take (its name is not repeated): it takes no fields. Check the spelling, or leave it out")
    const nested = TH.expectSyncRefusal(() => holder.parse({ inner: { staleMinute: 1, [`ghp_${'aB3'.repeat(12)}`]: 2 } }), 'bad_option')
    expect(nested.message).to.match(/^inner: There are 2 fields it does not take/)
    expect(nested.message).to.not.include('staleMinute')
    expect(nested.meta?.fieldnames).to.deep.equal(['inner'])
  })

  it("gives no record maker in its kit, as a record's keys in a refusal's path would be the input's", () => {
    expect(Object.keys(Kit)).to.not.include('rec')
  })

  it("says Zod's English, never what a host's z.config error map would say, which could quote the input", () => {
    Zod.config({ customError: (issue) => `you sent ${String(issue.input)}` })
    const err = TH.expectSyncRefusal(() => boxRecord.parse({ ...sparse, written_at: 'sk-live-0xSECRET', whisper_ciphered: 'c' }), 'bad_record')
    expect(err.message).to.eq("written_at: Invalid input: expected number, received string")
  })

  it("leaves safeParse and parseAsync Zod's own", async () => {
    const checked = vaultScope.safeParse({ ...scope, vaultlabel: 'Main' })
    expect(checked.success).to.be.false
    expect(checked.error).to.be.instanceOf(Zod.ZodError)
    await expect(vaultScope.parseAsync({ ...scope, vaultlabel: 'Main' })).rejects.toThrow(Zod.ZodError)
  })

  it("renders to JSON Schema as the schema it was made from, a pipe and a recursion through a lazy included", () => {
    const build = ({ lazy, union, arr, str, num, obj }: typeof Kit) => {
      const tree: Zod.ZodType = lazy(() => union([num, arr(tree)]))
      return { piped: str.transform((text) => text.length).pipe(num), tree, holder: obj({ tree }).strict() }
    }
    const made = Checkers('bad_record', build)
    const plain = build(Kit)
    for (const valname of ['piped', 'holder'] as const) {
      expect(Zod.toJSONSchema(made[valname], { unrepresentable: 'any' })).to.deep.equal(Zod.toJSONSchema(plain[valname], { unrepresentable: 'any' }))
    }
    // A recursive validator at the root refers to itself through a definition, where Zod's own says '#'.
    const { $schema: _schema, ...plainTree } = Zod.toJSONSchema(plain.tree, { unrepresentable: 'any' })
    const madeTree = Zod.toJSONSchema(made.tree, { unrepresentable: 'any' })
    expect(madeTree.$ref).to.eq('#/$defs/__schema0')
    expect(JSON.stringify(madeTree.$defs?.['__schema0'])).to.eq(JSON.stringify(plainTree).replaceAll('"#"', '"#/$defs/__schema0"'))
  })

  it("makes each slice made in the call refuse: pick, omit, extend, partial, strict, strip and readonly", () => {
    const slices = Checkers('bad_record', ({ obj, int, applabel, user_id, vaultlabel }) => {
      const record = obj({ applabel, user_id, vaultlabel, gate_epoch: int }).strict()
      return {
        record,
        picked:   record.pick({ applabel: true, user_id: true, vaultlabel: true }).strip(),
        omitted:  record.omit({ gate_epoch: true }),
        extended: record.extend({ vault_epoch: int }),
        partial:  record.partial(),
        frozen:   record.pick({ applabel: true, user_id: true, vaultlabel: true }).strip().readonly(),
      }
    })
    expect(slices.picked.parse({ ...scope, gate_epoch: 'any', extra: 1 })).to.deep.equal(scope)
    TH.expectSyncRefusal(() => slices.picked.parse({ ...scope, user_id: '' }), 'bad_record')
    TH.expectSyncRefusal(() => slices.omitted.parse({ ...scope, gate_epoch: 1 }), 'bad_record')
    TH.expectSyncRefusal(() => slices.extended.parse({ ...scope, gate_epoch: 1 }), 'bad_record')
    TH.expectSyncRefusal(() => slices.partial.parse({ applabel: 'Acme' }), 'bad_record')
    expect(Object.isFrozen(slices.frozen.parse(scope))).to.be.true
    TH.expectSyncRefusal(() => slices.frozen.parse({ ...scope, vaultlabel: '' }), 'bad_record')
  })

  it("leaves a slice made from a validator outside a call plain Zod, its parse throwing a ZodError", () => {
    const outside = [bankScope.extend({ vaultlabel: Kit.vaultlabel }), boxRecord.pick({ applabel: true }), boxRecord.omit({ written_at: true }), vaultScope.strict(), vaultScope.optional()]
    for (const slice of outside) {
      expect(() => slice.parse({ applabel: 'Acme' })).to.throw(Zod.ZodError)
    }
  })

  it("lets a name the kit gives win over a module's, and a later module's over an earlier one's", () => {
    const { checked } = Checkers('bad_option', ({ uint, extra }) => ({ checked: Zod.object({ count: uint, extra }) }), [{ uint: Zod.string(), extra: Zod.number() }, { extra: Zod.boolean() }])
    expect(checked.parse({ count: 3, extra: true })).to.deep.equal({ count: 3, extra: true })
    TH.expectSyncRefusal(() => checked.parse({ count: 'three', extra: true }), 'bad_option')
    TH.expectSyncRefusal(() => checked.parse({ count: 3, extra: 1 }), 'bad_option')
  })

  it("throws a VaultError, never a ZodError, from parse", () => {
    let caught: unknown = null
    try { vaultScope.parse(null) } catch (err) { caught = err }
    expect(caught).to.be.instanceOf(VaultError)
    expect(caught).to.not.be.instanceOf(Zod.ZodError)
  })

  it("frames a refusal as the story asks, where before the failures and advice after, each ending the failures in a period, as its first example shows", () => {
    const bad = { applabel: 'acme', user_id: 'u1', vaultlabel: 'Main' }
    const plain = TH.expectSyncRefusal(() => vaultScope.parse(bad), 'bad_scope')
    const where = TH.expectSyncRefusal(() => vaultScope.parse(bad, { where: 'In the bag naming the vault' }), 'bad_scope')
    const advice = TH.expectSyncRefusal(() => vaultScope.parse(bad, { advice: 'Name it by its vaultlabel.' }), 'bad_scope')
    const both = TH.expectSyncRefusal(() => vaultScope.parse(bad, { where: 'In the bag naming the vault', advice: 'Name it by its vaultlabel.' }), 'bad_scope')
    expect(plain.message).to.match(/^vaultlabel: A label is [^.]*$/)
    expect(where.message).to.eq(`In the bag naming the vault: ${plain.message}.`)
    expect(advice.message).to.eq(`${plain.message}. Name it by its vaultlabel.`)
    expect(both.message).to.eq(`In the bag naming the vault: ${plain.message}. Name it by its vaultlabel.`)
    for (const refusal of [plain, where, advice, both]) { expect(refusal.meta).to.deep.equal({ fieldnames: ['vaultlabel'] }) }
  })

  it("parses with a story as without one, and passes a story of nothing by, framing a failure as the failures alone", () => {
    expect(vaultScope.parse(scope, { where: 'In the scope' })).to.deep.equal(scope)
    expect(vaultScope.parse(scope, {})).to.deep.equal(scope)
    const err = TH.expectSyncRefusal(() => vaultScope.parse(null, { where: undefined, advice: undefined }), 'bad_scope')
    expect(err.message).to.eq('Invalid input: expected object, received null')
  })

  it("refuses 'bad_option' for a story that is none, a Zod parse context among them, whatever the input", () => {
    TH.expectSyncRefusal(() => vaultScope.parse(scope, { error: () => 'quoted' } as object), 'bad_option')
    TH.expectSyncRefusal(() => vaultScope.parse(null, { where: 7 } as object), 'bad_option')
  })

  it("parses and then holds the result to another bag with parseConsistent, refusing its call's kind, as its first example shows", () => {
    expect(boxSparse.parseConsistent(sparse, { ...scope, written_at: undefined, gate_epoch: 4 })).to.deep.equal(sparse)
    const err = TH.expectSyncRefusal(() => boxSparse.parseConsistent(sparse, { ...scope, user_id: 'u2' }), 'bad_record')
    expect(err.meta).to.deep.equal({ fieldnames: ['user_id'] })
    TH.expectSyncRefusal(() => vaultScope.parseConsistent(scope, { user_id: 'u2' }), 'bad_scope')
    TH.expectSyncRefusal(() => boxSparse.parseConsistent({ ...sparse, written_at: -1 }, scope), 'bad_record')
  })

  it("refuses a disagreement as the refusal handed to parseConsistent says, and a failed parse as parse does", () => {
    const err = TH.expectSyncRefusal(() => boxSparse.parseConsistent(sparse, { user_id: 'u2' }, { kind: 'corrupt_record', message: 'Storage answered with another user' }), 'corrupt_record')
    expect(err.message).to.eq('Storage answered with another user')
    expect(err.meta).to.deep.equal({ fieldnames: ['user_id'] })
    TH.expectSyncRefusal(() => boxSparse.parseConsistent(sparse, { user_id: 'u2' }, { message: 'Another user' }), 'bad_record')
    TH.expectSyncRefusal(() => boxSparse.parseConsistent({ ...sparse, written_at: -1 }, scope, { kind: 'corrupt_record' }), 'bad_record')
  })

  it("gives parseConsistent only to a validator of an object, by its type", () => {
    const { checked } = Checkers('bad_option', ({ str }) => ({ checked: str }))
    expectTypeOf(boxSparse.parseConsistent).returns.toEqualTypeOf<Zod.output<typeof boxSparse>>()
    expectTypeOf(checked).not.toHaveProperty('parseConsistent')
  })

  it("types a Story as optional where and advice, and a ConsistencyRefusal as a kind and an optional message, each read off its shape", () => {
    expectTypeOf<Story>().toEqualTypeOf<{ where?: string | undefined, advice?: string | undefined }>()
    expectTypeOf<ConsistencyRefusal>().toEqualTypeOf<{ kind: RefusalKind, message?: string | ((fieldnames: readonly string[]) => string) | undefined }>()
  })
})

describe("Checker", () => {
  it("makes one validator, refusing 'bad_record' unless given a kind, as its first example shows", () => {
    const boxDamaged = Checker(({ obj, oneof, boxlabel, str }) => obj({ boxlabel, revision_tok: str.nullable(), damage: oneof(['damaged', 'newer_format']) }).strict())
    expect(boxDamaged.parse({ boxlabel: 'openai', revision_tok: null, damage: 'damaged' })).to.deep.equal({ boxlabel: 'openai', revision_tok: null, damage: 'damaged' })
    const err = TH.expectSyncRefusal(() => boxDamaged.parse({ boxlabel: 'openai', revision_tok: null, damage: 'lost' }), 'bad_record')
    expect(err.meta?.fieldnames).to.deep.equal(['damage'])
  })

  it("refuses the kind it is given, as its second example shows", () => {
    const callback = Checker(({ fn }) => fn(), 'bad_option')
    expect(callback.parse(Math.max)).to.eq(Math.max)
    TH.expectSyncRefusal(() => callback.parse('listener'), 'bad_option')
  })

  it("spreads a module of validators into the kit, a nested one refusing with the outer call's kind", () => {
    const holder = Checker(({ obj, gateRecord }) => obj({ gate: gateRecord }).strict(), 'bad_record', [GateChecks])
    expect(holder.parse({ gate })).to.deep.equal({ gate })
    TH.expectSyncRefusal(() => holder.parse({ gate: { passphrase: { ...gate.passphrase, memory_kib: -1 } } }), 'bad_record')
  })

  it("gives parseConsistent to a validator of an object, and refuses a disagreement as its kind", () => {
    const checkedScope = Checker(({ obj, applabel, user_id }) => obj({ applabel, user_id }), 'bad_scope')
    expectTypeOf(checkedScope.parseConsistent).returns.toEqualTypeOf<{ applabel: string, user_id: string }>()
    TH.expectSyncRefusal(() => checkedScope.parseConsistent(scope, { user_id: 'u2' }), 'bad_scope')
  })
})

describe("objCheck", () => {
  it("makes one strict validator of an object from its fields, refusing 'bad_record' unless given a kind, as its first example shows", () => {
    const checkedScope = objCheck(bankScopeOf)
    expect(checkedScope.parse({ applabel: 'acme', user_id: 'u1' })).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
    const err = TH.expectSyncRefusal(() => checkedScope.parse({ applabel: 'Acme', user_id: 'u1' }), 'bad_record')
    expect(err.meta?.fieldnames).to.deep.equal(['applabel'])
    const extra = TH.expectSyncRefusal(() => checkedScope.parse({ ...scope, vault_tok: 'tok' }), 'bad_record')
    expect(extra.message).to.eq("There are 2 fields it does not take (their names are not repeated): it takes only applabel, user_id. Check the spelling, or leave them out")
  })

  it("drops a field it does not take, unread, under extras 'strip', as its second example shows", () => {
    const checkedScope = objCheck(bankScopeOf, { refuse_as: 'bad_scope', extras: 'strip' })
    expect(checkedScope.parse({ ...scope, vault_tok: 'tok' })).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
    TH.expectSyncRefusal(() => checkedScope.parse({ applabel: 'Acme', user_id: 'u1' }), 'bad_scope')
    TH.expectSyncRefusal(() => objCheck(bankScopeOf, { extras: 'strip' }).parse({}), 'bad_record')
  })

  it("refuses the kind refuse_as names, still strict where extras is left out", () => {
    const checkedScope = objCheck(bankScopeOf, { refuse_as: 'bad_scope' })
    TH.expectSyncRefusal(() => checkedScope.parse({ ...scope }), 'bad_scope')
  })

  it("refuses 'bad_option' for opts that are none, whatever it would check", () => {
    for (const opts of ['bad_kind', { extras: 'loose' }, { refuse_as: 'bad_kind' }, { kind: 'bad_scope' }, null]) {
      TH.expectSyncRefusal(() => objCheck(bankScopeOf, opts as never), 'bad_option')
    }
  })

  it("takes a kind and a module of validators", () => {
    const holder = objCheck(({ gateRecord, uint }) => ({ gate: gateRecord, gate_epoch: uint }), 'bad_option', [GateChecks])
    expect(holder.parse({ gate, gate_epoch: 1 })).to.deep.equal({ gate, gate_epoch: 1 })
    TH.expectSyncRefusal(() => holder.parse({ gate, gate_epoch: -1 }), 'bad_option')
  })
})

describe("consistent", () => {
  it("is true for a record naming the same app, user and vault as a scope, whatever else it holds, as its first example shows", () => {
    expect(consistent(TH.vaultRecordOf('u1'), TH.scopeOf('u1'))).to.be.true
  })

  it("is false when any one field both define differs", () => {
    expect(consistent(TH.scopeOf('u2'), TH.scopeOf('u1'))).to.be.false
    expect(consistent(TH.scopeOf('u1', 'spare'), TH.scopeOf('u1'))).to.be.false
    expect(consistent({ ...TH.scopeOf('u1'), applabel: 'other' }, TH.scopeOf('u1'))).to.be.false
  })

  it("is true when no field is defined in both, as its second example shows", () => {
    expect(consistent({ user_id: 'u1', boxlabel: undefined }, { boxlabel: 'openai' })).to.be.true
  })

  it("refuses 'bad_option' for a bag that is not an object", () => {
    TH.expectSyncRefusal(() => consistent(null as unknown as object, scope), 'bad_option')
  })
})

describe("demandConsistent", () => {
  it("returns true, or refuses as its refusal says, as its examples show", () => {
    expect(demandConsistent(sparse, scope, { kind: 'damaged_vault' })).to.be.true
    const err = TH.expectSyncRefusal(() => demandConsistent({ user_id: 'u2' }, { user_id: 'u1' }, { kind: 'bad_scope', message: (fieldnames) => `This names another ${fieldnames.join(' and ')}` }), 'bad_scope')
    expect(err.message).to.eq('This names another user_id')
  })
})

describe("verifyConsistent", () => {
  it("returns the bag when each field both define is ===, as its first example shows", () => {
    const bag = { ...sparse }
    expect(verifyConsistent(bag, scope, { kind: 'vault_mismatch' })).to.eq(bag)
  })

  it("refuses the kind it is handed, naming each field that disagrees, in its message and meta.fieldnames, as its second example shows", () => {
    const err = TH.expectSyncRefusal(() => verifyConsistent({ ...scope, user_id: 'u2', vaultlabel: 'other' }, scope, { kind: 'bad_scope' }), 'bad_scope')
    expect(err.message).to.contain('user_id and vaultlabel')
    expect(err.meta).to.deep.equal({ fieldnames: ['user_id', 'vaultlabel'] })
    expect(Object.isFrozen(err.meta?.fieldnames)).to.be.true
    expect(err.message).to.not.contain('u2')
  })

  it("says the refusal's message, a sentence or one made from the fields that disagree", () => {
    const disagreeing = { ...scope, user_id: 'u2', vaultlabel: 'other' }
    expect(TH.expectSyncRefusal(() => verifyConsistent(disagreeing, scope, { kind: 'bad_scope', message: 'Another vault' }), 'bad_scope').message).to.eq('Another vault')
    const err = TH.expectSyncRefusal(() => verifyConsistent(disagreeing, scope, { kind: 'bad_scope', message: (fieldnames) => `Another ${fieldnames.join(' and ')}` }), 'bad_scope')
    expect(err.message).to.eq('Another user_id and vaultlabel')
  })

  it("passes by a field only one bag defines, or one defines as undefined, as its third example shows", () => {
    expect(() => verifyConsistent({ user_id: 'u1', boxlabel: undefined }, { boxlabel: 'openai' }, { kind: 'bad_scope' })).to.not.throw()
    expect(() => verifyConsistent({ boxlabel: 'openai' }, { user_id: 'u1', boxlabel: undefined }, { kind: 'bad_scope' })).to.not.throw()
    expect(() => verifyConsistent({}, scope, { kind: 'bad_scope' })).to.not.throw()
  })

  it("compares by ===, so null disagrees with a value, and two equal objects that are not the same object disagree", () => {
    TH.expectSyncRefusal(() => verifyConsistent({ gate: null }, { gate: {} }, { kind: 'bad_record' }), 'bad_record')
    TH.expectSyncRefusal(() => verifyConsistent({ gate: {} }, { gate: {} }, { kind: 'bad_record' }), 'bad_record')
    expect(() => verifyConsistent({ gate: null }, { gate: null }, { kind: 'bad_record' })).to.not.throw()
  })

  it("reads the other bag's fields by name, a getter that is not enumerable included", () => {
    const scoped = Object.defineProperty({}, 'user_id', { get: () => 'u1', enumerable: false })
    expect(() => verifyConsistent({ user_id: 'u1' }, scoped, { kind: 'bad_scope' })).to.not.throw()
    TH.expectSyncRefusal(() => verifyConsistent({ user_id: 'u2' }, scoped, { kind: 'bad_scope' }), 'bad_scope')
  })

  it("refuses 'bad_option' for a bag that is not an object, or a refusal that is none", () => {
    TH.expectSyncRefusal(() => verifyConsistent(scope, null as unknown as object, { kind: 'bad_scope' }), 'bad_option')
    TH.expectSyncRefusal(() => verifyConsistent('acme' as unknown as object, scope, { kind: 'bad_scope' }), 'bad_option')
    TH.expectSyncRefusal(() => verifyConsistent(scope, scope, { kind: 'no_such_kind' } as never), 'bad_option')
    TH.expectSyncRefusal(() => verifyConsistent(scope, scope, { kind: 'bad_scope', message: 7 } as never), 'bad_option')
  })
})

describe("Kit", () => {
  it("hands out Zod's makers under short names, its scalars ready made, and the names every scope is made of", () => {
    expect(Kit.obj).to.eq(Zod.object)
    expect(Kit.oneof(['one', 'two']).safeParse('two').success).to.be.true
    expect(Kit.uint.safeParse(-1).success).to.be.false
    expect(Kit.uint.safeParse(1.5).success).to.be.false
    expect(Kit.custom((candidate) => typeof candidate === 'function').safeParse(() => null).success).to.be.true
    expect(Kit.lit(null).safeParse(null).success).to.be.true
    expect(Kit.lazy(() => Kit.str).safeParse('text').success).to.be.true
    expect(Kit.applabel).to.eq(Kit.label)
    expect(Kit.user_id.safeParse('auth0|x').success).to.be.true
  })

  it("hands out fn, taking any function, a method, an async one and a class included, and nothing else", () => {
    const clockNow = Kit.fn<() => number>()
    for (const candidate of [() => 1, async () => { await Promise.resolve(); return 1 }, Date.now, Map]) {
      expect(clockNow.safeParse(candidate).success).to.be.true
    }
    for (const candidate of [null, undefined, 'now', {}, { now: () => 1 }]) {
      expect(clockNow.safeParse(candidate).success).to.be.false
    }
    expect(Kit.fn().optional().safeParse(undefined).success).to.be.true
  })

  it("hands out epochMillis, the instant every time is, as the same object the package exports", () => {
    expect(Kit.epochMillis).to.eq(PX.epochMillis)
    expect(Kit.epochMillis.safeParse(1_792_022_400).success).to.be.false
  })
})
