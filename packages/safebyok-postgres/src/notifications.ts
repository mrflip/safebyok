/** The Postgres notifications each write sends on its user's channel, and how a watch reads one. */

import { type ThingWatchScope, objCheck } from 'safebyok/storage'

// == [Channels]: thingsChannelOf

// Postgres identifiers are at most 63 bytes. A userid whose channel name is longer cannot be notified, so a write that would notify for it fails.
/** The channel Postgres notifies of each write to `userid`'s Things: the one to LISTEN on for a watch of their banks. */
export function thingsChannelOf(userid: string): string { return `safebyok_things_${userid}` }
// --

// == [Notifications]: ThingNotification, thingNotificationOf, jsonOrNull

// Each notification is made by the `tell_thing` function in `vault-functions.ts`: a JSON object with the Thing's scope
// under `at`, when Postgres read it under `read_tc`, and the Thing under `thing` and its bank's raw row under `bank`, unless
// they would make the notification too long.

// AdapterVaultDB checks the read_tc and the Thing.
/** A notification of a write: the labelpath of the Thing written, when Postgres read it, and the Thing and its bank's raw row where they fit. */
export type ThingNotification = { labelpath: string, read_tc?: unknown, thing?: unknown, bank?: unknown }

const thingNotificationCheck = objCheck(({ obj, str, unk }) => ({
  at:      obj({ userid: str, banklabel: str, labelpath: str }),
  read_tc: unk.optional(),
  thing:   unk.optional(),
  bank:    unk.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** The notification in `text` of a write in `scope`'s bank, or null for a write in another bank or a text that is no notification. */
export function thingNotificationOf({ userid, banklabel }: ThingWatchScope, text: string): ThingNotification | null {
  const notificationReport = thingNotificationCheck.safeParse(jsonOrNull(text))
  if (! notificationReport.success) { return null }
  const { at, ...carried } = notificationReport.data
  if ((at.userid !== userid) || (at.banklabel !== banklabel)) { return null }
  return { labelpath: at.labelpath, ...carried }
}

/** The JSON value in `text`, or null where it is not JSON. */
function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { return null }
}
// --
