# Thread A6: getproof -- Contract drift (2026-10-19)

For whoever carries rulings into the Contract tab. Each item: where, what the Contract says, what the
code does, the proposed text. Each is an *Open Matters* row in the thread file.

1. **`renewWithin`'s unit** (*vault.ensureLease*, signature). The Contract says
   `renewWithin?: number` and no unit. Built as **minutes**, as `staleMinutes` is (0 by default;
   `Infinity` asks at every call). Proposed signature comment: `// minutes before the lease ends to
   ask anyway; 0 by default`. (The other course is renaming it `renewWithinMinutes`; the Contract's
   name was kept.)
2. **`carry_on` when the lease ended meanwhile** (*ensureLease*, Does 3.6). Silent. Built: after
   `carry_on` (and after `unlocked`) the vault still requires a lease to stand, else refuses
   `vault_locked`. Proposed, appended to 3.6: "If the lease ended while the prompt was up, refuses
   `vault_locked`."
3. **A `getProof` that throws** (*ensureLease*, Refuses). Not listed. Built: `unexpected_error`,
   what it threw the cause, never logged nor told. Proposed, under *Fix the code*: "`unexpected_error`,
   when `getProof` throws: what it threw is the cause, and it is never logged, as it may hold the
   passphrase."
4. **Misuse from `attempt`** (*getProof*, attempt refuses). The three groups leave misuse
   (`bad_option`, `unknown_key_deriver`, `vault_closed`, `unexpected_error`) in "any refusal not
   named: close". The shipped dialog closes on it too, but reports it first (React's
   `onCaughtError`, a calm "Something went wrong" whose Close answers `declined`), so a bug is not
   silent. Proposed fourth group: "*Fix the code, then close:* any misuse: report it, then answer
   `declined`."
5. **The passkey's type name.** The Contract's `Ask.attempt` takes `PasskeyAnswer`; the code's
   type is `PasskeyProof` (VOCABULARY's *passkey proof*). Left for B1, whose `Proof` classes settle
   it; no rename here.
6. **`unlock()`** (*Vault*, the call list). The Contract lists no `unlock`, yet says "with no
   `getProof` configured ... your app prompts on its own": an app with no `getProof` has no other
   way to unlock. Kept `unlock(proof, { wayinId? })`, one proof outside any prompt, the same body
   as `attempt`. Proposed: add `tryUnlock(...) unlock(...)` to the call list, and to *getProof*'s
   last paragraph: "...and your app prompts on its own, then calls `vault.unlock(proof)`."
7. **Starting over from the dialog** (*getProof*, *ensureLease* Does 3.7). `del()` lands as a
   lock, so a dialog that deletes the vault to start over closes itself, its calls refused
   `vault_locked`; the next call asks `absent`. Proposed, in *getProof*'s React paragraph: "A start
   over from the dialog deletes the vault, which lands as a lock: the dialog closes, and the next
   call asks the user to choose a passphrase."
8. **The shipped `getProof` as the default** (*getProof*, last paragraph: "Leave `getProof` out and
   the shipped modal is used"). Built now, not in D2: without it, `withUnlockedVault` gone, a
   provider would never prompt. `getProof={null}` is the way to ask no one. Proposed, appended:
   "Pass `getProof={null}` to have every ask declined."
