import { VaultScope, type Lease, type DeviceMark } from '../../src/types'
import { memoryDeviceDB, type DeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/vault-db'
import { memoryStore } from '../../src/string-store'
import { type MakeVaultOpts, Vault } from '../../src/vault'
import type { KeyDeriver } from '../../src/key-deriver'
import * as Ckeys from '../../src/ckeys'
import * as TH from '../test-helpers'

/** Where the vault each world opens, `u1`'s `main`, files its props and each of its lockboxes. */
export const u1VaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))

export const u1BoxCkey = (boxlabel: string) => Ckeys.box(TH.scopeOf('u1'), boxlabel)

export const isU1Box = Ckeys.isBoxIn(TH.scopeOf('u1'))

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
export const makeWorld = (defaults?: Partial<MakeVaultOpts>) => {
  const dbStore = memoryStore()
  const vaultDB = localVaultDB({ store: dbStore })
  const deviceDB = memoryDeviceDB()
  let nowMillis = Date.parse('2026-10-14T12:00:00Z')
  const clock = { now: () => nowMillis }
  const advance = (byMillis: number) => { nowMillis += byMillis }
  const { logger, calls: logged } = TH.spyLogger()
  const optsWith = (overrides?: Partial<MakeVaultOpts>): MakeVaultOpts => (
    { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest, logger, ...defaults, ...overrides }
  )
  const open = (overrides?: Partial<MakeVaultOpts>) => TH.settledVault(optsWith(overrides))
  const openUnlocked = async (passphrase: string, overrides?: Partial<MakeVaultOpts>) => {
    const vault = await open(overrides)
    await vault.unlock(passphrase)
    return vault
  }
  const readLease = () => deviceDB.readLease(TH.scopeOf('u1'))
  const deafVaultDB = () => localVaultDB({ store: { ...dbStore, subscribe: neverRings } })
  const stateOnOpen = async (overrides?: Partial<MakeVaultOpts>) => {
    const vault = await open(overrides)
    return vault.getSnapshot().state
  }
  return { dbStore, vaultDB, deviceDB, clock, advance, logged, optsWith, open, openUnlocked, readLease, stateOnOpen, deafVaultDB }
}

/** Boxlabels in the snapshot, in order. */
export const boxlabelsOf = (vault: Vault) => vault.getSnapshot().boxes.map((summary) => summary.boxlabel)

/** Storage adapters Vault.make refuses: short of a verb the vault calls. */
export const MisfitStores: readonly (readonly [Partial<MakeVaultOpts>, string])[] = [
  [{ vaultDB: { readVaultProps: () => Promise.resolve(null) } as unknown as MakeVaultOpts['vaultDB'] }, 'a vaultDB with only some of its verbs'],
  [{ deviceDB: { ...memoryDeviceDB(), eraseAll: 'never' } as unknown as MakeVaultOpts['deviceDB'] }, 'a deviceDB whose eraseAll is no function'],
  [{ deviceDB: TH.omitting(memoryDeviceDB(), 'readMark') }, 'a deviceDB that keeps no device mark'],
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
  const marks = new Map<string, unknown>()
  const deviceDB: DeviceDB = {
    readLease:  (scope) => Promise.resolve((rows.get(ckeyOf(scope)) ?? null) as Lease | null),
    writeLease: (lease) => { rows.set(ckeyOf(lease), lease); return Promise.resolve() },
    eraseLease: (scope) => { rows.delete(ckeyOf(scope)); return Promise.resolve() },
    readMark:   (scope) => Promise.resolve((marks.get(ckeyOf(scope)) ?? null) as DeviceMark | null),
    writeMark:  (mark) => { marks.set(ckeyOf(mark), mark); return Promise.resolve() },
    eraseMark:  (scope) => { marks.delete(ckeyOf(scope)); return Promise.resolve() },
    eraseAll:   () => { rows.clear(); marks.clear(); return Promise.resolve() },
  }
  /** Rewrite the one stored row through `spoil`. */
  const spoilRow = (spoil: (row: Record<string, unknown>) => unknown) => {
    const [[ckey, row]] = [...rows] as [[string, Record<string, unknown>]]
    rows.set(ckey, spoil(row))
  }
  return { deviceDB, rows, spoilRow }
}

