/** A vaultDB in this tab's memory, saved to localStorage after each write, so a reload finds the vault again. Demo code: a real host stores its vault on its backend. */

import { type BirthBankAsk, type BirthManifest, type BirthPuts, type Labelpath, MemoryDatastore, MemoryVaultDB, type ThingWatchScope, type WriteAsk, type WriteManifest } from 'safebyok/storage'

/** The prefix of each bank's entry in localStorage. */
const SavedPrefix = 'envman:vault:'

/** One bank's entry in localStorage: its scope, and its Things by labelpath. */
type SavedBank = Readonly<{ userid: string, banklabel: string, things: [Labelpath, unknown][] }>

// Cheat (react_life): the new core has no browser vaultDB yet. This one reaches into the memory vaultDB's Things through
// its test door, `_cheat_things`, to load and save them. Another tab writing meanwhile is not heard, and the last tab to write wins.
/** A {@link MemoryVaultDB} that loads every bank saved in `storage` when made, and saves a bank's Things to it after each write there. */
export class LocalStorageVaultDB extends MemoryVaultDB {
  readonly #storage: Storage

  constructor(storage: Storage = globalThis.localStorage) {
    super()
    this.#storage = storage
    for (const saved of savedBanksIn(storage)) {
      const things = this._cheat_things(saved)
      for (const [labelpath, raw] of saved.things) { things.set(labelpath, raw) }
    }
  }

  protected override doWriteThing(ask: WriteAsk): WriteManifest {
    const manifest = super.doWriteThing(ask)
    this.#save(ask)
    return manifest
  }

  protected override doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthManifest {
    const manifest = super.doBirthBank(ask, puts)
    this.#save(ask)
    return manifest
  }

  /** Save the Things of `scope`'s bank to storage. */
  #save({ userid, banklabel }: ThingWatchScope): void {
    const saved: SavedBank = { userid, banklabel, things: [...this._cheat_things({ userid, banklabel })] }
    this.#storage.setItem(`${SavedPrefix}${MemoryDatastore.ckeyOf({ userid, banklabel })}`, JSON.stringify(saved))
  }
}

/** Every bank saved in `storage`, skipping an entry that does not parse: a vault saved by an older demo reads as absent. */
function savedBanksIn(storage: Storage): SavedBank[] {
  const saved: SavedBank[] = []
  for (let ii = 0; ii < storage.length; ii += 1) {
    const ckey = storage.key(ii)
    if (ckey?.startsWith(SavedPrefix) !== true) { continue }
    try {
      const bank = JSON.parse(storage.getItem(ckey) ?? 'null') as Partial<SavedBank> | null
      if ((typeof bank?.userid === 'string') && (typeof bank.banklabel === 'string') && Array.isArray(bank.things)) { saved.push(bank as SavedBank) }
    } catch {
      // A mangled entry reads as no bank.
    }
  }
  return saved
}
