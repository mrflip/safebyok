/** The bridge: keeps the host's React Query items of a Device's boxes and main gate, and its listing of the boxes, current with its bank's minder. */

import type { QueryClient } from '@tanstack/react-query'
import { type GateRecord, type ListingEvent, type MinderEvent, MinderEventFormat, ThingMinder, bulletproofHandlerOf } from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import { gateShownOf } from './giver-defaults'
import type { GiverEvent } from './shapes-giver'

/** Keep the host's React Query items of the boxes and the main gate `minder` minds, and its listing of the boxes, in step with it. Returns the function that stops it.
 * Start it before the minder's first get: a record cached before is copied only when it next changes.
 * What a delivery throws goes to `tellBadNews`, as what a listener throws goes to the bank's.
 */
export function bridgeMinder(client: QueryClient, minder: ThingMinder, tellBadNews: (badnews: readonly unknown[]) => void): () => void {
  const deliverOrTell = bulletproofHandlerOf(deliver, { ifError: 'tell', transformer: sanitizeForeignError, onBadNews: (err) => { tellBadNews([err]) } })
  return minder.listen((event) => {
    // Delivered a microtask later, out of the minder's own notification: an invalidation here runs the host's queryFn,
    // whose get would otherwise start inside it. Without it the get still works. A pragmatic fix, to go if it causes
    // other problems. Out of the minder's own wrapper, so it has one of its own. #not-a-crossing #pragmatic-fix
    queueMicrotask(() => { deliverOrTell(client, minder, event) })
  }, MinderEventFormat)
}

/** Hand the minder's event to the host's item it concerns, if any. */
function deliver(client: QueryClient, minder: ThingMinder, event: MinderEvent): void {
  if (event.eventkind === 'list') {
    if ((event.modelkind === 'box') && (! minder.isListingBareAt(event))) { deliverListing(client, event) }
    return
  }
  if (event.modelkind === 'box') { deliverEvent(client, event, boxShownOfData) } else if (event.modelkind === 'gate') { deliverEvent(client, event, gateShownOfData) }
}

/** A box's record as the host's item holds it: whole. */
function boxShownOfData(record: unknown): unknown { return record }

/** The main gate as the host's item holds it: without each wayin's wrapped bankKey. */
function gateShownOfData(record: unknown): unknown { return gateShownOf(record as GateRecord) }

// The bridge acts only on an update. A removal is the minder letting go of an item it no longer needs, not news of the
// vaultDB: it tells the last record, but the host's item goes on showing it, as long as the host's options say, and a mounted
// hook does not flicker back to pending. A query added has nothing yet, and a fetch starting changes no record.
// A soon's key is not the host's: its success invalidates the host's item of the Thing, which an active hook then
// refetches, even where a refused get left the item invalidated and its falling behind tells nothing. That invalidation
// leaves a refetch under way running. The item's falling behind cancels one: the minder may have answered it from the older
// item, and a hook would show that record until it next mounted.
// A refused get refetches nothing: the host's own fetch may be the one just refused, and would only ask again.
/** Put the event's record in the host's item for it, as `shownOf` shows it, if a hook made one, or invalidate the host's item where the minder heard of a newer revision or a get of the minder's item was refused. */
function deliverEvent(client: QueryClient, event: GiverEvent, shownOf: (record: unknown) => unknown): void {
  const { type, action, queryKey, userid, banklabel, labelpath, state: { data: record, dataUpdatedAt } } = event
  if (type !== 'updated') { return }
  if (event.eventkind === 'soon') {
    if (action?.type === 'success') { void client.invalidateQueries({ queryKey: ThingMinder.itemQueryKeyOf({ userid, banklabel, labelpath }), exact: true }, { cancelRefetch: false }) }
    return
  }
  if (client.getQueryCache().find({ queryKey, exact: true }) === undefined) { return }
  if (action?.type === 'invalidate') { void client.invalidateQueries({ queryKey, exact: true }) }
  if (action?.type === 'error')      { void client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' }, { cancelRefetch: false }) }
  // When the minder heard of the record, not when it reached the host.
  if ((record !== undefined) && (action?.type === 'success')) { client.setQueryData(queryKey, shownOf(record), { updatedAt: dataUpdatedAt }) }
}

// A listing's key is the host's key for it too, and its listed time is when a list last set it, which a box joining
// leaves as it was. A bare listing, seeded by the minder's `hello` before any list, is not delivered: the host's item
// stays pending until its own fetch lists the whole of it.
/** Put the listing in the host's item of it, if a hook made one, or invalidate that item where the minder marked the listing stale. */
function deliverListing(client: QueryClient, event: ListingEvent): void {
  const { type, action, queryKey, state: { data: labelpaths, dataUpdatedAt } } = event
  if ((type !== 'updated') || (client.getQueryCache().find({ queryKey, exact: true }) === undefined)) { return }
  if (action?.type === 'invalidate') { void client.invalidateQueries({ queryKey, exact: true }) }
  if ((labelpaths !== undefined) && (action?.type === 'success')) { client.setQueryData(queryKey, labelpaths, { updatedAt: dataUpdatedAt }) }
}
