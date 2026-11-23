/** The app's giver and its one bank, over a vaultDB in IndexedDB standing in for a backend, with the device's caches kept in IndexedDB between page loads. */

import { QueryClient } from '@tanstack/react-query'
import { Argon2idWebV1, makeArgon2idDeriver } from 'safebyok/browser'
import { IdbPersister } from 'safebyok-idb-lean'
import { reactGiver } from 'safebyok-react-lean'
import { RefusingVaultDB } from './refusing-vault-db'
import { switchableChecker } from './switchable-checker'

// scripts/make-fixture.ts spells the deriver's settings, the banklabel and the database's name again: the fixture's
// banks unlock only under the same ones, as tests/lib/fixture.test.ts checks.

/** The banklabel of the app's one bank. */
export const Banklabel = 'dojo'

/** The `dbName` of both IndexedDB databases: the vault's, standing in for the backend, and the device's caches. */
export const DojoDBName = 'dojo'

/** The labelpath of the box the New Box form writes. */
export const LoginLabelpath = 'login'

// Real Argon2id, at settings cheap enough that a derivation takes milliseconds: the fixture's passphrases are printed on the page.
/** The dojo's key deriver. */
export const dojoDeriver = makeArgon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'dojo_light', memory_kib: 1024, iterations: 1 })

/** The app's vaultDB, which a scenario button can tell to refuse the next write. */
export const vaultDB = new RefusingVaultDB({ dbName: DojoDBName })

// throttleMs 0, so the Inspect tab shows each change to the caches as it lands. A refusal nobody waits on goes to the
// device's logger, the console.
/** The giver: the provider, the strength hook, and the bank's hooks. */
export const SOK = reactGiver({
  banks:           { dojo: { vaultDB } },
  keyDeriver:      dojoDeriver,
  strengthChecker: switchableChecker,
  persisters: {
    roots: ({ userid, banklabel }) => new IdbPersister({ recordlabel: `roots:${userid}:${banklabel}`, dbName: DojoDBName, throttleMs: 0 }),
    boxes: ({ userid, banklabel }) => new IdbPersister({ recordlabel: `boxes:${userid}:${banklabel}`, dbName: DojoDBName, throttleMs: 0 }),
  },
})

// PascalCase, so the rules-of-hooks lint checks Dojo.useBank() as a hook.
/** The hooks and calls of the app's one bank. */
export const Dojo = SOK.bank(Banklabel)

/** The host's QueryClient, which runs the form verbs' mutations. */
export const hostQueryClient = new QueryClient()
