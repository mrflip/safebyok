# Threat model

Who safebyok defends a user's secrets against, what each defence costs, and what it does not
defend. For a host deciding how to build on the library, and for a reviewer deciding whether to
trust it. *Not built yet* at the foot says how far the library is from this page.

## The principle

**Exposure is where a secret rests, times how long it rests there. We shrink both.**

A secret has to be typed, and it has to be used. Anything that can read the page at that moment
can read it, and no library changes that. What the library controls is where the secret goes
afterwards, and how long it stays reachable.

## What is secret, and what is not

| Thing | How secret |
|---|---|
| **Passphrase**, as typed | Secret. Never stored, never sent. |
| **Whisper**, unsealed | Secret. Cleartext only inside a callback, for the length of one call. |
| **bankKey** | Secret. Kept wrapped under a key this browser cannot export; unwrapped for one seal or unseal at a time. |
| **Wrapped bankKey**, in the gate's record | Not secret from the backend or the page, but it is what an offline guess is checked against. We keep it out of logs and out of a host's hands. |
| **Sealed whisper** | Ciphertext. The backend stores it. |
| **Sidecar** | Not secret: it is readable while the bank is locked. We do not disclose its contents ourselves. |

## Who we defend against

| Threat | Stance | The defence |
|---|---|---|
| **The backend**, and anyone who copies what it stores | Defended | It has only ciphertext. A guess at the passphrase costs one Argon2id run, and the passphrase's strength sets how many guesses it takes. |
| **Storage that can write but not decrypt**: the backend again, or anything with a handle on the store | Defended | Compare-and-swap, and stamps (below). |
| **Tooling that serializes**: error reporters, logs, devtools, session replay, persisted caches, bug reports written by people or by agents | Defended, and the main one | A secret never rests anywhere those can walk. |
| **Eyes**: a shoulder, a screen share, a screenshot | Defended | Masked by default; revealing is the user's explicit act. |
| **A walk-up** to an unattended device, or **a stolen device** | Bounded by time | The lease. A closed page is a locked bank. An open one is open until its lease ends. |
| **A script in the page**: XSS, a bad dependency, an extension | Bounded by time, not stopped | It reads what is reachable while it is there. See below. |
| **Whoever controls the device's clock** | Not defended | Every bound on this page that is a length of time is void against them. |
| **The host** | Not an adversary | The host's code runs with the user's page. We check what it hands us by its interface, and do not police its choices. |

### A script in the page, by when it is there

* **Present while a secret is typed or used:** it reads that secret. Nothing here prevents it.
* **Arrives later, or looks once:** it gets only what is reachable at that moment. On a locked
  bank that is ciphertext, sidecars, and the wrapped bankKey. On an unlocked one it can ask the
  vault for any whisper, but it cannot carry off the bankKey, and it never sees the passphrase
  unless the user types it while the script is there.
* **Persistent:** it waits for an unlock. The compromise then covers every whisper it asks for,
  and ends when the script is removed. The keys it read must be rotated; the passphrase need not
  be, unless it was typed meanwhile.

## The rules that follow, and what each costs

1. **A secret has two resting places.** Before submit, a masked, uncontrolled input. After
   submit, the library's private methods. Never React state, a query's data, a mutation's
   variables, an error, a log or a URL. *Cost: none to the user. A host cannot make a secret's
   input controlled.*
2. **Errors and logs carry kinds, never contents.** That includes an error a host's own function
   throws, which may have the secret in its message. *Cost: an error says less when debugging.*
3. **The library empties the `FormData` it is handed.** That object is a copy of the form:
   emptying it changes nothing the user sees. *Cost: none.*
4. **The promise is reachability, not erasure.** A JavaScript string cannot be zeroed. The
   library ensures nothing long-lived points at a secret; it cannot say when the memory is
   reused. Bytes can be zeroed, and it zeroes a passkey's answer once a gating is done with it.
5. **Masking answers eyes.** Never block paste or a password manager. *Cost: a typo in a long
   passphrase is hard to see, which a reveal toggle answers.*

## Why three features exist

* **`withWhisper`, which mixes a secret into one call.** The cleartext exists only inside the
  callback, for the length of the call, and the host never has to keep it. Without it every host
  would keep the key in state or a module variable, and a call-long exposure would become a
  session-long one. It does not stop a script that is present during the call and has wrapped
  `fetch`.
* **The strength check.** The wrapped bankKey is synced to every device and sits in the cache
  while the bank is locked, so it is not secret from the page or the backend. Whoever copies it
  can guess the passphrase offline. Argon2id sets the cost of a guess; the passphrase's strength
  sets how many it takes, and the check is the library's only hold on that. This is why the verb
  judges the passphrase again and refuses `weak_passphrase`: a meter a form can skip is not a
  control.
