// The messages of the refusals the giver makes itself.

// == [The giver]: OneBankExpected, NobodySignedIn, BankAbsent, BankNotStarted

/** A giver's config whose `banks` does not name exactly one bank and its vaultDB. */
export const OneBankExpected = 'Expected `banks` to name one bank and its vaultDB: `{ banks: { mybank: { vaultDB } } }`.'

/** A call that needs the signed-in user's device, made while nobody is signed in. */
export const NobodySignedIn = 'Nobody is signed in: mount the provider with a userid first.'

/** A call that needs the bank, made while none is stored for the user. */
export const BankAbsent = 'No bank is stored for this user yet: birth it first.'

/** A form verb's gating asked for while the bank is still being brought up, or failed to come up. */
export const BankNotStarted = 'The bank is not brought up: wait for the stage to show `locked` or `unlocked`.'
// --
