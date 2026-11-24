// Writes src/fixture/fixture.json: the dojo's three users, and the rows Reset loads into the browser's two stores, made
// through the library under Node over fake-indexeddb. Run it with `pnpm --filter safebyok-demo-dojo fixture` after a change
// to the library makes the stored rows stale. tests/lib/fixture.test.ts fails when the banks no longer unlock; it does not
// check the cached snapshots or the planted rows.
//
// Hero:    a bank stored there, with a box, and its two caches kept here.
// Thierry: a bank stored there, with a box, and nothing here.
// Nolo:    nothing anywhere.
// `planted` holds rows Reset does not load, which the forms' Exists buttons write into the store: Nolo's bank, and a box at
// the New Box form's labelpath in Hero's and Thierry's.
//
// The deriver's settings, the banklabel, the database's name and the labelpaths must agree with src/lib/dojo.ts.

import 'fake-indexeddb/auto'
import { writeFileSync } from 'node:fs'
import { createStore, entries } from 'idb-keyval'
import { Device, MemoryPersister, type PersistedClient } from 'safebyok'
import { Argon2idWebV1, makeArgon2idDeriver, zxcvbnStrengthChecker } from 'safebyok/browser'
import { IdbVaultDB } from 'safebyok-idb-lean'

/** The dojo's three users, with their fixture passphrases, printed on the page. */
const Users = [
  { userid: 'hero',    title: 'Hero',    passphrase: 'hero sings over seven quiet harbors',    blurb: 'A bank stored there, with its caches kept here.' },
  { userid: 'thierry', title: 'Thierry', passphrase: 'thierry paints violet lanterns at dawn', blurb: 'A bank stored there, and nothing kept here.' },
  { userid: 'nolo',    title: 'Nolo',    passphrase: 'nolo builds a copper kite tonight',      blurb: 'Nothing stored anywhere.' },
] as const

const Banklabel = 'dojo'
const DojoDBName = 'dojo'
const VaultDBName = 'safebyok-dojo:vault-v001-001-001'
const LoginLabelpath = 'box/login'

const dojoDeriver = makeArgon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'dojo_light', memory_kib: 1024, iterations: 1 })

const vaultDB = new IdbVaultDB({ dbName: DojoDBName })
const things = createStore(VaultDBName, 'things')

type Row = [unknown, unknown]

/** Every row of the vault database, as stored. */
async function vaultRows(): Promise<Row[]> { return await entries(things) }

/** The rows of `after` that are not in `before`, or differ from them. */
function rowsAdded(before: Row[], after: Row[]): Row[] {
  const prior = new Map(before.map(([ckey, val]) => [JSON.stringify(ckey), JSON.stringify(val)]))
  return after.filter(([ckey, val]) => prior.get(JSON.stringify(ckey)) !== JSON.stringify(val))
}

/** A signed-in device of `userid`, over the fixture's vaultDB, keeping its caches in `persisters` where given. */
async function signedInDevice(userid: string, persisters?: { roots: MemoryPersister, boxes: MemoryPersister }): Promise<Device> {
  const device = Device.make({ banklabel: Banklabel, device_tok: globalThis.crypto.randomUUID() }, {
    vaultDB, keyDeriver: dojoDeriver, strengthChecker: zxcvbnStrengthChecker,
    ...(persisters && { persisters: { roots: () => persisters.roots, boxes: () => persisters.boxes } }),
  })
  await device.hello()
  await device.signin(userid)
  return device
}

/** Birth `userid`'s bank under `passphrase`, and put one box in it. */
async function bankUser(device: Device, passphrase: string, boxLabelpath: string, username: string): Promise<void> {
  await device.birthGating({ passphraseCleartext: passphrase }).attempt()
  await device.vault!.putBoxOnce(boxLabelpath as `box/${string}`, { sidecar: { username } }, { whisper: { password: `fixture-password-of-${username}` } })
}

/** Wait for the persisters' saves, which follow each change to a cache. */
async function settle(): Promise<void> { await new Promise((resolve) => { setTimeout(resolve, 100) }) }

const heroCaches = { roots: new MemoryPersister(), boxes: new MemoryPersister() }
const hero = await signedInDevice('hero', heroCaches)
await bankUser(hero, Users[0].passphrase, 'box/github', 'hero_at_github')
const thierry = await signedInDevice('thierry')
await bankUser(thierry, Users[1].passphrase, 'box/gitlab', 'thierry_at_gitlab')
await settle()
const cache: [string, PersistedClient | undefined][] = [
  [`roots:hero:${Banklabel}`, heroCaches.roots.restoreClient()],
  [`boxes:hero:${Banklabel}`, heroCaches.boxes.restoreClient()],
]
const vault = await vaultRows()

const planted: Record<string, Row[]> = {}
for (const [userid, device] of [['hero', hero], ['thierry', thierry]] as const) {
  const before = await vaultRows()
  await device.vault!.putBoxOnce(LoginLabelpath, { sidecar: { username: `${userid}_planted` } }, { whisper: { password: 'planted-password' } })
  planted[userid] = rowsAdded(before, await vaultRows())
}
const beforeNolo = await vaultRows()
const nolo = await signedInDevice('nolo')
await nolo.birthGating({ passphraseCleartext: 'planted bank of nolo, by another device' }).attempt()
planted['nolo'] = rowsAdded(beforeNolo, await vaultRows())

const fixture = { users: Users, vault, cache, planted }
const outfile = new URL('../src/fixture/fixture.json', import.meta.url)
writeFileSync(outfile, `${JSON.stringify(fixture, null, 1)}\n`)
console.log(`Wrote ${outfile.pathname}: ${vault.length.toString()} vault rows, ${cache.length.toString()} cached snapshots, planted rows for ${Object.keys(planted).join(', ')}`)
// The devices' watches and minders hold the event loop open.
process.exit(0) // eslint-disable-line unicorn/no-process-exit
