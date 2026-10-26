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
A record as storage holds it, sound or damaged, or null for none: JSON, carried as it is, never
looked inside. It travels in a write's answer, never in an error's \`extensions\`, which GraphQL
servers, gateways and APM tools commonly log.
"""
scalar SafebyokStoredRecord

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

"""
A vault's gate, as stored: its two ways in, each wrapping the one vaultKey: its passphrase, and
its passkey, null when it has none.
"""
type SafebyokGate {
  passphrase:       SafebyokWayin!
  passkey:          SafebyokWayin
}

"""A vault's gate, as stored: its passphrase, and its passkey or null."""
input SafebyokGateInput {
  passphrase:       SafebyokWayin!
  passkey:          SafebyokWayin
}

"""
A vault's record, as stored: its scope, its vault_tok, its vault_epoch (a counter its storage
moves), its gate_epoch, and its gate, null while the vault is novel (gate_epoch 0). Times are
epoch milliseconds.
"""
type SafebyokVaultRecord {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_tok:        String!
  registered_at:    Float!
  vault_epoch:      Int!
  gate_epoch:       Int!
  gate:             SafebyokGate
}

"""A vault's record, as stored. Times are epoch milliseconds. A vault_epoch sent is ignored: the storage moves it."""
input SafebyokVaultRecordInput {
  format:           String!
  applabel:         String!
  user_id:          String!
  vaultlabel:       String!
  vault_tok:        String!
  registered_at:    Float!
  vault_epoch:      Int!
  gate_epoch:       Int!
  gate:             SafebyokGateInput
}

"""What a deleted vault leaves in its scope: its counter, which the next vault made there carries on."""
type SafebyokVaultTombstone {
  format:       String!
  applabel:     String!
  user_id:      String!
  vaultlabel:   String!
  vault_epoch:  Int!
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

"""A vault as its storage read it in one step: its record, and every box as a listing has it."""
type SafebyokVault {
  vaultProps: SafebyokVaultRecord!
  boxes:      [SafebyokListedBox!]!
}

"""What an update of the vault record was proven against: it lands only while the vault record standing has both."""
input SafebyokVaultRecordExpectationInput {
  vault_tok:        String!
  gate_epoch:       Int!
}

"""
What a box read was meant for: it reads the box only while the vault has that vault_tok, and
is refused as vault_mismatch otherwise, the vault deleted or made anew since the reader read it.
"""
input SafebyokBoxGetExpectationInput {
  vault_tok:    String!
}

"""
What a box write was written for and read: it lands only while the vault has that vault_tok,
and the box that revision_tok, or, for a null revision_tok, while there is no box there.
"""
input SafebyokBoxExpectationInput {
  vault_tok:    String!
  revision_tok: String
}

"""
What a delete of a vault was aimed at: it lands only while the vault has that vault_tok and
gate_epoch. A null gate_epoch is for deleting a vault whose record is damaged, and expects the
vault_tok alone.
"""
input SafebyokVaultDelExpectationInput {
  vault_tok:  String!
  gate_epoch: Int
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

"""
What an update of the vault record answered. It \`landed\`, and \`vault_props_stored\` is the vault
record as stored, its vault_epoch moved up by one; or it was refused and nothing was written:
\`refusalkind\` and \`message\` say why, and for a \`stale_write\` \`vault_props_stored\` carries the vault
record standing, whole, or null when none stands. It holds the ways in, so it rides in this body,
never in an error's \`extensions\`.
"""
type SafebyokPutVaultPropsAnswer {
  landed:             Boolean!
  refusalkind:        String
  message:            String
  vault_props_stored: SafebyokStoredRecord
}

"""
What a box write answered. It \`landed\`, and \`box_stored\` is the box as stored; or it was refused and
nothing was written: \`refusalkind\` and \`message\` say why, and \`box_stored\` is the box standing
under that boxlabel for a \`stale_write\` (sound or damaged, or null for none), \`capacity\` how full
the vault is for a \`vault_full\`. A refusal of any other kind crosses as a GraphQL error.
"""
type SafebyokPutBoxAnswer {
  landed:      Boolean!
  refusalkind: String
  message:     String
  box_stored:  SafebyokStoredRecord
  capacity:    SafebyokCapacity
}

type Query {
  """The vault's record and every box, read in one step, or null when the vault has never been made."""
  safebyokGetVault(applabel: String!, user_id: String!, vaultlabel: String!): SafebyokVault
  """One box, or null when there is none under that boxlabel, read only while the vault is the one expected."""
  safebyokGetBox(applabel: String!, user_id: String!, vaultlabel: String!, boxlabel: String!, expected: SafebyokBoxGetExpectationInput!): SafebyokBox
  """How full the vault is, as its storage reckons it; nothing used for a vault never made."""
  safebyokGetCapacity(applabel: String!, user_id: String!, vaultlabel: String!): SafebyokCapacity!
}

type Mutation {
  """Stores the gateless draft if its vault has none, and answers with the vault standing afterwards, its record and every box, from one step: these, or another device's already standing. Over a tombstone it starts a new life, the counter carried on."""
  safebyokEnsureVault(draft: SafebyokVaultRecordInput!): SafebyokVault!
  """Replaces the vault record, its gate with it, only while the one standing is the one expected, and answers with the vault record as stored when it landed, or the one standing when it did not."""
  safebyokPutVaultProps(vaultProps: SafebyokVaultRecordInput!, expected: SafebyokVaultRecordExpectationInput!): SafebyokPutVaultPropsAnswer!
  """Writes the box under its boxlabel, only while what stands is what was expected, and answers with the box as stored, or why it was refused and what stands."""
  safebyokPutBox(applabel: String!, user_id: String!, vaultlabel: String!, box: SafebyokBoxInput!, expected: SafebyokBoxExpectationInput!): SafebyokPutBoxAnswer!
  """Deletes the box under that boxlabel, removing it for good, only while the vault is the one expected, and answers with what it removed."""
  safebyokDelBox(applabel: String!, user_id: String!, vaultlabel: String!, boxlabel: String!, expected: SafebyokBoxDelExpectationInput!): SafebyokBoxDeletion!
  """Deletes the vault, its record and every box, removing them for good, only while the vault is the one expected, and answers with the tombstone it leaves."""
  safebyokDelVault(applabel: String!, user_id: String!, vaultlabel: String!, expected: SafebyokVaultDelExpectationInput!): SafebyokVaultTombstone!
}

type Subscription {
  """The vault's scope whenever the vault may have changed: after every write to it, from any server and any device."""
  safebyokVaultChanged(applabel: String!, user_id: String!, vaultlabel: String!): SafebyokVaultScope!
}
`
