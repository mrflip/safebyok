/** What each button of a Forms row arranges before its form submits: a save held six seconds by the vaultDB, which then lands, meets a box written elsewhere meanwhile, or is refused. */

import { vaultDB } from './dojo'
import { putBoxElsewhere } from './elsewhere'
import { disarm } from './scenarios'

/** A Forms row's buttons, in order, by the outcome each brings about. */
export const FormOutcomekinds = ['save', 'stale', 'fail'] as const

/** One of a Forms row's buttons. */
export type FormOutcomekind = typeof FormOutcomekinds[number]

/** How a Forms row's last save ended: when, and the `Error` that stopped it, or null for a box stored. */
export type RowOutcome = Readonly<{ at: number, err: Error | null }>

/** The outcome of a save that ends now, stopped by `err` where given. */
export function outcomeNow(err: unknown = null): RowOutcome {
  return { at: Date.now(), err: ((err === null) || (err instanceof Error)) ? err : new Error(`A save threw ${typeof err}, not an Error.`) }
}

/** Arrange `outcomekind` for the next save, by `userid`, of the box at the host labelpath `labelpath`. Call it as the button is pressed, before the form submits. */
export function armOutcome(outcomekind: FormOutcomekind, userid: string | null, labelpath: string): void {
  disarm()
  switch (outcomekind) {
  case 'save': {  vaultDB.holdNextWrite(); return }
  case 'stale': { vaultDB.holdNextWrite(async () => { if (userid !== null) { await putBoxElsewhere(userid, labelpath) } }); return }
  case 'fail': {  vaultDB.holdNextWrite(); vaultDB.refuseNextWrite() }
  }
}
