# Thread 8: dev inspectors (2026-11-07)

Branch `20261107-dev_inspectors`, PR (to come), cut from main at c3a38219e (thread 5's demo, #584).
Justify: green; safebyok-react 213 passed (17 new in `tests/devmode/`, 1 in `hooks.test.tsx`), the
demo 62 passed, every other package unchanged.

* **Built**:
  * **`safebyok-react/devmode`**, a second entry (`src/devmode/index.ts`): `tsdown.config.ts` lists it
    (with `root: 'src'`, so it builds to `dist/devmode/`), package.json `exports` and
    `publishConfig.exports` gained `./devmode` (tsdown writes them), and `typesVersions` maps
    `devmode` for attw's node10 profile, as the core does for its subpaths. `.size-limit.json` has
    `reactDevmode` at 6.9 kB (measured 4.56 kB, by `scripts/size-budget.ts`'s rule).
  * **`DevVaultDBInspector({ vaultDB: VaultDBVerbs })`** (`dev-vault-db-inspector.tsx`): the bank's
    scope from `useBank()`, a quiet line with none. One table: each vault row from `listVaults`
    (damaged rows too), then the box rows `listBoxes` answers for each live vault (damaged rows
    last). Buttons: Refresh, tidyGone, getVault per vault row, getBox and delBox per box row. delBox
    builds the tombstone from the listed row: `boxSparse.parse(row)` + `nextRevisionOf` + `am: 'x'`,
    prior `revisionOf`; it works on a damaged row too (`boxTombstoneOf` refuses those, so it is not
    used). It relists on each `vaultDB.watch(scope)` notice and after its own del and tidy.
  * **`DevBoxInspector({ defaultVaultlabel = 'main', defaultBoxlabel = '' })`**
    (`dev-box-inspector.tsx`): text inputs with datalists (vaults from `useBankSnapshot`, boxes from
    `useBoxes`). Only when both pass `Patterns.label` and `MaxLabelChars` does it mount `BoxVerbs`
    (keyed by the pair), because `bank.vaultAt` and `boxListing.at` throw on a bad label. Buttons:
    ensureUnlocked, lock, putBox (empty, `{ ifPresent: 'get', ifAbsent: 'add' }`), delBox, expose,
    unexpose, veil, unveil, extractWhisper, and putBox (typed): a fieldname input (default `apiKey`)
    plus a `WhisperField`, whose text goes into a ref and never into state. A status line shows
    stage, lockState, revision, exposed/veiled and showing. `box.whisper` (while showing) and the
    extracted whisper each sit behind their own Show (`useRevealToggle`, which resets when the
    whisper goes away); otherwise the line shows the `[Whispered]` word. The extracted whisper is
    dropped once lockState reads `locked`; the state is adjusted in render.
  * **`DevDeviceDBInspector({ deviceDB: DeviceDB })`** (`dev-device-db-inspector.tsx`): `<LeaseRowsTable>`
    inside a section. A JSX comment marks where a bank-rows table goes once #586 (thread 15,
    `listRawBanks`) lands. "Include damaged rows" switches `listLeases` to `listRawLeases`.
    Columns: applabel, user_id, vaultlabel, vault_tok, proved_at, then other fields. A key or
    other object shows as its kind (`lease_key: <CryptoKey>`), and an unnamed string only by its
    length. forget appears where `leaseQuery` parses. delRawLease (raw mode only) appears where
    `vaultScope` parses.
  * **Shared helpers** (`last-call.tsx`):
    * `useLastCall`/`LastCallLine` show each button's answer as JSON. A refusal shows as
      `refusalkind: message` for a VaultError, and only the error's name for anything else.
    * `useListing(list, watch?)`: list once, then again on a watch notice or `relist()`; a stale
      round is dropped.
    * `isLabel` and `jsonOf`.
  * **`useBoxIsShowing(box)`** on the front door (`hooks.ts`, `index.ts`). BoxWhisperField now uses
    it instead of its inline `useSyncExternalStore`.
  * **Demo**: `App.tsx` renders the three panels in `<aside className="dev-tools">` after
    OutageSwitch (`defaultBoxlabel="anthropic_api_key"`, `vaultDB`, `bankOpts.deviceDB`). There is
    a little CSS in `styles.css`.
  * Changeset `.changeset/20261107-dev_inspectors.md`, safebyok-react minor.

* **Decisions taken**:
  * **`useBoxIsShowing` goes on the main entry.** The panels need it, BoxWhisperField already
    carried the same code inline, and a host building its own field wants it too. The demo's
    `KnockKnockFields` keeps its own copy for now, because #587 owns the knock files. It can switch
    to the hook once #587 lands.
  * **The panels never ask the user on their own.** putBox and expose, clicked while the vault is
    locked, do what the core does: putBox refuses `vault_locked`, and expose exposes, with
    `box.whisper` reading `locked`. Click ensureUnlocked first. A raw panel should not paper over
    the core with a convenience unlock.
  * **The panels' strings are inline English**, not `Messages`: they are for developers.
  * **Effects**: `react-hooks/set-state-in-effect` flagged a `refresh` callback called from an
    effect, so the listing moved into `useListing`, whose effect sets state only in promise
    callbacks. Refresh bumps a counter, which reruns the effect and re-subscribes the watch. That is
    acceptable for a dev panel.
  * **A raw lease row's extra strings** (`vault_key_lease_wrapped`) show only their length, not
    their content. A wrapped key is ciphertext, but nothing in the panel needs it.

* **Discoveries**:
  * attw's strict profile needs `typesVersions` for a subpath entry (node10 resolution), as the
    core's package.json has. tsdown's `exports` option does not write it.
  * `boxTombstoneOf` (safebyok/storage) refuses a damaged row, so a panel that deletes damaged
    rows builds the tombstone itself.
  * `pnpm size` measured other bundles over the rule's budgets (`everything` 62.3 of 65 kB, and
    so on). They are within limit, so I left them alone.

* **For the Coach**:
  * Should the panels stay in the demo's production build? They are imported unconditionally in
    `App.tsx`. A host would gate them by `import.meta.env.DEV`. The demo is a playground, so I
    left them always on.
