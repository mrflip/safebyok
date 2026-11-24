# Thread 14: test titles whose promise moved

For the reviewer: every `it`/`describe` title that changed in `vault.test.ts`, `device.test.ts` and `bank.test.ts`, before (`-`) and after (`+`), from `git diff feab0508d` on this branch. Bank's seal describes moved whole to vault.test.ts, as `vault.sealBox`; their bodies changed only in how the vault is reached (`TH.buildBornVault`).

## tests/models/vault.test.ts

```diff
-describe("Vault.make(bank, minder)"
-  it("makes the vault of the bank's boxes, over the minder given, which waits for its hello"
+describe("Vault.make(bank, vaultTSQ)"
+  it("makes the vault of the bank's boxes, over the vault TSQ given"
-    it(`sweep each vault when ${blurb} is swept: its cache emptied, telling each listener of the removal`
+    it(`sweep each vault when ${blurb} is swept: the vault TSQ hears no more, and the device's minder is emptied`
-  it("leave each vault's minder to start again at a hello, on a vaultDB the host still has"
-  it("answers the stored box, already in its item"
+  it("answers the box its device's world holds, whose record is its item, once it holds the revision stored"
-  it("resolves a birth with the stored box already in its item"
+  it("resolves a birth with the box holding the revision stored, its record in its item"
-  it("given a labelpath, writes over the newest revision cached, carrying over its sidecar"
+  it("given a labelpath, writes over the newest revision seen, carrying over its sidecar"
-  it("given a labelpath with nothing cached, gets the newest revision to write over"
+  it("given a labelpath this device has seen nothing of, gets the newest revision to write over"
-  it("refuses stale_write over an older revision, and writes nothing, the item left at the one stored"
+  it("refuses stale_write over an older revision, and writes nothing, the box then holding the one stored"
-  it("refuses a sparse cached newest record when the patch gives no sidecar"
+  it("refuses over a newest revision seen only sparse when the patch gives no sidecar"
-  it("answers the stored tombstone"
+  it("answers the box, holding the tombstone stored"
-  it("writes the tombstone over the newest revision: its item is null, and its dead record has the tombstone"
+  it("writes the tombstone over the newest revision: its item is null, and the box holds the tombstone"
-  it("unseals the newest revision stored, where the minder has it only sparse"
+  it("unseals the newest revision stored, where this device has seen it only sparse"
-  it("unseals a box its vault has only listed, on an unlocked bank"
+  it("unseals a box its device has only listed, on an unlocked bank"
-  it("unseals the item's revision where a newer sparse record of the same life is cached and storage answers no newer"
+  it("unseals the revision it holds where a newer sparse record of the same life is seen and storage answers no newer"
-  it("unseals the cached item where its get is refused"
+  it("unseals the revision it holds where its get is refused"
-  it("rejects with its get's own refusal where it is refused and nothing at all is cached for the box, never calling fn"
+  it("rejects with its get's own refusal where it is refused and this device has seen nothing of the box, never calling fn"
-  it("refuses 'stale_read' where its get is refused and only a sparse record of the box is cached, never calling fn"
+  it("refuses 'stale_read' where its get is refused and this device has seen the box only sparse, never calling fn"
-  it("refuses 'stale_read' for a deleted box whose newer life is cached only sparse, never calling fn"
+  it("refuses 'stale_read' for a deleted box whose newer life is seen only sparse, never calling fn"
-  it("leaves no trace of the whisper in the minder's cache or a snapshot"
+  it("leaves no trace of the whisper in the box, the device's QueryClient or a snapshot"
+  it("gets nothing for a box it holds the newest revision of"
-  it("rejects with the get's refusal, for a box with a cached item and for one with none"
+  it("rejects with the get's refusal, for a box it holds and for one it has seen nothing of"
+describe("a vault of a bank over the shell"
+  it("refuses a seal and an unseal, and its try forms resolve the refusal"
+describe("vault.sealBox(donor, publicProps, secretProps) and vault.unsealBox(box)"
+  it("seals a new box over its shell: the first revision of its first life, born now"
+  it("unseals the box's whisper in place of its sealed one"
+  it("seals the next revision of a live box, in the same life, from the stored box with a new sidecar"
+  it("seals the same whisper differently each time: a fresh part key and cipher iv"
+  it("unseals a box sealed before the bank locked and unlocked again"
+  it("unseals with its sidecar altered"
+    it(`refuses 'damaged_whisper' for a box with ${blurb} altered`
+    it(`refuses a box with ${blurb}, before unsealing`
+  it("refuses 'damaged_whisper' for one box's sealed whisper on another box"
+  it("refuses 'damaged_whisper' for tampered ciphertext, quoting none of it"
+  it("refuses 'damaged_whisper' for a box another bank of the same stamp sealed"
+    it(`refuses 'record_conflict' at the seal, the tombstone and the unseal for a box claiming ${blurb}`
+  it("refuses at the seal, the tombstone and the unseal a box under another life of the root box"
+  it("refuses 'bank_locked' at the seal, the tombstone and the unseal once the bank locks"
+  it("refuses at the seal, the tombstone and the unseal on a swept device"
+    it(`refuses to seal ${blurb}`
+  it("refuses a misspelt key in publicProps, and a key beside the whisper in secretProps"
+  it("refuses to seal a box when neither the donor nor publicProps has a sidecar"
+    it(`refuses to seal ${blurb}`
+describe("vault.sealBox(donor, { am: 'x' }), and the unseal of a tombstone"
+  it("makes the tombstone of a live box: its next revision, at the next lifeseq, with the sidecar `{}`, born when the box was"
+  it("writes the tombstone at the written_at given, and seals it: a tombstone whose written_at moved will not unseal"
+  it("refuses a tombstone given secret props"
+  it("writes a tombstone given the sidecar `{}`, a tombstone's own"
+  it("refuses a tombstone given any other sidecar"
+  it("unseals a tombstone to its Thing fields and an empty whisper"
+  it("starts the box's next life over its tombstone, born now"
+  it("refuses the tombstone of a tombstone or of the shell"
+  it("refuses 'damaged_whisper' for a tombstone made up without the bankKey, or sealed with its live box's seal"
+  it("refuses 'damaged_whisper' for a tombstone carrying another tombstone's seal"
+    it(`refuses 'damaged_whisper' for a tombstone with ${blurb} altered`
+describe("vault.trySealBox(donor, publicProps, secretProps) and vault.tryUnsealBox(box)"
+  it("resolve a good outcome of what sealBox and unsealBox resolve, and the refusal they throw"
```

## tests/models/device.test.ts

```diff
-  it("refuses a queryCacheOpts the minder refuses, and gives its minder the one it is given"
+  it("refuses queryCacheOpts, an option it does not take"
+  it("keeps the boxes in the host's QueryClient, under the bank's key, beside the host's own queries"
+  it("refuses a queryClient that is not one"
+  it("makes a QueryClient of its own where the host gives none, empty, the same before and after signin"
+  it("makes the vault TSQ at signin, refusing it before then"
-  it("restore the boxes and listings its vault cached"
+  it("restore the boxes and listings its vault cached, each box's record reaching its Thing, and none the host's QueryClient"
```

## tests/models/bank.test.ts

```diff
-  it("refuses a put, a seal and an unseal over the shell, and its try forms resolve the refusal"
+  it("refuses a put over the shell"
-describe("bank.sealBox(donor, publicProps, secretProps) and bank.unsealBox(box)"
-  it("seals a new box over its shell: the first revision of its first life, born now"
-  it("unseals the box's whisper in place of its sealed one"
-  it("seals the next revision of a live box, in the same life, from the stored box with a new sidecar"
-  it("seals the same whisper differently each time: a fresh part key and cipher iv"
-  it("unseals a box sealed before the bank locked and unlocked again"
-  it("unseals with its sidecar altered"
-    it(`refuses 'damaged_whisper' for a box with ${blurb} altered`
-    it(`refuses a box with ${blurb}, before unsealing`
-  it("refuses 'damaged_whisper' for one box's sealed whisper on another box"
-  it("refuses 'damaged_whisper' for tampered ciphertext, quoting none of it"
-  it("refuses 'damaged_whisper' for a box another bank of the same stamp sealed"
-    it(`refuses 'record_conflict' at the seal, the tombstone and the unseal for a box claiming ${blurb}`
-  it("refuses at the seal, the tombstone and the unseal a box under another life of the root box"
-  it("refuses 'bank_locked' at the seal, the tombstone and the unseal once the bank locks"
-  it("refuses at the seal, the tombstone and the unseal on a swept device"
-    it(`refuses to seal ${blurb}`
-  it("refuses a misspelt key in publicProps, and a key beside the whisper in secretProps"
-  it("refuses to seal a box when neither the donor nor publicProps has a sidecar"
-    it(`refuses to seal ${blurb}`
-describe("bank.sealBox(donor, { am: 'x' }), and the unseal of a tombstone"
-  it("makes the tombstone of a live box: its next revision, at the next lifeseq, with the sidecar `{}`, born when the box was"
-  it("writes the tombstone at the written_at given, and seals it: a tombstone whose written_at moved will not unseal"
-  it("refuses a tombstone given secret props"
-  it("writes a tombstone given the sidecar `{}`, a tombstone's own"
-  it("refuses a tombstone given any other sidecar"
-  it("unseals a tombstone to its Thing fields and an empty whisper"
-  it("starts the box's next life over its tombstone, born now"
-  it("refuses the tombstone of a tombstone or of the shell"
-  it("refuses 'damaged_whisper' for a tombstone made up without the bankKey, or sealed with its live box's seal"
-  it("refuses 'damaged_whisper' for a tombstone carrying another tombstone's seal"
-    it(`refuses 'damaged_whisper' for a tombstone with ${blurb} altered`
-describe("bank.trySealBox(donor, publicProps, secretProps) and bank.tryUnsealBox(box)"
-  it("resolve a good outcome of what sealBox and unsealBox resolve, and the refusal they throw"
```

