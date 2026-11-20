---
---

Empty: only safebyok-react's tests change. A new end-to-end test drives a React 19 app through the giver against the real core: a locked bank, a `useMutation` that calls `vault.withWhisper`, and an unlock dialog whose form action calls `bank.attemptUnlock` with the passphrase from its FormData. It proves a second request while the dialog is open joins the same unlock, and that the passphrase is in no snapshot, no React state and no React Query entry. A host writing its own unlock action should take the passphrase field out of the FormData before the first await: React keeps the FormData a form action is handed, as the form's pending status and in the action's queued update, after the action ends.