/** The stored row of the lockbox `boxlabel`, as the backend holds it. */
export const storedRowOf = (world: ReturnType<typeof makeWorld>, boxlabel: string): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1BoxCkey(boxlabel)) ?? 'null') as Record<string, unknown>
)

/** The vault's stored props, as the backend holds them. */
export const storedVaultPropsOf = (world: ReturnType<typeof makeWorld>): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? 'null') as Record<string, unknown>
)

/** The ckeys of every row `userId`'s vault has in storage: its vault props and its lockboxes. */
export const rowsOf = (world: ReturnType<typeof makeWorld>, userId: string) => (
  world.dbStore.ckeys().filter((ckey) => ckey === Ckeys.vaultProps(TH.scopeOf(userId)) || Ckeys.isBoxIn(TH.scopeOf(userId))(ckey))
)

/** A world whose `u1` vault, with a lockbox and a lease, has had its stored vault props spoiled. */
export const damagedVaultWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  vault.close()
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), unlock_epoch: 'one' }))
  return world
}

/** The verbs Vault.make asks of a VaultDB, and so all a duck-typed one has. */
export const VaultDBVerbsUsed = ['readVaultProps', 'fetchOrCreateVaultProps', 'updateVaultProps', 'readBox', 'listBoxes', 'updateBox', 'retireBox', 'retireVault', 'subscribe'] as const

/** The wayinlabels a vault's snapshot lists, in order. */
export const wayinlabelsOf = (vault: Vault) => vault.getSnapshot().wayins.map((summary) => summary.wayinlabel)

/** The wayin_id of the passkey `laptop` that `vault` adds under the passphrase `pw`; fails the test when it adds none. */
export const addLaptopPasskey = async (vault: Vault): Promise<string> => {
  const wayinId = await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { wayinlabel: 'laptop' })
  if (wayinId === null) { throw new Error('addPasskey added no passkey') }
  return wayinId
}

/** A vault in a fresh world, unlocked with `pw`, holding one lockbox and a passkey labelled `laptop`. */
export const vaultWithPasskey = async () => {
  const world = makeWorld()
  const vault = await world.open()
  await vault.unlock('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  const laptop = await TH.passkeyOf('laptop')
  const wayinId = await addLaptopPasskey(vault)
  return { world, vault, laptop, wayinId }
}

/**
 * A world whose slow waits can be held mid-flight, to land a lock inside an unlock: each
 * `holdNext` arms a gate on the next look at the vault props, passphrase derivation, device-record
 * write, or (to hold a store in hand) read of a lockbox, and hands it back. Its key deriver is its
 * own copy of testDeriver, so a spy on it stays here.
 */
export const makeRacingWorld = (defaults?: Partial<MakeVaultOpts>) => {
  const keyDeriver: KeyDeriver = { ...TH.testDeriver }
  const world = makeWorld({ keyDeriver, ...defaults })
  const holdNextLook = () => TH.holdNextCall(world.vaultDB, 'readVaultProps')
  const holdNextDerive = () => TH.holdNextCall(keyDeriver, 'deriveKeyBytes')
  const holdNextLease = () => TH.holdNextCall(world.deviceDB, 'writeLease')
  const holdNextBoxRead = () => TH.holdNextCall(world.vaultDB, 'readBox')
  return { ...world, holdNextLook, holdNextDerive, holdNextLease, holdNextBoxRead }
}

/** The lock generation of this world's device mark for `u1`'s vault; undefined with no mark. */
export const generationOf = async (world: ReturnType<typeof makeWorld>) => {
  const mark = await world.deviceDB.readMark(TH.scopeOf('u1'))
  return mark?.lock_generation
}

/** The stored vault props' ways in, as the backend holds them. */
export const storedWayinsOf = (world: ReturnType<typeof makeWorld>) => storedVaultPropsOf(world)['wayins'] as Record<string, unknown>[]
