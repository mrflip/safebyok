// Rows, records and options cross as one JSON scalar, never typed field by field: the VaultDB at
// each end checks them, and a schema that spelled them out would be a second copy of the core's
// shapes, to drift from it. Scopes are arguments of their own, so a host's logs and allowlists
// can see whose bank each operation reaches.

/** The GraphQL schema a VaultDB's generic calls cross by, as SDL, every name in it `safebyok...` or `Safebyok...`, to sit beside your own. */
export const VaultSchemaSdl = `"""A JSON value carried whole: a stored row, a record, or a write's options, checked by the VaultDB at each end."""
scalar SafebyokJson

"""A vault row of a bank, under its vaultlabel."""
type SafebyokRowOfVault {
  vaultlabel: String!
  vault:      SafebyokJson
}

"""A box row of a vault, under its boxlabel."""
type SafebyokRowOfBox {
  boxlabel: String!
  box:      SafebyokJson
}

"""The vault row, and every box row under its vault_tok, read in one step."""
type SafebyokBoxesFetched {
  vault: SafebyokJson
  boxes: [SafebyokRowOfBox!]!
}

"""The vault row, and one box row under its vault_tok, read in one step."""
type SafebyokBoxFetched {
  vault: SafebyokJson
  box:   SafebyokJson
}

"""Whether a conditional write landed, and the row it replaced, or that stands in its way."""
type SafebyokLanding {
  landed: Boolean!
  ante:   SafebyokJson
}

"""A box write's landing, with the vault row as read in the same step."""
type SafebyokBoxLanding {
  landed: Boolean!
  ante:   SafebyokJson
  vault:  SafebyokJson
}

"""How many box rows are left in the bank once the gone ones are removed."""
type SafebyokTidied {
  totalCount: Int!
}

type Query {
  safebyokListVaults(applabel: String!, user_id: String!): [SafebyokRowOfVault!]!
  safebyokGetVault(applabel: String!, user_id: String!, vaultlabel: String!): SafebyokJson
  safebyokListBoxes(applabel: String!, user_id: String!, vaultlabel: String!, vault_tok: String!): SafebyokBoxesFetched!
  safebyokGetBox(applabel: String!, user_id: String!, vaultlabel: String!, boxlabel: String!, vault_tok: String!): SafebyokBoxFetched!
}

type Mutation {
  safebyokPutVault(record: SafebyokJson!, opts: SafebyokJson!): SafebyokLanding!
  safebyokPutBox(record: SafebyokJson!, opts: SafebyokJson!): SafebyokBoxLanding!
  safebyokDelVault(tombstone: SafebyokJson!, opts: SafebyokJson!): SafebyokLanding!
  safebyokDelBox(tombstone: SafebyokJson!, opts: SafebyokJson!): SafebyokBoxLanding!
  safebyokTidyGone(applabel: String!, user_id: String!): SafebyokTidied!
}

type Subscription {
  """Each row that changes in the bank, or in one vault of it: the vault row, and the box row when a box changed."""
  safebyokHeard(applabel: String!, user_id: String!, vaultlabel: String): SafebyokJson!
}
`
