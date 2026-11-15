

```ts
import { QueryClient } from '@tanstack/query-core'

export class ThingCache {

  constructor({ vaultDB, queryClient }) {
    // assign/adorn { vaultDB, queryClient, stopWatching: undefined, greeted: false }
  }

  hello() {
    const this = this.#this
    if (this.greeted) { return this }
    this.queryClient ??= new QueryClient()
    this.stopWatching  = this.vaultDB.watch?.((event) => this.notify(event))
    const shared = { gcTime: Infinity, staleTime: (this.stopWatching ? Infinity : STALE_MS) }
    this.queryClient.setQueryDefaults(['safebyok', this.modelkind, 'get'], { ...shared, structuralSharing: laterOf })
    this.queryClient.setQueryDefaults(['safebyok', this.modelkind, 'list'], { ...shared, structuralSharing: laterRowsOf })
    this.greeted = true
    return this
  }

  goodbye() {
    this.stopWatching?.()
    this.queryClient.removeQueries({ queryKey: BOX_QK })
    this.queryClient.removeQueries({ queryKey: LISTING_QK })
    this.stopWatching = undefined
    this.greeted      = false
  }

  queryKey(scoped) { return ['safebyok', this.modelkind] } // override

  async get(scoped) {
    return this.#this.queryClient.ensureQueryData(this.#boxQuerier(scoped))
  }

  at(scoped) {
    return this.#this.queryClient.getQueryData(boxQK(scoped))
  }

  async list(parentpath) {
    return this.#this.queryClient.ensureQueryData(this.#listingQuerier(parentpath))
  }

  async put({ scopepath, props }) {
    const expected         = expectationFor(this.at(scopepath))
    const { val, outcome } = await this.#this.vaultDB.put({ scopepath, props, expected })
    return { val: this.#ingest(val), outcome }
  }

  notify(answer) {
    this.#deliver(answer)
  }

  #deliver(answer) {
    const scope  = this.scopeFor(answer)
    const actual = this.queryClient.setQueryData(this.queryKey(answer), answer)
    queryClient.setQueryData(listingQK(scope), (rows) => (rows && upsertRow(rows, sparseFor(actual))))
    return kept
  }

  #doGetThing(ask) {
    const answer = await this.#this.vaultDB.tryGet(ask)
    this.#deliver(answer)
  }

  #boxQuerier(scopepath) {
    const scope = scopeFor(scopepath)
    return {
      queryKey: boxQK(scope),
      queryFn: async () => this.doGetThing(scopepath)
    }
  }

  #listingQuerier(parentpath) {
    const { vaultDB, queryClient } = this.#this
    const queryFn = async () => {
      const fetchedRows = await vaultDB.list({ parentpath })
      const result = queryClient.getQueriesData({ queryKey: boxQK({ parentpath }) })
      const sparseRecords = result.map(([_queryKey, val]) => val).filter(Boolean).map(sparseFor)
      return laterRowsOf(fetchedRows, sparseRecords)
    }
    return { queryKey: listingQK({ parentpath }), queryFn }
  }
}

```