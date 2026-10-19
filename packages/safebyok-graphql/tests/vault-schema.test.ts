import { describe, expect, it } from 'vitest'
import { buildSchema, getNamedType, isInputObjectType, isListType, isNonNullType, isObjectType, parse, validate } from 'graphql'
import type { GraphQLInputField, GraphQLField } from 'graphql'
import { Ciphered, Box, VaultProps, VaultScope } from 'safebyok'
import { VaultSchemaSdl } from '../src/vault-schema'
import { VaultOperations } from '../src/graphql-vault-db'

const schema = buildSchema(VaultSchemaSdl)

/** A record's validator, as the core exports it: its fields, each one a validator. */
// A field is optional when Zod says it may be left out (`optin`), whether or not it takes an undefined.
type RecordSchema = { shape: Record<string, { _zod: { optin?: string } }> }

/** Each object type and input type, the core record it carries, and the fields it leaves out. */
const RecordTypes = [
  ['SafebyokVaultScope',         VaultScope,  []],
  ['SafebyokVaultScopeInput',    VaultScope,  []],
  ['SafebyokVaultProps',         VaultProps, []],
  ['SafebyokVaultPropsInput',    VaultProps, []],
  ['SafebyokBox',                Box,         []],
  ['SafebyokBoxInput',           Box,         []],
  ['SafebyokListedBox',          Box,         ['box_key_wrapped', 'whisper_ciphered']],
  ['SafebyokCiphered',           Ciphered,    []],
  ['SafebyokCipheredInput',      Ciphered,    []],
] as const

/** The fields of the object or input type `typename`, by name. */
const fieldsOf = (typename: string): Record<string, GraphQLField<unknown, unknown> | GraphQLInputField> => {
  const named = schema.getType(typename)
  if (! isObjectType(named) && ! isInputObjectType(named)) { throw new Error(`${typename} is not an object or input type`) }
  return named.getFields()
}

describe("VaultSchemaSdl", () => {
  it("builds as a schema on its own, with a query, a mutation and a subscription type", () => {
    expect(schema.getQueryType()?.name).to.eq('Query')
    expect(schema.getMutationType()?.name).to.eq('Mutation')
    expect(schema.getSubscriptionType()?.name).to.eq('Subscription')
  })

  for (const [typename, recordSchema, leftOut] of RecordTypes) {
    it(`gives ${typename} a field for every field of the record it carries, and no other`, () => {
      const recordFields = Object.keys((recordSchema as unknown as RecordSchema).shape).filter((field) => ! (leftOut as readonly string[]).includes(field))
      expect(Object.keys(fieldsOf(typename))).to.have.members(recordFields)
    })

    it(`makes a field of ${typename} nullable exactly where the record's is optional`, () => {
      const { shape } = recordSchema as unknown as RecordSchema
      const described = Object.entries(fieldsOf(typename))
      for (const [field, { type }] of described) {
        expect(isNonNullType(type), `${typename}.${field}`).to.eq(shape[field]!._zod.optin !== 'optional')
      }
    })
  }

  it("carries the vault props' wayins as a list, each one opaque JSON", () => {
    for (const typename of ['SafebyokVaultProps', 'SafebyokVaultPropsInput']) {
      const wayins = fieldsOf(typename)['wayins']!.type
      expect(isNonNullType(wayins) && isListType(wayins.ofType)).to.be.true
      expect(getNamedType(wayins).name).to.eq('SafebyokWayin')
    }
  })

  it("names one root field for each VaultDB verb a browser's vault calls, and one subscription", () => {
    expect(Object.keys(schema.getQueryType()!.getFields())).to.have.members(['safebyokGetVaultProps', 'safebyokGetBox', 'safebyokListBoxes'])
    expect(Object.keys(schema.getMutationType()!.getFields())).to.have.members([
      'safebyokEnsureVaultProps', 'safebyokPutVaultProps', 'safebyokPutBox', 'safebyokDelBox', 'safebyokDelVault',
    ])
    expect(Object.keys(schema.getSubscriptionType()!.getFields())).to.have.members(['safebyokVaultChanged'])
  })

  it("adds nothing to a host's schema that is not named for safebyok, but its three root types", () => {
    const builtIn = new Set(['String', 'Int', 'Float', 'Boolean', 'Query', 'Mutation', 'Subscription'])
    const added = Object.keys(schema.getTypeMap()).filter((typename) => ! typename.startsWith('__') && ! builtIn.has(typename))
    expect(added.filter((typename) => ! typename.startsWith('Safebyok'))).to.deep.equal([])
  })

  for (const [rootField, document] of Object.entries(VaultOperations)) {
    it(`holds graphqlVaultDB's ${rootField} operation valid against it`, () => {
      expect(validate(schema, parse(document)).map((err) => err.message)).to.deep.equal([])
    })
  }
})
