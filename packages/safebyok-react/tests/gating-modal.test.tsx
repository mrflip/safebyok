import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Bank } from 'safebyok'
import { GatingModal } from '../src/gating-modal'
import type { DialogAnswer } from '../src/modal'
import { Messages } from '../src/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** The gating `raise` opens, shown in a GatingModal whose answers the test reads. */
const shownFor = async (raise: (bank: Bank) => ReturnType<typeof TH.building>, built: boolean) => {
  const world = TH.makeBankWorld()
  if (built) { await TH.makeBankWithVault(world) }
  const held = await TH.heldGatingOf(world, raise)
  const answers: DialogAnswer[] = []
  render(<GatingModal gating={held.gating} onDone={(answer) => { answers.push(answer); held.close() }} />)
  return { ...held, answers }
}

describe("GatingModal", () => {
  const DialogCases = [
    [TH.building,  false, Messages.chooseTitle,   'shows the passphrase dialog, choosing, for a build_vault gating'],
    [TH.unlocking, true,  Messages.unlockTitle,   'shows the passphrase dialog, unlocking, for an unlock_vault gating'],
    [TH.replacing, true,  Messages.changeTitle,   'shows the dialog that replaces the passphrase for a replace_passphrase gating'],
    [TH.deleting,  true,  Messages.delVaultTitle, 'shows the dialog that deletes the vault for a del_vault gating'],
  ] as const

  for (const [raise, built, title, blurb] of DialogCases) {
    it(blurb, async () => {
      await shownFor(raise, built)
      expect(screen.getByText(title)).to.exist
    })
  }

  it("answers declined at once for a gatingkind with no dialog, and the gating is declined", async () => {
    const { raising, answers } = await shownFor(TH.addingPasskey, true)
    await waitFor(() => { expect(answers).to.deep.equal(['declined']) })
    expect(screen.queryByRole('dialog')).to.be.null
    expect(await raising).to.include({ ok: false })
  })

  it("answers once for a gatingkind with no dialog, though its onDone is new at each render", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const held = await TH.heldGatingOf(world, TH.addingPasskey)
    const answers: DialogAnswer[] = []
    const ui = () => <GatingModal gating={held.gating} onDone={(answer) => { answers.push(answer) }} />
    const { rerender } = render(ui())
    rerender(ui())
    rerender(ui())
    held.close()
    await held.raising
    expect(answers).to.deep.equal(['declined'])
  })
})
