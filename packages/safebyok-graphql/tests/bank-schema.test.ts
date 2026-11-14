/** BankSchemaSdl compared with the core's checks: every schema type has exactly the fields its check expects. */

import { describe, expect, it } from 'vitest'
import { buildSchema, getNamedType, isEnumType, isInputObjectType, isLeafType, isObjectType, isUnionType } from 'graphql'
import type { GraphQLField, GraphQLInputObjectType, GraphQLInputType, GraphQLNamedType, GraphQLObjectType, GraphQLOutputType, GraphQLSchema } from 'graphql'
import type * as Z from 'zod'
import { BX, storagePolicyVals } from 'safebyok-big/storage'
import { BankSchemaSdl } from '../src/server'

// == [The walk]: schemaDriftOf, driftOf

/** A zod check. */
type Check = Z.core.$ZodType

/** An object check's fields, by name. */
type CheckShape = Record<string, Check>

/** The parts of a zod check's definition that the walk uses. */
type CheckDef = {
  type:       string
  innerType?: Check
  in?:        Check
  element?:   Check
  options?:   readonly Check[]
  shape?:     CheckShape
}

/** A schema type that has fields: an object type in an answer, or an input object. */
type FieldedType = GraphQLObjectType | GraphQLInputObjectType

/** The definition of `check`, typed as {@link CheckDef}. */
function defOf(check: Check): CheckDef { return check._zod.def }

/** Unwrap `check` to the check that holds its fields: through nullable, default and readonly wrappers, a transform's input, and a list's element. */
function unwrapped(check: Check): Check {
  const def = defOf(check)
  const inner = def.innerType ?? def.in ?? def.element
  return inner ? unwrapped(inner) : check
}

/** List the alternatives of `check`, flattening unions. Literal and null alternatives are left out: a refusal sets some answer fields to null. */
function choicesOf(check: Check): Check[] {
  const inner = unwrapped(check)
  const def = defOf(inner)
  if (def.options) { return def.options.flatMap((option) => choicesOf(option)) }
  if (def.type === 'literal' || def.type === 'null') { return [] }
  return [inner]
}

/** List the fielded types of `named`: a union's members, or the type itself. */
function fieldedTypesOf(named: GraphQLNamedType): readonly FieldedType[] {
  if (isUnionType(named)) { return named.getTypes() }
  return (isObjectType(named) || isInputObjectType(named)) ? [named] : []
}

/** List the mismatches between `check` and the schema type `gqltype` at `path`, one message each. */
function driftOf(check: Check, gqltype: GraphQLOutputType | GraphQLInputType, path: string): string[] {
  const named = getNamedType(gqltype)
  const choices = choicesOf(check)
  const shapes = choices.map((choice) => defOf(choice).shape).filter((shape) => shape !== undefined)
  if (isLeafType(named)) {
    // SafebyokJson passes a sidecar, a damaged row or a refusal's meta through untyped, so the check's fields are not compared.
    if (named.name === 'SafebyokJson' || shapes.length === 0) { return [] }
    return [`${path}: the schema sends a ${named.name}, the check an object`]
  }
  if (shapes.length < choices.length) { return [`${path}: the schema sends a ${named.name}, the check a scalar`] }
  return shapes.flatMap((shape) => shapeDriftOf(shape, fieldedTypesOf(named), path))
}

/** List the mismatches between the check's `shape` and the one of `fieldedTypes` whose fields match it, at `path`. */
function shapeDriftOf(shape: CheckShape, fieldedTypes: readonly FieldedType[], path: string): string[] {
  const fieldnames = Object.keys(shape)
  // The schema may leave out a field that the check only ever allows to be null (such as listBoxes' dbhas): the check's default fills it in.
  const optional = new Set(fieldnames.filter((fieldname) => choicesOf(shape[fieldname]!).length === 0))
  function fits(gqlnames: string[]) {
    return gqlnames.every((gqlname) => fieldnames.includes(gqlname)) && fieldnames.every((fieldname) => gqlnames.includes(fieldname) || optional.has(fieldname))
  }
  const fielded = fieldedTypes.find((each) => fits(Object.keys(each.getFields())))
  if (! fielded) {
    const offered = fieldedTypes.map((each) => `${each.name} {${Object.keys(each.getFields()).join(' ')}}`)
    return [`${path}: the check's {${fieldnames.join(' ')}} matches none of ${offered.join(', ')}`]
  }
  const fields: Record<string, { name: string, type: GraphQLOutputType | GraphQLInputType }> = fielded.getFields()
  return Object.values(fields).flatMap((field) => driftOf(shape[field.name]!, field.type, `${path}.${field.name}`))
}

/** Return the root field `fieldname` of `schema`, from Query, Mutation or Subscription. */
function rootFieldOf(schema: GraphQLSchema, fieldname: string): GraphQLField<unknown, unknown> {
  const field = rootFieldsOf(schema).find((each) => each.name === fieldname)
  if (! field) { throw new Error(`the schema has no root field ${fieldname}`) }
  return field
}

/** List every root field of `schema`: Query, Mutation and Subscription. */
function rootFieldsOf(schema: GraphQLSchema): GraphQLField<unknown, unknown>[] {
  const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
  return roots.flatMap((root) => Object.values(root?.getFields() ?? {}))
}

/** List the mismatches between the core's checks and `schema`, over every root field's answer and every input object. */
function schemaDriftOf(schema: GraphQLSchema): string[] {
  return [
    ...AnswerChecks.flatMap(([fieldname, check]) => driftOf(check, rootFieldOf(schema, fieldname).type, fieldname)),
    ...InputChecks.flatMap(([fieldname, argname, check]) => {
      const arg = rootFieldOf(schema, fieldname).args.find((each) => each.name === argname)
      if (! arg) { throw new Error(`the schema's ${fieldname} takes no ${argname}`) }
      return driftOf(check, arg.type, `${fieldname}(${argname})`)
    }),
  ]
}
// --

