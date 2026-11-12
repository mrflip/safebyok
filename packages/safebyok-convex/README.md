# safebyok-convex

safebyok's bankDB on [Convex](https://convex.dev): a Convex **component** that keeps bank, gate,
vault and box rows in tables of its own, and **`ConvexBankDB`**, which writes through it from your
app's Convex client. Your deployment has ciphertext and the few unencrypted fields a row is found
by. It never sees a whisper, a passphrase, or a key that could decipher one.

`ConvexVaultDB`, the vaultDB before it, still ships beside it, on tables of its own, with
`SafebyokComponent` serving its functions. It is on its way out: build on `ConvexBankDB`.

## Install

```sh
pnpm add safebyok safebyok-convex convex convex-helpers
```

`safebyok`, `convex` and `convex-helpers` are peer dependencies, so the adapter and your app share
one copy of each, and a `VaultError` from one is a `VaultError` to the other. The component runs the
core's own checks and classifier on your deployment, and `convex-helpers` (0.1.129 or later) makes
the vaultDB's validators from the core's checkers when your Convex CLI bundles it.

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

From a module of your own, `convex/safebyokBank.ts`, under these names:

```ts
import { SafebyokBankComponent } from 'safebyok-convex/server'
import { components } from './_generated/api'

export const { ensureBank, buildBank, putGate, delBank, getVault, putVault, delVault, listBoxes, getBox, putBox, delBox, tidyGone, watchRows } =
  new SafebyokBankComponent(components.safebyok).api({
    getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
  })
```

Run your Convex codegen, and your clients reach them as `api.safebyokBank`.

**`getUserId` decides who may reach which bank.** Every call names the `user_id` whose rows it
reads or writes, in its scope or in its ask's address, and each function refuses a caller who is
signed out (`getUserId` returns null, undefined or empty) or signed in as anyone else, with a
`ConvexError` whose `data` is `{ kind: 'identity_revoked' }`. The client meets it as a `VaultError`
of that kind. Use the same id your app gives the core as `user_id`.

**Each write is checked again on your deployment.** Anyone signed in can call these functions
directly, so the component checks each ask with the core's own checks before it reads a row, and
refuses one that fails them with a `ConvexError` whose `data` has the kind and the core's message.
It then fetches the row asked for and the row above it, classifies the ask with the core's
classifier, gate verbs' policy included, and stores the record if the outcome is a write, all in one
mutation. It answers with the rows as it fetched them, and whether it wrote: the client classifies
the same rows to the same outcome, and refuses `unexpected_error` should the two disagree, which
means a component out of step with the client's copy of safebyok.

## Use

```ts
import { ConvexClient } from 'convex/browser'
import { ConvexBankDB } from 'safebyok-convex'
import { api } from '../convex/_generated/api'

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL)
convex.setAuth(fetchToken)    // your auth provider's token, as for any Convex call
const bankDB = new ConvexBankDB({ client: convex, api: api.safebyokBank })
```

Hand `bankDB` to the core, as its README's *A host* shows.

* **`client`** is the Convex client your app already has: a `ConvexClient`, or in a React app the
  `ConvexReactClient` you give `ConvexProvider`, so the bank shares its socket and its signed-in
  user. `safebyok-convex` imports nothing of React's.
* **`api`** is `api.safebyokBank`, the functions above.
* **`maxBoxes`** (optional, default 100) caps the box rows of one vault life, including the tombstones of deleted
  boxes, and never exceeds the component's own limit. A put of a new boxlabel past it refuses as `vault_full`, so
  deleting a box frees no room. Like every bankDB's, it is a soft cap. This adapter currently enforces it exactly,
  since each put is counted in the mutation that stores it, but do not rely on that. A replacement, a delete, and a
  box put again over its own tombstone are never refused for it.
* **`maxRecordSizeEst`**, optional, as every bankDB takes it: 5,600 bytes if left out, at most Convex's 1 MiB document.

**Sign in first.** Open the bank once the Convex client is authenticated (in React, once
`useConvexAuth()` says so): a call made before then refuses as `identity_revoked`.

**Other writes arrive live.** `watch` keeps a `watchRows` query open on the bank or vault it is
given, and tells its listener of each row that changes, from any device. A deleted row is not
heard of: a `delBank` is heard as its bank's tombstone, and a `delVault` as its vault's.

**A call that fails** for any other reason refuses as `storage_unavailable`. The refusal names the call but none of
Convex's error text, which on a dev deployment may quote the call's arguments. Your deployment's logs have the full
error. Offline, a call waits for the connection, as every Convex call does, and Convex resends a mutation when it
reconnects, so a put may be written after any timeout you set.

## What is stored

Five tables, inside the component, for the bankDB:

