import { refusalkindVals } from 'safebyok/storage'

// Each operation is one bankDB verb. It returns what the verb's `try*` form returns, as a typed
// object with any refusal in its `err` field. A GraphQL error is left for what GraphQL itself
// rejects, such as a client and server whose schemas differ. A verb that stores a row, or gets one,
// takes its ask as one input whose fields are the ask's; ensureBank, listBoxes and tidyGone take
// their scope as separate arguments, so a host's logs and allowlists show whose bank each request
// reaches. Four things are untyped JSON: a sidecar (the app's own object), a damaged row (it failed
// validation), a refusal's meta (the few fields a server sends), and a gate's `auth`, `sigs` and
// `meta` (kept for later, always empty).

// The fields of a bank row and of a vault row, each the same live or deleted, of a gate row besides its wayins, and of every form of a box row.
const bankFields = `
  user_id:       String!
  banklabel:     String!
  fmt:           Int!
  revision_tok:  String!
  revision_seq:  Int!
  registered_at: SafebyokEpochMillis!
  written_at:    SafebyokEpochMillis!
  am:            String!
  bank_tok:      String!`

const vaultFields = `
  user_id:       String!
  banklabel:     String!
  vaultlabel:    String!
  fmt:           Int!
  revision_tok:  String!
  revision_seq:  Int!
  registered_at: SafebyokEpochMillis!
  written_at:    SafebyokEpochMillis!
  am:            String!
  bank_tok:      String!
  vault_tok:     String!`

const gateFields = `
  user_id:       String!
  banklabel:     String!
  gatelabel:     String!
  fmt:           Int!
  revision_tok:  String!
  revision_seq:  Int!
  registered_at: SafebyokEpochMillis!
  written_at:    SafebyokEpochMillis!
  am:            String!
  bank_tok:      String!
  gate_tok:      String!
  auth:          SafebyokJson!
  sigs:          SafebyokJson!
  meta:          SafebyokJson!`

const boxSparseFields = `
  user_id:                String!
  banklabel:              String!
  vaultlabel:             String!
  boxlabel:               String!
  fmt:                    Int!
  revision_tok:           String!
  revision_seq:           Int!
  registered_at:          SafebyokEpochMillis!
  written_at:             SafebyokEpochMillis!
  am:                     String!
  bank_tok:               String!
  vault_tok:              String!
  box_tok:                String!
  whisper_codec:          String!
  whisper_schema_version: Int!`

// The answer fields every verb shares. `val`, `parent` and `dbhas` are typed per verb.
const answerFields = `
  ok:         Boolean!
  act:        String!
  ask:        SafebyokAsk!
  err:        SafebyokErr`

