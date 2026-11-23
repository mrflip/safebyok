/** What a scenario button arranges before its form submits, through what the dojo hands the library as a host would: the strength checker, the vaultDB, the rows stored, and the bank's lock. */

import { Dojo, vaultDB } from './dojo'
import { plantRows } from './stores'
import { forceWeak } from './switchable-checker'

/** What a button arranges: nothing, a weak verdict, a row stored behind the device's back, a refused write, or a locked bank. */
export type Arrangement = 'nothing' | 'weak' | 'stored' | 'refused' | 'locked'

/** Arrange `arrangement` for `userid`, signed in, resolving once it holds. Each lasts until {@link disarm}. */
export async function arrange(arrangement: Arrangement, userid: string | null): Promise<void> {
  disarm()
  switch (arrangement) {
  case 'nothing': { return }
  case 'weak': {    forceWeak(true); return }
  case 'refused': { vaultDB.refuseNextWrite(); return }
  case 'locked': {  Dojo.lock(); return }
  case 'stored': {  if (userid !== null) { await plantRows(userid) } }
  }
}

/** Switch the checker back to its own verdict, and forget a refusal not yet made: once a form's outcome lands. */
export function disarm(): void {
  forceWeak(false)
  vaultDB.stopRefusing()
}
