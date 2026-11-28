import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isVaultError, mask } from 'safebyok'
import { WhisperMask, type WhisperMaskProps } from '../../src/parts'
import * as TH from '../test-helpers'

/** The joke service's key masked with its last four characters. */
const LiveMask = mask(TH.JokesKey, { tail: 4 })

// The world's key ends in `0000`, which stamps and tokens hold too: this one's tail is found nowhere else.
/** A key with a tail of its own, an obvious fake. */
const TailedKey = 'sk-test-Qz9w'

/** The stored mask the tests read from the box's sidecar: its service. */
function serviceOf(box: Parameters<NonNullable<WhisperMaskProps['ifLocked']>>[0]): string {
  return box.sidecar['service'] as string
}

/** The bank's stage as a line of text, and the joke service's key as a `WhisperMask`. */
function KeyScreen({ world, ...props }: Readonly<{ world: TH.ProviderWorld } & Partial<WhisperMaskProps>>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  return (
    <>
      <p>{stage}</p>
      <WhisperMask labelpath={TH.JokesPath} field="apiKey" tail={4} ifLocked={serviceOf} {...props} />
    </>
  )
}

/** A world with the joke service's key stored, rendered under its provider, once it shows the bank locked. */
async function renderKey(props: Partial<WhisperMaskProps> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const { container } = render(TH.providerTreeOf(world, <KeyScreen world={world} {...props} />, { userid: TH.ProviderUser }))
  await screen.findByText('locked')
  return { world, container }
}

/** Unlock the world's bank with the stored passphrase. */
async function unlock(world: TH.ProviderWorld): Promise<void> {
  const device = world._cheat_device()
  await act(async () => { await device.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase }) })
}

/** The text the mask's element shows. */
function maskTextOf(container: Element): string {
  return container.querySelector('.whisper-mask')?.textContent ?? ''
}

describe("WhisperMask", () => {
  it("shows the stored mask while locked and the live tail while unlocked", async () => {
    const { world, container } = await renderKey()
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
    await unlock(world)
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes' } }, { whisper: { apiKey: TailedKey } }))
    await waitFor(() => { expect(maskTextOf(container)).to.eq(mask(TailedKey, { tail: 4 })) })
    act(() => { world.Bank.lock() })
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
  })

  it("holds neither the key nor its tail in the page or the host's cache", async () => {
    const { world, container } = await renderKey()
    await unlock(world)
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes' } }, { whisper: { apiKey: TailedKey } }))
    const liveMask = mask(TailedKey, { tail: 4 })
    await waitFor(() => { expect(maskTextOf(container)).to.eq(liveMask) })
    TH.expectTextUnheld(TailedKey, container, world.clients())
    TH.expectTextUnheld(liveMask, container, world.clients())
    act(() => { world.Bank.lock() })
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
    expect(document.body.textContent.includes(TailedKey.slice(-4))).to.eq(false)
    TH.expectTextUnheld(TailedKey.slice(-4), container, world.clients())
  })

  it("writes the mask again when the box is written", async () => {
    const { world, container } = await renderKey()
    await unlock(world)
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
    const nextKey = 'sk-test-4321'
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes' } }, { whisper: { apiKey: nextKey } }))
    await waitFor(() => { expect(maskTextOf(container)).to.eq(mask(nextKey, { tail: 4 })) })
  })

  it("shows the sidecar's mask field while locked when no ifLocked is given", async () => {
    // WhisperMask @example
    const { world, container } = await renderKey({ ifLocked: undefined })
    await unlock(world)
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { mask: 'sk-te*******' } }, { whisper: { apiKey: TH.JokesKey } }))
    act(() => { world.Bank.lock() })
    await waitFor(() => { expect(maskTextOf(container)).to.eq('sk-te*******') })
  })

  it("stays empty for a box that is not stored", async () => {
    const { world, container } = await renderKey({ labelpath: 'other' })
    await unlock(world)
    await screen.findByText('unlocked')
    expect(maskTextOf(container)).to.eq('')
  })

  it("stays empty and reports the refusal when the mask cannot be shown, an Error as it was thrown", async () => {
    const thrown = new TypeError('no mask')
    const onError = vi.fn<(err: Error) => void>()
    const { container } = await renderKey({ ifLocked: () => { throw thrown }, onError })
    await waitFor(() => { expect(onError).toHaveBeenCalledOnce() })
    expect(onError.mock.calls[0]?.[0]).to.eq(thrown)
    expect(maskTextOf(container)).to.eq('')
    expect(isVaultError(onError.mock.calls[0]?.[0])).to.eq(false)
  })

  it("reports a thrown value that is no Error as an Error, the value its cause", async () => {
    const thrown: unknown = { code: 42 }
    const onError = vi.fn<(err: Error) => void>()
    await renderKey({ ifLocked: () => { throw thrown as Error }, onError })
    await waitFor(() => { expect(onError).toHaveBeenCalledOnce() })
    const err = onError.mock.calls[0]?.[0]
    expect(err).to.be.instanceOf(Error)
    expect(err?.cause).to.eq(thrown)
  })
})
