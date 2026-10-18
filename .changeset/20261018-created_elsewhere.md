---
"safebyok": minor
"safebyok-react": minor
---

A new refusal kind, created_elsewhere (a condition, in VaultErrorKindVals and VaultErrorFamilyForKind). When a first unlock() on an absent vault loses the race to create it, another device creating the vault between this one's look at storage and its write, and the given passphrase does not open that vault, unlock() now throws created_elsewhere in place of wrong_passphrase: a vault was just created for this label on another device, and the user is to enter the passphrase chosen there. The vault settles locked on the vault the other device made. A passphrase that opens it unlocks as before. safebyok-react PassphraseModal shows it as advice (the quiet style, not the gripe one) and stays open. A host that branches on wrong_passphrase to say "check for typos" should also handle created_elsewhere.
