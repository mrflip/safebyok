/** The GraphQL documents `GraphQLVaultDB` sends, one per vaultDB verb. */

// None asks for `__typename`, so a response carries only the fields the client's checks expect. An exchange that adds it,
// such as urql's cacheExchange, has it dropped again one selection at a time.

const err = 'err { refusalkind message meta { oplabel act capacity fieldnames labelpaths } }'
const answerFields = `ok act banktok tracked read_tc dbhas ${err}`

/** Each GraphQL document `GraphQLVaultDB` sends, keyed by its verb: for a server that allows only the operations it knows. */
export const VaultOperations = Object.freeze({
  getThing: `query SafebyokGetThing($ask: SafebyokGetAsk!) {
  safebyokGetThing(ask: $ask) { ${answerFields} val }
}`,

  listThings: `query SafebyokListThings($ask: SafebyokListAsk!) {
  safebyokListThings(ask: $ask) {
    ${answerFields}
    val { modelkind parentpath parentlife items gones read_tc }
    parentage deltas damaged_rows { userid banklabel labelpath am }
  }
}`,

  getWorld: `query SafebyokGetWorld($ask: SafebyokBankAsk!) {
  safebyokGetWorld(ask: $ask) { ${answerFields} val { bank gate root } }
}`,

  stats: `query SafebyokStats($ask: SafebyokBankAsk!) {
  safebyokStats(ask: $ask) {
    ${answerFields}
    val { box { count live_count size } gate { count live_count size } max { count size } }
  }
}`,

  writeThing: `mutation SafebyokWriteThing($ask: SafebyokWriteAsk!) {
  safebyokWriteThing(ask: $ask) { ${answerFields} val }
}`,

  birthBank: `mutation SafebyokBirthBank($ask: SafebyokBirthBankAsk!) {
  safebyokBirthBank(ask: $ask) { ${answerFields} val { bank gate root } }
}`,

  watchThings: `subscription SafebyokWatchThings($scope: SafebyokWatchScope!) {
  safebyokWatchThings(scope: $scope) { record banktok read_tc ${err} isEnded }
}`,
})
