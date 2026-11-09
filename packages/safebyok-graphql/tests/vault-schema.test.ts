/** VaultSchemaSdl against the core's checks: each type the schema sends or takes has the fields its check reads, no more and no fewer. */

import { describe, expect, it } from 'vitest'
import { buildSchema, getNamedType, isInputObjectType, isLeafType, isObjectType, isUnionType } from 'graphql'
import type { GraphQLField, GraphQLInputObjectType, GraphQLInputType, GraphQLNamedType, GraphQLObjectType, GraphQLOutputType, GraphQLSchema } from 'graphql'
import type * as Z from 'zod'
import * as DB from 'safebyok/storage'
import { VaultSchemaSdl } from '../src/server'

// == [The walk]: schemaDriftOf, driftOf

/** A zod check, as the walk takes it apart. */
type Check = Z.core.$ZodType

/** The fields of a check's object, by name. */
type CheckShape = Record<string, Check>

/** The parts of a zod check's definition the walk reads. */
type CheckDef = {
  type:       string
  innerType?: Check
  in?:        Check
  element?:   Check
  options?:   readonly Check[]
  shape?:     CheckShape
}

/** A schema type with fields: a type an answer sends, or an input a verb takes. */
type FieldedType = GraphQLObjectType | GraphQLInputObjectType

/** `check`'s definition, as the walk reads it. */
const defOf = (check: Check): CheckDef => check._zod.def

/** The check that has `check`'s fields: past each nullable, default and readonly, a transform's input and a list's element. */
const unwrapped = (check: Check): Check => {
  const def = defOf(check)
  const inner = def.innerType ?? def.in ?? def.element
  return inner ? unwrapped(inner) : check
}

/** The checks `check` may stand for, a union taken apart, and a null literal (an answer's field a refusal empties) dropped. */
const choicesOf = (check: Check): Check[] => {
  const inner = unwrapped(check)
  const def = defOf(inner)
  if (def.options) { return def.options.flatMap((option) => choicesOf(option)) }
  if (def.type === 'literal' || def.type === 'null') { return [] }
  return [inner]
}

/** The types `named` may send or take: a union's members, or itself. */
const fieldedTypesOf = (named: GraphQLNamedType): readonly FieldedType[] => {
  if (isUnionType(named)) { return named.getTypes() }
  return (isObjectType(named) || isInputObjectType(named)) ? [named] : []
}

/** Each mismatch between `check` and the schema type `gqltype` at `path`, as a line a failing test names. */
const driftOf = (check: Check, gqltype: GraphQLOutputType | GraphQLInputType, path: string): string[] => {
  const named = getNamedType(gqltype)
  const choices = choicesOf(check)
  const shapes = choices.map((choice) => defOf(choice).shape).filter((shape) => shape !== undefined)
  if (isLeafType(named)) {
    // SafebyokJson carries a sidecar, a damaged row or a refusal's meta whole, whatever fields the check gives it.
    if (named.name === 'SafebyokJson' || shapes.length === 0) { return [] }
    return [`${path}: the schema sends a ${named.name}, the check an object`]
  }
  if (shapes.length < choices.length) { return [`${path}: the schema sends a ${named.name}, the check a scalar`] }
  return shapes.flatMap((shape) => shapeDriftOf(shape, fieldedTypesOf(named), path))
}

/** Each mismatch between the check's `shape` and whichever of `fieldedTypes` has its fields, at `path`. */
const shapeDriftOf = (shape: CheckShape, fieldedTypes: readonly FieldedType[], path: string): string[] => {
  const fieldnames = Object.keys(shape)
  // A field the check has only ever null (listVaults' dbhas) the schema may leave out: its default fills it.
  const optional = new Set(fieldnames.filter((fieldname) => choicesOf(shape[fieldname]!).length === 0))
  const fits = (gqlnames: string[]) => (
    gqlnames.every((gqlname) => fieldnames.includes(gqlname)) && fieldnames.every((fieldname) => gqlnames.includes(fieldname) || optional.has(fieldname))
  )
  const fielded = fieldedTypes.find((each) => fits(Object.keys(each.getFields())))
  if (! fielded) {
    const offered = fieldedTypes.map((each) => `${each.name} {${Object.keys(each.getFields()).join(' ')}}`)
    return [`${path}: the check's {${fieldnames.join(' ')}} matches none of ${offered.join(', ')}`]
  }
  const fields: Record<string, { name: string, type: GraphQLOutputType | GraphQLInputType }> = fielded.getFields()
  return Object.values(fields).flatMap((field) => driftOf(shape[field.name]!, field.type, `${path}.${field.name}`))
}

/** `schema`'s root field `fieldname`, of Query, Mutation or Subscription. */
const rootFieldOf = (schema: GraphQLSchema, fieldname: string): GraphQLField<unknown, unknown> => {
  const field = rootFieldsOf(schema).find((each) => each.name === fieldname)
  if (! field) { throw new Error(`the schema has no root field ${fieldname}`) }
  return field
}

