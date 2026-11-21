/** The bridge: keeps the host's React Query items of a Device's boxes current with its bank's minder. */

import type { QueryClient } from '@tanstack/react-query'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { dbHasNewer } from 'safebyok'
import { bankQueryKey } from './react-giver'
import type { CarFields, GiverDevice, GiverEvent } from './shapes-giver'

/** Copy each box car the bank's minder caches into the host's item for it, wherever a hook has made one. Returns the function that stops copying.
 * It starts by invalidating each item that shows a car, so one a route loader filled before the bridge started catches up with the minder.
 * When a bank object ends, its items are reset, so a hook still showing them fetches again from the bank object that follows.
 */
export function bridgeDevice<CarT extends CarFields>(client: QueryClient, device: GiverDevice<CarT>): () => void {
  const bankHead = bankQueryKey(device)
  const stopsListening = new Set<() => void>()
  const stopStarting = device.onBankStart((bank) => {
    const stopListening = bank.listenBoxCars((event) => { deliverEvent(client, event) })
    // Listening comes first, in the same synchronous step: a car that changes after the catch-up is heard, and none can change
    // between. The minder answers the refetch of a timely car it has at once, without asking the vaultDB. An item still
    // waiting on its fetch is left to it: the minder answers that with the car it has then.
    void client.invalidateQueries({ queryKey: bankHead, predicate: (entry) => entry.state.data !== undefined }, { cancelRefetch: false })
    stopsListening.add(stopListening)
    return () => {
      stopListening()
      stopsListening.delete(stopListening)
      // Reset, not removed: a mounted hook stays attached to its item.
      void client.resetQueries({ queryKey: bankHead })
    }
  })
  return () => {
    stopStarting()
    for (const stopListening of stopsListening) { stopListening() }
  }
}

// A removal is the minder letting go of a car it no longer needs, not news of the vaultDB, so the host's item goes on showing
// its car: the host's cache retains it as long as the host's options say, and a mounted hook does not flicker back to pending.
/** Put the event's car in the host's item for it, if a hook made one.
 * A `bare` car, with no record to show, is fetched instead. A `bhnd` car shows while the newer record is fetched.
 */
function deliverEvent(client: QueryClient, event: GiverEvent<CarFields>): void {
  const { type, queryKey, state: { data: car, dataUpdatedAt } } = event
  if ((type === 'removed') || (car === undefined) || (client.getQueryCache().find({ queryKey, exact: true }) === undefined)) { return }
  // When the minder received the car, not when it reached the host.
  if (car.liveness !== 'bare') { client.setQueryData(queryKey, car, { updatedAt: dataUpdatedAt }) }
  if (dbHasNewer(car)) { void client.invalidateQueries({ queryKey, exact: true }) }
}
