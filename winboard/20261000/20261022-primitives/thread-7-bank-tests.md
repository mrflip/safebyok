# Thread 7: tests rewritten and added (2026-10-22)

For the thread reviewer and the Coach: every test thread 7 retitled, rewrote or added, by file. Retirements are rows in tests-retired.md.

Short rulings in parentheses are the ledgers' own. "Vault.make goes" stands for: Vault.make, the opening state and the first-hello memo go (thread 7). "Never absent": a Vault is never absent, born of vaultDB.ensureVault (thread 7). "Let-go": close() and vault_closed go, a let-go Vault is vault_gone (thread 7). "Option A": the device mark and rolled_back go, the device record and vault_behind (thread 7, the Coach's option A). "Del": del() is delVault then lock(), and the Vault is gone (thread 7). "Gate": created_elsewhere becomes gate_made_elsewhere, the first gate's loser no longer tries its passphrase against the winner (primitives.md, *Gating*). "Lease at birth": a lease is taken up at birth only, never at a hello (revised-outcomes). A title cut short with "..." is cut so in the ledger.

## packages/safebyok/tests/bank.test.ts

Added (the file is new, 43 `it(` and 47 tests with its loops; each @example in src/bank.ts has a test titled for it):
- "reads the bank's options before storage is touched, as its example shows"
- "names the draft's scope under the bank's applabel, as its example shows"
- "refuses a name that fails its check as bad_label, and a misspelt field as bad_option"

Rewritten:
- "ends a prompt up as a lock does: its lockLanded settles, and the call waiting on it refuses" -> "ends a prompt up: its lockLanded settles, and the call waiting on it refuses vault_gone" (orchestrator ruling: a let-go during a prompt refuses its waiters vault_gone; a del() leaves the Vault object gone likewise)

## packages/safebyok/tests/vault/vault-make.test.ts

