/** The bridge: keeps the host's React Query entries of a Device's boxes current with each bank's minders. */

import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { bankQueryKey, boxCarQueryKey, type CarFields, type GiverDevice } from './react-giver'

/** Copy each box car every bank's minders cache into the host's entry for it, wherever a hook has made one. Returns the function that stops copying.
 * When a bank object ends, its entries are reset, so a hook still showing them fetches again from the bank object that follows.
 */
export function bridgeDevice<CarT extends CarFields>(client: QueryClient, device: GiverDevice<CarT>): () => void {
  const stopsListening = new Set<() => void>()
  const stopStarting = device.onBankStart((bank) => {
    const stopListening = bank.listenBoxCars((labelpath, car) => {
      deliverCar(client, boxCarQueryKey({ userid: bank.userid, banklabel: bank.banklabel, labelpath }), car)
    })
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

/** Put `car` in the host's entry at `queryKey`, if a hook made one. A car with no record to show is fetched instead; one behind shows while the newer record is fetched. */
function deliverCar(client: QueryClient, queryKey: QueryKey, car: CarFields): void {
  if (client.getQueryCache().find({ queryKey, exact: true }) === undefined) { return }
  if (car.liveness !== 'bare') { client.setQueryData(queryKey, car) }
  if (isDBNewer(car)) { void client.invalidateQueries({ queryKey, exact: true }) }
}

/** True when the vaultDB holds a newer revision than the car's fullest record. */
function isDBNewer(car: CarFields): boolean { return (car.liveness === 'behind') || (car.liveness === 'bare') }
