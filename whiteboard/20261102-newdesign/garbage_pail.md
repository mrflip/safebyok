vault.ensureUnlocked
vaultListing.ensureVault and bank.ensureVault
#landGate runDelVault


* rename #disabled to #enabled
* have vault's this.demandEnabled() return this.#enabled && this.isPresent
* get rid of isUseable
* rename this.world.demandBoxesUsable to this.world.demandUnlocked -- vault isn't the place for logic about boxes

this.world.demandBoxesUsable seems to actually be demandUnlocked by a series of poorly

* rename

Get rid of demandUsable, it's a confusing name. in vault, have this.demandEnabled() check disabled and

demandUsable(): this {
    this.world.demandBoxesUsable()
    return this.demandEnabled()
  }



7. vaultListing.ensureVault and bank.ensureVault: the first is a birth's stored write, and the second has #demandReady inside. Both reuse the word with a different meaning.
2. Gate commits: vault.demandUsable runs at the start, but key derivation sits between it and the commit in #landGate. Only the listing's own guard is synchronous with the commit, and a vault discarded alone passes it. #runDelVault has the same problem. This strengthens the case for one demandUsable in #landGate, and something similar in #runDelVault.

fetchListed -- fffs it calls back and forth to world and then hands raw props to hello


* DeviceDB: It is used
  - to cache the lease: that should be on vaultFriend as cacheLease, peekLease and forgetLease
  - to record what is currently a "device record". Make that instead be a bank;
    expose cacheBank, peekBank and forgetBank taking/giving { applabel user_id bank_tok } (bank_tok being the device ID)
  what else is DeviceDB used for?

* Dockblocks

* Fate

### Damaged Records

This is a pit of torment for agents, as you lovable rascals want to wrap code around
any potential edge case, and in this case the more code the more edge cases you have to wrap.

* When a named record fails validation in vaultDB: the host is told `damaged_record` and may remove it.
* Since nothing validates the record in the datastore, they are safe to delete it directly
* When a record fails validation in a listing, it is returned as `damaged_rows` in either `bankVaults`
  or `vaultBoxes` listing. The Listing instance delists anything in there, and delivers a piece of
  bad news with an array holding their sparse records.
  - The damaged rows record is not kept. It is not compared, it is not investigated.
  - It is not proof that a record is damaged.
  - Do not touch a box that was marked damaged in a listing -- only de-list it. If a client
    holds a reference to it, that is undefined behavior.
  - The odds that the system is working but yielding damaged rows is very small.

### Contract of a Concrete VaultDB Backend

* VaultDB will Zod validate everything before it is handed to the subclass, and validate its outputs before returning them. Do not

is asked to establish.** "We should enumerate the exact tests a VaultDB is asked to establish before and after, they should be reasonable and natural, and should assume that the parent vault db will zod validate its inputs and outputs so it should not repeat anything they did. There are two categories: narrowing and scouring: a listing only retrieve boxes matching on scope and vault tok, so it narrows the response to guaranteee its invariants, in some cases it might be appropriate to scour: refusing to proceed if conflicting information is present. I want to approve things of the second form".

