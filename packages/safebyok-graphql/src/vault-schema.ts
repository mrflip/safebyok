/** The GraphQL schema safebyok's verbs cross by, as SDL: a root field per VaultDB verb, and a subscription that says when a vault changed.
 * Hand it to your GraphQL server beside your own type definitions, with `vaultResolvers` beside
 * your own resolvers. Everything it adds is named `safebyok...` or `Safebyok...`, so it meets
 * nothing of yours.
 *
 * It defines `type Query`, `type Mutation` and `type Subscription`. Yoga's `createSchema`, Apollo
 * Server and graphql-tools' `makeExecutableSchema` merge it with your own root types when the type
 * definitions go in as a list.
 *
 * @example createSchema({ typeDefs: [appTypeDefs, VaultSchemaSdl], resolvers: [appResolvers, vaultResolvers({ vaultDBFor })] })
 */
export const VaultSchemaSdl = `"""
One way into a vault, its passphrase or its passkey, as safebyok stored it: JSON, its
\`wayinkind\` saying its shape, its vaultKey wrapped (\`vault_key_wayin_wrapped\`). Carried as
it is, never looked inside.
"""
scalar SafebyokWayin

"""
A box's sidecar: the app's own JSON object, {} for none, carried as it is, never looked inside.
"""
scalar SafebyokSidecar

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
A vault's props, as stored: its scope, its vault_tok, and its two ways in, each wrapping the
one vaultKey: its passphrase, and its passkey, null when it has none. Times are epoch milliseconds.
"""
type SafebyokVaultProps {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_tok:        String!
  gate_epoch:       Int!
  passphrase:       SafebyokWayin!
  passkey:          SafebyokWayin
  registered_at:    Float!
}

"""A vault's props, as stored. Times are epoch milliseconds."""
input SafebyokVaultPropsInput {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_tok:        String!
  gate_epoch:       Int!
  passphrase:       SafebyokWayin!
  passkey:          SafebyokWayin
  registered_at:    Float!
}

"""
One box, as stored: its whisper encrypted under its boxKey, that boxKey wrapped under
the vaultKey, and its visible fields. Times are epoch milliseconds; the sidecar is the app's own
JSON object, bound into the box's encryption.
"""
type SafebyokBox {
  format:                 String!
  boxlabel:               String!
  revision_tok:           String!
  box_key_wrapped:        SafebyokCiphered!
  whisper_ciphered:       SafebyokCiphered!
  whisper_codec:          String!
  whisper_schema_version: Int!
  sidecar:                SafebyokSidecar!
  registered_at:          Float!
  written_at:             Float!
}

"""One box, as stored. Times are epoch milliseconds; the sidecar is the app's own JSON object."""
input SafebyokBoxInput {
  format:                 String!
  boxlabel:               String!
  revision_tok:           String!
  box_key_wrapped:        SafebyokCipheredInput!
  whisper_ciphered:       SafebyokCipheredInput!
  whisper_codec:          String!
  whisper_schema_version: Int!
  sidecar:                SafebyokSidecar!
  registered_at:          Float!
  written_at:             Float!
}

"""A box as a listing has it: every field but the two encrypted ones."""
type SafebyokListedBox {
  format:                 String!
  boxlabel:               String!
  revision_tok:           String!
  whisper_codec:          String!
  whisper_schema_version: Int!
  sidecar:                SafebyokSidecar!
  registered_at:          Float!
  written_at:             Float!
}

"""What an update of the vault props was proven against: it lands only while the vault props standing have both."""
input SafebyokVaultPropsExpectationInput {
  vault_tok:        String!
  gate_epoch:       Int!
}

"""
What a box write was written for and read: it lands only while the vault has that vault_tok,
and the box that revision_tok, or, for a null revision_tok, while there is no box there.
"""
input SafebyokBoxExpectationInput {
  vault_tok:    String!
  revision_tok: String
}

"""What a delete of a vault was aimed at: it lands only while the vault has that vault_tok."""
input SafebyokVaultDelExpectationInput {
  vault_tok: String!
}

"""
What a delete of a box was aimed at: it lands only while the vault has that vault_tok, and
removes whatever box stands; the revision_tok its writer read (null for a box listed with
none) only says whether what it removed was the one meant.
"""
input SafebyokBoxDelExpectationInput {
  vault_tok:    String!
  revision_tok: String
}

"""What a box delete removed: the revision it named, another (deleted_other), or nothing (absent)."""
enum SafebyokDelOutcome {
  deleted
  deleted_other
  absent
}

"""What a box delete that landed found under its boxlabel, and removed."""
type SafebyokBoxDeletion {
  outcome: SafebyokDelOutcome!
}

"""How much of one limit a vault has used, against the most its storage holds: whole numbers, each up to 2^53."""
type SafebyokRoom {
  used: Float!
  max: Float!
}

"""How full a vault is, as its storage reckons it: its boxes, and the bytes they take."""
type SafebyokCapacity {
  boxes: SafebyokRoom!
  bytes: SafebyokRoom!
}

type Query {
  """The vault's props, or null when the vault has never been made."""
  safebyokGetVaultProps(scope: SafebyokVaultScopeInput!): SafebyokVaultProps
  """One box, or null when there is none under that boxlabel."""
  safebyokGetBox(scope: SafebyokVaultScopeInput!, boxlabel: String!): SafebyokBox
  """Every box in the vault, in any order, without its encrypted fields."""
  safebyokListBoxes(scope: SafebyokVaultScopeInput!): [SafebyokListedBox!]!
  """How full the vault is, as its storage reckons it; nothing used for a vault never made."""
  safebyokGetCapacity(scope: SafebyokVaultScopeInput!): SafebyokCapacity!
}

type Mutation {
  """Stores the vault props if their vault has none, and answers with whichever vault props stand there afterwards: these, or another device's already standing."""
  safebyokEnsureVaultProps(vaultProps: SafebyokVaultPropsInput!): SafebyokVaultProps!
  """Replaces the vault props, only while those standing are the ones expected."""
  safebyokPutVaultProps(vaultProps: SafebyokVaultPropsInput!, expected: SafebyokVaultPropsExpectationInput!): Boolean!
  """Writes the box under its boxlabel, only while what stands is what was expected, and answers with the box as stored."""
  safebyokPutBox(scope: SafebyokVaultScopeInput!, box: SafebyokBoxInput!, expected: SafebyokBoxExpectationInput!): SafebyokBox!
  """Deletes the box under that boxlabel, removing it for good, only while the vault is the one expected, and answers with what it removed."""
  safebyokDelBox(scope: SafebyokVaultScopeInput!, boxlabel: String!, expected: SafebyokBoxDelExpectationInput!): SafebyokBoxDeletion!
  """Deletes the vault, its props and every box, removing them for good, only while the vault is the one expected."""
  safebyokDelVault(scope: SafebyokVaultScopeInput!, expected: SafebyokVaultDelExpectationInput!): Boolean!
}

type Subscription {
  """The vault's scope whenever the vault may have changed: after every write to it, from any server and any device."""
  safebyokVaultChanged(scope: SafebyokVaultScopeInput!): SafebyokVaultScope!
}
`