* **Compare-and-swap, and stamps.** These defend integrity against anything that can write but
  not decrypt.
  * **Compare-and-swap** keeps a revocation revoked. A write cites the revision it read, and
    storage refuses one cited from a stale revision, so a device that missed a passphrase change
    cannot write the old gate back.
  * **A stamp** binds ciphertext to the record and revision it was sealed in. Nobody can move
    one box's whisper into another box, so that the app sends a key to the wrong service, or
    roll a box back to a key the user has replaced: what was moved will not decipher, and the
    library throws.

## Time

Each bound below is a length of time, so each is void against whoever controls the clock.

| Clock | What it bounds |
|---|---|
| **Lease without proof**: how long a bank stays unlocked without asking the user again | How long a walk-up, a thief or a one-shot script finds an open vault and not ciphertext |
| **Lease without contact**: how long a lease stands without its gate being confirmed from the vaultDB | How long a revocation made on another device takes to bite on this one |
| **A secret in a field**: how long typed text sits in an input | How long a walk-up or a late script can read it there |

* **The lease's length is the host's choice, and the common choice is days or never.** A password
  manager is one case. A price-capped token the user types once, for the app to put in a header,
  is another: nobody should be asked for a passphrase every ten minutes to use it.
* **A lease lives only in memory.** Closing or reloading the page ends it, whatever its length.
* **Replacing a passphrase does not re-key.** An old copy of the gate's record, with the old
  passphrase, still opens the bankKey. So every copy of a gate's record is worth protecting for
  good, and a device restores only the signed-in user's.

## Text typed into a form

Two different things empty a form, and only one is the library's.

* **The library** deletes the secret fields from the `FormData`. It never touches an input.
* **React** resets every uncontrolled field of a `<form action={fn}>`. It queues the reset as the
  action starts, so the fields empty after every outcome, a refusal included. A controlled field
  keeps its state. A form that submits from `onSubmit` with `preventDefault` is not reset at all.

None of the threats above is served by emptying a field the user is still working in: the text is
in the same masked input they typed it into. So the target is what a careful ordinary form does.

| Outcome | Passphrase and its confirmation | Whisper field | Other fields |
|---|---|---|---|
| Stored | Cleared | Cleared | The app's choice |
| Refused, and the user can mend it: wrong, weak, already exists, stale | Kept | Kept | Kept |
| Failed: storage, network | Kept | Kept | Kept |
| The user cancels the form | Cleared | Cleared | Cleared |
| The user dismisses an unlock prompt the form opened | No such field | Kept | Kept |

* **What clearing costs.** A provider shows an API key once: a form that empties the key on a
  refused save makes the user mint a new one. A long passphrase cleared for one typo is typed
  again in full.
* **While the submit runs.** Leaving the text in its field adds almost nothing. The cleartext is
  in the library's methods for those seconds anyway, and a script that could read the field then
  could read it before the submit.
* **What follows for a form with a secret in it.** A secret cannot be a controlled field (rule
  1), and an uncontrolled one is emptied by a form Action's reset. To keep a secret's text through
  a refusal, the form either cancels that reset (its `reset` event is cancelable) when the action
  ended in a refusal, or submits from a handler.
* **Masking again is cheap and reasonable.** A revealed field goes back to masked when the tab is
  hidden, or after a while.
* **Where clearing is earned.** When a bank locks, a whisper left in an input is still readable
  by a walk-up. Clearing it then is what a lock means.

## Not built yet

* **A marker on the parts for session-replay tools.** A revealed secret is plain text in the DOM,
  and a replay tool records it. The parts need a stable attribute a host can tell its tool to mask.
* **Masking a revealed field again** when the tab is hidden, or on a timer.
* **Locking when a lease ends.** Today the bank's snapshot reports the time (`leaseEndsAt`), and
  nothing acts on it.
* **A second lease clock, for idleness,** as a host's option beside the lease's length.
* **A freshness bound on the gate:** a lease that needs its gate confirmed from the vaultDB within
  a period the host sets.
* **Forms that keep their text through a refusal.** Today the kit's forms, other than its two
  unlock forms, are form Actions, and are emptied after every outcome.
* **Clearing a secret left in a field when the bank locks.**
* **Re-keying.** Nothing replaces a bankKey. Every other key encrypts once: a whisper is sealed under a fresh key at
  every write, and a wayin's or a lease's key wraps the bankKey once. The bankKey wraps one fresh key for every seal
  in the bank's life, each under a random 96-bit IV, and the accepted limit for random IVs under one key is 2^32 uses
  (NIST SP 800-38D). A vault of secrets is many orders of magnitude below that.
