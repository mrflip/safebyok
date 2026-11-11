// Each document includes exactly the fragments it uses, as GraphQL validation requires. None asks for
// `__typename`, so a response holds only the fields the core's answer checkers expect.

const vaultSparseFields = 'applabel user_id vaultlabel fmt revision_tok revision_seq registered_at written_at am vault_tok'
const boxSparseFields = 'applabel user_id vaultlabel boxlabel fmt revision_tok revision_seq registered_at written_at am vault_tok box_tok whisper_codec whisper_schema_version'

const ciphered = 'fragment SafebyokCipheredFields on SafebyokCiphered { cipher_iv_b64 ciphertext_b64 }'

const gate = `fragment SafebyokGateFields on SafebyokGate {
  gate_epoch
  passphrase_wayin { wayinkind key_deriver_label salt_b64 device_id registered_at vault_key_wayin_wrapped { ...SafebyokCipheredFields } }
  passkey_wayin { wayinkind credential_id prf_salt_b64 device_id registered_at vault_key_wayin_wrapped { ...SafebyokCipheredFields } }
}`

const vaultRow = `fragment SafebyokVaultRowFields on SafebyokVaultRow {
  ... on SafebyokVaultRecord { ${vaultSparseFields} gate { ...SafebyokGateFields } }
  ... on SafebyokVaultTombstone { ${vaultSparseFields} }
}`

const boxRow = `fragment SafebyokBoxRowFields on SafebyokBoxRow {
  ... on SafebyokBoxRecord { ${boxSparseFields} sidecar box_key_wrapped { ...SafebyokCipheredFields } whisper_ciphered { ...SafebyokCipheredFields } }
  ... on SafebyokBoxTombstone { ${boxSparseFields} }
}`

const row = 'fragment SafebyokRowFields on SafebyokRow { ...SafebyokVaultRowFields ...SafebyokBoxRowFields }'

const reqParams = `fragment SafebyokReqParamsFields on SafebyokReqParams {
  applabel user_id vaultlabel boxlabel vault_tok box_tok revision_tok revision_seq prior { revision_tok revision_seq }
}`

const err = 'fragment SafebyokErrFields on SafebyokErr { refusalkind message meta }'

const vaultAnswer = `fragment SafebyokVaultAnswerFields on SafebyokVaultAnswer {
  ok act
  val { ...SafebyokVaultRowFields }
  world { ...SafebyokVaultRowFields }
  dbhas { ...SafebyokVaultRowFields }
  req_params { ...SafebyokReqParamsFields }
  err { ...SafebyokErrFields }
}`

const boxAnswer = `fragment SafebyokBoxAnswerFields on SafebyokBoxAnswer {
  ok act
  val { ...SafebyokBoxRowFields }
  world { ...SafebyokVaultRowFields }
  dbhas { ...SafebyokRowFields }
  req_params { ...SafebyokReqParamsFields }
  err { ...SafebyokErrFields }
}`

// The fragments each group of operations uses, nested ones included.
const vaultAnswerFragments = [vaultAnswer, vaultRow, gate, ciphered, reqParams, err].join('\n')
const boxAnswerFragments = [boxAnswer, row, boxRow, vaultRow, gate, ciphered, reqParams, err].join('\n')

/** The GraphQL documents a client sends to `safebyok-graphql/server`: one per vaultDB verb, and one for the watch subscription. */
export const VaultOperations = {
  listVaults: `query SafebyokListVaults($applabel: String!, $user_id: String!) {
  safebyokListVaults(applabel: $applabel, user_id: $user_id) {
    ok act
    val { vaults { ...SafebyokVaultRowFields } damaged_rows }
    world { applabel user_id }
    req_params { ...SafebyokReqParamsFields }
    err { ...SafebyokErrFields }
  }
}
${[vaultRow, gate, ciphered, reqParams, err].join('\n')}`,

  getVault: `query SafebyokGetVault($applabel: String!, $user_id: String!, $vaultlabel: String!, $opts: SafebyokIfAbsentOptsInput) {
  safebyokGetVault(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel, opts: $opts) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  listBoxes: `query SafebyokListBoxes($applabel: String!, $user_id: String!, $vaultlabel: String!, $vault_tok: String!) {
  safebyokListBoxes(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel, vault_tok: $vault_tok) {
    ok act
    val { boxes { ${boxSparseFields} } damaged_rows }
    world { ...SafebyokVaultRowFields }
    dbhas { ...SafebyokVaultRowFields }
    req_params { ...SafebyokReqParamsFields }
    err { ...SafebyokErrFields }
  }
}
${[vaultRow, gate, ciphered, reqParams, err].join('\n')}`,

  getBox: `query SafebyokGetBox($applabel: String!, $user_id: String!, $vaultlabel: String!, $boxlabel: String!, $vault_tok: String!, $opts: SafebyokIfAbsentOptsInput) {
  safebyokGetBox(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel, boxlabel: $boxlabel, vault_tok: $vault_tok, opts: $opts) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  putVault: `mutation SafebyokPutVault($record: SafebyokVaultRecordInput!, $opts: SafebyokPutOptsInput!) {
  safebyokPutVault(record: $record, opts: $opts) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  putBox: `mutation SafebyokPutBox($record: SafebyokBoxRecordInput!, $opts: SafebyokPutOptsInput!) {
  safebyokPutBox(record: $record, opts: $opts) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  replacePassphrase: `mutation SafebyokReplacePassphrase($record: SafebyokVaultRecordInput!, $opts: SafebyokGateVerbOptsInput!) {
  safebyokReplacePassphrase(record: $record, opts: $opts) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  addPasskey: `mutation SafebyokAddPasskey($record: SafebyokVaultRecordInput!, $opts: SafebyokGateVerbOptsInput!) {
  safebyokAddPasskey(record: $record, opts: $opts) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  revokePasskey: `mutation SafebyokRevokePasskey($record: SafebyokVaultRecordInput!, $opts: SafebyokGateVerbOptsInput!) {
  safebyokRevokePasskey(record: $record, opts: $opts) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  delBox: `mutation SafebyokDelBox($tombstone: SafebyokBoxTombstoneInput!, $opts: SafebyokDelOptsInput!) {
  safebyokDelBox(tombstone: $tombstone, opts: $opts) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  delVault: `mutation SafebyokDelVault($tombstone: SafebyokVaultTombstoneInput!, $opts: SafebyokDelOptsInput!) {
  safebyokDelVault(tombstone: $tombstone, opts: $opts) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  tidyGone: `mutation SafebyokTidyGone($applabel: String!, $user_id: String!) {
  safebyokTidyGone(applabel: $applabel, user_id: $user_id) {
    ok act
    val { totalCount }
    world { applabel user_id }
    req_params { ...SafebyokReqParamsFields }
    err { ...SafebyokErrFields }
  }
}
${[reqParams, err].join('\n')}`,

  watch: `subscription SafebyokWatch($applabel: String!, $user_id: String!, $vaultlabel: String) {
  safebyokWatch(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel) {
    ok act
    val { ...SafebyokRowFields }
    world { ...SafebyokVaultRowFields }
    err { ...SafebyokErrFields }
  }
}
${[row, boxRow, vaultRow, gate, ciphered, err].join('\n')}`,
} as const
