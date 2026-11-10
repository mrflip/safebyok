import { refusalkindVals } from 'safebyok/storage'

// Each operation is one vaultDB verb. It returns what the verb's `try*` form returns, as a typed
// object with any refusal in its `err` field. A GraphQL error is left for what GraphQL itself
// rejects, such as a client and server whose schemas differ. A get takes its scope as separate
// arguments, so a host's logs and allowlists show whose bank each request reaches. Three things
// are untyped JSON: a sidecar (the app's own object), a damaged row (it failed validation), and a
// refusal's meta (the few fields a server sends).

// The fields every form of a vault row has, and the fields every form of a box row has.
const vaultSparseFields = `
  applabel:      String!
  user_id:       String!
  vaultlabel:    String!
  fmt:           Int!
  revision_tok:  String!
  revision_seq:  Int!
  registered_at: SafebyokEpochMillis!
  written_at:    SafebyokEpochMillis!
  am:            String!
  vault_tok:     String!`

const boxSparseFields = `
  applabel:               String!
  user_id:                String!
  vaultlabel:             String!
  boxlabel:               String!
  fmt:                    Int!
  revision_tok:           String!
  revision_seq:           Int!
  registered_at:          SafebyokEpochMillis!
  written_at:             SafebyokEpochMillis!
  am:                     String!
  vault_tok:              String!
  box_tok:                String!
  whisper_codec:          String!
  whisper_schema_version: Int!`

// The answer fields every verb shares. `val`, `world` and `dbhas` are typed per verb.
const answerFields = `
  ok:         Boolean!
  act:        String!
  req_params: SafebyokReqParams!
  err:        SafebyokErr`

