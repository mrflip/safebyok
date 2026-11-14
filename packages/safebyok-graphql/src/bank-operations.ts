// Each document includes exactly the fragments it uses, as GraphQL validation requires. None asks for
// `__typename`, so a response has only the fields the core's answer checkers expect.

const bankFields = 'user_id banklabel fmt revision_tok revision_seq registered_at written_at am bank_tok'
const vaultFields = 'user_id banklabel vaultlabel fmt revision_tok revision_seq registered_at written_at am bank_tok vault_tok'
const boxSparseFields = 'user_id banklabel vaultlabel boxlabel fmt revision_tok revision_seq registered_at written_at am bank_tok vault_tok box_tok whisper_codec whisper_schema_version'

const ciphered = 'fragment SafebyokCipheredFields on SafebyokCiphered { cipher_iv_b64 ciphertext_b64 }'

const gate = `fragment SafebyokGateFields on SafebyokGateRecord {
  user_id banklabel gatelabel fmt revision_tok revision_seq registered_at written_at am bank_tok gate_tok auth sigs meta
  wayins {
    main { wayinlabel wayinkind key_deriver_label salt_b64 device_tok registered_at bank_key_wayin_wrapped { ...SafebyokCipheredFields } }
    passkey0 { wayinlabel wayinkind credential_id prf_salt_b64 device_tok registered_at bank_key_wayin_wrapped { ...SafebyokCipheredFields } }
  }
}`

const boxRow = `fragment SafebyokBoxRowFields on SafebyokBoxRow {
  ... on SafebyokBoxRecord { ${boxSparseFields} sidecar box_key_wrapped { ...SafebyokCipheredFields } whisper_ciphered { ...SafebyokCipheredFields } }
  ... on SafebyokBoxTombstone { ${boxSparseFields} }
}`

const row = `fragment SafebyokRowFields on SafebyokRow {
  ... on SafebyokBankRow { ${bankFields} }
  ... on SafebyokVaultRow { ${vaultFields} }
  ...SafebyokGateFields
  ...SafebyokBoxRowFields
}`

const ask = `fragment SafebyokAskFields on SafebyokAsk {
  op user_id banklabel gatelabel vaultlabel boxlabel bank_tok vault_tok ifAbsent ifPresent
  options { policies }
  expected { revision_tok revision_seq am bank_tok gate_tok vault_tok box_tok }
  record { revision_tok revision_seq am bank_tok gate_tok vault_tok box_tok }
  gate { revision_tok revision_seq am bank_tok gate_tok vault_tok box_tok }
}`

const err = 'fragment SafebyokErrFields on SafebyokErr { refusalkind message meta }'

const gateAnswer = `fragment SafebyokGateAnswerFields on SafebyokGateAnswer {
  ok act
  val { ...SafebyokGateFields }
  parent { ${bankFields} }
  dbhas { ...SafebyokGateFields }
  ask { ...SafebyokAskFields }
  err { ...SafebyokErrFields }
}`

const vaultAnswer = `fragment SafebyokVaultAnswerFields on SafebyokVaultAnswer {
  ok act
  val { ${vaultFields} }
  parent { ${bankFields} }
  dbhas { ${vaultFields} }
  ask { ...SafebyokAskFields }
  err { ...SafebyokErrFields }
}`

const boxAnswer = `fragment SafebyokBoxAnswerFields on SafebyokBoxAnswer {
  ok act
  val { ...SafebyokBoxRowFields }
  parent { ${vaultFields} }
  dbhas { ...SafebyokBoxRowFields }
  ask { ...SafebyokAskFields }
  err { ...SafebyokErrFields }
}`

// The fragments each group of operations uses, nested ones included.
const askedFragments = [ask, err].join('\n')
const gateFragments = [gate, ciphered, ask, err].join('\n')
const gateAnswerFragments = [gateAnswer, gateFragments].join('\n')
const vaultAnswerFragments = [vaultAnswer, askedFragments].join('\n')
const boxAnswerFragments = [boxAnswer, boxRow, ciphered, ask, err].join('\n')

