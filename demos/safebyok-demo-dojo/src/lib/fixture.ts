/** The fixture scripts/make-fixture.ts writes: the dojo's three users, and the rows Reset loads into the vault database and localStorage. */

import fixtureJson from '../fixture/fixture.json'

/** One of the dojo's users: a fixture credential, printed on the page. */
export type DojoUser = Readonly<{ userid: string, title: string, passphrase: string, blurb: string }>

/** A row of an IndexedDB store: its key, and the value stored there. */
export type StoredRow = [ckey: IDBValidKey, val: unknown]

/** An item of localStorage: its key, and the text stored there. */
export type ShelvedRow = [ckey: string, shelved: string]

/** The fixture, as the script wrote it. */
type Fixture = Readonly<{
  users:   readonly DojoUser[]
  /** The vault database's rows: each Thing at `[userid, banklabel, labelpath]`. */
  vault:   readonly StoredRow[]
  /** The root shelf's items, in localStorage: each bank's roots at its key. */
  cache:   readonly ShelvedRow[]
  /** Rows Reset leaves out, which a form's Exists button writes into the vault database, by userid. */
  planted: Readonly<Record<string, readonly StoredRow[]>>
}>

/** The users and rows scripts/make-fixture.ts wrote, typed. */
export const Fixture = fixtureJson as unknown as Fixture
