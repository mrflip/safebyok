import { noop } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import type { PersistedClient } from '@tanstack/query-persist-client-core'
import { MemoryPersister, isPersister } from '../../src/storage/persister'

/** A snapshot of a client holding nothing, saved at `timestamp`. */
function snapshotAt(timestamp: number): PersistedClient { return { timestamp, buster: 'a010501', clientState: { queries: [], mutations: [] } } }

describe("MemoryPersister", () => {
  it("restores nothing until it is handed a snapshot", () => {
    expect(new MemoryPersister().restoreClient()).to.be.undefined
  })

  it("restores a copy of the snapshot last handed it, and nothing once it is removed", () => {
    const persister = new MemoryPersister()
    const snapshot  = snapshotAt(1)
    persister.persistClient(snapshotAt(0))
    persister.persistClient(snapshot)
    snapshot.timestamp = 2
    const restored = persister.restoreClient()!
    expect(restored).to.deep.equal(snapshotAt(1))
    restored.timestamp = 3
    expect(persister.restoreClient()).to.deep.equal(snapshotAt(1))
    persister.removeClient()
    expect(persister.restoreClient()).to.be.undefined
  })
})

describe("isPersister(val)", () => {
  it("holds of an object with each of a Persister's three functions", () => {
    expect(isPersister(new MemoryPersister())).to.be.true
    expect(isPersister({ persistClient: noop, restoreClient: noop, removeClient: noop })).to.be.true
  })

  it("fails for anything else", () => {
    for (const val of [null, undefined, 'persister', {}, { persistClient: noop, restoreClient: noop }, { persistClient: noop, restoreClient: noop, removeClient: true }]) {
      expect(isPersister(val)).to.be.false
    }
  })
})