/** The GraphQL documents a client sends to `safebyok-graphql/server`: one per bankDB verb, and one for the watch subscription. */
export const BankOperations = {
  ensureBank: `query SafebyokEnsureBank($user_id: String!, $banklabel: String!) {
  safebyokEnsureBank(user_id: $user_id, banklabel: $banklabel) {
    ok act
    val { gates { main { ...SafebyokGateFields } } vaults { ${vaultFields} } damaged_rows }
    parent { ${bankFields} }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${gateFragments}`,

  buildBank: `mutation SafebyokBuildBank($ask: SafebyokBankBuildAskInput!) {
  safebyokBuildBank(ask: $ask) {
    ok act
    val { ...SafebyokGateFields }
    parent { ${bankFields} }
    dbhas { ${bankFields} }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${gateFragments}`,

  putGate: `mutation SafebyokPutGate($ask: SafebyokGatePutAskInput!) {
  safebyokPutGate(ask: $ask) { ...SafebyokGateAnswerFields }
}
${gateAnswerFragments}`,

  delBank: `mutation SafebyokDelBank($ask: SafebyokBankDelAskInput!) {
  safebyokDelBank(ask: $ask) {
    ok act
    val { ${bankFields} }
    parent
    dbhas { ${bankFields} }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${askedFragments}`,

  getVault: `query SafebyokGetVault($ask: SafebyokVaultGetAskInput!) {
  safebyokGetVault(ask: $ask) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  putVault: `mutation SafebyokPutVault($ask: SafebyokVaultPutAskInput!) {
  safebyokPutVault(ask: $ask) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  delVault: `mutation SafebyokDelVault($ask: SafebyokVaultDelAskInput!) {
  safebyokDelVault(ask: $ask) { ...SafebyokVaultAnswerFields }
}
${vaultAnswerFragments}`,

  listBoxes: `query SafebyokListBoxes($user_id: String!, $banklabel: String!, $vaultlabel: String!, $bank_tok: String!, $vault_tok: String!) {
  safebyokListBoxes(user_id: $user_id, banklabel: $banklabel, vaultlabel: $vaultlabel, bank_tok: $bank_tok, vault_tok: $vault_tok) {
    ok act
    val { boxes { ${boxSparseFields} } damaged_rows }
    parent { ${vaultFields} }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${askedFragments}`,

  getBox: `query SafebyokGetBox($ask: SafebyokBoxGetAskInput!) {
  safebyokGetBox(ask: $ask) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  putBox: `mutation SafebyokPutBox($ask: SafebyokBoxPutAskInput!) {
  safebyokPutBox(ask: $ask) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  delBox: `mutation SafebyokDelBox($ask: SafebyokBoxDelAskInput!) {
  safebyokDelBox(ask: $ask) { ...SafebyokBoxAnswerFields }
}
${boxAnswerFragments}`,

  tidyGone: `mutation SafebyokTidyGone($user_id: String!, $banklabel: String!) {
  safebyokTidyGone(user_id: $user_id, banklabel: $banklabel) {
    ok act
    val { totalCount leftover }
    parent { user_id banklabel }
    ask { ...SafebyokAskFields }
    err { ...SafebyokErrFields }
  }
}
${askedFragments}`,

  watch: `subscription SafebyokWatch($user_id: String!, $banklabel: String!, $vaultlabel: String) {
  safebyokWatch(user_id: $user_id, banklabel: $banklabel, vaultlabel: $vaultlabel) {
    ok act
    val { ...SafebyokRowFields }
    parent {
      ... on SafebyokBankRow { ${bankFields} }
      ... on SafebyokVaultRow { ${vaultFields} }
    }
    err { ...SafebyokErrFields }
  }
}
${[row, gate, boxRow, ciphered, err].join('\n')}`,
} as const
