/** The knock-knock app's world: the real core's Device, its bank born over a memory vaultDB and locked, the vault with the joke service's key, and the giver's view of that Device. */

import { onTestFinished } from 'vitest'
import type { Bank, BoxCar, Device, DeviceSnapshot, KeyDeriver, Vault } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { giverBankOfVault } from '../../src/giver/minder-bank'
import type { GiverBank, GiverDevice } from '../../src/giver/shapes-giver'

// == [The key deriver]: HeldDeriver, makeHeldDeriver

/** A key deriver over the core's one-SHA-256 test deriver that counts what it hears, and that a test can hold mid-derivation. */
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

// == [The world]: JokesPath, JokesKey, KnockKnockWorld, buildKnockKnockWorld, _cheat_giverDeviceOf, stopNothing

/** The labelpath of the box with the joke service's key. */
export const JokesPath = 'box/jokes'

/** The joke service's key, an obvious fake: the whisper of the box at {@link JokesPath}. */
export const JokesKey = LeanTH.Whisper.apiKey

/** The real core's Device, bank and vault for the knock-knock app, the giver's view of the Device, and what the test watches. */
export interface KnockKnockWorld {
  device:      Device
  bank:        Bank
  vault:       Vault
  giverDevice: GiverDevice<BoxCar>
  deriver:     HeldDeriver
  /** Every snapshot the Device has published, the first among them. */
  snapshots:   DeviceSnapshot[]
}

/** A Device, its bank born under {@link LeanTH.TestPassphrase} with the joke service's key stored at {@link JokesPath}, then locked.
 * The Device is swept as the test finishes, ending any wait for an unlock.
 */
export async function buildKnockKnockWorld(): Promise<KnockKnockWorld> {
  const deriver = makeHeldDeriver()
  const { device, bank, vault } = await LeanTH.buildBornVault({ device: LeanTH.makeDevice({}, { keyDeriver: deriver }) })
  onTestFinished(() => { device.sweep() })
  await vault.putBoxOnce(JokesPath, { sidecar: { service: 'jokes' } }, { whisper: LeanTH.Whisper })
  bank.lock()
  const snapshots = [device.getSnapshot()]
  device.subscribe(() => { snapshots.push(device.getSnapshot()) })
  return { device, bank, vault, giverDevice: _cheat_giverDeviceOf(device, vault), deriver, snapshots }
}

// The giver asks a Device for its bank object, started, and the new core's Device starts none. This is the
// test's one way past the core: the Device's own snapshot, subscribe and strength check, beside the vault the test made.
/** The giver's view of `device`: its own scope, snapshot, subscribe and strength check, and a bank object over `vault`, started once and never ending. */
export function _cheat_giverDeviceOf(device: Device, vault: Vault): GiverDevice<BoxCar> {
  const bank = giverBankOfVault(vault)
  return Object.freeze({
    userid:        device.userid,
    banklabel:     device.banklabel,
    getSnapshot:   device.getSnapshot,
    subscribe:     device.subscribe,
    judgeStrength: (passphrase: string) => device.judgeStrength(passphrase),
    ensureBank:    () => Promise.resolve(bank),
    onBankStart:   (starter: (started: GiverBank<BoxCar>) => () => void) => {
      starter(bank)
      return stopNothing
    },
  })
}

/** What a subscription that hears nothing returns: a stop with nothing to stop. */
function stopNothing(): void { /* nothing to stop */ }
// --
