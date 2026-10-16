# Thread 3, passkey_button_ux: before and after (2026-10-15)

**Unchanged**: a wrong passphrase, storage out of reach, a damaged record, a passkey that doesn't
answer -- each shows in the dialog in the vault's calm words, to retry or cancel. A dismissed
passkey prompt does nothing; a lock that wins closes the dialog.

**A failure not the user's to mend, while unlocking** (a closed vault handle, a vault made with a
key deriver this build lacks, an `rpId` that doesn't fit the page, a bug):

| | Before | After |
|-|--------|-------|
| **End user, passphrase** | The dialog, and whatever the host's nearest boundary wraps (usually the app), is replaced by the host's fallback; with no boundary, React unmounts the root and the page goes blank. The action they started never finishes. | The dialog stays, its form replaced by "Something went wrong. This app ran into a problem of its own, not one you caused, and could not unlock your vault. Your secrets are safe. Close this, reload the page, and try again." and a focused Close. The rest of the app is untouched; Close is a cancel. |
| **End user, passkey** | The same as above: the button's throw took the dialog with it. | The button disappears and the dialog says "Your passkey can't be used here just now. Unlock with your passphrase instead." The passphrase field stays. |
| **Developer** | The error reaches their boundary (its fallback), or with none an uncaught error and the dev overlay; `withUnlockedVault`'s promise hangs. | The broken dialog on screen, and `console.error` from React with the very error and its component stack, in dev and prod; their tracker gets it if hooked on `createRoot(..., { onCaughtError })` (README shows how). Their boundary is never triggered; `withUnlockedVault` resolves null on Close. |

**`withUnlockedVault`**: before, a second overlapping call orphaned the first, and a dialog open
when the provider unmounted or the user changed hung its call (or came back over the next user's
vault holding the old action). After, overlapping calls share the dialog, and every call settles.

**A hand-rendered dialog given `reentryHours` of zero, negative or NaN**: before, thrown to the
host's boundary on first render; after, the same notice on first render, and the same report.

**Opening the vault with a bad option** (`VaultProvider`): unchanged -- thrown to the host's
boundary at mount, on every load.

For the Coach, deciding what remains (thread 3's file, *For the Coach*), and for anyone changing how
`PassphraseModal`, `PasskeyUnlockButton` or `withUnlockedVault` fail.
