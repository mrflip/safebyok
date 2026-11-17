/** The names a signature gives the text and numbers that name and stamp a thing: the user's id, the labels, the tokens and the revision count.
 * Each is a plain alias of `string` or `number`, so a host's own string is accepted where one is asked.
 */

// == [Names and tokens]: UserID, Banklabel, Vaultlabel, Boxlabel, BankTok, GateTok, VaultTok, BoxTok, RevisionTok, DeviceTok, RevisionSeq, KeyDeriverLabel, EpochMillis

/** The signed-in user's stable, opaque id, the `user_id` of a scope. */
export type UserID = string

/** The label of an app's bank, the `banklabel` of a scope. */
export type Banklabel = string

/** The label of a vault, the `vaultlabel` of a scope. */
export type Vaultlabel = string

/** The label of a box within its vault, the `boxlabel` of a scope. */
export type Boxlabel = string

/** A token for one life of a bank, its `bank_tok`. */
export type BankTok = string

/** A token for one life of a gate, its `gate_tok`. */
export type GateTok = string

/** A token for one life of a vault, its `vault_tok`. */
export type VaultTok = string

/** A token for one life of a box, its `box_tok`. */
export type BoxTok = string

/** A token that changes with each put or del of a record, its `revision_tok`. */
export type RevisionTok = string

/** A token for this device in a bank's scope, its `device_tok`. */
export type DeviceTok = string

/** The count of a record's revisions, its `revision_seq`: a higher one is newer. */
export type RevisionSeq = number

/** The name of how a passphrase wayin's key was derived, its `key_deriver_label`. */
export type KeyDeriverLabel = string

/** An instant, whole UTC epoch milliseconds, as `Date.now()` gives and `epochMillis` checks: a plain number, since a host writes one by hand. */
export type EpochMillis = number
// --
