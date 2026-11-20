/** The bridge: keeps the host's React Query entries of a Device's boxes current with each bank's minder. */

import type { QueryClient, QueryKey } from '@tanstack/react-query'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { dbHasNewer } from 'safebyok'
import { bankQueryKey, boxCarQueryKey, type CarFields, type GiverBank, type GiverDevice, labelpathOfBoxCarQueryKey } from './react-giver'

/** Copy each box car every bank's minder caches into the host's entry for it, wherever a hook has made one. Returns the function that stops copying.
 * It starts with the cars the minder already has, so that an entry a route loader filled before the bridge started shows what the minder heard since.
 * When a bank object ends, its entries are reset, so a hook still showing them fetches again from the bank object that follows.
 */
export function bridgeDevice<CarT extends CarFields>(client: QueryClient, device: GiverDevice<CarT>): () => void {
  const stopsListening = new Set<() => void>()
  const stopStarting = device.onBankStart((bank) => {
    const stopListening = bank.listenBoxCars((labelpath, car) => {
      deliverCar(client, boxCarQueryKey({ userid: bank.userid, banklabel: bank.banklabel, labelpath }), car)
    })
    // Listening comes first, in the same synchronous step: a car that changes after the catch-up is heard, and none can change between.
    catchUpBank(client, bank)
    stopsListening.add(stopListening)
    return () => {
      stopListening()
      stopsListening.delete(stopListening)
      // Reset, not removed: a mounted hook stays attached to its entry.
      void client.resetQueries({ queryKey: bankQueryKey(bank) })
    }
  })
  return () => {
    stopStarting()
    for (const stopListening of stopsListening) { stopListening() }
  }
}

// An entry still waiting on its fetch is left alone: the minder's get answers it with the car the minder has then.
/** Put the car `bank`'s minder has into each of the host's entries of `bank`'s boxes that shows one. */
function catchUpBank<CarT extends CarFields>(client: QueryClient, bank: GiverBank<CarT>): void {
  const entries = client.getQueryCache().findAll({ queryKey: bankQueryKey(bank) })
  for (const entry of entries) {
    const labelpath = labelpathOfBoxCarQueryKey(entry.queryKey)
    if ((labelpath === undefined) || (entry.state.data === undefined)) { continue }
    const car = bank.peekBoxCar(labelpath)
    if (car !== undefined) { deliverCar(client, entry.queryKey, car) }
  }
}

/** Put `car` in the host's entry at `queryKey`, if a hook made one. A car with no record to show is fetched instead; a `bhnd` one shows while the newer record is fetched. */
function deliverCar(client: QueryClient, queryKey: QueryKey, car: CarFields): void {
  if (client.getQueryCache().find({ queryKey, exact: true }) === undefined) { return }
  if (car.liveness !== 'bare') { client.setQueryData(queryKey, car) }
  if (dbHasNewer(car)) { void client.invalidateQueries({ queryKey, exact: true }) }
}
