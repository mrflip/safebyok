# Thread 4: react_boxes (2026-11-07)

Branch `20261107-react_boxes`, PR #576, stacked on #574. Justify: green (safebyok-react 124 tests, 12 files; core 2306).

* **Built**:
  * Box hooks in `packages/safebyok-react/src/hooks.ts`, section *Box hooks*: `useBoxes(vaultlabel)`
    (the listing's snapshot, null while the vault is not present), `useBox(vaultlabel, boxlabel)`
    (`vault.boxListing.at(...)`, answered only while `isPresent`, so null until listed and again once
    deleted; one Box per label across the page), `useBoxSnapshot(box | null)`, `useWhisper(box | null)`
    (live `box.whisper`; a frozen `{ [Whispered]: 'encrypted' }` bag for no box, so `whisper.apiKey ?? ''`
    works before the box is listed).
  * `src/box-whisper-field.tsx`: `BoxWhisperField({ box, path, ...inputProps })`. Ref is
    `BoxFields.of(box).bind(path)`; `type` from `useRevealToggle` (the eye, which never veils);
    `WhisperFieldAttributes`; `readOnly` while `! box.isShowing` (read with `useSyncExternalStore`).
    Forces `value`, `defaultValue` and `name` to undefined at runtime; omits `ref`, `name`, `value`,
    `defaultValue`, `onChange` from its props type. Works without a provider.
  * `src/vault-controls.tsx`: `VaultLockControl({ vaultlabel })` (null while waiting;
    `CreateVaultButton` while unborn; else "Vault locked/unlocked" and Unlock or Lock) and
    `CreateVaultButton({ vaultlabel })` (disabled with no bank). Click refusals: `declined` is
    dropped, anything else goes to `bank.tellBadNews`.
  * Three words in `src/messages.ts` (`vaultLocked`, `vaultUnlocked`, `lockButton`), a new block at
    the end; `unlockButton` and `createButton` reused.
  * `src/index.ts`: whole new lines only. README: bullets at the top, and sections *A vault's
    boxes*, *A box's whisper field*, *The account menu*.
  * Tests: `tests/hooks.test.tsx` (*the box hooks*, including the `ifPresent: 'get'` test: a stored
    box stays at revision 0 with its whisper), `tests/box-whisper-field.test.tsx` (StrictMode
    included), `tests/vault-controls.test.tsx`.
* **Decisions taken**:
  * Hooks take `Box | null`, so a component can call `useBox` and then the others without
    breaking the rules of hooks.
  * `BoxWhisperField` takes no `ref`. Combining a host ref with BoxFields' ref would need a new
    callback, and a new callback at a render unbinds the old one. If that was the last field, it
    unexposes. Merging with a memo was set aside: an inline host ref still changes at every render.
  * No `name`: a field with no name is not sent by a native form submit, so the whisper can't end
    up in a GET query string. No runtime block on `onChange`: other handlers (`onInput`, `onKeyUp`)
    can read `target.value` anyway, so the type leaving it out is the signal, and a runtime block
    would be theater.
  * Read-only while hidden: BoxFields ignores what is typed into a field it has blanked, so an
    editable blank field would silently lose input.
  * No save or expose hook. The host calls `BoxFields.of(box).save()`, and its own click handler
    calls `vault.ensureUnlocked()` then `box.expose()`. Thread 5's flows can add a hook if one is
    wanted.
  * `VaultLockControl` uses `bank.tryEnsureVault` then `tryEnsureUnlocked`, as the plan says,
    though the vault is already in hand.
* **Discoveries**:
  * React 19 StrictMode does run ref callbacks twice under Vitest. A test pins the known
    regression: a box exposed before a StrictMode mount is unexposed.
  * Changing `path` on a mounted `BoxWhisperField` gives a new ref. If it was the box's only field,
    the box unexposes. Left alone.
  * jsdom has no `Element.getHTML`, though `unicorn/prefer-dom-node-html-methods` asks for it over
    `innerHTML`. Tests use `childNodes` instead.
* **For the Coach**: see the PR's *Open questions*.

Open questions, also on the PR: who exposes for `BoxWhisperField` (the host's own button, for now);
no `ref` on `BoxWhisperField`; a change of `path` unexposes a box's only field; a test pins the
StrictMode regression. No suppressions.
