/** The provider's world: the real giver over a memory vaultDB, a key deriver and a strength checker a test can hold, and a QueryClient of the test's own for the host's. */

import { QueryClient } from '@tanstack/react-query'
import { noop } from 'es-toolkit'
import { onTestFinished, vi } from 'vitest'
import { type BadNewsHandler, Device, type KeyDeriver, type PassphraseVerdict, type RootShelf, type StrengthChecker, type Vault, MemoryVaultDB } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { type BankGiver, type ReactGiver, reactGiver } from '../../src/giver/react-giver'

// == [The key deriver]: HeldDeriver, makeHeldDeriver

/** A key deriver over the core's one-SHA-256 test deriver that counts the passphrases it is given, and that a test can hold mid-derivation. */
export interface HeldDeriver extends KeyDeriver {
  /** How many passphrases it has derived from. */
  readonly heard: number
  /** Hold every derivation from now on until the function returned is called. */
  hold(): () => void
}

/** A {@link HeldDeriver}, holding nothing. */
export function makeHeldDeriver(): HeldDeriver {
  let heard = 0
  let held: Promise<void> | null = null
  return {
    key_deriver_label: LeanTH.testDeriver.key_deriver_label,
    salt_size:         LeanTH.testDeriver.salt_size,
    get heard() { return heard },
    deriveKeyBytes: async (passphrase, saltBytes) => {
      heard += 1
      if (held !== null) { await held }
      return LeanTH.testDeriver.deriveKeyBytes(passphrase, saltBytes)
    },
    hold: () => {
      let release!: () => void
      held = new Promise<void>((resolve) => { release = resolve })
      return () => { held = null; release() }
    },
  }
}
// --

// == [The strength checker]: HeldChecker, makeHeldChecker, heldVerdictOf

/** A strength checker that finds twelve characters or more strong, and that a test can hold or make throw. */
export interface HeldChecker extends StrengthChecker {
  /** Hold every verdict from now on until the function returned is called. */
  hold(): () => void
  /** Throw `err` from every call from now on, or judge again for null. */
  throwing(err: Error | null): void
}

/** A {@link HeldChecker}, holding nothing. */
export function makeHeldChecker(): HeldChecker {
  let held: Promise<void> | null = null
  let thrown: Error | null = null
  const check = async (passphrase: string): Promise<PassphraseVerdict> => {
    if (held !== null) { await held }
    if (thrown !== null) { throw thrown }
    return heldVerdictOf(passphrase)
  }
  return Object.assign(check, {
    hold: () => {
      let release!: () => void
      held = new Promise<void>((resolve) => { release = resolve })
      return () => { held = null; release() }
    },
    throwing: (err: Error | null) => { thrown = err },
  })
}

/** The held checker's verdict: strong at twelve characters or more. */
export function heldVerdictOf(passphrase: string): PassphraseVerdict {
  return (passphrase.length >= 12) ? { strong: true } : { strong: false, reason: 'Twelve characters or more, please.' }
}
// --

/** `Device.make` itself, before any world spies on it. */
const makeDeviceUnspied = Device.make.bind(Device)

// == [The world]: ProviderUser, JokesPath, JokesKey, ProviderWorld, ProviderWorldGiven, buildProviderWorld

/** The userid the world's bank is stored for. */
export const ProviderUser = LeanTH.WorldScope.userid

/** The host's labelpath of the box with the joke service's key. */
export const JokesPath = 'jokes'

/** The joke service's key, an obvious fake: the whisper of the box at {@link JokesPath}. */
export const JokesKey = LeanTH.Whisper.apiKey

/** The real giver of the world's bank, the vaultDB its provider is handed, and what a test watches and holds. */
export interface ProviderWorld {
  SOK:     ReactGiver<'acme'>
  /** The giver's bank, `SOK.bank(...)`. */
  Bank:    BankGiver
  /** The vaultDB to hand the provider, unless the world was built `isInConfig`. */
  vaultDB: MemoryVaultDB
  deriver: HeldDeriver
  checker: HeldChecker
  /** The host's QueryClient, which the form verbs' mutations run in. */
  client:  QueryClient
  /** The host's QueryClient, and the one each device the giver made caches in: every client a secret could reach. */
  clients(): readonly QueryClient[]
  /** How many watches have been opened on {@link vaultDB} since the world was built, one for each device started over it, which its VaultMinder opens, and how many gets it has been asked, of a Thing or of the world. */
  counts:  { watches: number, gets: number }
  /** Pause every get {@link vaultDB} is asked from now on before it reads, until the function returned is called. */
  pauseGets(): () => void
  /** Pause every get {@link vaultDB} is asked from now on after it reads, until the function returned is called: it answers what it read. */
  pauseAnswers(): () => void
  /** The device the giver made first, at a provider's mount: for a test to read its vault TSQ or world once a userid is signed in on it. */
  _cheat_device(): Device
  /** Every device the giver has made, in the order made. */
  _cheat_devices(): readonly Device[]
  /** The vault of another device over {@link vaultDB}, unlocked, for a test to write a box as another tab would; null for a world with no bank stored. */
  _cheat_otherVault: Vault | null
  /** Put the joke service's key at {@link JokesPath} from another device over {@link vaultDB}, unlocked with `passphraseCleartext`, as another tab would: for a bank born since the world was built. */
  _cheat_putJokesKey(passphraseCleartext: string): Promise<void>
}

