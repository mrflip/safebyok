# safebyok-convex

A `VaultDB` for safebyok on [Convex](https://convex.dev): a Convex **component** that keeps a bank's Things in a table of
its own, and **`ConvexVaultDB`**, which reaches it through your app's Convex client. The Things are what any backend
would have, ciphertext and a few unencrypted fields; nothing in them unlocks a bank without its passphrase or passkey.

It replaces the Convex adapter built on safebyok-big, now the private `safebyok-convex-big`. Its component keeps another
table, so it reads nothing that adapter wrote.

## Set up

```sh
pnpm add safebyok safebyok-convex convex
```

`safebyok` and `convex` are peer dependencies, so the adapter and your app share one copy of each, and a `VaultError`
from one is a `VaultError` to the other.

**1. Install the component**, in `convex/convex.config.ts`:

```ts
import { defineApp } from 'convex/server'
import safebyok from 'safebyok-convex/convex.config'

const app = defineApp()
app.use(safebyok)
export default app
```

**2. Serve its functions** from a module of your own, `convex/safebyokVault.ts`, under these names:

```ts
import { SafebyokVaultComponent } from 'safebyok-convex/server'
import { components } from './_generated/api'

export const { getThing, writeThing, listThings, birthBank, getWorld, stats, watchThings } =
  new SafebyokVaultComponent(components.safebyok).api({
    getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
  })
```

Run `npx convex dev` (or your codegen), and your clients reach them as `api.safebyokVault`.

**3. Hand `ConvexVaultDB` to the core**, wherever a `VaultDB` is asked for:

```ts
import { ConvexClient } from 'convex/browser'
import { ConvexVaultDB } from 'safebyok-convex'
import { api } from '../convex/_generated/api'

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL)
convex.setAuth(fetchToken)    // your auth provider's token, as for any Convex call
const vaultDB = new ConvexVaultDB({ client: convex, api: api.safebyokVault })
```

* **`client`** is the Convex client your app already has: a `ConvexClient`, or in a React app the `ConvexReactClient`
  you give `ConvexProvider`, so the vault shares its socket and its signed-in user. `safebyok-convex` imports nothing of
  React's.
* **`api`** is `api.safebyokVault`, the module above, not the whole `api`.
* An option it cannot use is refused with `bad_record`.

**Sign in first.** Open the bank once the Convex client is authenticated (in React, once `useConvexAuth()` says so): a
call made before then refuses as `identity_revoked`.

## What it promises

* **`getUserId` decides who may reach which bank.** Every call names the `userid` whose Things it reads or writes, and
  each function refuses a caller who is signed out (`getUserId` returns null, undefined or `''`) or signed in as anyone
  else, with `identity_revoked`. Use the same id your app gives the core as `userid`.
* **Each call is one Convex query or mutation.** A write fetches the Thing at its scope, the nearest Thing above it, and
  the bank, main gate and root box, and writes in the same mutation, so it is written only over the Thing it expected. Convex runs each
  mutation as one serializable transaction.
* **Each write is checked again on your deployment.** Anyone signed in can call these functions directly, so the
  component checks each ask with the core's own checks, refusing one that fails them with `bad_record`, and decides
  whether to write with the core's own classifier. The client classifies what the component fetched to the same answer,
  and refuses `unexpected_error` should the two disagree on whether it wrote: a component out of step with the client's
  copy of safebyok.
* **A watch hears every device's writes**, from a `watchThings` query kept open on the bank. Each result holds only
  the Things committed since the last, and the watch then subscribes again from the newest; it tells its listener of
  each Thing written after it started, once. It is Convex's reactive query throughout: nothing polls.
* **Any other failure refuses as `storage_issue`**: Convex resends a call itself after a reconnect, so a call that
  fails, failed in your deployment, and trying it again is unlikely to help. The refusal's message names the call but
  none of Convex's error text, which on a dev deployment may quote the call's arguments; Convex's error is its `cause`
  (in production, Convex's own "Server Error" and a request ID), and your deployment's logs have the request. A
  `ConvexError` your own code throws goes the same way. Offline, a call waits for the connection, as every Convex call
  does, and Convex resends a mutation when it reconnects, so a write may land after any timeout you set.

## What is stored

One table inside the component, `things`: each Thing as the core wrote it, beside its `userid`, `banklabel` and
`labelpath`, indexed `by_scope` on those three, so one range fetches the children of a Thing. Each also holds
`commit_ts`, the timestamp Convex committed its last write at, indexed `by_commit` after `userid` and `banklabel`, so
one range fetches what a bank's watch has not yet heard. A deleted Thing stays as its tombstone.

**How big a bank can be.** `stats` reads every Thing of a bank in one query, within a Convex query's limits (32,000
documents, 16 MiB read), as may a watch that comes back after long enough away, so a bank past that makes its stats
refuse and such a watch go quiet. The stats report those two limits as the bank's `max`, and weigh each Thing as the
UTF-8 length of its JSON, a little under what Convex counts for its document.

**What a sidecar may hold.** Convex refuses an object key, anywhere in a stored Thing, that starts with `$`, holds a
character outside printable ASCII, or runs past 1024 characters. A put of a box whose sidecar has such a key, at any
depth, refuses `bad_record` before it is sent; the refusal's cause names the key, and nothing of the sidecar's values.
To keep such keys, store them inside a string of your own, a JSON text, say.

**Upgrading.** Until 1.0 there is no migration. A release that changes the table says so in its changelog. Coming from
`safebyok-convex-big`, the old component's tables (`safebyok_banks`, `safebyok_gates`, `safebyok_vaults`,
`safebyok_boxes`, `safebyok_tallies`) are not read: export what you need, then clear them on the dashboard's Data page
(pick the `safebyok` component) before you deploy, since Convex refuses to drop a table that still has rows.

