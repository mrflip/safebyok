/** VaultSchemaSdl compared with the core's checks: every typed input and answer has the fields its check reads, and each enum the values. */

import { describe, expect, it } from 'vitest'
import { buildSchema, getNamedType, isEnumType, isInputObjectType, isLeafType, isObjectType, parse, validate } from 'graphql'
import type { GraphQLField, GraphQLInputType, GraphQLNamedType, GraphQLOutputType, GraphQLSchema } from 'graphql'
import type * as Z from 'zod'
import { AskChecks, ManifestChecks, VaultStatsChecks } from 'safebyok/storage'
import { VaultOperations } from '../src/index'
import { VaultSchemaSdl } from '../src/server'
import { WireChecks } from '../src/shapes/shapes-wire'

// == [The walk]: driftOf, schemaDriftOf

/** A zod check. */
type Check = Z.core.$ZodType

/** The parts of a zod check's definition that the walk uses. */
type CheckDef = {
  type:       string
  innerType?: Check
  in?:        Check
  element?:   Check
  options?:   readonly Check[]
  shape?:     Record<string, Check>
  entries?:   Record<string, string>
}

/** A schema type with fields: an object type of an answer, or an input object. */
type Fielded = { name: string, getFields: () => Record<string, { name: string, type: GraphQLOutputType | GraphQLInputType }> }

/** The definition of `check`, typed as {@link CheckDef}. */
function defOf(check: Check): CheckDef { return check._zod.def }

/** Unwrap `check` to the check that reads the value: through optional, nullable, default and readonly wrappers, a pipe's input, and a list's element. */
function unwrapped(check: Check): Check {
  const def = defOf(check)
  const inner = def.innerType ?? def.in ?? def.element
  return inner ? unwrapped(inner) : check
}

/** List the alternatives of `check`, flattening unions. Literal and null alternatives are left out: they fix a field, as a refusal's null `val` or a good answer's null `err`. */
function choicesOf(check: Check): Check[] {
  const inner = unwrapped(check)
  const def = defOf(inner)
  if (def.options) { return def.options.flatMap((option) => choicesOf(option)) }
  if ((def.type === 'literal') || (def.type === 'null')) { return [] }
  return [inner]
}

/** Whether `check` reads its value raw, so that anything the schema sends passes it. */
function isRaw(check: Check): boolean { return ['unknown', 'any'].includes(defOf(unwrapped(check)).type) }

/** Whether `check` passes a field left out. */
function isOptional(check: Check): boolean { return (check as Z.ZodType).safeParse(undefined).success }

/** List the mismatches between `check` and the schema type `gqltype` at `path`, one message each. */
function driftOf(check: Check, gqltype: GraphQLOutputType | GraphQLInputType, path: string): string[] {
  const named = getNamedType(gqltype)
  const choices = choicesOf(check)
  // A record, a track or a `tracked` crosses as SafebyokJson, and a check that fixes a field or reads it raw constrains nothing to compare.
  if ((named.name === 'SafebyokJson') || isRaw(check) || (choices.length === 0)) { return [] }
  if (isEnumType(named)) { return enumDriftOf(choices, named.getValues().map((each) => each.name), path) }
  const shapes = choices.map((choice) => defOf(choice).shape).filter((shape) => shape !== undefined)
  if (isLeafType(named)) { return (shapes.length === 0) ? [] : [`${path}: the schema sends a ${named.name}, the check an object`] }
  if (shapes.length < choices.length) { return [`${path}: the schema sends a ${named.name}, the check a scalar`] }
  return fieldDriftOf(shapes, named as GraphQLNamedType & Fielded, path)
}

/** List the mismatches between the enum values a check's `choices` allow and the schema enum's `gqlvals`, at `path`. */
function enumDriftOf(choices: readonly Check[], gqlvals: readonly string[], path: string): string[] {
  const vals = choices.flatMap((choice) => Object.values(defOf(choice).entries ?? {}))
  const missing = vals.filter((val) => ! gqlvals.includes(val))
  const extra = gqlvals.filter((val) => ! vals.includes(val))
  return [...missing.map((val) => `${path}: the schema's enum lacks ${val}`), ...extra.map((val) => `${path}: the schema's enum has ${val}, which no check allows`)]
}

/** List the mismatches between the fields of the check's `shapes`, each an alternative, and those of the schema type `fielded`, at `path`. */
function fieldDriftOf(shapes: readonly Record<string, Check>[], fielded: Fielded, path: string): string[] {
  const fields = fielded.getFields()
  const fieldnames = [...new Set(shapes.flatMap((shape) => Object.keys(shape)))]
  const missing = fieldnames.filter((fieldname) => ! Object.hasOwn(fields, fieldname) && shapes.some((shape) => shape[fieldname] && ! isOptional(shape[fieldname])))
  const extra = Object.keys(fields).filter((fieldname) => ! fieldnames.includes(fieldname))
  return [
    ...missing.map((fieldname) => `${path}: ${fielded.name} lacks ${fieldname}`),
    ...extra.map((fieldname) => `${path}: ${fielded.name} has ${fieldname}, which no check reads`),
    ...Object.values(fields).flatMap((field) => shapes.flatMap((shape) => (Object.hasOwn(shape, field.name) ? driftOf(shape[field.name]!, field.type, `${path}.${field.name}`) : []))),
  ]
}

/** List every root field of `schema`: Query, Mutation and Subscription. */
function rootFieldsOf(schema: GraphQLSchema): GraphQLField<unknown, unknown>[] {
  const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
  return roots.flatMap((root) => Object.values(root?.getFields() ?? {}))
}

