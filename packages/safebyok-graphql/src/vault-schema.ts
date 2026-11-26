/** The GraphQL schema a server serves for `GraphQLVaultDB`: its SDL, and the scalar that carries a Thing whole. */

import { GraphQLScalarType, valueFromASTUntyped } from 'graphql'
import * as DB from 'safebyok/storage'

// == [SDL]: VaultSchemaSdl
// Each operation is one vaultDB verb, given its ask as one typed input, and answering the verb's answer less its ask, with any
// refusal reduced to what may cross. A GraphQL error is left for what GraphQL itself rejects, such as a client and server whose
// schemas differ. Four things are SafebyokJson, read by the core's checks at each end and never typed here: a Thing (a record,
// a citation, a shell, a tombstone or a live box's sparse form), an ask's `track` and an answer's `tracked`, a listing's
// children by label, and a refusal's capacity.

// The fields every ask carries, and those of an ask aimed at one Thing.
const bankAskFields = `
  userid:    String!
  banklabel: String!
  op:        String!
  track:     SafebyokJson!
  banktok:   String!`

const thingAskFields = `${bankAskFields}
  labelpath: String!
  modelkind: SafebyokModelkind!`

// The fields every answer carries. `val` is typed per verb.
const answerFields = `
  ok:      Boolean!
  act:     String!
  banktok: String!
  tracked: SafebyokJson!
  read_tc: String!
  dbhas:   SafebyokJson
  err:     SafebyokErr`

