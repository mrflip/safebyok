---
"safebyok-big": minor
"safebyok-react": minor
---

**`BankSnapshot` gains `openGating`**, the live gating the bank holds open, or null; the bank's subscribers hear it open and settle. **`requestCleartext` becomes optional in `BankOpts`**: with none, no host function is called and a gating waits in the snapshot until its `attempt` or `decline` settles it. A host with one sees no change, but for the new field and the notifications that come with it. **safebyok-react's `BankProvider` renders its dialog from the snapshot**, and renders none when given a `requestCleartext`. Its dialog no longer declines a gating that opens with no live user gesture: the dialog shows, and the click on its button supplies the gesture a passkey needs. Whether the host's `requestCleartext` asks is now fixed at the first render. Nothing stored changes.
