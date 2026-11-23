import { fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mirrorSecrets } from '../../../src/lib/mirror'
import * as TH from '../../test-helpers'

// What each Forms row's mirror and result show while its save is held and after it ends, today, for Hero, signed in and
// unlocked. Each test drives the real app, its giver and the core, over the IndexedDB stores (fake-indexeddb) loaded with
// the fixture; stale's newer box is written by a second device. A test records what the library and React do now: a
// change here is news for the table in whiteboard/20261123-dojo/dojo-findings.md, not a regression by definition.

/** The password typed into each row, an obvious fake. */
const Password = 'made-up-password-1234'

/** How long the vaultDB holds each save here, in place of the page's six seconds. */
const HoldMs = 400

/** What the mirror shows of the password input: the text in its `value` and no `value` attribute, or neither. */
const Typed = `value: "${Password}" | attribute: (none)`
const Empty = 'value: (empty) | attribute: (none)'

/** What the mirror shows of a controlled password input: the text in its `value` property and its `value` attribute alike. */
const TypedTwice = `value: "${Password}" | attribute: "${Password}"`
const EmptyTwice = 'value: (empty) | attribute: ""'

/** What the result shows after each button, its time replaced by `TIME`. */
const Results = {
  save:  'ok @ TIME',
  stale: 'err @ TIME: stale_write',
  fail:  'err @ TIME: The dojo told its vaultDB to refuse this write.',
} as const

const RowCases = [
  // the rows a host might choose:
  ["Recommended, form Action",                 "save",  Typed,      Empty,      'React empties the form once the box is stored'],
  ["Recommended, form Action",                 "stale", Typed,      Typed,      'the password is kept after stale_write'],
  ["Recommended, form Action",                 "fail",  Typed,      Typed,      'the password is kept after a refused write'],
  ["Balanced, plain HTML form",                "save",  Typed,      Empty,      'the form empties itself once the box is stored'],
  ["Balanced, plain HTML form",                "stale", Typed,      Typed,      'the password is kept after stale_write'],
  ["Balanced, plain HTML form",                "fail",  Typed,      Typed,      'the password is kept after a refused write'],
  ["Balanced, with TanStack",                  "save",  Typed,      Empty,      'the form empties itself once the box is stored'],
  ["Balanced, with TanStack",                  "stale", Typed,      Typed,      'the password is kept after stale_write'],
  ["Balanced, with TanStack",                  "fail",  Typed,      Typed,      'the password is kept after a refused write'],
  ["Balanced, with a form library",            "save",  Typed,      Empty,      'the form empties itself once the box is stored'],
  ["Balanced, with a form library",            "stale", Typed,      Typed,      'the password is kept after stale_write'],
  ["Balanced, with a form library",            "fail",  Typed,      Typed,      'the password is kept after a refused write'],
  ["Hardened, unpleasant",                     "save",  Empty,      Empty,      'the password is emptied as the save starts'],
  ["Hardened, unpleasant",                     "stale", Empty,      Empty,      'the password is gone before stale_write arrives'],
  ["Hardened, unpleasant",                     "fail",  Empty,      Empty,      'the password is gone before the refused write arrives'],
  ["Hardened, kinder",                         "save",  Empty,      Empty,      'the password is out of its input during the save, and the form empties once the box is stored'],
  ["Hardened, kinder",                         "stale", Empty,      Typed,      'the password is put back after stale_write'],
  ["Hardened, kinder",                         "fail",  Empty,      Typed,      'the password is put back after a refused write'],
  // the rows to avoid:
  ["Avoid, React's default",                   "save",  Typed,      Empty,      'React empties the form once the box is stored'],
  ["Avoid, React's default",                   "stale", Typed,      Empty,      'React empties the password after stale_write'],
  ["Avoid, React's default",                   "fail",  Typed,      Empty,      'React empties the password after a refused write'],
  ["Avoid, a mutation handed the form",        "save",  Empty,      Empty,      'React empties the form as soon as the action hands the mutation the form'],
  ["Avoid, a mutation handed the form",        "stale", Empty,      Empty,      'what was typed is gone before stale_write arrives'],
  ["Avoid, a mutation handed the form",        "fail",  Empty,      Empty,      'what was typed is gone before the refused write arrives'],
  ["Avoid, a controlled input",                "save",  TypedTwice, EmptyTwice, 'React writes the password into the value attribute, and empties it once the box is stored'],
  ["Avoid, a controlled input",                "stale", TypedTwice, TypedTwice, 'the password stays in the value attribute after stale_write'],
  ["Avoid, a controlled input",                "fail",  TypedTwice, TypedTwice, 'the password stays in the value attribute after a refused write'],
  ["Avoid, a form library holding the secret", "save",  Typed,      Empty,      'reset() empties the form once the box is stored'],
  ["Avoid, a form library holding the secret", "stale", Typed,      Typed,      'the password is kept after stale_write'],
  ["Avoid, a form library holding the secret", "fail",  Typed,      Typed,      'the password is kept after a refused write'],
] as const

/** A fresh page with Hero signed in and unlocked, its saves held {@link HoldMs}, and the Forms row `title` filled in: the row's form. */
async function filledRow(title: string): Promise<HTMLElement> {
  await TH.loadPage('hero')
  await TH.unlock(TH.passphraseOf('hero'))
  const { vaultDB } = await import('../../../src/lib/dojo')
  vaultDB.holdMs = HoldMs
  const forms = TH.showTab('Forms', 'Forms: a secret in a form')
  const row = within(forms).getByRole('form', { name: title })
  TH.fill(row, { Username: 'hero_at_site', Password })
  return row
}

