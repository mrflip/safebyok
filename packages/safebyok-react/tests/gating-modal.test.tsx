import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnyGating, Bank } from 'safebyok'
import { GatingModal } from '../src/provider/gating-modal'
import { Messages } from '../src/helpers/messages'
import type { DialogAnswer } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** What the vault is before the gating is raised: absent, built, or built and holding a passkey. */
type Before = 'absent' | 'built' | 'passkeyed'

/** The gating `raise` opens, shown in a GatingModal (as `shown` makes it out to be) whose answers the test reads. */
const shownFor = async (raise: (bank: Bank) => ReturnType<typeof TH.building>, before: Before, shown = (gating: AnyGating) => gating) => {
  const world = TH.makeBankWorld()
  if (before !== 'absent') {
    const { vault } = await TH.makeBankWithVault(world)
    if (before === 'passkeyed') { await TH.addPasskeyTo(world, vault) }
  }
  const held = await TH.heldGatingOf(world, raise)
  const answers: DialogAnswer[] = []
  render(<GatingModal gating={shown(held.gating)} onDone={(answer) => { answers.push(answer); held.close() }} />)
  return { ...held, answers }
}

/** `gating`, made out to be of a gatingkind this package has no dialog for, as one a newer core raises. */
const forged = (gating: AnyGating): AnyGating => Object.create(gating, { gatingkind: { value: 'forged_kind' } }) as AnyGating

describe("GatingModal", () => {
  const DialogCases = [
    [TH.building,        'absent',    Messages.chooseTitle,        'shows the passphrase dialog, choosing, for a build_vault gating'],
    [TH.unlocking,       'built',     Messages.unlockTitle,        'shows the passphrase dialog, unlocking, for an unlock_vault gating'],
    [TH.replacing,       'built',     Messages.changeTitle,        'shows the dialog that replaces the passphrase for a replace_passphrase gating'],
    [TH.addingPasskey,   'built',     Messages.addPasskeyTitle,    'shows the dialog that adds a passkey for an add_passkey gating'],
    [TH.revokingPasskey, 'passkeyed', Messages.revokePasskeyTitle, 'shows the dialog that removes the passkey for a revoke_passkey gating'],
    [TH.deleting,        'built',     Messages.delVaultTitle,      'shows the dialog that deletes the vault for a del_vault gating'],
  ] as const

  for (const [raise, before, title, blurb] of DialogCases) {
    it(blurb, async () => {
      await shownFor(raise, before)
      expect(screen.getByText(title)).to.exist
    })
  }

  it("answers dismissed at once for a gatingkind with no dialog, and the gating is dismissed", async () => {
    const { raising, answers } = await shownFor(TH.unlocking, 'built', forged)
    await waitFor(() => { expect(answers).to.deep.equal(['dismissed']) })
    expect(screen.queryByRole('dialog')).to.be.null
    expect(await raising).to.include({ ok: false })
  })

  it("answers once for a gatingkind with no dialog, though its onDone is new at each render", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const held = await TH.heldGatingOf(world, TH.unlocking)
    const answers: DialogAnswer[] = []
    const ui = () => <GatingModal gating={forged(held.gating)} onDone={(answer) => { answers.push(answer) }} />
    const { rerender } = render(ui())
    rerender(ui())
    rerender(ui())
    held.close()
    await held.raising
    expect(answers).to.deep.equal(['dismissed'])
  })
})
