/** The bridge: keeps the host's React Query items of a Device's boxes current with its bank's minder. */

import type { QueryClient } from '@tanstack/react-query'
import { MinderEventFormat, type ThingMinder } from 'safebyok'
import { boxQueryKeyOf } from './giver-defaults'
import type { GiverEvent } from './shapes-giver'

/** Keep the host's React Query items of the boxes `minder` minds in step with it. Returns the function that stops it.
 * Start it before the minder's first get: a record cached before is copied only when it next changes.
 */
export function bridgeMinder(client: QueryClient, minder: ThingMinder): () => void {
  return minder.listen((event) => {
    if ((event.eventkind !== 'list') && (event.modelkind === 'box')) { deliverEvent(client, event) }
  }, MinderEventFormat)
}

// The bridge acts only on an update. A removal is the minder letting go of an item it no longer needs, not news of the
// vaultDB: it tells the last record, but the host's item goes on showing it, as long as the host's options say, and a mounted
// hook does not flicker back to pending. A query added has nothing yet, and a fetch starting changes no record.
// A soon's key is not the host's: its success invalidates the host's item of the box, which an active hook then
// refetches, even where a refused get left the item invalidated and its falling behind tells nothing. That invalidation
// leaves a refetch under way running. The item's falling behind cancels one: the minder may have answered it from the older
// item, and a hook would show that record until it next mounted.
// A refused get refetches nothing: the host's own fetch may be the one just refused, and would only ask again.
/** Put the event's record in the host's item for it, if a hook made one, or invalidate the host's item where the minder heard of a newer revision or a get of the minder's item was refused. */
function deliverEvent(client: QueryClient, event: GiverEvent): void {
  const { type, action, queryKey, userid, banklabel, labelpath, state: { data: record, dataUpdatedAt } } = event
  if (type !== 'updated') { return }
  if (event.eventkind === 'soon') {
    if (action?.type === 'success') { void client.invalidateQueries({ queryKey: boxQueryKeyOf({ userid, banklabel, labelpath }), exact: true }, { cancelRefetch: false }) }
    return
  }
  if (client.getQueryCache().find({ queryKey, exact: true }) === undefined) { return }
  if (action?.type === 'invalidate') { void client.invalidateQueries({ queryKey, exact: true }) }
  if (action?.type === 'error')      { void client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' }, { cancelRefetch: false }) }
  // When the minder heard of the record, not when it reached the host.
  if ((record !== undefined) && (action?.type === 'success')) { client.setQueryData(queryKey, record, { updatedAt: dataUpdatedAt }) }
}