/** Every root field of `schema`, of Query, Mutation and Subscription. */
const rootFieldsOf = (schema: GraphQLSchema): GraphQLField<unknown, unknown>[] => {
  const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
  return roots.flatMap((root) => Object.values(root?.getFields() ?? {}))
}

/** Each mismatch between the core's checks and `schema`, at every root field's answer and every input object it takes. */
const schemaDriftOf = (schema: GraphQLSchema): string[] => [
  ...AnswerChecks.flatMap(([fieldname, check]) => driftOf(check, rootFieldOf(schema, fieldname).type, fieldname)),
  ...InputChecks.flatMap(([fieldname, argname, check]) => {
    const arg = rootFieldOf(schema, fieldname).args.find((each) => each.name === argname)
    if (! arg) { throw new Error(`the schema's ${fieldname} takes no ${argname}`) }
    return driftOf(check, arg.type, `${fieldname}(${argname})`)
  }),
]
// --

// == [The checks]: AnswerChecks, InputChecks

// The answer check each root field's answer is parsed with by GraphQLVaultDB.
const AnswerChecks = [
  ['safebyokListVaults',        DB.listVaultsAnswer],
  ['safebyokGetVault',          DB.getVaultAnswer],
  ['safebyokListBoxes',         DB.listBoxesAnswer],
  ['safebyokGetBox',            DB.getBoxAnswer],
  ['safebyokPutVault',          DB.putVaultAnswer],
  ['safebyokPutBox',            DB.putBoxAnswer],
  ['safebyokReplacePassphrase', DB.replacePassphraseAnswer],
  ['safebyokAddPasskey',        DB.addPasskeyAnswer],
  ['safebyokRevokePasskey',     DB.revokePasskeyAnswer],
  ['safebyokDelBox',            DB.delBoxAnswer],
  ['safebyokDelVault',          DB.delVaultAnswer],
  ['safebyokTidyGone',          DB.tidyGoneAnswer],
  ['safebyokWatch',             DB.crossedNotice],
] as const

// The check each input object is parsed with by GraphQLVaultDB before it is sent.
const InputChecks = [
  ['safebyokGetVault',          'opts',      DB.ifAbsentOpts],
  ['safebyokGetBox',            'opts',      DB.ifAbsentOpts],
  ['safebyokPutVault',          'record',    DB.vaultRecord],
  ['safebyokPutVault',          'opts',      DB.putVaultOpts],
  ['safebyokPutBox',            'record',    DB.boxRecord],
  ['safebyokPutBox',            'opts',      DB.putOpts],
  ['safebyokReplacePassphrase', 'params',    DB.replacePassphraseParams],
  ['safebyokAddPasskey',        'params',    DB.passkeyAddParams],
  ['safebyokRevokePasskey',     'params',    DB.revokePasskeyParams],
  ['safebyokDelBox',            'tombstone', DB.boxTombstone],
  ['safebyokDelBox',            'opts',      DB.delOpts],
  ['safebyokDelVault',          'tombstone', DB.vaultTombstone],
  ['safebyokDelVault',          'opts',      DB.delOpts],
] as const
// --

describe("VaultSchemaSdl", () => {
  it("has each field the core's checks read, and no other", () => {
    expect(schemaDriftOf(buildSchema(VaultSchemaSdl))).to.deep.equal([])
  })

  it("is caught missing a field a check reads", () => {
    const shorted = buildSchema(VaultSchemaSdl.replace('  cipher_iv_b64:  String!\n', ''))
    const drift = schemaDriftOf(shorted)
    expect(drift).to.not.be.empty
    expect(drift.join('\n')).to.include('cipher_iv_b64')
  })

  it("is caught with a field no check reads", () => {
    const padded = buildSchema(VaultSchemaSdl.replace('  message:     String!\n', '  message:     String!\n  hint:        String\n'))
    expect(schemaDriftOf(padded).join('\n')).to.include('hint')
  })

  it("is caught sending an object where a check reads a scalar", () => {
    const deepened = buildSchema(VaultSchemaSdl.replace('  refusalkind: SafebyokRefusalkind!\n', '  refusalkind: SafebyokRevision!\n'))
    expect(schemaDriftOf(deepened).join('\n')).to.include('refusalkind')
  })
})

describe("the walk", () => {
  it("reads every root field and input object the schema has", () => {
    const rootFields = rootFieldsOf(buildSchema(VaultSchemaSdl))
    expect(AnswerChecks.map(([fieldname]) => fieldname)).to.have.members(rootFields.map((field) => field.name))
    const inputArgs = rootFields.flatMap((field) => field.args.filter((arg) => isInputObjectType(getNamedType(arg.type))).map((arg) => `${field.name}(${arg.name})`))
    expect(InputChecks.map(([fieldname, argname]) => `${fieldname}(${argname})`)).to.have.members(inputArgs)
  })

  it("reaches past a union to each of its types", () => {
    const schema = buildSchema(VaultSchemaSdl)
    expect(isObjectType(schema.getType('SafebyokBoxRecord'))).to.be.true
    const shorted = buildSchema(VaultSchemaSdl.replace(/(type SafebyokBoxRecord \{[^}]*?)\n {2}sidecar: {16}SafebyokJson!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('sidecar')
  })
})
