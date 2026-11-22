# react_targets: the burndown

Everything outstanding, each item under the core question it waits on, or under *Free*. The plan beside this file has
the rulings and the state of the PRs; `notes/react_lib_principles.md` has the principles.

## Free: waits on no core question

A sprint in another session can take these, in this order.

1. **Built, under review** (each ruled by the Coach, 2026-11-22; three drafts on #821):
   a. [#824](https://github.com/mrflip/safebyok/pull/824) `draft_truth`: a draft forgets only its typed fields when
      its form resets, and no longer its sidecar edits.
   b. [#825](https://github.com/mrflip/safebyok/pull/825) `error_wraps`, on #824: where a `catch` puts its `unknown`
      into something we type `Error`, it is wrapped there, once, by the core's `sanitizeForeignError`. Five calls, each
      at a catch that already existed (`useDraft`'s reveal, `useStrengthVerdict`, `putBoxAction`, `WhisperMask`,
      `WhisperText`); two `as Error` casts go; no new `try`. Nothing else is wrapped (the Coach: trust TypeScript).
   c. [#823](https://github.com/mrflip/safebyok/pull/823) `multiples`: `putBoxMutationOptions(boxNamed, opts)`, the
      `useMutation` twin of `putBoxAction`; `SubmitButton`'s `isPending`; the kit's `refusalTextOf` exported; and
      `secretFieldnames` on `PutBoxActionOpts`: told the names, only those fields are deleted, and a refusal resolves
      the other fields' text as `texts`. Told nothing, every field is deleted, as before. The Coach: "Let's start
      there. If it grows past this I should investigate in a session of its own."
   d. To settle at close-out: #823 and #825 both edit `putBoxAction`'s `catch`, so the squash meets one small merge there.
2. **The demos take up what applies**: Knock-Knock (#822) uses `putBoxMutationOptions` and `SubmitButton`; envman's
   (#819) Undo calls `draft.discard`, its remaining cast goes, and its wrapper around `putBoxAction` gives way to
   `secretFieldnames`. Then one review of each: neither demo PR has been reviewed, since each changes again here.
3. **Headless**: field hooks (`usePassphraseField`, `useWhisperField`, `useWhisperText`, `useWhisperMask`);
   `className` and `data-` state attributes on the parts; overridable words for the kit; `useNewPassphrase().verdict`;
   visible labels in the kit's forms.
4. **Host-facing option types tied to their checks**, as STYLE.md asks (`PutBoxActionOpts`, `DraftPutOpts`,
   `WithLockableWhisperOpts`, `GiverConfig`): today each is written by hand beside a separate check.
5. `WhisperMask` is blank for a moment while locked.
6. **A pass in a real browser**, against the Coach's run of the demos from before this workshop.
6b. **Say what base-32 means in our docs**: in the code it is lowercase `0-9a-v`, as `.toString(32)` writes it (the Coach, 2026-11-22).
7. **Close out**: #819 and #822 caught up onto the line's tip, every PR squashed into #817.

## Waits on ownership and startup

* The giver gives way to a provider that owns the device: hooks imported by name, `useVault()`, tests that reset no
  module, no hook passed as a prop (the Rules of React, and so the React Compiler), `useNewPassphrase()` with no argument.
* One bank, labelled `'main'`.
* Suspending hooks: a box's query is skipped until the bank is brought up, which `useSuspenseQuery` does not accept.
* Typed whispers: straightforward, and best done once the surface is known. TODO.
* **Next.js good citizenship**: a provider that starts nothing on the server; no vault record rendered there; the
  root entry is a client module, so a Server Component cannot call its helpers; adapters that touch no browser global
  when made. Done: `'use client'` on the three entries.

## Waits on the caches

* Two TanStack caches and a bridge, or one: React observing the minder's own client (`useQuery(options, minderClient)`).
  A spike was offered: expose the client internally, rewrite the three record hooks, delete the bridge, run the tests.
* The pending render a `useBox` shows with the record in hand.
* A listing of live records (`useBoxes`), and a box list without deleted boxes (envman's "No secrets yet.").
* The React Query guide's first rule, "React Query is the host's", which holds only if our records are in the host's cache.

## Waits on what a gate is

* Gate verbs: a gating and three exports for each, against verbs that take the form (`vault.unlock(form)`) and
  `actionOf`. Settled already: the unlock form is not an Action, since it may open beneath a caller that is a pending one.
* Dynamic instances. Not yet discussed.

## Waits on error routing (a future session)

* A default transformer that redacts anything secret-looking, the secret in hand included, which a host replaces to
  have something weaker. The library also endeavours not to disclose a wrapped passphrase or a sidecar's contents itself.
* Whether a host listener's throw goes to the platform as thrown, leaving `onBadNews` for the library's own failures.
* `WhisperMask` and `WhisperText` drop a refusal silently when handed no `onError`.
* A storage refusal's message ends with a sentence written for a developer.
* `putBoxAction`'s `err as Error` rests on every vaultDB never throwing.
* The survey of every error sink is in the plan.

## Out of bounds for this workshop

Every ending (lock, sweep, vacate, delete, sign-out), autolock, the storage adapters and a browser vaultDB (each demo
carries the `localStorage` stand-in), the deviceDB.

### For whoever takes up endings: found by #831's review (2026-11-22)

None is repaired, and thread 12 is built so as not to reach them (one device for each Provider's mount, and no `goodbye`).

* **A twin's `goodbye` stops the live minder.** `goodbye` deletes the bank's attachment and removes its entries whether
  or not this minder was the one minding. The reviewer's fix: `if (! this.#isReady) { return }` as its first line.
* **A device with no bank never lets go of a shared client.** `Device.sweep` does nothing without a bank, so a device
  that ends `'unborn'` or `'failed'` keeps its bank's attachment, and a later Device of that bank on the same client
  shows `failed` (`bad_record`). The reviewer's fix: `Device.sweep` says `goodbye` to its minder when it has no bank.
* **After `goodbye` the query defaults stay**, and their fetch functions still ask the vaultDB for the minder that left,
  where an observer is still mounted. The record lands unsettled, and the bank's next minder starts with it. No secret
  material. The reviewer's fix in the core: the fetch functions call `#demandReady()` first.
* **After a Provider unmounts (#837), the giver's `lock()` and `dismissUnlock()` do nothing**, while that mount's device
  stays unlocked, its watch open. Mounting again makes a second device beside it. Before #837 unmounting changed
  nothing, since the giver had the one device for the page.

## Later

* The password manager demo: the pretext for Suspense, nested boxes and pre-baked components. With it, one private
  package for the three files the demos copy.
* The kit as copy-in source, and a registry for it.
* `use(query.promise)`: offered as an option, never as machinery anything of ours depends on.