## Testing your own functions

`safebyok-convex/test` installs the component into a [`convex-test`](https://docs.convex.dev/testing/convex-test) app.
It loads the component's modules with `import.meta.glob`, so it assumes vitest or another runner on Vite.

```ts
import { defineSchema } from 'convex/server'
import { defineTestApp } from 'convex-test'
import { SafebyokVaultComponent } from 'safebyok-convex/server'
import { register } from 'safebyok-convex/test'

const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
const host = app.defineModules({ safebyokVault: new SafebyokVaultComponent(app.components.safebyok).api({
  getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
}) })
```

## Testing your own client code

`safebyok-convex/testing` is a Convex deployment in memory that the real Convex clients reach over a fake WebSocket.
`fakeDeployment(host)` accepts a host like the one above.

```ts
import { ConvexVaultDB } from 'safebyok-convex'
import { fakeDeployment } from 'safebyok-convex/testing'

const deployment = fakeDeployment(host)
const vaultDB = new ConvexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyokVault })
// ... and after the test:
await deployment.close()
```

* `deployment.client(subject)` is a `ConvexClient` signed in as `subject`, or as no one.
  `deployment.connectWith(subject, make)` connects any other client, such as a `ConvexReactClient`.
* `deployment._cheat_arrange(change)` runs `change` on the backend, and every client watching hears of it, as it would a write
  from elsewhere.
* The clients log quietly. Pass a `logger`, as in `fakeDeployment(host, { logger })`, to capture their log lines.

## Developing this package

```sh
pnpm --filter safebyok-convex test   # convex-test under the edge runtime, with no deployment
```

The tests run the core's VaultDB battery over `ConvexVaultDB` on a real `ConvexClient`. The build follows Convex's
component template: ESM only and unbundled, each of the component's modules its own file under `dist/component/` beside
`convex.config.js` and `_generated/`, for a host's Convex CLI to bundle at deploy. `safebyok-convex/test` alone ships as
source, since its `import.meta.glob` must find the component's `.ts` modules. `src/component/_generated/` is Convex's
codegen output and never edited by hand. The component's typed API, `ComponentApi`, is derived from its functions in
`src/component-api.ts`.
