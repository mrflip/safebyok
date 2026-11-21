// The messages of the refusals the giver makes itself.

// == [The giver]: OneBankExpected, NoProvider, NobodySignedIn, BankAbsent, BankNotStarted, TypedFieldGone

/** A giver's config whose `banks` does not name exactly one bank and its vaultDB. */
export const OneBankExpected = 'Expected `banks` to name one bank and its vaultDB: `{ banks: { mybank: { vaultDB } } }`.'

/** A part or a form of the kit rendered outside every provider, with no `bank` or `giver` prop. */
export const NoProvider = 'Rendered outside every giver\'s provider: mount `SOK.Provider` above it, or hand it the `bank` prop (and `giver`, where it takes one).'

/** A call that needs the signed-in user's device, made while nobody is signed in. */
export const NobodySignedIn = 'Nobody is signed in: mount the provider with a userid first.'

/** A call that needs the bank, made while none is stored for the user. */
export const BankAbsent = 'No bank is stored for this user yet: birth it first.'

/** A form verb's gating asked for while the bank is still being brought up, or failed to come up. */
export const BankNotStarted = 'The bank is not brought up: wait for the stage to show `locked` or `unlocked`.'

/** A draft's `put`, made after the input of a field typed into has left the page, so its text is gone. */
export const TypedFieldGone = 'A field typed into has left the page, and its text with it: nothing was written.'
// --
