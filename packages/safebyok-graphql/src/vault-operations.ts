// Each document includes exactly the fragments it uses, as GraphQL validation requires. None asks for
// `__typename`, so a response has only the fields the core's answer checkers expect.

const vaultSparseFields = 'user_id banklabel vaultlabel fmt revision_tok revision_seq registered_at written_at am vault_tok'
const boxSparseFields = 'user_id banklabel vaultlabel boxlabel fmt revision_tok revision_seq registered_at written_at am vault_tok box_tok whisper_codec whisper_schema_version'

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

const ask = `fragment SafebyokAskFields on SafebyokAsk {
  op user_id banklabel vaultlabel boxlabel vault_tok ifAbsent ifPresent gateVerb
  expected { revision_tok revision_seq am vault_tok box_tok }
  record { revision_tok revision_seq am vault_tok box_tok }
}`

const err = 'fragment SafebyokErrFields on SafebyokErr { refusalkind message meta }'

const vaultAnswer = `fragment SafebyokVaultAnswerFields on SafebyokVaultAnswer {
  ok act
  val { ...SafebyokVaultRowFields }
  world { ...SafebyokVaultRowFields }
  dbhas { ...SafebyokVaultRowFields }
  ask { ...SafebyokAskFields }
  err { ...SafebyokErrFields }
}`

const boxAnswer = `fragment SafebyokBoxAnswerFields on SafebyokBoxAnswer {
  ok act
  val { ...SafebyokBoxRowFields }
  world { ...SafebyokVaultRowFields }
  dbhas { ...SafebyokRowFields }
  ask { ...SafebyokAskFields }
  err { ...SafebyokErrFields }
}`

// The fragments each group of operations uses, nested ones included.
const vaultAnswerFragments = [vaultAnswer, vaultRow, gate, ciphered, ask, err].join('\n')
const boxAnswerFragments = [boxAnswer, row, boxRow, vaultRow, gate, ciphered, ask, err].join('\n')

/** The GraphQL documents a client sends to `safebyok-graphql/server`: one per vaultDB verb, and one for the watch subscription. */
export const VaultOperations = {
  listVaults: `query SafebyokListVaults($user_id: String!, $banklabel: String!) {
  safebyokListVaults(user_id: $user_id, banklabel: $banklabel) {
    ok act
    val { vaults { ...SafebyokVaultRowFields } damaged_rows }
    world { user_id banklabel }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${[vaultRow, gate, ciphered, ask, err].join('\n')}`,

  getVault: `query SafebyokGetVault($ask: SafebyokVaultGetAskInput!) {
  safebyokGetVault(ask: $ask) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  listBoxes: `query SafebyokListBoxes($user_id: String!, $banklabel: String!, $vaultlabel: String!, $vault_tok: String!) {
  safebyokListBoxes(user_id: $user_id, banklabel: $banklabel, vaultlabel: $vaultlabel, vault_tok: $vault_tok) {
    ok act
    val { boxes { ${boxSparseFields} } damaged_rows }
    world { ...SafebyokVaultRowFields }
    dbhas { ...SafebyokVaultRowFields }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${[vaultRow, gate, ciphered, ask, err].join('\n')}`,

  getBox: `query SafebyokGetBox($ask: SafebyokBoxGetAskInput!) {
  safebyokGetBox(ask: $ask) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  putVault: `mutation SafebyokPutVault($ask: SafebyokVaultPutAskInput!) {
  safebyokPutVault(ask: $ask) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  putBox: `mutation SafebyokPutBox($ask: SafebyokBoxPutAskInput!) {
  safebyokPutBox(ask: $ask) { ...SafebyokBoxAnswerFields }
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

  delBox: `mutation SafebyokDelBox($ask: SafebyokBoxDelAskInput!) {
  safebyokDelBox(ask: $ask) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  delVault: `mutation SafebyokDelVault($ask: SafebyokVaultDelAskInput!) {
  safebyokDelVault(ask: $ask) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  tidyGone: `mutation SafebyokTidyGone($user_id: String!, $banklabel: String!) {
  safebyokTidyGone(user_id: $user_id, banklabel: $banklabel) {
    ok act
    val { totalCount }
    world { user_id banklabel }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${[ask, err].join('\n')}`,

  watch: `subscription SafebyokWatch($user_id: String!, $banklabel: String!, $vaultlabel: String) {
  safebyokWatch(user_id: $user_id, banklabel: $banklabel, vaultlabel: $vaultlabel) {
    ok act
    val { ...SafebyokRowFields }
    world { ...SafebyokVaultRowFields }
    err { ...SafebyokErrFields }
  }
}
${[row, boxRow, vaultRow, gate, ciphered, err].join('\n')}`,
} as const
