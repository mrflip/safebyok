# safebyok-convex

safebyok's vaultDB on [Convex](https://convex.dev): a Convex **component** that keeps vault and box
rows in tables of its own, and **`ConvexVaultDB`**, which writes through it from your app's Convex
client. Your deployment has ciphertext and the few unencrypted fields a row is found by. It never
sees a whisper, a passphrase, or a key that could decipher one.

## Install

```sh
pnpm add safebyok safebyok-convex convex convex-helpers
```

`safebyok`, `convex` and `convex-helpers` are peer dependencies, so the adapter and your app share
one copy of each, and a `VaultError` from one is a `VaultError` to the other. The component's
validators are made from the core's checkers by `convex-helpers` (0.1.129 or later) when your Convex
CLI bundles it.

## Install the component

In `convex/convex.config.ts`:

```ts
import { defineApp } from 'convex/server'
import safebyok from 'safebyok-convex/convex.config'

const app = defineApp()
app.use(safebyok)
export default app
```

## Serve its functions

From a module of your own, `convex/safebyok.ts`, under these names:

```ts
import { SafebyokComponent } from 'safebyok-convex/server'
import { components } from './_generated/api'

export const { listVaults, getVault, listBoxes, getBox, putVault, putBox, delVault, delBox, tidyGone, watchRows } =
  new SafebyokComponent(components.safebyok).api({
    getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
  })
```

Run your Convex codegen, and your clients reach them as `api.safebyok`.

**`getUserId` decides who may reach which bank.** Every call names the `user_id` whose rows it
reads or writes, in its scope or in its ask's address, and each function refuses a caller who is
signed out (`getUserId` returns null, undefined or empty) or signed in as anyone else, with a
`ConvexError` whose `data` is `{ kind: 'identity_revoked' }`. The client meets it as a `VaultError`
of that kind. Use the same id your app gives the core as `user_id`.

**Each put and del is checked again on your deployment.** Anyone signed in can call these
functions directly, so the component checks each ask with the core's own checks before it reads a
row, and refuses one that fails them as `bad_record`. It then classifies the ask with the core's
classifier, and stores the record if the outcome is a write, all in one mutation. A refusal the
core makes there (`bad_record`, `damaged_row`, `damaged_vault`, `storage_issue`, `gate_issue`)
reaches the client as a `ConvexError` whose `data` has its kind and the core's message. A
`gate_issue` also carries the stored vault row it checked. The client meets each as a `VaultError`
of that kind.

## Use

```ts
import { ConvexClient } from 'convex/browser'
import { ConvexVaultDB } from 'safebyok-convex'
import { api } from '../convex/_generated/api'

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL)
convex.setAuth(fetchToken)    // your auth provider's token, as for any Convex call
const vaultDB = new ConvexVaultDB({ client: convex, api: api.safebyok })
```

Hand `vaultDB` to the core, as its README's *A host* shows.

* **`client`** is the Convex client your app already has: a `ConvexClient`, or in a React app the
  `ConvexReactClient` you give `ConvexProvider`, so the vault shares its socket and its signed-in
  user. `safebyok-convex` imports nothing of React's.
* **`api`** is `api.safebyok`, the functions above.
* **`maxBoxes`** (optional, default 100) caps the box rows of one vault life, including the tombstones of deleted
  boxes, and never exceeds the component's own limit. A put of a new boxlabel past it refuses as `vault_full`, so
  deleting a box frees no room. Like every vaultDB's, it is a soft cap. This adapter currently enforces it exactly,
  since each put is counted in the mutation that stores it, but do not rely on that. A replacement, a delete, and a
  box put again over its own tombstone are never refused for it.
* **`maxRecordSizeEst`**, optional, as every vaultDB takes it: 5,600 bytes if left out, at most Convex's 1 MiB document.

**Sign in first.** Open the vault once the Convex client is authenticated (in React, once
`useConvexAuth()` says so): a call made before then refuses as `identity_revoked`.

**Other writes arrive live.** `watch` keeps a `watchRows` query open on the bank or vault it is
given, and tells its listener of each row that changes, from any device.

**A call that fails** for any other reason refuses as `storage_unavailable`. The refusal names the call but none of
Convex's error text, which on a dev deployment may quote the call's arguments. Your deployment's logs have the full
error. Offline, a call waits for the connection, as every Convex call does, and Convex resends a mutation when it
reconnects, so a put may be written after any timeout you set.

## What is stored

Three tables, inside the component:

