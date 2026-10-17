---
"safebyok-react": patch
---

`PassphraseModal` and `PasskeyUnlockButton` let go once they unmount: an unlock, an erase, a passkey press or the passphrase advice still under way when the host takes the dialog away (or hands it another vault) now finishes unheard. It calls `onDone` and `onGripe` no more, touches no state, and a passkey touched after the button went unlocks nothing. Before, its late outcome reached the unmounted dialog, and where the page itself had gone by then (a test environment torn down), React's read of `window` for the update threw as an unhandled rejection. A host that takes the dialog away mid-unlock reads whether the unlock landed from the vault's snapshot, as `VaultProvider` already does.
