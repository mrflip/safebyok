import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnyGating, Bank } from 'safebyok'
import { GatingModal } from '../src/provider/gating-modal'
import { Messages } from '../src/helpers/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** The vault's state before the gating is raised: absent, built, or built with a passkey. */
type Before = 'absent' | 'built' | 'passkeyed'

/** Open a gating with `raise`, and render it in a GatingModal. `shown` may replace the gating that is rendered. */
const shownFor = async (raise: (bank: Bank) => ReturnType<typeof TH.building>, before: Before, shown = (gating: AnyGating) => gating) => {
  const world = TH.makeBankWorld()
  if (before !== 'absent') {
    const { vault } = await TH.makeBankWithVault(world)
    if (before === 'passkeyed') { await TH.addPasskeyTo(world, vault) }
  }
  const opened = await TH.openGatingOf(world, raise)
  render(<GatingModal gating={shown(opened.gating)} />)
  return opened
}

/** Return a copy of `gating` with a gatingkind this package has no dialog for, like one a newer core might raise. */
const forged = (gating: AnyGating): AnyGating => Object.create(gating, { gatingkind: { value: 'forged_kind' }, dismiss: { value: () => { gating.dismiss() } } }) as AnyGating

describe("GatingModal", () => {
  const DialogCases = [
    [TH.building,        'absent',    Messages.chooseTitle,        'shows the passphrase dialog, choosing, for a build_vault gating'],
    [TH.unlocking,       'built',     Messages.unlockTitle,        'shows the passphrase dialog, unlocking, for an unlock_vault gating'],
    [TH.replacing,       'built',     Messages.changeTitle,        'shows the dialog that replaces the passphrase for a replace_passphrase gating'],
    [TH.addingPasskey,   'built',     Messages.addPasskeyTitle,    'shows the dialog that adds a passkey for an add_passkey gating'],
    [TH.revokingPasskey, 'passkeyed', Messages.revokePasskeyTitle, 'shows the dialog that removes the passkey for a revoke_passkey gating'],
  ] as const

  for (const [raise, before, title, blurb] of DialogCases) {
    it(blurb, async () => {
      await shownFor(raise, before)
      expect(screen.getByText(title)).to.exist
    })
  }

  it("dismisses at once a gating whose gatingkind has no dialog", async () => {
    const { raising } = await shownFor(TH.unlocking, 'built', forged)
    expect(await raising).to.include({ ok: false })
    expect(screen.queryByRole('dialog')).to.be.null
  })
})