| Table             | One row per        | Has                                                     | Index                                                              |
| ----------------- | ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `safebyok_vaults` | vault              | its scope and its vault row, live or a tombstone        | `by_scope`: `user_id`, `banklabel`, `vaultlabel`                    |
| `safebyok_boxes`  | box, in each life  | its scope, its life's `vault_tok`, and its box row      | `by_box`: `user_id`, `banklabel`, `vaultlabel`, `vault_tok`, `boxlabel` |
| `safebyok_tallies`| life of a vault    | count and size of its box rows: all, and live alone    | `by_life`: `user_id`, `banklabel`, `vaultlabel`, `vault_tok`        |

`user_id` leads every index, so one user's rows are one range of each. Rows are stored as the core
writes them. Each whisper, each box's boxKey, and the vaultKey (once for each wayin) are encrypted.
The labels, tokens, times, salts and sidecars are unencrypted. `tidyGone` deletes the box rows and
tallies of vault lives that have ended.

**Upgrading.** Until 1.0 there is no migration. A release that changes these tables says so in its
changelog. Convex will not deploy a schema the stored rows do not match, so clear the component's
tables first (on the dashboard's Data page, pick the `safebyok` component).

**How big a vault can be.** The component limits every life of a vault to **8,000 box rows** and
**7 MiB less 1 KiB** of them as Convex weighs a document, whatever the client asks, so that one
`delVault` can always delete the whole vault within a Convex transaction's limits. A deleted box
leaves a tombstone in its row, which counts toward both limits just as a live box does. A box put
again under the same boxlabel reuses that row. A put that would take a vault past either limit
and leave it larger refuses as `vault_full`. A replacement that is no larger, and every delete, is
always written. **Once deleted boxes fill a vault's cap, it refuses new boxes until the vault is deleted.**
A box put again over its own tombstone is still written, within the byte limit. Deleting the vault is the only way to empty it: `delVault`
deletes the box rows of the life it ends, in the same mutation, and the next life starts with none.
`tidyGone` removes the rows of any life that ended some other way.

**How big a bank can be.** The limit above is per vault. A bank is every vault of one user in one
app, and `tidyGone` and the bank-wide `watch` each read all of the bank's rows in one Convex
transaction, whose read is capped at 16 MiB. A bank whose vaults together pass that makes `tidyGone`
throw and its watch go quiet. The package does not scope the read, so keep a user's vaults, deleted
boxes included, well under it.

## Testing your own functions

`safebyok-convex/test` installs the component into a
[`convex-test`](https://docs.convex.dev/testing/convex-test) app. It loads the component's modules
with `import.meta.glob`, so it assumes vitest or another runner on Vite.

```ts
import { defineSchema } from 'convex/server'
import { defineTestApp } from 'convex-test'
import { SafebyokComponent } from 'safebyok-convex/server'
import { register } from 'safebyok-convex/test'

const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
const host = app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({
  getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
}) })
```

## Testing your own client code

`safebyok-convex/testing` is a Convex deployment in memory that the real Convex clients reach over
a fake WebSocket. `fakeDeployment(host)` takes a host like the one above.

```ts
import { ConvexVaultDB } from 'safebyok-convex'
import { fakeDeployment } from 'safebyok-convex/testing'

const deployment = fakeDeployment(host)
const vaultDB = new ConvexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok })
// ... and after the test:
await deployment.close()
```

* `deployment.client(subject)` is a `ConvexClient` signed in as `subject`, or as no one.
  `deployment.connectWith(subject, make)` connects any other client, such as a `ConvexReactClient`.
* `deployment.arrange(change)` runs `change` on the backend, and every client watching hears of it,
  as it would a write from elsewhere.
* The clients log quietly. Pass a `logger`, as in `fakeDeployment(host, { logger })`, to capture their log lines.

## Developing this package

`pnpm justify` here runs lint, typecheck, tests (`convex-test` under the edge runtime, with no
deployment) and the build with its publint and arethetypeswrong checks. The tests run the core's
VaultDB battery over `ConvexVaultDB` on a real `ConvexClient`, and `e2e/` runs it again over a
`ConvexReactClient`, so this package lists no framework among its dev dependencies.

The build follows Convex's component template: ESM only and unbundled, each of the component's
modules its own file under `dist/component/` beside `convex.config.js` and `_generated/`, for a
host's Convex CLI to bundle at deploy. `safebyok-convex/test` alone ships as source, since its
`import.meta.glob` must find the component's `.ts` modules. `src/component/_generated/` is Convex's
codegen output and never edited by hand. The component's typed API, `ComponentApi`, is derived from
its functions in `src/component-api.ts`.