Rewritten:
- describes "Vault.make" -> "Bank.make and bank.ensureVault"; "Vault.make's options" -> "Bank.make's options"; "Vault.make, by the Contract" -> "Bank.make, by the Contract"
- "settles into 'absent' against an empty backend, prompting nobody" -> "births a vault 'novel' against an empty backend, prompting nobody" (Never absent)
- "refuses forcePassphraseReentryHours, naming leaseHours, as its third example shows" -> "refuses forcePassphraseReentryHours, naming leaseHours" (no doc block's example names it any more)
- "refuses Vault.make over plain http with kind 'insecure_context', before it touches storage" -> "refuses Bank.make over plain http ..." (Vault.make goes)
- "refuses a clock reading ${blurb} at Vault.make, before reading storage" -> "... at Bank.make, ..." (8 cases); "checks the clock once, at Vault.make: ..." -> "... at Bank.make: ..."; "refuses a clock whose now() throws, at Vault.make, ..." -> "... at Bank.make, ..."
- "refuses a deriver that hands back anything but 32 key bytes, and makes no vault of it" -> "..., and sets no passphrase with it"; "refuses a deriver that hands back 32 zero bytes, a key anyone could rebuild, and makes no vault of it" -> "..., and sets no passphrase with it" (Never absent: the gateless props stand from birth)
- "warns each time a vault is opened, quoting no passphrase" -> "warns each time a bank is made, quoting no passphrase" (the deriver is checked at Bank.make)
- "validates every option, refusing ${blurb} ... (Contract: Vault.make, Does 1)" -> "... (Contract: Bank.make, Does 1)" (5 cases)
- "takes staleMinutes of zero, fractions and Infinity, and an onBadNews of null as none (Contract: Vault.make, Does 1)" -> "... (Contract: Bank.make, Does 1)" (the bank reads 'made' where the handle read 'opening')
- "touches no storage, no device store, no timer and no prompt until a call asks (Contract: Vault.make, Guarantees)" -> "... (Contract: Bank.make, Guarantees)"
- "has the first hello read storage, start the storage watch, and settle (Contract: Vault.make, Guarantees)" -> "has the birth read storage once, start the storage watch, and settle (Contract: bank.ensureVault, Guarantees)" (Vault.make goes)
- "starts the watch once, and reads once, over a store that rings as it is subscribed to" -> "starts the watch once over a store that rings as it is subscribed to, reading what the ring asks for once"
- "closes a handle that never said hello with nothing to undo, its watch never started" -> "ends the watch it started when the bank lets the vault go, and only once" (Let-go; every Vault starts its watch at birth)
- "returns the instance synchronously, no promise (Contract: Vault.make, Returns)" -> "returns the bank synchronously, no promise (Contract: Bank.make, Returns)"
- "refuses by throwing, and only misuse, ... (Contract: Vault.make, Refuses)" -> "... (Contract: Bank.make, Refuses)" (its bad_label case is a bad applabel)
- Titles kept, bodies moved: "refuses a call with no bag of options at all" (now Bank.make, synchronous); "hands on storage's damaged_vault ..." and "hands on an adapter's corrupt_record ..." (spy ensureVault); "hands on subscribe and getSnapshot alone, bound to their vault, as the class's first example shows" (after del() the Vault is gone and 'locked')

## packages/safebyok/tests/vault/vault-twins.test.ts

Rewritten:
- "lock: the try form resolves its refusal, 'vault_closed', as err, and the throwing form throws that same refusal" -> "... 'vault_gone', ..."; "del: the try form resolves its refusal, 'vault_closed', ..." -> "... 'vault_gone', ..." (Let-go)
- "answers as the vault class's second example shows: a wrong passphrase branched on, never thrown" -> "... fourth example ..." (the second has its own test in vault-make)
- "hellos when wrapped as its fourth example shows, the handler reading storage on the event" -> "... as its third example shows, ..."
- Titles kept, bodies moved: the two bad-news-once tests (the damage meets a born Vault's hello); "refuses an event in place of its options as bad_option, naming the wrap, and reads nothing"; the throwing-listener test and three other hello-as-a-handler tests (Vault born by world.open)

## packages/safebyok/tests/vault/vault-del.test.ts

Rewritten (Del unless noted):
- "del() removes every trace of this vault, and only this vault" -> "del() removes every trace of this vault but its tombstone, and only this vault: the Vault object is gone after"
- "del() works on a locked vault: owning the account is enough to delete it" -> "..., and the bank's next life is novel"
- "del() on a handle that has seen no vault looks first, and deletes the one made elsewhere since: 'delete my vault' never reports success over one standing" -> "del() from a novel picture of a vault gated elsewhere since refuses as stale, locking nothing: 'delete my vault' never reports success over one standing" (Never absent)
- "del() on a vault already gone is quiet: a second del() finds nothing to refuse" -> "del() on a novel vault deletes it, and the Vault object is gone: a second del() refuses vault_gone; the next life's unlock and del() land"

Added:
- "del() raises this device's record of the vault to the tombstone's epoch, never erasing it"

## packages/safebyok/tests/vault/vault-wayins.test.ts

Rewritten:
- "refuses on a vault that does not exist yet (Contract: putWayin, Refuses)" -> "refuses on a novel vault, which has no passphrase yet, as absent_vault (Contract: putWayin, Refuses)" (Never absent)
- "refuses on a closed handle as vault_closed (Contract: putWayin, Refuses)" -> "refuses on a Vault object let go as vault_gone (Contract: putWayin, Refuses)" (Let-go)
- "an unlock with a passkey never creates a vault: an absent one refuses as absent_vault" -> "an unlock with a passkey never gates a vault: a novel one refuses as absent_vault, and stays novel"
- "creating nothing" -> "writing nothing" in: "without a strengthChecker, refuses every new passphrase as too weak, ..."; "with zxcvbnStrengthChecker, refuses a common password, ..."; "refuses a checker that answers no verdict as 'bad_option', ... creating nothing and telling no news"; "refuses a broken checker from an ask's attempt, which getProof sees, ..."; and the three "refuses a checker that throws {an Error,a condition,a misuse} as 'unexpected_error' naming strengthChecker, ..." (Never absent)
- "refuses at Vault.make, in its schema's words, a strengthChecker that is not a function, or whose load is not one" -> "refuses at Bank.make, ..."; "refuses at Vault.make the option's old name, naming the new" -> "refuses at Bank.make the option's old name, naming the new" (Vault.make goes)
- "runs the checker's load at the first hello, never at make, beside the read of storage, and never again once it succeeds" -> "runs the checker's load at the bank's hello, never at Bank.make, and never again once it succeeds"
- "starts the load and the read of storage together, and settles the hello only once both have" -> "reads storage for a birth only once the checker's load has succeeded"
- "fails a hello whose checker's load fails as unexpected_error, what it threw the cause, taking up no lease, and loads again at the next hello" -> "fails a birth whose checker's load fails as unexpected_error, what it threw the cause, bearing nothing, and loads again at the next ask"
- "refuses a hello as its load failed, though its read of storage failed too" -> "refuses a birth as its load failed, never reading storage"
- "{putWayin(), a new passphrase | putWayin(), a new passkey | delWayin()} refuses absent_vault on a vault that does not exist yet" -> "... refuses absent_vault on a novel vault, which has no way in yet, writing nothing"

Added:
- "lands though the vault is deleted elsewhere as storage answers it, but the gone Vault object writes no lease and takes nothing into its picture"
- "lands though the bank lets the vault go as the device record is raised after it, but writes no lease"

## packages/safebyok/tests/vault/vault-boxes.test.ts

Rewritten:
- "refuses 'vault_closed' once the vault is closed" -> "refuses 'vault_gone' once the vault is let go" (Let-go)
- "takes an adapter's Infinity, for no limit, as the largest finite limit, so nothing past Vault.make holds Infinity" -> "... past Bank.make ..."
- "never let a name hold ^, which storage joins names on: refused at Vault.make and at putBox(), whatever the validators" -> "... refused at ensureVault and at putBox(), ..."; "refuse a user_id of 101 characters at Vault.make, under the default check" -> "... at ensureVault, ..." (userId and vaultlabel are the draft's)
- "plans no less at Vault.make than a store weighs a box at the default checks' longest" -> "... at Bank.make ..."
- Bodies only: the remadeWorld helper re-ensures `there` from its bank between del() and unlock(), and the remake's hello refuses 'vault_remade' (Del); limits/validators tests expect 'novel' for 'absent'; the sidecar test spies on the birth's ensureVault

## packages/safebyok/tests/vault/vault-races.test.ts

Rewritten:
- "refuses as closed when close() lands while storage is read, handing back nothing" -> "refuses as gone when the bank lets the vault go while storage is read, handing back nothing"; "refuses as closed when close() lands while the whisper is deciphered, its callback never called" -> "refuses as gone when the bank lets the vault go while the whisper is deciphered, its callback never called" (Let-go)
- "reads as no vault yet: gateless vault props hold no way in to try" -> "is born novel: gateless vault props hold no way in to try" (Never absent)
- "takes a first unlock's passphrase as its gate: the vault the other device ensured is gated here, under its vault_tok, and unlocked" -> "... is born here, and gated under its vault_tok, and unlocked"
- "refuses as created_elsewhere when the passphrase does not open the vault the other device made, as unlock's example shows" -> "refuses as gate_made_elsewhere when another device set the first gate first, as unlock's third example shows" (Gate)
- "settles locked on the standing vault, reading nothing more, and unlocks it with the passphrase chosen there" -> "takes nothing of the winner's gate into the picture: the next hello reads storage afresh, settles locked, and the passphrase chosen there unlocks it" (Gate)
- "tells a second wrong passphrase as wrong_passphrase: the vault now stands, and created_elsewhere is only for the first unlock" -> "... and gate_made_elsewhere is only for the first unlock"
- "refuses as created_elsewhere when another device gates the vault ensured gateless between this unlock's ensure and its gate, under a passphrase this one does not open" -> "refuses as gate_made_elsewhere when another device gates the vault between this unlock's look and its gate, leaving the winner's gate standing" (Gate; Never absent)
- "deleted and not remade: the unlock takes up nothing, throws 'vault_gone', and the vault reads as absent" -> "... and the Vault object is gone" (Del)
- "taken up by a read meanwhile, and still standing: the make unlocks" -> "... the gate unlocks" (Option A: held at the gate write's answer, not at putMark)
- "deleted: the vault stays absent, as the read found it, and nothing is unlocked" -> "deleted: the Vault object is gone, as the read found it, and nothing is unlocked"
- "deleted and made anew: the vault shows the new one, locked, never the deleted one's ways in" -> "deleted and made anew: the Vault object is gone as vault_remade, and the bank's next shows the new one, locked, never the deleted one's ways in"
- describe "close" -> "letting a Vault object go" (Let-go): "a closed handle refuses everything thereafter" -> "a Vault object let go refuses everything thereafter as vault_gone"; "an unlock under way when the handle closes takes nothing up, is granted no lease, and throws 'vault_closed'" -> "an unlock under way when the bank lets the vault go takes nothing up, is granted no lease, and throws 'vault_gone'"; "a close during the unlock's device record write erases nothing: close is not a lock, and the next open picks the record up" -> "a let-go during the unlock's lease write erases nothing: letting go is not a lock, and the next birth takes the lease up"; "leaves a lease and the device mark as they stood" -> "leaves a lease and the device record as they stood"; "a second close does nothing: the storage watch is ended once" -> "a second let-go does nothing: the storage watch is ended once"; "closing forgets nothing stored: the next open still finds the vault" -> "letting go forgets nothing stored: the next birth still finds the vault"
- (Del) "putBox() is refused vault_gone at its read of the box, storage refusing the vault it names as vault_mismatch, instead of landing in the reborn vault; a hello then relocks" -> "putBox() is refused vault_gone at its read of the box, storage refusing the vault it names as vault_mismatch, instead of landing in the reborn vault; the Vault object is gone with it, every later call refusing vault_gone" (a box read meeting vault_mismatch now lets the Vault object go; the ledger's intermediate title ended "a hello then finds the vault made anew, and the Vault object is gone as vault_remade")
- (Del) "getWhisper() of a box the reborn vault wrote refuses as vault_gone at once, never damaged_box, reading no vault props; the next hello, within staleMinutes or not, reads afresh, finds the vault moved, and locks" -> "getWhisper() of a box the reborn vault wrote refuses as vault_gone at once, never damaged_box, reading no vault props; the Vault object is gone with it, and the next hello refuses vault_gone, reading nothing" (same)
- (Del) "del() is refused by storage as stale: the reborn vault survives, and a hello and a second del() take it" -> "del() is refused by storage as stale, locking nothing: the reborn vault survives, and the bank's next Vault object deletes it"
- (Del) "putWayin() proves against the standing vault props, never burying the reborn vault's" -> "putWayin() reads first, finds the vault made anew, and refuses vault_remade, never burying the reborn vault's ways in"
- (Del) "unlock() syncs first: the reborn vault's own passphrase opens it from the stale handle" -> "unlock() reads first: the stale Vault object finds the vault made anew and refuses vault_remade, and the bank's next opens with the reborn vault's own passphrase" (its first putBox step was dropped, as that now lets the Vault object go)
- (Del) "putBox() into a vault deleted elsewhere, and not remade, is refused, writing nothing; a hello finds it absent" -> "...; a hello finds it deleted, and the Vault object is gone"
- (Del) "del() of a vault deleted elsewhere, and not remade, is refused as stale; after a hello, a second del() is quiet" -> "del() of a vault deleted elsewhere, and not remade, is refused as stale, locking nothing; a hello finds the Vault object gone, and the bank's next life, novel, deletes quietly"
- "says syncing: false while the storage watch cannot read, warns once for the streak, and once when a read succeeds" -> "says freshness: 'refused' while the storage watch cannot read, ..." (no listed ruling fits: the brief's *States*, `syncing` gone and `freshness` in its place)
- Body only: "del() aims at the vault seen when it was called, not one a change bell brings in while it runs" now refuses 'vault_gone', hooked at delVault

Added:
- "refuses as gate_made_elsewhere whatever passphrase either chose: the loser never tries its own against the winner's gate" (in place of the retired "unlocks the vault the other device made ...")

## packages/safebyok/tests/vault/vault-hello.test.ts

Rewritten:
- "settles the snapshot into absent, locked or unlocked, as its first example shows" -> "settles the snapshot into novel, locked or unlocked, as its first example shows" (Never absent)
- "is shared: hellos made while one runs wait..." -> "is shared: hellos made while one reads wait on its one read, each resolving the vault"
- "forgets a hello refused at once: the next reads afresh, and clears the trouble once it succeeds" -> "reads afresh after a refused hello, whatever the next one's staleMinutes, and shows the read timely once it succeeds" (Vault.make goes)
- "leaves the vault opening when its first hello is refused, the refusal its caller's and no trouble, until a retry settles it" -> "leaves the vault as its last read left it when a hello is refused, the refusal its caller's and no trouble, its freshness refused until a retry reads"
- "refuses a call as the hello it waited for was refused" -> "refuses a call as the hello it says first was refused" (the del() half dropped: Del)
- "clears a damaged vault and says hello again on the same handle, as its second example shows, and delDamagedVault's" -> "clears a damaged vault, and the bank births it anew, novel, as delDamagedVault's example shows"
- "reads afresh once a background refresh has failed, saying syncing: false until..." -> "reads afresh once a background refresh has failed, its freshness refused until a read succeeds, and nothing of it as trouble" (syncing -> freshness)
- UntrustedWriteCases: "reads afresh once a write is refused as 'rolled_back': storage saying the vault went back" -> "... as 'vault_behind': storage handing back an older copy than this device has seen" (Option A)
- "shows the vault absent once del() lands, from the deletion itself: a hello within staleMinutes reads nothing" -> "refuses 'vault_gone' once del() lands, reading nothing: the Vault object went with the vault" (Del)
- "refuses with kind 'vault_closed' after close(), as every later call does" -> "refuses with kind 'vault_gone' once the bank lets the vault go, as every later call does" (Let-go)
- "never takes the state back to opening: a locked vault whose read fails stays locked, saying it is not syncing" -> "keeps a locked vault locked when a background read fails, its freshness refused"
- "lets lock() win at once, waiting for no hello: storage unreachable, and the lease being read is not taken up" -> "lets lock() win at once, waiting for no hello under way, whose read unlocks nothing" (Lease at birth)
- "lets lock() and close() go while storage has not answered at all" -> "lets lock() and the bank's closeVault() go while a hello's read has not been answered at all"
- "takes up no lease for a handle closed while its hello ran" -> "takes nothing from a read answered once the bank let the vault go, and erases no lease"
- loop: "rejects with the very error, the vault still opening and not syncing, its trouble none, when ..." -> "rejects with the very error, the vault as its last read left it but for its freshness, refused, and its trouble none, when ..." (the case "storage fails listing the boxes" became "...a vault with a box and a lease", as getVault is one read)
- "says the device's own store failing to read its mark of the vault..." -> "... its record of the vault ..."; DeviceVerbCases getMark/putMark/delMark -> getDeviceRecord/raiseDeviceRecord/delDeviceRecord; BlockedNameCases now fail raiseDeviceRecord (Option A)
- "keeps its storage watch, so the vault settles of itself once storage relents and rings" -> "... reads of itself ..."
- "ends its storage watch only when closed: a refused hello leaves the handle for the host to retry or close" -> "ends its storage watch only when let go: a refused hello leaves the vault for the host to retry or let go"
- "tells the logger nothing of a hello refused after the handle closed under it" -> "... after the bank let the vault go under it"
- "takes up this device's lease while it still fits, and not once it has run out (Contract: vault.hello, Does 2)" -> "takes no lease up, fit or not: the vault's birth took up this device's (Contract: vault.hello, Does 2)" (Lease at birth)
- "takes its staleMinutes from make, ..." -> "takes its staleMinutes from Bank.make, ..."
- "says hello again when the page shows, ..., as its third example shows" -> "..., as its second example shows"
- "refuses damaged_vault, props that fail their checks, told to onBadNews and returned (Contract...)" -> "..., the vault standing as its last read left it (Contract...)"
- "refuses rolled_back, an older vault than this device has seen, forgetting the lease, told to onBadNews and returned (Contract: vault.hello, Refuses)" -> "refuses vault_behind in another tab, an older copy than this device has seen: it takes nothing, writes nothing, locks, and is told to onBadNews once (Contract: vault.hello, Refuses)" (Option A)
- onBadNews describe: seven tags "(Contract: Vault.make, The handler)" -> "(Contract: Bank.make, The handler)", met at a refresh of a born vault
- describe "a lease take-up a key change overtakes" -> "a lease read a key change overtakes": "...while a hello is taking up the lease" -> "...while a hello reads this device's lease"; "...when a hello's take-up of the older one finishes after it" -> "...when a hello's read of the older one finishes after it"; "...when a hello's take-up discards the run-out one while it is written" -> "...when a hello reads the run-out one while the fresh one is written" (Lease at birth)
- describe "a revocation read while a key is being taken up" (take-ups are ensureLease()'s now): "...while a refresh that has read a new epoch is still listing the boxes" -> "...is not yet answered"; "leaves a change elsewhere standing over the vault this device just made, ..." -> "... over the gate this device just set, ..."; "stays locked when the passphrase changes on another device while a hello takes up this device's lease" -> "... while ensureLease() takes up ..."; "stays locked when the vault is deleted and made anew on another device while a hello takes up this device's lease" -> "takes up no lease, the Vault object gone, when the vault is deleted and made anew on another device while ensureLease() takes up this device's lease"

Added:
- describe "hello: freshness, the vault gone, and this device's record", with:
  - "shows its freshness timely after a read, aged once staleMinutes pass, refused once a read fails, and timely again once one succeeds"
  - "makes the Vault object gone when a refresh finds the vault deleted: it refuses 'vault_gone', as every later call does"
  - "makes the Vault object gone when a refresh finds the vault deleted and made anew: it refuses 'vault_remade', as every later call does, and the bank births the new life"
  - "raises this device's record of the vault to what it read"
  - "resolves all the same when the record will not rise, telling the logger, the device store's error the cause"
- "never unlocks an older copy than this device has seen: an unlock refuses vault_behind, its passkey opening nothing"
- "ignores an older copy in the Vault object that saw the newer, as a late read of its own write: it refuses nothing, takes nothing, and stays unlocked"
- "is refused vault_behind at a new birth too, and accepted once bank.clearCachedVault() has this device forget the vault, as its example shows"

## packages/safebyok/tests/vault/vault-storage.test.ts

Rewritten:
- "says nothing of an unreadable lease that could not be erased: hello rejects instead, and the logger hears nothing" -> "leaves an unreadable lease where it lies at birth: no erase is tried, and the vault is born locked" (birth drops, never erases, a lease that does not fit: guarantees-audit 9)
- "revokes the lease when it meets the open, which then refuses" -> "revokes the lease when it meets the vault's birth, which then refuses"
- "takes no option to stay unlocked: Vault.make refuses one, ..." -> "...: Bank.make refuses one, ..."
- describe "the device mark" -> "this device's record of the vault" (Option A): "is kept from the vault's making: its vault_tok, the epoch seen, and an id of its own, which the first way in carries" -> "is kept from the vault's birth: the scope, the highest vault_epoch seen, and an id of its own, which the first way in carries"; "is started under the id the first way in carries, though a refresh the vault's making set off gets there first" -> "keeps the id the first way in carries, though a refresh the first gate set off gets there first"; "rises with each newer version of the vault props, ..." -> "rises with each newer vault_epoch, its own writes' and another device's, ..."; "survives lock(), and del() forgets the vault it has seen" -> "survives lock(), and del() raises it to the tombstone's vault_epoch, erasing nothing" (Del); "starts anew, under a new id, for a vault made anew under the scope" -> "is one for the scope across the vault's lives: a vault made anew keeps this device's id, its epoch carried on"; "reads a mark naming another scope as none, says so through the logger, and starts again" -> "reads a record naming another scope as none: the vault is born, its record started again under its own scope" (the logger claim is left to the ruling); "is erased by delDamagedVault, with the vault" -> "is raised by delDamagedVault to the tombstone's vault_epoch, never erased"
- describe "vault props rolled back" -> "vault props behind this device's record" (Option A): "refuses an older copy at open as rolled_back, writing nothing, and quoting none of it" -> "refuses an older copy at birth as vault_behind, writing nothing, quoting none of it, and lowering no record"; "... and a handle made anew refuses it" -> "... and a birth made anew refuses it"; "... another tab of this device raised the mark meanwhile" -> "... raised the record meanwhile"; "takes the copy up again once storage hands back the newest" -> "is taken up again once storage hands back the newest"; "takes an older copy under a raised gate epoch as it stands, ..." -> "takes an older copy under a raised vault_epoch as it stands, ..."; "is accepted on this device once its mark of the vault is erased, as the README's recipe does" -> "is accepted on this device once bank.clearCachedVault() has it forget the vault, as clearCachedVault's example shows"; "met while a del() waits on the hello, refuses that del() as stale, deleting nothing and keeping the mark" -> "restored under a del(), refuses that del() as stale, deleting nothing, locking nothing, and lowering no record" (Del: del() waits on no hello); "is still refused by the README's recipe when the host knows of no restore" -> "... by clearCachedVault's example ..."
- Titles kept, bodies moved: the scoping tests expect 'novel' for 'absent'; the two "is not the vaultDB's" tests ring u2's scope; the logger tests watch ensureVault, not getVault

Added:
- "refuses the birth as storage did, and warns, when the device store will not erase the lease"
- "reads a malformed record, one with no device_id, as none: the vault is born, and its first way in carries a device_id of its own"
- "gives way to the record it handed over when the store's answer to the birth's raise is malformed: the first way in carries that record's device_id"
- "reads a record naming another scope as none at a refresh too: the read is taken, never refused vault_behind"

## packages/safebyok/tests/vault/vault-demand.test.ts

Rewritten:
- "is null while the vault holds no vault: before a read, and while none is made" -> "is never null: a novel vault's is its scope and vault_tok, at gate_epoch 0" (Never absent; Vault.make goes)
- "refuses 'vault_closed' after close()" -> "refuses 'vault_gone' once the bank lets the vault go"; "refuses as hello() does: 'vault_closed' after close(), in its try form too" -> "refuses as hello() does: 'vault_gone' once the bank lets the vault go, in its try form too" (Let-go)
- "drops the lease from memory, erasing nothing, when the vault was deleted and made anew elsewhere: the old life's lease is never taken up" -> "makes the Vault object gone, 'vault_remade', erasing nothing, when the vault was deleted and made anew elsewhere: the old life's lease is never taken up" (a refresh that finds another vault_tok makes it gone; birth drops, never erases, a lease that does not fit)
- Title kept, body moved: "refuses a box from before the vault was deleted and made anew elsewhere as 'vault_remade', as its first example shows"

## packages/safebyok/tests/vault/vault-lease.test.ts

Rewritten:
- "lowered from Infinity to one hour, discards a lease already granted at its next open, and the next unlock lasts an hour" -> "lowered from Infinity to one hour, takes no lease already granted up at its next birth, leaving it where it lies, and the next unlock lasts an hour" (birth drops, never erases)
- "writes no record on any open, shortened or not" -> "writes no lease on any birth, shortened or not" (Option A)
- SpoiledWayins loop (14): "reads <blurb> as no lease, and discards it" -> "reads <blurb> as no lease at birth, and leaves it where it lies"
- "says through the logger that a record naming another scope was discarded" -> "... could not be read, and was left where it lies"; "says once through the logger that a record from before the lease, under safebyok-unlock-v1, was discarded" -> "... could not be read, and leaves it where it lies"
- "resolves though the device mark could not be kept, says so through the logger, and stays unlocked" -> "resolves though the device record could not be raised, says so through the logger, and stays unlocked" (Option A)
- "asks why 'absent' of a vault never made, and the proof makes it (Contract: ensureLease, Does 3)" -> "asks why 'novel' of a vault with no passphrase yet, and the proof gates it (Contract: ensureLease, Does 3)" (Never absent)
- "refuses every waiter vault_locked at once and settles lockLanded when a close() lands while the prompt is up (Contract: ensureLease, Does 3.7)": the close() case became its own test, "refuses every waiter vault_gone at once and settles lockLanded when the bank lets the vault go while the prompt is up (Contract: ensureLease, Does 3.7)" (Let-go)
- "refuses every waiter vault_locked at once and settles lockLanded when a del() lands while the prompt is up (Contract: ensureLease, Does 3.7)" -> "refuses every waiter vault_gone at once and settles lockLanded when a del() lands while the prompt is up (Contract: ensureLease, Does 3.7)" (orchestrator ruling: a let-go during a prompt refuses its waiters vault_gone; a del() leaves the Vault object gone likewise)
- "refuses vault_closed after close()" -> "refuses vault_gone once the bank lets the vault go"; "refuses vault_closed for a close() landing during its hello, asking getProof nothing" -> "refuses vault_gone for a let-go landing during its hello, asking getProof nothing" (Let-go; the hello is a stale vault's read)
- describe "Vault.make's getProof" -> "Bank.make's getProof"; "refuses anything but a function, or none, as bad_option" kept, a null getProof born 'novel'
- "answers at once for a vault never made, rather than asking to make one only to find nothing in it: getWhisper and delBox refuse absent_box" -> "answers at once for a novel vault, rather than asking to gate one only to find nothing in it: ..."
- "refuses weak_passphrase on absent, the checker's reason its message, creating nothing (...)" -> "refuses weak_passphrase on novel, the checker's reason its message, gating nothing (...)"
- "refuses created_elsewhere on absent when another device made the vault meanwhile under another passphrase, to show in place and ask again (...)" -> "refuses gate_made_elsewhere on novel when another device gated the vault meanwhile, to show in place and ask again (...)" (Gate: the vault stays 'novel', and the next attempt unlocks)
- Title kept, body moved: "says hello first, and refuses with hello's refusal as it came (Contract: ensureLease, Does 1, ...)": a born, locked vault past staleMinutes

Added:
- "refuses vault_gone for a let-go landing while it takes up another tab's lease, taking nothing up and asking getProof nothing"
- "takes nothing up when a lock() lands while it takes up another tab's lease: the take-up stands down, and the lock erases the lease"
- Eight cases under the describe "a lock or a let-go landing while a box call waits to be unlocked (risk 10)", the Coach's ask for coverage of risk 10's waits: "refuses putBox()/delBox() vault_locked for a lock() landing during its hello / its take-up of another tab's lease, ..." and "refuses putBox()/delBox() vault_gone for a let-go landing during ..." (each over the looped templates "refuses ${callname} vault_locked for a lock() landing during ${waitname}, taking nothing up and changing nothing stored" and "refuses ${callname} vault_gone for a let-go landing during ${waitname}, asking getProof nothing and changing nothing stored")

## packages/safebyok/tests/box.test.ts

Rewritten:
- "refuses as 'absent_vault' a box of a vault that holds no vault props, when no stamp is handed" -> "refuses a null stamp as 'bad_option': a vault always holds one, so there is no vault-not-made-yet to say" (Never absent)
- "refuses as 'absent_vault' a seal into a vault that holds no vault props" -> "refuses as 'vault_gone' a seal into a vault let go" (Never absent)

## packages/safebyok/tests/device-db.test.ts

Rewritten (Option A):
- "treats a mangled mark as no mark, and clears it" -> "treats a mangled device record as none, and clears it"
- "answers a null mark as a good Outcome, as its second example shows" -> "answers a null device record as a good Outcome, as its second example shows"

Added:
- describe "raisedDeviceRecord": "stores the record as it came where none stands, as its first example shows"; "keeps the higher highest_vault_epoch where a record stands, as its second example shows"; "raises a standing record to a higher epoch, keeping its own device_id"; and the looped case "gives way to the record handed to it over ${blurb}"
- describe "deviceRecordFor", two example tests: "hands back a record of the scope as it came, and none as none, as its first example shows"; "reads a record naming another user as none, as its second example shows"; and six looped cases "reads ${blurb} as none"
- "says a failing store reading its device record as 'storage_unavailable', as its first example shows"; "says site data blocked as 'storage_blocked', the store's error its cause, as its second example shows"

## packages/safebyok/tests/idb.test.ts

Rewritten (Option A):
- "discards a device's lease from before the rename, filed under unlock^, keeping its device mark: the user proves once more" -> "... keeping its device record: ..."
- "keeps every device mark through a sweep: a mark's ckey is one this version files" -> "keeps every device record through a sweep: a device record's ckey is one this version files"
- "reads a mark that does not pass its check as none, and drops it" -> "reads a device record that does not pass its check as none, and drops it"

## packages/safebyok/tests/browser.test.ts

Rewritten (each now builds a bank, as browserOpts' examples do; Vault.make goes, Never absent):
- "spreads into Vault.make beside the host's vault store" -> "spreads into Bank.make beside the host's vault store, as its first example shows"
- "yields to a strength checker of the host's own, passed after it" -> "..., as its third example shows"; "yields to a field the host passes after it" -> "..., as its second example shows"; "answers the same frozen bag for the same dbName, so a render may call it" -> "..., as its fourth example shows"
- "brings the zxcvbn test to Vault.make: a common password is refused at create" -> "brings the zxcvbn test to Bank.make: a common password is refused at a first unlock, as zxcvbnStrengthChecker's first example shows"
- describe "zxcvbnStrengthChecker, as Vault.make's strengthChecker" -> "..., as Bank.make's strengthChecker": "refuses a common password at create with kind 'weak_passphrase', and creates the vault with a strong one" -> "refuses a common password at a first unlock with kind 'weak_passphrase', and gates the vault with a strong one"

## packages/safebyok/tests/zxcvbn-strength-checker.test.ts

Rewritten:
- "fails a vault's hello as unexpected_error when zxcvbn fails to load, though it read storage, and opens at the next hello" -> "fails a bank's hello as unexpected_error when zxcvbn fails to load, births no vault, and births one at the next ask" (Vault.make goes)

## packages/safebyok/tests/del-damaged-vault.test.ts

Rewritten:
- "clears a vault whose hello() refuses it as damaged_vault -- its vault props, its boxes and this device's lease -- so a new one can be made" -> "clears a vault whose birth refuses it as damaged_vault -- ... -- so a new one can be born" (Never absent; the new one is novel)
- "checks the scope with the vault's validators, ..., and refuses a misspelt bag as Vault.make does" -> "... as Bank.make does"; "takes the options Vault.make took, and refuses misuse before touching storage" -> "takes the options Bank.make took beside the vault's names, and refuses misuse before touching storage"; "checks names with the host's validators, as Vault.make does" -> "..., as Bank.make does" (Vault.make goes)
- Title kept, body moved: the device-store failure test now fails raiseDeviceRecord, not delMark (Option A)

## packages/safebyok/tests/errors.test.ts

Rewritten:
- "is false for a closed handle, misuse too" -> "is false for an unexpected error, misuse too" (Let-go)
- "a vault made on another device meanwhile asks for the passphrase chosen there" -> "a first passphrase set on another device meanwhile asks for the passphrase chosen there" (Gate)
- "storage handing back an older copy of the vault is a fact a user can be told" -> "storage handing back an older copy of the vault than this device has seen is a fact a user can be told" (Option A)
- "a vault never made is made by the first unlock" -> "a novel vault, asked for what only a gated one has, is set up by its first unlock" (Never absent)

## packages/safebyok/tests/index.test.ts

Rewritten:
- "leaves Argon2id out of an app that imports Vault.make alone" -> "leaves Argon2id out of an app that imports Bank alone" (Vault.make goes)
- Titles kept: the surface and Ckeys lists gain Bank, DeviceRecord, DeviceRecordFormat, raisedDeviceRecord, deviceRecord, isDeviceRecord, and lose mark, isMark

## packages/safebyok/tests/refusal-policy.test.ts

Rewritten:
- "locks for rolled_back: storage handing back an older copy is as little to be trusted" -> "locks for vault_behind: ..." (Option A)

## packages/safebyok/tests/names.test.ts

- Title kept: the expected message says Bank.make's validators.

## packages/safebyok/tests/types.test.ts

Rewritten (Option A):
- describe "DeviceMark" (11 cases) -> describe "DeviceRecord" (11 cases)
- "a mark of a vault seen at a later epoch" -> "a record of a vault seen at a later epoch"; "a whole mark" -> "a whole device record"; "a format this version does not know" and "an empty device_id" kept
- "Stored record formats > safebyok-mark-v5" -> "safebyok-device-v1": its snapshot written new, the mark's removed as obsolete (tests/.snapshots/types.test.ts.snap)

Added:
- a device mark of the version before reads as none; missing device_id; missing epoch; epoch below zero; fractional epoch; no user; epoch zero (the ledger gave these as short case names, not exact titles)

## packages/safebyok/tests/test-helpers.test.ts

Rewritten:
- "makes a vault and awaits its hello, as its first example shows" -> "births a vault in a bank of its own, novel, as its first example shows" (Vault.make goes)
- "rejects as hello does, and throws as Vault.make does for misuse" -> "rejects as ensureVault does, and as Bank.make does for misuse"
- "shows no leak once a refused vault is closed, as its @example has it" -> "shows no leak once a vault is let go, as its @example has it" (Let-go)
- "is a logger Vault.make takes" -> "is a logger Bank.make takes"
- "vaultSliceOf: any field as its overrides say, as its second example shows": title kept; overrides vault_tok with another token, not null
- The smallest honest DeviceDB there keeps device records in place of marks (Option A)

Added:
- "shows no leak once a bank refuses a birth"

## packages/safebyok/tests/validators.test.ts

Rewritten:
- "composes with a default, as its second example shows" -> "composes with a default in a bank's validators, as its second example shows" (Vault.make goes)

## packages/safebyok-fastkey/tests/wasm-deriver.test.ts

Rewritten:
- "is accepted by Vault.make under the supplied label" -> "is accepted by Bank.make under the supplied label"; 'absent' -> 'novel' (Never absent)

## packages/safebyok-indexeddb/tests/idb-vault-db.test.ts

Rewritten:
- "serves Vault.make and hello(): a vault made, stored in and reopened over it" -> "serves Bank.make and ensureVault(): a vault born, stored in and born again over it" (Vault.make goes)
- "closes the bell's channel when its vault closes" -> "closes the bell's channel when its vault is let go" (Let-go)

## packages/safebyok-convex/tests/convex-vault-db.test.ts

Rewritten:
- "is refused as identity_revoked over a ${clientTitle}, still opening, and leaves no watch live on the deployment once closed" -> "is refused as identity_revoked over a ${clientTitle}, its entry refused with no Vault object, and leaves no watch live on the deployment once let go" (Vault.make goes)

## e2e/tests/convex/convex-vault-db.test.ts

Rewritten:
- the same title, same change as the convex adapter's line above
- "is made on one device, written, read on another, re-passphrased, and deleted, each device hearing the other": title kept; 'absent' -> 'novel' at the start, and the laptop hears the deletion as its bank entry refused 'vault_gone' where it read 'absent' (Del)

## packages/safebyok-react/tests/vault-provider/vault-provider-refusals.test.tsx

Rewritten:
- describe "when Vault.make or hello refuses" -> "when Bank.make or the birth refuses" (Vault.make goes)
- "throws a strengthChecker that is no function to the error boundary at render, as Vault.make would refuse it" -> "... as Bank.make would refuse it"
- "throws a hello whose strengthChecker's load fails to the error boundary, as unexpected_error, what the load threw its cause" -> "throws a birth whose strengthChecker's load fails ..."
- "hands down the very VaultError its hello was refused with, beside the handle still opening" -> "hands down the very VaultError its birth was refused with, and no vault"
- "hands down the vault at once, still opening, while its hello reads storage, and no openError" -> "hands down no vault while its birth reads storage, and no openError; then the vault, novel"
- "throws a hello refused as misuse to the error boundary, as the very VaultError" -> "throws a birth refused as misuse ..."; "throws a hello refused as bad_record to the error boundary too, as misuse like bad_option" -> "throws a birth refused as bad_record ..."
- "throws a prop Vault.make does not take to the error boundary, naming it and its new name, rather than drop it unseen" -> "throws a prop Bank.make does not take ..."
- "retries on the same handle, its one storage watch kept throughout" -> "retries with a new birth each time, only the vault born at last holding a storage watch"
- "deletes the vault openError says is damaged, with this device's lease, and opens a fresh one" -> "... and opens a fresh one, novel" (Never absent)
- Titles kept, bodies moved: "leaves the vault as it stands when a later read meets an older copy than the one in hand: the older is ignored, and no openError" (now born unlocked: Lease at birth); "opens again, and still rejects, when deleting finds the vault made anew" (a real clear behind the provider's back, not a mocked null read)

Added:
- "hands down a vault storage serves older than this device has seen as openError, vault_behind, and no vault, the retry not mending it" (Option A)
- "hands down a vault a later read finds behind as openError, vault_behind, the vault locked beside it"
- "asks again on its own for a vault a later read finds deleted, handing down the next life, novel, and no openError" (orchestrator ruling: the provider re-ensures once its own vault goes gone)
- "asks again on its own for a vault deleted and made anew elsewhere, handing down the one that stands, and no openError"

## packages/safebyok-react/tests/vault-provider/vault-provider-hooks.test.tsx

Rewritten:
- "hands down a damaged record as openError, the very bad news the vault keeps as its trouble; storage out of reach is openError alone" -> "hands down a damaged record as openError, the very bad news told to onBadNews, and no vault; storage out of reach is openError too" (Vault.make goes)
- "reads storage once: the vault its rehearsal makes and closes reads nothing, and only the vault kept says hello (Contract: getProof, in React)" -> "reads storage once: the bank its rehearsal makes and lets go reads nothing, and only the vault kept is born (Contract: getProof, in React)"
- "tells the next user's handler nothing a closed vault meets" -> "tells the next user's handler nothing a vault let go meets" (Let-go)
- "throws an onBadNews that is no function to the error boundary, as Vault.make refuses it" -> "... as Bank.make refuses it"

## packages/safebyok-react/tests/vault-provider/vault-provider-options.test.tsx

Rewritten:
- "asks for a keyDeriver outright, as Vault.make does" -> "... as Bank.make does"; "passes every Vault.make option through, as given" -> "passes every Bank.make option through, as given"; "throws to the error boundary a strengthChecker that is no function, as Vault.make refuses it" -> "... as Bank.make refuses it" (Vault.make goes)
- "passes allowStartOver to the dialog: a user who forgot the passphrase may start a new vault" -> "passes allowStartOver to the dialog: a user who forgot the passphrase may start a new vault, which the provider hands down novel with no retry" (Del; orchestrator ruling: the provider re-ensures once its own vault goes gone; the ledger's first new title was "... may delete the vault, and retryOpen births a new one to choose a passphrase for")

## packages/safebyok-react/tests/vault-provider/vault-provider-dialog.test.tsx

Rewritten:
- "opens the vault for the signed-in user, settling into 'absent' with no dialog" -> "opens the vault for the signed-in user, born 'novel', with no dialog" (Never absent)
- "throws a getProof that is no function to the error boundary, as Vault.make refuses it" -> "... as Bank.make refuses it"
- "refuses a call vault_locked when the provider unmounts with the dialog open (Contract: ensureLease, Does 3.7)" -> "refuses a call vault_gone when ..." (ruling: a let-go during a prompt refuses its waiters vault_gone)
- "refuses vault_locked when another user signs in, and shows that user no dialog" -> "refuses vault_gone when another user signs in, ..." (same)
- "refuses vault_locked when the user signs out, and the dialog goes" -> "refuses vault_gone when the user signs out, ..." (same)

## packages/safebyok-react/tests/passphrase-modal.test.tsx

Rewritten:
- describe "a vault created on another device meanwhile" -> "a vault whose first passphrase was set on another device meanwhile" (its tests keep their titles; Gate)
- "deletes the vault once confirmed, a delete landing as a lock: the dialog closes, answering declined, and the next ask is to choose" -> "deletes the vault once confirmed, the delete ending the prompt: the dialog closes, answering declined, the call that asked is refused vault_gone, and the vault asked for again is novel, to choose" (Del; a deletion during a prompt refuses its waiters vault_gone)
- "drops the question once the vault is deleted elsewhere, and never asks it of a vault made after" -> "closes with the question, answering declined, once a read finds the vault deleted elsewhere: the Vault object is gone, and deletes nothing more" (Never absent; a Vault found deleted is gone; the call that asked now refuses vault_gone)
- "forgets what it said once the vault is made and deleted elsewhere, and an answer still on its way with it" -> "forgets what it said once the vault is made elsewhere, and an answer still on its way with it" (the second change of mode is gone)
- "does nothing with misuse: the handle its provider closed as it unmounted, landing after it unmounted" -> "does nothing with a vault its provider let go as it unmounted, landing after it unmounted" (Let-go)
- "does nothing with a delete that meets misuse: a closed handle, landing after it unmounted" -> "does nothing with a delete that meets misuse: an option amiss, landing after it unmounted" (misuse is now bad_option)

Added:
- "has the vault say hello, so that it reads the passphrase set there and shows locked"

## packages/safebyok-react/tests/passkey-unlock-button.test.tsx

Rewritten:
- "does nothing with misuse: a closed handle, landing after it unmounted" -> "does nothing with misuse: an option amiss, landing after it unmounted" (misuse is now bad_option)

## packages/safebyok-react/tests/attempt-refusals.test.ts

Rewritten:
- "a vault made first on another device is advice" -> "a vault's first passphrase set first on another device is advice" (Gate)

Added:
- case "a vault let go, or found deleted, closes the dialog"

## demos/safebyok-demo-react/tests/test-helpers.test.tsx

Rewritten:
- "renders a component inside a vault for u1, absent until something is stored" -> "renders a component inside a vault for u1, novel until its passphrase is set" (Never absent)
- "closes the vault it seeds through, even when a store is refused" -> "lets go of the vault it seeds through, even when a store is refused"
- "are closed once that test has ended" -> "are let go once that test has ended" (refuses 'vault_gone' where it refused 'vault_closed'; Let-go)

## demos/safebyok-demo-react/tests/components/SessionBar.test.tsx

Rewritten:
- "deletes the account and its vault, once the user confirms" -> "deletes the account and its vault, once the user confirms: the provider, left signed in to u1 here, stores the next life, novel" (the test's provider keeps userId u1 while the auth signs out, so it re-ensures)

## demos/safebyok-demo-react/tests/App.test.tsx

Added:
- "deletes the account and its vault, leaving no vault made anew: signing out lets the vault go before the provider could ask for it again"
