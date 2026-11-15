# Won't fix

Behaviour the new core, `packages/safebyok`, leaves undefined on purpose: cases a host can reach, whose outcome we do
not promise, test or design for. `notes/wontfix-big.md` is safebyok-big's. A reviewer reads `notes/security.md` for
what we decided, and this file for what we decided not to decide.

Each entry is a heading naming the case, then its current outcome, the alternatives (a line on why each plausible one
will not work), the workaround, the steps to create it, and the reasoning. Add one at the end, with who ruled and when.

### A birth over a deleted bank refuses `stale` when another device built the bank again first

* current outcome: `tryBirthBank` refuses `stale` and writes nothing. Until a birth cites the bank it found, as big's
  does, every birth over a bank's tombstone refuses so, race or no race: rebirth waits on the coordinated delete.
* alternatives:
  - retry for the customer: belongs to the customer or to orchestration we provide, never the low-level call.
  - make the new record server-side: the server cannot make a sealed record.
  - lock the bank across the prompt: keeps storage locked while a user types a passphrase, and a lock is a last resort.
* workaround: the customer retries, or the user reloads the page.

Steps to create: device A finds the bank deleted, and asks its user for a passphrase for a new one. Meanwhile device B
builds the bank again, and may delete it again, each with its own user's passphrase. A's user then submits: A's birth
cites the tombstone it found, which is no longer what is stored.

Reasoning for wontfix: it needs three passphrase prompts on two devices racing, and leaves a refusal that writes
nothing, which a retry clears. Mending it would put a retry or a lock in a primitive's critical path. Ruled by the
Coach, 2026-11-15, box_ops thread 1.
