import { VaultScope, type LeaseRecord, type DeviceRecord } from '../../src/types/types'
import { memoryDeviceDB, type DeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { memoryStore } from '../../src/string-store'
import { Vault } from '../../src/vault'
import type { KeyDeriver } from '../../src/key-deriver'
import * as Scopepath from '../../src/scopepath'
import * as TH from '../test-helpers'

/** Where the vault each world opens, `u1`'s `main`, files its props and each of its boxes. */
export const u1VaultScopepath = Scopepath.vault(TH.scopeOf('u1'))

export const u1BoxScopepath = (boxlabel: string) => Scopepath.box({ ...TH.scopeOf('u1'), boxlabel })

/** Where a row of `u1`'s `main` under `boxlabel` sits, unchecked: for planting a row under a name no maker would file. */
export const u1PlantedScopepath = (boxlabel: string) => Scopepath.withinVaultScopepathPrefix(TH.scopeOf('u1')) + boxlabel

export const isU1Box = Scopepath.withinVaultScopepathPred(TH.scopeOf('u1'))

/** An unsubscribe with nothing to undo. */
export const silence = (): void => undefined

/** A store's subscribe that never rings. */
export const neverRings = () => silence

/**
 * A fresh in-memory world: the store behind the vaultDB, both adapters, a steerable clock, a
 * logger that keeps what it hears, the options a vault opens with (`defaults` among them), an
 * opener, one that unlocks what it opens, the state a vault opened now settles into, the
 * lease this device keeps for `u1`, and a second vaultDB over the same store that hears no
 * change bells, for a device that does not notice another's doings. Unlocks
 * derive through the cheap testDeriver, so the suite is not a benchmark of Argon2id; the real
 * deriver has its own tests in key-deriver.test.ts.
 */
export const makeWorld = (defaults?: Partial<TH.BornVaultOpts>) => {
  const dbStore = memoryStore()
  const vaultDB = localVaultDB({ store: dbStore })
  const deviceDB = memoryDeviceDB()
  let nowMillis = Date.parse('2026-10-14T12:00:00Z')
  const clock = { now: () => nowMillis }
  const advance = (byMillis: number) => { nowMillis += byMillis }
  const { logger, calls: logged } = TH.spyLogger()
  const optsWith = (overrides?: Partial<TH.BornVaultOpts>): TH.BornVaultOpts => (
    { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, requestCleartext: TH.scriptedRequestCleartext, logger, ...defaults, ...overrides }
  )
  const open = (overrides?: Partial<TH.BornVaultOpts>) => TH.settledVault(optsWith(overrides))
  const openUnlocked = async (passphrase: string, overrides?: Partial<TH.BornVaultOpts>) => {
    const vault = await open(overrides)
    await TH.unlock(vault, passphrase)
    return vault
  }
  const getLease = () => TH.expectGood(deviceDB.getLease(TH.scopeOf('u1')))
  const deafVaultDB = () => localVaultDB({ store: { ...dbStore, subscribe: neverRings } })
  const stateOnOpen = async (overrides?: Partial<TH.BornVaultOpts>) => {
    const vault = await open(overrides)
    return TH.stateOf(vault.getSnapshot())
  }
  return { dbStore, vaultDB, deviceDB, clock, advance, logged, optsWith, open, openUnlocked, getLease, stateOnOpen, deafVaultDB }
}

/** Boxlabels in the snapshot, in order. */
export const boxlabelsOf = (vault: Vault) => vault.getSnapshot().boxes.map((summary) => summary.boxlabel)

/** Storage adapters Bank.make refuses: short of a verb the vault calls. */
export const MisfitStores: readonly (readonly [Partial<TH.BornVaultOpts>, string])[] = [
  [{ vaultDB: { getVaultRecord: () => Promise.resolve(null) } as unknown as TH.BornVaultOpts['vaultDB'] }, 'a vaultDB with only some of its verbs'],
  [{ deviceDB: { ...memoryDeviceDB(), delAll: 'never' } as unknown as TH.BornVaultOpts['deviceDB'] }, 'a deviceDB whose delAll is no function'],
  [{ deviceDB: TH.omitting(memoryDeviceDB(), 'getDeviceRecord') }, 'a deviceDB that keeps no device record'],
]

export const HourMillis = 60 * 60 * 1000

export const SevenDaysMillis = 7 * 24 * HourMillis

export const ckeyOf = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`

/**
 * A DeviceDB as a host might write its own: rows kept as handed in, and handed back unchecked, so
 * a test can reach in and spoil one the way a damaged store or an older version would.
 */
export const uncheckingDeviceDB = () => {
  const rows = new Map<string, unknown>()
  const records = new Map<string, unknown>()
  const deviceDB: DeviceDB = {
    getLease: (scope) => { const kept = (rows.get(ckeyOf(scope)) ?? null) as LeaseRecord | null; return Promise.resolve(TH.good(kept)) },
    putLease: (record) => { rows.set(ckeyOf(record), record); return Promise.resolve(TH.good(record)) },
    delLease: (scope) => { rows.delete(ckeyOf(scope)); return Promise.resolve(TH.good(undefined)) },
    getDeviceRecord:   (scope) => { const kept = (records.get(ckeyOf(scope)) ?? null) as DeviceRecord | null; return Promise.resolve(TH.good(kept)) },
    raiseDeviceRecord: (record) => { records.set(ckeyOf(record), record); return Promise.resolve(TH.good(record)) },
    delDeviceRecord:   (scope) => { records.delete(ckeyOf(scope)); return Promise.resolve(TH.good(undefined)) },
    delAll:   () => { rows.clear(); records.clear(); return Promise.resolve(TH.good(undefined)) },
  }
  /** Rewrite the one stored row through `spoil`. */
  const spoilRow = (spoil: (row: Record<string, unknown>) => unknown) => {
    const [[ckey, row]] = [...rows] as [[string, Record<string, unknown>]]
    rows.set(ckey, spoil(row))
  }
  return { deviceDB, rows, spoilRow }
}

/** The stored row of the box `boxlabel`, as the backend holds it. */
export const storedRowOf = (world: ReturnType<typeof makeWorld>, boxlabel: string): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1BoxScopepath(boxlabel)) ?? 'null') as Record<string, unknown>
)

/** The vault's stored props, as the backend holds them. */
export const storedVaultRecordOf = (world: ReturnType<typeof makeWorld>): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1VaultScopepath) ?? 'null') as Record<string, unknown>
)

/** The ckeys of every row `user_id`'s vault has in storage: its vault record and its boxes. */
export const rowsOf = (world: ReturnType<typeof makeWorld>, user_id: string) => (
  world.dbStore.scopepaths().filter((ckey) => ckey === Scopepath.vault(TH.scopeOf(user_id)) || Scopepath.withinVaultScopepathPred(TH.scopeOf(user_id))(ckey))
)

/** u1's stored vault record in `world`, its gate's way in of `wayinkind` spoiled by `spoil`. */
export const spoilWayin = (world: ReturnType<typeof makeWorld>, wayinkind: 'passphrase' | 'passkey', spoil: Record<string, unknown>) => {
  const vaultRecord = JSON.parse(world.dbStore.read(u1VaultScopepath) ?? '{}') as Record<string, unknown> & { gate: Record<string, Record<string, unknown>> }
  world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...vaultRecord, gate: { ...vaultRecord.gate, [wayinkind]: { ...vaultRecord.gate[wayinkind], ...spoil } } }))
}

/** A world whose `u1` vault, with a box and a lease, has had its stored vault record spoiled. */
export const damagedVaultWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
  TH.closeVault(vault)
  world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...storedVaultRecordOf(world), gate_epoch: 'one' }))
  return world
}

/** The verbs Bank.make asks of a VaultDB, and so all a duck-typed one has. */
export const VaultDBVerbsUsed = ['getVault', 'ensureVault', 'putVaultRecord', 'getBox', 'putBox', 'delBox', 'delVault', 'subscribe'] as const

/** The passkey `laptop`, put into `vault` under the passphrase `pw`. */
export const addLaptopPasskey = async (vault: Vault): Promise<void> => {
  await TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
}

/** A vault in a fresh world, unlocked with `pw`, holding one box and the passkey `laptop`. */
export const vaultWithPasskey = async () => {
  const world = makeWorld()
  const vault = await world.open()
  await TH.unlock(vault, 'pw')
  await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
  const laptop = await TH.passkeyOf('laptop')
  await addLaptopPasskey(vault)
  return { world, vault, laptop }
}

/**
 * A world whose slow waits can be held mid-flight, to land a lock inside an unlock: each
 * `holdNext` arms a gate on the next look at the vault record, passphrase derivation, the answer of
 * a lease write, or (to hold a store in hand) read of a box, and hands it back. Its key deriver is its
 * own copy of testDeriver, so a spy on it stays here.
 */
export const makeRacingWorld = (defaults?: Partial<TH.BornVaultOpts>) => {
  const keyDeriver: KeyDeriver = { ...TH.testDeriver }
  const world = makeWorld({ keyDeriver, ...defaults })
  const holdNextLook = () => TH.holdNextCall(world.vaultDB, 'getVault')
  const holdNextDerive = () => TH.holdNextCall(keyDeriver, 'deriveKeyBytes')
  // Held once the store has the lease: the device store applies one scope's calls in the order made.
  const holdNextLease = () => TH.holdNextAnswer(world.deviceDB, 'putLease')
  const holdNextBoxRead = () => TH.holdNextCall(world.vaultDB, 'getBox')
  return { ...world, holdNextLook, holdNextDerive, holdNextLease, holdNextBoxRead }
}

/** The stored vault record's way in of `wayinkind`, as the backend holds it in its gate: null for no passkey, or no gate. */
export const storedWayinOf = (world: ReturnType<typeof makeWorld>, wayinkind: 'passphrase' | 'passkey') => {
  const gate = storedVaultRecordOf(world)['gate'] as Record<string, Record<string, unknown> | null> | null
  return gate === null ? null : gate[wayinkind] ?? null
}

/**
 * A world whose `u1` vault has moved on past a copy of its props: `older`, as stored once a
 * passkey was added, and `newer`, as stored now, the passkey removed, which this device has seen.
 */
export const rolledBackWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await addLaptopPasskey(vault)
  const older = world.dbStore.read(u1VaultScopepath) ?? ''
  await TH.delWayin(vault, 'pw')
  const newer = world.dbStore.read(u1VaultScopepath) ?? ''
  return { world, vault, older, newer }
}
