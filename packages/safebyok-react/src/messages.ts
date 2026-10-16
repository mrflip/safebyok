/**
 * Every word safebyok-react shows a user, in one place: the passphrase dialog's copy, the passkey
 * button's, the whisper field's, and the calm messages of the refusals a passkey unlock may meet.
 * A sentence with a part that varies is one frame, a function of that part, so that each reads
 * whole and a translation may reorder it. English, for now: the one locale is {@link Locale}.
 * What the developer reads (a misuse refusal, a logger's warning) stays beside the code that says
 * it.
 */

/** The locale the dialog formats its relative times in, and the language of every message here. */
export const Locale = 'en'

/** The words themselves. */
export const Messages = {
  // The passphrase dialog
  chooseTitle:       'Choose a vault passphrase',
  unlockTitle:       'Unlock your vault',
  chooseBlurb:       'This passphrase encrypts your secrets on your device. Nobody can recover it for you -- not even us.',
  unlockBlurb:       'Your secrets are encrypted with this passphrase; enter it to continue. A forgotten passphrase cannot be recovered -- you would start a new vault and re-enter your secrets.',
  passphraseField:   'vault passphrase',
  /** What a password manager files a vault's passphrase under, unless the host names it. */
  passphraseUsername: (userId: string, vaultlabel: string) => `${userId} (${vaultlabel} vault)`,
  showPassphrase:    'Show',
  hidePassphrase:    'Hide',
  createButton:      'Create vault',
  unlockButton:      'Unlock',
  cancelButton:      'Cancel',
  /** The window, while the dialog creates the vault: `relative` is a phrase such as 'in 7 days'. */
  locksIn:           (relative: string) => `Locks on this device ${relative}.`,
  /** The window, on an ordinary unlock: `relative` is a phrase such as 'in 7 days'. */
  locksAgainIn:      (relative: string) => `Locks again on this device ${relative}.`,
  staysUnlocked:     'Stays unlocked on this device until you lock it.',

  // Starting over, for a user who has forgotten the passphrase
  startOverButton:   'Forgot it? Start a new vault',
  startOverQuestion: 'Erase this vault and start a new one? Every secret in it is lost for good, on every device, and you will enter them again.',
  startOverConfirm:  'Erase and start over',
  startOverBack:     'Keep it',

  // What the dialog says once something not the user's to mend went wrong
  troubleTitle:      'Something went wrong',
  troubleWord:       'This app ran into a problem of its own, not one you caused, and could not unlock your vault. Your secrets are safe. Close this, reload the page, and try again.',
  closeButton:       'Close',

  // The passkey button
  passkeyButton:     'Use a passkey',
  passkeyTrouble:    "Your passkey can't be used here just now. Unlock with your passphrase instead.",
  noPasskeyToAsk:    'This vault has no passkey to ask: unlock it with a passphrase, then add one.',
  passkeysDamaged:   'Every passkey of this vault is stored damaged, so none can be asked. Unlock with a passphrase, then remove the passkeys and add them again.',
  noWebAuthn:        'This browser offers no passkeys (WebAuthn): unlock with a passphrase.',
  noPrf:             "This passkey's authenticator does not offer the PRF extension a passkey unlock needs: unlock with a passphrase, or try another device or security key.",
  passkeyAskFailed:  "The browser could not ask for a passkey: unlock with a passphrase. The browser's own error is this error's cause.",

  // The whisper field
  showWhisper:       'Show',
  hideWhisper:       'Hide',
} as const
