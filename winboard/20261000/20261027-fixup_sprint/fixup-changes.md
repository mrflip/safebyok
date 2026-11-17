For the below:
* Consider every question as an earnest one. Don't take it as an implied directive

* why is idb an object, not a class?
* what is up with the scattered functions that sit at the foot of many classes (eg vaultDB) -- why aren't they methods?
* vaultdb
  - is "answering" just outcomeOf but it throws unexpectedError?
  - adapterAnswer -- guessing at the type is not its job. remove the isOutcomeShaped stuff
* outcome.ts
  - too many one-liners
  - isOutcomeShaped -- use zod
  - is it important to use const arrow (`const foo = () => `, not `function foo()`) here?
  - Why is storageUnavailable the default of outcomeOf, rather than  unexpectedError?
* vault.ts
  - why does this need vaultTok, not the one on vault? who is calling this, and is it worth having its own function? `  #boxUnder(record: BoxRecord, vaultTok: string): Box`
* for structured objects, when should one use types vs interfaces?
