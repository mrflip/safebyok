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
One unlock envelope of a vault, as safebyok stored it: JSON, its \`method\` saying its shape, its
vaultKey wrapped (\`vault_key_wrapped\`). Carried as it is, never looked inside.
"""
scalar SafebyokUnlockEnvelope

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
A vault's bundle, as stored: its scope, its vault_id, and its unlock envelopes, each wrapping the
one vaultKey. Times are epoch milliseconds.
"""
type SafebyokVaultBundle {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_id:         String!
  unlock_epoch:     Int!
  vault_key_epoch:  Int!
  prior_vault_key:  SafebyokPriorVaultKey
  unlocks:          [SafebyokUnlockEnvelope!]!
  registered_at:    Float!
}

"""A vault's bundle, as stored. Times are epoch milliseconds."""
input SafebyokVaultBundleInput {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_id:         String!
  unlock_epoch:     Int!
  vault_key_epoch:  Int!
  prior_vault_key:  SafebyokPriorVaultKey
  unlocks:          [SafebyokUnlockEnvelope!]!
  registered_at:    Float!
}

"""
One lockbox, as stored: its whisper encrypted under its lockboxKey, that lockboxKey wrapped under
the vaultKey, and its public shell. Times are epoch milliseconds; the public bag is the JSON text
it was written as, which is bound into the lockbox's encryption.
"""
type SafebyokLockbox {
  format:                 String!
  boxlabel:               String!
  revision_id:            String!
  vault_key_epoch:        Int!
  lockbox_key_wrapped:    SafebyokCiphered!
  whisper_ciphered:       SafebyokCiphered!
  whisper_codec:          String!
  whisper_schema_version: Int!
  public_json:            String!
  registered_at:          Float!
  changed_at:             Float!
}

"""One lockbox, as stored. Times are epoch milliseconds; the public bag is its JSON text."""
input SafebyokLockboxInput {
  format:                 String!
  boxlabel:               String!
  revision_id:            String!
  vault_key_epoch:        Int!
  lockbox_key_wrapped:    SafebyokCipheredInput!
  whisper_ciphered:       SafebyokCipheredInput!
  whisper_codec:          String!
  whisper_schema_version: Int!
  public_json:            String!
  registered_at:          Float!
  changed_at:             Float!
}

"""A lockbox as a listing has it: every field but the two encrypted ones."""
type SafebyokListedLockbox {
  format:                 String!
  boxlabel:               String!
  revision_id:            String!
  vault_key_epoch:        Int!
  whisper_codec:          String!
  whisper_schema_version: Int!
  public_json:            String!
  registered_at:          Float!
  changed_at:             Float!
}

"""What a bundle update was proven against: it lands only while the standing bundle has both."""
input SafebyokBundleExpectationInput {
  vault_id:         String!
  unlock_epoch:     Int!
}

"""
What a lockbox write was written for and read: it lands only while the vault has that vault_id
and that vault_key_epoch, and the lockbox that revision_id, or, for a null revision_id, while
there is no lockbox there.
"""
input SafebyokLockboxExpectationInput {
  vault_id:        String!
  revision_id:     String
  vault_key_epoch: Int!
}

"""What an erase was aimed at: it lands only while the vault has that vault_id."""
input SafebyokEraseExpectationInput {
  vault_id: String!
}

type Query {
  """The vault's bundle, or null when the vault has never been made."""
  safebyokReadBundle(scope: SafebyokVaultScopeInput!): SafebyokVaultBundle
  """One lockbox, or null when there is none under that boxlabel."""
  safebyokReadBox(scope: SafebyokVaultScopeInput!, boxlabel: String!): SafebyokLockbox
  """Every lockbox in the vault, in any order, without its encrypted fields."""
  safebyokListBoxes(scope: SafebyokVaultScopeInput!): [SafebyokListedLockbox!]!
}

type Mutation {
  """Stores the bundle if its vault has none, and answers with whichever bundle stands there after."""
  safebyokCreateBundle(bundle: SafebyokVaultBundleInput!): SafebyokVaultBundle!
  """Replaces the bundle, only while the standing one is the one expected."""
  safebyokUpdateBundle(bundle: SafebyokVaultBundleInput!, expected: SafebyokBundleExpectationInput!): Boolean!
  """Writes the lockbox under its boxlabel, only while what stands is what was expected."""
  safebyokUpdateBox(scope: SafebyokVaultScopeInput!, lockbox: SafebyokLockboxInput!, expected: SafebyokLockboxExpectationInput!): Boolean!
  """Erases the lockbox under that boxlabel, only while the vault is the one expected."""
  safebyokEraseBox(scope: SafebyokVaultScopeInput!, boxlabel: String!, expected: SafebyokEraseExpectationInput!): Boolean!
  """Erases the bundle and every lockbox, only while the vault is the one expected."""
  safebyokEraseVault(scope: SafebyokVaultScopeInput!, expected: SafebyokEraseExpectationInput!): Boolean!
}

type Subscription {
  """The vault's scope whenever the vault may have changed: after every write to it, from any server and any device."""
  safebyokVaultChanged(scope: SafebyokVaultScopeInput!): SafebyokVaultScope!
}
`