/** The row's mirror, written afresh, and its result, with the time it shows replaced by `TIME`. */
function readingOf(row: HTMLElement): Readonly<{ mirror: string, result: string }> {
  mirrorSecrets()
  const result = within(row).getByLabelText('Result').cloneNode(true) as HTMLElement
  for (const time of result.querySelectorAll('time')) { time.textContent = 'TIME' }
  return { mirror: within(row).getByLabelText('Mirror').textContent, result: result.textContent }
}

/** Press the row's button `outcomekind`, wait while the save is held for the mirror to show `during`, and answer what the row shows once the outcome lands. */
async function pressed(row: HTMLElement, outcomekind: string, during: string): Promise<Readonly<{ mirror: string, result: string }>> {
  fireEvent.click(within(row).getByRole('button', { name: outcomekind }))
  await waitFor(() => { expect(readingOf(row)).to.deep.equal({ mirror: during, result: 'saving…' }) })
  await waitFor(() => { expect(readingOf(row).result).to.include('@') })
  return readingOf(row)
}

describe("the Forms rows, today", () => {
  it("each summary table names the forms of its group, in order, with the forms to avoid under a heading of their own", async () => {
    await TH.loadPage('hero')
    const forms = TH.showTab('Forms', 'Forms: a secret in a form')
    const namesIn = (title: string) => within(forms).getByRole('table', { name: title }).querySelectorAll(':scope > tbody > tr > td:first-child')
    const listed = [...namesIn('Forms to choose from'), ...namesIn('Forms to avoid')].map((cell) => cell.textContent.replace(/^\d+\. /, ''))
    const rows = within(forms).getAllByRole('form')
    expect(rows.map((row) => row.getAttribute('aria-label'))).to.deep.equal(listed)
    const avoidHead = within(forms).getByRole('heading', { name: 'What goes wrong: forms to avoid' })
    const formsAndHeads = [...forms.querySelectorAll('form, h3')]
    expect(formsAndHeads.indexOf(avoidHead)).to.eq(namesIn('Forms to choose from').length)
  })

  for (const [title, outcomekind, during, after, blurb] of RowCases) {
    it(`${title}, ${outcomekind}: ${blurb}`, async () => {
      const row = await filledRow(title)
      expect(await pressed(row, outcomekind, during)).to.deep.equal({ mirror: after, result: Results[outcomekind] })
    })
  }

  it("the mutation handed the form keeps the form in its variables, without the password", async () => {
    const row = await filledRow('Avoid, a mutation handed the form')
    await pressed(row, 'save', Empty)
    const { hostQueryClient } = await import('../../../src/lib/dojo')
    const variables = hostQueryClient.getMutationCache().getAll().at(-1)?.state.variables
    expect(variables).to.be.instanceOf(FormData)
    expect([...(variables as FormData)]).to.deep.equal([['username', 'hero_at_site']])
  })

  it("the mutation handed the form shows its cache's subscribers the password as it goes pending", async () => {
    const row = await filledRow('Avoid, a mutation handed the form')
    await pressed(row, 'save', Empty)
    expect(within(row).getByLabelText('Variables').textContent).to.eq(`when pending: [["username","hero_at_site"],["password","${Password}"]]`)
  })

  it("the mutation that reads the form keeps nothing in its variables", async () => {
    const row = await filledRow('Balanced, with TanStack')
    await pressed(row, 'save', Typed)
    const { hostQueryClient } = await import('../../../src/lib/dojo')
    const mutation = hostQueryClient.getMutationCache().getAll().at(-1)
    expect(mutation?.options.mutationKey).to.be.undefined
    expect(mutation?.state.variables).to.be.undefined
    expect(within(row).getByLabelText('Variables').textContent).to.eq('when pending: (none)')
  })

  it("the hardened row keeps the username after a refused write, and nothing of the password", async () => {
    const row = await filledRow('Hardened, unpleasant')
    expect(await pressed(row, 'fail', Empty)).to.deep.equal({ mirror: Empty, result: Results.fail })
    expect(within(row).getByLabelText<HTMLInputElement>('Username').value).to.eq('hero_at_site')
    expect(within(row).getByLabelText('Variables').textContent).to.eq('')
  })

  it("a save after stale_write lands, the page having heard of the box written elsewhere", async () => {
    const row = await filledRow('Balanced, plain HTML form')
    await pressed(row, 'stale', Typed)
    expect(await pressed(row, 'save', Typed)).to.deep.equal({ mirror: Empty, result: Results.save })
  })

  it("a button pressed in another row while a fail is held leaves that save refused", async () => {
    const row = await filledRow('Balanced, plain HTML form')
    const other = within(TH.region('Forms: a secret in a form')).getByRole('form', { name: 'Balanced, with TanStack' })
    TH.fill(other, { Username: 'hero_at_site', Password })
    fireEvent.click(within(row).getByRole('button', { name: 'fail' }))
    await waitFor(() => { expect(readingOf(row).result).to.eq('saving…') })
    // A quarter of the hold, as a person presses the other row: by then the save has reached the vaultDB and is held.
    await new Promise((resolve) => { setTimeout(resolve, HoldMs / 4) })
    fireEvent.click(within(other).getByRole('button', { name: 'save' }))
    await waitFor(() => { expect(readingOf(row).result).to.include('@') })
    expect(readingOf(row).result).to.eq(Results.fail)
    await waitFor(() => { expect(readingOf(other).result).to.eq(Results.save) })
  })

  it("a controlled password shown as text is written into its value attribute too", async () => {
    const row = await filledRow('Avoid, a controlled input')
    fireEvent.click(within(TH.region('Forms: a secret in a form')).getByRole('checkbox'))
    await waitFor(() => { expect(within(row).getByLabelText('Password').getAttribute('type')).to.eq('text') })
    expect(readingOf(row).mirror).to.eq(TypedTwice)
  })
})