// == [The checks]: AnswerChecks, InputChecks

// The check GraphQLBankDB parses each root field's answer with.
const AnswerChecks = [
  ['safebyokEnsureBank',        BX.ensureBankAnswer],
  ['safebyokGetVault',          BX.getVaultAnswer],
  ['safebyokListBoxes',         BX.listBoxesAnswer],
  ['safebyokGetBox',            BX.getBoxAnswer],
  ['safebyokBuildBank',         BX.buildBankAnswer],
  ['safebyokPutGate',           BX.putGateAnswer],
  ['safebyokDelBank',           BX.delBankAnswer],
  ['safebyokPutVault',          BX.putVaultAnswer],
  ['safebyokDelVault',          BX.delVaultAnswer],
  ['safebyokPutBox',            BX.putBoxAnswer],
  ['safebyokDelBox',            BX.delBoxAnswer],
  ['safebyokTidyGone',          BX.tidyGoneAnswer],
  ['safebyokWatch',             BX.crossedNotice],
] as const

// The check GraphQLBankDB parses each input object with before sending it, and the server's bankDB parses it with again.
const InputChecks = [
  ['safebyokGetVault',          'ask', BX.vaultGet],
  ['safebyokGetBox',            'ask', BX.boxGet],
  ['safebyokBuildBank',         'ask', BX.bankBuild],
  ['safebyokPutGate',           'ask', BX.gatePut],
  ['safebyokDelBank',           'ask', BX.bankDel],
  ['safebyokPutVault',          'ask', BX.vaultPut],
  ['safebyokDelVault',          'ask', BX.vaultDel],
  ['safebyokPutBox',            'ask', BX.boxPut],
  ['safebyokDelBox',            'ask', BX.boxDel],
] as const
// --

describe("BankSchemaSdl", () => {
  it("has each field the core's checks read, and no other", () => {
    expect(schemaDriftOf(buildSchema(BankSchemaSdl))).to.deep.equal([])
  })

  it("fails the drift check when it lacks a field a check reads", () => {
    const shorted = buildSchema(BankSchemaSdl.replace('  cipher_iv_b64:  String!\n', ''))
    const drift = schemaDriftOf(shorted)
    expect(drift).to.not.be.empty
    expect(drift.join('\n')).to.include('cipher_iv_b64')
  })

  it("fails the drift check when it has a field no check reads", () => {
    const padded = buildSchema(BankSchemaSdl.replace('  message:     String!\n', '  message:     String!\n  hint:        String\n'))
    expect(schemaDriftOf(padded).join('\n')).to.include('hint')
  })

  it("fails the drift check when it sends an object where a check reads a scalar", () => {
    const deepened = buildSchema(BankSchemaSdl.replace('  refusalkind: SafebyokRefusalkind!\n', '  refusalkind: SafebyokAskRow!\n'))
    expect(schemaDriftOf(deepened).join('\n')).to.include('refusalkind')
  })

  it("fails the drift check when an ask lacks a field of the row it expects", () => {
    const shorted = buildSchema(BankSchemaSdl.replace(/(input SafebyokBoxExpectedInput \{[^}]*?)\n {2}box_tok: {6}String!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('safebyokPutBox(ask).expected')
  })

  it("fails the drift check when a gate put lacks its options", () => {
    const shorted = buildSchema(BankSchemaSdl.replace(/(input SafebyokGatePutAskInput \{[^}]*?)\n {2}options: +SafebyokGateOptionsInput!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('safebyokPutGate(ask)')
  })

  it("fails the drift check when a gate put's expected row lacks its wayins", () => {
    const shorted = buildSchema(BankSchemaSdl.replace(/(input SafebyokGateExpectedInput \{[^}]*?)\n {2}wayins: +SafebyokWayinsInput!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('safebyokPutGate(ask).expected')
  })

  it("fails the drift check when an answer's ask lacks its options", () => {
    const shorted = buildSchema(BankSchemaSdl.replace(/(type SafebyokAsk \{[^}]*?)\n {2}options: +SafebyokAskOptions/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('options')
  })

  it("takes a gate put's policy as one of the storage policies, and no other", () => {
    const policyEnum = buildSchema(BankSchemaSdl).getType('SafebyokStoragePolicy')
    const policies = isEnumType(policyEnum) ? policyEnum.getValues().map((policy) => policy.value as unknown) : null
    expect(policies).to.deep.equal([...storagePolicyVals])
  })
})

describe("the schema walk", () => {
  it("reads every root field and input object the schema has", () => {
    const rootFields = rootFieldsOf(buildSchema(BankSchemaSdl))
    expect(AnswerChecks.map(([fieldname]) => fieldname)).to.have.members(rootFields.map((field) => field.name))
    const inputArgs = rootFields.flatMap((field) => field.args.filter((arg) => isInputObjectType(getNamedType(arg.type))).map((arg) => `${field.name}(${arg.name})`))
    expect(InputChecks.map(([fieldname, argname]) => `${fieldname}(${argname})`)).to.have.members(inputArgs)
  })

  it("reaches past a union to each of its types", () => {
    const schema = buildSchema(BankSchemaSdl)
    expect(isObjectType(schema.getType('SafebyokBoxRecord'))).to.be.true
    const shorted = buildSchema(BankSchemaSdl.replace(/(type SafebyokBoxRecord \{[^}]*?)\n {2}sidecar: {16}SafebyokJson!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('sidecar')
  })
})
