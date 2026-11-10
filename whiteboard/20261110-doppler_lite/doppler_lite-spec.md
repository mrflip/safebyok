# Doppler-lite: a secrets manager in miniature (spec, on hold)

On hold until the core is landed and de-slopped. This is pseudo code and intent, not a contract.

## What it shows

safebyok's second demo, and the one that edits secrets. The knock-knock demo only ever enters an
API key and uses it; this one keeps a team's settings the way Doppler does.

* **A web app** where each vault is a collection of secrets you can list, show, hide, edit, add and delete.
* **A script**, `safekey run -- <command> [args…]`, that unlocks a vault from a token in the
  environment and runs the command with the vault's secrets as environment variables.

## The app

React, on the toolkit and widget forms: controlled fields over an exposed whisper (`useWhisper`,
`box.patchWhisper`, `box.putExposed`, `box.unexpose` on leaving). The DOM form is not used here: it
answers a threat model too small to steer the main demo.

* **One vault per environment** (`dev`, `staging`, `prod`), picked from a list. The vault is the
  unit a token unlocks.
* **One box per secret**: the boxlabel is the variable's name (`STRIPE_KEY`), the whisper
  `{ value }`. Each secret is then saved and conflicts on its own (`revision_tok`), and deleting
  one is `delBox`.
  *Open:* one box per environment holding the whole map is one unseal per run and one atomic
  save, but two people editing different secrets collide. Recommended: a box per secret.
* **Show and hide** per secret, masked by default; **Edit** exposes the box, **Save** is
  `putExposed`, **Done** or leaving the row unexposes it. A lock hides every shown value and
  keeps the edits.
* **The account parts** the knock-knock demo has: lock control, passphrase and passkey, delete
  vault. They're the widget form's pieces once they exist.
* **Tokens**: a panel to make and revoke script tokens, once the wayin below exists. Until then,
  it says why there is none.

## The script

A Node package of its own (`demos/safekey-cli` or similar), since the core runs without Node
built-ins and the script needs `node:child_process`.

```text
SAFEKEY_TOKEN=…  safekey run --vault prod -- node server.js
```

1. Read the config: the backend's URL, `applabel`, `user_id`, `vaultlabel`. Read the token from
   `SAFEKEY_TOKEN`, then delete it from the environment the child will get.
2. `Bank.make` with a `MemoryDeviceDB` (nothing is cached between runs, so each run unlocks
   afresh) and a `requestCleartext` that attempts once with the token, then gives up.
3. `bank.hello()`, `ensureVault`, `ensureUnlocked`; list the boxes; `extractWhisper` each one.
4. Spawn the command with the secrets merged over the parent's environment. Forward signals and
   exit with the child's code. Sweep the bank once the child has its environment.

What a run costs: one key stretch (Argon2id, about a second) plus one unseal per secret.

## The token, now and later

**Now:** the token is the vault's own passphrase. The README says, at the top, that using it this
way is unsafe until the script wayin lands, and links the GitHub issue for it. A leaked token is
the passphrase: it opens every way in.

**Later, a script wayin** (a new wayin kind, and a core thread of its own):

* Stretched like a passphrase (the Coach, 2026-11-10), so a leaked token resists guessing as
  well as a passphrase does, though a random token would resist it anyway.
* It unlocks the vault and reads boxes. It can never add, replace or revoke a wayin, its own
  included. *Open:* whether it may write boxes; read-only matches `run`.
* The app makes and revokes tokens; revoking one leaves every other way in standing.
* What it touches: a stored-shape change to the gate (a list of script wayins, or one slot),
  gating kinds to add and revoke one, and a `notes/security.md` entry. It uses the passphrase
  construction, so no new cryptography.

## The backend

The script can't open the browser's IndexedDB, so both halves need a store they can reach.

* **GraphQL: yes.** `safebyok-graphql`'s server half takes any vaultDB and serves it to
  `GraphQLVaultDB`, browser or Node, and carries `watch` over server-sent events.
* **SQLite behind it: no adapter yet.** `safebyok-postgres` exists; SQLite has none. Either
  write `safebyok-sqlite` against the shared battery every vaultDB passes, or run
  `safebyok-postgres` over an embedded Postgres such as PGlite (not tried). Recommended: try
  PGlite first, as it adds no adapter to maintain.
* A small server (Yoga, as the `safebyok-graphql` recipe has it) and the demo's fake auth
  supplying `userIdOf`.

## Hazards to say out loud

* Secrets in a child's environment are readable by anything that can read that process's
  environment (`/proc/<pid>/environ`, crash dumps, a child that logs its env).
* A token typed on the command line lands in shell history; the README shows `SAFEKEY_TOKEN`
  set from a file or a secrets store instead.
* `extractWhisper` strings can't be wiped; the script exits soon after the spawn, which is the
  only real bound.

## Open questions

1. A box per secret, or a box per environment?
2. May a script token write boxes?
3. PGlite under `safebyok-postgres`, or a `safebyok-sqlite` adapter?
4. Where does the CLI live: `demos/` (private) or a published package?
