import { DeviceDB, type DeviceRow, type FoundRow } from './devicedb'

/** A {@link DeviceDB} over a Map, which remembers nothing past the page: for tests, and wherever IndexedDB is missing or blocked.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 */
export const memoryDeviceDB = (): DeviceDB => new MemoryDeviceDB()

/** The DeviceDB {@link memoryDeviceDB} makes: each `do*` method does its whole work in one synchronous step, which is its transaction. */
class MemoryDeviceDB extends DeviceDB {
  readonly #rows = new Map<string, unknown>()

  protected doGet(scopepath: string): Promise<unknown> {
    return Promise.resolve(this.#rows.get(scopepath))
  }

  protected doPut(scopepath: string, row: DeviceRow): Promise<void> {
    this.#rows.set(scopepath, row)
    return Promise.resolve()
  }

  protected doUpdate(scopepath: string, updatedFrom: (stored: unknown) => DeviceRow): Promise<void> {
    this.#rows.set(scopepath, updatedFrom(this.#rows.get(scopepath)))
    return Promise.resolve()
  }

  protected doDel(scopepath: string): Promise<void> {
    this.#rows.delete(scopepath)
    return Promise.resolve()
  }

  protected doFind(prefix: string): Promise<readonly FoundRow[]> {
    const found = [...this.#rows].filter(([scopepath]) => scopepath.startsWith(prefix)).map(([scopepath, row]) => ({ scopepath, row }))
    return Promise.resolve(found)
  }

  protected doDelDamaged(scopepath: string, isSound: (row: unknown) => boolean): Promise<void> {
    if (! isSound(this.#rows.get(scopepath))) { this.#rows.delete(scopepath) }
    return Promise.resolve()
  }

  protected doDelAll(): Promise<void> {
    this.#rows.clear()
    return Promise.resolve()
  }
}