/** The GraphQL schema (SDL) for a vaultDB's verbs. Every name is prefixed `safebyok`, so it can be merged into your own schema. */
export const VaultSchemaSdl = `"""Any JSON value, carried whole: a Thing, a track, a listing's children by label, or a refusal's capacity. The core's checks read it at each end."""
scalar SafebyokJson

"""safebyok's name for the reason a call was refused."""
enum SafebyokRefusalkind { ${DB.refusalkindVals.join(' ')} }

"""The kind of Thing an ask is aimed at."""
enum SafebyokModelkind { ${DB.thingkindVals.join(' ')} }

"""A get's policy for a Thing that was never stored or is deleted: refuse, or answer null."""
enum SafebyokIfAbsent { ${DB.ifAbsentVals.join(' ')} }

"""A put's policy for a Thing that was never stored or is deleted: add the record, or refuse."""
enum SafebyokPutIfAbsent { ${DB.putIfAbsentVals.join(' ')} }

"""A put's policy for a live Thing: replace it, refuse, or answer the Thing stored."""
enum SafebyokIfPresent { ${DB.ifPresentVals.join(' ')} }

"""A storage policy a write must meet."""
enum SafebyokStoragePolicy { ${DB.storagePolicyVals.join(' ')} }

# Asks

"""A write's options: the storage policies it must meet."""
input SafebyokOptions {
  policies: [SafebyokStoragePolicy!]!
}

"""An ask for the Thing at its scope."""
input SafebyokGetAsk {${thingAskFields}
  ifAbsent:  SafebyokIfAbsent!
}

"""An ask for the children of the live Thing at its scope."""
input SafebyokListAsk {${thingAskFields}
}

"""An ask to write a record over the Thing it cites: op put with a live record, or del with a tombstone."""
input SafebyokWriteAsk {${thingAskFields}
  cited:     SafebyokJson!
  record:    SafebyokJson!
  ifAbsent:  SafebyokPutIfAbsent!
  ifPresent: SafebyokIfPresent!
  options:   SafebyokOptions
}

"""An ask to write a new bank's three roots in one step."""
input SafebyokBirthBankAsk {${bankAskFields}
  bank:      SafebyokJson!
  gate:      SafebyokJson!
  root:      SafebyokJson!
}

"""An ask for a bank's three roots, or for its storage stats, read in one step."""
input SafebyokBankAsk {${bankAskFields}
}

"""The bank a watch is of."""
input SafebyokWatchScope {
  userid:    String!
  banklabel: String!
}

# Answers

"""What a refusal's meta lets cross: fields, labels and limits, never values."""
type SafebyokErrMeta {
  oplabel:    String
  act:        String
  capacity:   SafebyokJson
  fieldnames: [String!]
  labelpaths: [String!]
}

"""A refusal as it crosses: its kind, its message and the meta a server lets cross. Never its cause."""
type SafebyokErr {
  refusalkind: SafebyokRefusalkind!
  message:     String!
  meta:        SafebyokErrMeta!
}

"""The answer to a get or a write: val is the Thing, or null for none live; dbhas the Thing stored or its shell, where the answer has one."""
type SafebyokThingAnswer {${answerFields}
  val:     SafebyokJson
}

"""The children of one live life of a Thing, by label: the live ones in items, the tombstones in gones."""
type SafebyokKids {
  modelkind:  String!
  parentpath: String!
  parentlife: String!
  items:      SafebyokJson!
  gones:      SafebyokJson!
  read_tc:    String!
}

"""A child that fails its kind's checks: its scope."""
type SafebyokDamagedThing {
  userid:    String!
  banklabel: String!
  labelpath: String!
  am:        String!
}

"""The answer to a listing: its children, the parent and each child as stored, and the children that fail their checks. Each list is empty when refused."""
type SafebyokListAnswer {${answerFields}
  val:          SafebyokKids
  parentage:    [SafebyokJson!]!
  deltas:       [SafebyokJson!]!
  damaged_rows: [SafebyokDamagedThing!]!
}

"""A bank's three roots."""
type SafebyokRoots {
  bank: SafebyokJson!
  gate: SafebyokJson!
  root: SafebyokJson!
}

"""The answer to a birth or a get of the world: the bank's three roots."""
type SafebyokRootsAnswer {${answerFields}
  val:     SafebyokRoots
}

"""One kind's Things as stored: how many, how many live, and their weight in bytes. Each a whole number."""
type SafebyokThingkindStats {
  count:      Float!
  live_count: Float!
  size:       Float!
}

"""The most a store holds: Things and bytes. Each a whole number, past GraphQL's 32-bit Int."""
type SafebyokStoreLimits {
  count: Float!
  size:  Float!
}

"""A bank's storage stats: its boxes and gates as stored, and the store's limits."""
type SafebyokStats {
  box:  SafebyokThingkindStats!
  gate: SafebyokThingkindStats!
  max:  SafebyokStoreLimits!
}

"""The answer to an ask for stats."""
type SafebyokStatsAnswer {${answerFields}
  val:     SafebyokStats
}

"""One change a watch heard: the Thing, its bank's banktok and when it was read; or, with those null, the trouble the watch met. isEnded is true on the last notice of a watch that ended itself, which says why."""
type SafebyokNotice {
  record:  SafebyokJson
  banktok: String
  read_tc: String
  err:     SafebyokErr
  isEnded: Boolean!
}

# Operations

type Query {
  safebyokGetThing(ask: SafebyokGetAsk!):    SafebyokThingAnswer!
  safebyokListThings(ask: SafebyokListAsk!): SafebyokListAnswer!
  safebyokGetWorld(ask: SafebyokBankAsk!):   SafebyokRootsAnswer!
  safebyokStats(ask: SafebyokBankAsk!):      SafebyokStatsAnswer!
}

type Mutation {
  safebyokWriteThing(ask: SafebyokWriteAsk!):    SafebyokThingAnswer!
  safebyokBirthBank(ask: SafebyokBirthBankAsk!): SafebyokRootsAnswer!
}

type Subscription {
  """Each change to a bank's Things, until the subscriber leaves."""
  safebyokWatchThings(scope: SafebyokWatchScope!): SafebyokNotice!
}
`
// --

// == [Scalars]: safebyokJson

// graphql-js builds an object written in a document with a null prototype. A structured clone makes it a plain object, as
// the core's checks want; a variable arrives as the plain JSON it was sent as.
/** `SafebyokJson`: any JSON value, carried whole. The vaultDB at each end checks it. */
export const safebyokJson = new GraphQLScalarType({
  name:               'SafebyokJson',
  coerceOutputValue:  (val) => val,
  coerceInputValue:   (val) => val,
  coerceInputLiteral: (ast) => structuredClone(valueFromASTUntyped(ast)),
})
// --
