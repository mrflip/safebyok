/** The dojo's test helpers: a fresh page over the fixture, the forms' fields filled, and the readout read. Star-import this file as `TH`. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, vi } from 'vitest'
import { Fixture } from '../src/lib/fixture'

/** The printed passphrase of the fixture user `userid`. */
export function passphraseOf(userid: string): string {
  const user = Fixture.users.find((each) => each.userid === userid)
  if (user === undefined) { throw new Error(`No fixture user ${userid}`) }
  return user.passphrase
}

/** A page as a fresh load finds it with `userid` signed in, or nobody, over the fixture just loaded into both stores. */
export async function loadPage(userid: string | null): Promise<void> {
  if (userid === null) { localStorage.removeItem('dojo:session') } else { localStorage.setItem('dojo:session', userid) }
  const { loadFixture } = await import('../src/lib/stores')
  await loadFixture()
  await reloadPage()
}

/** The page reloaded, as src/main.tsx starts it: the app's modules imported anew, the stores readied, and the app rendered. */
export async function reloadPage(): Promise<void> {
  cleanup()
  vi.resetModules()
  const { readyStores } = await import('../src/lib/session')
  await readyStores()
  const { App } = await import('../src/components/App')
  render(<StrictMode><App /></StrictMode>)
}

/** Unlock the signed-in user's bank with `passphrase`, through the header's Unlock and the dialog it opens. */
export async function unlock(passphrase: string): Promise<void> {
  await stageShown('locked')
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Unlock' }))
  await stageShown('unlocked')
}

/** Show the tab `title`, and answer its section, titled `sectionTitle`. */
export function showTab(title: string, sectionTitle: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: title }))
  return region(sectionTitle)
}

/** Wait for the header to show the bank at `stage`. */
export async function stageShown(stage: string): Promise<void> {
  await waitFor(() => { expect(screen.getByText('Stage:').textContent).to.eq(`Stage: ${stage}`) })
}

/** The section of the page titled `title`. */
export function region(title: string): HTMLElement { return screen.getByRole('region', { name: title }) }

/** Type each text into the field of `section` labelled by its key, firing a change for each. */
export function fill(section: HTMLElement, texts: Readonly<Record<string, string>>): void {
  for (const [label, text] of Object.entries(texts)) { fireEvent.change(within(section).getByLabelText(label), { target: { value: text } }) }
}

/** Press the button `title` of `section`, and wait for the readout of that press. */
export async function press(section: HTMLElement, title: string): Promise<Readonly<Record<string, string>>> {
  fireEvent.click(within(section).getByRole('button', { name: title }))
  const readout = await within(section).findByRole('table', { name: 'Readout' })
  await waitFor(() => { expect(readout.querySelector('caption')?.textContent).to.eq(`After ${title}`) })
  return readingOf(readout)
}

/** The readout's rows, by their heading. */
function readingOf(readout: HTMLElement): Readonly<Record<string, string>> {
  return Object.fromEntries([...readout.querySelectorAll('tr')].map((row) => [row.querySelector('th')?.textContent ?? '', row.querySelector('td')?.textContent ?? '']))
}
