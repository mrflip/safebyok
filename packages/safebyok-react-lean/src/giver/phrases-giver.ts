// The messages of the refusals the giver makes itself.

// == [The giver]: OneBankExpected, NoProvider, NobodySignedIn, BankAbsent, BankNotStarted, BankFailed, BoxAbsent, TypedFieldGone

/** A giver's config whose `banks` does not name exactly one bank and its vaultDB. */
export const OneBankExpected = 'Expected `banks` to name one bank and its vaultDB: `{ banks: { mybank: { vaultDB } } }`.'

/** A part or a form of the kit rendered outside every provider, with no `bank` or `giver` prop. */
export const NoProvider = "Rendered outside every giver's provider: mount `SOK.Provider` above it, or hand it the `bank` prop (and `giver`, where it takes one)."

/** A call that needs the signed-in user's device, made while nobody is signed in. */
export const NobodySignedIn = 'Nobody is signed in: mount the provider with a userid first.'

/** A call that needs the bank, made while none is stored for the user. */
export const BankAbsent = 'No bank is stored for this user yet: birth it first.'

/** A call that needs the bank, made before the device's sign-in answers. */
export const BankNotStarted = 'The bank is not started: wait for the stage to show `locked` or `unlocked`.'

/** A call that needs the bank, made after it failed to come up. */
export const BankFailed = "The bank failed to come up, as its snapshot's `lastErr` says: nothing reaches it until the page is loaded again."

/** A box asked for while the bank is locked, with none stored, or deleted. */
export const BoxAbsent = 'No box is stored at that labelpath: put one first.'

/** A draft's `put`, made after the input of a field typed into has left the page, so its text is gone. */
export const TypedFieldGone = 'A field typed into has left the page, and its text with it: nothing was written.'
// --