/** The GraphQL schema (SDL) for a vaultDB's verbs. Every name is prefixed `safebyok`, so it can be merged into your own schema. */
export const VaultSchemaSdl = `"""Any JSON value, passed through unchanged: a box's sidecar, a damaged row, or a refusal's meta."""
scalar SafebyokJson

"""A time in integer UTC epoch milliseconds. Any safe integer is allowed, which GraphQL's 32-bit Int cannot hold."""
scalar SafebyokEpochMillis

"""safebyok's name for the reason a call was refused."""
enum SafebyokRefusalkind {
  ${refusalkindVals.join('\n  ')}
}

"""What a get does when the row was never stored or is deleted: fail with a refusal, or return null."""
enum SafebyokIfAbsent { fail nil }

"""What a put does when the row was never stored or is deleted: add the record, or fail."""
enum SafebyokPutIfAbsent { add fail }

"""What a put does when a live row exists: replace it, fail, or return the existing row."""
enum SafebyokIfPresent { repl fail get }

# Rows

"""A wrapped key or a ciphered whisper: its IV and its ciphertext, each as base64url text."""
type SafebyokCiphered {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

"""A passphrase wayin: its key deriver's label, its salt, and the vaultKey wrapped under the passphraseKey."""
type SafebyokPassphraseWayin {
  wayinkind:               String!
  key_deriver_label:       String!
  salt_b64:                String!
  device_id:               String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCiphered!
}

"""A passkey wayin: its credential's id, its PRF salt, and the vaultKey wrapped under the passkeyKey."""
type SafebyokPasskeyWayin {
  wayinkind:               String!
  credential_id:           String!
  prf_salt_b64:            String!
  device_id:               String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCiphered!
}

"""A vault's wayins, with an epoch counter that goes up each time they change."""
type SafebyokGate {
  gate_epoch:       Int!
  passphrase_wayin: SafebyokPassphraseWayin!
  passkey_wayin:    SafebyokPasskeyWayin
}

"""A live vault row."""
type SafebyokVaultRecord {${vaultSparseFields}
  gate:          SafebyokGate!
}

"""A deleted vault row, or a placeholder for a vault that was never stored."""
type SafebyokVaultTombstone {${vaultSparseFields}
}

"""A live box row."""
type SafebyokBoxRecord {${boxSparseFields}
  sidecar:                SafebyokJson!
  box_key_wrapped:        SafebyokCiphered!
  whisper_ciphered:       SafebyokCiphered!
}

"""A deleted box row, or a placeholder for a box that was never stored."""
type SafebyokBoxTombstone {${boxSparseFields}
}

"""A box row as listed, live or deleted, without its sidecar or its ciphered fields."""
type SafebyokBoxSparse {${boxSparseFields}
}

union SafebyokVaultRow = SafebyokVaultRecord | SafebyokVaultTombstone
union SafebyokBoxRow   = SafebyokBoxRecord | SafebyokBoxTombstone
union SafebyokRow      = SafebyokVaultRecord | SafebyokVaultTombstone | SafebyokBoxRecord | SafebyokBoxTombstone

"""The scope of a bank: the app's label and the user's id."""
type SafebyokBankScope {
  applabel: String!
  user_id:  String!
}

"""A row's revision: its token and its sequence number."""
type SafebyokRevision {
  revision_tok: String!
  revision_seq: Int!
}

# Answers

"""The scope, tokens and revision of a request. A field is null when the request did not have it."""
type SafebyokReqParams {
  applabel:     String
  user_id:      String
  vaultlabel:   String
  boxlabel:     String
  vault_tok:    String
  box_tok:      String
  revision_tok: String
  revision_seq: Int
  prior:        SafebyokRevision
}

"""A refusal: its kind and its message. Its meta may carry capacity, fieldnames and call."""
type SafebyokErr {
  refusalkind: SafebyokRefusalkind!
  message:     String!
  meta:        SafebyokJson
}

"""A bank's vaults, live or deleted, plus any rows that failed validation."""
type SafebyokBankListed {
  vaults:       [SafebyokVaultRow!]!
  damaged_rows: [SafebyokJson!]!
}

"""A vault's boxes in sparse form, plus any rows that failed validation."""
type SafebyokBoxesListed {
  boxes:        [SafebyokBoxSparse!]!
  damaged_rows: [SafebyokJson!]!
}

"""The answer to listVaults: val and the bank's scope on success, err on a refusal."""
type SafebyokBankListedAnswer {${answerFields}
  val:        SafebyokBankListed
  world:      SafebyokBankScope
}

"""The answer to listBoxes: val and the vault row on success, err on a refusal."""
type SafebyokBoxesListedAnswer {${answerFields}
  val:        SafebyokBoxesListed
  world:      SafebyokVaultRow
  dbhas:      SafebyokVaultRow
}

"""The answer to a vault verb: val and the vault row on success, err on a refusal."""
type SafebyokVaultAnswer {${answerFields}
  val:        SafebyokVaultRow
  world:      SafebyokVaultRow
  dbhas:      SafebyokVaultRow
}

"""The answer to a box verb: val and the vault row on success, err on a refusal."""
type SafebyokBoxAnswer {${answerFields}
  val:        SafebyokBoxRow
  world:      SafebyokVaultRow
  dbhas:      SafebyokRow
}

"""The result of tidyGone: the number of box rows left in the bank."""
type SafebyokTidied {
  totalCount: Int!
}

"""The answer to tidyGone: val and the bank's scope on success, err on a refusal."""
type SafebyokTidiedAnswer {${answerFields}
  val:        SafebyokTidied
  world:      SafebyokBankScope
}

"""A watch notice: the row that changed and its vault row, or the err that ends the watch."""
type SafebyokNotice {
  ok:    Boolean!
  act:   String!
  val:   SafebyokRow
  world: SafebyokVaultRow
  err:   SafebyokErr
}

# Inputs

input SafebyokCipheredInput {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

input SafebyokPassphraseWayinInput {
  wayinkind:               String!
  key_deriver_label:       String!
  salt_b64:                String!
  device_id:               String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCipheredInput!
}

input SafebyokPasskeyWayinInput {
  wayinkind:               String!
  credential_id:           String!
  prf_salt_b64:            String!
  device_id:               String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCipheredInput!
}

input SafebyokGateInput {
  gate_epoch:       Int!
  passphrase_wayin: SafebyokPassphraseWayinInput!
  passkey_wayin:    SafebyokPasskeyWayinInput
}

input SafebyokVaultRecordInput {${vaultSparseFields}
  gate:          SafebyokGateInput!
}

input SafebyokVaultTombstoneInput {${vaultSparseFields}
}

input SafebyokBoxRecordInput {${boxSparseFields}
  sidecar:                SafebyokJson!
  box_key_wrapped:        SafebyokCipheredInput!
  whisper_ciphered:       SafebyokCipheredInput!
}

input SafebyokBoxTombstoneInput {${boxSparseFields}
}

input SafebyokRevisionInput {
  revision_tok: String!
  revision_seq: Int!
}

"""Options for a get. An omitted option takes safebyok's default."""
input SafebyokIfAbsentOptsInput {
  ifAbsent: SafebyokIfAbsent
}

"""Options for a put: the revision the record was made from, and its policies. An omitted policy takes safebyok's default."""
input SafebyokPutOptsInput {
  prior:     SafebyokRevisionInput!
  ifAbsent:  SafebyokPutIfAbsent
  ifPresent: SafebyokIfPresent
}

"""Options for a gate verb: the revision its record was made from."""
input SafebyokGateVerbOptsInput {
  prior: SafebyokRevisionInput!
}

"""Options for a del: the revision its tombstone was made from."""
input SafebyokDelOptsInput {
  prior: SafebyokRevisionInput!
}

# Operations

type Query {
  safebyokListVaults(applabel: String!, user_id: String!): SafebyokBankListedAnswer!
  safebyokGetVault(applabel: String!, user_id: String!, vaultlabel: String!, opts: SafebyokIfAbsentOptsInput): SafebyokVaultAnswer!
  safebyokListBoxes(applabel: String!, user_id: String!, vaultlabel: String!, vault_tok: String!): SafebyokBoxesListedAnswer!
  safebyokGetBox(applabel: String!, user_id: String!, vaultlabel: String!, boxlabel: String!, vault_tok: String!, opts: SafebyokIfAbsentOptsInput): SafebyokBoxAnswer!
}

type Mutation {
  safebyokPutVault(record: SafebyokVaultRecordInput!, opts: SafebyokPutOptsInput!): SafebyokVaultAnswer!
  safebyokPutBox(record: SafebyokBoxRecordInput!, opts: SafebyokPutOptsInput!): SafebyokBoxAnswer!
  safebyokReplacePassphrase(record: SafebyokVaultRecordInput!, opts: SafebyokGateVerbOptsInput!): SafebyokVaultAnswer!
  safebyokAddPasskey(record: SafebyokVaultRecordInput!, opts: SafebyokGateVerbOptsInput!): SafebyokVaultAnswer!
  safebyokRevokePasskey(record: SafebyokVaultRecordInput!, opts: SafebyokGateVerbOptsInput!): SafebyokVaultAnswer!
  safebyokDelBox(tombstone: SafebyokBoxTombstoneInput!, opts: SafebyokDelOptsInput!): SafebyokBoxAnswer!
  safebyokDelVault(tombstone: SafebyokVaultTombstoneInput!, opts: SafebyokDelOptsInput!): SafebyokVaultAnswer!
  safebyokTidyGone(applabel: String!, user_id: String!): SafebyokTidiedAnswer!
}

type Subscription {
  """Subscribe to row changes in a bank, or in one of its vaults when vaultlabel is given."""
  safebyokWatch(applabel: String!, user_id: String!, vaultlabel: String): SafebyokNotice!
}
`
