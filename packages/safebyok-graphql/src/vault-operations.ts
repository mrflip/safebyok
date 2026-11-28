/** The GraphQL documents `GraphQLVaultDB` sends, one per vaultDB verb. */

// None asks for `__typename`, so a response carries only the fields the client's checks expect. An exchange that adds it,
// such as urql's cacheExchange, has it dropped again one selection at a time.

const err = 'err { refusalkind message meta { oplabel act capacity fieldnames labelpaths } }'
const answerFields = `ok act banktok tracked read_tc ${err}`

/** Each GraphQL document `GraphQLVaultDB` sends, keyed by its verb: for a server that allows only the operations it knows. */
export const VaultOperations = Object.freeze({
  getThing: `query SafebyokGetThing($ask: SafebyokGetAsk!) {
  safebyokGetThing(ask: $ask) { ${answerFields} val dbhas }
}`,

  listThings: `query SafebyokListThings($ask: SafebyokListAsk!) {
  safebyokListThings(ask: $ask) {
    ${answerFields} dbhas
    val { modelkind parentpath parentlife items gones read_tc }
    parentage deltas incompatible_rows { modelkind userid banklabel labelpath am }
  }
}`,

  getBank: `query SafebyokGetBank($ask: SafebyokBankAsk!) {
  safebyokGetBank(ask: $ask) { ${answerFields} val { gate root } dbhas { gate root } }
}`,

  stats: `query SafebyokStats($ask: SafebyokBankAsk!) {
  safebyokStats(ask: $ask) {
    ${answerFields} dbhas
    val { box { count live_count size } gate { count live_count size } max { count size } }
  }
}`,

  writeThing: `mutation SafebyokWriteThing($ask: SafebyokWriteAsk!) {
  safebyokWriteThing(ask: $ask) { ${answerFields} val dbhas }
}`,

  birthBank: `mutation SafebyokBirthBank($ask: SafebyokBirthBankAsk!) {
  safebyokBirthBank(ask: $ask) { ${answerFields} val { gate root } dbhas { gate root } }
}`,

  watchThings: `subscription SafebyokWatchThings($scope: SafebyokWatchScope!) {
  safebyokWatchThings(scope: $scope) { record modelkind banktok read_tc ${err} isEnded }
}`,
})
