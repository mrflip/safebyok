/** The Postgres notifications each write sends on its user's channel, and how a watch reads one. */

import { type ThingWatchScope, type Thingkind, objCheck, thingkindVals } from 'safebyok/storage'

// == [Channels]: thingsChannelOf

// Postgres identifiers are at most 63 bytes. A userid whose channel name is longer cannot be notified, so a write that would notify for it fails.
/** The channel Postgres notifies of each write to `userid`'s Things: the one to LISTEN on for a watch of their banks. */
export function thingsChannelOf(userid: string): string { return `safebyok_things_${userid}` }
// --

// == [Notifications]: ThingNotification, thingNotificationOf, jsonOrNull

// Each notification is made by the `tell_thing` function in `vault-functions.ts`: a JSON object with the Thing's scope under
// `at`, its modelkind its table's, when Postgres read it under `read_tc`, and the Thing under `thing` and its bank's part
// under `bank` (its gate's banktok, labelpath, lifepath, revseq and revtok), unless they would make the notification too
// long. A watch reads only the bank's banktok.

// AdapterVaultDB checks the read_tc, the Thing and the banktok.
/** A notification of a write: the modelkind and labelpath of the Thing written, when Postgres read it, and the Thing and its bank's banktok where they fit. */
export type ThingNotification = { modelkind: Thingkind, labelpath: string, read_tc?: unknown, thing?: unknown, banktok?: unknown }

const thingNotification = objCheck(({ obj, str, unk, oneof }) => ({
  at:      obj({ userid: str, banklabel: str, modelkind: oneof(thingkindVals), labelpath: str }),
  read_tc: unk.optional(),
  thing:   unk.optional(),
  bank:    obj({ banktok: unk }).optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** The notification in `text` of a write in `scope`'s bank, or null for a write in another bank or a text that is no notification. */
export function thingNotificationOf({ userid, banklabel }: ThingWatchScope, text: string): ThingNotification | null {
  const notificationReport = thingNotification.safeParse(jsonOrNull(text))
  if (! notificationReport.success) { return null }
  const { at, bank, ...carried } = notificationReport.data
  if ((at.userid !== userid) || (at.banklabel !== banklabel)) { return null }
  return { modelkind: at.modelkind, labelpath: at.labelpath, ...carried, ...bank }
}

/** The JSON value in `text`, or null where it is not JSON. */
function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { return null }
}
// --
