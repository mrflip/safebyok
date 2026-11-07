# Sprint react_new: done

safebyok-react and the React demo now run on the new core. safebyok-react gained:

* the box hooks, `BoxWhisperField`, the account menu's lock and create controls;
* dialogs for every gating kind (passphrase, replace passphrase, delete, add and revoke passkey);
* a `safebyok-react/devmode` entry with `DevVaultDBInspector`, `DevBoxInspector` and
  `DevDeviceDBInspector`;
* a `BankProvider` that makes one bank per `applabel` + `user_id`, with its `device_id` from the
  deviceDB's new `ensureBank`.

The demo shows the knock-knock app three ways on one page, each with a key of its own: managed fields
(flow 3), an exposed whisper (flow 2) and a sealed key that is never exposed (flow 1). It runs on
`browserOpts` (IndexedDB device store, zxcvbn, Argon2id). Along the way the core gained
`passkey_unavailable`, the deviceDB's bank rows, and the VaultDB renames (`AdapterVaultDB`, `VaultDB`,
`vault-db.ts`, `device-db.ts`, the `IsAdapterVaultDB` brand). Mode: YOLO. Rulings and the calls left to
me: [react_new-resolutions.md](../whiteboard/20261107-react_new/react_new-resolutions.md).

## Merged during the sprint

#573, #574, #576, #577, #575, #578 (threads 1, 2, 4, 3, 12, 11), #579 (9), #581 (14), #584 (5).

## The line to merge (merge the top, #572, with a merge commit)

main → #586 → #589 → #593 → #583 → #585 → #587 → #588 → #591 → #590 → #572

| PR | Thread | What |
|---|---|---|
| #586 | 15 device_bank | DeviceDB bank rows and `ensureBank`, in an IndexedDB database of their own |
| #589 | 16 provider_once | one bank per scope; `device_id` from `ensureBank`; a dropped handler falls back |
| #593 | 18 vaultdb_names | `AdapterVaultDB` / `VaultDB`, `vault-db.ts`, `device-db.ts`, `IsAdapterVaultDB` |
| #583 | 13 react_tidy | passkey argument checks, focus, `passkeyRpId`, empty-passphrase refusal |
| #585 | 17 passkey_unavailable | the new refusal kind, and `refusalFor`'s hostile-input tests |
| #587 | 5 (follow-up) | a knock sends the saved key; renames; Done clears "Saved." |
| #588 | 6 demo_exposed | flow 2, a box of its own |
| #591 | 7 demo_sealed | flow 1, never exposed; direct tests for the key helpers |
| #590 | 8 dev_inspectors | the devmode entry and its three panels; `useBoxIsShowing` |
| #572 | sprint PR | plan, progress, regressions, resolutions, these notes |

The wrap-up restack resolved three conflicts mechanically: `bank-provider.tsx` (#583 on #589), the
demo's `stores.ts` (#587 on #589: the device-id helper deleted), `App.tsx` (#590 on #591: both imports).
It added two commits: on #583, `passkeyRpId` kept out of `Bank.make`'s options (my merge had missed it,
and justify caught it); on #590, `DevVaultDBInspector` typed by `VaultDB` after #593's rename.

## YOLO calls (each a row in the sprint doc, now in the resolutions file)

* The demo on `browserOpts` from thread 5 (thread 10 folded into 5 and 8).
* Threads 14 to 18 created from rulings; thread 11 cut from thread 3 alone.
* #584's flagged knock fixed in a follow-up PR (#587) after #584 merged.
* Each demo flow keeps a key of its own (#588's flagged review).
* `BankProvider`: the provider runs `ensureBank` and its `device_id` prop goes; handlers stay called at
  their latest; a dropped handler falls back to the one the bank was made with (#589's flagged review).
* `brandedDeviceDB` exported from `safebyok/storage` so the provider refuses a misused `deviceDB`.

## Still open (drafting rows in the sprint doc's Open Matters)

* The passkey button's double-press guard reads state (#583).
* The React passkey header check repeats part of the core's salt check (#583).
* `Checkers` reaches safebyok-react through `safebyok/storage` (#583).
* `BankProvider`'s handlers stay called at their latest; it runs `ensureBank` (thread 16, my calls).
* Bank rows in their own IndexedDB database; a damaged bank row made afresh; a host's own DeviceDB could
  mint two ids at once (#586).
* For you: `notes/gallant.md` says the deviceDB serves leases alone (#586).
* A browser that fails to ask also refuses `passkey_unavailable` (#585).
* Each demo flow keeps a key of its own; a `useExposedWhisper` hook later; the demo always shows the dev
  panels (#588, #590).

## Left for later (from the reviews)

* A documentarian run over safebyok-react (`src/devmode/` especially), the demo, and a few core doc
  blocks; chained test titles in `src/devmode/` and `consts.test.ts`.
* `Phrases.VaultDBShape` is unused and stale; the core README's "Nothing in the core exports a VaultDB".
* The demo's own `useIsShowing` could become `useBoxIsShowing` now that #590 is in the line.
* `notes/good_bank_opts_are_in_browser.md` lands with #572; #579 already links it.
