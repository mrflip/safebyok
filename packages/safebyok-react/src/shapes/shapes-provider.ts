import type { ReactNode } from 'react'
import type { BadNewsHandler, BankOpts, LifecycleHandler, RequestCleartext } from 'safebyok'
import { Checker, bankOpts, type AssertEqual, type CheckerInput } from 'safebyok/storage'
import type { PassphraseAdvice } from '../modal'

// == [Props]: BankProviderProps, providerProps, HeldBankOpts, Handlers

/** What BankProvider is handed: the Bank.make options but `device_id`, the signed-in `user_id`, and the dialogs' props. */
export interface BankProviderProps extends Omit<BankOpts, 'user_id' | 'device_id' | 'requestCleartext'> {
  /** The signed-in user, or null while nobody is. Call `bank.vacate()` at sign-out: a null leaves the leases. */
  user_id:             string | null
  /** What asks the user for a passphrase or passkey. Defaults to the provider's own dialogs. */
  requestCleartext?:   RequestCleartext | undefined
  /** What a password manager files a vault's passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey is made and asked under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
  children:            ReactNode
}

/** BankProvider's props: Bank.make's options but `device_id`, beside the signed-in user and the dialogs' props. */
export const providerProps = Checker(({ fn, custom, str }) => bankOpts.omit({ device_id: true }).extend({
  user_id:            bankOpts.shape.user_id.nullable(),
  requestCleartext:   fn<RequestCleartext>().optional(),
  passphraseUsername: str.optional(),
  passphraseAdvice:   custom<PassphraseAdvice>().optional(),
  passkeyRpId:        str.optional(),
  children:           custom<ReactNode>(),
}), 'bad_option')

// Hand-written for the doc comment a host sees on each prop, and held to the checker so neither drifts.
true satisfies AssertEqual<BankProviderProps, CheckerInput<typeof providerProps>>

/** The options a held bank is made from: Bank.make's, but `device_id` and the handlers, for a `user_id` that may be null. */
export type HeldBankOpts = Omit<BankOpts, 'user_id' | 'device_id' | 'onLifecycle' | 'onBadNews' | 'requestCleartext'> & { user_id: string | null }

/** The functions a held bank calls back, each as it was last rendered. */
export type Handlers = { onLifecycle: LifecycleHandler, onBadNews: BadNewsHandler, requestCleartext: RequestCleartext }
// --
