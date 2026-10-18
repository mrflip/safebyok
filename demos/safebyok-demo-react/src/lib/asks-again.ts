import { FarFuture, MinuteMillis } from 'safebyok'

/**
 * When the vault next asks for the passphrase, as the chip says it: a date, or "never" for a
 * deadline at the far future (within a minute of `FarFuture`, never compared for equality), as
 * `leaseHours: Infinity` makes it. Empty when there is no deadline.
 *
 * @example asksAgain(FarFuture)  // ', never asks again'
 * @example asksAgain(Date.UTC(2026, 9, 23))  // ' until 10/23/2026, 12:00:00 AM', in the browser's locale
 */
export const asksAgain = (askPassphraseAt: number | null): string => {
  if (askPassphraseAt === null) { return '' }
  if (askPassphraseAt >= FarFuture - MinuteMillis) { return ', never asks again' }
  return ` until ${new Date(askPassphraseAt).toLocaleString()}`
}
