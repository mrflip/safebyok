/** The fixture scripts/make-fixture.ts writes: the dojo's three users, and the rows Reset loads into the two stores. */

import type { PersistedClient } from 'safebyok/storage'
import fixtureJson from '../fixture/fixture.json'

/** One of the dojo's users: a fixture credential, printed on the page. */
export type DojoUser = Readonly<{ userid: string, title: string, passphrase: string, blurb: string }>

/** A row of an IndexedDB store: its key, and the value stored there. */
export type StoredRow = [ckey: IDBValidKey, val: unknown]

/** The fixture, as the script wrote it. */
type Fixture = Readonly<{
  users:   readonly DojoUser[]
  /** The vault database's rows: each Thing at `[userid, banklabel, labelpath]`. */
  vault:   readonly StoredRow[]
  /** The persist database's rows: each snapshot at its recordlabel. */
  cache:   readonly [recordlabel: string, persisted: PersistedClient][]
  /** Rows Reset leaves out, which a form's Exists button writes into the vault database, by userid. */
  planted: Readonly<Record<string, readonly StoredRow[]>>
}>

/** The users and rows scripts/make-fixture.ts wrote, typed. */
export const Fixture = fixtureJson as unknown as Fixture
