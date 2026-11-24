/** What the Practice tab's tests share: the made-up key they type, the tab shown on a fresh page, and a card and example within it. */

import { within } from '@testing-library/react'
import * as TH from '../../test-helpers'

/** A key of the dojo's shape, an obvious fake. */
export const ApiKey = 'sk-dojo-made-up-key-0001'

/** How long the vaultDB holds a save here, in place of the page's six seconds. */
export const HoldMs = 400

/** The Practice tab on a fresh page with `userid` signed in, its sign-in answered and its bank unlocked where `isUnlocked`, a save the dojo holds waiting {@link HoldMs}. */
export async function practiceTab(userid: string, isUnlocked: boolean): Promise<HTMLElement> {
  // The page comes back on the tab last shown; on this one, the header's Unlock has a namesake in the kit's unlock form.
  localStorage.removeItem('dojo:tab')
  await TH.loadPage(userid)
  if (isUnlocked) { await TH.unlock(TH.passphraseOf(userid)) } else { await TH.stageShown('locked') }
  const { vaultDB } = await import('../../../src/lib/dojo')
  vaultDB.holdMs = HoldMs
  return TH.showTab('Practice', "Practice: the craft around a secret's form")
}

/** The card titled `title` in `container`. */
export function card(container: HTMLElement, title: string): HTMLElement { return within(container).getByRole('region', { name: title }) }

/** The example named `examplename` (`Do: …` or `Don't: …`) in `container`. */
export function example(container: HTMLElement, examplename: string): HTMLElement { return within(container).getByRole('figure', { name: examplename }) }
