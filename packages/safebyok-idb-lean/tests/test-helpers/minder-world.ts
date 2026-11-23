/** The world of an IdbMinderBridge under test. */
import { vi } from 'vitest'
import { BankMinder, type MinderFriend, type VaultError, VaultMinder } from 'safebyok'
import { type Labelpath, MemoryVaultDB, Shell, getAskOf, listAskOf } from 'safebyok/storage'
import { BoxScope, ThingBank, birthAskOf, birthBankAskOf, boxThingOf, expectGood, rootBoxOf, trackOf } from 'safebyok/testing'
import type { IdbVaultDB } from '../../src/idb-vault-db'
import { IdbMinderBridge } from '../../src/idb-minder-bridge'
import { makeIdbVaultDB } from './idb-world'

/** A fake bank for a VaultMinder. Its asks track the roots at revision 0, and `tellBadNews` is a spy. */
export function fakeBankOf() {
  return {
    scope:       { ...ThingBank },
    makeGetAsk:  (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => getAskOf({ ...args, ...ThingBank, track: trackOf() }),
    makeListAsk: (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => listAskOf({ ...args, ...ThingBank, track: trackOf() }),
    tellBadNews: vi.fn<(badnews: readonly unknown[]) => void>(),
  } satisfies MinderFriend
}

/** A bridge under test, with its minder, its IdbVaultDB, the minder's vaultDB and bank, and the `onBadNews` spy. */
export interface BridgedWorld {
  vaultDB:    MemoryVaultDB
  bank:       ReturnType<typeof fakeBankOf>
  minder:     VaultMinder
  idbVaultDB: IdbVaultDB
  onBadNews:  ReturnType<typeof vi.fn<(news: VaultError) => void>>
  bridge:     IdbMinderBridge
}

/** A minder bridged to a fresh IdbVaultDB, over a MemoryVaultDB holding a born bank and box `boxThingOf()`.
 * - `isStarted`      -- the bridge and the minder are said hello to (default: true)
 * - `isBadNewsHeard` -- the bridge is made with the `onBadNews` spy (default: true)
 */
export async function bridgedWorldOf({ isStarted = true, isBadNewsHeard = true } = {}): Promise<BridgedWorld> {
  const vaultDB    = new MemoryVaultDB()
  const bank       = fakeBankOf()
  const bankMinder = BankMinder.make({ vaultDB }, bank)
  bankMinder.hello()
  await expectGood(bankMinder.tryBirthBank(birthBankAskOf()))
  const boxAsk = birthAskOf(boxThingOf(), Shell.of(BoxScope, rootBoxOf()))
  await expectGood(vaultDB.tryWriteThing(boxAsk))
  const minder     = VaultMinder.make({ vaultDB, bankMinder }, bank)
  const idbVaultDB = makeIdbVaultDB()
  const onBadNews  = vi.fn<(news: VaultError) => void>()
  const bridge     = IdbMinderBridge.make({ minder, idbVaultDB, ...(isBadNewsHeard && { onBadNews }) })
  if (isStarted) {
    bridge.hello()
    minder.hello()
  }
  return { vaultDB, bank, minder, idbVaultDB, onBadNews, bridge }
}