/** The GraphQL schema (SDL) for a bankDB's verbs. Every name is prefixed `safebyok`, so it can be merged into your own schema. */
export const BankSchemaSdl = `"""Any JSON value, passed through unchanged: a box's sidecar, a damaged row, a refusal's meta, or a gate's empty auth, sigs and meta."""
scalar SafebyokJson

"""A time in integer UTC epoch milliseconds. Any safe integer is allowed, which GraphQL's 32-bit Int cannot represent."""
scalar SafebyokEpochMillis

"""safebyok's name for the reason a call was refused."""
enum SafebyokRefusalkind {
  ${refusalkindVals.join('\n  ')}
}

"""The verb an ask is for: a get, a put, a del, or the build of a bank."""
enum SafebyokOp { get put del build }

"""A get's policy for a row that was never stored or is deleted: fail with a refusal, or return null."""
enum SafebyokIfAbsent { fail nil }

"""A put's policy for a row that was never stored or is deleted: add the record, or fail."""
enum SafebyokPutIfAbsent { add fail }

"""A put's policy for a live row: replace it, fail, or return the existing row."""
enum SafebyokIfPresent { repl fail get }

"""The gate verb a gate's put is for. The server's bankDB applies that verb's checks to the gate row it replaces."""
enum SafebyokGateVerb { replacePassphrase addPasskey revokePasskey }

# Rows

"""A wrapped key or a ciphered whisper: its IV and its ciphertext, each as base64url text."""
type SafebyokCiphered {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

"""A passphrase wayin: its key deriver's label, its salt, and the vaultKey wrapped under the passphraseKey."""
type SafebyokPassphraseWayin {
  wayinlabel:              String!
  wayinkind:               String!
  key_deriver_label:       String!
  salt_b64:                String!
  device_tok:              String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCiphered!
}

"""A passkey wayin: its credential's id, its PRF salt, and the vaultKey wrapped under the passkeyKey."""
type SafebyokPasskeyWayin {
  wayinlabel:              String!
  wayinkind:               String!
  credential_id:           String!
  prf_salt_b64:            String!
  device_tok:              String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCiphered!
}

"""A gate's wayins: its passphrase wayin, and its passkey wayin if it has one."""
type SafebyokWayins {
  main:     SafebyokPassphraseWayin!
  passkey0: SafebyokPasskeyWayin
}

"""A bank row, live or deleted."""
type SafebyokBankRow {${bankFields}
}

"""A gate row, always live."""
type SafebyokGateRecord {${gateFields}
  wayins:        SafebyokWayins!
}

"""A vault row, live or deleted."""
type SafebyokVaultRow {${vaultFields}
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

union SafebyokBoxRow    = SafebyokBoxRecord | SafebyokBoxTombstone
union SafebyokParentRow = SafebyokBankRow | SafebyokVaultRow
union SafebyokRow       = SafebyokBankRow | SafebyokGateRecord | SafebyokVaultRow | SafebyokBoxRecord | SafebyokBoxTombstone

"""The scope of a bank: the app's label and the user's id."""
type SafebyokBankScope {
  user_id:   String!
  banklabel: String!
}

# Answers

"""What an answer carries of its ask: its op, address and policies, and the revisions of its rows, never a record's payload. A field is null when the ask did not have it."""
type SafebyokAsk {
  op:         String
  user_id:    String
  banklabel:  String
  gatelabel:  String
  vaultlabel: String
  boxlabel:   String
  bank_tok:   String
  vault_tok:  String
  ifAbsent:   String
  ifPresent:  SafebyokIfPresent
  gateVerb:   SafebyokGateVerb
  expected:   SafebyokAskRow
  record:     SafebyokAskRow
  gate:       SafebyokAskRow
}

"""The revision, liveness and life tokens of a row an ask names. A field is null when the ask did not have it."""
type SafebyokAskRow {
  revision_tok: String
  revision_seq: Int
  am:           String
  bank_tok:     String
  gate_tok:     String
  vault_tok:    String
  box_tok:      String
}

"""A refusal: its kind and its message. Its meta may carry capacity, fieldnames and oplabel."""
type SafebyokErr {
  refusalkind: SafebyokRefusalkind!
  message:     String!
  meta:        SafebyokJson
}

"""A bank's gates by gatelabel: its main gate."""
type SafebyokBankGates {
  main: SafebyokGateRecord!
}

"""A live bank's main gate and its vaults, live or deleted, plus any vault rows that failed validation."""
type SafebyokBankEnsured {
  gates:        SafebyokBankGates!
  vaults:       [SafebyokVaultRow!]!
  damaged_rows: [SafebyokJson!]!
}

"""A vault's boxes in sparse form, plus any rows that failed validation."""
type SafebyokBoxesListed {
  boxes:        [SafebyokBoxSparse!]!
  damaged_rows: [SafebyokJson!]!
}

"""The answer to ensureBank: val (null for no live bank) and the bank row on success, err on a refusal."""
type SafebyokEnsureBankAnswer {${answerFields}
  val:        SafebyokBankEnsured
  parent:     SafebyokBankRow
}

"""The answer to buildBank: the gate row and the bank row on success, err on a refusal."""
type SafebyokBuildBankAnswer {${answerFields}
  val:        SafebyokGateRecord
  parent:     SafebyokBankRow
  dbhas:      SafebyokBankRow
}

"""The answer to a gate verb: the gate row and the bank row on success, err on a refusal."""
type SafebyokGateAnswer {${answerFields}
  val:        SafebyokGateRecord
  parent:     SafebyokBankRow
  dbhas:      SafebyokGateRecord
}

"""The answer to delBank: the bank's tombstone on success, err on a refusal. A bank has no row above it."""
type SafebyokDelBankAnswer {${answerFields}
  val:        SafebyokBankRow
  dbhas:      SafebyokBankRow
}

"""The answer to a vault verb: the vault row and the bank row on success, err on a refusal."""
type SafebyokVaultAnswer {${answerFields}
  val:        SafebyokVaultRow
  parent:     SafebyokBankRow
  dbhas:      SafebyokVaultRow
}

"""The answer to listBoxes: val and the vault row on success, err on a refusal."""
type SafebyokBoxesListedAnswer {${answerFields}
  val:        SafebyokBoxesListed
  parent:     SafebyokVaultRow
}

"""The answer to a box verb: the box row and the vault row on success, err on a refusal."""
type SafebyokBoxAnswer {${answerFields}
  val:        SafebyokBoxRow
  parent:     SafebyokVaultRow
  dbhas:      SafebyokBoxRow
}

"""The result of tidyGone: the number of box rows left in the bank."""
type SafebyokTidied {
  totalCount: Int!
}

"""The answer to tidyGone: val and the bank's scope on success, err on a refusal."""
type SafebyokTidiedAnswer {${answerFields}
  val:        SafebyokTidied
  parent:     SafebyokBankScope
}

"""A watch notice: the row that changed and the row above it, or the err that ends the watch."""
type SafebyokNotice {
  ok:     Boolean!
  act:    String!
  val:    SafebyokRow
  parent: SafebyokParentRow
  err:    SafebyokErr
}

# Inputs

input SafebyokCipheredInput {
  cipher_iv_b64:  String!
  ciphertext_b64: String!
}

input SafebyokPassphraseWayinInput {
  wayinlabel:              String!
  wayinkind:               String!
  key_deriver_label:       String!
  salt_b64:                String!
  device_tok:              String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCipheredInput!
}

input SafebyokPasskeyWayinInput {
  wayinlabel:              String!
  wayinkind:               String!
  credential_id:           String!
  prf_salt_b64:            String!
  device_tok:              String!
  registered_at:           SafebyokEpochMillis!
  vault_key_wayin_wrapped: SafebyokCipheredInput!
}

input SafebyokWayinsInput {
  main:     SafebyokPassphraseWayinInput!
  passkey0: SafebyokPasskeyWayinInput
}

input SafebyokBankRowInput {${bankFields}
}

input SafebyokGateRecordInput {${gateFields}
  wayins:        SafebyokWayinsInput!
}

input SafebyokVaultRowInput {${vaultFields}
}

input SafebyokBoxRecordInput {${boxSparseFields}
  sidecar:                SafebyokJson!
  box_key_wrapped:        SafebyokCipheredInput!
  whisper_ciphered:       SafebyokCipheredInput!
}

input SafebyokBoxTombstoneInput {${boxSparseFields}
}

"""The metadata of the bank row the caller expects to find, or of the shell row if it expects none."""
input SafebyokBankExpectedInput {
  revision_tok: String!
  revision_seq: Int!
  am:           String!
  bank_tok:     String!
}

"""The metadata of the gate row the caller expects to find."""
input SafebyokGateExpectedInput {
  revision_tok: String!
  revision_seq: Int!
  am:           String!
  gate_tok:     String!
}

"""The metadata of the vault row the caller expects to find, or of the shell row if it expects none."""
input SafebyokVaultExpectedInput {
  revision_tok: String!
  revision_seq: Int!
  am:           String!
  vault_tok:    String!
}

"""The metadata of the box row the caller expects to find, or of the shell row if it expects none."""
input SafebyokBoxExpectedInput {
  revision_tok: String!
  revision_seq: Int!
  am:           String!
  bank_tok:     String!
  vault_tok:    String!
  box_tok:      String!
}

"""A buildBank request: the bank's scope, the bank row it expects to find, the bank record to store, and its main gate's record."""
input SafebyokBankBuildAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  expected:   SafebyokBankExpectedInput!
  record:     SafebyokBankRowInput!
  gate:       SafebyokGateRecordInput!
}

"""A gate verb's request: the gate's scope, its bank's bank_tok, the gate row it expects to find, and the gate record to store."""
input SafebyokGateVerbAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  gatelabel:  String!
  bank_tok:   String!
  expected:   SafebyokGateExpectedInput!
  record:     SafebyokGateRecordInput!
}

"""A delBank request: the bank's scope, the bank row it expects to find, and the tombstone to store."""
input SafebyokBankDelAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  expected:   SafebyokBankExpectedInput!
  record:     SafebyokBankRowInput!
}

"""A getVault request: the vault's scope, its bank's bank_tok, what to return if no row is stored, and the row the caller expects to find."""
input SafebyokVaultGetAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  vaultlabel: String!
  bank_tok:   String!
  ifAbsent:   SafebyokIfAbsent!
  expected:   SafebyokVaultExpectedInput!
}

"""A putVault request: the vault's scope, its bank's bank_tok, its policies, the row it expects to find, and the record to store."""
input SafebyokVaultPutAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  vaultlabel: String!
  bank_tok:   String!
  ifAbsent:   SafebyokPutIfAbsent!
  ifPresent:  SafebyokIfPresent!
  expected:   SafebyokVaultExpectedInput!
  record:     SafebyokVaultRowInput!
}

"""A delVault request: the vault's scope, its bank's bank_tok, the row it expects to find, and the tombstone to store."""
input SafebyokVaultDelAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  vaultlabel: String!
  bank_tok:   String!
  expected:   SafebyokVaultExpectedInput!
  record:     SafebyokVaultRowInput!
}

"""A getBox request: the box's address under its vault's life, what to return if no row is stored, and the row the caller expects to find."""
input SafebyokBoxGetAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  vaultlabel: String!
  boxlabel:   String!
  bank_tok:   String!
  vault_tok:  String!
  ifAbsent:   SafebyokIfAbsent!
  expected:   SafebyokBoxExpectedInput!
}

"""A putBox request: the box's address under its vault's life, its policies, the row it expects to find, and the record to store."""
input SafebyokBoxPutAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  vaultlabel: String!
  boxlabel:   String!
  bank_tok:   String!
  vault_tok:  String!
  ifAbsent:   SafebyokPutIfAbsent!
  ifPresent:  SafebyokIfPresent!
  expected:   SafebyokBoxExpectedInput!
  record:     SafebyokBoxRecordInput!
}

"""A delBox request: the box's address under its vault's life, the row it expects to find, and the tombstone to store."""
input SafebyokBoxDelAskInput {
  op:         SafebyokOp!
  user_id:    String!
  banklabel:  String!
  vaultlabel: String!
  boxlabel:   String!
  bank_tok:   String!
  vault_tok:  String!
  expected:   SafebyokBoxExpectedInput!
  record:     SafebyokBoxTombstoneInput!
}

# Operations

type Query {
  safebyokEnsureBank(user_id: String!, banklabel: String!): SafebyokEnsureBankAnswer!
  safebyokGetVault(ask: SafebyokVaultGetAskInput!): SafebyokVaultAnswer!
  safebyokListBoxes(user_id: String!, banklabel: String!, vaultlabel: String!, bank_tok: String!, vault_tok: String!): SafebyokBoxesListedAnswer!
  safebyokGetBox(ask: SafebyokBoxGetAskInput!): SafebyokBoxAnswer!
}

type Mutation {
  safebyokBuildBank(ask: SafebyokBankBuildAskInput!): SafebyokBuildBankAnswer!
  safebyokReplacePassphrase(ask: SafebyokGateVerbAskInput!): SafebyokGateAnswer!
  safebyokAddPasskey(ask: SafebyokGateVerbAskInput!): SafebyokGateAnswer!
  safebyokRevokePasskey(ask: SafebyokGateVerbAskInput!): SafebyokGateAnswer!
  safebyokDelBank(ask: SafebyokBankDelAskInput!): SafebyokDelBankAnswer!
  safebyokPutVault(ask: SafebyokVaultPutAskInput!): SafebyokVaultAnswer!
  safebyokDelVault(ask: SafebyokVaultDelAskInput!): SafebyokVaultAnswer!
  safebyokPutBox(ask: SafebyokBoxPutAskInput!): SafebyokBoxAnswer!
  safebyokDelBox(ask: SafebyokBoxDelAskInput!): SafebyokBoxAnswer!
  safebyokTidyGone(user_id: String!, banklabel: String!): SafebyokTidiedAnswer!
}

type Subscription {
  """Subscribe to row changes in a bank, or in one of its vaults when vaultlabel is given."""
  safebyokWatch(user_id: String!, banklabel: String!, vaultlabel: String): SafebyokNotice!
}
`
