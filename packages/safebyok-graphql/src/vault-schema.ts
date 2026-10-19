/**
 * The GraphQL schema safebyok's verbs cross by, as SDL: one root field per VaultDB verb, each
 * record an object type with a field per stored field, and a subscription that says when a vault
 * changed. Hand it to your GraphQL server beside your own type definitions, with
 * {@link vaultResolvers} beside your own resolvers. Everything it adds to your schema is named
 * `safebyok...` or `Safebyok...`, so it meets nothing of yours.
 *
 * It defines `type Query`, `type Mutation` and `type Subscription`. Yoga's `createSchema`,
 * Apollo Server and graphql-tools' `makeExecutableSchema` merge it with your own root types when
 * the type definitions go in as a list.
 *
 * @example createSchema({ typeDefs: [appTypeDefs, VaultSchemaSdl], resolvers: [appResolvers, vaultResolvers({ vaultDBFor })] })
 */
export const VaultSchemaSdl = `"""
One wayin of a vault, as safebyok stored it: JSON, its \`wayinkind\` saying its shape, its
vaultKey wrapped (\`vault_key_wayin_wrapped\`). Carried as it is, never looked inside.
"""
scalar SafebyokWayin

"""
The vaultKey before a vault's own, as safebyok stored it: JSON, its \`vault_key_epoch\` and that
vaultKey wrapped under the vault's own (\`vault_key_wrapped\`). Carried as it is, never looked inside.
"""
scalar SafebyokPriorVaultKey

"""An encrypted value: its cipherIv and its ciphertext, each base64url text."""
type SafebyokCiphered {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

"""An encrypted value: its cipherIv and its ciphertext, each base64url text."""
input SafebyokCipheredInput {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

"""Which vault: the app's label, the signed-in user, and the vault's own label."""
type SafebyokVaultScope {
  applabel:   String!
  user_id:    String!
  vaultlabel: String!
}

"""Which vault: the app's label, the signed-in user, and the vault's own label."""
input SafebyokVaultScopeInput {
  applabel:   String!
  user_id:    String!
  vaultlabel: String!
}

"""
A vault's props, as stored: its scope, its vault_id, and its wayins, each wrapping the
one vaultKey. Times are epoch milliseconds.
"""
type SafebyokVaultProps {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_id:         String!
  unlock_epoch:     Int!
  vault_key_epoch:  Int!
  prior_vault_key:  SafebyokPriorVaultKey
  wayins:           [SafebyokWayin!]!
  registered_at:    Float!
}

"""A vault's props, as stored. Times are epoch milliseconds."""
input SafebyokVaultPropsInput {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_id:         String!
  unlock_epoch:     Int!
  vault_key_epoch:  Int!
  prior_vault_key:  SafebyokPriorVaultKey
  wayins:           [SafebyokWayin!]!
  registered_at:    Float!
}

"""
One lockbox, as stored: its whisper encrypted under its lockboxKey, that lockboxKey wrapped under
the vaultKey, and its public shell. Times are epoch milliseconds; the sidecar is the JSON text
it was written as, which is bound into the lockbox's encryption.
"""
type SafebyokLockbox {
  format:                 String!
  boxlabel:               String!
  revision_tok:           String!
  vault_key_epoch:        Int!
  lockbox_key_wrapped:    SafebyokCiphered!
  whisper_ciphered:       SafebyokCiphered!
  whisper_codec:          String!
  whisper_schema_version: Int!
  sidecar_json:           String!
  registered_at:          Float!
  written_at:             Float!
}

"""One lockbox, as stored. Times are epoch milliseconds; the sidecar is its JSON text."""
input SafebyokLockboxInput {
  format:                 String!
  boxlabel:               String!
  revision_tok:           String!
  vault_key_epoch:        Int!
  lockbox_key_wrapped:    SafebyokCipheredInput!
  whisper_ciphered:       SafebyokCipheredInput!
  whisper_codec:          String!
  whisper_schema_version: Int!
  sidecar_json:           String!
  registered_at:          Float!
  written_at:             Float!
}

"""A lockbox as a listing has it: every field but the two encrypted ones."""
type SafebyokListedLockbox {
  format:                 String!
  boxlabel:               String!
  revision_tok:           String!
  vault_key_epoch:        Int!
  whisper_codec:          String!
  whisper_schema_version: Int!
  sidecar_json:           String!
  registered_at:          Float!
  written_at:             Float!
}

"""What an update of the vault props was proven against: it lands only while the vault props standing have both."""
input SafebyokVaultPropsExpectationInput {
  vault_id:         String!
  unlock_epoch:     Int!
}

"""
What a lockbox write was written for and read: it lands only while the vault has that vault_id
and that vault_key_epoch, and the lockbox that revision_tok, or, for a null revision_tok, while
there is no lockbox there.
"""
input SafebyokLockboxExpectationInput {
  vault_id:        String!
  revision_tok:    String
  vault_key_epoch: Int!
}

"""What a retire of a vault was aimed at: it lands only while the vault has that vault_id."""
input SafebyokRetireExpectationInput {
  vault_id: String!
}

"""
What a retire of a lockbox was aimed at: it lands only while the vault has that vault_id, and
removes whatever lockbox stands; the revision_tok its writer read (null for a lockbox listed with
none) only says whether what it removed was the one meant.
"""
input SafebyokLockboxRetireExpectationInput {
  vault_id:     String!
  revision_tok: String
}

"""What a lockbox retire removed: the revision it named, another (retired_other), or nothing (absent)."""
enum SafebyokRetireOutcome {
  retired
  retired_other
  absent
}

"""What a lockbox retire that landed found under its boxlabel, and removed."""
type SafebyokLockboxRetirement {
  outcome: SafebyokRetireOutcome!
}

type Query {
  """The vault's props, or null when the vault has never been made."""
  safebyokReadVaultProps(scope: SafebyokVaultScopeInput!): SafebyokVaultProps
  """One lockbox, or null when there is none under that boxlabel."""
  safebyokReadBox(scope: SafebyokVaultScopeInput!, boxlabel: String!): SafebyokLockbox
  """Every lockbox in the vault, in any order, without its encrypted fields."""
  safebyokListBoxes(scope: SafebyokVaultScopeInput!): [SafebyokListedLockbox!]!
}

type Mutation {
  """Stores the vault props if their vault has none, and answers with whichever vault props stand there afterwards: these, or another device's already standing."""
  safebyokFetchOrCreateVaultProps(vaultProps: SafebyokVaultPropsInput!): SafebyokVaultProps!
  """Replaces the vault props, only while those standing are the ones expected."""
  safebyokUpdateVaultProps(vaultProps: SafebyokVaultPropsInput!, expected: SafebyokVaultPropsExpectationInput!): Boolean!
  """Writes the lockbox under its boxlabel, only while what stands is what was expected, and answers with the lockbox as stored."""
  safebyokUpdateBox(scope: SafebyokVaultScopeInput!, lockbox: SafebyokLockboxInput!, expected: SafebyokLockboxExpectationInput!): SafebyokLockbox!
  """Retires the lockbox under that boxlabel, removing it for good, only while the vault is the one expected, and answers with what it removed."""
  safebyokRetireBox(scope: SafebyokVaultScopeInput!, boxlabel: String!, expected: SafebyokLockboxRetireExpectationInput!): SafebyokLockboxRetirement!
  """Retires the vault, its props and every lockbox, removing them for good, only while the vault is the one expected."""
  safebyokRetireVault(scope: SafebyokVaultScopeInput!, expected: SafebyokRetireExpectationInput!): Boolean!
}

type Subscription {
  """The vault's scope whenever the vault may have changed: after every write to it, from any server and any device."""
  safebyokVaultChanged(scope: SafebyokVaultScopeInput!): SafebyokVaultScope!
}
`