| Table                   | One row per        | Has                                                          | Index                                                                           |
| ----------------------- | ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `safebyok_banks`        | bank               | its scope and its bank row, live or a tombstone              | `by_scope`: `user_id`, `banklabel`                                              |
| `safebyok_gates`        | gate               | its scope and its gate row                                   | `by_scope`: `user_id`, `banklabel`, `gatelabel`                                  |
| `safebyok_bank_vaults`  | vault              | its scope and its vault row, live or a tombstone             | `by_scope`: `user_id`, `banklabel`, `vaultlabel`                                 |
| `safebyok_bank_boxes`   | box, in each life  | its scope, its life's `bank_tok` and `vault_tok`, its box row | `by_box`: `user_id`, `banklabel`, `vaultlabel`, `bank_tok`, `vault_tok`, `boxlabel` |
| `safebyok_bank_tallies` | life of a vault    | count and size of its box rows: all, and live alone         | `by_life`: `user_id`, `banklabel`, `vaultlabel`, `bank_tok`, `vault_tok`         |

`user_id` leads every index, so one user's rows are one range of each. Rows are stored as the core
writes them. Each whisper, each box's boxKey, and the bankKey (once for each wayin) are encrypted.
The labels, tokens, times, salts and sidecars are unencrypted. The vaultDB keeps its own three
tables, `safebyok_vaults`, `safebyok_boxes` and `safebyok_tallies`, until it is removed.

**Upgrading.** Until 1.0 there is no migration. A release that changes these tables says so in its
changelog. Convex will not deploy a schema the stored rows do not match, so clear the component's
tables first (on the dashboard's Data page, pick the `safebyok` component).

**How big a vault can be.** The component limits every life of a vault to **8,000 box rows** and
**7 MiB less 1 KiB** of them as Convex weighs a document, whatever the client asks, so that one
`delVault` can always delete the whole life, and one `listBoxes` read it, within a Convex
transaction's limits. A deleted box leaves a tombstone in its row, which counts toward both limits
just as a live box does. A box put again under the same boxlabel reuses that row. A put that would
take a vault past either limit and leave it larger refuses as `vault_full`. A replacement that is no
larger, and every delete, is always written. **Once deleted boxes fill a vault's cap, it refuses new
boxes until the vault is deleted.** Deleting the vault is the only way to empty it: `delVault`
deletes the box rows of the life it ends, in the same mutation, and the next life starts with none.

**How big a bank can be.** A bank holds any number of vaults, more than one Convex transaction
(16 MiB read, 16,000 documents written) can delete. So `delBank` stores the bank's tombstone, then
deletes the gate, vault and box rows under it while half of each limit lasts, and leaves the rest.
What it leaves is out of reach: a gate or vault row under another bank life than its bank row's
reads as no row, and a box row is found only by its own life's tokens. `tidyGone` deletes the rows
of every ended life, those a `delBank` left included, on the same budget per call: it reads the
bank's vault rows and tallies, and reaches the box rows of ended lives through the index without
reading a live one. **Call `tidyGone` now and then**, as housekeeping: what one call leaves, the
next deletes. Its count, of the box rows in the bank's live vaults, does not tell you whether rows
of ended lives remain. The bank-wide `watch` reads every box row of the
bank's live vaults each time a row changes, so a bank whose live vaults together pass 16 MiB makes
it go quiet.

## Testing your own functions

`safebyok-convex/test` installs the component into a
[`convex-test`](https://docs.convex.dev/testing/convex-test) app. It loads the component's modules
with `import.meta.glob`, so it assumes vitest or another runner on Vite.

```ts
import { defineSchema } from 'convex/server'
import { defineTestApp } from 'convex-test'
import { SafebyokBankComponent } from 'safebyok-convex/server'
import { register } from 'safebyok-convex/test'

const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
const host = app.defineModules({ safebyokBank: new SafebyokBankComponent(app.components.safebyok).api({
  getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
}) })
```

## Testing your own client code

`safebyok-convex/testing` is a Convex deployment in memory that the real Convex clients reach over
a fake WebSocket. `fakeDeployment(host)` takes a host like the one above.

```ts
import { ConvexBankDB } from 'safebyok-convex'
import { fakeDeployment } from 'safebyok-convex/testing'

const deployment = fakeDeployment(host)
const bankDB = new ConvexBankDB({ client: deployment.client('u1'), api: deployment.api.safebyokBank })
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
BankDB battery over `ConvexBankDB` and its VaultDB battery over `ConvexVaultDB`, each on a real
`ConvexClient`, and `e2e/` runs the BankDB battery again over a `ConvexReactClient`, so this package
lists no framework among its dev dependencies.

The build follows Convex's component template: ESM only and unbundled, each of the component's
modules its own file under `dist/component/` beside `convex.config.js` and `_generated/`, for a
host's Convex CLI to bundle at deploy. `safebyok-convex/test` alone ships as source, since its
`import.meta.glob` must find the component's `.ts` modules. `src/component/_generated/` is Convex's
codegen output and never edited by hand. The component's typed API, `ComponentApi`, is derived from
its functions in `src/component-api.ts`.
