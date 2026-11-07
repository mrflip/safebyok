// Every word safebyok-react shows a user, in one place, each sentence with a varying part one
// frame, so a translation may reorder it. What the developer reads stays beside the code that says it.

import type { Gatingkind } from 'safebyok'

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
  confirmField:      'confirm vault passphrase',
  /** Said at a submit whose new passphrase and its confirmation differ: nothing is attempted. */
  passphrasesDiffer: "The new passphrase and its confirmation don't match: type the same one in both.",
  /** What a password manager files a vault's passphrase under, unless the host names it. */
  passphraseUsername: (user_id: string, vaultlabel: string) => `${user_id} (${vaultlabel} vault)`,
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

  // The dialogs for a change to the ways in, and for a deletion
  changeTitle:        'Change your vault passphrase',
  changeBlurb:        'Enter the passphrase you use now, then choose a new one. The new one takes its place on every device. A forgotten passphrase cannot be recovered.',
  currentField:       'current passphrase',
  newField:           'new passphrase',
  confirmNewField:    'confirm new passphrase',
  changeButton:       'Change passphrase',
  putPasskeyTitle:    'Add a passkey',
  putPasskeyBlurb:    'Enter your vault passphrase. Then your browser asks you to make a passkey -- a fingerprint, a face or a security key -- which unlocks this vault without typing the passphrase.',
  putPasskeyButton:   'Add passkey',
  delPasskeyTitle:    'Remove your passkey',
  delPasskeyBlurb:    'Enter your vault passphrase to remove the passkey. You will unlock with the passphrase alone, on every device.',
  delPasskeyButton:   'Remove passkey',
  delVaultTitle:      'Delete your vault',
  delVaultBlurb:      'Every secret in this vault is deleted for good, on every device, and cannot be recovered. Enter your vault passphrase to delete it.',
  delVaultButton:     'Delete vault',

  // What the dialog says once something not the user's to mend went wrong
  troubleTitle:      'Something went wrong',
  /** What the dialog could not do: `doing` is one of {@link Doing}'s phrases, such as 'unlock your vault'. */
  troubleWord:       (doing: string) => `This app ran into a problem of its own, not one you caused, and could not ${doing}. Your secrets are safe. Close this, reload the page, and try again.`,
  closeButton:       'Close',

  // The passkey button
  passkeyButton:     'Use a passkey',
  passkeyTrouble:    "Your passkey can't be used here just now. Unlock with your passphrase instead.",
  noPasskeyToAsk:    'This vault has no passkey to ask: unlock it with your passphrase, then add one.',
  passkeyDamaged:    "This vault's passkey is stored damaged, so it can't be asked. Unlock with your passphrase, then add a passkey again: the new one takes its place.",
  noWebAuthn:        'This browser offers no passkeys (WebAuthn): unlock with a passphrase.',
  noPrf:             "This passkey's authenticator does not offer the PRF extension a passkey unlock needs: unlock with a passphrase, or try another device or security key.",
  passkeyAskFailed:  "The browser could not ask for a passkey: unlock with a passphrase. The browser's own error is this error's cause.",

  // The whisper field
  showWhisper:       'Show',
  hideWhisper:       'Hide',

  // The vault's lock control, for an account menu
  vaultLocked:       'Vault locked',
  vaultUnlocked:     'Vault unlocked',
  lockButton:        'Lock',
} as const

/** What each kind of gating's dialog was doing, as `Messages.troubleWord` says it could not. */
export const Doing: Record<Gatingkind, string> = {
  build_vault:        'create your vault',
  unlock_vault:       'unlock your vault',
  replace_passphrase: 'change your passphrase',
  add_passkey:        'add the passkey',
  revoke_passkey:     'remove the passkey',
  del_vault:          'delete your vault',
}
