import { afterEach, describe, expect, it } from 'vitest'
import * as Zod from 'zod'
import { Kit, Validator, sayable } from '../../src/checks/validator'
import { VaultError } from '../../src/errors'
import * as TH from '../test-helpers'

// A module of validators, as a star import would hand one in `sources`: made in a call of its own
// kind, to show a validator nested in another refuses with the outer one's.
const GateChecks = Validator('bad_option', ({ obj, str, uint }) => {
  const passphraseWayinRecord = obj({ salt_b64: str.min(1), memory_kib: uint }).strict()
  const gateRecord            = obj({ passphrase: passphraseWayinRecord }).strict()
  return { passphraseWayinRecord, gateRecord }
})

const { bankScope, vaultScope } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => {
  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  return { bankScope, vaultScope }
})

const { boxRecord, boxSparse } = Validator('bad_record', ({ obj, str, uint, applabel, user_id, vaultlabel, boxlabel }) => {
  const boxRecord = obj({ applabel, user_id, vaultlabel, boxlabel, written_at: uint, whisper_ciphered: str }).strict()
  const boxSparse = boxRecord.omit({ whisper_ciphered: true })
  return { boxRecord, boxSparse }
})

const { vaultRecord } = Validator('bad_record', ({ obj, uint, applabel, user_id, vaultlabel, gateRecord }) => {
  const vaultRecord = obj({ applabel, user_id, vaultlabel, gate_epoch: uint, gate: gateRecord.nullable() }).strict()
  return { vaultRecord }
}, [GateChecks])

const scope = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
const sparse = { ...scope, boxlabel: 'openai', written_at: 1 }
const gate = { passphrase: { salt_b64: 'c2FsdA', memory_kib: 19_456 } }

describe("Validator", () => {
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
    expect(err.message).to.eq("There is no field note: check its spelling, or leave it out")
    TH.expectSyncRefusal(() => boxRecord.parse(sparse), 'bad_record')
  })

  it("spreads a module of validators into the kit, and a nested one refuses with the outer call's kind, as its third example shows", () => {
    expect(vaultRecord.parse({ ...scope, gate_epoch: 1, gate })).to.deep.equal({ ...scope, gate_epoch: 1, gate })
    expect(vaultRecord.parse({ ...scope, gate_epoch: 0, gate: null }).gate).to.be.null
    const err = TH.expectSyncRefusal(() => vaultRecord.parse({ ...scope, gate_epoch: 1, gate: { passphrase: { ...gate.passphrase, memory_kib: -1 } } }), 'bad_record')
    expect(err.message).to.match(/^gate\.passphrase\.memory_kib: Too small/)
    expect(err.meta?.fieldnames).to.deep.equal(['gate.passphrase.memory_kib'])
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
    const { tenFields } = Validator('bad_option', ({ obj, label }) => ({
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

  it("quotes no value it refuses, and repeats an unknown key only when it is shaped as one of our field names", () => {
    const secret = 'sk-live-0xSECRET'
    const err = TH.expectSyncRefusal(() => boxRecord.parse({ ...sparse, applabel: secret, user_id: `${secret} `, written_at: secret, whisper_ciphered: 7, vault_key: secret, [secret]: 1, 'sk live': 2 }), 'bad_record')
    expect(err.message).to.not.include('SECRET')
    expect(err.message).to.not.include('sk live')
    expect(err.message).to.include("There are no fields vault_key, (a name not repeated here), (a name not repeated here)")
    expect(JSON.stringify(err.meta)).to.not.include('SECRET')
    expect(err.cause).to.be.undefined
  })

  it("never repeats an unknown key shaped as a credential, while it repeats one shaped as our snake_case or camelCase field names", () => {
    const credentials = [`ghp_${'aB3'.repeat(12)}`, `sk_live_${'0Fake'.repeat(5)}`, 'sk_live_abc123def', 'AKIAIOSFODNN7EXAMPLE', 'deadbeef0123', 'a'.repeat(33)]
    const ours = ['salt_b64', 'vault_key_wayin_wrapped', 'staleMinute', 'idbVaultDB', 'prfSaltB64']
    const { strictBag } = Validator('bad_option', ({ obj }) => ({ strictBag: obj({}).strict() }))
    const err = TH.expectSyncRefusal(() => strictBag.parse(Object.fromEntries([...credentials, ...ours].map((ckey) => [ckey, 1]))), 'bad_option')
    for (const credential of credentials) { expect(err.message).to.not.include(credential) }
    expect(err.message).to.eq(`There are no fields ${[...credentials.map(() => '(a name not repeated here)'), ...ours].join(', ')}: check their spelling, or leave them out`)
  })

  it("never repeats a record's key that may be the caller's data in a failing field's path", () => {
    const { listing } = Validator('bad_record', ({ rec, str, label }) => ({ listing: rec(str, label) }))
    const err = TH.expectSyncRefusal(() => listing.parse({ 'sk-live-0xSECRET': 'Not A Label', fine_name: 'Nor This' }), 'bad_record')
    expect(err.message).to.not.include('SECRET')
    expect(err.meta?.fieldnames).to.deep.equal(['(a name not repeated here)', 'fine_name'])
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
    const made = Validator('bad_record', build)
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
    const slices = Validator('bad_record', ({ obj, int, applabel, user_id, vaultlabel }) => {
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
    const { checked } = Validator('bad_option', ({ uint, extra }) => ({ checked: Zod.object({ count: uint, extra }) }), [{ uint: Zod.string(), extra: Zod.number() }, { extra: Zod.boolean() }])
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
})

describe("sayable", () => {
  it("repeats a key shaped as one of our field names, as its first example shows", () => {
    expect(sayable('staleMinute')).to.eq('staleMinute')
  })

  it("stands in for a key shaped as a credential, as its second example shows", () => {
    expect(sayable(`sk_live_${'0Fake'.repeat(3)}`)).to.eq("(a name not repeated here)")
  })

  it("repeats an index as it is", () => {
    expect(sayable(3)).to.eq('3')
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
})