/** Return the root field `fieldname` of `schema`. */
function rootFieldOf(schema: GraphQLSchema, fieldname: string): GraphQLField<unknown, unknown> {
  const field = rootFieldsOf(schema).find((each) => each.name === fieldname)
  if (! field) { throw new Error(`the schema has no root field ${fieldname}`) }
  return field
}

/** List the mismatches between the core's checks and `schema`: every root field's answer and argument, and each type an answer's check reads raw. */
function schemaDriftOf(schema: GraphQLSchema): string[] {
  return [
    ...AnswerChecks.flatMap(([fieldname, check]) => driftOf(check, rootFieldOf(schema, fieldname).type, fieldname)),
    ...InputChecks.flatMap(([fieldname, argname, check]) => {
      const arg = rootFieldOf(schema, fieldname).args.find((each) => each.name === argname)
      if (! arg) { throw new Error(`the schema's ${fieldname} has no ${argname}`) }
      return driftOf(check, arg.type, `${fieldname}(${argname})`)
    }),
    ...TypeChecks.flatMap(([typename, check]) => {
      const type = schema.getType(typename)
      if (! isObjectType(type)) { throw new Error(`the schema has no type ${typename}`) }
      return driftOf(check, type, typename)
    }),
  ]
}
// --

// == [The checks]: AnswerChecks, InputChecks, TypeChecks

// The check GraphQLVaultDB reads each root field's answer with.
const AnswerChecks = [
  ['safebyokGetThing',    WireChecks.gotAnswer],
  ['safebyokListThings',  WireChecks.listAnswer],
  ['safebyokGetWorld',    WireChecks.worldAnswer],
  ['safebyokStats',       WireChecks.statsAnswer],
  ['safebyokWriteThing',  WireChecks.wroteAnswer],
  ['safebyokBirthBank',   WireChecks.rootsAnswer],
  ['safebyokWatchThings', WireChecks.notice],
] as const

// The check GraphQLVaultDB's verb checks each ask with before sending it, and the server's vaultDB checks it with again.
const InputChecks = [
  ['safebyokGetThing',    'ask',   AskChecks.getAsk],
  ['safebyokListThings',  'ask',   AskChecks.listAsk],
  ['safebyokGetWorld',    'ask',   AskChecks.getWorldAsk],
  ['safebyokStats',       'ask',   AskChecks.statsAsk],
  ['safebyokWriteThing',  'ask',   AskChecks.writeAsk],
  ['safebyokBirthBank',   'ask',   AskChecks.birthBankAsk],
  ['safebyokWatchThings', 'scope', AskChecks.thingWatchScope],
] as const

// The check the core reads each typed part of an answer with, where the answer's own check reads it raw.
const TypeChecks = [
  ['SafebyokRoots',        ManifestChecks.roots],
  ['SafebyokStats',        VaultStatsChecks.vaultStats],
] as const
// --

describe("VaultSchemaSdl", () => {
  const schema = buildSchema(VaultSchemaSdl)

  it("has each field the core's checks read, and no other", () => {
    expect(schemaDriftOf(schema)).to.deep.equal([])
  })

  it("names every root field it adds safebyok...", () => {
    for (const field of rootFieldsOf(schema)) { expect(field.name).to.match(/^safebyok[A-Z]/) }
  })

  it("accepts every operation a GraphQLVaultDB sends", () => {
    for (const document of Object.values(VaultOperations)) { expect(validate(schema, parse(document))).to.deep.eq([]) }
  })
})

describe("the schema walk", () => {
  it("reads every root field and input argument the schema has", () => {
    const rootFields = rootFieldsOf(buildSchema(VaultSchemaSdl))
    expect(AnswerChecks.map(([fieldname]) => fieldname)).to.have.members(rootFields.map((field) => field.name))
    const inputArgs = rootFields.flatMap((field) => field.args.filter((arg) => isInputObjectType(getNamedType(arg.type))).map((arg) => `${field.name}(${arg.name})`))
    expect(InputChecks.map(([fieldname, argname]) => `${fieldname}(${argname})`)).to.have.members(inputArgs)
  })

  it("finds an input that lacks a field its check reads", () => {
    const shorted = buildSchema(VaultSchemaSdl.replace(/(input SafebyokGetAsk \{[^}]*?)\n {2}ifAbsent: +SafebyokIfAbsent!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('safebyokGetThing(ask): SafebyokGetAsk lacks ifAbsent')
  })

  it("finds an answer with a field no check reads", () => {
    const padded = buildSchema(VaultSchemaSdl.replace('  message:     String!\n', '  message:     String!\n  hint:        String\n'))
    expect(schemaDriftOf(padded).join('\n')).to.include('has hint, which no check reads')
  })

  it("finds an object where a check reads a scalar", () => {
    const deepened = buildSchema(VaultSchemaSdl.replace('  message:     String!\n', '  message:     SafebyokErrMeta!\n'))
    expect(schemaDriftOf(deepened).join('\n')).to.include('err.message: the schema sends a SafebyokErrMeta, the check a scalar')
  })

  it("finds an enum that lacks a value its check allows", () => {
    const shorted = buildSchema(VaultSchemaSdl.replace(/enum SafebyokIfPresent \{ (\w+) /u, 'enum SafebyokIfPresent { '))
    expect(schemaDriftOf(shorted).join('\n')).to.match(/safebyokWriteThing\(ask\)\.ifPresent: the schema's enum lacks \w+/u)
  })

  it("finds a typed part of an answer that lacks a field the core reads", () => {
    const shorted = buildSchema(VaultSchemaSdl.replace(/(type SafebyokStoreLimits \{[^}]*?)\n {2}size: +Float!/u, '$1'))
    expect(schemaDriftOf(shorted).join('\n')).to.include('SafebyokStoreLimits lacks size')
  })
})
