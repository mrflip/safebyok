import { refusalkindVals } from 'safebyok/storage'

// Each operation is one of a vaultDB's verbs, and answers what its `try*` form answers, as a
// typed object whose refusal is its `err` field: a GraphQL error is left to what GraphQL itself
// refuses, a wire out of step. Scopes are arguments of their own on a get, so a host's logs and
// allowlists see whose bank each one reaches. A sidecar, a damaged row and a refusal's meta are
// JSON: the app's own object, a row past reading, and the few fields a server lets cross.

// The fields a vault row's every form has, and a box row's.
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

// The fields of an answer every verb shares; `val`, `world` and `dbhas` are typed per verb.
const answerFields = `
  ok:         Boolean!
  act:        String!
  req_params: SafebyokReqParams!
  err:        SafebyokErr`

/** The SDL of the GraphQL schema a vaultDB's verbs cross by, every name in it prefixed `safebyok` to sit beside your own. */
export const VaultSchemaSdl = `"""A JSON value carried whole: a box's sidecar, a damaged row, or a refusal's meta."""
scalar SafebyokJson

"""A time as integer UTC epoch milliseconds: any safe integer, beyond GraphQL's 32-bit Int."""
scalar SafebyokEpochMillis

"""Why a call refused, as safebyok names it."""
enum SafebyokRefusalkind {
  ${refusalkindVals.join('\n  ')}
}

"""What a get does over a row never stored or deleted: fail with its refusal, or answer null."""
enum SafebyokIfAbsent { fail nil }

"""What a put does over a row never stored or deleted: add the record, or fail."""
enum SafebyokPutIfAbsent { add fail }

"""What a box's put does over a live row: replace it, fail, or get it."""
enum SafebyokIfPresent { repl fail get }

"""What a vault's put does over a live row: fail, or get it."""
enum SafebyokPutVaultIfPresent { fail get }

# Rows

"""A wrapped key or a ciphered whisper: its cipher_iv and its ciphertext, each base64url text."""
type SafebyokCiphered {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

"""The wayin a passphrase opens: its key deriver, its salt, and the vaultKey wrapped under it."""
type SafebyokPassphraseWayin {
  wayinkind:               String!
  key_deriver_label:       String!
  salt_b64:                String!
  device_id:               String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCiphered!
}

"""The wayin a passkey opens: its credential, its PRF salt, and the vaultKey wrapped under it."""
type SafebyokPasskeyWayin {
  wayinkind:               String!
  credential_id:           String!
  prf_salt_b64:            String!
  device_id:               String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCiphered!
}

"""A vault's wayins, and the epoch each change of them moves up."""
type SafebyokGate {
  gate_epoch:       Int!
  passphrase_wayin: SafebyokPassphraseWayin!
  passkey_wayin:    SafebyokPasskeyWayin
}

"""A live vault row."""
type SafebyokVaultRecord {${vaultSparseFields}
  gate:          SafebyokGate!
}

"""A deleted vault row, or the stand-in for one never stored."""
type SafebyokVaultTombstone {${vaultSparseFields}
}

"""A live box row."""
type SafebyokBoxRecord {${boxSparseFields}
  sidecar:                SafebyokJson!
  box_key_wrapped:        SafebyokCiphered!
  whisper_ciphered:       SafebyokCiphered!
}

"""A deleted box row, or the stand-in for one never stored."""
type SafebyokBoxTombstone {${boxSparseFields}
}

"""A box row as a listing has it, live or deleted, without its sidecar or its ciphered fields."""
type SafebyokBoxSparse {${boxSparseFields}
}

union SafebyokVaultRow = SafebyokVaultRecord | SafebyokVaultTombstone
union SafebyokBoxRow   = SafebyokBoxRecord | SafebyokBoxTombstone
union SafebyokRow      = SafebyokVaultRecord | SafebyokVaultTombstone | SafebyokBoxRecord | SafebyokBoxTombstone

"""A bank's names: the app's label and the user's id."""
type SafebyokBankScope {
  applabel: String!
  user_id:  String!
}

"""A row's revision: its token and its counter."""
type SafebyokRevision {
  revision_tok: String!
  revision_seq: Int!
}

# Answers

"""A request's scope, tokens and revision, each null where the request had none."""
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

"""A refusal: its kind, its message, and in meta the capacity, fieldnames and call it reports."""
type SafebyokErr {
  refusalkind: SafebyokRefusalkind!
  message:     String!
  meta:        SafebyokJson
}

"""A bank's vaults, live or deleted, and the rows past reading."""
type SafebyokBankListed {
  vaults:       [SafebyokVaultRow!]!
  damaged_rows: [SafebyokJson!]!
}

"""A vault's boxes, sparse, and the rows past reading."""
type SafebyokBoxesListed {
  boxes:        [SafebyokBoxSparse!]!
  damaged_rows: [SafebyokJson!]!
}

"""What listVaults answers: its val and the bank, or its err."""
type SafebyokBankListedAnswer {${answerFields}
  val:        SafebyokBankListed
  world:      SafebyokBankScope
}

"""What listBoxes answers: its val and the vault row, or its err."""
type SafebyokBoxesListedAnswer {${answerFields}
  val:        SafebyokBoxesListed
  world:      SafebyokVaultRow
  dbhas:      SafebyokVaultRow
}

"""What a vault's verb answers: its val and the vault row, or its err."""
type SafebyokVaultAnswer {${answerFields}
  val:        SafebyokVaultRow
  world:      SafebyokVaultRow
  dbhas:      SafebyokVaultRow
}

"""What a box's verb answers: its val and the vault row, or its err."""
type SafebyokBoxAnswer {${answerFields}
  val:        SafebyokBoxRow
  world:      SafebyokVaultRow
  dbhas:      SafebyokRow
}

"""A bank tidied: the box rows left in it."""
type SafebyokTidied {
  totalCount: Int!
}

"""What tidyGone answers: its val and the bank, or its err."""
type SafebyokTidiedAnswer {${answerFields}
  val:        SafebyokTidied
  world:      SafebyokBankScope
}

"""A row that changed and its vault row, or the err that ends the watch."""
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

"""A get's options, each left out taking safebyok's default."""
input SafebyokIfAbsentOptsInput {
  ifAbsent: SafebyokIfAbsent
}

"""A box's put options: the revision it was made from, and each policy left out taking safebyok's default."""
input SafebyokPutOptsInput {
  prior:     SafebyokRevisionInput!
  ifAbsent:  SafebyokPutIfAbsent
  ifPresent: SafebyokIfPresent
}

"""A vault's put options: the revision it was made from, and each policy left out taking safebyok's default."""
input SafebyokPutVaultOptsInput {
  prior:     SafebyokRevisionInput!
  ifAbsent:  SafebyokPutIfAbsent
  ifPresent: SafebyokPutVaultIfPresent
}

"""A gate verb's options: the revision its record was made from."""
input SafebyokGateVerbOptsInput {
  prior: SafebyokRevisionInput!
}

"""A del's options: the revision it was made from."""
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
  safebyokPutVault(record: SafebyokVaultRecordInput!, opts: SafebyokPutVaultOptsInput!): SafebyokVaultAnswer!
  safebyokPutBox(record: SafebyokBoxRecordInput!, opts: SafebyokPutOptsInput!): SafebyokBoxAnswer!
  safebyokReplacePassphrase(record: SafebyokVaultRecordInput!, opts: SafebyokGateVerbOptsInput!): SafebyokVaultAnswer!
  safebyokAddPasskey(record: SafebyokVaultRecordInput!, opts: SafebyokGateVerbOptsInput!): SafebyokVaultAnswer!
  safebyokRevokePasskey(record: SafebyokVaultRecordInput!, opts: SafebyokGateVerbOptsInput!): SafebyokVaultAnswer!
  safebyokDelBox(tombstone: SafebyokBoxTombstoneInput!, opts: SafebyokDelOptsInput!): SafebyokBoxAnswer!
  safebyokDelVault(tombstone: SafebyokVaultTombstoneInput!, opts: SafebyokDelOptsInput!): SafebyokVaultAnswer!
  safebyokTidyGone(applabel: String!, user_id: String!): SafebyokTidiedAnswer!
}

type Subscription {
  """Each row that changes in the bank, or in one vault of it."""
  safebyokWatch(applabel: String!, user_id: String!, vaultlabel: String): SafebyokNotice!
}
`
