import { describe, expect, it } from 'vitest'
import { buildSchema, getNamedType, isInputObjectType, isNonNullType, isObjectType, parse, validate } from 'graphql'
import type { GraphQLInputField, GraphQLField } from 'graphql'
import { Ciphered, BoxRecord, GatedVaultProps, GatelessVaultProps, VaultScope } from 'safebyok'
import { VaultSchemaSdl } from '../src/vault-schema'
import { VaultOperations } from '../src/graphql-vault-db'

const schema = buildSchema(VaultSchemaSdl)

/** A record's validator, as the core exports it: its fields, each one a validator. */
// A field is optional when Zod says it may be left out (`optin`), whether or not it takes an undefined;
// nullable when its validator is Zod's nullable.
type RecordSchema = { shape: Record<string, { _zod: { optin?: string }, safeParse: (val: unknown) => { success: boolean } }> }

/** The fields of vault props gated or gateless, as one GraphQL type carries both: the gated ones, the passphrase taking null as a gateless vault's does. */
const EitherVaultProps = { shape: { ...GatedVaultProps.shape, passphrase: GatelessVaultProps.shape.passphrase } }

/** Each object type and input type, the core record it carries, and the fields it leaves out. */
const RecordTypes = [
  ['SafebyokVaultScope',         VaultScope,  []],
  ['SafebyokVaultProps',         EitherVaultProps, []],
  ['SafebyokVaultPropsInput',    EitherVaultProps, []],
  ['SafebyokBox',                BoxRecord,   []],
  ['SafebyokBoxInput',           BoxRecord,   []],
  ['SafebyokListedBox',          BoxRecord,   ['box_key_wrapped', 'whisper_ciphered']],
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

    it(`makes a field of ${typename} nullable exactly where the record's is optional or takes null`, () => {
      const { shape } = recordSchema as unknown as RecordSchema
      const described = Object.entries(fieldsOf(typename))
      for (const [field, { type }] of described) {
        const fieldSchema = shape[field]!
        expect(isNonNullType(type), `${typename}.${field}`).to.eq(fieldSchema._zod.optin !== 'optional' && ! fieldSchema.safeParse(null).success)
      }
    })

    it(`carries ${typename}'s sidecar, if it has one, as a SafebyokSidecar, never null: a sidecar is always an object`, () => {
      const { sidecar } = fieldsOf(typename)
      if (sidecar === undefined) { return }
      expect(isNonNullType(sidecar.type)).to.be.true
      expect(getNamedType(sidecar.type).name).to.eq('SafebyokSidecar')
    })
  }

  it("carries the vault props' passphrase and passkey each as opaque JSON, both nullable, as a gateless vault holds neither", () => {
    for (const typename of ['SafebyokVaultProps', 'SafebyokVaultPropsInput']) {
      const { passphrase, passkey } = fieldsOf(typename)
      expect(isNonNullType(passphrase!.type)).to.be.false
      expect(isNonNullType(passkey!.type)).to.be.false
      expect(getNamedType(passphrase!.type).name).to.eq('SafebyokWayin')
      expect(getNamedType(passkey!.type).name).to.eq('SafebyokWayin')
    }
  })

  it("names one root field for each VaultDB verb a browser's vault calls, and one subscription", () => {
    expect(Object.keys(schema.getQueryType()!.getFields())).to.have.members(['safebyokGetVault', 'safebyokGetBox', 'safebyokGetCapacity'])
    expect(Object.keys(schema.getMutationType()!.getFields())).to.have.members([
      'safebyokEnsureVault', 'safebyokPutVaultProps', 'safebyokPutBox', 'safebyokDelBox', 'safebyokDelVault',
    ])
    expect(Object.keys(schema.getSubscriptionType()!.getFields())).to.have.members(['safebyokVaultChanged'])
  })

  it("takes a vault's three names as arguments of their own, each a String!, on every root field aimed at a vault, and nests no scope", () => {
    const rootFields = [schema.getQueryType()!, schema.getMutationType()!, schema.getSubscriptionType()!].flatMap((rootType) => Object.values(rootType.getFields()))
    const scoped = rootFields.filter((rootField) => rootField.args.some((arg) => arg.name === 'user_id'))
    expect(scoped.map((rootField) => rootField.name)).to.have.members([
      'safebyokGetVault', 'safebyokGetBox', 'safebyokGetCapacity', 'safebyokPutBox', 'safebyokDelBox', 'safebyokDelVault', 'safebyokVaultChanged',
    ])
    for (const rootField of scoped) {
      const scopeArgs = rootField.args.filter((arg) => ['applabel', 'user_id', 'vaultlabel'].includes(arg.name))
      expect(scopeArgs.map((arg) => String(arg.type)), rootField.name).to.deep.equal(['String!', 'String!', 'String!'])
    }
    expect(rootFields.flatMap((rootField) => rootField.args).filter((arg) => arg.name === 'scope')).to.deep.equal([])
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
