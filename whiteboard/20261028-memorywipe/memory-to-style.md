# Memory to STYLE.md

My auto-memory's style rulings, written as they would land in STYLE.md. Each block names where it
goes and whether it replaces text or is added. What STYLE.md already says, or what training
already covers, is left out (listed at the end).

## 1. *Naming*, the try-pair paragraph (replaces lines 143-149)

STYLE.md still says the body goes in whichever half is easier, and that a VaultDB adapter's verbs
resolve `Outcome`s alone. The Coach's rulings of 2026-10-27 and 2026-10-28 reverse both.

> **Every public method is a try pair** (the Coach, 2026-10-22): `putBox()` resolves its value or
> throws its refusal, carrying its `refusalkind`; `tryPutBox()` resolves an `Outcome` and never
> throws. **The name follows the return shape, everywhere** (the Coach, 2026-10-27): a function
> resolving an `Outcome` is `tryVerbFoo`, and one that throws or resolves the foo is `verbFoo`. A
> VaultDB's and a DeviceDB's verbs are no exception. A method whose result makes no sense as an
> outcome is renamed. **The body lives in the throwing half**, and ends with the one catch that
> turns a foreign error into its refusal (and tells bad news, where the class does): "that's most
> of its job, it belongs there" (the Coach, 2026-10-28). The `try` half is one line,
> `outcomeOf(() => this.putBox(...))`, never a second implementation. The doc block and the
> `@example`s live on the throwing half, and the `try` half's one line points to it.

## 2. *Naming*, the verb table (rows added)

> | `findFoo` | Resolves the first foo meeting a criterion, or null. Changes nothing. |

And after the table's lead-in sentence:

> No function or method is named `read` or `write` (the Coach, 2026-10-28): a lookup by a unique
> key (composite is fine) is a `get`, the first by a criterion a `find`, get-or-create an
> `ensure`, and a mutation takes its own verb (`put`, `del`, `raise`). A `read` or `write` name
> met in the code is a rename to propose, not a precedent.

## 3. *Control flow and refusals* (bullets added)

> * **Throw where things disagree** (the Coach, 2026-10-22). A disagreement met mid-operation
>   throws from that operation, with a `refusalkind` naming the step that found it; never
>   "ignored", "corrected by the next call" or "last writer wins". A primitive demands
>   consistency on what it was handed before its first await, and on what came back after each
>   one, with `vault.demandConsistentWith(thing)`. A chain of primitives adds no demand between
>   them, since nothing awaits there. Nothing compares the world at an operation's start with its
>   end: only each step is checked. (A vault state that is inconsistent in itself is a different
>   case: CLAUDE.md, *The vaultDB is the ground truth*.)
> * **Keep the demand, cut the force** (the Coach, 2026-10-27). A *force* gives a thing the
>   vault's own fields after an await (stamping a box with the scope the vault holds now), which
>   makes the demand after it vacuous. Capture the stamp before the await, and demand after it.
>   An extra demand that is plainly "await, then demand" is welcome, after host code too (a
>   listener, a logger) that could let the vault go: "don't make me have to think". To hold one
>   bag to another, use a validator's `parseConsistent(val, other, { kind, message })` with
>   `other` naming exactly the fields to hold, or `consistent` / `demandConsistent` /
>   `verifyConsistent` (`src/checks/validator.ts`). These are bag checks, not the Vault's: the
>   Vault has no bare `demandConsistent()`.
> * **One wrapper, at the module's edge** (the Coach, 2026-10-27). A thunk-taking wrapper
>   (`outcomeOf`, an adapter's answer wrapper) is applied once, at the public method. Inside, a
>   plain `try`/`catch` is narrowed to the one foreign call (a `crypto.subtle` call, an adapter
>   hook). Never nest `outcomeOf`. A prepared closure is one hop (`(x) => this.#method(x)`), never
>   a chain. A security reviewer must see where each await and each catch sits.

And on the existing refusal bullet (line 571), a closing sentence:

> Refusal kinds are granular, named for what was observed (`gate_changed_during`, never
> `wrong_passphrase` for a proving a gate change overtook). Make a new kind rather than stretch one
> that fits badly, and add it to the Contract.

## 4. *Validation*, which checks earn their place (paragraph added before *What a refusal says*)

> **Which checks earn their place.** Before proposing a check, name its threat model in one line:
> who supplies the bad input, and can they reach it from outside the host's own code? A check
> against data and storage that is in question stays: remove one only when it is provably
> vacuous, such as a demand on a thing made from the vault's record with nothing between (the
> Coach, 2026-10-27: "I'm inclined to leave the checks if there's a question"). A check whose only
> adversary is a friendly extender's slip (a host's VaultDB adapter, a DeviceDB for a native file
> system) does not go in a critical path: extenders are clever friends, and the conformance
> suites (`describeVaultDB`, `describeDeviceDB`) are the defence against their bugs (the Coach,
> 2026-10-27: "who is the adversary?").

## 5. *Build for maintenance* (bullet added)

> * **A helper sits beside the few callers it serves.** A function that mostly serves one method,
>   or a few close ones, moves next to them rather than being inlined away. It gives a test
>   surface and marks a paragraph of the code (the Coach, 2026-10-22).

## 6. *Comments and doc blocks*, after the `@example` bullet (line 652)

> * **Customer-facing example code reads like production** (the Coach, 2026-10-22): a README
>   recipe, an `@example` or a demo may be simple, but it should look the way that code looks in
>   the customer's deployed app. Name the use cases that would make it differ. Prefer pointing to
>   a real client over a bespoke server ("we should not provide a server nobody wants to use"). An
>   "adapt this to my app" AI prompt can stand beside an example, or in its place.

## Left out

* handlers-only-align: [STYLE.md:393](../../STYLE.md#L393) says it ("No handler sifts broken input
  to explain it: a catch only aligns the kind and attaches context").
* simple control flow, refusal wording, validators as the norm, accepting what is legitimately
  offered: STYLE.md says them already, mostly word for word.
* restyle oddities (`state` names nothing public, stamp = bound fields): STYLE.md lines 72 and 96.
* Naming a schema's own fields in a refusal: STYLE.md line 389.