/** What a {@link buildProviderWorld} stores before the giver starts. */
export interface ProviderWorldGiven {
  /** `'jokes'` stores a bank for {@link ProviderUser}, under {@link LeanTH.TestPassphrase}, with the joke service's key at {@link JokesPath}. `'none'` stores nothing. */
  stored?:         'none' | 'jokes'
  /** Hand the config the world's vaultDB and key deriver, for a provider handed neither. Otherwise the config's are others, never used. */
  isInConfig?:     boolean
  /** False gives the vaultDB no watch of its own, so a device learns of another's writes only by asking: from what its own gets and lists answer, and the watch tells of them. */
  isWatching?:     boolean
  /** The root shelf of every device the giver makes, and of the device that stores `'jokes'`, which puts the bank's roots on it: a page reloaded. */
  rootShelf?:      RootShelf
  /** The host's `onBadNews`, which every device the giver makes is handed. */
  onBadNews?:      BadNewsHandler
}

/** A memory vaultDB that reports no change of its own, as a datastore with no watch: its watches hear only what its verbs notify. */
class UnwatchedVaultDB extends MemoryVaultDB {
  protected override doWatch(): () => void { return noop }
}

/** A giver over nothing yet started, and a vaultDB with what `given` stores. */
export async function buildProviderWorld({ stored = 'none', isInConfig = false, isWatching = true, rootShelf, onBadNews }: ProviderWorldGiven = {}): Promise<ProviderWorld> {
  const vaultDB = isWatching ? new MemoryVaultDB() : new UnwatchedVaultDB()
  let otherVault: Vault | null = null
  if (stored === 'jokes') {
    const { vault } = await LeanTH.buildBornVault({ device: LeanTH.makeDevice({}, { vaultDB, rootShelf }) })
    await vault.putBoxOnce(`box/${JokesPath}`, { sidecar: { service: 'jokes' } }, { whisper: LeanTH.Whisper })
    otherVault = vault
  }
  const counts = { watches: 0, gets: 0 }
  const watch = vaultDB.watch.bind(vaultDB)
  vaultDB.watch = (...args) => {
    counts.watches += 1
    return watch(...args)
  }
  const pauses = { ask: null as Promise<void> | null, answer: null as Promise<void> | null }
  const tryGetThing = vaultDB.tryGetThing.bind(vaultDB)
  vaultDB.tryGetThing = async (ask) => {
    counts.gets += 1
    if (pauses.ask !== null) { await pauses.ask }
    const answering = tryGetThing(ask)
    if (pauses.answer !== null) { await pauses.answer }
    return answering
  }
  const tryGetBank = vaultDB.tryGetBank.bind(vaultDB)
  vaultDB.tryGetBank = async (ask) => {
    counts.gets += 1
    if (pauses.ask !== null) { await pauses.ask }
    const answering = tryGetBank(ask)
    if (pauses.answer !== null) { await pauses.answer }
    return answering
  }
  /** Pause at `pausekind` until the function returned is called. */
  function pauseAt(pausekind: keyof typeof pauses): () => void {
    let release!: () => void
    pauses[pausekind] = new Promise<void>((resolve) => { release = resolve })
    return () => { pauses[pausekind] = null; release() }
  }
  // The giver's device is the first made after this, and a cheat's own device is made by `makeDeviceUnspied`.
  const devices: Device[] = []
  const spy = vi.spyOn(Device, 'make').mockImplementation((...args) => {
    const device = makeDeviceUnspied(...args)
    devices.push(device)
    return device
  })
  onTestFinished(() => { spy.mockRestore() })
  const deriver = makeHeldDeriver()
  const checker = makeHeldChecker()
  const SOK = reactGiver({
    banks:           { acme: { vaultDB: isInConfig ? vaultDB : new MemoryVaultDB() } },
    keyDeriver:      isInConfig ? deriver : LeanTH.testDeriver,
    strengthChecker: checker,
    logger:          LeanTH.quietLogger,
    ...(rootShelf && { rootShelf }),
    ...(onBadNews && { onBadNews }),
  })
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  return {
    SOK, Bank: SOK.bank('acme'), vaultDB, deriver, checker, client, counts, _cheat_otherVault: otherVault,
    pauseGets:      () => pauseAt('ask'),
    pauseAnswers:   () => pauseAt('answer'),
    clients:        () => [client, ...devices.map((device) => device.vaultTsqClient)],
    _cheat_device:  () => devices[0]!,
    _cheat_devices: () => [...devices],
    _cheat_putJokesKey: async (passphraseCleartext) => {
      const device = makeDeviceUnspied({ banklabel: LeanTH.WorldScope.banklabel }, { keyDeriver: LeanTH.testDeriver, logger: LeanTH.quietLogger, vaultDB })
      await device.signin(ProviderUser)
      await device.bank.gate.unlock({ passphraseCleartext })
      await device.vault!.putBoxOnce(`box/${JokesPath}`, { sidecar: { service: 'jokes' } }, { whisper: LeanTH.Whisper })
    },
  }
}
// --
